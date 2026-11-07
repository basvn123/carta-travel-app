#!/usr/bin/env node
/**
 * worktree.mjs, task worktrees made and removed safely on Windows and Linux
 * (ROADMAP H11, audit P-19, task Execution/P15/T1162-scripted-ship.md).
 *
 *   node scripts/worktree.mjs add <slug> [--branch <b>] [--base <ref>] [--link-node-modules]
 *   node scripts/worktree.mjs remove <slug|path> [--force]
 *   node scripts/worktree.mjs list
 *
 * Worktrees go in CARTA_WT when set, else C:/Users/Gebruiker/Documents/Portfolio/wt
 * on Windows (CLAUDE.md) and ../wt beside the repo elsewhere. A new branch is
 * p15-<slug> from origin/main unless --branch and --base say otherwise.
 *
 * --link-node-modules links continent-app/node_modules to the main checkout's
 * (a junction on Windows, a directory symlink elsewhere), so a worktree needs
 * no 1 GB install. public/ is never linked (CLAUDE.md, Disk and worktrees).
 *
 * Why remove is careful. `git worktree remove --force`, Git Bash `rm -rf` and
 * PowerShell `Remove-Item -Recurse` have all followed a node_modules junction
 * into the main checkout and deleted real files there (T162, T480 and others),
 * and `cmd /c rmdir` with a forward-slash path failed, which is how one of
 * those runs started. So remove:
 *   1. walks the worktree without following links (skipping .git and real
 *      node_modules) and finds every directory link;
 *   2. unlinks each one on its own (fs.unlinkSync removes the link, never its
 *      target; fs.rmdirSync is the fallback for a junction unlink refuses);
 *   3. checks that each link is gone and each target still has its entries,
 *      and stops before git if either check fails;
 *   4. only then runs `git worktree remove` (with --force only when asked)
 *      and `git worktree prune`.
 * It refuses the main checkout and any path git does not list as a worktree.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, git, checkStaleNestedGit } from './toolbox-checks.mjs';

const WINDOWS_WT = 'C:/Users/Gebruiker/Documents/Portfolio/wt';

export function wtRoot(repoRoot = REPO_ROOT, env = process.env, platform = process.platform) {
  if (env.CARTA_WT) return path.resolve(env.CARTA_WT);
  return platform === 'win32' ? path.resolve(WINDOWS_WT) : path.resolve(repoRoot, '..', 'wt');
}

function same(a, b) {
  const norm = (p) => {
    let r = path.resolve(p);
    try { r = fs.realpathSync.native(r); } catch { /* keep resolved */ }
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  return norm(a) === norm(b);
}

/** git worktree list as [{ path, branch }]; the first entry is the main checkout. */
export function listWorktrees(repoRoot = REPO_ROOT) {
  const out = git(['worktree', 'list', '--porcelain'], repoRoot);
  if (out == null) throw new Error('git worktree list failed');
  const trees = [];
  for (const block of out.split(/\n\s*\n/)) {
    const wt = block.match(/^worktree (.+)$/m);
    if (!wt) continue;
    const br = block.match(/^branch refs\/heads\/(.+)$/m);
    trees.push({ path: path.resolve(wt[1]), branch: br ? br[1] : null });
  }
  return trees;
}

/**
 * Every directory link under root, found without following any link. Real
 * node_modules folders and .git are not entered (their links are files git
 * removes as files). maxDepth bounds the walk: the links this repo makes sit
 * at depth 2 (continent-app/node_modules) or 3 (continent-app/public/<x>).
 */
export function findDirLinks(root, maxDepth = 4) {
  const links = [];
  const walk = (dir, depth) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      let st;
      try { st = fs.lstatSync(p); } catch { continue; }
      if (st.isSymbolicLink()) {
        let target = null;
        let isDir = false;
        let dangling = false;
        try { target = fs.readlinkSync(p); } catch { /* unreadable link */ }
        try { isDir = fs.statSync(p).isDirectory(); } catch { dangling = true; }
        // A link to a directory goes first; so does a dangling one, which may
        // be a junction whose target moved. A link to a file is left to git.
        if (isDir || dangling) links.push({ link: p, target, dangling });
        continue;
      }
      if (!st.isDirectory() || depth >= maxDepth) continue;
      if (e.name === '.git' || e.name === 'node_modules') continue;
      walk(p, depth + 1);
    }
  };
  walk(root, 1);
  return links;
}

function countEntries(dir) {
  try { return fs.readdirSync(dir).length; } catch { return null; }
}

/** Remove one link and never its target. Throws when the link survives. */
export function unlinkOnly(link) {
  try {
    fs.unlinkSync(link);
  } catch (e) {
    // Some Windows junctions refuse unlink (EPERM); rmdir removes a junction
    // itself and fails on a non-empty real directory instead of recursing.
    if (e.code !== 'EPERM' && e.code !== 'EISDIR') throw e;
    fs.rmdirSync(link);
  }
  let still = true;
  try { fs.lstatSync(link); } catch { still = false; }
  if (still) throw new Error(`link still present after unlink: ${link}`);
}

