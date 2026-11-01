-- ============================================================================
-- ClauseGuard: AI-Assisted Contract Clause Risk Flagging System
-- DATA MANIPULATION LANGUAGE (DML) SCRIPT
-- ============================================================================
-- Description:
--   Comprehensive DML script demonstrating:
--     1. INSERT operations to populate all 7 tables with realistic seed data
--        satisfying all foreign keys, CHECK constraints, and unique constraints.
--     2. SELECT queries demonstrating basic retrieval, multi-table JOINs,
--        aggregations with GROUP BY and HAVING, subqueries, and CTE analysis.
--     3. UPDATE statements demonstrating operational state changes (contract status,
--        flag triage, reviewer assignment, dynamic threshold configuration).
--     4. DELETE statements demonstrating referential integrity and ON DELETE CASCADE.
--     5. ACID TRANSACTION blocks demonstrating atomic reviewer workflows.
--
-- Prerequisite:
--   Run database/ddl.sql or database/schema.sql before executing this script.
-- ============================================================================


-- ############################################################################
-- PART 1: DATA POPULATION (INSERT STATEMENTS)
-- ############################################################################

-- ============================================================================
-- Table: risk_config
-- Operation: Seed initial singleton risk similarity threshold
-- ============================================================================
INSERT INTO risk_config (id, similarity_threshold)
VALUES (1, 0.75)
ON CONFLICT (id) DO UPDATE
SET similarity_threshold = EXCLUDED.similarity_threshold;


-- ============================================================================
-- Table: users
-- Operation: Seed users across all three roles (LegalAdmin, Reviewer, Client)
-- Note: password_hash below is a valid bcrypt hash for 'Password@123'
-- ============================================================================
INSERT INTO users (name, role, password_hash, created_at)
VALUES
    ('admin_sarah', 'LegalAdmin', '$2a$10$Omwr1GAa4AFxM48QNtPCQutcp5dz5Hsa0hknLgK4Tl9n001D/TO1K', NOW() - INTERVAL '30 days'),
    ('reviewer_raj', 'Reviewer', '$2a$10$Omwr1GAa4AFxM48QNtPCQutcp5dz5Hsa0hknLgK4Tl9n001D/TO1K', NOW() - INTERVAL '25 days'),
    ('reviewer_priya', 'Reviewer', '$2a$10$Omwr1GAa4AFxM48QNtPCQutcp5dz5Hsa0hknLgK4Tl9n001D/TO1K', NOW() - INTERVAL '20 days'),
    ('client_acme_corp', 'Client', '$2a$10$Omwr1GAa4AFxM48QNtPCQutcp5dz5Hsa0hknLgK4Tl9n001D/TO1K', NOW() - INTERVAL '15 days'),
    ('client_ngo_aid', 'Client', '$2a$10$Omwr1GAa4AFxM48QNtPCQutcp5dz5Hsa0hknLgK4Tl9n001D/TO1K', NOW() - INTERVAL '10 days')
ON CONFLICT (name) DO NOTHING;


