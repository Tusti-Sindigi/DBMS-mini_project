CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Client', 'Reviewer', 'LegalAdmin')),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name_unique ON users(name);

CREATE TABLE IF NOT EXISTS contracts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uploaded_by BIGINT NOT NULL REFERENCES users(id),
    client_id BIGINT NOT NULL REFERENCES users(id),
    file_name TEXT,
    upload_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'Processing'
        CHECK (status IN ('Processing', 'Analyzed', 'Failed'))
);

CREATE TABLE IF NOT EXISTS clauses (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contract_id BIGINT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    clause_text TEXT NOT NULL CHECK (BTRIM(clause_text) <> ''),
    clause_number TEXT NOT NULL,
    embedding VECTOR(384),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (contract_id, clause_number)
);

CREATE TABLE IF NOT EXISTS risk_library (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    clause_pattern_text TEXT NOT NULL UNIQUE CHECK (BTRIM(clause_pattern_text) <> ''),
    risk_category TEXT NOT NULL,
    severity_weight SMALLINT NOT NULL CHECK (severity_weight BETWEEN 1 AND 5),
    embedding VECTOR(384),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flags (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    clause_id BIGINT NOT NULL REFERENCES clauses(id) ON DELETE CASCADE,
    risk_library_id BIGINT NOT NULL REFERENCES risk_library(id),
    similarity_score REAL NOT NULL CHECK (similarity_score BETWEEN -1 AND 1),
    status TEXT NOT NULL DEFAULT 'Open'
        CHECK (status IN ('Open', 'Cleared', 'Escalated')),
    reviewer_id BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS review_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    flag_id BIGINT NOT NULL REFERENCES flags(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('Cleared', 'Escalated')),
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewer_id BIGINT NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS risk_config (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    similarity_threshold REAL NOT NULL DEFAULT 0.75
        CHECK (similarity_threshold > 0 AND similarity_threshold <= 1)
);

INSERT INTO risk_config (id, similarity_threshold)
VALUES (1, 0.75)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_contracts_client ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_clauses_contract ON clauses(contract_id);
CREATE INDEX IF NOT EXISTS idx_flags_status_reviewer ON flags(status, reviewer_id);
CREATE INDEX IF NOT EXISTS idx_flags_clause ON flags(clause_id);
CREATE INDEX IF NOT EXISTS idx_review_history_flag ON review_history(flag_id);

CREATE INDEX IF NOT EXISTS idx_clauses_embedding_hnsw
    ON clauses USING hnsw (embedding vector_cosine_ops)
    WHERE embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_risk_library_embedding_hnsw
    ON risk_library USING hnsw (embedding vector_cosine_ops)
    WHERE embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION find_similar_risks(
    p_clause_id BIGINT,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    risk_library_id BIGINT,
    risk_category TEXT,
    severity_weight SMALLINT,
    similarity_score REAL
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    query_embedding VECTOR(384);
BEGIN
    SELECT c.embedding
      INTO query_embedding
      FROM clauses AS c
     WHERE c.id = p_clause_id;

    IF query_embedding IS NULL OR p_limit <= 0 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT r.id,
           r.risk_category,
           r.severity_weight,
           (1 - (r.embedding <=> query_embedding))::REAL AS similarity_score
      FROM risk_library AS r
     WHERE r.embedding IS NOT NULL
     ORDER BY r.embedding <=> query_embedding
     LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION calculate_risk_score(p_clause_id BIGINT)
RETURNS NUMERIC
LANGUAGE SQL
STABLE
AS $$
    SELECT ROUND((GREATEST(match.similarity_score, 0) * match.severity_weight / 5.0)::NUMERIC * 100, 2)
    FROM find_similar_risks(p_clause_id, 1) AS match
$$;

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

CREATE UNIQUE INDEX IF NOT EXISTS uq_flags_open_clause_pattern
    ON flags (clause_id, risk_library_id)
    WHERE status = 'Open';

DROP TRIGGER IF EXISTS trg_flag_clause_when_risky ON clauses;
CREATE TRIGGER trg_flag_clause_when_risky
AFTER INSERT OR UPDATE OF embedding ON clauses
FOR EACH ROW
EXECUTE FUNCTION flag_clause_when_risky();

-- Security Views
CREATE OR REPLACE VIEW client_contracts_view AS
SELECT id, file_name, upload_date, status, client_id
FROM contracts;

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

CREATE OR REPLACE VIEW admin_system_users_view AS
SELECT id, name, role, created_at
FROM users;

CREATE OR REPLACE VIEW unresolved_flags_by_client AS
WITH client_flags AS (
    SELECT
        c.client_id,
        COUNT(f.id) AS open_flag_count,
        ROUND(AVG(f.similarity_score)::NUMERIC, 4) AS avg_similarity_score,
        ROUND(AVG(GREATEST(f.similarity_score, 0) * rl.severity_weight / 5.0 * 100)::NUMERIC, 2) AS avg_risk_score,
        MAX(f.created_at) AS latest_flag_date
    FROM flags f
    JOIN clauses cl ON cl.id = f.clause_id
    JOIN contracts c ON c.id = cl.contract_id
    JOIN risk_library rl ON rl.id = f.risk_library_id
    WHERE f.status = 'Open'
    GROUP BY c.client_id
),
client_contracts AS (
    SELECT client_id, COUNT(id) AS total_contracts
    FROM contracts
    GROUP BY client_id
)
SELECT
    u.id AS client_id,
    u.name AS client_name,
    COALESCE(cc.total_contracts, 0) AS total_contracts,
    COALESCE(cf.open_flag_count, 0) AS open_flag_count,
    cf.avg_similarity_score,
    cf.avg_risk_score,
    cf.latest_flag_date
FROM users u
LEFT JOIN client_contracts cc ON cc.client_id = u.id
LEFT JOIN client_flags cf ON cf.client_id = u.id
WHERE u.role = 'Client';

-- Roles and RBAC Privileges
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_client') THEN
        CREATE ROLE role_client WITH NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_reviewer') THEN
        CREATE ROLE role_reviewer WITH NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_legal_admin') THEN
        CREATE ROLE role_legal_admin WITH NOLOGIN;
    END IF;
END $$;

GRANT role_client, role_reviewer, role_legal_admin TO postgres;

GRANT USAGE ON SCHEMA public TO role_client, role_reviewer, role_legal_admin;

GRANT SELECT, INSERT ON contracts TO role_client;
GRANT SELECT, INSERT ON clauses TO role_client;
GRANT SELECT ON flags TO role_client;
GRANT SELECT ON risk_library TO role_client;
GRANT SELECT ON risk_config TO role_client;
GRANT SELECT (id, name, role, created_at) ON users TO role_client;
REVOKE ALL ON review_history FROM role_client;

GRANT SELECT ON contracts, clauses, risk_library, risk_config TO role_reviewer;
GRANT SELECT, UPDATE ON flags TO role_reviewer;
GRANT SELECT, INSERT ON review_history TO role_reviewer;
GRANT SELECT (id, name, role, created_at) ON users TO role_reviewer;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO role_legal_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO role_legal_admin;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO role_legal_admin;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO role_client, role_reviewer;

GRANT EXECUTE ON FUNCTION find_similar_risks(BIGINT, INTEGER) TO role_client, role_reviewer, role_legal_admin;
GRANT EXECUTE ON FUNCTION calculate_risk_score(BIGINT) TO role_client, role_reviewer, role_legal_admin;

GRANT SELECT ON client_contracts_view TO role_client, role_legal_admin;
GRANT SELECT ON reviewer_open_flags_view TO role_reviewer, role_legal_admin;
GRANT SELECT ON admin_system_users_view TO role_legal_admin, role_reviewer;
GRANT SELECT ON unresolved_flags_by_client TO role_reviewer, role_legal_admin;

