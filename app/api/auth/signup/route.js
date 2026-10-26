import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { hashPassword, createToken, setSessionCookie } from '@/lib/auth';

const BOOTSTRAP_LOCK_ID = 72419031;

function tokenMatches(candidate, expected) {
  if (typeof candidate !== 'string' || !expected) return false;
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return candidateBytes.length === expectedBytes.length
    && timingSafeEqual(candidateBytes, expectedBytes);
}

export async function GET() {
  try {
    const result = await query(
      "SELECT EXISTS (SELECT 1 FROM users WHERE role = 'LegalAdmin') AS admin_exists"
    );

    return NextResponse.json({
      bootstrapAdminAvailable: !result.rows[0].admin_exists
        && Boolean(process.env.INITIAL_ADMIN_SETUP_TOKEN),
    });
  } catch (error) {
    console.error('Signup setup check failed:', error);
    return NextResponse.json(
      { error: 'Account registration is temporarily unavailable.' },
      { status: 503 }
    );
  }
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
    }

    const { name, password } = body || {};
    const role = body?.role || 'Client';

    if (typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'Username must be at least 2 characters.' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }
    if (!['Client', 'LegalAdmin'].includes(role)) {
      return NextResponse.json(
        { error: 'Public registration is for Clients. Reviewer accounts are provisioned by a Legal Admin.' },
        { status: 403 }
      );
    }

    const normalizedName = name.trim();
    let result;

    if (role === 'LegalAdmin') {
      const setupToken = process.env.INITIAL_ADMIN_SETUP_TOKEN;
      if (!tokenMatches(body.bootstrapToken, setupToken)) {
        return NextResponse.json({ error: 'The initial administrator setup token is invalid.' }, { status: 403 });
      }

      const passwordHash = await hashPassword(password);

      result = await transaction(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock($1)', [BOOTSTRAP_LOCK_ID]);
        const adminResult = await client.query(
          "SELECT id FROM users WHERE role = 'LegalAdmin' LIMIT 1"
        );
        if (adminResult.rows.length > 0) {
          const error = new Error('ADMIN_ALREADY_EXISTS');
          error.code = 'ADMIN_ALREADY_EXISTS';
          throw error;
        }

        return client.query(
          `INSERT INTO users (name, role, password_hash)
           VALUES ($1, 'LegalAdmin', $2)
           RETURNING id, name, role`,
          [normalizedName, passwordHash]
        );
      });
    } else {
      const passwordHash = await hashPassword(password);
      result = await query(
        `INSERT INTO users (name, role, password_hash)
         VALUES ($1, 'Client', $2)
         RETURNING id, name, role`,
        [normalizedName, passwordHash]
      );
    }

    const user = result.rows[0];
    const token = await createToken(user);
    await setSessionCookie(token);

    return NextResponse.json(
      { user: { id: user.id, name: user.name, role: user.role } },
      { status: 201 }
    );
  } catch (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A user with this username already exists.' }, { status: 409 });
    }
    if (error.code === 'ADMIN_ALREADY_EXISTS') {
      return NextResponse.json(
        { error: 'Initial administrator setup is already complete. Ask a Legal Admin to provision staff accounts.' },
        { status: 409 }
      );
    }

    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Account could not be created.' }, { status: 500 });
  }
}
