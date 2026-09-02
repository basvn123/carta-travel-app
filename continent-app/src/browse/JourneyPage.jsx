import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { loadJourney, typeLabel, diffLabel, eurRange, boldSegments } from '../lib/journeys.js';
import { srcSetFor } from '../lib/heroImage.js';
import { trailheadDirectionsUrl } from '../lib/trailExport.js';
import { safeUrl } from '../lib/format.js';
import { CountryFlag } from '../components/CountryFlag.jsx';
import {
  ArrowLeftIcon, MapPinIcon, ChevronRightIcon, CameraIcon, AlertIcon,
  LinkIcon,
} from '../components/Icons.jsx';

/**
 * The journey page: one curated week, and the whole written plan.
 *
 * The same page grammar as the beach, lake and mountain pages (tpage/bpage
 * classes, no maplibre), with the blocks a written itinerary carries that a
 * summit does not: the seven days, the budget as an itemised range, where to
 * sleep, and the honest advisories the writers put in (what could go wrong,
 * what to re-check before booking).
 *
 * Editorial prose stays in its authored English, the same rule the POI
 * descriptions follow: it follows the data, not the UI language. Only the
 * chrome translates.
 *
 * The coordinate row renders ONLY when the schema says the pin is real
 * (precision source/city). A capital-city fallback pin is a map pin rather
 * than a location, and printing it under a heading would present it as one.
 */

const fmtCoord = (n) => (Number.isFinite(n) ? n.toFixed(4) : '');

/** Authored prose with its **bold** markers honoured, never as HTML. */
function Prose({ text, className = 'bpage-prose' }) {
  if (!text) return null;
  return (
    <p className={className}>
      {boldSegments(text).map((seg, i) => (seg.bold
        ? <b key={i}>{seg.text}</b>
        : <React.Fragment key={i}>{seg.text}</React.Fragment>))}
    </p>
  );
}

function HeroCredit({ hero, t }) {
  const page = safeUrl(hero?.page);
  if (!hero?.credit) return null;
  return (
    <p className="bpage-credit">
      <CameraIcon size={12} />
      <span className="lpage-credit-line">
        {page
          ? (
            <a href={page} target="_blank" rel="noopener noreferrer">
              {t('journey.photoOf', { name: hero.credit })}
            </a>
          )
          : <span>{t('journey.photoOf', { name: hero.credit })}</span>}
      </span>
    </p>
  );
}

/** One itinerary day: the title, three parts of the day, the measured line. */
function Day({ day, t }) {
  return (
    <article className="jpage-day">
      <header className="jpage-day-head">
        <span className="jpage-day-n mono">{t('journey.dayN', { n: day.day })}</span>
        <h3>{day.title}</h3>
      </header>
      {[['morning', day.morning], ['afternoon', day.afternoon], ['evening', day.evening]]
        .filter(([, text]) => text)
        .map(([part, text]) => (
          <div key={part} className="jpage-day-part">
            <span className="jpage-day-when">{t(`journey.${part}`)}</span>
            <Prose text={text} className="jpage-day-text" />
          </div>
        ))}
      {day.dayStats && <p className="jpage-day-stats mono">{day.dayStats}</p>}
      {day.sleep && (
        <p className="jpage-day-sleep">
          <b>{t('journey.night')}</b>
          {' '}
          {day.sleep}
        </p>
      )}
    </article>
  );
}

// logistics slot -> label key, in reading order. `other[]` rows carry their
// own labels from the source and render after these.
const LOG_SLOTS = [
  ['gettingThere', 'journey.logGetting'],
  ['transportRules', 'journey.logTransport'],
  ['connectivity', 'journey.logConnectivity'],
  ['money', 'journey.logMoney'],
  ['bookingWindows', 'journey.logBooking'],
  ['permits', 'journey.logPermits'],
  ['weather', 'journey.logWeather'],
  ['health', 'journey.logHealth'],
  ['emergency', 'journey.logEmergency'],
];

// typeSpecific slot -> label key. Only non-null slots render, so a cycling
// week shows surface and distance and a ski week shows lifts and snow.
const SPEC_SLOTS = [
  ['surface', 'journey.specSurface'],
  ['technicalRating', 'journey.specTechnical'],
  ['transitPass', 'journey.specTransit'],
  ['hutBooking', 'journey.specHut'],
  ['liftNetwork', 'journey.specLift'],
  ['snowReliability', 'journey.specSnow'],
  ['windConditions', 'journey.specWind'],
  ['bookingTimeline', 'journey.specBooking'],
  ['audience', 'journey.specAudience'],
];

