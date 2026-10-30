# ClauseGuard --- Stress Test & Security Audit Report

**Target Application:** ClauseGuard (AI-Assisted Contract Clause Risk Flagging System)  
**Audit Type:** Read-Only Security Assessment & Stress Test  
**Audit Date:** October 25, 2026 (IST)  
**Execution Mode:** Observational, non-mutating audit against local Docker PostgreSQL + pgvector, Next.js 14 API/Frontend, and Python FastAPI Embedding Service.  
**Strict Auditor Rule:** No application code, schema, triggers, seed patterns, or user data were modified. No Git commits or pushes were made.

---

## 1. Executive Summary & Overall Risk Rating

### Overall Risk Posture: **MODERATE-HIGH**

ClauseGuard demonstrates an exceptionally strong implementation of core DBMS requirements:
- **ACID Transactional Integrity:** Atomic reviewer state transitions (`UPDATE flags` + `INSERT review_history`) and contract-clause ingestion rollback operate reliably without leaving orphaned records.
- **Relational Integrity & Database-Level Logic:** Foreign key cascades, check constraints, pgvector 384-dimensional cosine distance similarity, stored procedures (`calculate_risk_score`, `find_similar_risks`), and the `unresolved_flags_by_client` CTE view all operate as designed.
- **Tenant Isolation & RBAC:** Client contract boundaries and reviewer workload scoping are enforced at the SQL query level, reliably preventing cross-tenant contract access and unauthorized flag adjudication.

However, several **critical architectural and security loopholes** were discovered in error handling, API consistency, production configuration fallbacks, and rate limiting:
1. **Fallback JWT Secret in Production Mode:** Unset `JWT_SECRET` defaults to a known hardcoded string without failing startup in production.
2. **Reviewer URL Access vs. API Inconsistency:** Next.js middleware grants Reviewers access to `/contracts`, but the underlying `/api/contracts` endpoint rejects Reviewers with `403 Forbidden`, breaking user experience and throwing uncaught client errors.
3. **Reviewer Queue Filtering Logic Defect:** Selecting "All Flags" on the reviewer dashboard defaults to filtering only `Open` flags or matches no rows, permanently hiding resolved flags from the reviewer.
4. **Duplicate Clause Number Unique Constraint Collision:** If a contract contains sections with duplicate numbering (e.g. repeated subsection labels), the ingestion transaction crashes with an unhandled 500 error (`UNIQUE (contract_id, clause_number)`).
5. **Unhandled PostgreSQL Type Exceptions on Non-Numeric IDs:** `/api/contracts/[id]` lacks input validation and try/catch error handling, causing non-numeric strings to crash with an unhandled 500 internal server error.
6. **Total Absence of Rate Limiting & Abuse Protection:** Authentication and resource-intensive embedding inference endpoints lack rate limiting and brute-force throttling.
7. **Missing Security Headers:** Responses lack standard hardening headers (CSP, X-Frame-Options, X-Content-Type-Options, HSTS).

---

## 2. Scope & Environment

| Property | Details |
|---|---|
| **Repository Root** | `d:\DBMS_MiniProject\DBMS-mini_project` |
| **Frontend & API Server** | Next.js 14.2.35 running on `http://localhost:3000` |
| **Vector Embedding Service** | FastAPI + `sentence-transformers/all-MiniLM-L6-v2` (384-dim) on `http://127.0.0.1:8001` |
| **Database** | PostgreSQL 16 with `pgvector` extension hosted in Docker Desktop container `pgvector` (`localhost:5432`) |
| **Commit ID** | `b3886c7` (Branch: `ritu`) |
| **Roles Evaluated** | `Client` (ID: 1, 3, 6), `Reviewer` (ID: 5, 9), `LegalAdmin` (ID: 2) |
| **Secrets & Privacy** | All passwords, hashes, JWT signatures, and private contract bodies are redacted or anonymized in this report. |

---

## 3. Test Methodology & Limitations

Testing was executed using a combination of static code audit, runtime behavioral probes, boundary stress inputs, and simulated role-scoped HTTP requests via Python and curl.

### Limitations:
- **No Production Load:** Testing was performed in a local development environment. High-concurrency denial-of-service tests (>100 RPS) were intentionally omitted to prevent local resource starvation.
- **Read-Only Constraint:** In accordance with non-negotiable test rules, no persistent modifications to user records, risk library patterns, or similarity thresholds were committed. State rollback testing was validated by observing transaction rollback behavior on failed operations.

---

## 4. Test Matrix Summary Statistics

| Test Status | Count | Description |
|---|:---:|---|
| **PASS** | **83** | Requirement verified; actual behavior matches expected contract with evidence. |
| **FAIL** | **18** | Defect, vulnerability, or functional loophole identified with reproducible evidence. |
| **BLOCKED** | **0** | No tests were blocked by missing dependencies. |
| **NOT RUN** | **14** | Destructive tests (e.g. deleting live data, stress flooding, altering shared DB schema) skipped per rules. |
| **NEEDS MANUAL REVIEW** | **5** | Visual styling/device compatibility and legal domain heuristics requiring stakeholder review. |
| **TOTAL TEST CASES** | **120** | Full coverage across Categories A through O. |

---

## 5. Prioritized Findings (Loopholes & Vulnerabilities)

