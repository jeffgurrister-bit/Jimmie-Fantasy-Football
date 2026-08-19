import pg from 'pg';

/**
 * Postgres numerics arrive as strings by default so that arbitrary precision
 * survives the trip. Every numeric in this schema is a fantasy football score
 * or a point differential, well inside float range, and the app wants numbers.
 * 1700 = numeric, 20 = int8.
 */
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number.parseFloat(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : Number.parseInt(v, 10)));

export type Pool = pg.Pool;
/** Re-exported so packages that only pass a client around need not depend on pg. */
export type PoolClient = pg.PoolClient;

let pool: pg.Pool | undefined;

/**
 * Whether a database is configured at all.
 *
 * The site is deployed before the database exists, and must build and render
 * without one — so every page asks this rather than throwing. A missing
 * DATABASE_URL is a normal state ("not connected yet"), not an error.
 */
export function isDatabaseConfigured(): boolean {
  return typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL !== '';
}

export function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and fill in the ' +
        'Supabase connection string (Project Settings -> Database -> Connection string).',
    );
  }
  return url;
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: connectionString(),
      max: Number(process.env.PGPOOL_MAX ?? 5),
      // Supabase requires TLS but serves a cert the default CA set will reject
      // when connecting through the pooler.
      ssl: process.env.PGSSL_DISABLE === '1' ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params as unknown[]);
  return result.rows;
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(sql, params);
  return rows[0];
}

/** Runs `fn` inside a transaction, rolling back on any thrown error. */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
