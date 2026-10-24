/**
 * townGuide.js (T673): a town's guide rows for its day page, after the
 * Polarsteps guide list (the vibe, where to sleep, the best time, how to get
 * there, good to know, an insider tip), read from the town's dossier. Each
 * row says only what the dossier states; a row the dossier cannot fill yet is
 * returned empty, and the page shows the shared placeholder there rather than
 * leaving the row out (owner 2026-10-24). Plain JS.
 *
 *   rows: [{ key, items: [...] }] in a fixed order, items empty when unknown
 */
export const GUIDE_KEYS = ['vibe', 'sleep', 'when', 'getting', 'know', 'on', 'tip'];

/** The dossier's rule tips that read as an insider's advice (T734). The
 *  ones about transport and the season are left to the getting-there and
 *  best-time rows, which already say them. */
export const INSIDER_TIPS = [
  'hiddenGem', 'timeItWith', 'shoulderBeatsPeak', 'halfDayEnough', 'worthTwoDays', 'pairWith',
  'crowdWarning', 'wholeCentreListed', 'freeParking', 'beachDays', 'gatewayFor', 'warmWinter',
];

export function townGuide(dossier, { month = null } = {}) {
  const d = dossier || {};
  const items = {
    vibe: d.intro?.short ? [{ text: d.intro.short }] : [],
    sleep: (d.sleep?.neighbourhoods || [])
      .filter((n) => n?.name)
      .slice(0, 3)
      .map((n) => ({ text: n.name, eur: Number.isFinite(n.night_eur) ? n.night_eur : null })),
    when: [
      ...(Array.isArray(d.when?.best) && d.when.best.length ? [{ months: d.when.best }] : []),
      ...(d.when?.crowding?.label ? [{ crowd: d.when.crowding.tier ?? null, label: d.when.crowding.label }] : []),
    ],
    getting: (() => {
      const g = d.practical?.getting_there;
      if (!g) return [];
      const out = [];
      if (g.airport) out.push({ airport: g.airport });
      if (g.transit) out.push({ transit: g.transit });
      if (g.car_needed != null) out.push({ carNeeded: Boolean(g.car_needed) });
      return out;
    })(),
    know: [
      ...(d.practical?.rhythm ? [{ text: d.practical.rhythm }] : []),
      ...((d.practical?.book_ahead || []).length ? [{ bookAhead: d.practical.book_ahead.slice(0, 4) }] : []),
    ],
    // T734: only what happens at a time (an entry with its months); a
    // listed building is not something on.
    on: (d.festivals || d.events || [])
      .filter((e) => Array.isArray(e.months) && e.months.length && (!month || e.months.includes(month)))
      .slice(0, 3)
      .map((e) => ({ text: e.name || e.title || '', what: e.what || e.desc || '' }))
      .filter((e) => e.text),
    // T734: the dossier's rule tips (codes with arguments, phrased by
    // tipText in six languages), the insider kinds first in the order above.
    tip: (Array.isArray(d.tips) ? d.tips : [])
      .filter((x) => x && INSIDER_TIPS.includes(x.code))
      .sort((a, b) => INSIDER_TIPS.indexOf(a.code) - INSIDER_TIPS.indexOf(b.code))
      .slice(0, 3)
      .map((x) => ({ tip: { code: x.code, args: x.args || {} } })),
  };
  return GUIDE_KEYS.map((key) => ({ key, items: items[key] }));
}

/** The photographs for the town's head: the dossier's gallery, else the
 *  destination's own photo. */
export function townPhotos(dossier, dest, max = 5) {
  const out = [];
  for (const g of dossier?.gallery || []) {
    const u = g?.url || g?.thumb;
    if (u && !out.includes(u)) out.push(u);
    if (out.length >= max) break;
  }
  if (!out.length && dest?.image?.url) out.push(dest.image.url);
  return out;
}
