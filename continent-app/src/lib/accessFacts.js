/**
 * accessFacts.js, the place page's Access card text (ROADMAP D21).
 *
 * Input is the `access` row of public/destinfo/{CC}.json, built by
 * pipeline/export_destinfo.py from OpenStreetMap `wheelchair` and
 * `toilets:wheelchair` tags. Every line is worded "mapped as" and only
 * exists when the tag does: no row, no line, no card. Nothing here says a
 * place IS accessible; the source and date always follow the lines.
 */

const STEP_KEY = { yes: 'yes', designated: 'yes', limited: 'limited', no: 'no' };

/** { lines: string[], source: string } or null when nothing is mapped. */
export function accessCard(access, t, lang) {
  if (!access || typeof access !== 'object') return null;
  const lines = [];
  const st = access.station;
  const stKey = st && STEP_KEY[st.wc];
  if (stKey) {
    const place = st.name || t('access.stationNearest');
    lines.push(t(`access.station.${stKey}`, { place }));
  }
  const loo = access.toilets;
  if (loo && Number.isFinite(loo.n) && loo.n > 0) {
    lines.push(t(loo.n === 1 ? 'access.toilets1' : 'access.toiletsN', { n: loo.n }));
  }
  const pl = access.places;
  if (pl && Number.isFinite(pl.yes) && pl.yes > 0) {
    const total = pl.yes + (pl.limited || 0) + (pl.no || 0);
    lines.push(t('access.places', { yes: pl.yes, total }));
    if (Array.isArray(pl.named) && pl.named.length) {
      let list = pl.named.join(', ');
      try { list = new Intl.ListFormat(lang, { type: 'conjunction' }).format(pl.named); } catch { /* the join stands */ }
      lines.push(t('access.placesNamed', { list }));
    }
  }
  if (!lines.length) return null;
  let date = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(access._asof || '')) {
    try {
      date = new Date(`${access._asof}T00:00:00Z`).toLocaleDateString(lang, { year: 'numeric', month: 'long', timeZone: 'UTC' });
    } catch { date = access._asof; }
  }
  const source = date ? t('access.source', { date }) : t('access.sourceNoDate');
  return { lines, source };
}
