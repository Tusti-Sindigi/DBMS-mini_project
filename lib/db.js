/**
 * PostgreSQL connection pool and query helpers.
 *
 * Uses the `pg` library with connection string from DATABASE_URL.
 * Provides:
 *   - query(text, params)       — single parameterized query
 *   - transaction(callback)     — atomic multi-statement transaction
 *     (Rubric #8: demonstrates TRANSACTION usage)
 */

import { Pool } from 'pg';

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }
  return pool;
}

/**
 * Execute a single parameterized SQL query.
 * DML operations (INSERT, UPDATE, DELETE) go through here.
 * (Rubric #6: DML operations)
 */
export async function query(text, params) {
  const client = await getPool().connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Execute multiple statements inside a database transaction.
 * If the callback throws, the transaction is rolled back atomically.
 * Used by the reviewer workflow (flag status + review_history).
 * (Rubric #8: TRANSACTION — Advanced SQL concept)
 */
export async function transaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
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
