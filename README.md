# ClauseGuard: AI-Assisted Contract Clause Risk Flagging System

A dual-database (Relational SQL + pgvector semantic vector search) legal triage system built for non-profits and legal aid organizations. Ingests commercial contracts, segments clauses, detects predatory or one-sided legal provisions using 384-dimensional semantic similarity, and orchestrates human review sign-offs with ACID transactions and role-based access control.

---

## Team & Equal Work Split

| Teammate | USN | Track | Key Deliverables |
|---|---|---|---|
| **Tusti** | `PES1UG24CS505` | **Track A: Database & Embedding Pipeline Lead** | Relational schema DDL, pgvector integration, 384-dim embedding microservice (`all-MiniLM-L6-v2`), risk library seed data, cosine similarity query, `calculate_risk_score()` stored function, `trg_flag_clause_when_risky` database trigger, HNSW cosine vector indexing. |
| **Ritu Ravish** | `PES1UG24CS928` | **Track B: Application, Reviewer Workflow & Auth Lead** | Next.js full-stack web application, role-based auth (Client, Reviewer, LegalAdmin) with bcrypt & JWT cookies, contract ingestion & PDF text parser, atomic reviewer TRANSACTION workflow (`UPDATE flags` + `INSERT review_history`), CTE-backed `unresolved_flags_by_client` aggregation view, clause breakdown UI with severity-highlighted cards, dynamic threshold tuning, API route layer. |

---

## Evaluation Rubrics Mapping (Target: 50 / 50)

| Rubric Criterion | Implementation Details | Location in Codebase |
|---|---|---|
| **#1 Abstract / Problem Statement** | Automated contract clause triage for legal aid organizations using semantic vector matching. | `README.md`, `app/page.js` |
| **#2 ER Diagram** | Full Mermaid ER diagram showing 7 entities, foreign keys, cardinality, and constraints. | `docs/TRACK_A_HANDOFF.md` |
| **#3 Relational Schema** | Derived 3NF relational schema with PKs, FKs, CHECK constraints, and NOT NULL. | `database/schema.sql` |
| **#4 Normalization** | Schema normalized to Third Normal Form (3NF). Audit trail decoupled to `review_history`. | `database/schema.sql` |
| **#5 DDL Implementation** | `CREATE TABLE`, `CREATE INDEX`, `ALTER`, constraints, `vector` extension. | `database/schema.sql`, `database/views.sql` |
| **#6 DML Operations** | `INSERT`, `UPDATE`, `DELETE` operations across users, contracts, clauses, flags, and review history. | `app/api/**`, `lib/db.js` |
| **#7 Query Complexity** | Multi-table JOINs (flags ↔ clauses ↔ contracts ↔ users ↔ risk_library), correlated subqueries, and statistical aggregations. | `app/api/contracts/[id]/route.js`, `database/views.sql` |
| **#8 Advanced DB Features** | 1. **Trigger**: `trg_flag_clause_when_risky`<br>2. **Stored Function**: `calculate_risk_score(clause_id)`<br>3. **Transaction**: Atomic flag update + history insert<br>4. **View with CTEs**: `unresolved_flags_by_client` | `database/schema.sql`<br>`database/views.sql`<br>`app/api/flags/[id]/review/route.js` |
| **#9 NoSQL / Vector DB** | PostgreSQL `pgvector` extension storing 384-dimensional dense vectors with cosine similarity (`<=>`) and HNSW index. | `database/schema.sql`, `embedding_service/` |
| **#10 Frontend Implementation** | Next.js 14 App Router, responsive glassmorphism dark theme, clause cards with severity color coding, risk meters. | `app/**`, `components/Navbar.js`, `app/globals.css` |
| **#11 Backend & API Integration** | Modular Next.js REST API routes, connection pool (`pg`), PDF text extractor, Python FastAPI microservice bridge. | `app/api/**`, `lib/db.js`, `lib/auth.js` |
| **#12 Security & Access Control** | Three distinct roles (Client, Reviewer, LegalAdmin), bcrypt password hashing, HTTP-only JWT cookies, route middleware shielding. | `lib/auth.js`, `middleware.js` |

