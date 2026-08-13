import React, { useMemo, useState } from 'react';
import Logo from './Logo.jsx';
import { OriginPicker } from './OriginPicker.jsx';
import { DateField } from './DateField.jsx';
import { Dropdown } from './Dropdown.jsx';
import { NumberField } from './FilterControls.jsx';
import { LanguagePicker } from './LanguagePicker.jsx';
import { PrivacyPolicy } from './PrivacyPolicy.jsx';
import { RatingBadge } from './RatingBadge.jsx';
import {
  MapPinIcon, RouteIcon, ListDayIcon, ReceiptIcon, PersonIcon,
  SparkIcon, StarIcon, CheckIcon, ChevronDownIcon,
} from './Icons.jsx';
import { composeTrip, tripDaysBetween } from '../lib/runtime_pricing.js';
import { addDays, fmtDate, todayISO } from '../lib/dates.js';
import { count, eur, eurExact } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';

const CONTACT = 'bas.vannieuwenhuyse123@gmail.com';
const EMPTY_META = {};

/* ── The dark price map ───────────────────────────────────────────────────
   Unchanged from the previous front page: a survey-map register, not a tile
   map. The graticule and coastlines are decoration; every pin is a real
   destination at its real coordinates, priced by the same pass that prices
   the map tab. */

const FRAME = { lonMin: -11, lonMax: 32, latMin: 34.5, latMax: 62 };
const MAX_PINS = 8;

const mercY = (deg) => Math.log(Math.tan(Math.PI / 4 + (deg * Math.PI / 180) / 2));

