# ClauseGuard: Viva & Presentation SQL Cheat-Sheet (pgAdmin 4 Ready)

---

## 1. Schema Overview: All 7 Tables (Column & Row Counts)

### 1.1 Master Summary Query: All 7 Tables, Columns & Rows
Run this query in pgAdmin 4 to display all 7 tables with their exact column and row counts:

```sql
SELECT 
    cols.table_name,
    cols.column_count,
    CASE cols.table_name
        WHEN 'users' THEN (SELECT COUNT(*) FROM users)
        WHEN 'contracts' THEN (SELECT COUNT(*) FROM contracts)
        WHEN 'clauses' THEN (SELECT COUNT(*) FROM clauses)
        WHEN 'risk_library' THEN (SELECT COUNT(*) FROM risk_library)
        WHEN 'flags' THEN (SELECT COUNT(*) FROM flags)
        WHEN 'review_history' THEN (SELECT COUNT(*) FROM review_history)
        WHEN 'risk_config' THEN (SELECT COUNT(*) FROM risk_config)
    END AS row_count
FROM (
    SELECT table_name, COUNT(*) AS column_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('users', 'contracts', 'clauses', 'risk_library', 'flags', 'review_history', 'risk_config')
    GROUP BY table_name
) cols
ORDER BY cols.table_name;
```

---

### 1.2 View Each Table & Column Structure

#### Table 1: `users` (Accounts & Roles)
```sql
-- View users columns and data types
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'users';

-- View all user records
SELECT id, name, role, created_at FROM users;
```

#### Table 2: `contracts` (Uploaded Contract Documents)
```sql
-- View contracts columns
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'contracts';

-- View contracts data
SELECT id, file_name, status, upload_date, uploaded_by, client_id FROM contracts;
```

#### Table 3: `clauses` (Extracted Clauses with 384-Dim Vectors)
```sql
-- View clauses columns
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'clauses';

-- View clauses sample data (without dumping full vectors)
SELECT id, contract_id, clause_number, LEFT(clause_text, 60) AS clause_preview, (embedding IS NOT NULL) AS has_vector 
FROM clauses 
LIMIT 5;
```

#### Table 4: `risk_library` (Catalog of 25 Predatory Provisions)
```sql
-- View risk_library columns
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'risk_library';

-- View reference patterns and severity weights (1-5)
SELECT id, risk_category, severity_weight, LEFT(clause_pattern_text, 70) AS pattern_preview 
FROM risk_library 
ORDER BY severity_weight DESC 
LIMIT 5;
```

#### Table 5: `flags` (Flags Raised on Risky Clauses)
```sql
-- View flags columns
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'flags';

-- View flagged clauses and similarity scores
SELECT id, clause_id, risk_library_id, ROUND((similarity_score * 100)::NUMERIC, 1) || '%' AS similarity, status, reviewer_id 
FROM flags;
```

#### Table 6: `review_history` (Audit Trail of Triage Decisions)
```sql
-- View review_history columns
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'review_history';

-- View audit logs
SELECT rh.id, rh.flag_id, rh.action, rh.timestamp, u.name AS reviewer_name
FROM review_history rh
JOIN users u ON u.id = rh.reviewer_id;
```

#### Table 7: `risk_config` (System Similarity Threshold Singleton)
```sql
-- View risk_config columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'risk_config';

-- View active threshold value
SELECT id, similarity_threshold FROM risk_config;
```

---

## 2. CRUD Operations

### 2.1 CREATE (Insert Operation)
Inserts a new contract record into the database.

```sql
INSERT INTO contracts (uploaded_by, client_id, file_name, status)
VALUES (1, 1, 'Master_Software_License_2026.pdf', 'Analyzed')
RETURNING id, file_name, status, upload_date;
```

### 2.2 READ (Multi-Table JOIN Query)
5-table JOIN connecting flags to contracts, clauses, risk patterns, and reviewers.

```sql
SELECT 
    f.id AS flag_id,
    c.file_name AS contract_file,
    cl.clause_number,
    LEFT(cl.clause_text, 50) AS clause_preview,
    rl.risk_category,
    rl.severity_weight,
    ROUND((f.similarity_score * 100)::NUMERIC, 1) || '%' AS similarity,
    f.status AS flag_status,
    COALESCE(rev.name, 'Unassigned') AS reviewer_name
FROM flags f
JOIN clauses cl ON cl.id = f.clause_id
JOIN contracts c ON c.id = cl.contract_id
JOIN risk_library rl ON rl.id = f.risk_library_id
LEFT JOIN users rev ON rev.id = f.reviewer_id
ORDER BY f.id DESC;
```

### 2.3 UPDATE (Modify Flag Status)
Updates an open flag to 'Cleared' (and reflects on the UI).

