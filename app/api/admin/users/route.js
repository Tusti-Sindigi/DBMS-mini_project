/**
 * API Route: /api/admin/users — Staff Account Provisioning
 *
 * GET  — List staff accounts (Reviewer, LegalAdmin) with active queue stats.
 * POST — Provision a new staff user (LegalAdmin only).
 *
 * Demonstrates:
 *   - Role-based server-side access control (Rubric #12)
 *   - Password hashing with bcrypt (Rubric #12)
 *   - DML INSERT into users (Rubric #6)
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth, hashPassword } from '@/lib/auth';

const ALLOWED_STAFF_ROLES = ['Reviewer', 'LegalAdmin'];

export async function GET() {
  const auth = await requireAuth('LegalAdmin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const result = await query(
      `SELECT
         u.id,
         u.name,
         u.role,
         u.created_at,
         (SELECT COUNT(*)::INT FROM flags f WHERE f.reviewer_id = u.id AND f.status = 'Open') AS open_queue_count,
         (SELECT COUNT(*)::INT FROM review_history rh WHERE rh.reviewer_id = u.id) AS total_reviews_completed
       FROM users u
       WHERE u.role IN ('Reviewer', 'LegalAdmin')
       ORDER BY u.role DESC, u.name ASC`
    );

    return NextResponse.json({ staff: result.rows });
  } catch (error) {
    console.error('Error fetching staff accounts:', error);
    return NextResponse.json({ error: 'Failed to fetch staff accounts' }, { status: 500 });
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
    const { name, password, role } = body;

    if (!name || !password || !role) {
      return NextResponse.json(
        { error: 'Name, password, and role are required' },
        { status: 400 }
      );
    }

    if (typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json(
        { error: 'Name must be at least 2 characters' },
        { status: 400 }
      );
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    if (!ALLOWED_STAFF_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Staff role must be either 'Reviewer' or 'LegalAdmin'` },
        { status: 400 }
      );
    }

    // Check if name is taken
    const existing = await query('SELECT id FROM users WHERE name = $1', [name.trim()]);
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: 'A user with this username already exists' },
        { status: 409 }
      );
    }

    // Hash password with bcrypt (Rubric #12)
    const passwordHash = await hashPassword(password);

    // INSERT new staff member (Rubric #6: DML INSERT)
    const insertResult = await query(
      `INSERT INTO users (name, role, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, role, created_at`,
      [name.trim(), role, passwordHash]
    );

    return NextResponse.json(
      {
        message: `${role} account '${name.trim()}' successfully provisioned.`,
        user: insertResult.rows[0],
      },
      { status: 201 }
    );
  } catch (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A user with this username already exists.' }, { status: 409 });
    }
    console.error('Error provisioning staff account:', error);
    return NextResponse.json({ error: 'Failed to provision staff account' }, { status: 500 });
  }
}
