// Headless CSP violation verifier.
// Loads the app with a CSP header applied and collects securitypolicyviolation
// events on the five layers (beaches, lakes, mountains, trails, cycling) and
// trips pages (Journeys and one saved trip). Reports blocked URLs and their counts.
//
//   node scripts/verify_csp.mjs [--csp CSP_VALUE] [--url URL]
//
// Default CSP is the real one, read from the "/*" stanza of public/_headers.
// If --csp is omitted, loads dist with that header.
// If --url is provided, skips build and uses that (e.g., http://localhost:4173).

import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dir, '..');

const args = process.argv.slice(2);
let cspArg = null;
let urlArg = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--csp' && i + 1 < args.length) cspArg = args[i + 1];
  if (args[i] === '--url' && i + 1 < args.length) urlArg = args[i + 1];
}

// The real header, read from public/_headers (read only). Production is on
// Cloudflare Pages since T293, and the "/*" stanza of that file is what it
// sends. vercel.json is the rollback host only and is not consulted. Reading
// the file means this harness can never drift from the shipped policy, which
// is what the three hard-coded copies it used to carry did (T276-a).
async function readRealCsp() {
  const text = await fs.readFile(path.join(repoRoot, 'public', '_headers'), 'utf8');
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === '/*');
  if (start < 0) throw new Error('public/_headers has no "/*" stanza');
  for (let i = start + 1; i < lines.length && /^\s/.test(lines[i]); i++) {
    const m = lines[i].match(/^\s+Content-Security-Policy:\s*(.+?)\s*$/);
    if (m) return m[1];
  }
  throw new Error('the "/*" stanza of public/_headers has no Content-Security-Policy line');
}

// Reference only: the real policy with the Wikimedia and Geograph image hosts
// removed, to show what blocking them would cost. Not a pass criterion.
function withoutWikimedia(csp) {
  return csp
    .split(/\s+/)
    .filter((tok) => !/^https:\/\/(upload|thumb|commons)\.wikimedia\.org$|^https:\/\/s[0-3]\.geograph\.org\.uk$/.test(tok))
    .join(' ');
}

const pages = [
  { name: 'beaches', url: '#beach=es-cala-rovira-Q24021830&bc=ES', viewport: { width: 390, height: 844 } },
  { name: 'lakes', url: '#lake=si-lake-bled-Q648902&lc=SI', viewport: { width: 390, height: 844 } },
  { name: 'mountains', url: '#mtn=ch-jungfrau-Q15312&mc=CH', viewport: { width: 390, height: 844 } },
  { name: 'trails', url: '#trips=active&bc=CH', viewport: { width: 390, height: 844 } },
  { name: 'cycling', url: '#trips=bike&bc=AT', viewport: { width: 390, height: 844 } },
  { name: 'journeys', url: '#journeys=index', viewport: { width: 390, height: 844 } },
];

const NOISE = /ERR_FAILED|config is not valid|ERR_CONNECTION_REFUSED|CSP for Playwright|playwrightInternal/;

let localServer = null;
// The policy the local server sends. verifyCsp() sets it per run, so the three
// configurations really differ; the first version sent the default every time and
// reported zero violations for all of them, which is the vacuous-gate trap.
let currentCsp = null;

