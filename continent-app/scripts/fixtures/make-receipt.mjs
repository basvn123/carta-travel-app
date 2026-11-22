// Renders scripts/fixtures/receipt-sample.png, the receipt verify_spend.mjs
// reads with Tesseract on the device (G15). A plain till receipt from a
// Lisbon bakery, the prototype's own example. Run once:
//   node scripts/fixtures/make-receipt.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const lines = [
  ['2x Pastel de nata', '4,80'], ['Bica', '1,60'], ['Sumo laranja', '3,20'], ['IVA 6%', '0,54'], ['TOTAL EUR', '9,60'], ['Multibanco', '9,60'],
];
const html = `<body style="margin:0;background:#fff;font:22px/1.5 'Courier New',monospace;color:#111;width:420px;padding:28px">
<div style="text-align:center;font-weight:bold">PASTEIS DE BELEM</div>
<div style="text-align:center">Rua de Belem 84, Lisboa</div>
<div style="text-align:center">21/11/2026 10:14</div><br>
${lines.map(([a, b]) => `<div style="display:flex;justify-content:space-between"><span>${a}</span><span>${b}</span></div>`).join('')}
</body>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 476, height: 420 } });
await page.setContent(html);
await page.screenshot({ path: path.join(here, 'receipt-sample.png'), fullPage: true });
await browser.close();
