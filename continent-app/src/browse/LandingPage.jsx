import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button } from '../components/Button.jsx';
import { count, eurExact } from '../lib/format.js';
import { activeLocale } from '../lib/localeState.js';
import { addDays } from '../lib/dates.js';
import { loadCoverage } from '../lib/regions.js';
import {
  pickDemoTowns, priceReceipt, defaultStart, todayIso, catalogueFacts, coverageRows,
  DEMO_TIERS, DEMO_PEOPLE, DEMO_NIGHTS, DEMO_DEFAULTS,
} from '../lib/landing.js';

/**
 * The landing page, which is also the home page (T209; owner decision
 * 2026-10-07 in T362: one page, and T194 makes it the app's home).
 *
 * It demonstrates rather than describes. Above the fold sits a real receipt
 * for a real town, priced from the catalogue the app already loaded, and its
 * three inputs reprice it in place: the product in one screen. Under it, the
 * three proof points and the coverage, every count read from the data
 * (meta, the destination records, public/coverage.json), never typed.
 *
 * One primary action: find a town to walk from, which opens Destinations on
 * its walks. Everything else is a field or a secondary.
 *
 * The receipt follows docs/FIRST_RUN_RESULT.md (lines in trip order, the
 * provenance in plain words under each figure, a 2 px ink rule above the sum,
 * the accent-tinted footer naming one changed input, the flight sentence and
 * the exclusions under the card). The arithmetic is lib/landing.js.
 *
 * Props
 *   data        { meta, destinations }, partial or full (the rank tier holds
 *               every field the receipt reads)
 *   lifestyle   the traveller's Lifestyle settings, so the food line agrees
 *               with the rest of the app
 *   onStart     the primary action
 *   onOpenDest  opens a destination page by id
 */