-- ============================================================================
-- Table: risk_library
-- Operation: Seed curated predatory clause patterns and severity weights (1-5)
-- ============================================================================
INSERT INTO risk_library (clause_pattern_text, risk_category, severity_weight, embedding, created_at)
VALUES
    (
        'The supplier''s liability shall be unlimited and shall include all direct, indirect, incidental, and consequential losses.',
        'Unlimited Liability',
        5,
        ('[' || array_to_string(array_fill(0.05, ARRAY[384]), ',') || ']')::vector,
        NOW() - INTERVAL '28 days'
    ),
    (
        'Neither party''s liability is capped, regardless of the amount of damages or the cause of the claim.',
        'Unlimited Liability',
        5,
        ('[' || array_to_string(array_fill(0.04, ARRAY[384]), ',') || ']')::vector,
        NOW() - INTERVAL '28 days'
    ),
    (
        'The supplier may terminate this agreement at any time, for any reason, without prior notice.',
        'Unilateral Termination',
        5,
        ('[' || array_to_string(array_fill(0.03, ARRAY[384]), ',') || ']')::vector,
        NOW() - INTERVAL '27 days'
    ),
    (
        'The customer may not terminate the agreement, while the supplier may end it at its sole discretion.',
        'Unilateral Termination',
        5,
        ('[' || array_to_string(array_fill(0.035, ARRAY[384]), ',') || ']')::vector,
        NOW() - INTERVAL '27 days'
    ),
    (
        'The customer shall indemnify, defend, and hold harmless the supplier from every claim, whether caused by the supplier or not.',
        'One-Sided Indemnity',
        5,
        ('[' || array_to_string(array_fill(-0.02, ARRAY[384]), ',') || ']')::vector,
        NOW() - INTERVAL '26 days'
    ),
    (
        'This agreement automatically renews for successive three-year terms unless the customer gives notice at least 180 days before expiry.',
        'Auto-Renewal Trap',
        4,
        ('[' || array_to_string(array_fill(-0.04, ARRAY[384]), ',') || ']')::vector,
        NOW() - INTERVAL '25 days'
    ),
    (
        'Additional charges and fee escalations may be imposed from time to time at rates determined solely by the supplier.',
        'Vague Payment Terms',
        4,
        ('[' || array_to_string(array_fill(0.02, ARRAY[384]), ',') || ']')::vector,
        NOW() - INTERVAL '24 days'
    )
ON CONFLICT (clause_pattern_text) DO NOTHING;


-- ============================================================================
-- Table: contracts
-- Operation: Seed sample commercial contract uploads for clients
-- ============================================================================
INSERT INTO contracts (uploaded_by, client_id, file_name, upload_date, status)
VALUES
    (
        (SELECT id FROM users WHERE name = 'client_acme_corp'),
        (SELECT id FROM users WHERE name = 'client_acme_corp'),
        'Master_Cloud_Services_Agreement_2026.pdf',
        NOW() - INTERVAL '5 days',
        'Analyzed'
    ),
    (
        (SELECT id FROM users WHERE name = 'client_ngo_aid'),
        (SELECT id FROM users WHERE name = 'client_ngo_aid'),
        'IT_Vendor_Procurement_Contract.pdf',
        NOW() - INTERVAL '3 days',
        'Analyzed'
    ),
    (
        (SELECT id FROM users WHERE name = 'client_acme_corp'),
        (SELECT id FROM users WHERE name = 'client_acme_corp'),
        'Commercial_Lease_Draft_v2.pdf',
        NOW() - INTERVAL '1 day',
        'Processing'
    );


-- ============================================================================
-- Table: clauses
-- Operation: Seed extracted clauses for the uploaded contracts
-- ============================================================================
INSERT INTO clauses (contract_id, clause_number, clause_text, embedding, created_at)
VALUES
    (
        (SELECT id FROM contracts WHERE file_name = 'Master_Cloud_Services_Agreement_2026.pdf' LIMIT 1),
        '1.1',
        'Scope of Services: Provider shall deliver hosted cloud database management services in accordance with SLA Schedule A.',
        ('[' || array_to_string(array_fill(0.01, ARRAY[384]), ',') || ']')::vector,
        NOW() - INTERVAL '5 days'
    ),
    (
        (SELECT id FROM contracts WHERE file_name = 'Master_Cloud_Services_Agreement_2026.pdf' LIMIT 1),
        '4.2',
        'Termination for Convenience: The supplier may terminate this agreement at any time, for any reason, without notice.',
        ('[' || array_to_string(array_fill(0.03, ARRAY[384]), ',') || ']')::vector,
        NOW() - INTERVAL '5 days'
    ),
    (
        (SELECT id FROM contracts WHERE file_name = 'Master_Cloud_Services_Agreement_2026.pdf' LIMIT 1),
        '8.1',
        'Limitation of Liability: The supplier''s liability shall be unlimited and shall include all direct, indirect, incidental, and consequential losses.',
        ('[' || array_to_string(array_fill(0.05, ARRAY[384]), ',') || ']')::vector,
        NOW() - INTERVAL '5 days'
    ),
    (
        (SELECT id FROM contracts WHERE file_name = 'IT_Vendor_Procurement_Contract.pdf' LIMIT 1),
        '2.0',
        'Term & Renewal: This agreement automatically renews for successive three-year terms unless the customer gives notice at least 180 days before expiry.',
        ('[' || array_to_string(array_fill(-0.04, ARRAY[384]), ',') || ']')::vector,
        NOW() - INTERVAL '3 days'
    ),
    (
        (SELECT id FROM contracts WHERE file_name = 'IT_Vendor_Procurement_Contract.pdf' LIMIT 1),
        '5.3',
        'Indemnification: The customer shall indemnify, defend, and hold harmless the supplier from every claim, whether caused by the supplier or not.',
        ('[' || array_to_string(array_fill(-0.02, ARRAY[384]), ',') || ']')::vector,
        NOW() - INTERVAL '3 days'
    ),
    (
        (SELECT id FROM contracts WHERE file_name = 'Commercial_Lease_Draft_v2.pdf' LIMIT 1),
        '1.0',
        'Premises: Landlord hereby leases to Tenant the commercial office space located at Suite 400.',
        NULL,
        NOW() - INTERVAL '1 day'
    )
