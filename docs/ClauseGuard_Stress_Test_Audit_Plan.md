# ClauseGuard --- Read-Only Stress Test and Security Audit Plan

## Mission

You are an authorized testing agent with access to the ClauseGuard
dashboard and project environment. Your task is to **test the
application, identify defects and security loopholes, collect evidence,
and produce a detailed audit report**.

**Do not fix anything. Do not implement changes. Do not refactor. Do not
commit, push, merge, or modify Git history.** Do not change application
code, configuration, database schema, triggers, functions, thresholds,
seed data, or existing user/contract records. Do not disable security
controls. Finish with a report of findings and recommended remediations
only.

## Non-negotiable rules

1.  **Observe and test only; never repair.** Do not edit source files or
    configuration, apply migrations, change permissions, alter risk
    thresholds, or modify production-like data.
2.  **Do not perform Git actions that change repository history.** No
    `git commit`, `git push`, merge, rebase, cherry-pick, or branch
    deletion. Leave any generated artifacts uncommitted.
3.  **Protect data.** Do not delete records, overwrite existing records,
    bulk-import test data into the shared database, or run destructive
    SQL. Do not expose password hashes, JWTs, cookies, API keys,
    environment variables, or full sensitive contract text in the
    report.
4.  **Use isolated test identities and test contracts only when
    explicitly permitted and safe.** Clearly mark test data. If the
    environment does not provide an isolated test database or a
    documented cleanup process, avoid tests that create persistent
    records. Prefer read-only inspection and non-mutating checks.
5.  **Do not run denial-of-service tests.** Use a controlled, low rate.
    Do not flood endpoints, spawn uncontrolled parallel requests, upload
    huge files, or stress shared infrastructure beyond normal expected
    use.
6.  **No real-world exfiltration or destructive exploitation.** Validate
    access boundaries using test accounts and harmless records. Do not
    access, download, or disclose another real user's private contracts
    or data. For IDOR tests, use only records created for testing or
    verify denial without reading the protected payload.
7.  **Do not weaken protections to make a test pass.** Never bypass
    authentication by editing code, changing JWT secrets, disabling
    middleware, turning off RLS, or changing database permissions.
8.  **Ask for authorization before any test that changes state**
    (signup, upload, assigning/reviewing flags, modifying risk
    library/configuration, or creating records). If permission is not
    clear, skip the test and mark it "Not run --- authorization/state
    change required."
9.  **Record uncertainty honestly.** Do not claim a test passed unless
    it was actually executed and evidence supports the result.
    Distinguish `PASS`, `FAIL`, `BLOCKED`, `NOT RUN`, and
    `NEEDS MANUAL REVIEW`.
10. Stop immediately if a test risks affecting real data, reveals a real
    user's sensitive data, causes service instability, or produces
    unexpected destructive behavior.

## Application context (verify against the actual code; do not assume)

Known design notes to validate: - Next.js 14 frontend and API routes. -
PostgreSQL with pgvector. - Python FastAPI embedding service on port
8001 using `sentence-transformers/all-MiniLM-L6-v2`. - PDF parsing using
`pdf-parse`. - bcrypt password hashing and JWT in an httpOnly cookie. -
Roles: `Client`, `Reviewer`, `LegalAdmin`. - Tables reported: `users`,
`contracts`, `clauses`, `risk_library`, `flags`, `review_history`,
`risk_config`. - Embeddings are expected to have 384 dimensions. - A
database trigger reportedly creates flags when cosine similarity meets a
configured threshold (default 0.75). - Stored functions reportedly
include `find_similar_risks` and `calculate_risk_score`. - Risk score
reportedly uses similarity × severity/5 × 100. - Clear/Escalate review
actions should atomically record review history. - Admin dashboard
reportedly uses an `unresolved_flags_by_client` CTE view. - A seeded
risk library reportedly contains 25 patterns. - A middleware fallback
JWT secret may exist; verify whether it is safely blocked in
production. - The configured connection string may point to `postgres`
database on localhost:5432; confirm environment without printing
secrets.

These are hypotheses/context, not proof. Verify actual schemas, routes,
constraints, and implementation before judging a result.

## Required output

