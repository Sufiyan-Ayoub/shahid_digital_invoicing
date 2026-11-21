/**
 * Postgres pool benchmark. Measures throughput (ops/sec) and latency
 * percentiles for a few query shapes at a given concurrency.
 *
 * Run:   pnpm bench
 *        pnpm bench -- --total 5000 --concurrency 32
 *
 * Flags:
 *   --total <n>        total queries per workload   (default 3000)
 *   --concurrency <n>  in-flight queries            (default: pool max)
 */

import { pool, poolConfig, poolInfo, closePool } from '../../src/db/index.ts';
import { performance } from 'node:perf_hooks';

// ---------- args ----------
const arg = (name: string, fallback: number): number => {
    const i = process.argv.indexOf(`--${name}`);
    if (i !== -1 && process.argv[i + 1]) {
        const n = Number(process.argv[i + 1]);
        if (Number.isFinite(n)) return n;
    }
    return fallback;
};

const TOTAL = arg('total', 3000);
const CONCURRENCY = arg('concurrency', poolConfig.max ?? 10);

// ---------- runner ----------
type Result = {
    name: string;
    ops: number;
    concurrency: number;
    seconds: number;
    opsPerSec: number;
    avgMs: number;
    minMs: number;
    p50: number;
    p95: number;
    p99: number;
    maxMs: number;
};

async function bench(name: string, fn: (i: number) => Promise<unknown>): Promise<Result> {
    // warmup (fills the pool, JITs the path) — not measured
    const warm = Math.min(CONCURRENCY * 2, TOTAL);
    await Promise.all(Array.from({ length: warm }, (_v, i) => fn(i)));

    const latencies = new Float64Array(TOTAL);
    let next = 0;
    const take = () => (next < TOTAL ? next++ : -1);

    const worker = async () => {
        let i: number;
        while ((i = take()) !== -1) {
            const t0 = performance.now();
            await fn(i);
            latencies[i] = performance.now() - t0;
        }
    };

    const start = performance.now();
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    const seconds = (performance.now() - start) / 1000;

    const sorted = Array.from(latencies).sort((a, b) => a - b);
    const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
        name,
        ops: TOTAL,
        concurrency: CONCURRENCY,
        seconds,
        opsPerSec: TOTAL / seconds,
        avgMs: sum / TOTAL,
        minMs: sorted[0]!,
        p50: pct(50),
        p95: pct(95),
        p99: pct(99),
        maxMs: sorted[sorted.length - 1]!,
    };
}

const fmt = (n: number, d = 2) => n.toFixed(d);

function printResult(r: Result) {
    console.log(
        `\n▸ ${r.name}\n` +
        `  ${r.ops} ops @ concurrency ${r.concurrency} in ${fmt(r.seconds)}s\n` +
        `  throughput : ${fmt(r.opsPerSec, 0)} ops/sec\n` +
        `  latency ms : avg ${fmt(r.avgMs)}  min ${fmt(r.minMs)}  p50 ${fmt(r.p50)}  p95 ${fmt(r.p95)}  p99 ${fmt(r.p99)}  max ${fmt(r.maxMs)}`,
    );
}

async function main() {
    if (!process.env['DATABASE_URL']) {
        console.error('✗ DATABASE_URL not set — cannot benchmark.');
        process.exit(1);
    }

    console.log('=== pg pool benchmark ===');
    console.log('host/pool:', poolInfo());
    console.log(`workload : total=${TOTAL} concurrency=${CONCURRENCY}`);

    // ensure the users table exists for the "real query" workload; fall back gracefully
    let hasUsers = false;
    try {
        await pool.query('SELECT 1 FROM users LIMIT 1');
        hasUsers = true;
    } catch { /* table missing — skip that workload */ }

    const results: Result[] = [];
    results.push(await bench('SELECT 1 (no params)', () => pool.query('SELECT 1')));
    results.push(await bench('SELECT $1::int (param)', (i) => pool.query('SELECT $1::int AS n', [i])));
    if (hasUsers) {
        results.push(await bench('SELECT id FROM users LIMIT 1', () => pool.query('SELECT id FROM users LIMIT 1')));
    } else {
        console.log('\n(skipping users workload — table not found)');
    }

    results.forEach(printResult);

    console.log('\n=== summary (ops/sec) ===');
    for (const r of results) console.log(`  ${r.name.padEnd(28)} ${fmt(r.opsPerSec, 0)}`);

    await closePool();
}

main().catch(async (err) => {
    console.error('✗ benchmark failed:', err instanceof Error ? err.message : err);
    await closePool();
    process.exit(1);
});