ON CONFLICT (contract_id, clause_number) DO NOTHING;


-- ============================================================================
-- Table: flags
-- Operation: Seed flags linking clauses to matched predatory risk patterns
-- ============================================================================
INSERT INTO flags (clause_id, risk_library_id, similarity_score, status, reviewer_id, created_at)
VALUES
    (
        (SELECT id FROM clauses WHERE clause_number = '8.1' AND clause_text LIKE '%unlimited%' LIMIT 1),
        (SELECT id FROM risk_library WHERE risk_category = 'Unlimited Liability' LIMIT 1),
        0.9850,
        'Open',
        (SELECT id FROM users WHERE name = 'reviewer_raj'),
        NOW() - INTERVAL '4 days'
    ),
    (
        (SELECT id FROM clauses WHERE clause_number = '4.2' AND clause_text LIKE '%terminate this agreement%' LIMIT 1),
        (SELECT id FROM risk_library WHERE risk_category = 'Unilateral Termination' LIMIT 1),
        0.9420,
        'Escalated',
        (SELECT id FROM users WHERE name = 'reviewer_raj'),
        NOW() - INTERVAL '4 days'
    ),
    (
        (SELECT id FROM clauses WHERE clause_number = '2.0' AND clause_text LIKE '%automatically renews%' LIMIT 1),
        (SELECT id FROM risk_library WHERE risk_category = 'Auto-Renewal Trap' LIMIT 1),
        0.9100,
        'Open',
        (SELECT id FROM users WHERE name = 'reviewer_priya'),
        NOW() - INTERVAL '2 days'
    ),
    (
        (SELECT id FROM clauses WHERE clause_number = '5.3' AND clause_text LIKE '%indemnify%' LIMIT 1),
        (SELECT id FROM risk_library WHERE risk_category = 'One-Sided Indemnity' LIMIT 1),
        0.8750,
        'Cleared',
        (SELECT id FROM users WHERE name = 'reviewer_priya'),
        NOW() - INTERVAL '2 days'
    );


-- ============================================================================
-- Table: review_history
-- Operation: Seed audit history logs for triaged flags
-- ============================================================================
INSERT INTO review_history (flag_id, action, "timestamp", reviewer_id)
VALUES
    (
        (SELECT f.id FROM flags f JOIN clauses c ON c.id = f.clause_id WHERE c.clause_number = '4.2' LIMIT 1),
        'Escalated',
        NOW() - INTERVAL '3 days',
        (SELECT id FROM users WHERE name = 'reviewer_raj')
    ),
    (
        (SELECT f.id FROM flags f JOIN clauses c ON c.id = f.clause_id WHERE c.clause_number = '5.3' LIMIT 1),
        'Cleared',
        NOW() - INTERVAL '1 day',
        (SELECT id FROM users WHERE name = 'reviewer_priya')
    );


