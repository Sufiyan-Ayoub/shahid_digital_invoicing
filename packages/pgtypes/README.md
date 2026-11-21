# @zuack/pgtypes

> Zero-runtime **Postgres → TypeScript** type generator, by Zuack.

Point it at a live Postgres database and it introspects the schema and emits a
single file of `enum` / `type` / `interface` declarations. Use them with the raw
[`pg`](https://node-postgres.com) driver to get full type-safety — no ORM, no
runtime overhead.

## Install

```bash
npm i -D @zuack/pgtypes
# or
pnpm add -D @zuack/pgtypes
```

## CLI

```bash
pgtypes --out src/db/schema.ts --schema public --db "$DATABASE_URL"
```

`DATABASE_URL` is read from the environment (and from a local `.env` if you have
`dotenv` installed) when `--db` is omitted.

| Option | Default | Description |
| --- | --- | --- |
| `--out <path>` | `src/db/schema.ts` | Output file |
| `--schema <list>` | `public` | Comma-separated schemas |
| `--db <url>` | `$DATABASE_URL` | Connection string |
| `--enum-style <style>` | `enum` | `enum` or `union` |

Add it as a script:

```json
{
  "scripts": {
    "db:types": "pgtypes --out src/db/schema.ts"
  }
}
```

## Programmatic

```ts
import { generate } from '@zuack/pgtypes';
import { writeFileSync } from 'node:fs';

const { code, tableCount, enumCount } = await generate({
  connectionString: process.env.DATABASE_URL!,
  schemas: ['public'],
  enumStyle: 'enum',
});

writeFileSync('src/db/schema.ts', code);
console.log(`Generated ${tableCount} tables, ${enumCount} enums`);
```

## Using the output

```ts
import type { UsersRow } from './db/schema';

const { rows } = await pool.query<UsersRow>(
  'SELECT * FROM users WHERE id = $1',
  [id],
);
```

For every table you get three shapes:

- `XxxRow` — what a `SELECT *` returns
- `XxxInsert` — insert payload (defaulted / nullable / identity columns optional)
- `XxxUpdate` — `Partial<XxxRow>`

Plus a `DB` registry interface mapping table names to their `Row`/`Insert`/`Update`.

## License

MIT © Zuack