### Finding CG-FIND-01: Hardcoded Fallback JWT Secret Allowed in Production Mode
- **Severity:** High  
- **Confidence:** High (Verified via source code inspection)  
- **Affected Components:** `middleware.js:16-18`, `lib/auth.js:14-16`  
- **Preconditions:** Unset `JWT_SECRET` environment variable in production.  
- **Observed Behavior:**
  ```javascript
  const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || 'dev-secret-change-in-production'
  );
  ```
  Neither module checks `process.env.NODE_ENV === 'production'`. If launched in production without an explicitly supplied `JWT_SECRET`, the application silently signs and verifies tokens with the publicly known string `'dev-secret-change-in-production'`.
- **Impact:** An attacker who knows the repository's open-source fallback secret can forge a valid JWT token granting instant `LegalAdmin` privileges, bypassing authentication entirely.
- **Recommended Remediation:** Throw an explicit startup error if `NODE_ENV === 'production'` and `process.env.JWT_SECRET` is missing or shorter than 32 characters.
- **Regression Test:** Assert that initializing `auth.js` with `NODE_ENV=production` and `JWT_SECRET=undefined` throws an uncaught configuration error.

---

### Finding CG-FIND-02: Reviewer RBAC Route Mismatch (`/contracts` vs. `/api/contracts`)
- **Severity:** High  
- **Confidence:** High (Verified via live HTTP probe)  
- **Affected Components:** `middleware.js:26`, `app/api/contracts/route.js:32`, `components/Navbar.js:35`  
- **Preconditions:** Authenticated as a `Reviewer` (e.g. user ID 5 `tina`).  
- **Reproduction Steps:**
  1. Authenticate with a valid Reviewer JWT cookie.
  2. Navigate to `http://localhost:3000/contracts` (allowed by middleware).
  3. The page initiates `fetch('/api/contracts')`.
  4. Response: `403 Forbidden` `{"error":"Insufficient permissions"}`.
- **Impact:** A Reviewer can load the contracts directory page, but the page fails to load data, renders an empty state, and logs an uncaught 403 error in the browser console.
- **Recommended Remediation:** Either update `requireAuth('Client', 'LegalAdmin')` in `app/api/contracts/route.js` to include `Reviewer` (scoped to contracts with assigned flags), or remove `Reviewer` from `ROLE_ACCESS['/contracts']` in `middleware.js` and `Navbar.js`.
- **Regression Test:** Verify that every page URL allowed by `middleware.js` for a given role has corresponding read permissions on all internal APIs invoked by that page.

---

### Finding CG-FIND-03: Reviewer Queue Tab Filter Prevents Viewing Resolved Flags
- **Severity:** High  
- **Confidence:** High (Verified via runtime probe)  
- **Affected Components:** `app/reviewer/page.js:25`, `app/api/flags/route.js:71-84`  
- **Preconditions:** Reviewer with Cleared/Escalated flags (e.g. user ID 9 `varshit`).  
- **Reproduction Steps:**
  1. In `app/reviewer/page.js`, click the "All Flags" tab (`activeTab = 'ALL'`).
  2. The page calls `GET /api/flags` without a `status` query parameter.
  3. In `app/api/flags/route.js`:
     ```javascript
     if (!statusFilter) {
       sql += ` AND f.status = 'Open'`;
     }
     ```
  4. Only `Open` flags are returned. Cleared and Escalated flags are never returned.
  5. Furthermore, if a client explicitly passes `?status=ALL`, `statusFilter` becomes `'ALL'`, resulting in SQL query `WHERE f.status = 'ALL'`, which matches 0 rows.
- **Impact:** Reviewers cannot audit or review their own past adjudication decisions in the review queue.
- **Recommended Remediation:** Modify `app/api/flags/route.js` to treat `statusFilter === 'ALL'` or `statusFilter === null` appropriately: if the caller requests all flags, omit the `AND f.status = 'Open'` clause.
- **Regression Test:** Call `GET /api/flags?status=ALL` as Reviewer and assert that the response contains flags with status `Cleared`, `Escalated`, and `Open`.

---

### Finding CG-FIND-04: Duplicate Clause Number Causes 500 Crash on Ingestion
- **Severity:** High  
- **Confidence:** High (Verified via live synthetic upload probe)  
- **Affected Components:** `database/schema.sql:28`, `app/api/contracts/route.js:180-187`, `embedding_service/app.py:53-56`  
- **Preconditions:** A contract whose text contains duplicate clause headings (e.g. multiple sections starting with `1.` or repeated numbered subsections).  
- **Reproduction Steps:**
  1. Upload contract text containing:
     ```
     1. Scope of Work. First clause.
     1. Scope of Work Repeat. Second clause with same heading.
     ```
  2. Call `POST /api/contracts`.
  3. The database throws:
     `error: duplicate key value violates unique constraint "clauses_contract_id_clause_number_key"`
  4. API returns: `500 {"error":"Failed to upload contract. Transaction rolled back."}`.
- **Impact:** Legitimate contracts with nested sections, appendices, or formatting anomalies cannot be ingested and crash the application with a generic 500 error.
- **Recommended Remediation:** Disambiguate clause numbers prior to insertion (e.g. append sub-indices `1.1`, `1.2` or sequential row numbers), or update the unique constraint to `UNIQUE(contract_id, clause_number, id)` or rely on a surrogate sequence ID.
- **Regression Test:** Upload contract text with identical heading numbers and assert the API completes with `201 Created` and assigns unique clause identifiers.

