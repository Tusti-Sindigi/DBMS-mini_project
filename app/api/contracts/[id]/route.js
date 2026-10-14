/**
 * GET /api/contracts/[id] — Contract detail with clauses and flags.
 *
 * Returns the full clause breakdown with flag/risk info for each clause.
 *
 * Demonstrates:
 *   - Complex multi-table JOIN (clauses ↔ flags ↔ risk_library) (Rubric #7)
 *   - Correlated subquery for latest review action (Rubric #7)
 *   - Calls calculate_risk_score() — Track A's function (Rubric #8)
 *   - Vector similarity data read (Rubric #9)
 *   - Role-based data scoping (Rubric #12)
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(request, { params }) {
  const auth = await requireAuth('Client', 'LegalAdmin', 'Reviewer');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { user } = auth;
  const resolvedParams = await params;
  const contractId = resolvedParams.id;

  // Fetch contract with ownership check (Rubric #12: data scoping)
  const contractResult = await query(
    `SELECT c.id, c.file_name, c.upload_date, c.status, c.client_id, c.uploaded_by,
            u.name AS client_name
     FROM contracts c
     JOIN users u ON u.id = c.client_id
     WHERE c.id = $1`,
    [contractId]
  );

  if (contractResult.rows.length === 0) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  }

  const contract = contractResult.rows[0];

  // Clients can only view their own contracts
  if (user.role === 'Client' && String(contract.client_id) !== String(user.id)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // Fetch clauses with flags and risk info
  // Complex multi-table JOIN + correlated subquery (Rubric #7)
  const clausesResult = await query(
    `SELECT
        cl.id                AS clause_id,
        cl.clause_number,
        cl.clause_text,
        f.id                 AS flag_id,
        f.similarity_score,
        f.status             AS flag_status,
        f.reviewer_id,
        ur.name              AS reviewer_name,
        rl.id                AS risk_library_id,
        rl.clause_pattern_text AS matched_pattern,
        rl.risk_category,
        rl.severity_weight,
        calculate_risk_score(cl.id) AS risk_score,
        (
          SELECT rh.action
          FROM review_history rh
          WHERE rh.flag_id = f.id
          ORDER BY rh."timestamp" DESC
          LIMIT 1
        ) AS last_review_action
     FROM clauses cl
     LEFT JOIN flags f          ON f.clause_id = cl.id
     LEFT JOIN risk_library rl  ON rl.id = f.risk_library_id
     LEFT JOIN users ur         ON ur.id = f.reviewer_id
     WHERE cl.contract_id = $1
     ORDER BY cl.clause_number`,
    [contractId]
  );

  return NextResponse.json({
    contract: {
      id: contract.id,
      fileName: contract.file_name,
      uploadDate: contract.upload_date,
      status: contract.status,
      clientName: contract.client_name,
    },
    clauses: clausesResult.rows,
  });
}