---

## Architecture & Data Flow

```
+-----------------------------------------------------------------------------------+
|                                 Next.js Frontend                                  |
|  [Landing Page]  [Client Upload]  [Clause Breakdown]  [Review Queue]  [Admin CTE] |
+------------------------------------------+----------------------------------------+
                                           | HTTP Requests
                                           v
+-----------------------------------------------------------------------------------+
|                               Next.js Backend (API)                               |
|   - Authentication & Role RBAC (bcrypt + JWT in httpOnly cookie)                  |
|   - PDF / Plaintext Extraction (pdf-parse)                                        |
|   - Connection Pooling & Query Helper (pg)                                        |
+---------------------+-------------------------------------+-----------------------+
                      |                                     |
       1. Process Text|                                     | 2. Persist in
      & Get Embeddings|                                     | Atomic Transaction
                      v                                     v
+--------------------------------+   +----------------------------------------------+
|     Python Embedding Service   |   |             PostgreSQL + pgvector             |
|   (FastAPI on port 8001)       |   |                                              |
| - sentence-transformers        |   | - Relational Tables: users, contracts,       |
|   (all-MiniLM-L6-v2)           |   |   clauses, risk_library, flags,              |
| - Numbered clause segmenter    |   |   review_history, risk_config                |
| - 384-dim normalized vectors   |   | - Triggers: trg_flag_clause_when_risky       |
+--------------------------------+   | - Functions: calculate_risk_score(clause_id) |
                                     | - CTE View: unresolved_flags_by_client       |
                                     | - HNSW Indexes: vector_cosine_ops            |
                                     +----------------------------------------------+
```

---

## Setup & Execution Instructions

### Prerequisites
- **Node.js** v18+ and `npm`
- **Python** 3.10+ and `pip`
- **PostgreSQL** 15+ with the `pgvector` extension enabled

### Step 1: Clone and Configure Environment

```powershell
# Set up your environment variables
Copy-Item .env.example .env
```

Edit `.env` with your PostgreSQL database credentials:
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/clauseguard
EMBEDDING_SERVICE_URL=http://127.0.0.1:8001
JWT_SECRET=super-secure-dev-secret-key-32-chars-min
```

### Step 2: Initialize Database

Connect to your PostgreSQL database and run the schema and view scripts:

```powershell
psql $env:DATABASE_URL -f database/schema.sql
psql $env:DATABASE_URL -f database/views.sql
```

### Step 3: Start Python Embedding Microservice

In a separate terminal:

```powershell
# Create and activate virtual environment
py -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install requirements
pip install -r embedding_service/requirements.txt

# Seed the curated 25-pattern risk library
python -m embedding_service.seed_risk_library

# Start the embedding service on port 8001
uvicorn embedding_service.app:app --host 127.0.0.1 --port 8001
```

### Step 4: Start Next.js Web Application

In your main terminal:

```powershell
# Install Node.js dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## User Roles & Demonstration Workflow

### 1. Client Workflow
- **Sign up / Log in** as a `Client`.
- Navigate to **Upload Contract** (`/contracts/upload`).
- Select one of the **1-Click Preloaded Sample Contracts** (e.g., *Vendor Services Agreement with Unlimited Liability & Unilateral Termination*) or upload your own file.
- Click **Run Risk Analysis**:
  1. The app calls the Python microservice to segment clauses and generate 384-dimensional embeddings.
  2. The contract and clauses are persisted inside a PostgreSQL `TRANSACTION`.
  3. The database trigger `trg_flag_clause_when_risky` fires automatically and creates `Open` flags for clauses crossing the cosine similarity threshold (default `0.75`).
- The user is redirected to the **Clause Breakdown UI** (`/contracts/[id]`), showing highlighted clauses color-coded by severity, matched risk patterns, similarity scores, and composite risk scores from `calculate_risk_score()`.

