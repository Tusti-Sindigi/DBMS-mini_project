/**
 * GET /api/auth/me — Return the current authenticated user.
 *
 * Used by the Navbar and client pages to check session status and role.
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return NextResponse.json({
    user: { id: session.id, name: session.name, role: session.role },
  });
}