-- ############################################################################
-- PART 2: DATA RETRIEVAL (SELECT QUERIES)
-- ############################################################################

-- ============================================================================
-- Table: users
-- Operation: SELECT - Retrieve all reviewers and legal admins
-- ============================================================================
SELECT
    id,
    name,
    role,
    created_at
FROM users
WHERE role IN ('Reviewer', 'LegalAdmin')
ORDER BY role, name;


-- ============================================================================
-- Table: contracts
-- Operation: SELECT - List contracts with uploader details and clause counts
-- ============================================================================
SELECT
    c.id                                AS contract_id,
    c.file_name,
    c.status                            AS contract_status,
    u.name                              AS client_name,
    c.upload_date,
    COUNT(cl.id)                        AS total_clauses
FROM contracts c
JOIN users u       ON u.id = c.client_id
LEFT JOIN clauses cl ON cl.contract_id = c.id
GROUP BY c.id, c.file_name, c.status, u.name, c.upload_date
ORDER BY c.upload_date DESC;


-- ============================================================================
-- Table: clauses & risk_library
-- Operation: SELECT - Stored function call to calculate composite risk scores
-- ============================================================================
SELECT
    cl.id                               AS clause_id,
    cl.clause_number,
    cl.clause_text,
    calculate_risk_score(cl.id)         AS computed_risk_score
FROM clauses cl
WHERE cl.embedding IS NOT NULL
ORDER BY computed_risk_score DESC NULLS LAST;


-- ============================================================================
-- Table: flags (Multi-Table JOIN)
-- Operation: SELECT - Comprehensive triage review queue with 5-table JOIN
-- ============================================================================
SELECT
    f.id                                AS flag_id,
    c.file_name                         AS contract_file,
    cl.clause_number,
    cl.clause_text,
    rl.risk_category,
    rl.severity_weight,
    f.similarity_score,
    ROUND((f.similarity_score * rl.severity_weight / 5.0 * 100)::NUMERIC, 2) AS composite_risk_score,
    f.status                            AS flag_status,
    COALESCE(rev.name, 'Unassigned')    AS assigned_reviewer,
    f.created_at                        AS flagged_at
FROM flags f
JOIN clauses cl        ON cl.id = f.clause_id
JOIN contracts c       ON c.id = cl.contract_id
JOIN risk_library rl   ON rl.id = f.risk_library_id
LEFT JOIN users rev    ON rev.id = f.reviewer_id
ORDER BY f.status ASC, rl.severity_weight DESC, f.similarity_score DESC;


-- ============================================================================
-- Table: flags & risk_library (Aggregation & Grouping)
-- Operation: SELECT - Risk category summary statistics with GROUP BY and HAVING
-- ============================================================================
SELECT
    rl.risk_category,
    COUNT(f.id)                         AS total_flags_raised,
    ROUND(AVG(f.similarity_score)::NUMERIC, 4) AS avg_similarity_score,
    MAX(f.similarity_score)             AS peak_similarity_score
FROM flags f
JOIN risk_library rl ON rl.id = f.risk_library_id
GROUP BY rl.risk_category
HAVING COUNT(f.id) >= 1
ORDER BY total_flags_raised DESC;


-- ============================================================================
-- Table: contracts & flags (Subquery)
-- Operation: SELECT - Correlated subquery to find contracts with high-severity flags
-- ============================================================================
SELECT
    c.id,
    c.file_name,
    c.status
FROM contracts c
WHERE EXISTS (
    SELECT 1
    FROM clauses cl
    JOIN flags f ON f.clause_id = cl.id
    JOIN risk_library rl ON rl.id = f.risk_library_id
    WHERE cl.contract_id = c.id
      AND rl.severity_weight >= 4
      AND f.status = 'Open'
);