### 2. Legal Admin Workflow
- Log in as a `LegalAdmin`.
- View the **Admin Dashboard** (`/admin`):
  - Inspect the **Unresolved Flags by Client** table populated directly from the `unresolved_flags_by_client` CTE view.
  - Review overall system metrics (total contracts, clauses, open/cleared/escalated flags).
  - Assign unassigned flags to designated reviewers.
- Navigate to **Risk Library Management** (`/admin/risk-library`):
  - View all curated risk patterns and their match counts.
  - Adjust the dynamic trigger threshold slider (updates `risk_config.similarity_threshold`).
  - Add new custom risk patterns: input text, category, and severity (1-5); the backend generates a 384-dim vector on the fly and stores it in `risk_library`.

### 3. Reviewer Workflow
- Log in as a `Reviewer`.
- View the **Reviewer Queue** (`/reviewer`):
  - Lists open flags assigned to this reviewer.
  - Inspect the clause text, matched pattern, cosine similarity %, and composite risk score.
  - Click **Clear (Approve)** or **Escalate to Senior Counsel**:
    - Executes an atomic PostgreSQL `TRANSACTION`:
      1. `UPDATE flags SET status = 'Cleared'/'Escalated', reviewer_id = ... WHERE id = ... AND status = 'Open'`
      2. `INSERT INTO review_history (flag_id, action, reviewer_id) VALUES (...)`
    - Guarantees ACID consistency and logs an immutable audit trail.

---

## API Documentation

### Authentication Routes
- `POST /api/auth/signup`: Create a new user (`name`, `password`, `role`). Passwords hashed with bcrypt.
- `POST /api/auth/login`: Authenticate user; returns HTTP-only JWT cookie.
- `POST /api/auth/logout`: Clears session cookie.
- `GET /api/auth/me`: Returns current authenticated session (`id`, `name`, `role`).

### Contract Routes
- `GET /api/contracts`: List contracts scoped by role (Client sees own; Admin sees all).
- `POST /api/contracts`: Upload contract (`file` or `text`). Calls embedding service and saves contract + clauses in a transaction.
- `GET /api/contracts/[id]`: Contract detail with all clauses, pgvector matches, and `calculate_risk_score()` output.

### Flag & Review Routes
- `GET /api/flags`: List flags filtered by status and role.
- `PATCH /api/flags/[id]`: Assign a reviewer to a flag (`LegalAdmin` only).
- `POST /api/flags/[id]/review`: Execute review action (`Cleared` or `Escalated`) inside an atomic database `TRANSACTION`.

### Admin & Risk Library Routes
- `GET /api/admin/dashboard`: Queries `unresolved_flags_by_client` CTE view and aggregates system stats.
- `GET /api/users/reviewers`: List all users with `Reviewer` role for assignment.
- `GET /api/risk-library`: List all reference patterns and current similarity threshold.
- `POST /api/risk-library`: Add a new risk pattern (generates 384-dim vector and stores in `risk_library`).
- `PATCH /api/risk-library`: Update `risk_config.similarity_threshold` or pattern severity.

---

## Evaluation Checklist & Rubric Verification

- [x] **Relational Schema**: 3NF schema with foreign keys, CHECK constraints, and NOT NULL.
- [x] **pgvector Cosine Search**: Dense 384-dim embeddings with `<=>` cosine distance operator and HNSW indexes.
- [x] **Triggers**: `trg_flag_clause_when_risky` fires on clause insert/update and creates flags automatically.
- [x] **Transactions**: Reviewer status update + `review_history` insert executed atomically inside `BEGIN ... COMMIT`.
- [x] **Views & CTEs**: `unresolved_flags_by_client` SQL view using multiple Common Table Expressions.
- [x] **Stored Functions**: `calculate_risk_score(clause_id)` combining cosine similarity with severity weights.
- [x] **RBAC Security**: 3 distinct roles (Client, Reviewer, LegalAdmin) enforced via server-side middleware and bcrypt-hashed passwords.
- [x] **Main Visual Payoff**: Interactive Clause Breakdown UI highlighting risks with red/yellow/green severity cards.
- [x] **Documentation**: Complete setup instructions, API specs, and work-split attribution.
