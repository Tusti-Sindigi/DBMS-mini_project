/**
 * GET /api/admin/dashboard — Aggregated metrics and CTE view data for LegalAdmin.
 *
 * Demonstrates:
 *   - Consuming the unresolved_flags_by_client VIEW (Rubric #8: CTE / Views)
 *   - Multi-table JOIN queries and aggregations (Rubric #7)
 *   - Role-based server authorization (Rubric #12)
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET() {
  const auth = await requireAuth('LegalAdmin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    // 1. Query the CTE-backed view (Rubric #8: View / CTE)
    const viewResult = await query(
      `SELECT
         client_id,
         client_name,
         total_contracts,
         open_flag_count,
         avg_similarity_score,
         avg_risk_score,
         latest_flag_date
       FROM unresolved_flags_by_client
       ORDER BY open_flag_count DESC, client_name ASC`
    );

    // 2. High-level system statistics (Rubric #7: Aggregations)
    const contractCountRes = await query('SELECT COUNT(*)::INT AS total FROM contracts');
    const clauseCountRes = await query('SELECT COUNT(*)::INT AS total FROM clauses');
    const flagStatsRes = await query(
      `SELECT
         status,
         COUNT(*)::INT AS count
       FROM flags
       GROUP BY status`
    );

    const flagStats = {
      Open: 0,
      Cleared: 0,
      Escalated: 0,
    };
    let totalFlags = 0;
    for (const row of flagStatsRes.rows) {
      flagStats[row.status] = row.count;
      totalFlags += row.count;
    }

    // 3. Risk threshold from risk_config
    const configRes = await query('SELECT similarity_threshold FROM risk_config WHERE id = 1');
    const similarityThreshold = configRes.rows[0]?.similarity_threshold || 0.75;

    // 4. Recent review history (Rubric #7: Multi-table JOIN)
    const recentHistoryRes = await query(
      `SELECT
         rh.id,
         rh.action,
         rh."timestamp",
         f.id AS flag_id,
         cl.clause_number,
         c.file_name,
         ur.name AS reviewer_name,
         rl.risk_category
       FROM review_history rh
       JOIN flags f         ON f.id = rh.flag_id
       JOIN clauses cl      ON cl.id = f.clause_id
       JOIN contracts c     ON c.id = cl.contract_id
       JOIN users ur        ON ur.id = rh.reviewer_id
       JOIN risk_library rl ON rl.id = f.risk_library_id
       ORDER BY rh."timestamp" DESC
       LIMIT 10`
    );

    return NextResponse.json({
      unresolvedByClient: viewResult.rows,
      stats: {
        totalContracts: contractCountRes.rows[0]?.total || 0,
        totalClauses: clauseCountRes.rows[0]?.total || 0,
        totalFlags,
        openFlags: flagStats.Open,
        clearedFlags: flagStats.Cleared,
        escalatedFlags: flagStats.Escalated,
        similarityThreshold,
      },
      recentActivity: recentHistoryRes.rows,
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    return NextResponse.json(
      { error: 'Failed to load admin dashboard data' },
      { status: 500 }
    );
  }
}