Create a Markdown report named `ClauseGuard_Stress_Test_Audit_Report.md`
(or an equivalent clearly named document) containing:

1.  Executive summary and overall risk rating.
2.  Scope, environment, test date/time, app version/commit if visible,
    and role/account types used (never include credentials).
3.  Test methodology and limitations.
4.  A summary table with counts of PASS, FAIL, BLOCKED, NOT RUN, NEEDS
    MANUAL REVIEW.
5.  Findings ranked Critical / High / Medium / Low / Informational.
6.  For each finding:
    -   Finding ID and concise title.
    -   Severity and confidence.
    -   Affected page, API route, component, database object, or
        workflow.
    -   Preconditions and role used.
    -   Exact safe reproduction steps.
    -   Expected behavior versus observed behavior.
    -   Evidence: sanitized screenshot, response status, error message,
        relevant timestamp, or redacted logs.
    -   Impact and realistic abuse scenario.
    -   Recommended remediation (recommendations only; do not
        implement).
    -   Regression test that should be added.
7.  A full test matrix with result, evidence reference, and notes for
    every case below.
8.  A list of tests skipped due to authorization, lack of isolation, or
    environment limits.
9.  A prioritized remediation backlog and recommended retest plan.
10. A clear statement confirming that no fixes, code changes, schema
    changes, or commits were made.

Do not include secrets or full sensitive contract contents in evidence.
Redact emails where appropriate, all tokens/cookies, password hashes,
API keys, and private contract details.

------------------------------------------------------------------------

# Test matrix

For each case, record the case ID, status, timestamp, role, environment,
steps, expected result, actual result, and evidence reference.

## A. Baseline, configuration, and observability

-   [ ] A01 --- Confirm app and dashboard load without console errors.
-   [ ] A02 --- Confirm login, logout, and session state are coherent
    after refresh.
-   [ ] A03 --- Confirm the running app points to the intended test
    environment/database; do not print credentials.
-   [ ] A04 --- Record available app/service versions and deployment
    mode.
-   [ ] A05 --- Check server logs for unhandled exceptions during normal
    navigation; redact sensitive values.
-   [ ] A06 --- Check whether health/error states are clear when the
    embedding service or database is unavailable, using only approved
    safe methods.
-   [ ] A07 --- Confirm no secrets or private contract content appear in
    browser console, URLs, client-visible errors, or ordinary logs.
-   [ ] A08 --- Check whether errors have useful correlation IDs or
    enough diagnostic detail without leaking internals.

## B. Authentication and session security

Use only authorized test accounts. Do not brute-force accounts or test
real users' passwords.

-   [ ] B01 --- Unauthenticated visit to each protected dashboard page
    is redirected or rejected.
-   [ ] B02 --- Unauthenticated calls to protected API routes return an
    appropriate 401/403.
-   [ ] B03 --- Valid login works for an authorized test account.
-   [ ] B04 --- Invalid password is rejected without revealing whether
    the account exists.
-   [ ] B05 --- Malformed, empty, missing, and oversized login fields
    are handled safely.
-   [ ] B06 --- Signup validation rejects missing required fields,
    invalid roles, malformed input, and duplicate test email/identity.
-   [ ] B07 --- Public signup cannot create a `LegalAdmin` or `Reviewer`
    account unless explicitly intended and protected.
-   [ ] B08 --- Logout invalidates/removes the session cookie and
    subsequent protected calls fail.
-   [ ] B09 --- Session behavior after browser refresh, new tab, and
    expired/invalid cookie is correct.
-   [ ] B10 --- Invalid, expired, malformed, or tampered JWT is
    rejected.
-   [ ] B11 --- Cookie flags are checked: `HttpOnly`, `Secure` in HTTPS
    production, appropriate `SameSite`, path, and expiration.
-   [ ] B12 --- Authentication responses and errors do not reveal
    password hashes, JWTs, stack traces, or secrets.
-   [ ] B13 --- Check whether session/token lifetime and logout
    semantics match documented expectations.
-   [ ] B14 --- Check for login CSRF/session fixation risks where
    relevant, without attempting harmful exploitation.
-   [ ] B15 --- Check rate limiting or lockout controls only with a
    small, approved number of attempts; no brute force.

