import { Pool, PoolClient } from "pg";

const DB_URL = process.env.DATABASE_URL;

if ( !DB_URL ) throw new Error("[ DB_URL ] url is not set in the env");

/**
 * @set the config according to the project system specs availability
 */
export const pool = new Pool({
    connectionString: DB_URL,
    max: +(process.env.PG_POOL_MAX || 20),
    min: +(process.env.PG_POOL_MIN || 0),
    idleTimeoutMillis: +(process.env.PG_IDLE_TIMEOUT_MS || 30_000),
    connectionTimeoutMillis: +(process.env.PG_CONNECT_TIMEOUT_MS || 10_000),
    maxUses: +(process.env.PG_MAX_USES || 7_500),
    allowExitOnIdle: false,
    keepAlive: true,
    application_name: process.env.PG_APP_NAME || `zauck_app`,
    statement_timeout: +(process.env.PG_STATEMENT_TIMEOUT_MS || 30_000),
    query_timeout: +(process.env.PG_QUERY_TIMEOUT_MS || 30_000)
})

pool.on(`error`, err => {
    console.error('[pg] idle client error:', err instanceof Error ? err.message : err);
})

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const out = await fn(client);
        await client.query('COMMIT');
        return out;
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
        throw err;
    } finally {
        client.release();
    }
}

let closing: Promise<void> | null = null;

export function closePool(): Promise<void> {
    return (closing ??= pool.end());
}
export type * from "./schema"