```sql
UPDATE flags
SET status = 'Cleared'
WHERE id = (SELECT id FROM flags WHERE status = 'Open' LIMIT 1)
RETURNING id, status;
```

### 2.4 DELETE (Cascade Integrity)
Deletes a test clause and demonstrates that child records cascade automatically.

```sql
-- Step 1: Insert temporary test clause
INSERT INTO clauses (contract_id, clause_number, clause_text)
VALUES (1, 'VIVA-DELETE-TEST', 'Temporary clause to test ON DELETE CASCADE');

-- Step 2: Delete test clause (cascades to flags and review logs)
DELETE FROM clauses
WHERE clause_number = 'VIVA-DELETE-TEST';

-- Step 3: Verify deletion
SELECT * FROM clauses WHERE clause_number = 'VIVA-DELETE-TEST';
```

---

## 3. Database Trigger (`trg_flag_clause_when_risky`)

Demonstrates that inserting a clause with a vector embedding automatically fires the trigger and creates an `Open` flag in the `flags` table.

```sql
-- Step 1: Check current flags count before
SELECT COUNT(*) AS total_flags_before FROM flags;

-- Step 2: Insert a clause with a predatory vector (Trigger fires here!)
INSERT INTO clauses (contract_id, clause_number, clause_text, embedding)
VALUES (
    1, 
    'TRIGGER-TEST', 
    'The supplier liability shall be unlimited and include all indirect and consequential losses.',
    (SELECT embedding FROM risk_library WHERE risk_category = 'Unlimited Liability' LIMIT 1)
);

-- Step 3: Verify the flag created automatically by the trigger
SELECT 
    f.id AS flag_id, 
    cl.clause_number, 
    rl.risk_category, 
    ROUND((f.similarity_score * 100)::NUMERIC, 1) || '%' AS similarity, 
    f.status
FROM flags f
JOIN clauses cl ON cl.id = f.clause_id
JOIN risk_library rl ON rl.id = f.risk_library_id
WHERE cl.clause_number = 'TRIGGER-TEST';
```

---

## 4. Stored Functions

### 4.1 `calculate_risk_score(clause_id)`
Computes a normalized composite risk score ($0 - 100$) combining cosine similarity and severity weight.

```sql
SELECT 
    cl.id AS clause_id,
    cl.clause_number,
    calculate_risk_score(cl.id) AS composite_risk_score
FROM clauses cl
WHERE cl.embedding IS NOT NULL
ORDER BY composite_risk_score DESC
LIMIT 5;
```

### 4.2 `find_similar_risks(clause_id, limit)`
Performs k-NN vector search using the `<=>` cosine distance operator and returns top matching risk patterns.

```sql
SELECT * FROM find_similar_risks(1, 3);
```

---

## 5. ACID Transaction (Reviewer Triage Workflow)

Atomically updates a flag status and writes an audit trail entry into `review_history`.

```sql
BEGIN;

-- 1. Update the flag status
UPDATE flags
SET status = 'Cleared', reviewer_id = 1
WHERE id = (SELECT id FROM flags WHERE status = 'Open' LIMIT 1);

-- 2. Insert audit trail entry
INSERT INTO review_history (flag_id, action, reviewer_id, "timestamp")
VALUES (
    (SELECT id FROM flags WHERE status = 'Cleared' ORDER BY id DESC LIMIT 1),
    'Cleared',
    1,
    NOW()
);

COMMIT;

-- Verify audit record created
SELECT * FROM review_history ORDER BY id DESC LIMIT 1;
```

---

## 6. Nested & Correlated Subqueries

### 6.1 Correlated Subquery with `WHERE EXISTS`
Finds contracts containing unresolved high-severity flags ($\text{weight} \ge 4$).

```sql
SELECT c.id, c.file_name, c.status
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
```

### 6.2 Scalar Subqueries in SELECT
Calculates clause counts and open flag counts per contract.

```sql
SELECT 
    c.id,
    c.file_name,
    (SELECT COUNT(*) FROM clauses cl WHERE cl.contract_id = c.id) AS total_clauses,
    (SELECT COUNT(*) FROM flags f 
     JOIN clauses cl2 ON cl2.id = f.clause_id 
     WHERE cl2.contract_id = c.id AND f.status = 'Open') AS open_flags
FROM contracts c;
```

---

## 7. Common Table Expressions (CTE) & View

### 7.1 Analytical CTE View: `unresolved_flags_by_client`
Aggregates open flags, average similarity, and total contracts per client using two CTEs.

```sql
SELECT 
    client_id,
    client_name,
    total_contracts,
    open_flag_count,
    avg_similarity_score,
    avg_risk_score,
    latest_flag_date
FROM unresolved_flags_by_client;
```
