/**
 * entryRules.js, the loader and the reading of /entry_rules.json (T1199,
 * ROADMAP D19), written by pipeline/entry_rules.py.
 *
 * Per country and per traveller group (eu, uk, visa_free, visa) the file
 * carries short codes (`passport`, `ees`, `uk_eta` ...), the official page
 * the line rests on and the date it was checked. The words live in the six
 * catalogues as entry.need.<code>; nothing here restates a legal rule.
 *
 * The file is small and fixed in size (one block per country), so it stays
 * on the app host beside country_insights.json. A failed fetch resolves null
 * and the country page leaves the block out rather than guess.
 */
import { fetchPublished } from './publishedJson.js';

export const ENTRY_GROUPS = Object.freeze(['eu', 'uk', 'visa_free', 'visa']);

let pending = null;
/** The parsed file, or null when it is absent or the request failed. */
export function loadEntryRules() {
  if (!pending) {
    pending = fetchPublished('/entry_rules.json').catch(() => {
      pending = null;   // a dropped connection may be retried later
      return null;
    });
  }
  return pending;
}

/**
 * One country's rows for the page: [{ group, needs, url, src, checked }],
 * in the fixed group order, plus its advice link. Null when the file holds
 * no block for the country, so the page shows nothing rather than a guess.
 */
export function entryRowsFor(doc, iso2) {
  const c = doc?.countries?.[iso2];
  if (!c || !c.rules) return null;
  const rows = ENTRY_GROUPS
    .map((group) => {
      const r = c.rules[group];
      if (!r || !Array.isArray(r.needs) || !r.needs.length) return null;
      return { group, needs: r.needs, src: r.src || null, url: r.url || null, checked: r.checked || null };
    })
    .filter(Boolean);
  if (!rows.length) return null;
  return { rows, advice: c.advice || null };
}

/** The words of one row: its codes in order, joined into one short line. */
export function entryLine(row, t) {
  if (row.needs.length === 1 && row.needs[0] === 'check_official' && !row.url) {
    return t('entry.askEmbassy');
  }
  const parts = row.needs.map((n) => t(`entry.need.${n}`));
  const line = parts.join(', ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}
