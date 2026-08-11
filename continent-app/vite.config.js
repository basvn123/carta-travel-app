import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';

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

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  css: { lightningcss: { targets: CSS_TARGETS } },
  build: { cssMinify: 'lightningcss' },
});
