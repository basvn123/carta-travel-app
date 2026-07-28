import React, { useMemo, useState } from 'react';
import { OriginPicker } from './OriginPicker.jsx';
import { DateField } from './DateField.jsx';
import { Dropdown } from './Dropdown.jsx';
import { NumberField } from './FilterControls.jsx';
import { LanguagePicker } from './LanguagePicker.jsx';
import { PrivacyPolicy } from './PrivacyPolicy.jsx';
import { composeTrip, tripDaysBetween } from '../lib/runtime_pricing.js';
import { addDays, fmtDate, todayISO } from '../lib/dates.js';
import { count, eur, eurExact } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';

const CONTACT = 'bas.vannieuwenhuyse123@gmail.com';
const EMPTY_META = {};

/* ── The dark price map ───────────────────────────────────────────────────
   A survey-map register, not a real tile map: the graticule and coastlines
   are decoration, but every pin is a real destination at its real
   coordinates, priced by the same pass that prices the map tab. */

// The frame the pins are projected into. Wide enough for Porto and Riga,
// tight enough that Europe still looks like Europe.
const FRAME = { lonMin: -11, lonMax: 32, latMin: 34.5, latMax: 62 };
const MAX_PINS = 8;

const mercY = (deg) => Math.log(Math.tan(Math.PI / 4 + (deg * Math.PI / 180) / 2));

/** lat/lon -> {x, y} as 0..1 fractions of the panel, Mercator on the vertical
 *  so the continent is not vertically squashed. Returns null off-frame. */