const fmtDay = (iso, withYear) => {
  try {
    return new Intl.DateTimeFormat(activeLocale(), {
      day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC',
    }).format(new Date(`${iso}T12:00:00Z`));
  } catch { return iso; }
};
const fmtMonth = (iso) => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(activeLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${iso.slice(0, 7)}-15T12:00:00Z`));
  } catch { return iso.slice(0, 7); }
};

/** A figure, with its tilde when it is an estimate. The tilde is backed by
 *  words for a screen reader, never by the mark alone. */
function Figure({ eur, est, t }) {
  return (
    <>
      {est && <span aria-hidden="true">~ </span>}
      {eurExact(eur)}
      {est && <span className="sr-only">{`, ${t('prov.estTitle')}`}</span>}
    </>
  );
}

export function LandingPage({ data, lifestyle, onStart, onOpenDest }) {
  const { t, lang } = useI18n();
  const towns = useMemo(() => pickDemoTowns(data?.destinations), [data]);
  const [townId, setTownId] = useState(null);
  const [people, setPeople] = useState(DEMO_DEFAULTS.people);
  const [nights, setNights] = useState(DEMO_DEFAULTS.nights);
  const [tier, setTier] = useState(DEMO_DEFAULTS.tier);
  const [start] = useState(() => defaultStart(todayIso()));
  const town = towns.find((d) => d.id === townId) || towns[0] || null;

  const receipt = useMemo(() => (town ? priceReceipt(town, {
    people, nights, tier, start, lifestyle, model: data?.meta?.accommodation_model,
  }) : null), [town, people, nights, tier, start, lifestyle, data]);

  const facts = useMemo(() => catalogueFacts(data?.destinations, data?.meta), [data]);

  // The layer counts come from the coverage file, the same one the region
  // pages and /about/numbers read. Below the fold, so it loads after paint;
  // when it fails the table is left out and the sentences above it stand.
  const [cov, setCov] = useState(null);
  useEffect(() => {
    let live = true;
    loadCoverage()
      .then((raw) => { if (live) setCov(coverageRows(raw)); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // The words are the first-run receipt's own keys (T099), so the landing
  // page and a destination page's first result read the same.
  const peopleWord = (n) => (n === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n }));
  const nightsWord = (n) => (n === 1 ? t('receipt.oneNight') : t('receipt.nNights', { n }));
  const tierWord = (k) => t(`stay.${k || 'home'}`);
  const tierInline = (k) => (lang === 'de' ? tierWord(k) : tierWord(k).toLowerCase());

  const stayRows = () => {
    const s = receipt.stay;
    const word = s.tierFallback
      ? t('receipt.stayFallback', { asked: tierInline(s.tierAsked), tier: tierInline(s.tier) })
      : tierWord(s.tier);
    const why = s.level === 'region' ? t('cost.stayRepaired')
      : s.level === 'city'
        ? (s.listings && s.place
          ? t('cost.stayMeasuredN', { n: count(s.listings), place: s.place, when: fmtMonth(s.captured) })
          : t('cost.stayMeasured'))
        : t('cost.stayNational');
    return [word, why];
  };
  const altLine = () => {
    const a = receipt?.alt;
    if (!a) return null;
    const eur = `${a.est ? '~ ' : ''}${eurExact(a.total)}`;
    return a.kind === 'tier'
      ? t('landing.altTier', { tier: tierWord(a.tier), eur })
      : t('landing.altNights', { nights: nightsWord(a.nights), eur });
  };

  const end = start ? addDays(start, nights) : null;
  const sub = start && end
    ? t('receipt.sub', {
      from: fmtDay(start, start.slice(0, 4) !== end.slice(0, 4)),
      to: fmtDay(end, true),
      nights: nightsWord(nights),
      people: peopleWord(people),
    })
    : '';

  const rest = Math.max(0, facts.places - facts.bedsMeasured);
  const layerLabel = {
    trail: t('landing.layerTrail'),
    cycling: t('landing.layerCycling'),
    beach: t('landing.layerBeach'),
    lake: t('landing.layerLake'),
    mountain: t('landing.layerMountain'),
  };

  return (
    <div className="lp-page">
      <div className="lp-wrap">
        <section className="lp-hero" aria-labelledby="lp-title">
          <div className="lp-head">
            <h1 id="lp-title" className="lp-title">{t('landing.title', { n: count(facts.places) })}</h1>
            <p className="lp-lede">{t('landing.lede')}</p>
          </div>

          {town && receipt && (
            <div className="lp-demo">
              <div className="lp-towns" role="group" aria-labelledby="lp-towns-label">
                <span id="lp-towns-label" className="lp-towns-label">{t('landing.townsLabel')}</span>
                <div className="lp-towns-row">
                  {towns.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className="lp-town"
                      aria-pressed={d.id === town.id}
                      onClick={() => setTownId(d.id)}
                    >
                      {d.city}
                    </button>
                  ))}
                </div>
              </div>

              <div className="lp-strip">
                <label className="lp-field lp-field-people">
                  <span className="lp-field-label">{t('landing.people')}</span>
                  <select value={people} onChange={(e) => setPeople(Number(e.target.value))}>
                    {DEMO_PEOPLE.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="lp-field lp-field-nights">
                  <span className="lp-field-label">{t('landing.nights')}</span>
                  <select value={nights} onChange={(e) => setNights(Number(e.target.value))}>
                    {DEMO_NIGHTS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="lp-field lp-field-stay">
                  <span className="lp-field-label">{t('receipt.stripStay')}</span>
                  <select value={tier} onChange={(e) => setTier(e.target.value)}>
                    {DEMO_TIERS.map((k) => <option key={k} value={k}>{tierWord(k)}</option>)}
                  </select>
                </label>
              </div>

              <section className="lp-receipt" aria-labelledby="lp-receipt-title">
                <header className="lp-receipt-head">
                  <h2 id="lp-receipt-title" className="lp-receipt-title">{town.city}</h2>
                  <p className="lp-receipt-sub">{sub}</p>
                </header>
                <dl className="lp-lines">
                  <div className="lp-line">
                    <dt>
                      <span className="lp-line-label">{t('receipt.stay', { nights: nightsWord(nights) })}</span>
                      {stayRows().map((row) => <span key={row} className="lp-line-sub">{row}</span>)}
                    </dt>
                    <dd className="lp-fig"><Figure eur={receipt.stay.eur} est={receipt.stay.est} t={t} /></dd>
                  </div>
                  <div className="lp-line">
                    <dt>
                      <span className="lp-line-label">{t('receipt.ground')}</span>
                      <span className="lp-line-sub lp-mono">
                        {t(receipt.ground.days === 1 ? 'receipt.groundMathOne' : 'receipt.groundMath',
                          { days: receipt.ground.days, people: receipt.people, eur: eurExact(receipt.ground.perDay) })}
                      </span>
                      <span className="lp-line-sub">
                        {receipt.ground.level === 'city' ? t('cost.foodMeasured') : t('receipt.groundNational')}
                      </span>
                    </dt>
                    <dd className="lp-fig"><Figure eur={receipt.ground.eur} est={receipt.ground.est} t={t} /></dd>
                  </div>
                </dl>
                <div className="lp-sum" aria-live="polite">
                  <span className="lp-sum-label">{t('receipt.total', { people: peopleWord(people) })}</span>
                  <span className="lp-sum-fig"><Figure eur={receipt.total} est={receipt.est} t={t} /></span>
                  {receipt.each != null && (
                    <span className="lp-sum-each">
                      {t('receipt.each', { eur: `${receipt.est ? '~ ' : ''}${eurExact(receipt.each)}` })}
                    </span>
                  )}
                </div>
                {altLine() && <p className="lp-receipt-foot">{altLine()}</p>}
              </section>

              <p className="lp-note lp-orient">{t('landing.orient')}</p>
              <p className="lp-note">{t('landing.noFlight')}</p>
              <p className="lp-note">{t('landing.notIn')}</p>
              {onOpenDest && (
                <Button className="lp-open" onClick={() => onOpenDest(town.id)}>
                  {t('landing.openTown', { city: town.city })}
                </Button>
              )}
            </div>
          )}

          <div className="lp-act">
            <Button variant="primary" className="lp-cta" onClick={onStart}>{t('landing.cta')}</Button>
          </div>
        </section>

        <section className="lp-proof" aria-labelledby="lp-proof-title">
          <h2 id="lp-proof-title" className="lp-h2">{t('landing.proofTitle')}</h2>
          <ul className="lp-proof-list">
            {[1, 2, 3].map((i) => (
              <li key={i}>
                <h3 className="lp-h3">{t(`landing.proof${i}Title`)}</h3>
                <p>{t(`landing.proof${i}`)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-cov" aria-labelledby="lp-cov-title">
          <h2 id="lp-cov-title" className="lp-h2">{t('landing.covTitle')}</h2>
          <p>
            {t('landing.covPlaces', {
              n: count(facts.places), c: count(facts.countries), m: count(facts.bedsMeasured), rest: count(rest),
            })}
          </p>
          <p>{t('landing.covFood', { f: count(facts.foodMeasured) })}</p>
          {cov && (
            <div className="lp-table-wrap">
              <table className="lp-table">
                <caption>
                  {t('landing.covCaption', { r: count(cov.regions), date: cov.asOf ? fmtDay(cov.asOf.slice(0, 10), true) : '' })}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{t('landing.covLayer')}</th>
                    <th scope="col">{t('landing.covPublished')}</th>
                    <th scope="col">{t('landing.covListed')}</th>
                    <th scope="col">{t('landing.covEmpty')}</th>
                  </tr>
                </thead>
                <tbody>
                  {cov.rows.map((r) => (
                    <tr key={r.key}>
                      <th scope="row">{layerLabel[r.key]}</th>
                      <td>{count(r.published)}</td>
                      <td>{count(r.listed)}</td>
                      <td>{t('landing.covOf', { n: count(r.empty), of: count(r.applies) })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {cov && <p className="lp-cov-key">{t('landing.covKey')}</p>}
          <p>{t('landing.covTrade')}</p>
          <p><a className="lp-link" href="/about/numbers">{t('landing.covMore')}</a></p>
        </section>
      </div>
    </div>
  );
}