export function addWorktree(slug, { repoRoot = REPO_ROOT, branch, base = 'origin/main', linkNodeModules = false,
  root = wtRoot(repoRoot), log = console.log } = {}) {
  if (!/^[\w.-]+$/.test(slug)) throw new Error(`slug "${slug}" must be letters, digits, dot, dash or underscore`);
  const dest = path.join(root, slug);
  if (fs.existsSync(dest)) throw new Error(`${dest} already exists`);
  fs.mkdirSync(root, { recursive: true });
  const b = branch || `p15-${slug}`;
  const exists = git(['rev-parse', '--verify', '--quiet', `refs/heads/${b}`], repoRoot) != null;
  const args = exists ? ['worktree', 'add', dest, b] : ['worktree', 'add', '-b', b, dest, base];
  const r = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || '').trim()}`);
  log(`[worktree] added ${dest} on ${b}${exists ? '' : ` from ${base}`}`);
  if (linkNodeModules) {
    const target = path.join(repoRoot, 'continent-app', 'node_modules');
    const link = path.join(dest, 'continent-app', 'node_modules');
    if (!fs.existsSync(target)) throw new Error(`no ${target} to link: run npm ci in the main checkout`);
    if (fs.existsSync(link)) throw new Error(`${link} already exists`);
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    log(`[worktree] linked ${link} -> ${target}`);
    log('[worktree] the Vite dep cache under node_modules/.vite is shared: give a dev server its own cacheDir (row T162-d)');
  }
  const stale = checkStaleNestedGit(dest);
  if (stale.level !== 'ok') log(`[worktree] warning: ${stale.msg}`);
  return { path: dest, branch: b };
}

export function removeWorktree(which, { repoRoot = REPO_ROOT, force = false, root = wtRoot(repoRoot),
  log = console.log } = {}) {
  const trees = listWorktrees(repoRoot);
  const dest = fs.existsSync(which) ? path.resolve(which) : path.join(root, which);
  const hit = trees.find((t) => same(t.path, dest));
  if (!hit) throw new Error(`${dest} is not a worktree of this repo (git worktree list)`);
  if (same(hit.path, trees[0].path)) throw new Error('refusing to remove the main checkout');

  const links = findDirLinks(hit.path);
  const before = links.map((l) => ({ ...l, n: l.target ? countEntries(path.resolve(path.dirname(l.link), l.target)) : null }));
  for (const l of before) {
    unlinkOnly(l.link);
    log(`[worktree] unlinked ${l.link}${l.target ? ` (target ${l.target} kept)` : ''}`);
  }
  for (const l of before) {
    if (l.n == null) continue;
    const after = countEntries(path.resolve(path.dirname(l.link), l.target));
    if (after == null || after < l.n) {
      throw new Error(`target ${l.target} lost entries (${l.n} before, ${after ?? 'none'} after): stopped before git`);
    }
  }
  const left = findDirLinks(hit.path);
  if (left.length) throw new Error(`links remain, stopped before git: ${left.map((l) => l.link).join(', ')}`);

  const args = ['worktree', 'remove', ...(force ? ['--force'] : []), hit.path];
  const r = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed (links already removed; rerun with --force to drop local changes): ${(r.stderr || '').trim()}`);
  }
  spawnSync('git', ['worktree', 'prune'], { cwd: repoRoot });
  log(`[worktree] removed ${hit.path}${hit.branch ? ` (branch ${hit.branch} kept)` : ''}; pruned`);
  return { path: hit.path, unlinked: before.map((l) => l.link) };
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const flags = {};
  const pos = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--force') flags.force = true;
    else if (a === '--link-node-modules') flags.linkNodeModules = true;
    else if (a === '--branch') flags.branch = rest[++i];
    else if (a === '--base') flags.base = rest[++i];
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else pos.push(a);
  }
  if (cmd === 'add' && pos.length === 1) return addWorktree(pos[0], flags);
  if (cmd === 'remove' && pos.length === 1) return removeWorktree(pos[0], flags);
  if (cmd === 'list') {
    for (const t of listWorktrees()) {
      const links = findDirLinks(t.path);
      console.log(`${t.path}  ${t.branch ?? '(detached)'}${links.length ? `  links: ${links.map((l) => path.relative(t.path, l.link)).join(', ')}` : ''}`);
    }
    return null;
  }
  throw new Error('usage: worktree.mjs add <slug> [--branch b] [--base ref] [--link-node-modules] | remove <slug|path> [--force] | list');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`[worktree] ${e.message}`);
    process.exit(1);
  }
}
