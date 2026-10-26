import { NextResponse } from 'next/server';
import { transaction } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function POST() {
  const auth = await requireAuth('LegalAdmin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const assignment = await transaction(async (client) => {
      const reviewerCountResult = await client.query(
        "SELECT COUNT(*)::INT AS count FROM users WHERE role = 'Reviewer'"
      );
      const reviewerCount = reviewerCountResult.rows[0].count;
      if (reviewerCount === 0) return { reviewerCount, assignedCount: 0 };

      const result = await client.query(
        `WITH reviewer_pool AS (
           SELECT id,
                  ROW_NUMBER() OVER (ORDER BY id) AS reviewer_number,
                  COUNT(*) OVER () AS reviewer_count
           FROM users
           WHERE role = 'Reviewer'
         ),
         locked_flags AS MATERIALIZED (
           SELECT id, created_at
           FROM flags
           WHERE status = 'Open' AND reviewer_id IS NULL
           ORDER BY created_at, id
           FOR UPDATE SKIP LOCKED
         ),
         ranked_flags AS (
           SELECT id,
                  ROW_NUMBER() OVER (ORDER BY created_at, id) AS flag_number
           FROM locked_flags
         ),
         assignment_map AS (
           SELECT flags.id,
                  reviewers.id AS reviewer_id
           FROM ranked_flags AS flags
           JOIN reviewer_pool AS reviewers
             ON reviewers.reviewer_number =
                ((flags.flag_number - 1) % reviewers.reviewer_count) + 1
         )
         UPDATE flags AS target
         SET reviewer_id = assignment_map.reviewer_id
         FROM assignment_map
         WHERE target.id = assignment_map.id
           AND target.status = 'Open'
           AND target.reviewer_id IS NULL
         RETURNING target.id`,
      );

      return { reviewerCount, assignedCount: result.rowCount };
    });

    if (assignment.reviewerCount === 0) {
      return NextResponse.json(
        { error: 'Provision at least one Reviewer before assigning flags.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: assignment.assignedCount === 0
        ? 'There are no unassigned open flags.'
        : `Assigned ${assignment.assignedCount} open flag(s) across ${assignment.reviewerCount} reviewer(s).`,
      assignedCount: assignment.assignedCount,
    });
  } catch (error) {
    console.error('Automatic reviewer assignment failed:', error);
    return NextResponse.json({ error: 'Could not assign reviewers.' }, { status: 500 });
  }
}