async function startLocalServer(port = 4175) {
  return new Promise((resolve) => {
    const distPath = path.join(repoRoot, 'dist');
    const server = http.createServer(async (req, res) => {
      try {
        const filePath = path.join(distPath, req.url === '/' ? 'index.html' : req.url);
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
          const content = await fs.readFile(filePath);
          const ext = path.extname(filePath);
          const contentType = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.png': 'image/png',
            '.svg': 'image/svg+xml',
          }[ext] || 'application/octet-stream';
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Security-Policy', currentCsp);
          res.writeHead(200);
          res.end(content);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      } catch (e) {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(port, () => resolve(server));
  });
}

async function verifyCsp(cspValue, cspLabel) {
  currentCsp = cspValue;
  const browser = await chromium.launch();
  const violations = {};
  const pageViolations = {};

  try {
    for (const page of pages) {
      pageViolations[page.name] = [];

      const bpage = await browser.newPage({ viewport: page.viewport });
      bpage.on('console', (m) => {
        if (m.type() === 'error' && !NOISE.test(m.text())) {
          console.log(`  [${page.name}] console error: ${m.text().slice(0, 100)}`);
        }
      });

      let imageRequests = 0;
      bpage.on('request', (r) => { if (r.resourceType() === 'image') imageRequests += 1; });
      bpage.on('response', (response) => {
        // Collect CSP violation reports
        if (response.url().includes('__csp_report')) {
          console.log(`  [${page.name}] CSP report endpoint hit`);
        }
      });

      // Track violation events
      await bpage.addInitScript(() => {
        window.__cspViolations = [];
        document.addEventListener('securitypolicyviolation', (e) => {
          window.__cspViolations.push({
            blockedURI: e.blockedURI,
            violatedDirective: e.violatedDirective,
            originalPolicy: e.originalPolicy,
          });
        });
        try {
          localStorage.setItem('continent.lang.v1', 'en');
          localStorage.setItem('continent.guestMode.v1', '1');
          localStorage.setItem('continent.homeSeen.v1', '1');
          localStorage.setItem('continent.mapGuideDismissed.v1', '1');
        } catch { /* storage unavailable */ }
      });

      const url = urlArg ? `${urlArg}${page.url}` : `http://localhost:4175/${page.url}`;
      console.log(`\nChecking ${page.name} at ${url}...`);

      try {
        await bpage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await bpage.waitForTimeout(8000);

        // Dismiss overlays
        const dismissLocators = [
          bpage.locator('[aria-label="close" i]').first(),
          bpage.locator('button:has-text("Close")').first(),
          bpage.locator('button:has-text("Dismiss")').first(),
        ];
        for (const loc of dismissLocators) {
          if (await loc.isVisible({ timeout: 500 }).catch(() => false)) {
            await loc.click().catch(() => {});
            await bpage.waitForTimeout(300);
            break;
          }
        }

        const collected = await bpage.evaluate(() => window.__cspViolations || []);
        pageViolations[page.name] = collected;
        const imgCount = await bpage.evaluate(() => document.images.length);
        console.log(`  [${page.name}] ${imgCount} img elements, ${imageRequests} image requests, ${collected.length} violations`);
        if (imgCount + imageRequests + collected.length === 0) {
          console.log(`  [${page.name}] WARNING: no image was requested or blocked; this page proves nothing`);
          pageViolations[page.name].vacuous = true;
        }

        for (const violation of collected) {
          let host = violation.blockedURI;
          try { host = new URL(violation.blockedURI).origin; } catch { /* keep the raw value */ }
          const key = `${violation.violatedDirective}:${host}`;
          violations[key] = (violations[key] || 0) + 1;
        }
      } catch (e) {
        console.log(`  Error loading page: ${e.message.slice(0, 80)}`);
      }

      await bpage.close();
    }
  } finally {
    await browser.close();
  }

  // Report results
  console.log(`\n${'='.repeat(80)}`);
  console.log(`CSP Verification: ${cspLabel}`);
  console.log(`${'='.repeat(80)}`);

  const totalViolations = Object.values(pageViolations).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`\nTotal CSP violations: ${totalViolations}`);

  console.log('\nViolations by page:');
  for (const [pageName, violations] of Object.entries(pageViolations)) {
    console.log(`  ${pageName}: ${violations.length}`);
  }

  if (Object.keys(violations).length > 0) {
    console.log('\nBlocked resources:');
    const sorted = Object.entries(violations)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    for (const [key, count] of sorted) {
      const cut = key.indexOf(':');
      const directive = key.slice(0, cut);
      const uri = key.slice(cut + 1);
      let domain = uri;
      try { domain = new URL(uri).hostname; } catch { /* keep the raw value */ }
      console.log(`  ${String(count).padStart(3)}x ${directive}: ${domain}`);
    }
  } else {
    console.log('\nNo CSP violations detected.');
  }

  return { totalViolations, pageViolations, violations };
}

async function main() {
  console.log('CSP Verification Script');
  console.log('Checking for Content Security Policy violations across the app.');

  // Start local server if no URL provided
  if (!urlArg) {
    console.log('\nStarting local server on http://localhost:4175...');
    localServer = await startLocalServer(4175);
  }

  try {
    const real = cspArg || await readRealCsp();
    const results = {};

    console.log('\n1. Testing the REAL CSP (public/_headers)...');
    results.real = await verifyCsp(real, 'Real header, public/_headers');

    console.log('\n2. Testing NO WIKIMEDIA CSP (reference, to show blocking impact)...');
    results.noWikimedia = await verifyCsp(withoutWikimedia(real), 'Without Wikimedia/Geograph hosts (REFERENCE)');

    // Summary table
    console.log(`\n${'='.repeat(80)}`);
    console.log('Summary Table: Violations per Configuration');
    console.log(`${'='.repeat(80)}`);
    console.log('\n| Page | Real header | Without Wiki |');
    console.log('|---|---:|---:|');

    const allPages = Object.keys(results.real.pageViolations);
    for (const page of allPages) {
      console.log(`| ${page} | ${results.real.pageViolations[page].length} | ${results.noWikimedia.pageViolations[page].length} |`);
    }

    console.log(`\n| TOTAL | ${results.real.totalViolations} | ${results.noWikimedia.totalViolations} |`);

    // Determine exit code
    if (results.real.totalViolations === 0) {
      console.log('\nSUCCESS: No CSP violations with the real header.');
      process.exit(0);
    } else {
      console.log('\nFAILURE: CSP violations remain with the real header.');
      process.exit(1);
    }
  } finally {
    if (localServer) localServer.close();
  }
}

main().catch((e) => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
