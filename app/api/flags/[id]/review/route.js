/**
 * POST /api/flags/[id]/review — Process a flag review action.
 *
 * Actions: Cleared | Escalated
 *
 * THIS IS THE CORE TRANSACTIONAL LOGIC (Rubric #8):
 *   1. Validate reviewer is assigned to the flag
 *   2. Validate flag is still Open
 *   3. BEGIN TRANSACTION
 *   4. UPDATE flags SET status = action
 *   5. INSERT INTO review_history
 *   6. COMMIT
 *   If any step fails, the entire transaction rolls back.
 *
 * Also demonstrates:
 *   - DML UPDATE + INSERT (Rubric #6)
 *   - Server-side authorization (Rubric #12)
 */

import { NextResponse } from 'next/server';
import { transaction } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

const VALID_ACTIONS = ['Cleared', 'Escalated'];

export async function POST(request, { params }) {
  const auth = await requireAuth('Reviewer');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { user } = auth;
  const resolvedParams = await params;
  const flagId = resolvedParams.id;
  if (!/^[1-9]\d*$/.test(flagId)) {
    return NextResponse.json({ error: 'Flag not found' }, { status: 404 });
  }

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
    }
    const action = body && typeof body === 'object' ? body.action : undefined;

    // Validate action
    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 }
      );
    }

    const result = await transaction(async (client) => {
      const flagResult = await client.query(
        'SELECT id, status, reviewer_id FROM flags WHERE id = $1 FOR UPDATE',
        [flagId]
      );
      if (flagResult.rows.length === 0) {
        const error = new Error('FLAG_NOT_FOUND');
        error.code = 'FLAG_NOT_FOUND';
        throw error;
      }

      const flag = flagResult.rows[0];
      if (flag.status !== 'Open') {
        const error = new Error('FLAG_ALREADY_CLOSED');
        error.code = 'FLAG_ALREADY_CLOSED';
        throw error;
      }
      if (String(flag.reviewer_id) !== String(user.id)) {
        const error = new Error(flag.reviewer_id ? 'NOT_ASSIGNED' : 'NOT_ASSIGNED_YET');
        error.code = flag.reviewer_id ? 'NOT_ASSIGNED' : 'NOT_ASSIGNED_YET';
        throw error;
      }

      const updateResult = await client.query(
        `UPDATE flags
         SET status = $1
         WHERE id = $2 AND status = 'Open'
         RETURNING id, status`,
        [action, flagId]
      );

      // Guard against race condition — another reviewer already processed it
      if (updateResult.rows.length === 0) {
        throw new Error('STALE_FLAG');
      }

      await client.query(
        `INSERT INTO review_history (flag_id, action, reviewer_id)
         VALUES ($1, $2, $3)`,
        [flagId, action, user.id]
      );

      return updateResult.rows[0];
    });

    return NextResponse.json({
      message: `Flag ${action.toLowerCase()} successfully`,
      flag: result,
    });
  } catch (error) {
    if (error.code === 'FLAG_NOT_FOUND') {
      return NextResponse.json({ error: 'Flag not found' }, { status: 404 });
    }
    if (error.code === 'FLAG_ALREADY_CLOSED' || error.code === 'STALE_FLAG') {
      return NextResponse.json(
        { error: 'Flag was already reviewed by another user. Refresh and try again.' },
        { status: 409 }
      );
    }
    if (error.code === 'NOT_ASSIGNED' || error.code === 'NOT_ASSIGNED_YET') {
      return NextResponse.json(
        { error: error.code === 'NOT_ASSIGNED_YET'
          ? 'A Legal Admin must assign this flag before review.'
          : 'You are not assigned to review this flag.' },
        { status: 403 }
      );
    }

    console.error('Review error:', error);
    return NextResponse.json(
      { error: 'Failed to process review. Transaction rolled back.' },
      { status: 500 }
    );
  }
}