## C. Role-based access control (RBAC)

Test using separate authorized Client, Reviewer, and LegalAdmin
accounts. Use only test records.

-   [ ] C01 --- Client sees only client-allowed pages, APIs, and
    actions.
-   [ ] C02 --- Reviewer sees only reviewer-allowed pages, APIs, and
    actions.
-   [ ] C03 --- LegalAdmin sees only admin-allowed pages, APIs, and
    actions.
-   [ ] C04 --- Client cannot access reviewer/admin pages by typing
    their URLs directly.
-   [ ] C05 --- Reviewer cannot access LegalAdmin-only functions by
    direct URL or API call.
-   [ ] C06 --- Client cannot call admin risk-library/configuration APIs
    directly.
-   [ ] C07 --- Role checks are enforced server-side, not only by hiding
    UI controls.
-   [ ] C08 --- Changing a client-controlled role field or request body
    cannot elevate privileges.
-   [ ] C09 --- Unknown, missing, differently cased, or malformed role
    values fail safely.
-   [ ] C10 --- Admin-only user/reviewer listing does not expose
    password hashes, tokens, or unnecessary personal data.
-   [ ] C11 --- A disabled/deleted/revoked account, if supported, cannot
    continue to use stale sessions.
-   [ ] C12 --- Check that API methods not exposed in the UI still
    enforce the correct role.

## D. Tenant isolation, object ownership, and IDOR

Use two test Client accounts (A and B) and records created for them.
Never inspect real users' protected payloads.

-   [ ] D01 --- Client A sees only their own contracts.
-   [ ] D02 --- Client A cannot retrieve Client B's test contract by
    changing a URL ID.
-   [ ] D03 --- Client A cannot download or parse Client B's test
    contract through an API route.
-   [ ] D04 --- Client A cannot view clauses, flags, or review history
    belonging to Client B.
-   [ ] D05 --- Client A cannot update, delete, assign, or review
    another client's records.
-   [ ] D06 --- API responses do not leak existence of protected objects
    beyond intended behavior.
-   [ ] D07 --- List, search, pagination, filters, and dashboard counts
    preserve tenant boundaries.
-   [ ] D08 --- Nested objects are checked for ownership (contract →
    clauses → flags → review history).
-   [ ] D09 --- Guessable/sequential IDs do not bypass authorization.
-   [ ] D10 --- Verify ownership checks in API handlers/database
    queries, not just UI filtering.
-   [ ] D11 --- Reviewer access is limited to assigned/authorized
    workload if that is the intended policy.
-   [ ] D12 --- LegalAdmin cross-client access is limited to the
    explicitly intended admin scope.

## E. Contract upload, PDF parsing, and file handling

Only use harmless synthetic test PDFs in an approved test environment.
Do not upload malware or exploit files.

-   [ ] E01 --- Valid, small, text-based PDF upload succeeds and shows
    the correct owner/status.
-   [ ] E02 --- Empty file, zero-byte file, and file with no PDF content
    are rejected safely.
-   [ ] E03 --- Non-PDF file renamed to `.pdf` is rejected or handled
    safely.
-   [ ] E04 --- Corrupt/truncated PDF produces a controlled error, not a
    server crash.
-   [ ] E05 --- PDF with no extractable text is handled with a useful
    message.
-   [ ] E06 --- Oversized upload is rejected at a documented limit; do
    not test extreme sizes.
-   [ ] E07 --- Filename edge cases (spaces, Unicode, long names, path
    separators, reserved characters) cannot cause traversal or unsafe
    paths.
-   [ ] E08 --- Duplicate filenames do not overwrite another contract or
    confuse ownership.
-   [ ] E09 --- MIME type and extension are not blindly trusted.
-   [ ] E10 --- Uploaded files are not publicly accessible without
    authorization.
-   [ ] E11 --- Errors do not reveal local paths, stack traces,
    environment variables, or parser internals.
-   [ ] E12 --- PDF text containing HTML/script-like strings is
    displayed as text and not executed.
-   [ ] E13 --- Synthetic text with SQL metacharacters is treated as
    data, not SQL.
-   [ ] E14 --- Upload failure does not leave orphaned/inconsistent
    contract or clause records.
