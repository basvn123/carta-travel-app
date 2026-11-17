// iPhone launch screens for the installed app (ROADMAP I7, app feel).
//
// iOS shows an apple-touch-startup-image while an installed web app starts
// cold; without one the traveller sees a blank white screen first. Android
// builds its own splash from the manifest (name, icon, background_color), so
// this is for iOS only. One portrait PNG per current iPhone screen: the Carta
// mark centred on the stone page ground (--neutral-50, the manifest's
// background_color), no words, as Apple's launch screen guidance asks.
//
// Writes public/splash/*.png and prints the <link> tags for index.html.
// Run after a change to the mark or the ground:
//   node scripts/make_splash.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(app, 'public', 'splash');
const GROUND = '#eef0ea'; // --neutral-50, manifest background_color
const MARK_PT = 96; // the mark's size in CSS points on every phone

// CSS width x height at a pixel ratio: every iPhone screen since the SE 2.
export const SCREENS = [
  [375, 667, 2], // SE 2 and 3, 8
  [414, 896, 2], // XR, 11
  [375, 812, 3], // X, XS, 11 Pro, 12 and 13 mini
  [414, 896, 3], // XS Max, 11 Pro Max
  [390, 844, 3], // 12, 13, 14, 12 and 13 Pro
  [428, 926, 3], // 12 and 13 Pro Max, 14 Plus
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [430, 932, 3], // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  [402, 874, 3], // 16 Pro, 17, 17 Pro
  [440, 956, 3], // 16 Pro Max, 17 Pro Max
];

export const fileName = ([w, h, r]) => `splash-${w * r}x${h * r}.png`;
export const linkTag = ([w, h, r]) =>
  `<link rel="apple-touch-startup-image" href="/splash/${fileName([w, h, r])}" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)" />`;

async function main() {
  const mark = fs.readFileSync(path.join(app, 'public', 'favicon.svg'), 'utf8');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const s of SCREENS) {
      const [w, h, r] = s;
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: r });
      await page.setContent(`<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-items:center;background:${GROUND}">
        <div style="width:${MARK_PT}px;height:${MARK_PT}px">${mark.replace('<svg ', '<svg style="width:100%;height:100%" ')}</div>
      </body></html>`);
      await page.screenshot({ path: path.join(out, fileName(s)) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(SCREENS.map(linkTag).join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