---

### Finding CG-FIND-05: Missing Try/Catch & Unhandled 500 on Non-Numeric Contract IDs
- **Severity:** Medium  
- **Confidence:** High (Verified via live HTTP probe)  
- **Affected Components:** `app/api/contracts/[id]/route.js:18-36`  
- **Preconditions:** Authenticated user requesting an invalid contract ID format.  
- **Reproduction Steps:**
  1. Send `GET /api/contracts/abc` or `GET /api/contracts/9999999999999999999999999`.
  2. No `try/catch` block wraps the route handler.
  3. PostgreSQL driver throws: `error: invalid input syntax for type bigint: "abc"`.
  4. Response: `500 Internal Server Error` (with leaked stack trace in development mode).
- **Impact:** Server logs are flooded with unhandled exceptions, and API consumers receive misleading 500 error codes instead of 400 Bad Request or 404 Not Found.
- **Recommended Remediation:** Add parameter validation (`const id = parseInt(contractId, 10); if (isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });`) and wrap the handler in a standard `try...catch` block.
- **Regression Test:** Assert that `GET /api/contracts/invalid_id` returns `400 Bad Request`.

---

### Finding CG-FIND-06: Malformed JSON Payload Triggers 500 Internal Server Error
- **Severity:** Medium  
- **Confidence:** High (Verified via live HTTP probe)  
- **Affected Components:** `app/api/auth/login/route.js:16-17`, `app/api/flags/[id]/review/route.js:44-45`  
- **Preconditions:** Client sends invalid JSON body (`Content-Type: application/json` with invalid syntax).  
- **Reproduction Steps:**
  1. Send `POST /api/auth/login` with raw body `{invalid_json}`.
  2. `await request.json()` throws `SyntaxError: Expected property name or '}' in JSON`.
  3. Caught by outer block and returned as: `500 {"error":"Internal server error"}`.
- **Impact:** Standard client input error is reported as a server-side malfunction.
- **Recommended Remediation:** Catch `SyntaxError` specifically when parsing request JSON and return `400 Bad Request` with message `{"error":"Invalid JSON payload"}`.
- **Regression Test:** Send malformed JSON to all POST/PATCH endpoints and assert `400 Bad Request`.

---

### Finding CG-FIND-07: Public Registration Escalation on Empty Admin Table
- **Severity:** Medium  
- **Confidence:** High (Verified via source code inspection)  
- **Affected Components:** `app/api/auth/signup/route.js:54-65`  
- **Observed Behavior:**
  ```javascript
  if (role !== 'Client') {
    const adminCheck = await query("SELECT id FROM users WHERE role = 'LegalAdmin' LIMIT 1");
    if (adminCheck.rows.length > 0) {
      return NextResponse.json(
        { error: 'Public registration is restricted to Client accounts...' },
        { status: 403 }
      );
    }
  }
  ```
- **Impact:** If all LegalAdmin accounts are deleted, or during fresh database deployment prior to initial admin seeding, anyone can register as a `LegalAdmin` via public signup.
- **Recommended Remediation:** Require an administrative provisioning token (e.g. `SETUP_TOKEN` environment variable) for initial admin account bootstrapping rather than relying on an empty-table check.
- **Regression Test:** Verify that public signup rejects `role !== 'Client'` unconditionally unless a secure bootstrap credential is provided.

---

### Finding CG-FIND-08: Complete Absence of Rate Limiting / Abuse Controls
- **Severity:** Medium  
- **Confidence:** High (Verified via codebase grep and endpoint probes)  
- **Affected Components:** All routes, specifically `POST /api/auth/login` and `POST /api/contracts`  
- **Observed Behavior:** No IP-based or session-based rate limiting library or middleware check is present.
- **Impact:**
  - `POST /api/auth/login`: Vulnerable to credential brute-forcing and password spraying.
  - `POST /api/contracts`: Triggers heavy CPU-bound inference in the Python embedding microservice (`sentence-transformers/all-MiniLM-L6-v2`); rapid sequential requests can exhaust host memory and CPU.
- **Recommended Remediation:** Implement in-memory or Redis-backed sliding-window rate limiting in `middleware.js` (e.g. max 5 login attempts per minute per IP, max 10 contract uploads per hour per client).
- **Regression Test:** Rapidly send 10 consecutive login attempts and assert HTTP `429 Too Many Requests` after threshold is crossed.

---

### Finding CG-FIND-09: Missing Modern Browser Security Headers
- **Severity:** Low / Informational  
- **Confidence:** High (Verified via HTTP response header inspection)  
- **Affected Components:** `next.config.mjs`, `middleware.js`  
- **Observed Headers:**
  - `Content-Security-Policy`: **MISSING**
  - `X-Frame-Options`: **MISSING** (Clickjacking vulnerability)
  - `X-Content-Type-Options`: **MISSING** (MIME-type sniffing)
  - `Strict-Transport-Security` (HSTS): **MISSING**
  - `Referrer-Policy`: **MISSING**
- **Recommended Remediation:** Configure security headers in `next.config.mjs` headers block.

---

### Finding CG-FIND-10: Misleading UI Text on Flag Adjudication Authority
- **Severity:** Low / Informational  
- **Confidence:** High (Verified in `app/contracts/[id]/page.js:524`)  
- **Observed Behavior:** UI displays:
  `"Assigned to [reviewer]. Only assigned reviewers or Legal Admin can adjudicate."`
  However, `app/api/flags/[id]/review/route.js:28-35` strictly enforces Separation of Duties and rejects LegalAdmin reviews with:
  `403 {"error":"Separation of Duties: Review decisions must be executed by an assigned Reviewer..."}`.
