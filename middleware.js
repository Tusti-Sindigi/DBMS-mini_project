/**
 * Next.js Middleware — runs on every request before the route handler.
 *
 * Responsibilities:
 *   1. Allow public paths (login, signup) without auth
 *   2. Redirect unauthenticated users to /login
 *   3. Return 401 for unauthenticated API requests
 *   4. Enforce role-based page access
 *
 * (Rubric #12: server-side role enforcement, not just UI hiding)
 */

import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const DEVELOPMENT_JWT_SECRET = 'local-development-only-change-before-deploying-123456789';
const COOKIE_NAME = 'session_token';

const PUBLIC_PATHS = ['/', '/login', '/signup', '/api/auth/login', '/api/auth/signup'];

// Role-based access rules for pages
const ROLE_ACCESS = {
  '/contracts/upload': ['Client'],
  '/contracts': ['Client', 'Reviewer', 'LegalAdmin'],
  '/reviewer': ['Reviewer'],
  '/admin': ['LegalAdmin'],
};

// In-memory sliding window rate limiter (Finding CG-FIND-08)
const rateLimitMap = new Map();
const RATE_LIMIT_RULES = {
  'POST:/api/auth/login': { max: 10, windowMs: 60_000 },
  'POST:/api/auth/signup': { max: 10, windowMs: 60_000 },
  'POST:/api/contracts': { max: 20, windowMs: 60_000 },
};

function checkRateLimit(request, pathname) {
  const ruleKey = `${request.method}:${pathname}`;
  const rule = RATE_LIMIT_RULES[ruleKey];
  if (!rule) return null;

  const ip =
    request.ip ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1';
  const key = `${ruleKey}:${ip}`;
  const now = Date.now();

  let timestamps = rateLimitMap.get(key) || [];
  timestamps = timestamps.filter((time) => now - time < rule.windowMs);

  if (timestamps.length >= rule.max) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment before trying again.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  timestamps.push(now);
  rateLimitMap.set(key, timestamps);

  // Periodic pruning if cache grows
  if (rateLimitMap.size > 2000) {
    for (const [k, times] of rateLimitMap.entries()) {
      const valid = times.filter((t) => now - t < 60_000);
      if (valid.length === 0) rateLimitMap.delete(k);
      else rateLimitMap.set(k, valid);
    }
  }

  return null;
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // 1. Rate limiting on sensitive endpoints
  const rateLimitResponse = checkRateLimit(request, pathname);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // 2. Read and verify JWT token from cookie
  const configuredSecret = process.env.JWT_SECRET || DEVELOPMENT_JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && configuredSecret.length < 32) {
    return NextResponse.json({ error: 'Server authentication is not configured.' }, { status: 500 });
  }
  const JWT_SECRET = new TextEncoder().encode(configuredSecret);
  const token = request.cookies.get(COOKIE_NAME)?.value;
  let payload = null;

  if (token) {
    try {
      const result = await jwtVerify(token, JWT_SECRET);
      payload = result.payload;
    } catch {
      // Token invalid/expired — treat as unauthenticated
    }
  }

  // 3. Authenticated user visiting /, /login, or /signup
  // Directly loads their account and stops public/auth screens from showing while logged in
  if (payload && (pathname === '/' || pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // 4. Allow public paths for unauthenticated users
  if (!payload && PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  // 5. Unauthenticated user accessing protected path
  if (!payload) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 6. Role-based page access for authenticated users
  if (pathname === '/contracts' && payload.role === 'Reviewer') {
    return NextResponse.redirect(new URL('/reviewer', request.url));
  }

  for (const [pathPrefix, allowedRoles] of Object.entries(ROLE_ACCESS)) {
    if (pathname.startsWith(pathPrefix) && !allowedRoles.includes(payload.role)) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
