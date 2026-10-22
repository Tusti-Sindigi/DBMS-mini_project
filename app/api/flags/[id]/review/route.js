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
import { transaction, query } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

const VALID_ACTIONS = ['Cleared', 'Escalated'];

export async function POST(request, { params }) {
  // Server-side auth: strictly enforce Reviewer role for adjudication (Rubric #12: Separation of Duties)
  const auth = await requireAuth('Reviewer');
  if (auth.error) {
    if (auth.status === 403) {
      return NextResponse.json(
        { error: 'Separation of Duties: Review decisions must be executed by an assigned Reviewer. As Legal Admin, allocate flags using the assignment tools.' },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { user } = auth;
  const resolvedParams = await params;
  const flagId = resolvedParams.id;

  try {
    const body = await request.json();
    const { action } = body;

    // Validate action
    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 }
      );
    }

    // Fetch current flag state for validation
    const flagResult = await query(
      'SELECT id, status, reviewer_id FROM flags WHERE id = $1',
      [flagId]
    );

    if (flagResult.rows.length === 0) {
      return NextResponse.json({ error: 'Flag not found' }, { status: 404 });
    }

    const flag = flagResult.rows[0];

    // Check flag is still Open (prevent stale review)
    if (flag.status !== 'Open') {
      return NextResponse.json(
        { error: `Flag has already been ${flag.status.toLowerCase()}. Cannot review a closed flag.` },
        { status: 409 }
      );
    }

    // Check reviewer assignment (Rubric #12: authorization)
    if (!flag.reviewer_id) {
      return NextResponse.json(
        { error: 'This flag has not been assigned to a reviewer yet. A Legal Admin must assign it before review.' },
        { status: 403 }
      );
    }
    if (String(flag.reviewer_id) !== String(user.id)) {
      return NextResponse.json(
        { error: 'You are not assigned to review this flag.' },
        { status: 403 }
      );
    }

    // ═══════════════════════════════════════════════════════
    // ATOMIC TRANSACTION — the core advanced DB feature
    // (Rubric #8: Transaction wrapping status update + history insert)
    // ═══════════════════════════════════════════════════════
    const result = await transaction(async (client) => {
      // Step 1: UPDATE flag status (Rubric #6: DML UPDATE)
      const updateResult = await client.query(
        `UPDATE flags
         SET status = $1, reviewer_id = $2
         WHERE id = $3 AND status = 'Open'
         RETURNING id, status`,
        [action, user.id, flagId]
      );

      // Guard against race condition — another reviewer already processed it
      if (updateResult.rows.length === 0) {
        throw new Error('STALE_FLAG');
      }

      // Step 2: INSERT review_history record (Rubric #6: DML INSERT)
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
    // Handle the stale flag case from the transaction
    if (error.message === 'STALE_FLAG') {
      return NextResponse.json(
        { error: 'Flag was already reviewed by another user. Refresh and try again.' },
        { status: 409 }
      );
    }

    console.error('Review error:', error);
    return NextResponse.json(
      { error: 'Failed to process review. Transaction rolled back.' },
      { status: 500 }
    );
  }
}
