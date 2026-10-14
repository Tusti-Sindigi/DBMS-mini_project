/**
 * Contract API routes.
 *
 * GET  /api/contracts — List contracts (scoped by role)
 * POST /api/contracts — Upload and process a new contract
 *
 * Demonstrates:
 *   - DML: INSERT into contracts, clauses (Rubric #6)
 *   - TRANSACTION: atomic contract + clause persistence (Rubric #8)
 *   - NoSQL/Vector: storing embeddings from Track A service (Rubric #9)
 *   - Backend/API integration with embedding service (Rubric #11)
 *   - JOIN query for contract listing (Rubric #7)
 */

import { NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

const EMBEDDING_SERVICE_URL =
  process.env.EMBEDDING_SERVICE_URL || 'http://127.0.0.1:8001';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * GET /api/contracts
 *
 * Client: sees only their own contracts.
 * LegalAdmin: sees all contracts.
 * (Rubric #7: JOIN query, Rubric #12: data scoping)
 */
export async function GET() {
  const auth = await requireAuth('Client', 'LegalAdmin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { user } = auth;

  // Complex JOIN query with aggregate subquery (Rubric #7)
  const sql = `
    SELECT
      c.id,
      c.file_name,
      c.upload_date,
      c.status,
      u_uploader.name AS uploaded_by_name,
      u_client.name   AS client_name,
      (SELECT COUNT(*)::INT FROM clauses cl WHERE cl.contract_id = c.id) AS clause_count,
      (SELECT COUNT(*)::INT FROM flags f
        JOIN clauses cl2 ON cl2.id = f.clause_id
        WHERE cl2.contract_id = c.id AND f.status = 'Open') AS open_flag_count
    FROM contracts c
    JOIN users u_uploader ON u_uploader.id = c.uploaded_by
    JOIN users u_client   ON u_client.id   = c.client_id
    ${user.role === 'Client' ? 'WHERE c.client_id = $1' : ''}
    ORDER BY c.upload_date DESC
  `;

  const params = user.role === 'Client' ? [user.id] : [];
  const result = await query(sql, params);

  return NextResponse.json({ contracts: result.rows });
}

/**
 * POST /api/contracts
 *
 * Upload a contract (text or PDF). Calls Track A embedding service,
 * then persists contract + clauses atomically in a transaction.
 * The database trigger creates flags automatically — the app does NOT
 * create flags itself.
 *
 * (Rubric #6: DML INSERT, Rubric #8: TRANSACTION, Rubric #9: vector storage,
 *  Rubric #11: API integration with embedding service)
 */
export async function POST(request) {
  const auth = await requireAuth('Client');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { user } = auth;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const contractText = formData.get('text');
    const fileName = formData.get('fileName') || 'Untitled';

    let text = '';

    // Extract text from uploaded file or from direct text input
    if (file && file.size > 0) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.` },
          { status: 400 }
        );
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      if (file.type === 'application/pdf' || file.name?.endsWith('.pdf')) {
        // PDF text extraction (Rubric #10, #11)
        try {
          const pdfParse = (await import('pdf-parse')).default;
          const pdfData = await pdfParse(buffer);
          text = pdfData.text;
        } catch (pdfError) {
          console.error('PDF parsing error:', pdfError);
          return NextResponse.json(
            { error: 'Could not extract text from the PDF. The file may be image-based or corrupted.' },
            { status: 422 }
          );
        }
      } else {
        text = buffer.toString('utf-8');
      }
    } else if (contractText && typeof contractText === 'string') {
      text = contractText;
    }

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'No contract text provided. Upload a file or paste text.' },
        { status: 400 }
      );
    }

    // Call Track A's clause segmentation + embedding service
    // (Rubric #11: Backend/API integration)
    let clauses;
    try {
      const embeddingRes = await fetch(`${EMBEDDING_SERVICE_URL}/process-contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!embeddingRes.ok) {
        const errBody = await embeddingRes.json().catch(() => ({}));
        throw new Error(errBody.detail || `Embedding service returned ${embeddingRes.status}`);
      }

      const embeddingData = await embeddingRes.json();
      clauses = embeddingData.clauses;
    } catch (serviceError) {
      console.error('Embedding service error:', serviceError);
      return NextResponse.json(
        {
          error: 'Failed to process contract text. Make sure the embedding service is running.',
          detail: serviceError.message,
        },
        { status: 502 }
      );
    }

    if (!clauses || clauses.length === 0) {
      return NextResponse.json(
        { error: 'No clauses were extracted from the contract text.' },
        { status: 422 }
      );
    }

    // Persist contract + clauses atomically in a TRANSACTION (Rubric #8)
    // The clause INSERT triggers Track A's trg_flag_clause_when_risky,
    // which auto-creates flags — we do NOT create flags in the app.
    const contract = await transaction(async (client) => {
      // INSERT contract (Rubric #6: DML)
      const contractResult = await client.query(
        `INSERT INTO contracts (uploaded_by, client_id, file_name, status)
         VALUES ($1, $1, $2, 'Processing')
         RETURNING id`,
        [user.id, fileName]
      );
      const contractId = contractResult.rows[0].id;

      // INSERT each clause with its embedding vector (Rubric #9: Vector storage)
      for (const clause of clauses) {
        const embeddingStr = '[' + clause.embedding.join(',') + ']';
        await client.query(
          `INSERT INTO clauses (contract_id, clause_text, clause_number, embedding)
           VALUES ($1, $2, $3, $4::vector)`,
          [contractId, clause.clause_text, clause.clause_number, embeddingStr]
        );
      }

      // UPDATE contract status to Analyzed (Rubric #6: DML UPDATE)
      await client.query(
        "UPDATE contracts SET status = 'Analyzed' WHERE id = $1",
        [contractId]
      );

      return { id: contractId };
    });

    return NextResponse.json(
      {
        message: 'Contract uploaded and analyzed successfully',
        contractId: contract.id,
        clauseCount: clauses.length,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Contract upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload contract. Transaction rolled back.' },
      { status: 500 }
    );
  }
}
