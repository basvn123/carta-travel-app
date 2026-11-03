// Fast build (NOPUBLIC) for measuring a task: the app's own vite config with
// publicDir off, so it skips copying public/ (about 1 GB). Its assets/ and
// index.html match a full build's. About 10 seconds. Not for deploys.
//
//   cd continent-app
//   FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
//
// From a worktree of continent-app, set CARTA_APP to that worktree's path.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.CARTA_APP || path.resolve(here, '../continent-app');
const outDir = path.resolve(process.env.FAST_OUT || path.resolve(here, '../.fastbuild'));
const { default: base } = await import(pathToFileURL(path.join(root, 'vite.config.js')).href);

export default async ({ command, mode }) => {
  const cfg = typeof base === 'function' ? await base({ command, mode }) : base;
  return {
    ...cfg,
    root,
    publicDir: false,
    cacheDir: path.join(outDir, '.vite'),
    build: { ...(cfg.build || {}), outDir, emptyOutDir: true, reportCompressedSize: false },
    logLevel: 'warn',
  };
};
