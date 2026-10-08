import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button } from '../components/Button.jsx';
import { ReceiptCard, ReceiptFigure } from '../components/ReceiptCard.jsx';
import { count, eurExact } from '../lib/format.js';
import { activeLocale } from '../lib/localeState.js';
import { addDays } from '../lib/dates.js';
import { loadCoverage } from '../lib/regions.js';
import { offeredStayTiers, tripDaysBetween } from '../lib/runtime_pricing.js';
import { useFirstRun } from '../lib/firstRunContext.js';
import { receiptMix, tierMeasured } from '../lib/firstRun.js';
import {
  pickDemoTowns, priceReceipt, receiptOpts, defaultStart, todayIso, catalogueFacts, coverageRows,
  cheapestToWalk, DEMO_PEOPLE, DEMO_NIGHTS, DEMO_DEFAULTS,
} from '../lib/landing.js';

/**
 * The landing page, which is also the home page (T209; owner decision
 * 2026-10-07 in T362: one page, and T194 makes it the app's home).
 *
 * It demonstrates rather than describes. Above the fold sits a real receipt
 * for a real town, priced from the catalogue the app already loaded, and its
 * three inputs reprice it in place: the product in one screen. Under it, the
 * one primary, the priced list for a visitor with no town in mind, the three
 * proof points and the coverage, every count read from the data (meta, the
 * destination records, public/coverage.json), never typed.
 *
 * Since T382 (design wave V3) the three inputs are the app's own shared
 * choices, read and written through FirstRunContext the way the first-run
 * receipt does it: the party, the stay tier and the trip dates (nights move
 * the shared return date from the shared arrival). So the next screen prices
 * the same party in the same bed, and the destination page's receipt shows
 * the same total to the cent. The receipt card itself is
 * components/ReceiptCard.jsx, shared with the first-run receipt.
 *
 * One primary action: find a town to walk from, which opens Destinations on
 * its walks. Everything else is a field or a secondary.
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

/** The words for receiptMix(): what a town's receipt measured. */
const MIX_KEY = {
  all: 'receipt.mixAll', bed: 'receipt.mixBed', food: 'receipt.mixFood', none: 'receipt.mixNone',
};
const MAX_PARTY = 12;

