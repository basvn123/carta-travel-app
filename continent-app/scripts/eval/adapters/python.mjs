/* Run a Python snippet from the repo root and read one JSON object from its last stdout line. */
import { spawnSync } from 'node:child_process';
import { REPO } from '../lib/results.mjs';

export const PYTHON = process.env.CARTA_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

export function runPython(code, { timeoutMs = 300000 } = {}) {
  const p = spawnSync(PYTHON, ['-I', '-c', code], { cwd: REPO, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  if (p.error) throw p.error;
  const lines = (p.stdout || '').trim().split('\n');
  let data = null;
  try { data = JSON.parse(lines[lines.length - 1]); } catch { /* reported below */ }
  if (!data) throw new Error(`python gave no JSON (exit ${p.status}): ${(p.stderr || '').slice(-800)}`);
  return data;
}