-   [ ] E15 --- Successful upload does not create duplicate
    clauses/flags when the same workflow is retried unless designed to
    do so.
-   [ ] E16 --- Status transitions are consistent across upload,
    parsing, and analysis failures.
-   [ ] E17 --- Content and metadata are not exposed through browser
    caches, public URLs, or unintended static paths.

## F. Embedding service and AI pipeline

Do not disable authentication or overwhelm the service. Use small
synthetic inputs.

-   [ ] F01 --- Embedding service availability and configured endpoint
    are confirmed.
-   [ ] F02 --- Valid clause input returns a valid embedding with
    expected 384 dimensions (verify actual model contract).
-   [ ] F03 --- Empty, whitespace-only, malformed, and unusually long
    input is validated safely.
-   [ ] F04 --- Embedding response containing missing, null,
    non-numeric, or wrong-dimension values is handled without corrupting
    database state.
-   [ ] F05 --- Service timeout/unavailable response yields a controlled
    error and recoverable status.
-   [ ] F06 --- Embedding service errors do not expose secrets,
    filesystem paths, or full sensitive text.
-   [ ] F07 --- Retries/timeouts are bounded; requests do not hang
    indefinitely.
-   [ ] F08 --- Reprocessing the same contract does not create
    unintended duplicate clauses or flags.
-   [ ] F09 --- Embeddings stored in PostgreSQL have expected dimension,
    finite values, and appropriate non-null constraints.
-   [ ] F10 --- Client-provided embeddings/similarity scores cannot be
    trusted to create or manipulate risk flags.
-   [ ] F11 --- Verify that embeddings are generated from the intended
    text and correct clause/risk pattern.
-   [ ] F12 --- Check handling of prompt-injection-like text inside a
    contract: it must be treated as untrusted document content, not as
    instructions to the agent/system.
-   [ ] F13 --- Similarity matches are explainable enough to identify
    the matched risk pattern and score where intended.
-   [ ] F14 --- Model/service version or model changes do not silently
    mix incompatible embedding spaces.

## G. Risk detection, threshold boundaries, and scoring

Avoid changing the shared risk threshold. Boundary tests that require
altering config must be performed only in an isolated disposable test
database; otherwise mark NOT RUN.

-   [ ] G01 --- A clearly matching synthetic clause can trigger the
    expected risk flag.
-   [ ] G02 --- A clearly unrelated synthetic clause does not create an
    obviously spurious flag.
-   [ ] G03 --- Similarity below configured threshold does not trigger a
    flag if that is the intended rule.
-   [ ] G04 --- Similarity at the threshold follows the documented
    inclusive/exclusive comparison.
-   [ ] G05 --- Similarity above threshold triggers the expected
    behavior.
-   [ ] G06 --- Missing or null threshold fails safely and predictably.
-   [ ] G07 --- Threshold update permissions are restricted to the
    intended admin role.
-   [ ] G08 --- Invalid thresholds (out of range, non-numeric, null) are
    rejected.
-   [ ] G09 --- Severity values outside allowed bounds are rejected.
-   [ ] G10 --- Risk score calculation matches the documented formula
    and rounding behavior.
-   [ ] G11 --- Similarity values outside valid range, NaN, or infinity
    are rejected or safely normalized.
-   [ ] G12 --- Multiple matching risk patterns produce deterministic
    and understandable results.
-   [ ] G13 --- Duplicate flags are prevented or intentionally handled
    on retries/reprocessing.
-   [ ] G14 --- Risk-library edits affect subsequent detections as
    documented, without silently rewriting history.
-   [ ] G15 --- A failed database trigger/function does not leave
    partial or contradictory state.
-   [ ] G16 --- Risk severity/category/text shown in the UI matches
    stored source data.
-   [ ] G17 --- Check false-positive/false-negative examples using a
    small, labeled synthetic set; do not make unsupported claims about
    model accuracy.

## H. Database integrity, SQL safety, triggers, and functions

Use read-only inspection against the shared database. Run write/rollback
tests only in a disposable isolated database with explicit
authorization.

-   [ ] H01 --- Confirm actual table names, columns, types, constraints,
    foreign keys, and indexes.
