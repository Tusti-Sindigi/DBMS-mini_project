-- ============================================================================
-- ClauseGuard: Role-Based Access Control (RBAC) & Security Views
-- Unit 2: Views and Users / Roles (Dr. Nagasundari S, PES University)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DROP EXISTING ROLES (Idempotent Setup)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_client') THEN
        DROP OWNED BY role_client;
        DROP ROLE role_client;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_reviewer') THEN
        DROP OWNED BY role_reviewer;
        DROP ROLE role_reviewer;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_legal_admin') THEN
        DROP OWNED BY role_legal_admin;
        DROP ROLE role_legal_admin;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. CREATE ROLES
-- ----------------------------------------------------------------------------
-- Client Role: Uploads contracts, views contract status & flagged clauses.
CREATE ROLE role_client WITH NOLOGIN;

-- Reviewer Role: Triages flags, reads contracts & clauses, writes audit logs.
CREATE ROLE role_reviewer WITH NOLOGIN;

-- Legal Admin Role: Full schema access, manages risk library & system config.
CREATE ROLE role_legal_admin WITH NOLOGIN;

-- Allow connection user 'postgres' to assume these roles via SET ROLE
GRANT role_client, role_reviewer, role_legal_admin TO postgres;

-- ----------------------------------------------------------------------------
-- 3. SCHEMA USAGE PRIVILEGES
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO role_client;
GRANT USAGE ON SCHEMA public TO role_reviewer;
GRANT USAGE ON SCHEMA public TO role_legal_admin;

-- ----------------------------------------------------------------------------
-- 4. TABLE-LEVEL PRIVILEGES (GRANT / REVOKE)
-- ----------------------------------------------------------------------------

-- A. Client Privileges
-- Can upload contracts, insert clauses, and inspect own flags & risk criteria
GRANT SELECT, INSERT ON contracts TO role_client;
GRANT SELECT, INSERT ON clauses TO role_client;
GRANT SELECT ON flags TO role_client;
GRANT SELECT ON risk_library TO role_client;
GRANT SELECT ON risk_config TO role_client;
-- Column-level privilege: Can read public user profile details for relational JOINs,
-- but strictly cannot view sensitive password_hash
GRANT SELECT (id, name, role, created_at) ON users TO role_client;
-- Strictly REVOKE / Deny audit trails
REVOKE ALL ON review_history FROM role_client;

-- B. Reviewer Privileges
-- Can read contracts, clauses, risk patterns; can update flags and write review history
GRANT SELECT ON contracts TO role_reviewer;
GRANT SELECT ON clauses TO role_reviewer;
GRANT SELECT ON risk_library TO role_reviewer;
GRANT SELECT ON risk_config TO role_reviewer;
GRANT SELECT, UPDATE ON flags TO role_reviewer;
GRANT SELECT, INSERT ON review_history TO role_reviewer;
-- Column-level privilege: Can read user identifiers for reviewer triage
GRANT SELECT (id, name, role, created_at) ON users TO role_reviewer;

-- C. Legal Admin Privileges
-- Full administrative privileges across all tables and sequences
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO role_legal_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO role_legal_admin;

-- ----------------------------------------------------------------------------
-- 5. SEQUENCE PRIVILEGES (For IDENTITY / AUTO_INCREMENT columns)
-- ----------------------------------------------------------------------------
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO role_client;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO role_reviewer;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO role_legal_admin;

-- ----------------------------------------------------------------------------
-- 6. STORED FUNCTION PRIVILEGES & SECURITY DEFINER
-- ----------------------------------------------------------------------------
-- Ensure trigger executes with table owner permissions during clause insert
CREATE OR REPLACE FUNCTION flag_clause_when_risky()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    best_match RECORD;
    threshold_value REAL;
BEGIN
    IF NEW.embedding IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT similarity_threshold
      INTO threshold_value
      FROM risk_config
     WHERE id = 1;
    threshold_value := COALESCE(threshold_value, 0.75);

    SELECT r.id AS risk_library_id,
           (1 - (r.embedding <=> NEW.embedding))::REAL AS similarity_score
      INTO best_match
      FROM risk_library AS r
     WHERE r.embedding IS NOT NULL
     ORDER BY r.embedding <=> NEW.embedding
     LIMIT 1;

    IF best_match.risk_library_id IS NOT NULL
       AND best_match.similarity_score >= threshold_value THEN
        INSERT INTO flags (clause_id, risk_library_id, similarity_score, status)
        VALUES (NEW.id, best_match.risk_library_id, best_match.similarity_score, 'Open')
        ON CONFLICT (clause_id, risk_library_id) WHERE status = 'Open'
        DO UPDATE SET similarity_score = EXCLUDED.similarity_score;
    END IF;

    RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION find_similar_risks(BIGINT, INTEGER) TO role_client, role_reviewer, role_legal_admin;
GRANT EXECUTE ON FUNCTION calculate_risk_score(BIGINT) TO role_client, role_reviewer, role_legal_admin;

-- ----------------------------------------------------------------------------
-- 7. ROLE-SPECIFIC SECURITY VIEWS (Unit 2: Views as Authorization Mechanism)
-- ----------------------------------------------------------------------------

-- View 1: Client Security View (hides internal uploader & system metadata)
CREATE OR REPLACE VIEW client_contracts_view AS
SELECT 
    id, 
    file_name, 
    upload_date, 
    status, 
    client_id
FROM contracts;

COMMENT ON VIEW client_contracts_view IS 'Security view restricting client contract access to non-sensitive columns';
GRANT SELECT ON client_contracts_view TO role_client, role_legal_admin;

-- View 2: Reviewer Operational View (pre-joined open flags with context)
CREATE OR REPLACE VIEW reviewer_open_flags_view AS
SELECT 
    f.id AS flag_id,
    f.clause_id,
    cl.clause_number,
    cl.clause_text,
    c.file_name AS contract_file,
    rl.risk_category,
    rl.severity_weight,
    f.similarity_score,
    f.status,
    f.created_at
FROM flags f
JOIN clauses cl ON cl.id = f.clause_id
JOIN contracts c ON c.id = cl.contract_id
JOIN risk_library rl ON rl.id = f.risk_library_id
WHERE f.status = 'Open';

COMMENT ON VIEW reviewer_open_flags_view IS 'Role view providing reviewers with all context needed to triage open flags';
GRANT SELECT ON reviewer_open_flags_view TO role_reviewer, role_legal_admin;

-- View 3: System Users View (conceals sensitive password_hash column)
CREATE OR REPLACE VIEW admin_system_users_view AS
SELECT 
    id, 
    name, 
    role, 
    created_at
FROM users;

COMMENT ON VIEW admin_system_users_view IS 'Security view exposing user accounts while strictly concealing password hashes';
GRANT SELECT ON admin_system_users_view TO role_legal_admin, role_reviewer;

-- Grant CTE analytical view to Reviewer and Admin
GRANT SELECT ON unresolved_flags_by_client TO role_reviewer, role_legal_admin;
