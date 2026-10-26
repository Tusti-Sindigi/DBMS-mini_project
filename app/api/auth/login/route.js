/**
 * POST /api/auth/login — Authenticate an existing user.
 *
 * Accepts: { name, password }
 * Returns: { user: { id, name, role } }
 *
 * Validates credentials against bcrypt-hashed password in the database.
 * (Rubric #12: Authentication implementation)
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyPassword, createToken, setSessionCookie } from '@/lib/auth';

export async function POST(request) {
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
    const { name, password } = body;

    if (!name || !password) {
      return NextResponse.json(
        { error: 'Name and password are required' },
        { status: 400 }
      );
    }

    // Look up user by name
    const result = await query(
      'SELECT id, name, role, password_hash FROM users WHERE name = $1',
      [name.trim()]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const user = result.rows[0];

    // Verify password against stored hash (Rubric #12)
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Create session token and set cookie
    const token = await createToken(user);
    await setSessionCookie(token);

    return NextResponse.json({
      user: { id: user.id, name: user.name, role: user.role },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
