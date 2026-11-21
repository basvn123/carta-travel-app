// Owner 2026-11-21 (G12 judgement-9): in a chip or button with an icon
// beside its word, the icon's centre is level with the word's capitals.
// A page script that returns one entry per visible chip with an icon and a
// word: the icon's centre, the word's cap centre and their difference (dCap,
// px). The word's place comes from a Range on its text node (the font's
// ascent and descent box, which text-box trimming does not move); its
// baseline is that box's top plus the font's ascent, and the cap centre half
// an "H" above the baseline, both measured on a canvas in the word's font.
// dBox, the difference to the Range box's middle, is kept for the record:
// that middle is not where the eye reads the word.
//
//   const rows = await page.evaluate(ICON_ALIGN_JS);
//   rows.every((r) => Math.abs(r.dCap) <= 1)
export const ICON_ALIGN_JS = `(() => {
  const SEL = '.xquick-chip, .xquick-clear, .band-chip, .band-filters, .band-ask, .xap-chip, .xap-filters, .xap-clear, .btn';
  const out = [];
  const cv = document.createElement('canvas').getContext('2d');
  for (const el of document.querySelectorAll(SEL)) {
    // One-line chips and buttons only: a tall tile (the rails' See all card)
    // places its arrow by its own grid, not beside a word.
    if (!el.getClientRects().length || el.closest('[inert], [aria-hidden="true"]') || el.getBoundingClientRect().height > 56) continue;
    const svg = [...el.querySelectorAll('svg')].find((s) => s.getClientRects().length && !s.closest('.band-count'));
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.textContent.trim() && !n.parentElement.closest('.band-count, .sr-only') ? 1 : 2),
    });
    const tn = walker.nextNode();
    if (!svg || !tn) continue;
    const s = svg.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(tn);
    const rr = [...range.getClientRects()][0];
    if (!rr || !s.width || rr.bottom < 0 || rr.top > innerHeight) continue;
    const cs = getComputedStyle(tn.parentElement);
    cv.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    const base = rr.top + cv.measureText('Hx').fontBoundingBoxAscent;
    const cap = base - cv.measureText('H').actualBoundingBoxAscent / 2;
    const ic = s.top + s.height / 2;
    out.push({
      chip: el.className.toString().trim().split(/\\s+/).slice(0, 2).join('.'), text: tn.textContent.trim().slice(0, 20),
      dCap: Math.round((ic - cap) * 10) / 10, dBox: Math.round((ic - (rr.top + rr.height / 2)) * 10) / 10,
    });
  }
  return out;
})()`;