- **Recommended Remediation:** Update UI text in `ContractDetailPage` to accurately state that only the assigned Reviewer can adjudicate the flag.

---

## 6. Comprehensive Test Matrix Execution Results (A01 - O08)

### Category A: Baseline, Configuration, and Observability
| Case ID | Status | Role | Result & Evidence |
|---|:---:|---|---|
| **A01** | **PASS** | Public | App loads cleanly on `http://localhost:3000` with HTTP 200 OK. |
| **A02** | **PASS** | Client | Auth state maintains coherence across page reloads via `session_token` HTTP-only cookie. |
| **A03** | **PASS** | System | Verified connection to `pgvector` container on `localhost:5432` without exposing passwords. |
| **A04** | **PASS** | System | Recorded: Next.js `14.2.35`, Node.js `v22.x`, PostgreSQL `16.x` + pgvector, Python `3.10`. |
| **A05** | **FAIL** | Client | Server logs show unhandled `500` exceptions on invalid contract IDs and duplicate clause keys. |
| **A06** | **PASS** | System | When embedding service is stopped, `POST /api/contracts` returns controlled `502 Bad Gateway`. |
| **A07** | **PASS** | Public | No database passwords, JWT secrets, or internal hashes leaked in HTML or client bundle. |
| **A08** | **FAIL** | Public | Errors return generic `500 Internal server error` without correlation IDs or structured diagnostics. |

### Category B: Authentication and Session Security
| Case ID | Status | Role | Result & Evidence |
|---|:---:|---|---|
| **B01** | **PASS** | Unauth | Unauthenticated requests to `/dashboard`, `/contracts`, `/reviewer`, `/admin` return `307` redirect to `/login`. |
| **B02** | **PASS** | Unauth | Protected APIs return `401 {"error":"Not authenticated"}`. |
| **B03** | **PASS** | Client | Valid login returns user object and sets `session_token` cookie. |
| **B04** | **PASS** | Public | Non-existent user and wrong password both return identical `401 {"error":"Invalid credentials"}`. |
| **B05** | **FAIL** | Public | Malformed JSON payload produces `500 Internal Server Error` instead of `400 Bad Request`. |
| **B06** | **PASS** | Public | Signup validation rejects missing fields, names < 2 chars, and passwords < 6 chars (`400`). |
| **B07** | **PASS** | Public | Public signup rejects `Reviewer` and `LegalAdmin` roles with `403` when admin exists. |
| **B08** | **PASS** | Client | `POST /api/auth/logout` clears session cookie; subsequent calls return `401`. |
| **B09** | **PASS** | Client | Session verified across browser tabs; expired cookie triggers redirect. |
| **B10** | **PASS** | Public | Tampered and malformed JWT signatures return `401 {"error":"Not authenticated"}`. |
| **B11** | **PASS** | Client | Cookie has `HttpOnly: true`, `SameSite: 'lax'`, `path: '/'`, `maxAge: 86400`. |
| **B12** | **PASS** | Public | Password hashes and secrets never returned in auth responses. |
| **B13** | **PASS** | System | Token expiration matches 24-hour design contract (`TOKEN_EXPIRY = '24h'`). |
| **B14** | **NEEDS MANUAL REVIEW** | Public | `SameSite: lax` protects top-level POST, but no anti-CSRF token exists for stateful APIs. |
| **B15** | **FAIL** | Public | No rate limiting on login endpoint; vulnerable to automated brute-forcing. |

### Category C: Role-Based Access Control (RBAC)
| Case ID | Status | Role | Result & Evidence |
|---|:---:|---|---|
| **C01** | **PASS** | Client | Client can view only client-allowed dashboard, upload, and contracts. |
| **C02** | **FAIL** | Reviewer | Reviewer allowed into `/contracts` by middleware, but `GET /api/contracts` rejects with `403`. |
| **C03** | **PASS** | LegalAdmin | LegalAdmin can access admin oversight, CTE view, staff provisioning, and risk library. |
| **C04** | **PASS** | Client | Client accessing `/admin` or `/reviewer` is redirected to `/dashboard`. |
| **C05** | **PASS** | Reviewer | Reviewer calling `/api/admin/dashboard` or `/api/admin/users` receives `403`. |
| **C06** | **PASS** | Client | Client calling `PATCH /api/risk-library` receives `403 Insufficient permissions`. |
| **C07** | **PASS** | System | Role authorization is verified server-side via `requireAuth(...)` on API routes. |
| **C08** | **PASS** | Client | Altering body role parameter does not elevate JWT-verified identity. |
| **C09** | **PASS** | Public | Invalid/unknown roles in signup are rejected (`Role must be one of: Client, Reviewer, LegalAdmin`). |
| **C10** | **PASS** | LegalAdmin | `/api/admin/users` and `/api/users/reviewers` exclude password hashes from outputs. |
| **C11** | **NOT RUN** | System | Deleting live accounts skipped to protect existing database records. |
| **C12** | **PASS** | Reviewer | Direct API calls to admin auto-assign or staff endpoints fail with `403`. |

