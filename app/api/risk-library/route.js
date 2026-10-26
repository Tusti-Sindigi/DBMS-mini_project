/**
 * API Route: /api/risk-library
 *
 * GET   — List all risk library patterns and current similarity threshold.
 * POST  — Add a new risk pattern (embeds via Track A service and persists with vector).
 * PATCH — Update similarity threshold or pattern severity.
 *
 * Demonstrates:
 *   - NoSQL/Vector storage & Python service integration (Rubric #9, #11)
 *   - DML INSERT & UPDATE (Rubric #6)
 *   - Server-side role authorization for LegalAdmin (Rubric #12)
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

const EMBEDDING_SERVICE_URL =
  process.env.EMBEDDING_SERVICE_URL || 'http://127.0.0.1:8001';

export async function GET() {
  const auth = await requireAuth('LegalAdmin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const patternsRes = await query(
      `SELECT
         rl.id,
         rl.clause_pattern_text,
         rl.risk_category,
         rl.severity_weight,
         rl.created_at,
         COUNT(f.id)::INT AS match_count
       FROM risk_library rl
       LEFT JOIN flags f ON f.risk_library_id = rl.id
       GROUP BY rl.id
       ORDER BY rl.risk_category ASC, rl.severity_weight DESC`
    );

    const configRes = await query(
      'SELECT similarity_threshold FROM risk_config WHERE id = 1'
    );

    return NextResponse.json({
      patterns: patternsRes.rows,
      similarityThreshold: configRes.rows[0]?.similarity_threshold || 0.75,
    });
  } catch (error) {
    console.error('Error fetching risk library:', error);
    return NextResponse.json(
      { error: 'Failed to fetch risk library' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const auth = await requireAuth('LegalAdmin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
    }
    const { clause_pattern_text, risk_category, severity_weight } = body;

    if (typeof clause_pattern_text !== 'string' || !clause_pattern_text.trim()) {
      return NextResponse.json(
        { error: 'Pattern text is required' },
        { status: 400 }
      );
    }
    if (clause_pattern_text.trim().length > 5000) {
      return NextResponse.json({ error: 'Pattern text must be 5,000 characters or fewer.' }, { status: 400 });
    }

    if (typeof risk_category !== 'string' || !risk_category.trim()) {
      return NextResponse.json(
        { error: 'Risk category is required' },
        { status: 400 }
      );
    }
    if (risk_category.trim().length > 100) {
      return NextResponse.json({ error: 'Risk category must be 100 characters or fewer.' }, { status: 400 });
    }

    const severity = Number(severity_weight);
    if (!Number.isInteger(severity) || severity < 1 || severity > 5) {
      return NextResponse.json(
        { error: 'Severity weight must be an integer between 1 and 5' },
        { status: 400 }
      );
    }

    // Call Track A embedding service to embed this pattern text
    let embedding;
    try {
      const embedRes = await fetch(`${EMBEDDING_SERVICE_URL}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: [clause_pattern_text.trim()] }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!embedRes.ok) {
        throw new Error(`Embedding service returned ${embedRes.status}`);
      }

      const embedData = await embedRes.json();
      embedding = embedData.embeddings?.[0];
      if (embedData.dimension !== 384 || !Array.isArray(embedding)
        || embedding.length !== 384
        || embedding.some((value) => !Number.isFinite(value))) {
        throw new Error('Embedding service returned an invalid vector.');
      }
    } catch (embedError) {
      console.error('Embedding service failed:', embedError);
      return NextResponse.json(
        { error: 'Embedding service unavailable. Could not generate vector for pattern.' },
        { status: 502 }
      );
    }

    const embeddingStr = '[' + embedding.join(',') + ']';

    // Insert into risk_library (Rubric #6: DML INSERT, Rubric #9: Vector Storage)
    const insertRes = await query(
      `INSERT INTO risk_library (clause_pattern_text, risk_category, severity_weight, embedding)
       VALUES ($1, $2, $3, $4::vector)
       RETURNING id, clause_pattern_text, risk_category, severity_weight, created_at`,
      [clause_pattern_text.trim(), risk_category.trim(), severity, embeddingStr]
    );

    return NextResponse.json(
      {
        message: 'Risk pattern added successfully',
        pattern: insertRes.rows[0],
      },
      { status: 201 }
    );
  } catch (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A risk pattern with this exact text already exists.' },
        { status: 409 }
      );
    }
    console.error('Error adding risk pattern:', error);
    return NextResponse.json(
      { error: 'Failed to create risk pattern' },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  const auth = await requireAuth('LegalAdmin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
    }

    // 1. Update similarity threshold
    if (body.similarityThreshold !== undefined) {
      const threshold = Number(body.similarityThreshold);
      if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
        return NextResponse.json(
          { error: 'Similarity threshold must be greater than 0 and at most 1.0.' },
          { status: 400 }
        );
      }

      await query(
        'UPDATE risk_config SET similarity_threshold = $1 WHERE id = 1',
        [threshold]
      );

      return NextResponse.json({
        message: `Similarity threshold updated to ${threshold}`,
        similarityThreshold: threshold,
      });
    }

    // 2. Update pattern severity
    if (body.patternId && body.severityWeight !== undefined) {
      const severity = Number(body.severityWeight);
      if (!Number.isInteger(severity) || severity < 1 || severity > 5) {
        return NextResponse.json(
          { error: 'Severity must be between 1 and 5' },
          { status: 400 }
        );
      }

      if (!/^[1-9]\d*$/.test(String(body.patternId))) {
        return NextResponse.json({ error: 'patternId must be a positive integer.' }, { status: 400 });
      }

      const updateRes = await query(
        'UPDATE risk_library SET severity_weight = $1 WHERE id = $2 RETURNING id, severity_weight',
        [severity, body.patternId]
      );

      if (updateRes.rows.length === 0) {
        return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
      }

      return NextResponse.json({
        message: 'Pattern severity updated',
        pattern: updateRes.rows[0],
      });
    }

    return NextResponse.json(
      { error: 'No valid update parameters provided' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error updating risk library config:', error);
    return NextResponse.json(
      { error: 'Failed to update configuration' },
      { status: 500 }
    );
  }
}
