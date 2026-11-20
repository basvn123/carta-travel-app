/**
 * The airline badge's colour (G12, D10, owner 2026-11-19: "nice icons"): a
 * rounded square with the IATA code in the airline's own colour, so a row
 * reads at a glance where the logo file is missing. Only the carriers most
 * seen from Europe's home airports are listed; any other code gets the
 * house umber. The code's ink is whichever of paper or ink reads better on
 * the colour, never below 4.5:1, so the badge never fails contrast.
 *
 * Pure: the colours are data for an inline custom property, not CSS tokens.
 */
const BRAND = {
  FR: '#073590', RK: '#073590', U2: '#ff6600', W4: '#c6007e', W6: '#c6007e', W9: '#c6007e',
  VY: '#ffcc00', KL: '#00a1de', AF: '#002157', LH: '#05164d', VL: '#05164d', EN: '#05164d',
  LX: '#e2001a', WK: '#e2001a', OS: '#d81e05', SN: '#002f6c', IB: '#d7192d', I2: '#d7192d',
  BA: '#075aaa', EI: '#006272', D8: '#d81939', DY: '#d81939', SK: '#000f4f', AY: '#0b1560',
  TK: '#c70a0c', PC: '#fdb913', HV: '#00d66c', TO: '#00d66c', TP: '#da291c', AZ: '#0145b6',
  EW: '#9f004e', LO: '#11397e', A3: '#005288', OA: '#005288', EK: '#d71921', QR: '#5c0632',
  V7: '#e5007d', XQ: '#ffcc00', LS: '#e01e37', UX: '#003a70', FI: '#003a7d', BT: '#a5c400',
};
const HOUSE = '#5a3716'; // umber 800, the house badge
const PAPER = '#ffffff';
const INK = '#1e2421';

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** { bg, ink } for an IATA code; the house umber with paper ink for an unknown one. */
export function airlineColour(code) {
  const bg = BRAND[String(code || '').toUpperCase()] || HOUSE;
  const ink = contrast(bg, PAPER) >= contrast(bg, INK) ? PAPER : INK;
  return { bg, ink };
}