-   [ ] H02 --- Check expected relationships between users, contracts,
    clauses, flags, and review history.
-   [ ] H03 --- Verify required fields and foreign keys prevent orphaned
    rows.
-   [ ] H04 --- Verify uniqueness constraints for intended unique
    values.
-   [ ] H05 --- Confirm `risk_library` seed count against the expected
    25, while reporting actual count.
-   [ ] H06 --- Confirm embeddings have expected dimensions and no
    invalid values; do not print entire vectors.
-   [ ] H07 --- Inspect trigger definitions and verify flag creation
    logic matches documented threshold semantics.
-   [ ] H08 --- Inspect `find_similar_risks` and `calculate_risk_score`
    definitions and compare actual behavior to intended contract.
-   [ ] H09 --- Verify stored functions use safe parameterization and do
    not build unsafe dynamic SQL.
-   [ ] H10 --- Check transaction boundaries for multi-step operations.
-   [ ] H11 --- Check delete/update cascades and restrict behavior by
    inspecting schema only; do not delete rows to test.
-   [ ] H12 --- Check database errors do not reveal credentials or
    sensitive SQL details to users.
-   [ ] H13 --- Verify database access uses least privilege and the app
    does not use a superuser in production (inspect configuration
    metadata without revealing secrets).
-   [ ] H14 --- Check backup/restore and migration status only if a
    documented safe test environment exists.
-   [ ] H15 --- Verify no test records are accidentally counted as real
    business records; do not remove them.

## I. Reviewer workflow and audit history

Use only approved test flags and accounts. These tests create or modify
state, so obtain permission and use isolated data.

-   [ ] I01 --- Reviewer can view only permitted/assigned flags.
-   [ ] I02 --- Clear action updates the intended flag and records a
    corresponding history entry.
-   [ ] I03 --- Escalate action updates the intended flag and records a
    corresponding history entry.
-   [ ] I04 --- Review history captures actor, action, timestamp, and
    relevant reference as designed.
-   [ ] I05 --- Review update and history insertion are atomic; failure
    of either must not leave partial state.
-   [ ] I06 --- Repeated review submission does not create contradictory
    or duplicate actions unless explicitly intended.
-   [ ] I07 --- Two reviewers acting concurrently do not silently
    overwrite each other or lose audit history.
-   [ ] I08 --- Unauthorized users cannot clear/escalate flags through
    direct API calls.
-   [ ] I09 --- Client cannot alter reviewer identity, status, score, or
    audit fields by editing request payloads.
-   [ ] I10 --- Invalid state transitions are rejected with clear
    messages.
-   [ ] I11 --- Dashboard counts update consistently after a review
    action.
-   [ ] I12 --- Escalation destinations/notifications, if implemented,
    work only as documented and do not leak data.

## J. LegalAdmin dashboard, risk library, and configuration

Read-only checks are preferred. Mutation tests require an isolated test
environment and authorization.

-   [ ] J01 --- Admin dashboard totals match independently computed
    counts for the same scope.
-   [ ] J02 --- `unresolved_flags_by_client` view (if present) counts
    only unresolved flags and groups by the correct client.
-   [ ] J03 --- Empty database/empty result sets render without
    crashing.
-   [ ] J04 --- Filters, sorting, pagination, and date ranges produce
    consistent results.
-   [ ] J05 --- Risk library list displays the stored patterns and
    severities accurately.
-   [ ] J06 --- Create/update/delete risk pattern operations enforce
    LegalAdmin-only access.
-   [ ] J07 --- Invalid or duplicate risk patterns are rejected or
    handled predictably.
-   [ ] J08 --- Threshold/config changes are validated, audited if
    required, and take effect consistently.
-   [ ] J09 --- Client/reviewer APIs cannot mutate risk library or risk
    configuration.
-   [ ] J10 --- Admin endpoints do not expose password hashes, JWTs, or
    unnecessary private contract content.
-   [ ] J11 --- Dashboard values do not leak one client's private
    details to another client.
-   [ ] J12 --- UI error states and loading indicators behave correctly
    on API failure.

## K. API robustness and input validation

Only use low-rate requests against approved test routes.

