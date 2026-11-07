/**
 * wire-table.mjs, render docs/SCHEMA.md's "Wire contract" table from
 * docs/wire.schema.json (T1133, ROADMAP D1).
 *
 *   node scripts/ci/wire-table.mjs           check: exit 1 if the table is stale
 *   node scripts/ci/wire-table.mjs --write   rewrite the table between its markers
 *
 * The schema is the contract; the table is its human view. check-contract.mjs
 * runs the same comparison, so a stale table fails CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WIRE_SCHEMA, writeWireTable, checkSchemaTable } from './contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_MD = path.join(process.env.CARTA_REPO_ROOT || path.join(HERE, '..', '..', '..'), 'docs', 'SCHEMA.md');

const md = fs.readFileSync(SCHEMA_MD, 'utf8');
if (process.argv.includes('--write')) {
  const out = writeWireTable(md, WIRE_SCHEMA);
  if (out !== md) fs.writeFileSync(SCHEMA_MD, out);
  console.log(out === md ? 'docs/SCHEMA.md wire table already current' : 'docs/SCHEMA.md wire table rewritten');
}
const problems = checkSchemaTable(fs.readFileSync(SCHEMA_MD, 'utf8'), WIRE_SCHEMA);
if (problems.length) {
  console.error(problems.map((p) => `FAIL  ${p}`).join('\n'));
  process.exit(1);
}
console.log('docs/SCHEMA.md wire table matches docs/wire.schema.json');