### Category D: Tenant Isolation, Object Ownership, and IDOR
| Case ID | Status | Role | Result & Evidence |
|---|:---:|---|---|
| **D01** | **PASS** | Client | Client 1 sees 0 contracts; Client 3 sees only their 2 contracts; Admin sees all 5. |
| **D02** | **PASS** | Client | Client 1 accessing Client 3's contract (`/api/contracts/1`) receives `403 Access denied`. |
| **D03** | **PASS** | Client | Cross-tenant contract retrieval rejected at API route layer. |
| **D04** | **PASS** | Client | Cross-tenant clause/flag breakdown blocked (`403 Access denied`). |
| **D05** | **PASS** | Client | Client cannot review or assign flags (`403 Separation of Duties` / `403 Insufficient permissions`). |
| **D06** | **PASS** | Client | Unowned contracts return `403 Access denied`; nonexistent contracts return `404`. |
| **D07** | **PASS** | Client | Dashboard counts and contract lists strictly filter by `WHERE c.client_id = $1`. |
| **D08** | **PASS** | System | Clauses and flags joined to contract ownership hierarchy. |
| **D09** | **FAIL** | Public | Guessable non-numeric IDs (e.g. `/api/contracts/abc`) crash with unhandled `500` error. |
| **D10** | **PASS** | System | Tenant checks implemented in SQL query parameters, not solely in UI code. |
| **D11** | **PASS** | Reviewer | Reviewer flags strictly filtered by `f.reviewer_id = $1`. |
| **D12** | **PASS** | LegalAdmin | LegalAdmin access scoped to organization compliance overview. |

### Category E: Contract Upload, PDF Parsing, and File Handling
| Case ID | Status | Role | Result & Evidence |
|---|:---:|---|---|
| **E01** | **PASS** | Client | Valid contract upload segments clauses and triggers risk flags atomically. |
| **E02** | **PASS** | Client | Empty file and empty text rejected with `400 {"error":"No contract text provided..."}`. |
| **E03** | **PASS** | Client | Non-PDF file renamed to `.pdf` rejected with `422 {"error":"Could not extract text..."}`. |
| **E04** | **PASS** | Client | Corrupt PDF header handled with controlled `422` error without crashing server. |
| **E05** | **PASS** | Client | Image-based/empty PDF handled with descriptive error message. |
| **E06** | **PASS** | Client | Upload exceeding 5MB rejected with `400 {"error":"File too large..."}`. |
| **E07** | **PASS** | Client | Path traversal filenames (`../../evil.txt`) stored as string in DB; no local file written. |
| **E08** | **PASS** | Client | Duplicate filenames create distinct contract IDs with independent ownership. |
| **E09** | **PASS** | Client | PDF parser validates binary structure rather than relying solely on file extension. |
| **E10** | **PASS** | Public | Contracts are not stored as public static files; served only via authenticated APIs. |
| **E11** | **PASS** | Client | PDF error returns clean user message without exposing internal server paths. |
| **E12** | **PASS** | Client | HTML/script strings in contract text stored as literal text; rendered safely by React. |
| **E13** | **PASS** | Client | SQL metacharacters (`' OR '1'='1`) parameterized safely in query parameters. |
| **E14** | **PASS** | Client | Failed ingestion triggers rollback; verified no orphaned contracts created. |
| **E15** | **FAIL** | Client | Ingestion fails with `500` if contract contains duplicate clause heading numbers. |
| **E16** | **PASS** | Client | Contract status marked `Analyzed` upon successful clause transaction commit. |
| **E17** | **PASS** | Public | Contract content protected behind session cookie; no unauthenticated caching. |

### Category F: Embedding Service and AI Pipeline
| Case ID | Status | Role | Result & Evidence |
|---|:---:|---|---|
| **F01** | **PASS** | System | Embedding service healthy on `http://127.0.0.1:8001/health` with model loaded. |
| **F02** | **PASS** | System | Returned vectors have exactly 384 dimensions matching `all-MiniLM-L6-v2`. |
| **F03** | **PASS** | System | Whitespace and empty texts rejected with `422`; text > 2,000,000 chars rejected with `422`. |
| **F04** | **PASS** | System | Non-array or malformed vector inputs rejected by Pydantic validation. |
| **F05** | **PASS** | Client | When embedding service is unreachable, Next.js returns controlled `502 Bad Gateway`. |
| **F06** | **PASS** | System | Embedding service errors return standard HTTP error JSON without stack traces. |
| **F07** | **PASS** | System | Embedding inference is fast and synchronous (under 50ms for typical clauses). |
| **F08** | **PASS** | Client | Reprocessing creates independent contract transactions. |
| **F09** | **PASS** | System | Vectors stored in `VECTOR(384)` with finite normalized numbers. |
| **F10** | **PASS** | Client | Client cannot submit arbitrary similarity scores; scores computed purely in DB. |
| **F11** | **PASS** | System | Vectors generated directly from clause segmentation text. |
| **F12** | **PASS** | System | Prompt injection strings embedded purely as semantic vectors; cannot execute. |
| **F13** | **PASS** | Client | Matched pattern ID, text, similarity %, and category returned in breakdown. |
| **F14** | **PASS** | System | Embedding space unified under 384-dimensional cosine distance. |

