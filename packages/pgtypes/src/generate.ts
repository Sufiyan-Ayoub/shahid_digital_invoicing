/**
 * @zuack/pgtypes — zero-runtime Postgres → TypeScript type generator.
 *
 * Connects to a live database, introspects its schema, and produces a single
 * block of TypeScript containing nothing but `enum` / `type` / `interface`
 * declarations. The (optional) type output is erased by TypeScript at build
 * time, so the generated file costs nothing at runtime.
 *
 * This module is the pure library surface: it returns the generated source as
 * a string and never touches the filesystem. See `cli.ts` for the command-line
 * wrapper that writes the result to disk.
 */

import pg from 'pg';
const { Client } = pg;

// ---------- public API ----------
export interface GenerateOptions {
    /** Postgres connection string, e.g. postgresql://user:pass@host:5432/db */
    connectionString: string;
    /** Schemas to introspect. Default: ['public']. */
    schemas?: string[];
    /**
     * How to emit Postgres enums.
     *  - 'enum'  → `export enum Role { Admin = 'admin', ... }` (default)
     *  - 'union' → `export type Role = 'admin' | 'user';` (zero-runtime)
     */
    enumStyle?: 'enum' | 'union';
}

export interface GenerateResult {
    /** The generated TypeScript source. */
    code: string;
    /** Number of table interfaces emitted. */
    tableCount: number;
    /** Number of enums emitted. */
    enumCount: number;
}

// ---------- postgres udt_name -> TS type ----------
// Keyed by udt_name (the underlying storage type). Values reflect what the
// node-postgres driver actually returns for that type with its DEFAULT parsers.
const SCALAR: Record<string, string> = {
    bool: 'boolean',
    int2: 'number',
    int4: 'number',
    int8: 'string', // bigint: pg returns as string to avoid precision loss
    float4: 'number',
    float8: 'number',
    numeric: 'string', // arbitrary precision: pg returns as string
    money: 'string',
    text: 'string',
    varchar: 'string',
    bpchar: 'string',
    char: 'string',
    name: 'string',
    citext: 'string',
    uuid: 'string',
    json: 'Json',
    jsonb: 'Json',
    date: 'Date',
    timestamp: 'Date',
    timestamptz: 'Date',
    time: 'string',
    timetz: 'string',
    interval: 'string',
    bytea: 'Buffer',
    inet: 'string',
    cidr: 'string',
    macaddr: 'string',
    macaddr8: 'string',
    bit: 'string',
    varbit: 'string',
    xml: 'string',
    tsvector: 'string',
    tsquery: 'string',
};

// ---------- naming ----------
const pascal = (s: string) =>
    s
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map((w) => w[0]!.toUpperCase() + w.slice(1))
        .join('');

const typeBase = (schema: string, table: string) =>
    (schema === 'public' ? '' : pascal(schema)) + pascal(table);

const dbKey = (schema: string, table: string) =>
    schema === 'public' ? table : `${schema}.${table}`;

// ---------- introspection types ----------
type Col = {
    schema: string;
    table: string;
    name: string;
    udt: string; // udt_name
    dataType: string; // information_schema data_type (e.g. 'ARRAY', 'USER-DEFINED')
    nullable: boolean;
    hasDefault: boolean;
    isIdentity: boolean;
};

/**
 * Introspect a Postgres database and return generated TypeScript source.
 */