-   [ ] K01 --- Unsupported HTTP methods are rejected.
-   [ ] K02 --- Missing required fields, wrong types, nulls, malformed
    JSON, and extra fields are handled safely.
-   [ ] K03 --- Very long strings and nested payloads are rejected or
    bounded.
-   [ ] K04 --- SQL injection-like strings in names, filenames, filters,
    and clause text are treated as data.
-   [ ] K05 --- HTML/script-like input is escaped in UI contexts.
-   [ ] K06 --- Path traversal strings are safely rejected/normalized.
-   [ ] K07 --- Error responses use appropriate status codes and avoid
    stack traces.
-   [ ] K08 --- Pagination parameters are bounded; negative, zero, huge,
    or malformed values do not cause expensive queries.
-   [ ] K09 --- Search/filter parameters cannot bypass tenant scope or
    role restrictions.
-   [ ] K10 --- Request body size limits are enforced.
-   [ ] K11 --- CORS configuration is restrictive and appropriate for
    deployment.
-   [ ] K12 --- CSRF protections are appropriate for
    cookie-authenticated state-changing requests.
-   [ ] K13 --- Security headers are appropriate for deployment (for
    example, content-type protection and framing policy).
-   [ ] K14 --- Rate limiting and abuse controls are present where
    needed.
-   [ ] K15 --- API does not trust user-supplied `user_id`, `role`,
    owner ID, reviewer ID, score, or status where those should come from
    trusted server state.
-   [ ] K16 --- Content-type mismatches and oversized/malformed request
    bodies fail safely.
-   [ ] K17 --- No unintended sensitive data is included in responses,
    headers, URLs, logs, or error messages.

## L. Frontend and browser behavior

-   [ ] L01 --- Navigation and role-specific menus are correct.
-   [ ] L02 --- Protected routes do not briefly display private data
    before redirecting.
-   [ ] L03 --- Refresh/back/forward navigation does not reveal stale
    private content after logout.
-   [ ] L04 --- Empty, loading, success, and error states are
    understandable.
-   [ ] L05 --- Form validation is clear and consistent with server
    validation.
-   [ ] L06 --- Double-clicking submit/review/upload does not create
    unintended duplicates.
-   [ ] L07 --- Tables, dialogs, and dashboards remain usable at normal
    laptop and mobile widths.
-   [ ] L08 --- Keyboard navigation and focus states are usable for
    primary workflows.
-   [ ] L09 --- Untrusted contract text is rendered safely.
-   [ ] L10 --- Browser console contains no uncaught errors during
    normal workflows.
-   [ ] L11 --- Sensitive content is not retained in UI state after
    logout/account switch.
-   [ ] L12 --- UI does not show a success message when the server
    operation failed.

## M. Concurrency, reliability, and bounded load

Only perform after explicit authorization, against a test environment,
and with monitoring. Do not run on a shared or production database
without approval.

-   [ ] M01 --- Baseline response times for common read-only pages and
    APIs.
-   [ ] M02 --- Small, controlled concurrent reads (for example 5
    virtual users) do not cause errors.
-   [ ] M03 --- A modest, approved number of concurrent uploads behaves
    correctly.
-   [ ] M04 --- Concurrent flag reviews preserve transaction integrity
    and audit history.
-   [ ] M05 --- Database connection pool limits and timeout behavior are
    bounded.
-   [ ] M06 --- Embedding service queue/latency behavior is bounded
    under modest load.
-   [ ] M07 --- A dependency outage produces recoverable errors rather
    than an endless loading state.
-   [ ] M08 --- Retries do not multiply uploads, clauses, or flags
    unexpectedly.
-   [ ] M09 --- Memory/CPU use remains stable during the approved test
    window.
-   [ ] M10 --- Record latency percentiles and error rate; do not claim
    capacity from a tiny sample.
-   [ ] M11 --- Stop immediately if error rate spikes, latency becomes
    severe, or shared users are affected.

## N. Privacy, secrets, and deployment security

-   [ ] N01 --- Production mode cannot start with a known
    development/fallback JWT secret.
-   [ ] N02 --- Secrets are not hard-coded or committed; inspect safely
    without printing secret values.
-   [ ] N03 --- `.env` files and local data files are excluded from
    public/static serving and version control as appropriate.