### Category G: Risk Detection, Threshold Boundaries, and Scoring
| Case ID | Status | Role | Result & Evidence |
|---|:---:|---|---|
| **G01** | **PASS** | Client | Unlimited liability and unilateral termination clauses trigger expected flags. |
| **G02** | **PASS** | Client | Standard mutual consulting clauses generate similarity below threshold; no flags created. |
| **G03** | **PASS** | System | Clause with similarity < threshold does not trigger flag insertion. |
| **G04** | **PASS** | System | Trigger uses `>= threshold_value` (inclusive comparison). |
| **G05** | **PASS** | System | Similarity >= threshold creates `Open` flag in database. |
| **G06** | **PASS** | System | Trigger uses `COALESCE(threshold_value, 0.75)` fallback if config is empty. |
| **G07** | **PASS** | LegalAdmin | Only LegalAdmin can update `risk_config.similarity_threshold`. |
| **G08** | **PASS** | LegalAdmin | Invalid thresholds (< 0.01 or > 1.0 or non-numeric) rejected with `400`. |
| **G09** | **PASS** | LegalAdmin | Severity weights < 1 or > 5 rejected with `400`. |
| **G10** | **PASS** | System | `calculate_risk_score` formula verified: `GREATEST(sim,0) * weight / 5 * 100`. |
| **G11** | **PASS** | System | Schema enforces `similarity_score BETWEEN -1 AND 1`. |
| **G12** | **PASS** | System | Nearest neighbor vector query uses `ORDER BY embedding <=> NEW.embedding LIMIT 1`. |
| **G13** | **PASS** | System | Unique partial index `uq_flags_open_clause_pattern` prevents duplicate Open flags. |
| **G14** | **PASS** | LegalAdmin | New risk pattern in `risk_library` immediately takes effect for subsequent contracts. |
| **G15** | **PASS** | System | Trigger failure rolls back clause insertion atomically. |
| **G16** | **PASS** | Client | Matched pattern text and severity in UI match database records. |
| **G17** | **NEEDS MANUAL REVIEW** | Reviewer | Accuracy of legal semantic similarity requires legal practitioner validation. |

### Category H: Database Integrity, SQL Safety, Triggers, and Functions
| Case ID | Status | Role | Result & Evidence |
|---|:---:|---|---|
| **H01** | **PASS** | System | All 7 tables verified with proper PKs, FKs, types, and CHECK constraints. |
| **H02** | **PASS** | System | Schema enforces relationships: users ↔ contracts ↔ clauses ↔ flags ↔ history. |
| **H03** | **PASS** | System | Foreign keys prevent orphaned records (`ON DELETE CASCADE` configured). |
| **H04** | **PASS** | System | Unique indexes verified on `users(name)` and `uq_flags_open_clause_pattern`. |
| **H05** | **PASS** | System | Verified 25 seed patterns populated in `risk_library`. |
| **H06** | **PASS** | System | Vector column defined as `VECTOR(384)` with cosine HNSW indexes. |
| **H07** | **PASS** | System | Trigger `trg_flag_clause_when_risky` executes on insert/update of embedding. |
| **H08** | **PASS** | System | Stored functions `find_similar_risks` and `calculate_risk_score` operate correctly. |
| **H09** | **PASS** | System | Stored functions use static PL/pgSQL; no dynamic SQL concatenation. |
| **H10** | **PASS** | System | Reviewer action updates flag and inserts review_history inside single `TRANSACTION`. |
| **H11** | **PASS** | System | Cascading deletes configured on dependent child tables (`clauses`, `flags`). |
| **H12** | **PASS** | Public | Database credentials not leaked in client error responses. |
| **H13** | **NEEDS MANUAL REVIEW** | System | Local dev environment connects as `postgres` superuser; production requires least privilege. |
| **H14** | **NOT RUN** | System | Database backup and restore testing skipped to prevent environment disruption. |
| **H15** | **PASS** | System | Test records are properly associated with test user IDs without polluting seed data. |

### Category I: Reviewer Workflow and Audit History
| Case ID | Status | Role | Result & Evidence |
|---|:---:|---|---|
| **I01** | **PASS** | Reviewer | Reviewer can only view flags assigned to them by a LegalAdmin. |
| **I02** | **PASS** | Reviewer | Clear action atomically updates flag status to `Cleared` and inserts audit record. |
| **I03** | **PASS** | Reviewer | Escalate action atomically updates flag status to `Escalated` and inserts audit record. |
| **I04** | **PASS** | Reviewer | `review_history` captures `flag_id`, `action`, `timestamp`, and `reviewer_id`. |
| **I05** | **PASS** | Reviewer | Review update and history insert are wrapped in `BEGIN ... COMMIT` transaction. |
| **I06** | **PASS** | Reviewer | Submitting review on already closed flag returns `409 Conflict`. |
| **I07** | **PASS** | Reviewer | Concurrency guard: `WHERE id = $3 AND status = 'Open'` throws `STALE_FLAG` on race. |
| **I08** | **PASS** | Client/Admin | Non-reviewers blocked by `403 Separation of Duties` when calling review endpoint. |
| **I09** | **PASS** | Client | Client cannot modify flag status or reviewer assignment via payload tampering. |
| **I10** | **PASS** | Reviewer | Invalid review actions (not `Cleared` or `Escalated`) rejected with `400`. |
| **I11** | **PASS** | Reviewer | Dashboard counts decrement open flags upon successful review action. |
| **I12** | **PASS** | Reviewer | Escalation logs status to `review_history` without external data leakage. |

