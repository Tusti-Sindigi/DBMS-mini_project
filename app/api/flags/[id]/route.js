/**
 * PATCH /api/flags/[id] — Assign a reviewer to a flag (LegalAdmin only).
 *
 * Accepts: { reviewerId }
 *
 * Demonstrates:
 *   - DML UPDATE (Rubric #6)
 *   - Role-based authorization (Rubric #12)
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function PATCH(request, { params }) {
  const auth = await requireAuth('LegalAdmin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const resolvedParams = await params;
  const flagId = resolvedParams.id;

  try {
    const body = await request.json();
    const { reviewerId } = body;

    if (!reviewerId) {
      return NextResponse.json({ error: 'reviewerId is required' }, { status: 400 });
    }

    // Validate reviewer exists and has Reviewer role
    const reviewerResult = await query(
      "SELECT id, name FROM users WHERE id = $1 AND role = 'Reviewer'",
      [reviewerId]
    );

    if (reviewerResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Reviewer not found or user is not a Reviewer' },
        { status: 404 }
      );
    }

    // UPDATE flag with reviewer assignment (Rubric #6: DML UPDATE)
    const result = await query(
      'UPDATE flags SET reviewer_id = $1 WHERE id = $2 RETURNING id, reviewer_id',
      [reviewerId, flagId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Flag not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: `Flag assigned to ${reviewerResult.rows[0].name}`,
      flag: result.rows[0],
    });
  } catch (error) {
    console.error('Assignment error:', error);
    return NextResponse.json({ error: 'Failed to assign reviewer' }, { status: 500 });
  }
}
