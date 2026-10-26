import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function PATCH(request, { params }) {
  const auth = await requireAuth('LegalAdmin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: flagId } = await params;
  if (!/^[1-9]\d*$/.test(flagId)) {
    return NextResponse.json({ error: 'Flag not found' }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (!body || !Object.prototype.hasOwnProperty.call(body, 'reviewerId')) {
    return NextResponse.json({ error: 'reviewerId is required; use null to unassign.' }, { status: 400 });
  }

  const reviewerId = body.reviewerId === '' ? null : body.reviewerId;
  if (reviewerId !== null && !/^[1-9]\d*$/.test(String(reviewerId))) {
    return NextResponse.json({ error: 'reviewerId must be a positive integer or null.' }, { status: 400 });
  }

  try {
    if (reviewerId !== null) {
      const reviewerResult = await query(
        "SELECT id, name FROM users WHERE id = $1 AND role = 'Reviewer'",
        [reviewerId]
      );
      if (reviewerResult.rows.length === 0) {
        return NextResponse.json({ error: 'Reviewer not found.' }, { status: 404 });
      }
    }

    const result = await query(
      `UPDATE flags
       SET reviewer_id = $1
       WHERE id = $2 AND status = 'Open'
       RETURNING id, reviewer_id`,
      [reviewerId, flagId]
    );

    if (result.rows.length === 0) {
      const flagResult = await query('SELECT status FROM flags WHERE id = $1', [flagId]);
      if (flagResult.rows.length === 0) {
        return NextResponse.json({ error: 'Flag not found.' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Only open flags can be assigned.' }, { status: 409 });
    }

    return NextResponse.json({
      message: reviewerId === null ? 'Reviewer assignment removed.' : 'Reviewer assigned successfully.',
      flag: result.rows[0],
    });
  } catch (error) {
    console.error('Assignment error:', error);
    return NextResponse.json({ error: 'Could not update the flag assignment.' }, { status: 500 });
  }
}
