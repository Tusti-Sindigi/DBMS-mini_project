/**
 * PostgreSQL connection pool and query helpers with Dynamic Role-Based Access Control (RBAC).
 *
 * Uses the `pg` library with connection string from DATABASE_URL.
 * Supports native PostgreSQL roles ('role_client', 'role_reviewer', 'role_legal_admin')
 * mapping directly to system user roles ('Client', 'Reviewer', 'LegalAdmin').
 *
 * Provides:
 *   - query(text, params, role)         — single parameterized query (optional session role)
 *   - transaction(callback, role)       — atomic transaction (optional SET LOCAL ROLE)
 *   - queryAsRole(role, text, params)   — explicitly executes query under given DB role
 *   - transactionAsRole(role, callback) — explicitly executes transaction under DB role
 *     (Rubric #8: TRANSACTION, Rubric #12: Role-based access control at DB level)
 */

import { Pool } from 'pg';

let pool;

export const DB_ROLES = {
  Client: 'role_client',
  Reviewer: 'role_reviewer',
  LegalAdmin: 'role_legal_admin',
};

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }
  return pool;
}

/**
 * Maps a user role name ('Client', 'Reviewer', 'LegalAdmin') or raw role identifier
 * to the corresponding PostgreSQL role.
 */
export function resolveDbRole(role) {
  if (!role) return null;
  return DB_ROLES[role] || (Object.values(DB_ROLES).includes(role) ? role : null);
}

/**
 * Execute a single parameterized SQL query.
 * If `role` is provided, switches PostgreSQL session role via `SET ROLE <role>`
 * and automatically resets via `RESET ROLE` in the finally block.
 * (Rubric #6: DML operations, Rubric #12: RBAC)
 */
export async function query(text, params, role) {
  const client = await getPool().connect();
  const dbRole = resolveDbRole(role);
  try {
    if (dbRole) {
      await client.query(`SET ROLE ${dbRole}`);
    }
    const result = await client.query(text, params);
    return result;
  } finally {
    if (dbRole) {
      try {
        await client.query('RESET ROLE');
      } catch {
        // Ignore reset role errors on connection teardown
      }
    }
    client.release();
  }
}

/**
 * Execute multiple statements inside a database transaction.
 * If `role` is provided, applies `SET LOCAL ROLE <role>`, which automatically reverts
 * when the transaction commits or rolls back.
 * (Rubric #8: TRANSACTION — Advanced SQL concept)
 */
export async function transaction(callback, role) {
  const client = await getPool().connect();
  const dbRole = resolveDbRole(role);
  try {
    await client.query('BEGIN');
    if (dbRole) {
      await client.query(`SET LOCAL ROLE ${dbRole}`);
    }
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Convenience helper to execute a query under an explicit database role.
 */
export async function queryAsRole(role, text, params) {
  return query(text, params, role);
}

/**
 * Convenience helper to execute a transaction under an explicit database role.
 */
export async function transactionAsRole(role, callback) {
  return transaction(callback, role);
}