export function LandingPage({ data, lifestyle, onStart, onOpenDest }) {
  const { t, lang } = useI18n();
  const ctx = useFirstRun();
  const towns = useMemo(() => pickDemoTowns(data?.destinations), [data]);
  const [townId, setTownId] = useState(null);
  const town = towns.find((d) => d.id === townId) || towns[0] || null;

  // The inputs. Inside the app shell they are the shared choices; outside it
  // (a harness without the provider) the page keeps its own, as it did
  // before T382, so it still renders.
  const [local, setLocal] = useState(DEMO_DEFAULTS);
  const [fallbackStart] = useState(() => defaultStart(todayIso()));
  const choices = ctx?.choices || null;
  const defaults = ctx?.defaultDates || null;
  const people = ctx ? (choices?.group_size || DEMO_DEFAULTS.people) : local.people;
  const tier = ctx ? (choices?.stay_tier || 'home') : local.tier;
  const start = (ctx && (ctx.departDate || defaults?.start)) || fallbackStart;
  const sharedEnd = ctx ? (ctx.returnDate || defaults?.end) : null;
  const nights = sharedEnd && start && sharedEnd > start
    ? Math.max(1, tripDaysBetween(start, sharedEnd))
    : (ctx ? DEMO_DEFAULTS.nights : local.nights);
  const datesOwn = !!(defaults && start && (start !== defaults.start || addDays(start, nights) !== defaults.end));
  const model = ctx ? choices?.accommodation_model : data?.meta?.accommodation_model;
  const indices = ctx?.indices || null;

  const setPeople = (n) => {
    if (!Number.isFinite(n) || n < 1) return;
    const v = Math.min(MAX_PARTY, Math.round(n));
    if (ctx) ctx.setChoices((prev) => ({ ...prev, group_size: v }));
    else setLocal((p) => ({ ...p, people: v }));
  };
  const setTier = (k) => {
    if (ctx) ctx.setChoices((prev) => ({ ...prev, stay_tier: k }));
    else setLocal((p) => ({ ...p, tier: k }));
  };
  const setNights = (n) => {
    if (!Number.isFinite(n) || n < 1) return;
    if (ctx) {
      // The length moves the shared return date; the arrival stays where it
      // is (Carta's default Saturday until the visitor sets their own).
      if (!ctx.departDate) ctx.setDepartDate(start);
      ctx.setReturnDate(addDays(start, n));
    } else setLocal((p) => ({ ...p, nights: n }));
  };

  // Everything the receipt reads, for one town. The first-run receipt passes
  // the same values, so the two receipts agree to the cent.
  const input = useMemo(
    () => ({ people, nights, tier, start, lifestyle, model }),
    [people, nights, tier, start, lifestyle, model],
  );
  const inputFor = React.useCallback(
    (d) => ({ ...input, costRow: d ? indices?.get?.(d.id) || null : null }),
    [input, indices],
  );
  const receipt = useMemo(() => (town ? priceReceipt(town, inputFor(town)) : null), [town, inputFor]);
  // What each demo town's receipt measures at these inputs, for the line
  // under its toggle (rule R7): read from the receipt, never typed per town.
  const mixes = useMemo(
    () => Object.fromEntries(towns.map((d) => [d.id, receiptMix(priceReceipt(d, inputFor(d)))])),
    [towns, inputFor],
  );
  const tiers = useMemo(() => offeredStayTiers(data?.meta), [data]);
  const measuredTier = useMemo(() => {
    const opts = town ? receiptOpts(inputFor(town)) : null;
    return Object.fromEntries(tiers.map((k) => [k, !town || !opts || tierMeasured(town, opts, k)]));
  }, [town, tiers, inputFor]);

  const facts = useMemo(() => catalogueFacts(data?.destinations, data?.meta), [data]);
  // The priced list for the undecided (rule R1): the Explore cards' own day
  // figures, so it re-ranks when the party or the stay changes.
  const walk = useMemo(() => cheapestToWalk(data?.destinations, indices), [data, indices]);

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

  // The stay line's provenance: the tier is already in the strip above, so
  // the line names it only when it stands in for the tier asked for.
  const stayProv = () => {
    const s = receipt.stay;
    const why = s.level === 'region' ? t('cost.stayRepaired')
      : s.level === 'city'
        ? (s.listings && s.place
          ? t('cost.stayMeasuredN', { n: count(s.listings), place: s.place, when: fmtMonth(s.captured) })
          : t('cost.stayMeasured'))
        : t('cost.stayNational');
    return s.tierFallback
      ? [t('receipt.stayFallback', { asked: tierInline(s.tierAsked), tier: tierInline(s.tier) }), why]
      : [why];
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
  const subVars = start && end ? {
    from: fmtDay(start, start.slice(0, 4) !== end.slice(0, 4)),
    to: fmtDay(end, true),
    nights: nightsWord(nights),
    people: peopleWord(people),
  } : null;
  const sub = subVars ? t('receipt.sub', subVars) : '';
  // While the dates are Carta's, one short note under the primary says so and
  // where to change them (the old orientation note, cut to what it must say).
  const datesPicked = !!ctx && !datesOwn;

  const peopleOptions = ctx
    ? Array.from({ length: Math.max(MAX_PARTY, people) }, (_, i) => i + 1)
    : DEMO_PEOPLE;
  const nightsOptions = DEMO_NIGHTS.includes(nights) ? DEMO_NIGHTS : [...DEMO_NIGHTS, nights].sort((a, b) => a - b);

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
            {/* The running instrument (brief V3-9): the coverage in one line,
                read from the catalogue, with the catalogue's own date. */}
            <p className="lp-instrument">
              {t(facts.asOf ? 'landing.instrument' : 'landing.instrumentNoDate', {
                m: count(facts.bedsMeasured), n: count(facts.places), f: count(facts.foodMeasured),
                date: facts.asOf ? fmtDay(facts.asOf, true) : '',
              })}
            </p>
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
                      <span className="lp-town-name">{d.city}</span>
                      {mixes[d.id] && <span className="lp-town-meta">{t(MIX_KEY[mixes[d.id]])}</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="lp-strip" role="group" aria-label={t('receipt.stripAria')}>
                <label className="lp-field lp-field-people">
                  <span className="lp-field-label">{t('landing.people')}</span>
                  <select value={people} onChange={(e) => setPeople(Number(e.target.value))}>
                    {peopleOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="lp-field lp-field-nights">
                  <span className="lp-field-label">{t('landing.nights')}</span>
                  <select value={nights} onChange={(e) => setNights(Number(e.target.value))}>
                    {nightsOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="lp-field lp-field-stay">
                  <span className="lp-field-label">{t('receipt.stripStay')}</span>
                  <select value={tier} onChange={(e) => setTier(e.target.value)}>
                    {tiers.map((k) => (
                      <option key={k} value={k}>
                        {measuredTier[k] ? tierWord(k) : t('receipt.tierNotHere', { tier: tierWord(k) })}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="lp-receipt">
                <ReceiptCard
                  titleId="lp-receipt-title"
                  title={town.city}
                  sub={sub}
                  action={onOpenDest ? (
                    <Button className="lp-open" onClick={() => onOpenDest(town.id)}>
                      {t('landing.openTown', { city: town.city })}
                    </Button>
                  ) : null}
                  lines={[
                    {
                      key: 'stay',
                      label: t('receipt.stay', { nights: nightsWord(nights) }),
                      prov: stayProv(),
                      eur: receipt.stay.eur,
                      est: receipt.stay.est,
                    },
                    {
                      key: 'ground',
                      label: t('receipt.ground'),
                      prov: [
                        {
                          mono: t(receipt.ground.days === 1 ? 'receipt.groundMathOne' : 'receipt.groundMath',
                            { days: receipt.ground.days, people: receipt.people, eur: eurExact(receipt.ground.perDay) }),
                          text: receipt.ground.level === 'city' ? t('cost.foodMeasured') : t('receipt.groundNational'),
                        },
                      ],
                      eur: receipt.ground.eur,
                      est: receipt.ground.est,
                    },
                  ]}
                  sumLabel={t('receipt.total', { people: peopleWord(people) })}
                  total={receipt.total}
                  est={receipt.est}
                  each={receipt.each}
                  eachText={(eur) => t('receipt.each', { eur })}
                  foot={[altLine()]}
                  t={t}
                />
              </div>
            </div>
          )}

          <div className="lp-side">
            <div className="lp-act">
              <Button variant="primary" className="lp-cta" onClick={onStart}>{t('landing.cta')}</Button>
            </div>
            {town && receipt && (
              <div className="lp-notes">
                {datesPicked && <p className="lp-note">{t('landing.datesPicked')}</p>}
                <p className="lp-note">{t('receipt.flightNone')}</p>
                <p className="lp-note">{t('receipt.notIn')}</p>
              </div>
            )}

            {walk.length > 0 && onOpenDest && (
              <section className="lp-walk" aria-labelledby="lp-walk-title">
                <h2 id="lp-walk-title" className="lp-walk-title">{t('landing.walkTitle')}</h2>
                <p className="lp-walk-sub">{t('landing.walkSub')}</p>
                <ol className="lp-walk-list">
                  {walk.map((r) => (
                    <li key={r.id}>
                      <button type="button" className="lp-walk-row" data-id={r.id} onClick={() => onOpenDest(r.id)}>
                        <span className="lp-walk-name">
                          <span className="lp-walk-city">{r.dest.city || r.dest.name}</span>
                          {r.dest.country && <span className="lp-walk-country">{r.dest.country}</span>}
                        </span>
                        <span className="lp-walk-fig mono" data-eur={r.dayEur}>
                          <ReceiptFigure eur={r.dayEur} est={r.est} t={t} />
                          {r.est && <span className="lp-walk-word">{` ${t('landing.walkNational')}`}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            )}
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
