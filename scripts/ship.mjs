#!/usr/bin/env node
/**
 * ship.mjs, the deploy as one script that stops on the first failed step
 * (ROADMAP H11, audit P-18, task Execution/P15/T1162-scripted-ship.md).
 *
 *   node scripts/ship.mjs                    dry run (the default): preflight, then
 *                                            the fast build and the css-routes proof
 *                                            for real, every live command printed
 *   node scripts/ship.mjs --check            preflight only
 *   node scripts/ship.mjs --live             the deploy, owner only, from main
 *   node scripts/ship.mjs --live --from <id> resume at a step after fixing a failure
 *   node scripts/ship.mjs --fail-at <id>     seed a failure at a step (tests the stop)
 *
 * The steps are the Deploy line of CLAUDE.md, in its order:
 *   build      VITE_E2E_SEAMS= npm run build:pages
 *   css        node scripts/css-routes.mjs --check dist/assets
 *   data       node scripts/r2/push-data.mjs --live          data first
 *   preview    npx wrangler pages deploy dist --project-name carta-app --branch preview
 *   main       npx wrangler pages deploy dist --project-name carta-app --branch main
 *   prune      node scripts/r2/push-data.mjs --live --prune  asks for a typed "delete"
 *
 * A step that exits non-zero stops the ship: nothing after it runs, and the
 * summary names the step and the --from line that resumes there. The prune
 * keeps its own typed confirmation (no --yes), so the one destructive step
 * still waits for the owner.
 *
 * Preflight (both modes): the stale continent-app/.git (warning), node_modules
 * present, the branch, a clean tree and the disk. A dry run reports a wrong
 * branch, a dirty tree or a small disk as warnings; a live ship refuses them.
 *
 * Dry-run twins: build runs the fast build (scripts/vite.fast.mjs, publicDir
 * off) into .fastbuild/ and css runs the real proof on it, because both are
 * read-only for the site. The data, deploy and prune steps have no harmless
 * twin, so a dry run only prints them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REPO_ROOT, git, checkStaleNestedGit, checkDisk } from './toolbox-checks.mjs';

const GB = 1024 ** 3;
/** The full build with public/ needs about 1.3 GB (CLAUDE.md); keep a margin. */
export const LIVE_DISK_BYTES = 1.5 * GB;