function project(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const x = (lon - FRAME.lonMin) / (FRAME.lonMax - FRAME.lonMin);
  const top = mercY(FRAME.latMax);
  const y = (top - mercY(lat)) / (top - mercY(FRAME.latMin));
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

/** Which edge a label hangs off, so a pin near the frame edge stays inside it
 *  without lying about where the city is. */
function anchorFor(x) {
  if (x < 0.12) return 'home-pin-l';
  if (x > 0.84) return 'home-pin-r';
  return '';
}

/**
 * The Carta homepage: a full-viewport landing page rendered as its own
 * top-level view ('home' in the tab state, and a first-class tab in both
 * navs). Built to the Carta design system in .claude/skills/carta-design:
 * cool greys, Instrument Sans with IBM Plex Mono on measured facts, hairline
 * lists, one dark surface, no shadows and no scroll effects.
 *
 * Three things on the page are live rather than marketing copy, which is the
 * point of it: the status line counts what is actually priced right now, the
 * search strip edits real app state (so every CTA hands off to an
 * already-priced map), and the receipt is a genuine composeTrip() breakdown of
 * today's cheapest flyable destination, including what shifting the return
 * date would do to the total.
 */
export function HomePage({
  data, choices, setChoices, onChangeOrigin,
  departDate, setDepartDate, returnDate, setReturnDate, dateBounds,
  pricedAll, totalCount, countryCount,
  user, onOpenAccount,
  onExplore, onPlanTrip, onNavigate,
}) {
  const { t } = useI18n();
  const [privacyOpen, setPrivacyOpen] = useState(false);

  // A stable fallback, not a fresh {} per render: `meta` is a dependency of
  // the fare-freshness and origin-pin memos, and a new object every render
  // would recompute both on every keystroke in the search strip.
  const meta = data?.meta || EMPTY_META;
  const baggageOpts = meta.baggage_options || {};
  const originCity = meta.origins?.[choices.origin]?.city || choices.origin || '';
  const groupSize = Math.max(1, choices.group_size || 1);
  const nights = tripDaysBetween(departDate, returnDate);
  const pricedCount = pricedAll?.length || 0;
  const bagLabel = baggageOpts[choices.baggage_key]?.label || '';

  const onDepartChange = (v) => {
    setDepartDate(v);
    if (v && returnDate && returnDate <= v) {
      const next = addDays(v, 7);
      setReturnDate(dateBounds?.max && next > dateBounds.max ? dateBounds.max : next);
    }
  };

  const goTo = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  /* ── How fresh the fares are ───────────────────────────────────────────
     Every carrier harvest stamps its own date; the newest of them is when a
     visitor last got new prices. Stated plainly, because freshness is the
     only proof this product has and burying it wastes it. */
  const fareAge = useMemo(() => {
    const stamps = Object.entries(meta)
      .filter(([k]) => k.startsWith('fares_model'))
      .map(([, m]) => m?.harvested_from)
      .filter(Boolean)
      .sort();
    const latest = stamps[stamps.length - 1];
    if (!latest) return null;
    const days = Math.max(0, Math.round(
      (Date.parse(`${todayISO()}T00:00:00Z`) - Date.parse(`${latest}T00:00:00Z`)) / 86400000,
    ));
    if (days === 0) return t('home.freshToday');
    if (days === 1) return t('home.freshYesterday');
    return t('home.freshDays', { n: days });
  }, [meta, t]);

  const originAt = useMemo(() => {
    const o = meta.origins?.[choices.origin];
    return o ? project(o.lat, o.lon) : null;
  }, [meta, choices.origin]);

  /* ── Map pins ──────────────────────────────────────────────────────────
     pricedAll arrives cheapest-first, so walking it in order and keeping the
     first pin in each patch of the frame gives eight labels that do not
     collide, with the cheapest of them first (and flagged). The origin marker
     owns its own patch too: the nearest destinations to home are also among
     the cheapest, so without this the CRL ring printed straight through the
     Villers Abbey label. */
  const pins = useMemo(() => {
    const clash = (a, b) => Math.abs(a.x - b.x) < 0.14 && Math.abs(a.y - b.y) < 0.1;
    const out = [];
    for (const p of pricedAll || []) {
      if (out.length >= MAX_PINS) break;
      // Flight prices only. The engine quietly prices a flightless place as a
      // drive, and a landing page whose headline promises fares should not
      // advertise a €327 tank of fuel to Albania as its cheapest find.
      if (p.mode !== 'plane' || !p.planeOk) continue;
      const at = project(p.lat, p.lon);
      if (!at) continue;
      if (originAt && clash(at, originAt)) continue;
      if (out.some((o) => clash(o, at))) continue;
      out.push({ ...p, ...at });
    }
    return out;
  }, [pricedAll, originAt]);

  /* ── The receipt ───────────────────────────────────────────────────────
     The same destination the map flags as cheapest, itemised. Deliberately
     pins[0] rather than a separately-chosen "best" one: when the receipt and
     the flagged pin disagree, the page argues with itself, and it did (the
     map flagged a €568 drive while the receipt totalled a €898 flight).
     Whatever mode the engine priced, the lines below say so. */
  const receipt = useMemo(() => {
    if (!data || !pricedCount || nights <= 0) return null;
    const pick = pins[0] || pricedAll[0];
    const dest = data.destinations[pick.id];
    const trip = dest && composeTrip(dest, departDate, returnDate, choices, data.destinations);
    if (!trip) return null;

    /* The lines must add up to the total, exactly. composeTrip prices two
       different journeys and only one of them is the answer: the plane total
       is flights + bags + transfer + rental + stay, the car total is fuel and
       tolls + stay, and it carries the OTHER option's figures alongside.
       Listing them all put a €100 bag and a €140 rental on a receipt whose
       total contained neither. Follow transport_mode, and nothing else. */
    const lines = [];
    const push = (label, amount) => {
      if (Number.isFinite(amount) && amount > 0) lines.push({ label, amount });
    };
    if (trip.transport_mode === 'plane') {
      push(t('home.rFlightOut', { date: fmtDate(departDate) }), trip.fare_out_eur * groupSize);
      push(t('home.rFlightBack', { date: fmtDate(returnDate) }), trip.fare_in_eur * groupSize);
      push(t('home.rBag', { bag: bagLabel }), trip.baggage_total);
      push(t('home.rTransfer', { city: trip.anchor_airport || pick.iata || pick.city }), trip.transfer_total);
      push(t('home.rRental', { n: nights }), trip.rental_total);
    } else if (trip.driving) {
      push(t('home.rDrive'), trip.driving.total);
    }
    push(t('home.rStay', { n: nights, city: pick.city }), trip.accom_total);
    push(t('home.rFood', { n: nights }), trip.ground_total);

    /* What one changed input does to the total, computed rather than written.
       Try a night longer first, then a night shorter: on a sparse fare
       calendar one of the two is often unpriced. */
    let shift = null;
    for (const delta of [1, -1]) {
      const alt = addDays(returnDate, delta);
      if (alt <= departDate) continue;
      if (dateBounds?.max && alt > dateBounds.max) continue;
      if (dateBounds?.min && alt < dateBounds.min) continue;
      const altTrip = composeTrip(dest, departDate, alt, choices, data.destinations);
      if (altTrip) { shift = { date: alt, total: altTrip.grand_total }; break; }
    }
    let shiftLine;
    if (!shift) {
      shiftLine = t('home.rShiftNone', { ago: fareAge || t('home.freshUnknown') });
    } else {
      const vars = { date: fmtDate(shift.date), price: eurExact(shift.total) };
      if (shift.total < trip.grand_total - 0.005) shiftLine = t('home.rShiftDown', vars);
      else if (shift.total > trip.grand_total + 0.005) shiftLine = t('home.rShiftUp', vars);
      else shiftLine = t('home.rShiftSame', { date: vars.date });
    }

    return {
      city: pick.city,
      country: pick.country,
      route: `${trip.origin || choices.origin} to ${trip.anchor_airport || pick.iata || ''}`.trim(),
      rating: dest.rating?.score ?? null,
      ratingLabel: dest.rating?.label || '',
      lines,
      total: trip.grand_total,
      perDay: trip.grand_total / nights,
      perPerson: groupSize > 1 ? trip.grand_total_pp : null,
      shiftLine,
    };
  }, [data, pins, pricedAll, pricedCount, departDate, returnDate, dateBounds,
    choices, nights, groupSize, bagLabel, fareAge, t]);

  const accountName = user?.user_metadata?.full_name?.trim() || user?.email;
  const totalLabel = count(totalCount);

  const navLinks = [
    { key: 'map', label: t('nav.map') },
    { key: 'trip', label: t('nav.trip') },
    { key: 'day', label: t('nav.day') },
  ];

  return (
    <div className="home-page">
      {/* ── Nav ── */}
      <header className="home-nav">
        <div className="home-wrap home-nav-inner">
          <button className="home-mark" onClick={onExplore}>
            <span className="home-mark-dot" aria-hidden="true" />
            Carta
          </button>
          <nav className="home-nav-links" aria-label={t('home.navSections')}>
            {navLinks.map(({ key, label }) => (
              <button key={key} className="home-nav-link" onClick={() => onNavigate(key)}>
                {label}
              </button>
            ))}
            <button className="home-nav-link" onClick={() => goTo('home-pricing')}>
              {t('home.navPricing')}
            </button>
          </nav>
          <div className="home-nav-actions">
            <LanguagePicker />
            <button className="home-btn home-btn-ghost home-btn-sm" onClick={onOpenAccount}>
              {user
                ? (
                  <>
                    <span className="home-nav-initial">{(accountName || '?')[0].toUpperCase()}</span>
                    {t('header.account')}
                  </>
                )
                : t('gate.signIn')}
            </button>
            <button className="home-btn home-btn-primary home-btn-sm" onClick={onExplore}>
              {t('home.openApp')}
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="home-hero">
          <div className="home-wrap">
            <p className="home-status">
              <span className="home-status-dot" aria-hidden="true" />
              {pricedCount
                ? t('home.status', {
                  priced: count(pricedCount),
                  total: totalLabel,
                  city: originCity,
                  ago: fareAge || t('home.freshUnknown'),
                })
                : t('home.statusPending', { total: totalLabel, city: originCity })}
            </p>
            <h1 className="home-h1">{t('home.headline')}</h1>
            <p className="home-lede">{t('home.lede', { total: totalLabel })}</p>
            <div className="home-hero-ctas">
              <button className="home-btn home-btn-primary home-btn-lg" onClick={onExplore}>
                {t('home.ctaMap')}
              </button>
              <button className="home-btn home-btn-ghost home-btn-lg" onClick={onPlanTrip}>
                {t('home.ctaTrip')}
              </button>
            </div>

            {/* The search strip: the app's real controls, so editing here
                reprices the map behind this page. */}
            <div className="home-search">
              <div className="home-field">
                <span className="home-field-label">{t('origin.from')}</span>
                <OriginPicker data={data} origin={choices.origin} onChangeOrigin={onChangeOrigin} />
              </div>
              <div className="home-field">
                <span className="home-field-label">{t('filter.depart')}</span>
                <DateField
                  value={departDate || ''}
                  min={dateBounds?.min}
                  max={dateBounds?.max}
                  onChange={onDepartChange}
                />
              </div>
              <div className="home-field">
                <span className="home-field-label">{t('filter.return')}</span>
                <DateField
                  value={returnDate || ''}
                  min={departDate || dateBounds?.min}
                  max={dateBounds?.max}
                  onChange={(v) => setReturnDate(v)}
                />
              </div>
              <div className="home-field">
                <span className="home-field-label">{t('filter.people')}</span>
                <NumberField
                  value={choices.group_size}
                  min={1}
                  max={20}
                  onCommit={(v) => setChoices({ ...choices, group_size: v })}
                  ariaLabel={t('filter.people')}
                />
              </div>
              <div className="home-field">
                <span className="home-field-label">{t('filter.baggage')}</span>
                <Dropdown
                  value={choices.baggage_key}
                  onChange={(key) => {
                    const opt = baggageOpts[key];
                    setChoices({
                      ...choices,
                      baggage_key: key,
                      baggage_per_direction_eur: opt?.per_direction_eur || 0,
                    });
                  }}
                  options={Object.entries(baggageOpts).map(([k, v]) => ({ value: k, label: v.label }))}
                />
              </div>
              <div className="home-field home-field-go">
                <button className="home-btn home-btn-primary" onClick={onExplore}>
                  {t('home.priceAll', { total: totalLabel })}
                </button>
              </div>
            </div>

            {/* ── The one dark surface: real destinations, real prices ── */}
            <div className="home-map">
              <svg className="home-map-grat" viewBox="0 0 1180 430" preserveAspectRatio="none" aria-hidden="true">
                <g className="grat">
                  <path d="M0 60H1180M0 130H1180M0 200H1180M0 270H1180M0 340H1180M0 410H1180" />
                  <path d="M90 0V430M230 0V430M370 0V430M510 0V430M650 0V430M790 0V430M930 0V430M1070 0V430" />
                </g>
                <g className="coast">
                  <path d="M180 300C260 240 300 250 360 210 420 170 470 190 520 150" />
                  <path d="M240 380C330 330 400 340 470 290 540 240 610 260 690 210" />
                  <path d="M480 400C560 350 640 360 720 300 800 240 880 250 980 190" />
                </g>
              </svg>

              {originAt && (
                <p
                  className={`home-origin ${anchorFor(originAt.x)}`}
                  style={{ left: `${originAt.x * 100}%`, top: `${originAt.y * 100}%` }}
                >
                  <span className="home-origin-ring" aria-hidden="true" />
                  {choices.origin}
                </p>
              )}

              {pins.map((p, i) => (
                <p
                  key={p.id}
                  /* --flag marks exactly one thing per view: the cheapest. */
                  className={`home-pin ${i === 0 ? 'home-pin-flag' : ''} ${anchorFor(p.x)}`}
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                >
                  <span className="home-pin-dot" aria-hidden="true" />
                  {p.city} <b>{eur(p.total)}</b>
                </p>
              ))}

              {!pins.length && (
                <p className="home-map-empty">{t('home.mapEmpty', { city: originCity })}</p>
              )}

              <p className="home-map-legend">
                {pins.length
                  ? t('home.mapLegend', { n: nights, party: groupSize, bag: bagLabel })
                  : t('home.mapLegendPending')}
              </p>
            </div>
          </div>
        </section>

        {/* ── Trust strip ── */}
        <div className="home-trust">
          <div className="home-wrap home-trust-grid">
            <div className="home-trust-cell">
              <h3>{t('home.trustFaresTitle')}</h3>
              <p>{t('home.trustFaresBody')}</p>
            </div>
            <div className="home-trust-cell">
              <h3>{t('home.trustBagsTitle')}</h3>
              <p>{t('home.trustBagsBody')}</p>
            </div>
            <div className="home-trust-cell">
              <h3>{t('home.trustHubsTitle')}</h3>
              <p>{t('home.trustHubsBody')}</p>
            </div>
            <div className="home-trust-cell">
              <h3>{t('home.trustAccountTitle')}</h3>
              <p>{t('home.trustAccountBody')}</p>
            </div>
          </div>
        </div>

        {/* ── One honest total: the receipt ── */}
        <section className="home-section" id="home-total">
          <div className="home-wrap home-two">
            <div>
              <p className="home-eyebrow">{t('home.totalEyebrow')}</p>
              <h2 className="home-h2">{t('home.totalTitle')}</h2>
              <p className="home-lede">{t('home.totalBody')}</p>
              <ul className="home-plist">
                <li><b>{t('home.pFlights')}</b><span>{t('home.pFlightsBody')}</span></li>
                <li><b>{t('home.pBags')}</b><span>{t('home.pBagsBody')}</span></li>
                <li><b>{t('home.pTransfers')}</b><span>{t('home.pTransfersBody')}</span></li>
                <li><b>{t('home.pStay')}</b><span>{t('home.pStayBody')}</span></li>
              </ul>
            </div>

            {receipt ? (
              <div className="home-receipt">
                <div className="home-r-head">
                  <div>
                    <p className="home-r-title">{receipt.city}, {receipt.country}</p>
                    <p className="home-r-sub">
                      {receipt.route}, {t('home.rNights', { n: nights })}, {t('home.rParty', { n: groupSize })}
                    </p>
                  </div>
                  {receipt.rating != null && (
                    <div className="home-r-rating">
                      <p className="home-num">{receipt.rating.toFixed(1)}/10</p>
                      <p className="home-r-sub">{receipt.ratingLabel}</p>
                    </div>
                  )}
                </div>
                <div className="home-r-body">
                  {receipt.lines.map((l) => (
                    <p className="home-r-line" key={l.label}>
                      <span>{l.label}</span>
                      <b>{eurExact(l.amount)}</b>
                    </p>
                  ))}
                </div>
                <div className="home-r-total">
                  <div>
                    <p className="home-r-total-label">{t('home.rWholeTrip')}</p>
                    <p className="home-r-total-sub">
                      {t('home.rPerDay', { price: eurExact(receipt.perDay) })}
                      {receipt.perPerson != null
                        && `, ${t('home.rPerPerson', { price: eurExact(receipt.perPerson) })}`}
                    </p>
                  </div>
                  <p className="home-r-big">{eurExact(receipt.total)}</p>
                </div>
                <p className="home-r-foot">{receipt.shiftLine}</p>
              </div>
            ) : (
              <div className="home-receipt">
                <div className="home-r-head">
                  <p className="home-r-title">{t('home.rEmptyTitle')}</p>
                </div>
                <div className="home-r-body">
                  <p className="home-r-line"><span>{t('home.rEmptyBody', { city: originCity })}</span></p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Product 1: the map ── */}
        <section className="home-section home-section-tight" id="home-map">
          <div className="home-wrap home-two home-two-flip">
            <div>
              <p className="home-eyebrow">{t('home.mapEyebrow')}</p>
              <h2 className="home-h2">{t('home.mapTitle')}</h2>
              <p className="home-lede">{t('home.mapBody')}</p>
              <div className="home-two-cta">
                <button className="home-btn home-btn-ghost" onClick={onExplore}>{t('home.mapCta')}</button>
              </div>
            </div>
            <Shot src="/shots/map.webp" url="carta-europetravel.com/map" alt={t('home.shotMapAlt')} />
          </div>
        </section>

        {/* ── Product 2: the trip planner ── */}
        <section className="home-section home-section-tight">
          <div className="home-wrap home-two">
            <div>
              <p className="home-eyebrow">{t('home.tripEyebrow')}</p>
              <h2 className="home-h2">{t('home.tripTitle')}</h2>
              <p className="home-lede">{t('home.tripBody')}</p>
              <div className="home-two-cta">
                <button className="home-btn home-btn-ghost" onClick={onPlanTrip}>{t('home.tripCta')}</button>
              </div>
            </div>
            <Shot src="/shots/trip.webp" url="carta-europetravel.com/trip" alt={t('home.shotTripAlt')} />
          </div>
        </section>

        {/* ── Product 3: the day planner ── */}
        <section className="home-section home-section-tight">
          <div className="home-wrap home-two home-two-flip">
            <div>
              <p className="home-eyebrow">{t('home.dayEyebrow')}</p>
              <h2 className="home-h2">{t('home.dayTitle')}</h2>
              <p className="home-lede">{t('home.dayBody')}</p>
              <div className="home-two-cta">
                <button className="home-btn home-btn-ghost" onClick={() => onNavigate('day')}>
                  {t('home.dayCta')}
                </button>
              </div>
            </div>
            <Shot src="/shots/day.webp" url="carta-europetravel.com/day" alt={t('home.shotDayAlt')} />
          </div>
        </section>

        {/* ── Coverage: the limits, stated in the product's own voice ── */}
        <section className="home-section home-cov" id="home-coverage">
          <div className="home-wrap">
            <p className="home-eyebrow">{t('home.covEyebrow')}</p>
            <h2 className="home-h2">{t('home.covTitle')}</h2>
            <p className="home-lede">{t('home.covBody')}</p>
            <div className="home-cov-grid">
              <div className="home-cov-card">
                <h3 className="home-h3">{t('home.covRealTitle')}</h3>
                <ul>
                  <li>{t('home.covReal1')}</li>
                  <li>{t('home.covReal2', { total: totalLabel, countries: countryCount })}</li>
                  <li>{t('home.covReal3')}</li>
                  <li>{t('home.covReal4')}</li>
                </ul>
              </div>
              <div className="home-cov-card">
                <h3 className="home-h3">{t('home.covModelTitle')}</h3>
                <ul>
                  <li>{t('home.covModel1')}</li>
                  <li>{t('home.covModel2')}</li>
                  <li>{t('home.covModel3')}</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── Pricing ────────────────────────────────────────────────────
            PLACEHOLDER TIERS. The figures and limits below are the ones from
            the redesign brief, not a live billing product: nothing in the app
            charges for Plus yet. Confirm the real names, limits and prices
            before this page goes public. */}
        <section className="home-section" id="home-pricing">
          <div className="home-wrap">
            <p className="home-eyebrow">{t('home.priceEyebrow')}</p>
            <h2 className="home-h2">{t('home.priceTitle')}</h2>
            <p className="home-lede">{t('home.priceBody')}</p>
            <div className="home-prices">
              <div className="home-plan">
                <p className="home-plan-name">{t('home.planFree')}</p>
                <p className="home-plan-price">€0</p>
                <p className="home-plan-per">{t('home.planFreePer')}</p>
                <ul>
                  <li>{t('home.planFree1', { total: totalLabel })}</li>
                  <li>{t('home.planFree2')}</li>
                  <li>{t('home.planFree3')}</li>
                  <li>{t('home.planFree4')}</li>
                </ul>
                <button className="home-btn home-btn-ghost home-btn-wide" onClick={onExplore}>
                  {t('home.mapCta')}
                </button>
              </div>
              <div className="home-plan home-plan-hi">
                <p className="home-badge">{t('home.planBadge')}</p>
                <p className="home-plan-name">{t('home.planPlus')}</p>
                <p className="home-plan-price">€4.99</p>
                <p className="home-plan-per">{t('home.planPlusPer')}</p>
                <ul>
                  <li>{t('home.planPlus1')}</li>
                  <li>{t('home.planPlus2')}</li>
                  <li>{t('home.planPlus3')}</li>
                  <li>{t('home.planPlus4')}</li>
                  <li>{t('home.planPlus5')}</li>
                </ul>
                <button className="home-btn home-btn-primary home-btn-wide" onClick={onOpenAccount}>
                  {t('home.planPlusCta')}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="home-section home-section-tight">
          <div className="home-wrap home-faq">
            <h2 className="home-h2">{t('home.faqTitle')}</h2>
            <details open>
              <summary>{t('home.faq1Q')}</summary>
              <p>{t('home.faq1A')}</p>
            </details>
            <details>
              <summary>{t('home.faq2Q')}</summary>
              <p>{t('home.faq2A')}</p>
            </details>
            <details>
              <summary>{t('home.faq3Q')}</summary>
              <p>{t('home.faq3A')}</p>
            </details>
            <details>
              <summary>{t('home.faq4Q')}</summary>
              <p>{t('home.faq4A')}</p>
            </details>
            <details>
              <summary>{t('home.faq5Q')}</summary>
              <p>{t('home.faq5A')}</p>
            </details>
          </div>
        </section>
      </main>

      {/* ── Closer: flat ink, no gradient ── */}
      <div className="home-closer">
        <div className="home-wrap">
          <h2 className="home-h2">{t('home.closerTitle')}</h2>
          <p className="home-lede">{t('home.closerBody')}</p>
          <div className="home-closer-row">
            <button className="home-btn home-btn-primary home-btn-lg" onClick={onExplore}>
              {t('home.ctaMap')}
            </button>
            <button className="home-btn home-btn-ghost home-btn-lg" onClick={onPlanTrip}>
              {t('home.ctaTrip')}
            </button>
          </div>
          <p className="home-closer-fine">{t('fareNotice.body1')} {t('fareNotice.body2')}</p>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="home-footer">
        <div className="home-wrap">
          <div className="home-footer-grid">
            <div>
              <span className="home-mark">
                <span className="home-mark-dot" aria-hidden="true" />
                Carta
              </span>
              <p className="home-footer-tag">{t('home.footTagline')}</p>
            </div>
            <div className="home-footer-col">
              <h3>{t('home.footProduct')}</h3>
              <ul>
                {navLinks.map(({ key, label }) => (
                  <li key={key}>
                    <button className="home-footer-link" onClick={() => onNavigate(key)}>{label}</button>
                  </li>
                ))}
                <li>
                  <button className="home-footer-link" onClick={() => goTo('home-pricing')}>
                    {t('home.navPricing')}
                  </button>
                </li>
              </ul>
            </div>
            <div className="home-footer-col">
              <h3>{t('home.footCoverage')}</h3>
              <ul>
                <li>
                  <button className="home-footer-link" onClick={() => goTo('home-coverage')}>
                    {t('home.footAirlines')}
                  </button>
                </li>
                <li>
                  <button className="home-footer-link" onClick={() => goTo('home-total')}>
                    {t('home.footHowPriced')}
                  </button>
                </li>
                <li>
                  <button className="home-footer-link" onClick={onExplore}>
                    {t('home.footDestList')}
                  </button>
                </li>
              </ul>
            </div>
            <div className="home-footer-col">
              <h3>{t('home.footLegal')}</h3>
              <ul>
                <li>
                  <button className="home-footer-link" onClick={() => setPrivacyOpen(true)}>
                    {t('home.footPrivacy')}
                  </button>
                </li>
                <li>
                  <a className="home-footer-link" href={`mailto:${CONTACT}`}>{t('home.footContact')}</a>
                </li>
              </ul>
            </div>
          </div>
          <div className="home-footer-bottom">
            <span>{t('home.footRights', { year: new Date().getFullYear() })}</span>
            <span className="home-num">
              {t('home.footCounts', { total: totalLabel, countries: countryCount })}
            </span>
          </div>
        </div>
      </footer>

      {privacyOpen && <PrivacyPolicy onClose={() => setPrivacyOpen(false)} />}
    </div>
  );
}

/**
 * A product screenshot in a browser frame. The images are captured from the
 * running app by scripts/shots.mjs; until they exist (or if one fails to
 * load) the frame states what belongs there rather than shipping a broken
 * image icon.
 */
function Shot({ src, url, alt }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="home-shot">
      <div className="home-shot-bar" aria-hidden="true">
        <i /><i /><i />
        <span>{url}</span>
      </div>
      {failed
        ? <div className="home-shot-body"><p>{alt}</p></div>
        : <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />}
    </div>
  );
}
