/**
 * @zuack/pgtypes — public library entry point.
 *
 * Programmatic usage:
 *
 *   import { generate } from '@zuack/pgtypes';
 *
 *   const { code } = await generate({
 *     connectionString: process.env.DATABASE_URL!,
 *     schemas: ['public'],
 *   });
 *   // write `code` wherever you like
 */
export { generate } from './generate.js';
export type { GenerateOptions, GenerateResult } from './generate.js';
