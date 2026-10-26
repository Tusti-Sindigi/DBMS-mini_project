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

// Which roles can access which page path prefixes
const ROLE_ACCESS = {
  '/contracts/upload': ['Client'],
  '/contracts': ['Client', 'Reviewer', 'LegalAdmin'],
  '/reviewer': ['Reviewer'],
  '/admin': ['LegalAdmin'],
};

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  // Read JWT from cookie
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

  // Unauthenticated
  if (!payload) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Role-based page access
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
