/**
 * Pool + connectivity tests. Uses Node's built-in test runner (no deps).
 * Run: pnpm test
 *
 * DB-hitting tests skip automatically when DATABASE_URL is unset, so the suite
 * stays green in environments without a database.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, poolConfig, poolInfo, transaction, closePool } from '../../src/db/index.ts';

const HAS_DB = !!process.env['DATABASE_URL'];

after(async () => {
    await closePool();
});

// ---------- config (no DB needed) ----------

test('pool max is a sane, host-scaled number', () => {
    assert.ok(typeof poolConfig.max === 'number');
    assert.ok(poolConfig.max! >= 4 && poolConfig.max! <= 20, `max=${poolConfig.max}`);
});

test('poolInfo() reports sizing fields', () => {
    const info = poolInfo();
    assert.ok(info.cores >= 1);
    assert.equal(info.max, poolConfig.max);
    assert.equal(typeof info.idle, 'number');
    assert.equal(typeof info.waiting, 'number');
});

test('keepAlive and application_name are set', () => {
    assert.equal(poolConfig.keepAlive, true);
    assert.ok((poolConfig.application_name ?? '').length > 0);
});

// ---------- connectivity (needs DB) ----------

test('connects and runs SELECT 1', { skip: !HAS_DB && 'no DATABASE_URL' }, async () => {
    const { rows } = await pool.query<{ one: number }>('SELECT 1 AS one');
    assert.equal(rows[0]!.one, 1);
});

test('parameterized query round-trips values', { skip: !HAS_DB && 'no DATABASE_URL' }, async () => {
    const { rows } = await pool.query<{ v: number; s: string }>(
        'SELECT $1::int AS v, $2::text AS s',
        [42, 'hello'],
    );
    assert.equal(rows[0]!.v, 42);
    assert.equal(rows[0]!.s, 'hello');
});

test('handles concurrency well beyond pool size (queueing)', { skip: !HAS_DB && 'no DATABASE_URL' }, async () => {
    const N = (poolConfig.max ?? 10) * 4;
    const results = await Promise.all(
        Array.from({ length: N }, (_, i) =>
            pool.query<{ n: number }>('SELECT $1::int AS n', [i]),
        ),
    );
    assert.equal(results.length, N);
    results.forEach((r, i) => assert.equal(r.rows[0]!.n, i));
});

test('transaction commits on success', { skip: !HAS_DB && 'no DATABASE_URL' }, async () => {
    const out = await transaction(async (c) => {
        const { rows } = await c.query<{ v: number }>('SELECT 7 AS v');
        return rows[0]!.v;
    });
    assert.equal(out, 7);
});

test('transaction rolls back on throw', { skip: !HAS_DB && 'no DATABASE_URL' }, async () => {
    await assert.rejects(
        transaction(async (c) => {
            await c.query('SELECT 1');
            throw new Error('boom');
        }),
        /boom/,
    );
    // pool still usable afterwards
    const { rows } = await pool.query<{ ok: number }>('SELECT 1 AS ok');
    assert.equal(rows[0]!.ok, 1);
});