export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
    const schemas = opts.schemas?.length ? opts.schemas : ['public'];
    const enumStyle = opts.enumStyle ?? 'enum';

    const client = new Client({ connectionString: opts.connectionString });
    await client.connect();

    const schemaList = schemas.map((s) => `'${s}'`).join(', ');

    // enums: type name -> ordered labels
    const enumRes = await client.query<{ schema: string; name: string; labels: string[] }>(
        `SELECT n.nspname AS schema, t.typname AS name,
                array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
         FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
         JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname IN (${schemaList})
         GROUP BY 1, 2`,
    );
    const enums = new Map<string, string[]>(); // udt_name -> labels
    for (const r of enumRes.rows) enums.set(r.name, r.labels);

    // columns of base tables
    const colRes = await client.query<{
        table_schema: string;
        table_name: string;
        column_name: string;
        udt_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
        is_identity: string;
    }>(
        `SELECT c.table_schema, c.table_name, c.column_name, c.udt_name,
                c.data_type, c.is_nullable, c.column_default, c.is_identity
         FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name
         WHERE c.table_schema IN (${schemaList})
           AND t.table_type = 'BASE TABLE'
         ORDER BY c.table_schema, c.table_name, c.ordinal_position`,
    );

    await client.end();

    // group columns by table
    const tables = new Map<string, Col[]>();
    for (const r of colRes.rows) {
        const key = `${r.table_schema}.${r.table_name}`;
        const col: Col = {
            schema: r.table_schema,
            table: r.table_name,
            name: r.column_name,
            udt: r.udt_name,
            dataType: r.data_type,
            nullable: r.is_nullable === 'YES',
            hasDefault: r.column_default !== null,
            isIdentity: r.is_identity === 'YES',
        };
        (tables.get(key) ?? tables.set(key, []).get(key)!).push(col);
    }

    // map one column's udt to a TS type expression (without null)
    const tsType = (col: Col): string => {
        // arrays: data_type = 'ARRAY', udt_name = '_<element>'
        if (col.dataType === 'ARRAY' && col.udt.startsWith('_')) {
            const el = col.udt.slice(1);
            const inner = enums.has(el) ? pascal(el) : SCALAR[el] ?? 'unknown';
            return `${inner}[]`;
        }
        if (enums.has(col.udt)) return pascal(col.udt);
        return SCALAR[col.udt] ?? 'unknown';
    };

    // ---------- emit ----------
    const L: string[] = [];
    L.push('// ⚠️ AUTO-GENERATED by @zuack/pgtypes — do not edit by hand.');
    L.push('// Regenerate with the pgtypes CLI.');
    L.push('');
    L.push('export type Json =');
    L.push('    | string | number | boolean | null');
    L.push('    | { [key: string]: Json }');
    L.push('    | Json[];');
    L.push('');

    // enums
    if (enums.size) {
        L.push('// ---------- enums ----------');
        for (const [name, labels] of [...enums].sort((a, b) => a[0].localeCompare(b[0]))) {
            if (enumStyle === 'union') {
                const union = labels.map((v) => `'${v.replace(/'/g, "\\'")}'`).join(' | ');
                L.push(`export type ${pascal(name)} = ${union};`);
            } else {
                L.push(`export enum ${pascal(name)} {`);
                for (const v of labels) {
                    // PascalCase the member key so `in_active` -> `InActive`
                    const p = pascal(v);
                    const key = /^[0-9]/.test(p) ? `_${p}` : p;
                    const val = v.replace(/'/g, "\\'");
                    // quote the key when it isn't a valid bare identifier
                    const lhs = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `'${key}'`;
                    L.push(`    ${lhs} = '${val}',`);
                }
                L.push('}');
            }
        }
        L.push('');
    }

    // tables
    const dbEntries: string[] = [];
    for (const [, cols] of [...tables].sort((a, b) => a[0].localeCompare(b[0]))) {
        const { schema, table } = cols[0]!;
        const base = typeBase(schema, table);

        // Row — the shape a SELECT returns
        L.push(`// ---------- ${dbKey(schema, table)} ----------`);
        L.push(`export interface ${base}Row {`);
        for (const c of cols) {
            const t = tsType(c) + (c.nullable ? ' | null' : '');
            L.push(`    ${c.name}: ${t};`);
        }
        L.push('}');

        // Insert — defaulted / nullable / identity columns are optional
        L.push(`export interface ${base}Insert {`);
        for (const c of cols) {
            const optional = c.hasDefault || c.nullable || c.isIdentity;
            const t = tsType(c) + (c.nullable ? ' | null' : '');
            L.push(`    ${c.name}${optional ? '?' : ''}: ${t};`);
        }
        L.push('}');

        // Update — every column optional
        L.push(`export type ${base}Update = Partial<${base}Row>;`);
        L.push('');

        dbEntries.push(
            `    '${dbKey(schema, table)}': { Row: ${base}Row; Insert: ${base}Insert; Update: ${base}Update };`,
        );
    }

    // one map for generic helpers if desired
    L.push('// ---------- registry ----------');
    L.push('export interface DB {');
    L.push(...dbEntries);
    L.push('}');
    L.push('');

    return { code: L.join('\n'), tableCount: tables.size, enumCount: enums.size };
}
