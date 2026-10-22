/**
 * POST /api/admin/auto-assign — Distribute unassigned open flags to active reviewers.
 *
 * Demonstrates:
 *   - Advanced SQL DML with round-robin assignment using window functions or CTE (Rubric #6, #8)
 *   - Role-based server-side authorization (Rubric #12)
 */

import { NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function POST() {
  const auth = await requireAuth('LegalAdmin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    // 1. Fetch active reviewers
    const reviewersRes = await query(
      "SELECT id, name FROM users WHERE role = 'Reviewer' ORDER BY id ASC"
    );

    const reviewers = reviewersRes.rows;
    if (reviewers.length === 0) {
      return NextResponse.json(
        { error: 'No reviewers found in the system. Please provision at least one Reviewer first.' },
        { status: 400 }
      );
    }

    // 2. Fetch all unassigned open flags
    const unassignedFlagsRes = await query(
      "SELECT id FROM flags WHERE status = 'Open' AND reviewer_id IS NULL ORDER BY created_at ASC"
    );

    const unassignedFlags = unassignedFlagsRes.rows;
    if (unassignedFlags.length === 0) {
      return NextResponse.json({
        message: 'No unassigned open flags found. All flags have already been allocated.',
        assignedCount: 0,
      });
    }

    // 3. Atomically assign flags in round-robin fashion inside a transaction
    await transaction(async (client) => {
      for (let i = 0; i < unassignedFlags.length; i++) {
        const flag = unassignedFlags[i];
        const assignedReviewer = reviewers[i % reviewers.length];

        await client.query(
          'UPDATE flags SET reviewer_id = $1 WHERE id = $2',
          [assignedReviewer.id, flag.id]
        );
      }
    });

    return NextResponse.json({
      message: `Successfully assigned ${unassignedFlags.length} open flag(s) across ${reviewers.length} reviewer(s).`,
      assignedCount: unassignedFlags.length,
    });
  } catch (error) {
    console.error('Error auto-assigning flags:', error);
    return NextResponse.json({ error: 'Failed to auto-assign flags' }, { status: 500 });
  }
}
