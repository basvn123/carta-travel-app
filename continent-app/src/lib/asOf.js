/**
 * asOf.js, the "refreshed on" date of a figure (T1208, ROADMAP G9).
 *
 * Every key block of a destination carries `_asof`, the YYYY-MM-DD date its
 * pipeline layer last built it (T1143, lib/provenance.js). It is the build
 * date, not the source's own vintage (T1143-d), so the words say "refreshed",
 * never "checked" or "as of": research in Execution/P15/T1208-trust-visible.md.
 *
 * A figure made of several blocks (a day price is food and the bed) is as old
 * as its oldest block. Past STALE_DAYS for its kind the screen adds a quiet
 * "may have changed". The limits follow each source's cadence in
 * pipeline/config/sources.yaml (prices MONTHLY: three missed runs).
 */
import { provenanceOf } from './provenance.js';

export const STALE_DAYS = Object.freeze({ prices: 90 });
/** The blocks behind each kind of figure on the place page. */
export const BLOCKS = Object.freeze({ prices: ['costs', 'accommodation'] });

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;

/** A YYYY-MM-DD string as a UTC midnight Date, or null. */
export function parseDay(iso) {
  const m = ISO.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 ? d : null;
}

/** The oldest `_asof` among the record's stamped blocks of one kind, or null. */
export function asOfFor(record, kind) {
  let oldest = null;
  for (const block of BLOCKS[kind] || []) {
    const iso = provenanceOf(record, block)?.asof;
    if (parseDay(iso) && (!oldest || iso < oldest)) oldest = iso;
  }
  return oldest;
}

/** Whole days from `iso` to `now` (ms), or null. */
export function ageDays(iso, now = Date.now()) {
  const d = parseDay(iso);
  return d ? Math.max(0, Math.floor((now - d.getTime()) / DAY_MS)) : null;
}

/** True when a figure of `kind` dated `iso` is past its limit. */
export function isStale(kind, iso, now = Date.now()) {
  const age = ageDays(iso, now);
  return age != null && age > (STALE_DAYS[kind] ?? Infinity);
}

/** "7 Jun 2026" in the reader's locale (Intl, UTC so no day shifts), or ''. */
export function formatDay(iso, bcp47 = 'en-GB') {
  const d = parseDay(iso);
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat(bcp47, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
  } catch {
    return iso;
  }
}
