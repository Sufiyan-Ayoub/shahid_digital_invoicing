#!/usr/bin/env node
/**
 * @zuack/pgtypes CLI.
 *
 *   pgtypes [--out src/db/schema.ts] [--schema public] [--db <url>] [--enum-style enum|union]
 *
 * Reads DATABASE_URL from the environment (a local .env is loaded automatically
 * when `dotenv` is available) unless overridden with --db.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { generate } from './generate.js';

// Best-effort .env loading: use it if the host project has dotenv installed,
// but never make it a hard dependency of this package.
async function loadEnv(): Promise<void> {
    try {
        await import('dotenv/config');
    } catch {
        /* dotenv not installed — rely on the ambient environment */
    }
}

function argOf(args: string[], name: string, fallback?: string): string | undefined {
    const i = args.indexOf(`--${name}`);
    return i !== -1 && args[i + 1] ? args[i + 1]! : fallback;
}

async function main() {
    await loadEnv();

    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log(
            [
                'pgtypes — Postgres → TypeScript type generator',
                '',
                'Usage:',
                '  pgtypes [options]',
                '',
                'Options:',
                '  --out <path>          Output file (default: src/db/schema.ts)',
                '  --schema <list>       Comma-separated schemas (default: public)',
                '  --db <url>            Connection string (default: $DATABASE_URL)',
                '  --enum-style <style>  enum | union (default: enum)',
                '  -h, --help            Show this help',
            ].join('\n'),
        );
        return;
    }

    const out = resolve(process.cwd(), argOf(args, 'out', 'src/db/schema.ts')!);
    const schemas = argOf(args, 'schema', 'public')!
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const connectionString = argOf(args, 'db', process.env['DATABASE_URL']);
    const enumStyle = (argOf(args, 'enum-style', 'enum') === 'union' ? 'union' : 'enum') as
        | 'enum'
        | 'union';

    if (!connectionString) {
        console.error('✗ No database URL. Set DATABASE_URL in your env or pass --db <url>.');
        process.exit(1);
    }

    const { code, tableCount, enumCount } = await generate({
        connectionString,
        schemas,
        enumStyle,
    });

    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, code, 'utf8');

    console.log(`✓ Generated ${tableCount} table type(s), ${enumCount} enum(s) → ${out}`);
}

main().catch((err) => {
    console.error('✗ pgtypes failed:', err instanceof Error ? err.message : err);
    process.exit(1);
});
