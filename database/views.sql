/**
 * Track B SQL — CTE-backed view and additional indexes.
 *
 * Apply AFTER database/schema.sql has been applied.
 *
 * Contents:
 *   1. Unique index on users(name) — needed for login-by-name
 *   2. unresolved_flags_by_client VIEW using a CTE
 *      (Rubric #8: CTE, Rubric #7: JOINs + aggregation)
 */

-- 1. Ensure user names are unique for login lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name_unique ON users (name);

-- 2. CTE-backed view: unresolved (open) flags aggregated by client
-- This demonstrates:
--   • Common Table Expression (CTE) — WITH clause
--   • Multi-table JOINs (flags → clauses → contracts → users, risk_library)
--   • Aggregate functions (COUNT, AVG, MAX)
--   • Filtering and grouping

CREATE OR REPLACE VIEW unresolved_flags_by_client AS
WITH client_flags AS (
    -- CTE 1: aggregate open/unresolved flags and risk metrics per client
    SELECT
        c.client_id,
        COUNT(f.id)                                       AS open_flag_count,
        ROUND(AVG(f.similarity_score)::NUMERIC, 4)         AS avg_similarity_score,
        ROUND(
            AVG(
                GREATEST(f.similarity_score, 0)
                * rl.severity_weight / 5.0 * 100
            )::NUMERIC, 2
        )                                                 AS avg_risk_score,
        MAX(f.created_at)                                 AS latest_flag_date
    FROM flags f
    JOIN clauses cl      ON cl.id = f.clause_id
    JOIN contracts c     ON c.id = cl.contract_id
    JOIN risk_library rl ON rl.id = f.risk_library_id
    WHERE f.status = 'Open'
    GROUP BY c.client_id
),
client_contracts AS (
    -- CTE 2: aggregate total contracts per client
    SELECT
        client_id,
        COUNT(id) AS total_contracts
    FROM contracts
    GROUP BY client_id
)
SELECT
    u.id                                                    AS client_id,
    u.name                                                  AS client_name,
    COALESCE(cc.total_contracts, 0)                         AS total_contracts,
    COALESCE(cf.open_flag_count, 0)                          AS open_flag_count,
    cf.avg_similarity_score,
    cf.avg_risk_score,
    cf.latest_flag_date
FROM users u
LEFT JOIN client_contracts cc ON cc.client_id = u.id
LEFT JOIN client_flags cf     ON cf.client_id = u.id
WHERE u.role = 'Client';