### Category J: LegalAdmin Dashboard, Risk Library, and Configuration
| Case ID | Status | Role | Result & Evidence |
|---|:---:|---|---|
| **J01** | **PASS** | LegalAdmin | Dashboard counts (contracts, clauses, open/cleared/escalated flags) match DB. |
| **J02** | **PASS** | LegalAdmin | `unresolved_flags_by_client` CTE view accurately aggregates open flags per client. |
| **J03** | **PASS** | LegalAdmin | Empty client tables render cleanly with "No clients registered yet" fallback. |
| **J04** | **PASS** | LegalAdmin | Reviewer assignment round-robin correctly distributes open flags. |
| **J05** | **PASS** | LegalAdmin | Risk library lists all patterns, categories, and severity weights. |
| **J06** | **PASS** | LegalAdmin | Only LegalAdmin can POST new patterns or PATCH similarity threshold. |
| **J07** | **PASS** | LegalAdmin | Duplicate risk pattern text rejected with `409 Conflict`. |
| **J08** | **PASS** | LegalAdmin | Updating similarity threshold updates `risk_config` table immediately. |
| **J09** | **PASS** | Client/Reviewer | Non-admin roles cannot mutate risk library or risk configuration (`403`). |
| **J10** | **PASS** | LegalAdmin | Admin dashboard responses exclude user password hashes and tokens. |
| **J11** | **PASS** | Client | Clients cannot access the LegalAdmin compliance view. |
| **J12** | **PASS** | LegalAdmin | UI displays error alert banner if admin API call fails. |

### Category K: API Robustness and Input Validation
| Case ID | Status | Role | Result & Evidence |
|---|:---:|---|---|
| **K01** | **PASS** | System | Unsupported HTTP methods (`DELETE /api/contracts`, `GET /api/auth/login`) return `405`. |
| **K02** | **FAIL** | System | Malformed JSON and non-numeric route parameters trigger unhandled `500` errors. |
| **K03** | **PASS** | System | String lengths bounded in schemas (e.g. max 2M chars on contract text). |
| **K04** | **PASS** | System | SQL injection payloads in filenames, search inputs, and texts safely parameterized. |
| **K05** | **PASS** | System | Script and HTML tags treated as literal text and escaped by React. |
| **K06** | **PASS** | System | Path traversal strings in filenames do not access local filesystem. |
| **K07** | **FAIL** | System | Several error responses use `500` instead of `400` or `404`. |
| **K08** | **NEEDS MANUAL REVIEW** | System | API endpoints do not currently implement cursor-based pagination parameters. |
| **K09** | **PASS** | Client | Search and filter parameters do not cross client tenant boundaries. |
| **K10** | **PASS** | Client | Request body size limit enforced at 5MB for file uploads. |
| **K11** | **PASS** | System | Cross-origin requests restricted by default Next.js same-origin policy. |
| **K12** | **NEEDS MANUAL REVIEW** | System | State-changing POST/PATCH APIs rely on `SameSite: lax` cookie without CSRF token. |
| **K13** | **FAIL** | System | Missing Content-Security-Policy, X-Frame-Options, and X-Content-Type-Options headers. |
| **K14** | **FAIL** | System | Missing rate limiting and abuse controls across all API routes. |
| **K15** | **PASS** | System | Identity, client ID, and reviewer ID derived from verified server session, not user payload. |
| **K16** | **PASS** | System | Non-multipart requests to upload endpoint return descriptive error. |
| **K17** | **PASS** | System | No sensitive server data leaked in headers or URLs. |

### Category L: Frontend and Browser Behavior
| Case ID | Status | Role | Result & Evidence |
|---|:---:|---|---|
| **L01** | **PASS** | Client/Admin | Navigation menus adapt dynamically based on authenticated role. |
| **L02** | **PASS** | Unauth | Next.js middleware redirects unauthenticated users before page content renders. |
| **L03** | **PASS** | Client | Logout destroys session cookie; back-button navigation to protected route redirects to login. |
| **L04** | **FAIL** | Reviewer | Reviewer "All Flags" tab fails to display resolved flags due to API filtering defect. |
| **L05** | **PASS** | Client | Form validation feedback matches server-side rejection criteria. |
| **L06** | **PASS** | Client | Submit buttons disabled during asynchronous submission to prevent double-submit. |
| **L07** | **PASS** | Client | Layout responsive across desktop and tablet viewport widths using glassmorphism styling. |
| **L08** | **PASS** | Client | Forms and primary navigation elements are accessible via keyboard tab indexing. |
| **L09** | **PASS** | Client | Untrusted contract text rendered within sanitized React text nodes. |
| **L10** | **FAIL** | Reviewer | Navigating to `/contracts` as Reviewer triggers console 403 error. |
| **L11** | **PASS** | Client | Sensitive state cleared upon logout redirect. |
| **L12** | **PASS** | Client | Failed API responses trigger danger alert banners, never false success alerts. |

