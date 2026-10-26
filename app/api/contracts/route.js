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
    let formData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Upload must use multipart form data.' }, { status: 400 });
    }

    const fileEntry = formData.get('file');
    const file = fileEntry && typeof fileEntry === 'object'
      && typeof fileEntry.arrayBuffer === 'function'
      ? fileEntry
      : null;
    if (fileEntry !== null && !file) {
      return NextResponse.json({ error: 'The uploaded file is invalid.' }, { status: 400 });
    }

    const textEntry = formData.get('text');
    const contractText = typeof textEntry === 'string' ? textEntry : '';
    const submittedName = formData.get('fileName');
    const requestedFileName = typeof submittedName === 'string' ? submittedName : '';

    let text = '';

    // Extract text from uploaded file or from direct text input
    if (file && file.size > 0) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.` },
          { status: 400 }
        );
      }

      const lowerFileName = String(file.name || '').toLowerCase();
      const isPdf = lowerFileName.endsWith('.pdf') || file.type === 'application/pdf';
      const isPlainText = lowerFileName.endsWith('.txt') || file.type === 'text/plain';
      if (!isPdf && !isPlainText) {
        return NextResponse.json(
          { error: 'Only PDF and plain-text .txt files are supported.' },
          { status: 415 }
        );
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      if (isPdf) {
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
    } else if (file) {
      return NextResponse.json({ error: 'The selected file is empty.' }, { status: 400 });
    } else if (contractText.trim()) {
      text = contractText;
    }

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'No contract text provided. Upload a file or paste text.' },
        { status: 400 }
      );
    }
    if (text.length > 2_000_000) {
      return NextResponse.json({ error: 'Extracted contract text exceeds the 2 million character processing limit.' }, { status: 413 });
    }

    const rawFileName = requestedFileName || file?.name || 'Untitled';
    const fileName = rawFileName.trim().replace(/[\r\n\0]/g, ' ').slice(0, 255) || 'Untitled';

    // Call Track A's clause segmentation + embedding service
    // (Rubric #11: Backend/API integration)
    let clauses;
    let embeddingData;
    try {
      const embeddingRes = await fetch(`${EMBEDDING_SERVICE_URL}/process-contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!embeddingRes.ok) {
        throw new Error(`Embedding service returned ${embeddingRes.status}`);
      }

      embeddingData = await embeddingRes.json();
      clauses = embeddingData.clauses;
    } catch (serviceError) {
      console.error('Embedding service error:', serviceError);
      return NextResponse.json(
        {
          error: 'Failed to process contract text. Make sure the embedding service is running.',
        },
        { status: 502 }
      );
    }

    if (!Array.isArray(clauses) || clauses.length === 0) {
      return NextResponse.json(
        { error: 'No clauses were extracted from the contract text.' },
        { status: 422 }
      );
    }
    if (!embeddingData || embeddingData.dimension !== 384 || clauses.length > 1000 || clauses.some((clause) => (
      typeof clause.clause_number !== 'string'
      || !clause.clause_number.trim()
      || typeof clause.clause_text !== 'string'
      || !clause.clause_text.trim()
      || !Array.isArray(clause.embedding)
      || clause.embedding.length !== 384
      || clause.embedding.some((value) => !Number.isFinite(value))
    ))) {
      return NextResponse.json(
        { error: 'The embedding service returned invalid clause data. No contract was saved.' },
        { status: 502 }
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