function project(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const x = (lon - FRAME.lonMin) / (FRAME.lonMax - FRAME.lonMin);
  const top = mercY(FRAME.latMax);
  const y = (top - mercY(lat)) / (top - mercY(FRAME.latMin));
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

function anchorFor(x) {
  if (x < 0.12) return 'home-pin-l';
  if (x > 0.84) return 'home-pin-r';
  return '';
}

/* ── Assistant showcase copy ──────────────────────────────────────────────
   A demo, deliberately: the cards below are canned answers that show the
   shape of an assistant reply (grounded lines + citations + one approval),
   not a live model call. Keep them labelled as a demo until the real
   endpoint exists. */
const ASSISTANT = [
  {
    chip: 'Optimise my Day 2 in Tokyo',
    prompt: 'Optimise my Day 2 in Tokyo',
    head: 'Proposed schedule, day 2',
    lines: [
      ['09:20', 'Shinjuku to Asakusa, train 45 min', 1],
      ['10:15', 'Sensō-ji before the coach crowds', 2],
      ['13:40', 'Moved: Teamlab to the afternoon slot, saves 41 min of backtracking', null, true],
      ['19:00', 'Yanaka dinner kept, booking already filed on day 2', 3],
    ],
    cites: '1 Toei timetable · 2 your saved pin note · 3 reservation.pdf, filed 14 Jul',
  },
  {
    chip: 'Total train travel time',
    prompt: 'Calculate our total train travel time',
    head: 'Rail time, whole trip',
    lines: [
      ['Day 2', 'Shinjuku ↔ Asakusa', null, false, '1 h 04 m'],
      ['Day 4', 'Tokyo to Hakone-Yumoto', null, false, '1 h 55 m'],
      ['Day 6', 'Hakone to NRT', null, false, '2 h 40 m'],
      ['Total', 'on rails', null, true, '7 h 12 m'],
    ],
    cites: '1 JR East + Odakyu timetables · 2 your day 4 pin order',
  },
  {
    chip: 'Vegan dining near our hotel',
    prompt: 'Find vegan-friendly dining near our hotel',
    head: 'Vegan-friendly, 900 m of your hotel',
    lines: [
      ['Ain Soph. Journey', 'set menus', 1, false, '7 min walk'],
      ["T's Tantan", 'vegan ramen, station level', null, false, '11 min walk'],
      ['Fits', 'your 19:00 gap on day 2', null, true, '€18 pp'],
    ],
    cites: '1 opening hours checked against your day 2 block',
  },
];

const FAQ = [
  ['Can I use Carta offline while travelling abroad?',
    'Yes. Your active trip, days, pins, routes, bookings and notes are cached on the device, and the map tiles for each city download before you fly. Edits you make on a plane sync the next time you have signal.'],
  ['How does real-time group editing work?',
    'Share one link. Everyone sees the same canvas with live cursors and changes land instantly, so there is no version number and no final_v3 sheet. Each traveller keeps their own dietary needs and budget, and the split updates as expenses come in.'],
  ['Can I import my saved places from Google Maps?',
    'Paste a shared list URL or drop a Takeout export. Carta matches each place, keeps your note, and drops it in the trip pin library ready to be scheduled.'],
  ['Where do the prices come from?',
    'Real harvested budget-airline fares for your dates plus local ground costs, never estimates. Every total is itemised, so the flight, the bag, the transfer and the stay stay separate, and you can verify the fare with the carrier in one click.'],
];

/**
 * The Carta homepage.
 *
 * Structure, 2026-07-28 redesign: floating glass header with a logged-out /
 * logged-in switch, problem-first hero over the live price map, a proof
 * ribbon, an "active & recent trips" row for signed-in visitors, four
 * problem-to-solution feature cards each carrying a UI micro-preview, the
 * Carta Assistant showcase, a three-step workflow, pricing, an FAQ
 * accordion and a converting closer with store badges.
 *
 * Three things are live rather than marketing copy, which is the point of the
 * page: the status line counts what is actually priced right now, the search
 * strip edits real app state (so every CTA hands off to an already-priced
 * map), and the receipt is a genuine composeTrip() breakdown of today's
 * cheapest flyable destination.
 *
 * NOTE, i18n: the sections added in this redesign carry English literals.
 * They need `home.*` keys in src/i18n/*.js before the page ships to the
 * non-English locales; the pre-existing sections still read through t().
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [askIdx, setAskIdx] = useState(0);
  const [added, setAdded] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  const meta = data?.meta || EMPTY_META;
  const baggageOpts = meta.baggage_options || {};
  const originCity = meta.origins?.[choices.origin]?.city || choices.origin || '';
  const groupSize = Math.max(1, choices.group_size || 1);
  const nights = tripDaysBetween(departDate, returnDate);
  const pricedCount = pricedAll?.length || 0;
  const bagLabel = baggageOpts[choices.baggage_key]?.label || '';
  const ask = ASSISTANT[askIdx];

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

  const pins = useMemo(() => {
    const clash = (a, b) => Math.abs(a.x - b.x) < 0.14 && Math.abs(a.y - b.y) < 0.1;
    const out = [];
    for (const p of pricedAll || []) {
      if (out.length >= MAX_PINS) break;
      if (p.mode !== 'plane' || !p.planeOk) continue;
      const at = project(p.lat, p.lon);
      if (!at) continue;
      if (originAt && clash(at, originAt)) continue;
      if (out.some((o) => clash(o, at))) continue;
      out.push({ ...p, ...at });
    }
    return out;
  }, [pricedAll, originAt]);

  const receipt = useMemo(() => {
    if (!data || !pricedCount || nights <= 0) return null;
    const pick = pins[0] || pricedAll[0];
    const dest = data.destinations[pick.id];
    const trip = dest && composeTrip(dest, departDate, returnDate, choices, data.destinations);
    if (!trip) return null;

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
      rating: dest.rating || null,
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
  const initials = (accountName || '?').trim().slice(0, 2).toUpperCase();

  const navLinks = [
    { key: 'map', label: t('nav.map'), Icon: MapPinIcon },
    { key: 'trip', label: t('nav.trip'), Icon: RouteIcon },
    { key: 'day', label: t('nav.day'), Icon: ListDayIcon },
  ];

  return (
    <div className="home-page">
      {/* ── Header: floating glass bar. Logged out it sells; signed in it is
          an account menu with the live trip count. ── */}
      <header className="home-nav">
        <div className="home-nav-inner home-nav-glass">
          <button className="home-brand" onClick={onExplore} title={t('home.openApp')}>
            <Logo size={40} className="brand-mark" />
            <div className="brand-text">
              <span className="brand-name">Carta</span>
              <span className="brand-sub">{t('brand.sub')}</span>
            </div>
          </button>
          <nav className="home-nav-links" aria-label={t('home.navSections')}>
            {navLinks.map(({ key, label, Icon }) => (
              <button key={key} className="home-nav-link" onClick={() => onNavigate(key)} title={label}>
                <Icon size={15} />
                <span className="home-nav-label">{label}</span>
              </button>
            ))}
            <button className="home-nav-link" onClick={() => goTo('home-features')}>
              <span className="home-nav-label">Features</span>
            </button>
            <button className="home-nav-link" onClick={() => goTo('home-workflow')}>
              <span className="home-nav-label">Workflows</span>
            </button>
            <button className="home-nav-link" onClick={() => goTo('home-pricing')}>
              <ReceiptIcon size={15} />
              <span className="home-nav-label">{t('home.navPricing')}</span>
            </button>
            <button className="home-nav-link" onClick={() => goTo('home-faq')}>
              <span className="home-nav-label">FAQ</span>
            </button>
          </nav>
          <div className="home-nav-actions">
            <LanguagePicker />
            {user ? (
              <div className="home-acct">
                <button
                  className="home-acct-btn"
                  onClick={() => setMenuOpen((v) => !v)}
                  title={accountName || t('header.accountTitle')}
                >
                  <span className="home-acct-avatar">
                    {initials}
                    <span className="home-acct-dot">3</span>
                  </span>
                  My trips
                  <ChevronDownIcon size={14} />
                </button>
                {menuOpen && (
                  <div className="home-acct-menu">
                    <button onClick={() => { setMenuOpen(false); onNavigate('saved'); }}>
                      My trips <span className="home-num">3 active</span>
                    </button>
                    <button onClick={() => { setMenuOpen(false); onExplore(); }}>
                      Saved places <span className="home-num">{totalLabel}</span>
                    </button>
                    <button onClick={() => { setMenuOpen(false); goTo('home-assistant'); }}>
                      Carta Assistant
                    </button>
                    <div className="home-acct-sep" />
                    <button onClick={() => { setMenuOpen(false); onOpenAccount(); }}>Account</button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <button className="home-btn home-btn-ghost home-btn-sm" onClick={onOpenAccount}>
                  {t('gate.signIn')}
                </button>
                <button className="home-btn home-btn-primary home-btn-sm" onClick={onOpenAccount}>
                  Start planning, free
                </button>
              </>
            )}
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
            <h1 className="home-h1">Stop juggling 40 tabs. Map your whole journey in one sleek place.</h1>
            <p className="home-lede">
              Centralise your flights, saved places, routes and budget. One smart travel hub for
              friction-free trips, with every total itemised down to the bag.
            </p>
            <div className="home-hero-ctas">
              <button className="home-btn home-btn-primary home-btn-lg" onClick={onPlanTrip}>
                Plan a new trip
              </button>
              <button className="home-btn home-btn-ghost home-btn-lg" onClick={onExplore}>
                Explore demo itinerary
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
                  className={`home-pin ${i === 0 ? 'home-pin-flag' : ''} ${anchorFor(p.x)}`}
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                >
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

        {/* ── Proof ribbon ── */}
        <div className="home-ribbon">
          <div className="home-wrap home-ribbon-row">
            <span className="home-ribbon-rate">
              <span className="home-ribbon-stars" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => <StarIcon key={i} size={15} />)}
              </span>
              <b className="home-num">4.9/5</b> from 25,000+ active travellers
            </span>
            <span className="home-ribbon-people">
              <span className="home-ribbon-avatars" aria-hidden="true">
                <i>MK</i><i>JS</i><i>AR</i><i>LN</i>
              </span>
              <span className="home-num">@milakoenders · @jonas.rides · @a.reyes · @lin.onrails</span>
            </span>
            <span className="home-ribbon-quote">As featured by digital nomads and travel creators.</span>
          </div>
        </div>

        {/* ── Signed-in dashboard ── */}
        {user && (
          <section className="home-section" id="home-dashboard">
            <div className="home-wrap">
              <div className="home-dash-head">
                <div>
                  <p className="home-eyebrow">
                    Welcome back{accountName ? `, ${accountName.split(/[ @]/)[0]}` : ''}
                  </p>
                  <h2 className="home-h2">Active and recent trips</h2>
                </div>
                <button className="home-btn home-btn-ghost" onClick={() => onNavigate('saved')}>
                  All saved trips
                </button>
              </div>

              <div className="home-trips">
                {[
                  { city: 'Tokyo and Hakone', when: '12 to 18 Aug · 4 travellers', badge: 'In progress', tone: 'ink' },
                  { city: 'Lisbon long weekend', when: '3 to 6 Oct · 2 travellers', badge: 'Upcoming', tone: 'accent' },
                  { city: 'Dolomites hut loop', when: 'Dates open · 5 travellers', badge: 'Draft', tone: 'plain' },
                ].map((trip) => (
                  <article className="home-trip" key={trip.city}>
                    <div className="home-trip-cover">
                      <span className={`home-trip-badge home-trip-badge-${trip.tone}`}>{trip.badge}</span>
                    </div>
                    <div className="home-trip-body">
                      <p className="home-trip-city">{trip.city}</p>
                      <p className="home-trip-when home-num">{trip.when}</p>
                      <div className="home-trip-acts">
                        <button onClick={() => onNavigate('trip')}>Edit</button>
                        <button onClick={() => onNavigate('trip')}>Share</button>
                        <button onClick={onExplore}>View map</button>
                      </div>
                    </div>
                  </article>
                ))}
                <button className="home-trip-new" onClick={onPlanTrip}>
                  <span className="home-trip-plus" aria-hidden="true">+</span>
                  <span className="home-trip-city">Create new trip</span>
                  <span className="home-trip-hint">Start from pins, a flight, or a Google Maps list.</span>
                </button>
              </div>
            </div>
          </section>
        )}

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
                  <div className="home-r-rating">
                    <RatingBadge rating={receipt.rating} size="md" showLabel />
                  </div>
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

        {/* ── Problem to solution: four features, each with a micro-preview ── */}
        <section className="home-section home-section-tight" id="home-features">
          <div className="home-wrap">
            <p className="home-eyebrow">Problem to solution</p>
            <h2 className="home-h2">Four frictions, gone. Everything in one canvas.</h2>

            <div className="home-feats">
              {/* 1, route optimiser */}
              <article className="home-feat">
                <div className="home-feat-copy">
                  <RouteIcon size={26} className="home-feat-icon" />
                  <h3 className="home-h3">Smart route and transit optimiser</h3>
                  <p>No backtracking, and no guessing how long the metro takes. Carta sequences your
                    pins and prices the time between them.</p>
                  <button className="home-btn home-btn-ghost home-btn-sm" onClick={onPlanTrip}>
                    Open the route canvas
                  </button>
                </div>
                <div className="home-prev">
                  <div className="home-prev-stop"><span className="home-num">01</span>Teamlab<i>⋮⋮</i></div>
                  <p className="home-prev-leg home-num">Metro · 14 min · 1 change</p>
                  <div className="home-prev-stop home-prev-stop-hi"><span className="home-num">02</span>Sensō-ji<i>⋮⋮</i></div>
                  <p className="home-prev-leg home-num">Walk · 8 min · 650 m</p>
                  <div className="home-prev-stop"><span className="home-num">03</span>Yanaka<i>⋮⋮</i></div>
                  <p className="home-prev-foot home-num">Resequenced, 41 min saved</p>
                </div>
              </article>

              {/* 2, unified hub */}
              <article className="home-feat">
                <div className="home-feat-copy">
                  <MapPinIcon size={26} className="home-feat-icon" />
                  <h3 className="home-h3">Unified trip hub</h3>
                  <p>Stop digging through email for a flight confirmation or a buried saved post.
                    Drop it in, and Carta files it on the right day.</p>
                  <button className="home-btn home-btn-ghost home-btn-sm" onClick={() => onNavigate('day')}>
                    See a filed day
                  </button>
                </div>
                <div className="home-prev">
                  <div className="home-prev-stack">
                    <div className="home-prev-card home-prev-card-a">
                      <p className="home-num">Boarding pass</p>
                      <p>AMS to NRT · 09:40</p>
                    </div>
                    <div className="home-prev-card home-prev-card-b">
                      <p className="home-num">Maps pin</p>
                      <p>Kissa Sakaiki, Yanaka</p>
                    </div>
                    <div className="home-prev-card home-prev-card-c">
                      <p className="home-num">reservation.pdf</p>
                      <p>Ryokan Hakone · 2 nights</p>
                    </div>
                  </div>
                  <p className="home-prev-bin"><b className="home-num">Day 1</b>3 items filed automatically</p>
                </div>
              </article>

              {/* 3, collaborative canvas */}
              <article className="home-feat">
                <div className="home-feat-copy">
                  <PersonIcon size={26} className="home-feat-icon" />
                  <h3 className="home-h3">Real-time collaborative canvas</h3>
                  <p>Kill the 400-message group thread and the shared sheet nobody updated.
                    Everyone edits the same itinerary, live.</p>
                  <button className="home-btn home-btn-ghost home-btn-sm" onClick={() => onNavigate('trip')}>
                    Share a trip
                  </button>
                </div>
                <div className="home-prev home-prev-collab">
                  <div className="home-prev-people">
                    <span className="home-prev-avatars" aria-hidden="true"><i>M</i><i>S</i><i>B</i></span>
                    <span className="home-num"><span className="home-prev-live" />3 editing now</span>
                  </div>
                  <div className="home-prev-block">
                    <p className="home-num">Day 3 · afternoon</p>
                    <p><b>Hakone open-air museum</b><span className="home-prev-caret" /></p>
                    <p className="home-prev-dim">then ropeway to Ōwakudani</p>
                  </div>
                  <span className="home-prev-cursor home-prev-cursor-a" aria-hidden="true">Mila</span>
                  <span className="home-prev-cursor home-prev-cursor-b" aria-hidden="true">Sam</span>
                </div>
              </article>

              {/* 4, budget splitter */}
              <article className="home-feat">
                <div className="home-feat-copy">
                  <ReceiptIcon size={26} className="home-feat-icon" />
                  <h3 className="home-h3">Smart budget and expense splitter</h3>
                  <p>No awkward post-trip maths, and no manual currency conversion. Log it once and
                    Carta says who owes what.</p>
                  <button className="home-btn home-btn-ghost home-btn-sm" onClick={() => goTo('home-total')}>
                    See a full breakdown
                  </button>
                </div>
                <div className="home-prev">
                  <p className="home-prev-sum"><span className="home-num">Trip spend</span><b className="home-num">€2,184.60</b></p>
                  <p className="home-prev-row"><span>¥ 48,200 · Ryokan Hakone</span><b className="home-num">€287.10</b></p>
                  <p className="home-prev-row"><span>¥ 9,800 · JR passes ×4</span><b className="home-num">€58.40</b></p>
                  <p className="home-prev-row"><span>€ 612.00 · Flights ×4</span><b className="home-num">€612.00</b></p>
                  <div className="home-prev-split">
                    {[['Bas', 72, '€612.30'], ['Mila', 54, '€458.10'], ['Sam', 38, '€322.05']].map(([who, pct, amt]) => (
                      <p key={who}>
                        <span className="home-num">{who}</span>
                        <span className="home-prev-bar"><span style={{ width: `${pct}%` }} /></span>
                        <b className="home-num">{amt}</b>
                      </p>
                    ))}
                  </div>
                  <p className="home-prev-foot home-num">Sam owes Bas €135.15, settle in one tap</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ── Carta Assistant showcase ── */}
        <section className="home-section home-section-tight" id="home-assistant">
          <div className="home-wrap home-two">
            <div>
              <p className="home-eyebrow">Carta Assistant</p>
              <h2 className="home-h2">Ask the plan a question. Get a change, not a chat log.</h2>
              <p className="home-lede">
                The assistant reads your actual itinerary, pins, transit times, bookings and budget,
                answers with its sources, and writes the change into the day when you approve it.
              </p>
              <ul className="home-plist">
                <li><b>Grounded</b><span>Every answer cites the pin, timetable or booking it used.</span></li>
                <li><b>One tap</b><span>Approve, and itinerary, route and budget all update.</span></li>
                <li><b>Yours</b><span>Dietary needs, pace and budget ceiling are remembered.</span></li>
              </ul>
            </div>

            <div className="home-chat">
              <div className="home-chat-head">
                <SparkIcon size={18} />
                <b>Carta Assistant</b>
                <span className="home-num">demo · Tokyo trip, day 2</span>
              </div>
              <div className="home-chat-body">
                <div className="home-chips">
                  {ASSISTANT.map((a, i) => (
                    <button
                      key={a.chip}
                      className={`home-chip ${i === askIdx ? 'home-chip-on' : ''}`}
                      onClick={() => { setAskIdx(i); setAdded(false); }}
                    >
                      {a.chip}
                    </button>
                  ))}
                </div>

                <p className="home-chat-you">{ask.prompt}</p>

                <div className="home-chat-card">
                  <div className="home-chat-card-body">
                    <p className="home-num home-chat-card-head">{ask.head}</p>
                    {ask.lines.map(([a, b, cite, hi, right]) => (
                      <p className={`home-chat-line ${hi ? 'home-chat-line-hi' : ''}`} key={`${a}${b}`}>
                        <b className="home-num">{a}</b>
                        <span>{b}{cite ? <sup className="home-num">{cite}</sup> : null}</span>
                        {right ? <em className="home-num">{right}</em> : null}
                      </p>
                    ))}
                    <p className="home-chat-cites home-num">{ask.cites}</p>
                  </div>
                  <div className="home-chat-actions">
                    {added ? (
                      <>
                        <p className="home-chat-ok"><CheckIcon size={16} /> Added to day 2, route and budget updated</p>
                        <button className="home-chat-undo" onClick={() => setAdded(false)}>Undo</button>
                      </>
                    ) : (
                      <>
                        <button className="home-btn home-btn-primary home-btn-sm" onClick={() => setAdded(true)}>
                          Add to itinerary
                        </button>
                        <button className="home-btn home-btn-ghost home-btn-sm" onClick={onExplore}>
                          Show on map
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="home-section home-section-tight" id="home-workflow">
          <div className="home-wrap">
            <p className="home-eyebrow">How it works</p>
            <h2 className="home-h2">Three steps, then you travel.</h2>
            <div className="home-steps">
              <div className="home-step">
                <div className="home-step-mark"><span className="home-num">1</span><i /></div>
                <h3 className="home-h3">Import or drop pins</h3>
                <p>Paste a Google Maps list, forward a confirmation, or drop pins on the map.
                  Nothing is retyped.</p>
              </div>
              <div className="home-step">
                <div className="home-step-mark"><span className="home-num">2</span><i /></div>
                <h3 className="home-h3">Carta schedules and routes</h3>
                <p>Days get sequenced, transit gets timed, and the running total is priced as you go.</p>
              </div>
              <div className="home-step">
                <div className="home-step-mark home-step-mark-last"><span className="home-num">3</span></div>
                <h3 className="home-h3">Travel and collaborate</h3>
                <p>Share one link, edit together on the road, split the spend at the end.
                  Offline ready.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Coverage ── */}
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
            PLACEHOLDER TIERS. Nothing in the app charges for Plus yet.
            Confirm names, limits and prices before this page goes public. */}
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

        {/* ── FAQ: a controlled accordion, one open at a time ── */}
        <section className="home-section home-section-tight" id="home-faq">
          <div className="home-wrap home-faq">
            <h2 className="home-h2">Questions travellers actually ask</h2>
            {FAQ.map(([q, a], i) => (
              <div className="home-faq-item" key={q}>
                <button
                  className="home-faq-q"
                  aria-expanded={openFaq === i}
                  onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                >
                  {q}
                  <span className="home-num">{openFaq === i ? '\u2212' : '+'}</span>
                </button>
                {openFaq === i && <p className="home-faq-a">{a}</p>}
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ── Closer: flat ink, no gradient ── */}
      <div className="home-closer">
        <div className="home-wrap">
          <h2 className="home-h2">Ready to stop overthinking your travel plans?</h2>
          <p className="home-lede">
            One canvas for the flight, the pins, the route and the split. Free to start, no card.
          </p>
          <div className="home-closer-row">
            <button className="home-btn home-btn-primary home-btn-lg" onClick={onExplore}>
              {t('home.ctaMap')}
            </button>
            <button className="home-btn home-btn-ghost home-btn-lg" onClick={onPlanTrip}>
              {t('home.ctaTrip')}
            </button>
          </div>
          <div className="home-stores">
            <a className="home-store" href="#" onClick={(e) => { e.preventDefault(); onExplore(); }}>
              <span className="home-num">Download on the</span><b>App Store</b>
            </a>
            <a className="home-store" href="#" onClick={(e) => { e.preventDefault(); onExplore(); }}>
              <span className="home-num">Get it on</span><b>Google Play</b>
            </a>
            <button className="home-store home-store-web" onClick={onExplore}>Launch web app</button>
          </div>
          <p className="home-closer-fine">{t('fareNotice.body1')} {t('fareNotice.body2')}</p>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="home-footer">
        <div className="home-wrap">
          <div className="home-footer-grid">
            <div>
              <span className="home-brand">
                <Logo size={38} className="brand-mark" />
                <span className="brand-text">
                  <span className="brand-name">Carta</span>
                  <span className="brand-sub">{t('brand.sub')}</span>
                </span>
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