-- ============================================================================
-- Table: review_history
-- Operation: SELECT - Audit log verification query
-- ============================================================================
SELECT
    rh.id                               AS audit_id,
    rh.flag_id,
    rh.action                           AS review_action,
    rh.timestamp                        AS reviewed_at,
    u.name                              AS reviewed_by,
    rl.risk_category
FROM review_history rh
JOIN users u         ON u.id = rh.reviewer_id
JOIN flags f         ON f.id = rh.flag_id
JOIN risk_library rl ON rl.id = f.risk_library_id
ORDER BY rh.timestamp DESC;


-- ============================================================================
-- View: unresolved_flags_by_client
-- Operation: SELECT - Query analytical CTE view for administrative overview
-- ============================================================================
SELECT
    client_id,
    client_name,
    total_contracts,
    open_flag_count,
    avg_similarity_score,
    avg_risk_score,
    latest_flag_date
FROM unresolved_flags_by_client
ORDER BY open_flag_count DESC;


-- ############################################################################
-- PART 3: DATA MODIFICATION (UPDATE STATEMENTS)
-- ############################################################################

-- ============================================================================
-- Table: risk_config
-- Operation: UPDATE - Dynamically tune cosine similarity threshold
-- ============================================================================
UPDATE risk_config
SET similarity_threshold = 0.80
WHERE id = 1;


-- ============================================================================
-- Table: contracts
-- Operation: UPDATE - Update processing status of contract after analysis
-- ============================================================================
UPDATE contracts
SET status = 'Analyzed'
WHERE file_name = 'Commercial_Lease_Draft_v2.pdf'
  AND status = 'Processing';


-- ============================================================================
-- Table: flags
-- Operation: UPDATE - Reassign reviewer to an unreviewed flag
-- ============================================================================
UPDATE flags
SET reviewer_id = (SELECT id FROM users WHERE name = 'reviewer_priya')
WHERE status = 'Open'
  AND reviewer_id IS NULL;


-- ############################################################################
-- PART 4: DATA DELETION (DELETE STATEMENTS & CASCADE INTEGRITY)
-- ############################################################################

-- ============================================================================
-- Table: clauses (CASCADE Demonstration)
-- Operation: DELETE - Deleting a clause automatically cascades to dependent
--            records in flags and review_history due to ON DELETE CASCADE
-- ============================================================================

-- Insert a temporary test clause for safe cascade testing
INSERT INTO clauses (contract_id, clause_number, clause_text)
VALUES (
    (SELECT id FROM contracts WHERE file_name = 'Commercial_Lease_Draft_v2.pdf' LIMIT 1),
    'TEMP-99',
    'Temporary clause inserted strictly for referential integrity cascade deletion test.'
)
ON CONFLICT (contract_id, clause_number) DO NOTHING;

-- Delete the test clause (Cascades automatically to flags if any)
DELETE FROM clauses
WHERE clause_number = 'TEMP-99';


-- ############################################################################
-- PART 5: ACID TRANSACTION DEMONSTRATION (REVIEWER TRIAGE WORKFLOW)
-- ############################################################################

-- ============================================================================
-- Workflow: Reviewer triage action executed inside an ACID transaction.
--   Step 1: Verify and update flag status to 'Cleared' or 'Escalated'.
--   Step 2: Atomically record review action in review_history audit table.
-- ============================================================================
BEGIN;

-- 1. Update the status of an open flag
UPDATE flags
SET status = 'Cleared'
WHERE id = (
    SELECT f.id
    FROM flags f
    WHERE f.status = 'Open'
    LIMIT 1
);

-- 2. Insert audit trail entry linking to the updated flag
INSERT INTO review_history (flag_id, action, reviewer_id, "timestamp")
VALUES (
    (SELECT f.id FROM flags f WHERE f.status = 'Cleared' ORDER BY f.created_at DESC LIMIT 1),
    'Cleared',
    (SELECT id FROM users WHERE name = 'reviewer_raj'),
    NOW()
);

COMMIT;