-   [ ] N04 --- HTTPS and secure cookies are configured for production.
-   [ ] N05 --- No sensitive data appears in client-side bundles or
    public environment variables.
-   [ ] N06 --- Passwords are stored as bcrypt hashes; plaintext
    passwords are never logged or returned.
-   [ ] N07 --- Password hashing cost and authentication behavior are
    reasonable; do not run expensive repeated attempts.
-   [ ] N08 --- Error reporting and logs redact secrets, tokens, and
    contract contents.
-   [ ] N09 --- Uploaded contract retention/deletion expectations are
    documented and enforced if applicable.
-   [ ] N10 --- Access to logs, backups, uploaded files, and database is
    appropriately restricted.
-   [ ] N11 --- Dependency audit results are recorded if the environment
    provides an installed scanner; do not install/update packages.
-   [ ] N12 --- Verify debug/development endpoints and source maps are
    not unnecessarily exposed in production.
-   [ ] N13 --- Confirm database port/network exposure matches intended
    environment; do not change firewall or container configuration.
-   [ ] N14 --- Confirm least-privilege service credentials without
    disclosing credential values.

## O. Recovery, consistency, and regression

-   [ ] O01 --- Read-only checks confirm data consistency after normal
    workflows.
-   [ ] O02 --- A simulated dependency failure is tested only with a
    documented safe method; otherwise mark NOT RUN.
-   [ ] O03 --- Failed upload/analysis leaves a clear recoverable
    status.
-   [ ] O04 --- Retry/resume behavior is documented and does not
    duplicate records unexpectedly.
-   [ ] O05 --- Dashboard counts reconcile with underlying records.
-   [ ] O06 --- Review history is append-only or otherwise protected
    according to intended audit policy.
-   [ ] O07 --- Existing seeded risk patterns remain unchanged
    throughout the audit.
-   [ ] O08 --- Verify no existing user/contract/flag/configuration
    record was changed by the audit.

------------------------------------------------------------------------

# Test execution and evidence rules

For every test, use this template:

  Field                Value
  -------------------- -------------------------------------------------------
  Case ID              e.g. D02
  Status               PASS / FAIL / BLOCKED / NOT RUN / NEEDS MANUAL REVIEW
  Severity if failed   Critical / High / Medium / Low / Informational
  Date/time            Include timezone
  Environment          Local / staging / other; identify only what is known
  Role/account         Role and anonymized test account label only
  Preconditions        Safe setup and permissions
  Steps                Numbered reproducible steps
  Expected             Intended behavior
  Actual               Observed behavior
  Evidence             Screenshot/file/response reference, sanitized
  Notes                Limits, ambiguity, follow-up

A test is `PASS` only when observed behavior matches a known requirement
or verified implementation contract. If requirements are unclear, use
`NEEDS MANUAL REVIEW`, not PASS. A blocked test must include the reason
and the approval/isolation needed.

## Severity guidance

-   **Critical:** likely account takeover, broad unauthorized access,
    major sensitive-data exposure, or severe integrity compromise.
-   **High:** cross-client access, privilege escalation, unauthorized
    contract/flag modification, serious auth bypass, or major
    audit-trail failure.
-   **Medium:** meaningful security/control weakness with constrained
    impact, repeated state inconsistency, or important workflow failure.
-   **Low:** limited-impact validation, UX, observability, or edge-case
    issue.
-   **Informational:** hardening recommendation or observation without a
    demonstrated vulnerability.

## Final report checklist

Before finishing, ensure: - Every test has a status; skipped tests are
explicitly listed. - Findings contain reproducible, sanitized
evidence. - No vulnerability is described as confirmed without a
demonstrated result. - Findings are deduplicated and prioritized by
impact and exploitability. - The report distinguishes confirmed issues
from hypotheses. - Recommendations do not include code changes made by
you. - No secrets, password hashes, session tokens, or private contract
contents are included. - Git working tree is unchanged by the agent
except for the requested audit report artifact, if saved locally; do not
commit it. - The final response summarizes key findings, counts by
status/severity, limitations, report location, and explicitly confirms
that no fixes were applied.

**Final instruction: Test, document, and stop. Do not fix any
loophole.**