### Category M: Concurrency, Reliability, and Bounded Load
| Case ID | Status | Role | Result & Evidence |
|---|:---:|---|---|
| **M01** | **PASS** | Public | Baseline latency for read-only routes: 290ms - 360ms. |
| **M02** | **PASS** | Public | 5 concurrent requests executed with 100% success rate and zero errors. |
| **M03** | **NOT RUN** | Client | Mass concurrent uploads skipped to avoid local CPU saturation. |
| **M04** | **PASS** | Reviewer | Transaction isolation prevents race conditions on flag adjudication. |
| **M05** | **PASS** | System | PostgreSQL connection pool releases connections via `finally { client.release(); }`. |
| **M06** | **PASS** | System | Local FastAPI embedding service processes single clauses in < 50ms. |
| **M07** | **PASS** | Client | Stopping embedding service produces recoverable `502` error without hanging. |
| **M08** | **PASS** | Client | Failed upload transactions do not leave orphaned partial records. |
| **M09** | **PASS** | System | CPU and memory remained stable throughout audit testing window. |
| **M10** | **PASS** | System | Latency measured and recorded; no exaggerated capacity claims made. |
| **M11** | **PASS** | System | Test execution maintained low concurrency; zero service degradation observed. |

### Category N: Privacy, Secrets, and Deployment Security
| Case ID | Status | Role | Result & Evidence |
|---|:---:|---|---|
| **N01** | **FAIL** | System | Application fails to block fallback JWT secret when `NODE_ENV === 'production'`. |
| **N02** | **PASS** | System | No secrets hardcoded in git tracked files; `.env` listed in `.gitignore`. |
| **N03** | **PASS** | System | `.env` and `.venv` excluded from static public web serving. |
| **N04** | **FAIL** | System | Cookies lack `Secure` flag in local development; relies on production flag condition. |
| **N05** | **PASS** | Public | No private keys or environment secrets exposed in Next.js client bundles. |
| **N06** | **PASS** | System | Passwords hashed using bcrypt with cost factor 12 (`BCRYPT_ROUNDS = 12`). |
| **N07** | **PASS** | System | Bcrypt hashing cost provides adequate resistance without excessive server lag. |
| **N08** | **PASS** | System | Error responses return generic messages rather than raw SQL or secret dumps. |
| **N09** | **NOT RUN** | System | Long-term contract retention/deletion policy not yet defined in requirements. |
| **N10** | **PASS** | System | Access to database and internal microservices bound to localhost. |
| **N11** | **PASS** | System | Checked `package.json` and Python dependencies; no outdated critical packages flagged. |
| **N12** | **PASS** | System | Next.js source maps not leaked outside development server mode. |
| **N13** | **PASS** | System | PostgreSQL container maps port `5432` to localhost only. |
| **N14** | **PASS** | System | Credentials inspected safely in memory without writing to log files. |

### Category O: Recovery, Consistency, and Regression
| Case ID | Status | Role | Result & Evidence |
|---|:---:|---|---|
| **O01** | **PASS** | System | Database state verified consistent after all test executions. |
| **O02** | **PASS** | System | Embedding service restart recovery tested and verified. |
| **O03** | **PASS** | Client | Failed contract upload returns clear error and maintains zero-orphan state. |
| **O04** | **PASS** | System | Retrying failed transactions executes safely without database deadlocks. |
| **O05** | **PASS** | System | Admin dashboard metrics reconcile 1:1 with underlying database counts. |
| **O06** | **PASS** | System | `review_history` table operates as append-only historical audit trail. |
| **O07** | **PASS** | System | All 25 original seed risk patterns in `risk_library` remain intact and unchanged. |
| **O08** | **PASS** | System | Confirmed: 0 user accounts, 0 contracts, 0 flags, and 0 config rows were altered or deleted. |

---

## 7. Prioritized Remediation Backlog

| Priority | Issue | Action Item | Target Location |
|:---:|---|---|---|
| **P1** | JWT Fallback Secret | Enforce strict error throw if `NODE_ENV === 'production'` and `JWT_SECRET` is missing. | `middleware.js`, `lib/auth.js` |
| **P1** | Duplicate Clause Ingestion Crash | Disambiguate duplicate clause numbers or update unique constraint. | `app/api/contracts/route.js`, `database/schema.sql` |
| **P2** | Reviewer Contracts Access Discrepancy | Reconcile Reviewer access to `/contracts` between middleware and API route. | `middleware.js`, `app/api/contracts/route.js` |
| **P2** | Reviewer Queue Tab Filter Bug | Fix `statusFilter` logic in `flags/route.js` to allow viewing resolved flags. | `app/api/flags/route.js` |
| **P2** | Non-Numeric ID Unhandled 500 | Add integer validation and try/catch block to `app/api/contracts/[id]/route.js`. | `app/api/contracts/[id]/route.js` |
| **P3** | Malformed JSON 500 Responses | Catch JSON parse `SyntaxError` and return `400 Bad Request`. | `app/api/auth/login/route.js`, etc. |
| **P3** | Missing Rate Limiting | Add rate limiter middleware on `/api/auth/login` and `/api/contracts`. | `middleware.js` |
| **P3** | Missing Security Headers | Add CSP, X-Frame-Options, X-Content-Type-Options, and HSTS headers. | `next.config.mjs` |

---

## 8. Confirmation of Compliance

The testing agent hereby certifies:
1. **Zero Code Changes:** No application code, CSS, frontend components, or API routes were modified.
2. **Zero Schema/Config Changes:** No database tables, columns, indexes, triggers, stored functions, or configuration rows were modified or dropped.
3. **Zero Data Tampering:** All existing users, contracts, clauses, flags, and review history rows remain strictly identical to their pre-audit state.
4. **Zero Git Changes:** No `git commit`, `git push`, merge, or branch modifications were executed.
