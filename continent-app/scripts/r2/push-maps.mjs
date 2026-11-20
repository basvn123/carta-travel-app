#!/usr/bin/env node
/**
 * push-maps.mjs, upload the Carta basemap to R2 under data/maps/ (G12).
 *
 * The Explore map draws a Protomaps basemap from a Europe PMTiles extract on
 * our own data host (decision: .work/2026-11-20-map-view/decision.md "Base
 * map"). Three things go up, next to the app data so the same public host,
 * CORS rules and cache serve them:
 *
 *   data/maps/<name>.pmtiles           the extract (scripts/maps/refresh-basemap.mjs)
 *   data/maps/fonts/<stack>/<range>.pbf the Noto Sans glyphs from protomaps/basemaps-assets
 *   data/maps/sprites/v4/<theme>*       the light and dark sprites from the same repo
 *
 *   node scripts/r2/push-maps.mjs --pmtiles <file> --assets <basemaps-assets dir>   plan only
 *   node scripts/r2/push-maps.mjs ... --live                                        upload
 *
 * Either flag may be left out to upload only the other part. It only adds:
 * `rclone copy`/`copyto`, never sync or delete, so an older extract the live
 * site still names stays readable until the owner removes it by hand. The
 * pmtiles name carries its build date and is never rewritten, so it caches
 * for a year; a refresh is a new name plus one line in
 * src/lib/map/cartaMapStyle.js (BASEMAP_FILE). push-data.mjs keeps `maps`
 * out of its prune (OTHER_WRITERS).
 *
 * rclone reads the r2 remote from the environment, the same five variables as
 * push-data.mjs.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

export const MAPS_PREFIX = 'data/maps';
// Only the stacks the Carta style names; the Devanagari stack is 7 MB the
// map never asks for.
export const FONT_STACKS = Object.freeze(['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic']);
export const SPRITE_THEMES = Object.freeze(['light', 'dark']);
const YEAR = 'public, max-age=31536000, immutable';
const WEEK = 'public, max-age=604800';

/** The rclone commands for one upload. Exported for the test. */
export function mapsPlan({ pmtiles, assets, remote = 'r2', bucket = 'carta', dry = false } = {}) {
  const base = `${remote}:${bucket}/${MAPS_PREFIX}`;
  const common = ['--s3-no-check-bucket', '--checksum', ...(dry ? ['--dry-run'] : [])];
  const cmds = [];
  if (pmtiles) {
    const name = basename(pmtiles);
    if (!/^[a-z]+-\d{4}-\d{2}-\d{2}\.pmtiles$/.test(name)) {
      throw new Error(`${name}: name the extract <area>-YYYY-MM-DD.pmtiles (the build date), so it is never overwritten`);
    }
    // Large single file: multipart in 64 MiB parts, four at a time.
    cmds.push(['rclone', 'copyto', pmtiles, `${base}/${name}`, ...common,
      '--s3-chunk-size', '64M', '--s3-upload-concurrency', '4',
      '--header-upload', `Cache-Control: ${YEAR}`,
      '--header-upload', 'Content-Type: application/vnd.pmtiles']);
  }
  if (assets) {
    for (const stack of FONT_STACKS) {
      cmds.push(['rclone', 'copy', join(assets, 'fonts', stack), `${base}/fonts/${stack}`, ...common,
        '--transfers', '32', '--include', '*.pbf',
        '--header-upload', `Cache-Control: ${WEEK}`,
        '--header-upload', 'Content-Type: application/x-protobuf']);
    }
    const include = SPRITE_THEMES.flatMap((t) => ['--include', `${t}.*`, '--include', `${t}@2x.*`]);
    cmds.push(['rclone', 'copy', join(assets, 'sprites', 'v4'), `${base}/sprites/v4`, ...common,
      ...include, '--header-upload', `Cache-Control: ${WEEK}`]);
  }
  return cmds;
}

const quote = (a) => (/[\s"']/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
const show = (cmd) => cmd.map(quote).join(' ');

function main() {
  const pmtiles = arg('--pmtiles', null);
  const assets = arg('--assets', null);
  const live = has('--live');
  if (!pmtiles && !assets) {
    console.error('[push-maps] give --pmtiles <file> and/or --assets <basemaps-assets dir>');
    process.exit(1);
  }
  if (pmtiles && !existsSync(pmtiles)) { console.error(`[push-maps] ${pmtiles} not found`); process.exit(1); }
  if (assets && !existsSync(join(assets, 'fonts'))) { console.error(`[push-maps] ${assets}/fonts not found`); process.exit(1); }
  const cmds = mapsPlan({ pmtiles: pmtiles && resolve(pmtiles), assets: assets && resolve(assets),
    remote: arg('--remote', 'r2'), bucket: arg('--bucket', 'carta'), dry: has('--rclone-dry-run') });
  if (pmtiles) console.log(`extract ${basename(pmtiles)}: ${(statSync(pmtiles).size / 1e9).toFixed(2)} GB`);
  for (const c of cmds) {
    console.log(`$ ${show(c)}`);
    if (!live && !has('--rclone-dry-run')) continue;
    const r = spawnSync(c[0], c.slice(1), { stdio: 'inherit' });
    if (r.status !== 0) { console.error(`[push-maps] failed (exit ${r.status})`); process.exit(r.status || 1); }
  }
  if (!live) console.log('\nPlan only, nothing sent. Add --live to upload.');
  else if (pmtiles) console.log(`\nUploaded. Set BASEMAP_FILE = '${basename(pmtiles)}' in src/lib/map/cartaMapStyle.js.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