const BUDGET_ROWS = [
  ['accommodation', 'journey.bAccommodation'],
  ['food', 'journey.bFood'],
  ['transport', 'journey.bTransport'],
  ['activities', 'journey.bActivities'],
];

export function JourneyPage({ id, gatewayDest, onClose, onSelectDest }) {
  const { t, lang } = useI18n();
  const [trip, setTrip] = useState(undefined);   // undefined = loading
  const scrollEl = useRef(null);
  const titleEl = useRef(null);
  const [titleGone, setTitleGone] = useState(false);

  useEffect(() => {
    let live = true;
    setTrip(undefined);
    loadJourney(id).then((row) => { if (live) setTrip(row); });
    return () => { live = false; };
  }, [id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => { scrollEl.current?.scrollTo?.(0, 0); }, [id]);

  useEffect(() => {
    const el = titleEl.current;
    const root = scrollEl.current;
    if (!el || !root) return undefined;
    const io = new IntersectionObserver(([entry]) => setTitleGone(!entry.isIntersecting),
      { root, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [trip?.id]);

  const facts = useMemo(() => {
    if (!trip) return [];
    const profile = trip.profile || {};
    const best = trip.bestPeriod || {};
    const budget = trip.budget || {};
    const yn = (v) => (v == null ? null : t(v ? 'journey.yes' : 'journey.no'));
    return [
      { key: 'days', label: t('journey.fDuration'), value: t('journey.nDays', { n: trip.durationDays || 7 }) },
      best.monthNames?.length && {
        key: 'best',
        label: t('journey.fBest'),
        value: best.monthNames.join(', '),
        note: best.avoid || null,
      },
      budget.totalEur && {
        key: 'budget',
        label: t('journey.fBudget'),
        value: `${eurRange(budget.totalEur, lang)} ${trip.budgetTierRaw || trip.budgetTier || ''}`.trim(),
        note: t('journey.fBudgetNote'),
        mono: true,
      },
      budget.perDayEur && {
        key: 'perday',
        label: t('journey.fPerDay'),
        value: eurRange(budget.perDayEur, lang),
        mono: true,
      },
      profile.difficultyLabel && {
        key: 'diff',
        label: t('journey.fDifficulty'),
        value: diffLabel(profile.difficultyLabel, t),
        note: profile.difficultyNote || null,
      },
      profile.crowdLevel && {
        key: 'crowd',
        label: t('journey.fCrowds'),
        value: t(`journey.crowd${profile.crowdLevel}`),
      },
      profile.familyFriendly != null && {
        key: 'family',
        label: t('journey.fFamily'),
        value: yn(profile.familyFriendly),
      },
      profile.carRequired != null && {
        key: 'car',
        label: t('journey.fCar'),
        value: yn(profile.carRequired),
      },
      trip.gatewayAirport && {
        key: 'gateway',
        label: t('journey.fGateway'),
        value: trip.gatewayAirport,
      },
      trip.languages?.length && {
        key: 'lang',
        label: t('journey.fLanguages'),
        value: trip.languages.join(', '),
      },
      trip.emergencyNumber && {
        key: 'sos',
        label: t('journey.fEmergency'),
        value: String(trip.emergencyNumber),
        mono: true,
      },
    ].filter(Boolean);
  }, [trip, t, lang]);

  if (trip === undefined) {
    return (
      <div className="tpage bpage jpage" role="dialog" aria-modal="true">
        <div className="tpage-bar">
          <button type="button" className="tpage-back" onClick={onClose}>
            <ArrowLeftIcon size={15} />
            <span>{t('journey.backStyles')}</span>
          </button>
        </div>
        <div className="tpage-scroll"><p className="places-empty">{'…'}</p></div>
      </div>
    );
  }
  if (!trip) {
    return (
      <div className="tpage bpage jpage" role="dialog" aria-modal="true">
        <div className="tpage-bar">
          <button type="button" className="tpage-back" onClick={onClose}>
            <ArrowLeftIcon size={15} />
            <span>{t('journey.backStyles')}</span>
          </button>
        </div>
        <div className="tpage-scroll"><p className="places-empty">{t('journey.gone')}</p></div>
      </div>
    );
  }

  const coords = trip.coordinates || {};
  const pinReal = coords.precision === 'source' || coords.precision === 'city';
  const budget = trip.budget || {};
  const spec = trip.typeSpecific || {};
  const specRows = SPEC_SLOTS
    .map(([slot, key]) => (spec[slot] ? { slot, key, value: spec[slot] } : null))
    .filter(Boolean);
  const logRows = LOG_SLOTS
    .map(([slot, key]) => (trip.logistics?.[slot]
      ? { slot, label: t(key), text: trip.logistics[slot] } : null))
    .filter(Boolean)
    .concat((trip.logistics?.other || [])
      .filter((row) => row?.text)
      .map((row, i) => ({ slot: `other-${i}`, label: row.label || '', text: row.text })));

  return (
    <div className="tpage bpage jpage" role="dialog" aria-modal="true" aria-label={trip.title}>
      <div className="tpage-bar">
        <button type="button" className="tpage-back" onClick={onClose}>
          <ArrowLeftIcon size={15} />
          <span>{typeLabel(trip.tripTypeSlug, t, trip.tripType)}</span>
        </button>
        <span className={`tpage-bar-title ${titleGone ? 'on' : ''}`}>{trip.title}</span>
      </div>

      <div className="tpage-scroll" ref={scrollEl}>
        <div className="bpage-wrap">
          {pinReal ? (
            <a
              className="bpage-where"
              href={trailheadDirectionsUrl(coords.lat, coords.lon)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPinIcon size={15} />
              <span className="bpage-where-text">
                {[trip.subRegion, trip.country].filter(Boolean).join(', ')}
              </span>
              <span className="bpage-where-coord">
                {fmtCoord(coords.lat)}, {fmtCoord(coords.lon)}
              </span>
              <ChevronRightIcon size={14} />
            </a>
          ) : (
            <p className="bpage-where jpage-where-flat">
              <MapPinIcon size={15} />
              <span className="bpage-where-text">
                {[trip.subRegion, trip.country].filter(Boolean).join(', ')}
              </span>
            </p>
          )}

          <div className="bpage-head" ref={titleEl}>
            <h1 className="bpage-name">
              <CountryFlag country={trip.countryCode} size={15} className="bpage-flag" />
              {trip.title}
            </h1>
            <div className="bpage-scorerow jpage-chips">
              <span className="jpage-chip">{typeLabel(trip.tripTypeSlug, t, trip.tripType)}</span>
              <span className="jpage-chip mono">{t('journey.nDays', { n: trip.durationDays || 7 })}</span>
              {trip.budgetTier && <span className="jpage-chip mono">{trip.budgetTierRaw || trip.budgetTier}</span>}
              {trip.profile?.difficultyLabel && (
                <span className="jpage-chip">{diffLabel(trip.profile.difficultyLabel, t)}</span>
              )}
            </div>
          </div>

          {trip.hero?.url && (
            <figure className="bpage-gallery">
              <img
                className="bpage-shot"
                src={trip.hero.url}
                srcSet={srcSetFor(trip.hero.url, 1280)}
                sizes="(max-width: 900px) 96vw, 720px"
                alt={trip.title}
              />
              <HeroCredit hero={trip.hero} t={t} />
            </figure>
          )}

          <section className="bpage-why">
            <h2>{t('journey.whyHead')}</h2>
            {trip.hook && <Prose text={trip.hook} className="bpage-lede" />}
            {trip.summary && !trip.summaryGenerated && (
              <Prose text={trip.summary} />
            )}
            {trip.tags?.length > 0 && (
              <ul className="bpage-tags jpage-tags">
                {trip.tags.slice(0, 6).map((tag) => (
                  <li key={tag}>{String(tag).replace(/-/g, ' ')}</li>
                ))}
              </ul>
            )}
          </section>

          {facts.length > 0 && (
            <section className="bpage-facts">
              <h2>{t('journey.factsHead')}</h2>
              <dl>
                {facts.map((fact) => (
                  <div key={fact.key} className="bpage-fact">
                    <dt>{fact.label}</dt>
                    <dd className={fact.mono ? 'mono' : ''}>
                      {fact.value}
                      {fact.note && <small>{fact.note}</small>}
                    </dd>
                  </div>
                ))}
              </dl>
              {trip.bestPeriod?.note && <p className="bpage-note">{trip.bestPeriod.note}</p>}
            </section>
          )}

          {budget.breakdown && (
            <section className="jpage-budget">
              <h2>{t('journey.budgetHead')}</h2>
              <ul className="jpage-budget-rows">
                {BUDGET_ROWS.map(([slot, key]) => {
                  const row = budget.breakdown[slot];
                  if (!row || (row.lowEur == null && row.highEur == null)) return null;
                  return (
                    <li key={slot}>
                      <span className="jpage-budget-label">
                        {t(key)}
                        {row.note && <small>{row.note}</small>}
                      </span>
                      <span className="jpage-budget-eur mono">
                        {eurRange({ low: row.lowEur, high: row.highEur }, lang)}
                      </span>
                    </li>
                  );
                })}
                {budget.totalEur && (
                  <li className="jpage-budget-total">
                    <span className="jpage-budget-label">{t('journey.budgetTotal')}</span>
                    <span className="jpage-budget-eur mono">
                      {eurRange(budget.totalEur, lang)}
                    </span>
                  </li>
                )}
              </ul>
              <p className="bpage-note">
                {budget.totalNote || t('journey.fBudgetNote')}
              </p>
            </section>
          )}

          {specRows.length > 0 && (
            <section className="bpage-facts jpage-spec">
              <h2>{t('journey.specHead')}</h2>
              <dl>
                {specRows.map((row) => (
                  <div key={row.slot} className="bpage-fact">
                    <dt>{t(row.key)}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {trip.itinerary?.length > 0 && (
            <section className="jpage-itin">
              <h2>{t('journey.itinHead')}</h2>
              {trip.itinerary.map((day) => <Day key={day.day} day={day} t={t} />)}
            </section>
          )}

          {trip.accommodationStrategy?.length > 0 && (
            <section className="jpage-sleep">
              <h2>{t('journey.sleepHead')}</h2>
              {trip.accommodationStrategy.map((stay) => (
                <article key={`${stay.rank}-${stay.name}`} className="jpage-stay">
                  <header>
                    <h3>{stay.name}</h3>
                    <span className="jpage-stay-kind">
                      {[stay.style, stay.location].filter(Boolean).join(', ')}
                    </span>
                  </header>
                  {stay.description && <Prose text={stay.description} className="jpage-stay-desc" />}
                  {(stay.booking || stay.priceNote) && (
                    <p className="jpage-stay-book">
                      {stay.priceNote && <span className="mono">{stay.priceNote}</span>}
                      {stay.priceNote && stay.booking ? ' · ' : ''}
                      {stay.booking && (
                        <span>
                          {t('journey.bookBy')}
                          {' '}
                          {stay.booking}
                        </span>
                      )}
                    </p>
                  )}
                </article>
              ))}
            </section>
          )}

          {logRows.length > 0 && (
            <section className="jpage-log">
              <h2>{t('journey.logHead')}</h2>
              <dl>
                {logRows.map((row) => (
                  <div key={row.slot} className="bpage-fact jpage-log-row">
                    <dt>{row.label}</dt>
                    <dd><Prose text={row.text} className="jpage-log-text" /></dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {trip.proTips?.length > 0 && (
            <section className="jpage-tips">
              <h2>{t('journey.tipsHead')}</h2>
              <ul>
                {trip.proTips.map((tip, i) => (
                  <li key={i}><Prose text={tip} className="jpage-tip-text" /></li>
                ))}
              </ul>
            </section>
          )}

          {trip.packingNotes?.length > 0 && (
            <section className="jpage-tips">
              <h2>{t('journey.packHead')}</h2>
              <ul>
                {trip.packingNotes.map((note, i) => (
                  <li key={i}><Prose text={note} className="jpage-tip-text" /></li>
                ))}
              </ul>
            </section>
          )}

          {trip.whatCouldGoWrong?.length > 0 && (
            <section className="lpage-hazards">
              <h2>
                <AlertIcon size={15} />
                {t('journey.wrongHead')}
              </h2>
              <ul>
                {trip.whatCouldGoWrong.map((item, i) => (
                  <li key={i}><Prose text={item} className="jpage-tip-text" /></li>
                ))}
              </ul>
            </section>
          )}

          {(trip.verifyFlagCount > 0 || trip.volatilePricing) && (
            <p className="jpage-verify" role="note">
              <AlertIcon size={13} />
              {trip.verifyFlagCount > 0
                ? t('journey.verifyNote', { n: trip.verifyFlagCount })
                : t('journey.volatileNote')}
            </p>
          )}

          {gatewayDest && (
            <button
              type="button"
              className="bpage-base"
              onClick={() => onSelectDest?.(gatewayDest.id)}
            >
              <span>{t('journey.ctaGateway', { city: gatewayDest.city })}</span>
              <ChevronRightIcon size={15} />
            </button>
          )}

          <section className="bpage-sources">
            <h2>{t('journey.sourcesHead')}</h2>
            <p className="bpage-attrib">
              {t('journey.vintage', { year: trip.dataVintage || 2026 })}
            </p>
            {trip.hero?.page && safeUrl(trip.hero.page) && (
              <ul>
                <li>
                  <a href={safeUrl(trip.hero.page)} target="_blank" rel="noopener noreferrer">
                    <LinkIcon size={12} />
                    {t('journey.photoOf', { name: trip.hero.credit })}
                  </a>
                </li>
              </ul>
            )}
            <p className="bpage-attrib">{t('journey.credit')}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
