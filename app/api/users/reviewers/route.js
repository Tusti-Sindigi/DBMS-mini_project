/**
 * GET /api/users/reviewers — List all users with the Reviewer role.
 *
 * Used by LegalAdmin to populate reviewer assignment dropdowns.
 * (Rubric #12: Role-based user management)
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET() {
  const auth = await requireAuth('LegalAdmin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const result = await query(
      `SELECT id, name, created_at,
         (SELECT COUNT(*)::INT FROM flags WHERE reviewer_id = users.id AND status = 'Open') AS active_queue_count
       FROM users
       WHERE role = 'Reviewer'
       ORDER BY name ASC`
    );

    return NextResponse.json({ reviewers: result.rows });
  } catch (error) {
    console.error('Error fetching reviewers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reviewers' },
      { status: 500 }
    );
  }
}
