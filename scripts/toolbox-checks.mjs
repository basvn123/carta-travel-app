// Toolbox checks shared by scripts/ship.mjs and scripts/worktree.mjs (H11, T1162).
//
// Each check returns { level, msg } with level 'ok', 'warn' or 'fail'. A caller
// decides what stops it: ship stops on 'fail' only, and only a live ship turns
// the softer findings into 'fail'.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Run git in a directory; returns trimmed stdout, or null when git fails. */
export function git(args, cwd = REPO_ROOT) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * The stale nested repo (P-19): continent-app/.git, no remote, master stuck at
 * T915. `git -C continent-app status` inside it shows hundreds of false
 * changes, and a commit there is lost. Only the owner removes it (it lives on
 * the laptop), so this warns and never fails.
 */
export function checkStaleNestedGit(repoRoot = REPO_ROOT) {
  const nested = path.join(repoRoot, 'continent-app', '.git');
  if (!fs.existsSync(nested)) return { level: 'ok', msg: 'no stale continent-app/.git' };
  return {
    level: 'warn',
    msg: 'stale continent-app/.git exists (no remote, stuck at T915): commit app work in the root repo only; '
      + 'the owner removes it (Execution/P15/T1162-scripted-ship.md, owner step T1162-a)',
  };
}

/** Free bytes on the volume that holds dir, or null when the platform cannot say. */
export function freeBytes(dir) {
  try {
    const s = fs.statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

export function checkDisk(dir, needBytes) {
  const free = freeBytes(dir);
  const gb = (n) => (n / 1024 ** 3).toFixed(1);
  if (free == null) return { level: 'warn', msg: 'free disk unknown' };
  if (free < needBytes) return { level: 'fail', msg: `free disk ${gb(free)} GB, the step needs about ${gb(needBytes)} GB` };
  return { level: 'ok', msg: `free disk ${gb(free)} GB` };
}
