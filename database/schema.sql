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
