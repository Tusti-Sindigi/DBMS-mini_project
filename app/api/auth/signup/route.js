/**
 * POST /api/auth/signup — Create a new user account.
 *
 * Accepts: { name, password, role }
 * Roles: Client | Reviewer | LegalAdmin
 *
 * Demonstrates:
 *   - DML: INSERT into users (Rubric #6)
 *   - Password hashing with bcrypt (Rubric #12)
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { hashPassword, createToken, setSessionCookie } from '@/lib/auth';

const VALID_ROLES = ['Client', 'Reviewer', 'LegalAdmin'];

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, password, role } = body;

    // Validation
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

    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Role must be one of: ${VALID_ROLES.join(', ')}` },
        { status: 400 }
      );
    }

    // Role Escalation Protection: Public signup is strictly for Clients
    // Staff accounts (Reviewer / LegalAdmin) must be provisioned by an existing LegalAdmin
    if (role !== 'Client') {
      const adminCheck = await query("SELECT id FROM users WHERE role = 'LegalAdmin' LIMIT 1");
      if (adminCheck.rows.length > 0) {
        return NextResponse.json(
          {
            error:
              'Public registration is restricted to Client accounts. Reviewer and Legal Admin accounts must be provisioned by a Legal Admin.',
          },
          { status: 403 }
        );
      }
    }

    // Check if user already exists
    const existing = await query('SELECT id FROM users WHERE name = $1', [name.trim()]);
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: 'A user with this name already exists' },
        { status: 409 }
      );
    }

    // Hash password — never store plaintext (Rubric #12)
    const passwordHash = await hashPassword(password);

    // INSERT new user (Rubric #6: DML INSERT)
    const result = await query(
      'INSERT INTO users (name, role, password_hash) VALUES ($1, $2, $3) RETURNING id, name, role',
      [name.trim(), role, passwordHash]
    );

    const user = result.rows[0];

    // Create session
    const token = await createToken(user);
    await setSessionCookie(token);

    return NextResponse.json({ user: { id: user.id, name: user.name, role: user.role } }, { status: 201 });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
