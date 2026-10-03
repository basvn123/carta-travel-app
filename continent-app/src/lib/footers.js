/**
 * footers.js, the two honest footers (T160, specs 4.6 and K3).
 *
 * Listing footer: how many we publish, how many more we know of, how many of
 * those we cannot map and the reason in words. It reads the coverage wire
 * (public/coverage.json). When the wire carries the T111 contract block the
 * sentence is the full one; when it does not (an older wire), it falls back
 * to the per region audit the wire has always carried, and says less rather
 * than inventing the rest.
 *
 * Detail footer: every figure a page shows is one of three kinds. Measured
 * means a source record or a satellite reading says it. Calculated means we
 * did arithmetic on measured values. Estimated means a model or a rule of
 * thumb, and the page already marks it with a tilde or a note. The footer
 * counts what is on screen and nothing else.
 */

// The wire's layer keys against the noun the sentence uses.
export const LAYER_NOUN = {
  trail: 'cov.n.trail', cycling: 'cov.n.cycling', beach: 'cov.n.beach',
  lake: 'cov.n.lake', mountain: 'cov.n.mountain',
};

// NUTS prefixes that differ from ISO 3166 alpha-2.
const NUTS_PREFIX = { GR: 'EL', GB: 'UK' };

function cellFor(coverage, cc, layer) {
  const by = coverage?.contract?.countries;
  if (!by) return null;
  return by[cc]?.[layer] || by[NUTS_PREFIX[cc]]?.[layer] || null;
}

/**
 * What the footer needs for one layer in one country (cc), or Europe wide
 * when cc is empty. Returns null when there is nothing true to say.
 *   { mode: 'contract', published, known, unmapped, code, status }
 *   { mode: 'regions',  published, short, total }
 */
export function coverageFacts(coverage, layer, cc) {
  if (!coverage || !layer) return null;
  if (coverage.contract?.countries) {
    const cells = cc
      ? [cellFor(coverage, cc, layer)].filter(Boolean)
      : Object.values(coverage.contract.countries).map((c) => c[layer]).filter(Boolean);
    if (cells.length) {
      let published = 0; let known = 0;
      const codes = {};
      for (const c of cells) {
        published += c.published || 0;
        const miss = Math.max(0, (c.must || 0) - (c.must_published || 0));
        known += miss;
        if (c.by_code) {
          for (const [k, n] of Object.entries(c.by_code)) codes[k] = (codes[k] || 0) + n;
        } else if (miss && c.code) {
          codes[c.code] = (codes[c.code] || 0) + miss;
        }
      }
      const dominant = Object.keys(codes).sort((a, b) => codes[b] - codes[a])[0] || null;
      const one = cells.length === 1 ? cells[0] : null;
      return {
        mode: 'contract', published, known, unmapped: dominant ? codes[dominant] : 0,
        code: dominant || one?.code || null, status: one ? one.status : null,
        floor: one ? one.floor : null,
      };
    }
  }
  const prefixes = cc ? [cc, NUTS_PREFIX[cc]].filter(Boolean) : null;
  let published = 0; let short = 0; let total = 0;
  for (const [id, entry] of Object.entries(coverage.regions || {})) {
    if (prefixes && !prefixes.some((p) => id.startsWith(p))) continue;
    const e = entry?.[layer];
    if (!e || e.status === 'na') continue;
    total += 1;
    published += e.r || 0;
    if (e.status === 'thin' || e.status === 'empty') short += 1;
  }
  if (!total) return null;
  return { mode: 'regions', published, short, total };
}

/** The sentence, composed from catalogue keys. `t` is the i18n function. */
export function coverageSentence(t, layer, facts, country, lang) {
  if (!facts) return '';
  const num = (n) => (typeof n === 'number' ? n.toLocaleString(lang || 'en') : n);
  const noun = t(LAYER_NOUN[layer]);
  const where = country || '';
  const head = where
    ? t('cov.publish', { n: num(facts.published), noun, country: where })
    : t('cov.publishAll', { n: num(facts.published), noun });
  if (facts.mode === 'regions') {
    return facts.short > 0
      ? `${head} ${t('cov.regionsShort', { short: num(facts.short), total: num(facts.total) })}`
      : `${head} ${t('cov.regionsOk', { total: num(facts.total) })}`;
  }
  if (facts.known > 0 && facts.code && facts.code !== 'not_applicable') {
    return `${head} ${t('cov.known', {
      known: num(facts.known), unmapped: num(Math.min(facts.unmapped || facts.known, facts.known)),
      reason: t(`cov.why.${facts.code}`),
    })}`;
  }
  if (facts.code === 'not_applicable') return `${head} ${t('cov.why.not_applicable')}`;
  if (facts.status === 'fail' && facts.code) {
    return `${head} ${t('cov.short', { reason: t(`cov.why.${facts.code}`) })}`;
  }
  if (facts.status === 'ok' && facts.floor) {
    return `${head} ${t('cov.met', { floor: num(facts.floor) })}`;
  }
  return head;
}

/* Figure kinds. One letter per figure a page shows: m measured, c calculated,
   e estimated. */
export function kindCounts(kinds) {
  const out = { m: 0, c: 0, e: 0, total: 0 };
  for (const k of kinds) {
    if (k === 'm' || k === 'c' || k === 'e') { out[k] += 1; out.total += 1; }
  }
  return out;
}

/** "2026-09-04T00:08:22Z" -> "September 2026" in the reader's language. */
export function checkedMonth(iso, lang) {
  const m = /^(\d{4})-(\d{2})/.exec(iso || '');
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  try {
    return new Intl.DateTimeFormat(lang || 'en', { month: 'long', year: 'numeric' })
      .format(new Date(Number(m[1]), month - 1, 1));
  } catch { return null; }
}

/* How each fact key on the layer pages is known. The pages already say the
   same thing in their notes: a tilde is an estimate, a "from the satellite"
   note is a measurement. Keys not listed are not counted. */
export const BEACH_KIND = {
  water: 'm', surface: 'm', access: 'm', length: 'm', protected: 'm', prot: 'm',
  size: 'c', sunset: 'c', services: 'm', lifeguard: 'm', nudism: 'm', wheelchair: 'm',
};
export const LAKE_KIND = {
  area: 'm', depth: 'm', elev: 'm', water: 'm', access: 'm', protected: 'm',
  services: 'm', shared: 'm',
};
// A computed prominence is a calculation; one the search window could only
// bound from below is an estimate, and the page says "at least".
export function mountainKind(key, mountain) {
  if (key === 'prom') {
    if (mountain.promSrc === 'dem_min') return 'e';
    return mountain.promSrc === 'dem' || mountain.promSrc === 'insular' ? 'c' : 'm';
  }
  if (key === 'diff' || key === 'view' || key === 'iso') return 'c';
  if (key === 'season') return 'e';
  return 'm';
}