/** The deploy steps, in CLAUDE.md's order. */
export function shipSteps({ repoRoot = REPO_ROOT, fastOut } = {}) {
  const app = path.join(repoRoot, 'continent-app');
  const out = fastOut || path.join(repoRoot, '.fastbuild');
  const node = process.execPath;
  return [
    {
      id: 'build', label: 'production build (build:pages)', cwd: app,
      cmd: 'npm', args: ['run', 'build:pages'], env: { VITE_E2E_SEAMS: '' },
      dry: { label: 'fast build into .fastbuild', cmd: node,
        args: [path.join(app, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', path.join(repoRoot, 'scripts', 'vite.fast.mjs')],
        env: { FAST_OUT: out } },
    },
    {
      id: 'css', label: 'css-routes proof on dist/assets', cwd: app,
      cmd: node, args: ['scripts/css-routes.mjs', '--check', 'dist/assets'],
      dry: { label: 'css-routes proof on .fastbuild/assets', cmd: node,
        args: ['scripts/css-routes.mjs', '--check', path.join(out, 'assets')] },
    },
    { id: 'data', label: 'data to R2 (phase 1)', cwd: app, cmd: node, args: ['scripts/r2/push-data.mjs', '--live'] },
    { id: 'preview', label: 'Pages deploy, preview', cwd: app, cmd: 'npx',
      args: ['wrangler', 'pages', 'deploy', 'dist', '--project-name', 'carta-app', '--branch', 'preview'] },
    { id: 'main', label: 'Pages deploy, production', cwd: app, cmd: 'npx',
      args: ['wrangler', 'pages', 'deploy', 'dist', '--project-name', 'carta-app', '--branch', 'main'] },
    { id: 'prune', label: 'prune stale R2 objects (typed confirmation)', cwd: app, cmd: node,
      args: ['scripts/r2/push-data.mjs', '--live', '--prune'], interactive: true },
  ];
}

/** The checks before any step. Returns [{ level, msg }]. */
export function preflight({ repoRoot = REPO_ROOT, live = false, needBytes = LIVE_DISK_BYTES } = {}) {
  const soft = live ? 'fail' : 'warn';
  const out = [checkStaleNestedGit(repoRoot)];
  const nm = path.join(repoRoot, 'continent-app', 'node_modules');
  out.push(fs.existsSync(nm)
    ? { level: 'ok', msg: 'continent-app/node_modules present' }
    : { level: 'fail', msg: 'continent-app/node_modules missing: run npm ci in continent-app' });
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot);
  out.push(branch === 'main'
    ? { level: 'ok', msg: 'on main' }
    : { level: soft, msg: `on ${branch ?? 'an unknown branch'}, a deploy ships main only` });
  const dirty = git(['status', '--porcelain', '--untracked-files=no'], repoRoot);
  out.push(dirty === ''
    ? { level: 'ok', msg: 'tracked files clean' }
    : { level: soft, msg: dirty == null ? 'git status failed' : `${dirty.split('\n').length} tracked file(s) changed: commit first` });
  const disk = checkDisk(repoRoot, needBytes);
  out.push(disk.level === 'fail' ? { ...disk, level: soft } : disk);
  return out;
}

function quote(a) {
  return /^[\w./:=@-]+$/.test(a) ? a : JSON.stringify(a);
}

export function commandLine(step) {
  const env = Object.entries(step.env || {}).map(([k, v]) => `${k}=${quote(v)}`);
  return [...env, step.cmd === process.execPath ? 'node' : step.cmd, ...step.args.map(quote)].join(' ');
}

/** Default runner: inherit stdio, so the owner sees each tool's own output. */
export function spawnRunner(step) {
  const r = spawnSync(step.cmd, step.args, {
    cwd: step.cwd,
    env: { ...process.env, ...(step.env || {}) },
    stdio: 'inherit',
    // npm and npx are .cmd files on Windows and need a shell; none of these
    // arguments carries a space or a shell character.
    shell: process.platform === 'win32' && (step.cmd === 'npm' || step.cmd === 'npx'),
  });
  return r.status ?? 1;
}

/**
 * Run the ship. Returns { ok, failed, ran, skipped, checks }.
 *   live     run the live commands (else the dry twins, and print the rest)
 *   from     skip the steps before this id (resume)
 *   failAt   seed a failure at this id: the step reports exit 1 and runs nothing
 *   runner   (step) => exit code; tests pass a fake
 */
export function runShip({ repoRoot = REPO_ROOT, live = false, from = null, failAt = null, runner = spawnRunner,
  log = console.log, steps = shipSteps({ repoRoot }), checks = preflight({ repoRoot, live }) } = {}) {
  const ids = steps.map((s) => s.id);
  for (const id of [from, failAt]) {
    if (id && !ids.includes(id)) throw new Error(`unknown step "${id}" (steps: ${ids.join(', ')})`);
  }
  log(`[ship] ${live ? 'LIVE' : 'dry run'}: ${ids.join(' > ')}`);
  for (const c of checks) log(`[ship] preflight ${c.level.padEnd(4)} ${c.msg}`);
  const blocking = checks.filter((c) => c.level === 'fail');
  if (blocking.length) {
    log(`[ship] stopped at preflight: ${blocking.length} failed check(s); nothing ran`);
    return { ok: false, failed: 'preflight', ran: [], skipped: ids, checks };
  }
  const ran = [];
  const skipped = [];
  let started = !from;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!started && step.id === from) started = true;
    if (!started) { skipped.push(step.id); continue; }
    const n = `${i + 1}/${steps.length}`;
    const twin = live ? null : step.dry ? { ...step, ...step.dry } : null;
    if (!live && !twin) {
      log(`[ship] ${n} ${step.id}: would run  ${commandLine(step)}`);
      if (step.id === failAt) return stop(step, 1, ran, skipped, steps, i, log, checks);
      ran.push(step.id);
      continue;
    }
    const run = twin || step;
    log(`[ship] ${n} ${step.id}: ${run.label}\n[ship]   $ ${commandLine(run)}`);
    const code = step.id === failAt ? 1 : runner(run);
    if (code !== 0) return stop(step, code, ran, skipped, steps, i, log, checks, step.id === failAt);
    ran.push(step.id);
  }
  log(`[ship] done: ${ran.join(', ')}${live ? '' : ' (dry run: nothing reached the site or R2)'}`);
  return { ok: true, failed: null, ran, skipped, checks };
}

function stop(step, code, ran, skipped, steps, i, log, checks, seeded = true) {
  const rest = steps.slice(i + 1).map((s) => s.id);
  log(`[ship] FAILED at ${step.id} (exit ${code}${seeded ? ', seeded' : ''}); not run: ${rest.join(', ') || 'none'}`);
  log(`[ship] fix it, then resume: node scripts/ship.mjs --live --from ${step.id}`);
  return { ok: false, failed: step.id, code, ran, skipped: [...skipped, ...rest], checks };
}

function parseArgs(argv) {
  const opt = { live: false, check: false, from: null, failAt: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--live') opt.live = true;
    else if (a === '--dry-run') opt.live = false;
    else if (a === '--check') opt.check = true;
    else if (a === '--from') opt.from = argv[++i];
    else if (a === '--fail-at') opt.failAt = argv[++i];
    else if (a === '-h' || a === '--help') opt.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return opt;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  let opt;
  try {
    opt = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`[ship] ${e.message}`);
    process.exit(2);
  }
  if (opt.help) {
    const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
    console.log(src.split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ \* ?/gm, ''));
    process.exit(0);
  }
  if (opt.check) {
    const checks = preflight({ live: opt.live });
    for (const c of checks) console.log(`[ship] preflight ${c.level.padEnd(4)} ${c.msg}`);
    process.exit(checks.some((c) => c.level === 'fail') ? 1 : 0);
  }
  let res;
  try {
    res = runShip({ live: opt.live, from: opt.from, failAt: opt.failAt });
  } catch (e) {
    console.error(`[ship] ${e.message}`);
    process.exit(2);
  }
  process.exit(res.ok ? 0 : 1);
}
