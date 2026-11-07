// H11 (T1162): scripts/worktree.mjs removes a worktree's directory links on
// their own before git touches the tree, so a linked node_modules can never
// be deleted through the link (the T162 and T480 incidents). Runs on a
// throwaway repo in the temp folder; on Windows the link is a junction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { addWorktree, removeWorktree, findDirLinks, listWorktrees, wtRoot } from '../../scripts/worktree.mjs';
import { checkStaleNestedGit } from '../../scripts/toolbox-checks.mjs';

const quiet = () => {};

function sh(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-wt-'));
  const repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, 'continent-app'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'continent-app', 'package.json'), '{}\n');
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n');
  sh(repo, 'init', '-q', '-b', 'main');
  sh(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.');
  sh(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');
  // The main checkout's packages, with a canary that must survive every remove.
  const nm = path.join(repo, 'continent-app', 'node_modules');
  fs.mkdirSync(path.join(nm, 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(nm, 'pkg', 'canary.js'), 'keep me\n');
  return { base, repo, nm, root: path.join(base, 'wt') };
}

test('add links node_modules; remove unlinks it first and keeps the target', () => {
  const { base, repo, nm, root } = fixture();
  try {
    const wt = addWorktree('demo', { repoRoot: repo, base: 'main', linkNodeModules: true, root, log: quiet });
    assert.equal(wt.branch, 'p15-demo');
    const link = path.join(wt.path, 'continent-app', 'node_modules');
    assert.ok(fs.lstatSync(link).isSymbolicLink());
    assert.ok(fs.existsSync(path.join(link, 'pkg', 'canary.js')));
    assert.deepEqual(findDirLinks(wt.path).map((l) => l.link), [link]);

    const res = removeWorktree('demo', { repoRoot: repo, root, log: quiet });
    assert.deepEqual(res.unlinked, [link]);
    assert.equal(fs.existsSync(wt.path), false);
    assert.equal(fs.readFileSync(path.join(nm, 'pkg', 'canary.js'), 'utf8'), 'keep me\n');
    assert.equal(listWorktrees(repo).length, 1);
    // The branch stays for the merge.
    assert.equal(sh(repo, 'branch', '--list', 'p15-demo').replace('*', '').trim(), 'p15-demo');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('remove with --force drops local changes and still keeps the target', () => {
  const { base, repo, nm, root } = fixture();
  try {
    const wt = addWorktree('dirty', { repoRoot: repo, base: 'main', linkNodeModules: true, root, log: quiet });
    fs.writeFileSync(path.join(wt.path, 'continent-app', 'package.json'), '{"changed":true}\n');
    assert.throws(() => removeWorktree('dirty', { repoRoot: repo, root, log: quiet }), /rerun with --force/);
    // The link went before git refused, and the target is whole.
    assert.equal(findDirLinks(wt.path).length, 0);
    assert.ok(fs.existsSync(path.join(nm, 'pkg', 'canary.js')));
    removeWorktree(wt.path, { repoRoot: repo, root, force: true, log: quiet });
    assert.equal(fs.existsSync(wt.path), false);
    assert.ok(fs.existsSync(path.join(nm, 'pkg', 'canary.js')));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('remove refuses the main checkout and paths git does not know', () => {
  const { base, repo, root } = fixture();
  try {
    assert.throws(() => removeWorktree(repo, { repoRoot: repo, root, log: quiet }), /main checkout/);
    assert.throws(() => removeWorktree('nope', { repoRoot: repo, root, log: quiet }), /not a worktree/);
    assert.throws(() => addWorktree('bad slug', { repoRoot: repo, root, log: quiet }), /slug/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('a dangling link is found and removed too', () => {
  const { base, repo, root } = fixture();
  try {
    const wt = addWorktree('gone', { repoRoot: repo, base: 'main', root, log: quiet });
    const link = path.join(wt.path, 'continent-app', 'public-x');
    fs.symlinkSync(path.join(base, 'missing'), link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(findDirLinks(wt.path)[0].dangling, true);
    // An untracked link is a local change to git, so --force here.
    removeWorktree('gone', { repoRoot: repo, root, force: true, log: quiet });
    assert.equal(fs.existsSync(wt.path), false);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('the worktree folder follows CARTA_WT, then the platform default', () => {
  assert.equal(wtRoot('/r', { CARTA_WT: '/x/wt' }, 'linux'), path.resolve('/x/wt'));
  assert.equal(wtRoot('/r/repo', {}, 'linux'), path.resolve('/r/wt'));
  assert.equal(wtRoot('/r', {}, 'win32'), path.resolve('C:/Users/Gebruiker/Documents/Portfolio/wt'));
});

test('the stale continent-app/.git check warns, never fails', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-stale-'));
  try {
    assert.equal(checkStaleNestedGit(base).level, 'ok');
    fs.mkdirSync(path.join(base, 'continent-app', '.git'), { recursive: true });
    const r = checkStaleNestedGit(base);
    assert.equal(r.level, 'warn');
    assert.match(r.msg, /stale continent-app\/\.git/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
