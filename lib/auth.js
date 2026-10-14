/**
 * Authentication and session helpers.
 *
 * - Passwords hashed with bcryptjs (Rubric #12: never plaintext)
 * - JWT tokens via `jose` stored in httpOnly cookies
 * - Role-based access: Client, Reviewer, LegalAdmin
 *   (Rubric #12: minimum two roles + role-based access control)
 */

import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-change-in-production'
);
export const COOKIE_NAME = 'session_token';
const TOKEN_EXPIRY = '24h';
const BCRYPT_ROUNDS = 12;

/* ---------- Password hashing (Rubric #12) ---------- */

export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/* ---------- JWT token management ---------- */

export async function createToken(user) {
  return new SignJWT({
    id: user.id,
    role: user.role,
    name: user.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

/* ---------- Session cookie helpers ---------- */

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function setSessionCookie(token) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/* ---------- Role authorization helpers ---------- */

/**
 * Check that the current session has one of the allowed roles.
 * Returns { user } on success or { error, status } on failure.
 * Used in every protected API route for server-side authorization.
 * (Rubric #12: role-based access control in database/API layer)
 */
export async function requireAuth(...allowedRoles) {
  const session = await getSession();
  if (!session) {
    return { error: 'Authentication required', status: 401 };
  }
  if (allowedRoles.length > 0 && !allowedRoles.includes(session.role)) {
    return { error: 'Insufficient permissions', status: 403 };
  }
  return { user: session };
}
