import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';
import { fileURLToPath } from 'node:url';
import { buildNumbersPage, dataPresent, NUMBERS_PATH } from './scripts/explainer/numbers.mjs';

// Vite 8 minifies CSS with Lightning CSS, and with no targets configured it
// decided `-webkit-backdrop-filter` alone covered everything it was aiming at
// and dropped the standard `backdrop-filter` from the build. Chromium does NOT
// honour the prefixed alias (verified at pixel level: the -webkit- spelling on
// its own renders byte-identical to no blur), so every blurred surface in the
// app - the header, the modals, the day map's filter card - shipped with the
// blur silently dead while dev looked correct. Naming real browsers makes
// Lightning CSS emit both spellings.
const CSS_TARGETS = browserslistToTargets(
  browserslist('>0.3%, last 2 versions, Firefox ESR, not dead'),
);

// T318: the explainer page at /about/numbers, a static file built from the
// catalogue files (scripts/explainer/numbers.mjs). Emitted as about/numbers.html
// so Pages and Vercel serve it at the clean path; the dev server answers the
// same path from memory.
const APP_ROOT = fileURLToPath(new URL('.', import.meta.url));
function numbersPage() {
  return {
    name: 'carta-numbers-page',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url.split('?')[0].replace(/\/$/, '') !== NUMBERS_PATH) return next();
        try {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(await buildNumbersPage(APP_ROOT));
        } catch (e) { next(e); }
      });
    },
    async generateBundle() {
      if (!dataPresent(APP_ROOT)) {
        this.warn('numbers page skipped: public/boot.json or coverage.json is missing');
        return;
      }
      this.emitFile({
        type: 'asset',
        fileName: NUMBERS_PATH.slice(1) + '.html',
        source: await buildNumbersPage(APP_ROOT),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), numbersPage()],
  server: { port: 5173, host: true },
  css: { lightningcss: { targets: CSS_TARGETS } },
  build: { cssMinify: 'lightningcss' },
});
