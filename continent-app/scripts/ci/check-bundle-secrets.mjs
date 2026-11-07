#!/usr/bin/env node
/**
 * No browser bundle carries a privileged Supabase key (ROADMAP C4, T1078).
 *
 *   node scripts/ci/check-bundle-secrets.mjs ../.fastbuild
 *   node scripts/ci/check-bundle-secrets.mjs dist
 *
 * WHY A SCRIPT AND NOT A GREP. secret-scan.yml already greps the built
 * bundle for `sb_secret_` and the word `service_role`. That catches the new
 * secret key format and a key pasted as prose, but not the key the project
 * actually has: a legacy service role key is a JWT, and its payload
 * ({"role":"service_role",...}) is base64url, so the word never appears in
 * the file. This script finds every JWT-shaped string (three base64url
 * segments, the first two starting with eyJ), decodes the payload and fails
 * on any role other than `anon`, which is the public key the app is meant to
 * ship. A string that only looks like a JWT and does not decode is ignored.
 *
 * Scans every .js, .mjs, .css, .html, .json and .map file under the
 * directory. Exits 1 with the file and the decoded role (never the token
 * itself) on a finding, 2 when the directory is missing or holds no
 * JavaScript (a scan of nothing is not a pass), 0 otherwise.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const JWT = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}/g;
const SECRET_KEY = /sb_secret_[A-Za-z0-9_-]{8,}/g;
const SCANNED = /\.(m?js|css|html|json|map)$/i;

/** The payload of a JWT-shaped string, or null when it does not decode. */
export function jwtPayload(token) {
  const part = String(token).split('.')[1];
  if (!part) return null;
  try {
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const obj = JSON.parse(json);
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

/**
 * Every privileged credential in one file's text, as { kind, role }.
 * The anon key (role anon) is public by design and is not reported.
 */
export function findSecrets(text) {
  const found = [];
  for (const m of String(text).matchAll(JWT)) {
    const p = jwtPayload(m[0]);
    if (!p || typeof p.role !== 'string') continue;
    if (p.role !== 'anon') found.push({ kind: 'jwt', role: p.role });
  }
  for (const m of String(text).matchAll(SECRET_KEY)) {
    if (m[0]) found.push({ kind: 'sb_secret', role: 'secret' });
  }
  return found;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SCANNED.test(name)) out.push(full);
  }
  return out;
}

function main() {
  const dir = resolve(process.argv[2] || 'dist');
  if (!existsSync(dir)) {
    console.error(`check-bundle-secrets: ${dir} does not exist. Build first.`);
    process.exit(2);
  }
  const files = walk(dir);
  const js = files.filter((f) => /\.m?js$/i.test(f));
  if (js.length === 0) {
    console.error(`check-bundle-secrets: no JavaScript under ${dir}; a scan of nothing is not a pass.`);
    process.exit(2);
  }
  let jwts = 0;
  const bad = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    jwts += (text.match(JWT) || []).length;
    for (const s of findSecrets(text)) bad.push(`${relative(dir, f)}: ${s.kind} with role ${s.role}`);
  }
  if (bad.length) {
    console.error('::error::A privileged Supabase key is in the browser bundle. Remove it and rotate the key.');
    for (const b of bad) console.error(`  ${b}`);
    process.exit(1);
  }
  console.log(`check-bundle-secrets: ${files.length} files (${js.length} JavaScript), ${jwts} JWT-shaped strings, no privileged key.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
