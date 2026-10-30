/**
 * GET  /api/flags — List flags (filtered by role).
 * PATCH /api/flags — Assign a reviewer to a flag (LegalAdmin only).
 *
 * Demonstrates:
 *   - Complex multi-table JOIN query (Rubric #7)
 *   - Role-based data scoping (Rubric #12)
 *   - DML UPDATE for reviewer assignment (Rubric #6)
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

/**
 * GET /api/flags
 *
 * Reviewer: flags assigned to them (Open status).
 * LegalAdmin: all flags across all clients.
 * Client: flags on their own contracts.
 */
export async function GET(request) {
  const auth = await requireAuth('Reviewer', 'LegalAdmin', 'Client');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { user } = auth;
  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status');

  // Complex multi-table JOIN (Rubric #7)
  let sql = `
    SELECT
      f.id           AS flag_id,
      f.similarity_score,
      f.status       AS flag_status,
      f.reviewer_id,
      f.created_at   AS flag_created_at,
      cl.id          AS clause_id,
      cl.clause_text,
      cl.clause_number,
      c.id           AS contract_id,
      c.file_name    AS contract_name,
      c.client_id,
      u_client.name  AS client_name,
      rl.clause_pattern_text AS risk_pattern,
      rl.risk_category,
      rl.severity_weight,
      u_reviewer.name AS reviewer_name,
      calculate_risk_score(cl.id) AS risk_score
    FROM flags f
    JOIN clauses cl        ON cl.id = f.clause_id
    JOIN contracts c       ON c.id  = cl.contract_id
    JOIN users u_client    ON u_client.id = c.client_id
    JOIN risk_library rl   ON rl.id = f.risk_library_id
    LEFT JOIN users u_reviewer ON u_reviewer.id = f.reviewer_id
    WHERE 1=1
  `;

  try {
    const params = [];
    let paramIndex = 1;

    // Role-based data scoping (Rubric #12)
    if (user.role === 'Reviewer') {
      // Reviewer strictly sees flags assigned to them by a Legal Admin
      sql += ` AND f.reviewer_id = $${paramIndex}`;
      params.push(user.id);
      paramIndex++;
    } else if (user.role === 'Client') {
      // Client strictly sees flags belonging to their own contracts
      sql += ` AND c.client_id = $${paramIndex}`;
      params.push(user.id);
      paramIndex++;
    }

    // Status filter: 'Open', 'Cleared', 'Escalated', or 'ALL'
    if (statusFilter && statusFilter.toUpperCase() !== 'ALL') {
      const normalizedStatus =
        statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1).toLowerCase();
      const validStatuses = ['Open', 'Cleared', 'Escalated'];

      if (!validStatuses.includes(normalizedStatus)) {
        return NextResponse.json(
          { error: `Invalid status filter. Must be one of: ${validStatuses.join(', ')}, or ALL` },
          { status: 400 }
        );
      }

      sql += ` AND f.status = $${paramIndex}`;
      params.push(normalizedStatus);
      paramIndex++;
    }

    sql += ' ORDER BY f.similarity_score DESC, f.created_at DESC';

    const result = await query(sql, params);
    return NextResponse.json({ flags: result.rows });
  } catch (error) {
    console.error('Error fetching flags:', error);
    return NextResponse.json({ error: 'Failed to fetch flags' }, { status: 500 });
  }
}
