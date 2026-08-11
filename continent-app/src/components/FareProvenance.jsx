import React from 'react';
import { useI18n } from '../i18n/index.jsx';

/**
 * FareProvenance: honest metasearch labeling for every price surface.
 *
 * A fare or leg object may carry provenance (contract A of the price-map
 * expansion), all fields optional, absent means legacy direct-harvest:
 *   s: source code, "FR" "W6" "VY" "V7" (direct carriers), "TP" (cached
 *      third-party quote), "EST" (model estimate)
 *   o: observed_at, unix epoch DAYS
 *   x: expires_at, unix epoch days, only when the source supplies one
 *   e: 1 when the price is a model estimate
 * The ground-fare resolver's flags ride on leg objects the same way
 * (est: bool, src: string) and are folded in here.
 *
 * Display rules, applied by the call sites through these helpers:
 *   - o present: a small age line, "seen today" / "seen {n} days ago"
 *   - estimate: tilde prefix on the figure plus the "est." tag
 *   - near an external booking link: one BookingNote line
 *   - nothing present: render exactly as before (fareProv returns null)
 */

const DAY_MS = 86400000;

export function todayEpochDays() {
  return Math.floor(Date.now() / DAY_MS);
}

/* Headless-verify seam: the verify script switches a mock on with a query
 * param, e.g. ?provmock=age:3,exp:14,est:1,s:TP  ->  every price surface
 * renders the chips it would render for a real record, regardless of how
 * much provenance the current data actually carries (live slices have s/o;
 * x and e appear only on TP-merged days and estimates). Parsed once; inert
 * unless the param is present. */
let mockBag; // undefined = not parsed yet, null = off
function provMock() {
  if (mockBag !== undefined) return mockBag;
  mockBag = null;
  try {
    const q = new URLSearchParams(window.location.search).get('provmock');
    if (q) {
      const bag = { est: false, o: null, x: null, s: null };
      for (const part of q.split(',')) {
        const [k, v] = part.split(':');
        if (k === 'age') bag.o = todayEpochDays() - (Number(v) || 0);
        else if (k === 'exp') bag.x = todayEpochDays() + (Number(v) || 0);
        else if (k === 'est') bag.est = v !== '0';
        else if (k === 's') bag.s = v || null;
      }
      mockBag = bag;
    }
  } catch { mockBag = null; }
  return mockBag;
}

/** Normalized provenance of a fare/leg object, or null when it carries none
 *  (the "render exactly as today" path). Tolerates both the wire's short
 *  keys (s/o/x/e) and the ground resolver's flags (est/src). */
export function fareProv(obj) {
  const b = obj || {};
  const o = Number.isFinite(b.o) ? b.o : null;
  const x = Number.isFinite(b.x) ? b.x : null;
  const s = typeof b.s === 'string' ? b.s : (typeof b.src === 'string' ? b.src : null);
  const est = b.e === 1 || b.e === true || b.est === true || s === 'EST';
  if (o == null && x == null && s == null && !est) return provMock();
  return { o, x, s, est };
}

/** Provenance for one direction of a round-trip fare pair ('into' or
 *  'out_of', the trip planner's flight object), falling back to flat fields
 *  when no per-direction bag is attached. */
export function flightProv(flight, dir) {
  return fareProv(flight?.[`${dir}_prov`] || flight);
}

/** "~" for an estimated figure, "" otherwise. Prepend to the formatted price
 *  so an estimate never reads as an exact quote. */
export function estPrefix(prov) {
  return prov?.est ? '~' : '';
}

/** The age bucket as translated text, or null when observed_at is unknown. */
export function fareAgeText(t, prov) {
  if (!prov || prov.o == null) return null;
  const age = Math.max(0, todayEpochDays() - prov.o);
  if (age === 0) return t('prov.seenToday');
  if (age === 1) return t('prov.seenYesterday');
  return t('prov.seenDays', { n: age });
}

/** Whether the quote outlived its source-supplied expiry. */
export function fareExpired(prov) {
  return Boolean(prov && prov.x != null && prov.x < todayEpochDays());
}

/** Inline tags after a price: the "est." marker and/or the age chip.
 *  Renders nothing when the object carries no provenance. */
export function FareTag({ prov, className = '' }) {
  const { t } = useI18n();
  if (!prov || (!prov.est && prov.o == null)) return null;
  const expired = fareExpired(prov);
  const ageText = fareAgeText(t, prov);
  return (
    <span className={`fare-prov ${className}`.trim()}>
      {prov.est && (
        <span className="fare-prov-est" title={t('prov.estTitle')}>{t('prov.est')}</span>
      )}
      {ageText && (
        <span
          className={`fare-prov-age${expired ? ' is-expired' : ''}`}
          title={expired ? t('prov.expiredTitle') : undefined}
        >
          {ageText}
        </span>
      )}
    </span>
  );
}

/** The one-line click-out warning that belongs next to every external
 *  booking link: prices move between our harvest and their checkout. */
export function BookingNote({ className = '' }) {
  const { t } = useI18n();
  return <p className={`booking-note ${className}`.trim()}>{t('prov.bookingNote')}</p>;
}

/** The small "from" qualifier before a discovery-surface price ("from
 *  €431"). Not for receipts, whose sum must still equal its parts. */
export function FromWord() {
  const { t } = useI18n();
  return <span className="prov-from">{t('prov.fromWord')}</span>;
}
