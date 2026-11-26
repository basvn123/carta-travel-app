// Renders logo-workflow.html to a two-page A3 landscape PDF.
// Run from the repo root: node docs/brand/logo-workflow/render-pdf.mjs
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../../continent-app/package.json'));
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1587, height: 1123 } });
await page.goto(pathToFileURL(path.join(here, 'logo-workflow.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: path.join(here, 'viantra-logo-workflow.pdf'), width: '420mm', height: '297mm', printBackground: true });
await browser.close();
console.log('wrote viantra-logo-workflow.pdf');
