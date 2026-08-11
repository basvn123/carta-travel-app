import React, { useEffect, useMemo, useRef, useState } from 'react';
import Logo from './Logo.jsx';
import { OriginPicker } from './OriginPicker.jsx';
import { DateField } from './DateField.jsx';
import { Dropdown } from './Dropdown.jsx';
import { NumberField } from './FilterControls.jsx';
import { PrivacyPolicy } from './PrivacyPolicy.jsx';
import { RatingBadge } from './RatingBadge.jsx';
import { HomeDeck } from './HomeDeck.jsx';
import { CalendarIcon, ChevronRightIcon, MapPinIcon, RouteIcon, ListDayIcon, SearchIcon } from './Icons.jsx';
import { composeTrip, tripDaysBetween } from '../lib/runtime_pricing.js';
import { TIERS, TIER_ORDER, formatPrice, yearPassTripsEquivalent } from '../lib/pricing.js';
import { addDays, fmtDate, todayISO } from '../lib/dates.js';
import { count, eur, eurExact } from '../lib/format.js';
import { fareProv, estPrefix, FareTag, FromWord } from './FareProvenance.jsx';
import { ATTRIBUTIONS } from '../data/attribution.js';
import { useI18n, LANGUAGES } from '../i18n/index.jsx';

const CONTACT = 'bas.vannieuwenhuyse123@gmail.com';
const EMPTY_META = {};

/* Accent folding for the city search, so "krakow" finds Kraków. The combining
   marks cover most of Europe; ł is the one frequent letter NFD leaves alone. */
const fold = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/ł/g, 'l');
const FIND_LIMIT = 6;

/* The budget line in the proof ribbon. A fixed "under €300" reads as empty on
   an expensive week and as trivial on a cheap one, so the line is derived:
   round the cheapest trip up to a tidy figure, then step until it covers a
   decent slice of the continent. */
const BUDGET_MIN_HITS = 12;
const BUDGET_STEPS = 10;

/* Which OpenTripMap kinds are worth putting in the day preview. The raw
   activity list also carries hotels and shops matched by proximity, and a
   front page that offers "Condo Gardens Brussels" as a sight is a front page
   nobody trusts with a whole trip. */
const SIGHT_KINDS = new Set([
  'Square', 'Museum', 'Cathedral', 'Castle', 'Palace', 'Park', 'Garden',
  'Bridge', 'Tower', 'Monument', 'Gallery', 'Church', 'Basilica', 'Fortress',
  'Old town', 'Viewpoint', 'Beach', 'Abbey', 'Theatre',
]);

/* A one-shot "has this scrolled into view" flag. The watched element must be
   fully visible by default: the flag only ADDS a keyframe class, so a browser
   without IntersectionObserver, a screenshot harness, or a reduced-motion
   reader simply sees the finished layout. */
function useSeenOnce(threshold) {
  const [seen, setSeen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') return undefined;
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true);
        obs.disconnect();
      }
    }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, seen];
}

/**
 * The Carta homepage.
 *
 * It is a TAB, not an overlay: it renders inside the app shell underneath the
 * real .app-header, so Home wears the same hat as the map and the two
 * planners and switching between them changes nothing but the body. That is
 * also why there is no "open the app" button anywhere on it. The app opens
 * here, and every call to action moves the visitor to a tab.
 *
 * The argument the page makes is budget travel in Europe: what a week
 * actually costs from your airport, and which places fit the money you have.
 * Four things on it are live rather than marketing copy, which is the point:
 *   - the status line counts what is priced right now,
 *   - the search strip edits real app state, so every CTA hands off to an
 *     already-priced map,
 *   - the ribbon states today's cheapest trip and how many destinations come
 *     in under a real budget line,
 *   - the receipt, the price split and the sight list are a genuine
 *     composeTrip() breakdown of today's cheapest flyable destination.
 */
export function HomePage({
  data, choices, setChoices, onChangeOrigin,
  departDate, setDepartDate, returnDate, setReturnDate, dateBounds,
  pricedAll, totalCount, countryCount,
  onOpenAccount, onExplore, onPlanTrip, onNavigate, onOpenPass,
}) {
  const { t, lang } = useI18n();
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  /* The city search above the receipt: type any place and the receipt prices
     that whole trip instead of today's cheapest find. */
  const [destQuery, setDestQuery] = useState('');
  const [pickedId, setPickedId] = useState(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findHi, setFindHi] = useState(0);
  const priceLocale = (LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0]).bcp47;

  /* The page's two deliberate animation moments, both one-shot and additive:
     the steps band draws its route as it first scrolls into view, and the
     pass cards rise when the pricing section does. */
  const [plansRef, plansSeen] = useSeenOnce(0.15);
  const [stepsRef, stepsSeen] = useSeenOnce(0.3);

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
  const totalLabel = count(totalCount);

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

  /* Flight prices only, cheapest first. The engine quietly prices a flightless
     place as a drive, and a page whose headline promises fares should not
     advertise a €327 tank of fuel to Albania as its cheapest find. */
  const flyable = useMemo(
    () => (pricedAll || []).filter((p) => p.mode === 'plane' && p.planeOk),
    [pricedAll],
  );

  const pricedById = useMemo(() => {
    const m = new Map();
    for (const p of pricedAll || []) m.set(p.id, p);
    return m;
  }, [pricedAll]);

  /* One searchable row per place name. Multi-airport cities repeat the same
     name on every gateway; keep the gateway the pricing pass kept, so the
     suggestion's price matches the receipt it produces. */
  const catalogue = useMemo(() => {
    if (!data?.destinations) return [];
    const byName = new Map();
    for (const [id, d] of Object.entries(data.destinations)) {
      if (!d?.city) continue;
      const key = fold(`${d.city}|${d.country || ''}`);
      const have = byName.get(key);
      const priced = pricedById.has(id);
      if (!have || (priced && !have.priced)) {
        byName.set(key, {
          id,
          city: d.city,
          country: d.country || '',
          priced,
          f: fold(d.city),
          s: fold(`${d.city} ${d.country || ''}`),
        });
      }
    }
    return [...byName.values()];
  }, [data, pricedById]);

  const destMatches = useMemo(() => {
    const q = fold(destQuery.trim());
    if (q.length < 2) return [];
    const hits = [];
    for (const c of catalogue) {
      const rank = c.f.startsWith(q) ? 0 : c.f.includes(q) ? 1 : c.s.includes(q) ? 2 : -1;
      if (rank < 0) continue;
      hits.push({ ...c, pp: pricedById.get(c.id)?.pp ?? null, rank });
    }
    hits.sort((a, b) => a.rank - b.rank
      || (a.pp == null) - (b.pp == null)
      || (a.pp ?? 0) - (b.pp ?? 0)
      || a.city.localeCompare(b.city));
    return hits.slice(0, FIND_LIMIT);
  }, [catalogue, destQuery, pricedById]);

  const pickDest = (m) => {
    setPickedId(m.id);
    setDestQuery(`${m.city}, ${m.country}`);
    setFindOpen(false);
    setFindHi(0);
  };
  const clearPick = () => {
    setPickedId(null);
    setDestQuery('');
    setFindOpen(false);
    setFindHi(0);
  };
  const onFindKey = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!findOpen || !destMatches.length) return;
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setFindHi((h) => (h + d + destMatches.length) % destMatches.length);
    } else if (e.key === 'Enter') {
      if (findOpen && destMatches.length) {
        e.preventDefault();
        pickDest(destMatches[Math.min(findHi, destMatches.length - 1)]);
      }
    } else if (e.key === 'Escape') {
      setFindOpen(false);
    }
  };

  /* ── The proof ribbon ──────────────────────────────────────────────────
     Three measured facts, no testimonials: what the cheapest week costs per
     person today, how much of Europe sits under a real budget line, and when
     the fares behind both were last checked. */
  const proof = useMemo(() => {
    if (!pricedCount || nights <= 0) return null;
    const cheapest = flyable[0] || pricedAll[0];
    if (!cheapest) return null;
    const step = cheapest.pp < 200 ? 25 : cheapest.pp < 500 ? 50 : 100;
    let line = Math.ceil(cheapest.pp / step) * step;
    let under = 0;
    for (let i = 0; i < BUDGET_STEPS; i += 1) {
      under = flyable.reduce((n, p) => (p.pp <= line ? n + 1 : n), 0);
      if (under >= BUDGET_MIN_HITS) break;
      line += step;
    }
    /* Say nothing rather than something weak. A line that had to walk up past
       twice the cheapest trip is not a budget any more, it is the ribbon
       filling its third slot: with one traveller in an entire place the
       stepper reached "12 destinations under €1,800 per person", which argues
       against the page rather than for it. Two cells is a fine ribbon. */
    if (under < 2 || line > cheapest.pp * 2) line = null;
    return {
      city: cheapest.city,
      pp: cheapest.pp,
      line,
      under,
    };
  }, [flyable, pricedAll, pricedCount, nights]);

  /* ── The receipt, the split and the day ────────────────────────────────
     All three come off the SAME destination, so the page cannot argue with
     itself: it once headlined a €568 drive while the receipt totalled a €898
     flight. That destination is the searched city when the visitor typed
     one, and today's cheapest flyable trip otherwise. Whatever mode the
     engine priced for it, the lines below say so. */
  const trip = useMemo(() => {
    if (!data || nights <= 0) return null;
    let pick = null;
    if (pickedId) {
      pick = pricedById.get(pickedId) || null;
      if (!pick) {
        /* The pricing pass skipped this place, but compose anyway: the answer
           to "what does it cost" should be an honest no-price line for THAT
           city, not a silent fall-back to somewhere else. */
        const d = data.destinations[pickedId];
        if (d) {
          pick = {
            id: pickedId, city: d.city, country: d.country, iata: d.iata || d.anchor_airport,
          };
        }
      }
    }
    if (!pick) pick = flyable[0] || pricedAll?.[0] || null;
    if (!pick) return null;
    const dest = data.destinations[pick.id];
    const priced = dest && composeTrip(dest, departDate, returnDate, choices, data.destinations);
    if (!priced) {
      return pickedId
        ? { unpriced: true, city: pick.city, country: pick.country }
        : null;
    }

    /* The lines must add up to the total, exactly. composeTrip prices two
       different journeys and only one of them is the answer: the plane total
       is flights + bags + transfer + rental + stay, the car total is fuel and
       tolls + stay, and it carries the OTHER option's figures alongside.
       Listing them all put a €100 bag and a €140 rental on a receipt whose
       total contained neither. Follow transport_mode, and nothing else. */
    const lines = [];
    const push = (label, amount, prov) => {
      if (Number.isFinite(amount) && amount > 0) lines.push({ label, amount, prov });
    };
    let travel = 0;
    if (priced.transport_mode === 'plane') {
      const out = priced.fare_out_eur * groupSize;
      const back = priced.fare_in_eur * groupSize;
      // Provenance of the priced fares (contract A fields when the pipeline
      // ships them): the flight lines carry the age chip / estimate tilde.
      const prov = fareProv(priced);
      push(t('home.rFlightOut', { date: fmtDate(departDate) }), out, prov);
      push(t('home.rFlightBack', { date: fmtDate(returnDate) }), back, prov);
      push(t('home.rBag', { bag: bagLabel }), priced.baggage_total);
      push(t('home.rTransfer', { city: priced.anchor_airport || pick.iata || pick.city }), priced.transfer_total);
      push(t('home.rRental', { n: nights }), priced.rental_total);
      travel = (out || 0) + (back || 0) + (priced.baggage_total || 0)
        + (priced.transfer_total || 0) + (priced.rental_total || 0);
    } else if (priced.driving) {
      push(t('home.rDrive'), priced.driving.total);
      travel = priced.driving.total || 0;
    }
    push(t('home.rStay', { n: nights, city: pick.city }), priced.accom_total);
    push(t('home.rFood', { n: nights }), priced.ground_total);

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
      if (shift.total < priced.grand_total - 0.005) shiftLine = t('home.rShiftDown', vars);
      else if (shift.total > priced.grand_total + 0.005) shiftLine = t('home.rShiftUp', vars);
      else shiftLine = t('home.rShiftSame', { date: vars.date });
    }

    /* Where the money goes, in three bars. The same figures as the receipt
       above, grouped the way a traveller decides (getting there, sleeping,
       living) and divided by the party, so every number in that card is per
       person and the three of them add up to the line under them. A card
       that mixed party totals with a per-person footer read as an error. */
    const total = priced.grand_total;
    const split = [
      { key: 'travel', label: t('home.splitTravel'), amount: travel },
      { key: 'stay', label: t('home.splitStay'), amount: priced.accom_total || 0 },
      { key: 'living', label: t('home.splitLiving'), amount: priced.ground_total || 0 },
    ].filter((s) => s.amount > 0)
      .map((s) => ({
        ...s,
        amount: s.amount / groupSize,
        pct: total > 0 ? Math.round((s.amount / total) * 100) : 0,
      }));

    /* Real sights in that city, from the activity data the day planner uses.
       Near-duplicates are dropped as well as exact ones: the raw list carries
       "Skopje Fortress" and "Skopje Fortress Gate" as separate rows, and a
       three-line day that spends two of them on the same castle is not a day
       anyone would follow. */
    const sights = [];
    const kept = [];
    for (const it of dest.activities?.items || []) {
      if (kept.length >= 3) break;
      if (!it?.name || !SIGHT_KINDS.has(it.kind) || it.name.length > 28) continue;
      const name = it.name.toLowerCase();
      if (kept.some((k) => k.includes(name) || name.includes(k))) continue;
      kept.push(name);
      sights.push(it);
    }

    return {
      city: pick.city,
      country: pick.country,
      route: `${priced.origin || choices.origin} to ${priced.anchor_airport || pick.iata || ''}`.trim(),
      rating: dest.rating || null,
      lines,
      total,
      perDay: total / nights,
      perPerson: total / groupSize,
      showPerPerson: groupSize > 1,
      shiftLine,
      split,
      sights,
    };
  }, [data, flyable, pricedAll, pricedById, pickedId, departDate, returnDate, dateBounds,
    choices, nights, groupSize, bagLabel, fareAge, t]);

  // The three cheapest flyable destinations, for the map card's mini list.
  const cheapThree = useMemo(() => flyable.slice(0, 3), [flyable]);

  const phases = [t('day.phaseMorning'), t('day.phaseAfternoon'), t('day.phaseEvening')];

  /* ── The three questions ────────────────────────────────────────────────
     How-it-works, framed the way a budget traveller actually thinks: what do
     I have, where does it reach, what happens when I am there. Each card
     ends in a live mono readout (the visitor's own search, today's count
     under the ribbon's budget line, the sights already queued for the
     receipt's city) and a link into the tab that answers the question. */
  const stepDates = departDate && returnDate
    ? t('home.dateRange', { a: fmtDate(departDate), b: fmtDate(returnDate) })
    : null;
  const steps = [
    {
      key: 'have',
      icon: <CalendarIcon size={16} />,
      title: t('home.step1Title'),
      body: t('home.step1Body'),
      live: t('home.step1Live', {
        line: [originCity, stepDates, t('home.rParty', { n: groupSize }), bagLabel || null]
          .filter(Boolean).join(', '),
      }),
      link: t('home.step1Link'),
      onLink: () => goTo('home-search'),
    },
    {
      key: 'where',
      icon: <MapPinIcon size={16} />,
      title: t('home.step2Title'),
      body: t('home.step2Body'),
      live: !proof ? null
        : proof.line != null
          ? t('home.step2Live', { n: count(proof.under), price: eur(proof.line), city: originCity })
          : t('home.step2LiveCheap', { city: proof.city, price: eur(proof.pp) }),
      link: t('home.mapCta'),
      onLink: onExplore,
    },
    {
      key: 'days',
      icon: <ListDayIcon size={16} />,
      title: t('home.step3Title'),
      body: t('home.step3Body'),
      live: trip?.sights?.length
        ? t('home.step3Live', { n: trip.sights.length, city: trip.city })
        : null,
      link: t('home.tripCta'),
      onLink: onPlanTrip,
    },
  ];

  const faq = [
    [t('home.faq1Q'), t('home.faq1A')],
    [t('home.faq2Q'), t('home.faq2A')],
    [t('home.faq3Q'), t('home.faq3A')],
    [t('home.faq4Q'), t('home.faq4A')],
    [t('home.faq5Q'), t('home.faq5A')],
  ];

  /* ── The deck ────────────────────────────────────────────────────────────
     One slide per tool. Each carries the same three things: what it does, a
     live card built from today's real prices, and the limit that card is
     subject to, in the product's own voice. The footnote under each card is
     the honest half of the argument, and it is deliberately in the same place
     every time rather than buried in a coverage section nobody reaches. */
  const deckCopy = {
    aria: t('home.deckAria'),
    hint: t('home.deckHint'),
    prev: t('home.deckPrev'),
    next: t('home.deckNext'),
  };

  const deckSlides = [
    {
      key: 'map',
      icon: <MapPinIcon size={15} />,
      tab: t('home.mapEyebrow'),
      note: t('home.mapNote'),
      title: t('home.mapTitle'),
      body: t('home.mapBody'),
      points: [
        [t('home.mapP1'), t('home.mapP1Body')],
        [t('home.mapP2'), t('home.mapP2Body')],
        [t('home.mapP3'), t('home.mapP3Body')],
      ],
      cta: t('home.mapCta'),
      onCta: onExplore,
      shot: { src: '/shots/map.webp', url: 'carta-europetravel.com/map', alt: t('home.shotMapAlt') },
      preview: (
        <div className="home-prev">
          {cheapThree.length ? (
            <>
              <p className="home-prev-cap home-num">
                {t('home.prevMapHead', { city: originCity, n: nights })}
              </p>
              {cheapThree.map((p) => {
                const prov = fareProv(p.prov || p);
                return (
                  <p className="home-prev-row" key={p.id}>
                    <span>{p.city}, {p.country}</span>
                    <b className="home-num">
                      {!prov?.est && <FromWord />}
                      {`${estPrefix(prov)}${eur(p.pp)}`}
                    </b>
                  </p>
                );
              })}
              <p className="home-prev-foot home-num">
                {t('home.prevMapFoot', {
                  n: count(flyable.length), total: totalLabel, city: originCity,
                })}
              </p>
            </>
          ) : (
            <p className="home-prev-empty">{t('home.prevEmpty')}</p>
          )}
        </div>
      ),
    },
    {
      key: 'trip',
      icon: <RouteIcon size={15} />,
      tab: t('home.tripEyebrow'),
      note: t('home.tripNote'),
      title: t('home.tripTitle'),
      body: t('home.tripBody'),
      points: [
        [t('home.tripP1'), t('home.tripP1Body')],
        [t('home.tripP2'), t('home.tripP2Body')],
        [t('home.tripP3'), t('home.tripP3Body')],
      ],
      cta: t('home.tripCta'),
      onCta: onPlanTrip,
      shot: { src: '/shots/trip.webp', url: 'carta-europetravel.com/trip', alt: t('home.shotTripAlt') },
      preview: (
        <div className="home-prev">
          {trip?.split?.length ? (
            <>
              <p className="home-prev-cap home-num">
                {t('home.prevSplitHead', { city: trip.city })}
              </p>
              <div className="home-prev-split">
                {trip.split.map((s) => (
                  <p key={s.key}>
                    <span>{s.label}</span>
                    <span className="home-prev-bar">
                      <span style={{ width: `${s.pct}%` }} />
                    </span>
                    <b className="home-num">{eur(s.amount)}</b>
                  </p>
                ))}
              </div>
              <p className="home-prev-foot home-num">
                {t('home.prevSplitFoot', { price: eurExact(trip.perPerson) })}
              </p>
            </>
          ) : (
            <p className="home-prev-empty">{t('home.prevEmpty')}</p>
          )}
        </div>
      ),
    },
    {
      key: 'day',
      icon: <ListDayIcon size={15} />,
      tab: t('home.dayEyebrow'),
      note: t('home.dayNote'),
      title: t('home.dayTitle'),
      body: t('home.dayBody'),
      points: [
        [t('home.dayP1'), t('home.dayP1Body')],
        [t('home.dayP2'), t('home.dayP2Body')],
        [t('home.dayP3'), t('home.dayP3Body')],
      ],
      cta: t('home.dayCta'),
      onCta: () => onNavigate('day'),
      shot: { src: '/shots/day.webp', url: 'carta-europetravel.com/day', alt: t('home.shotDayAlt') },
      preview: (
        <div className="home-prev">
          {trip?.sights?.length ? (
            <>
              <p className="home-prev-cap home-num">
                {t('home.prevDayHead', { city: trip.city })}
              </p>
              {trip.sights.map((s, i) => (
                <p className="home-prev-stop" key={s.name}>
                  <span className="home-num">{phases[i]}</span>
                  <b>{s.name}</b>
                  <i>{s.kind}</i>
                </p>
              ))}
              <p className="home-prev-foot home-num">{t('home.prevDayFoot')}</p>
            </>
          ) : (
            <p className="home-prev-empty">{t('home.prevEmpty')}</p>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="home-page">
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
            <div className="home-search" id="home-search">
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
          </div>
        </section>

        {/* ── Proof ribbon: three measured facts, no testimonials ── */}
        <div className="home-ribbon">
          <div className="home-wrap home-ribbon-row">
            {proof ? (
              <>
                <span className="home-ribbon-cell">
                  <b className="home-num">{eur(proof.pp)}</b>
                  <span>{t('home.ribbonCheap', { city: proof.city, n: nights })}</span>
                </span>
                {proof.line != null && (
                  <span className="home-ribbon-cell">
                    <b className="home-num">{count(proof.under)}</b>
                    <span>{t('home.ribbonUnder', { price: eur(proof.line) })}</span>
                  </span>
                )}
                <span className="home-ribbon-cell">
                  <b className="home-num">{fareAge || t('home.freshUnknown')}</b>
                  <span>{t('home.ribbonFresh', { countries: countryCount })}</span>
                </span>
              </>
            ) : (
              <span className="home-ribbon-cell home-ribbon-pending">
                {t('home.ribbonPending', { total: totalLabel })}
              </span>
            )}
          </div>
        </div>

        {/* ── How it works: the three questions ──────────────────────────
            Numbered because the order is real: you cannot rank trips before
            the inputs exist, or plan days before a place is picked. The band
            hands off forward: step 1 edits the strip above, steps 2 and 3
            open the tabs the deck below demonstrates. */}
        <section className="home-section" id="home-workflow">
          <div className="home-wrap">
            <p className="home-eyebrow">{t('home.stepEyebrow')}</p>
            <h2 className="home-h2">{t('home.stepTitle')}</h2>
            <p className="home-lede">{t('home.stepLede')}</p>
            <div ref={stepsRef} className={`home-steps ${stepsSeen ? 'home-steps-live' : ''}`}>
              {steps.map((s, i) => (
                <article className="home-step" key={s.key}>
                  <div className="home-step-mark">
                    <span className="home-step-num home-num">{i + 1}</span>
                    <i className="home-step-route" aria-hidden="true" />
                    <span className="home-step-glyph">{s.icon}</span>
                  </div>
                  <h3 className="home-h3">{s.title}</h3>
                  <p className="home-step-body">{s.body}</p>
                  <div className="home-step-foot">
                    {s.live && <p className="home-step-live home-num">{s.live}</p>}
                    <button className="home-step-link" type="button" onClick={s.onLink}>
                      {s.link}
                      <ChevronRightIcon size={13} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── One honest total: the receipt ── */}
        <section className="home-section home-section-tight" id="home-total">
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

            <div className="home-r-col">
              {/* The whole-trip promise, made typable: search any of the
                  priced places and the receipt below reprices for it. */}
              <div className="home-find">
                <label className="home-find-label" htmlFor="home-find-input">
                  {t('home.findLabel')}
                </label>
                <div className="home-find-box">
                  <SearchIcon size={15} />
                  <input
                    id="home-find-input"
                    type="text"
                    role="combobox"
                    aria-expanded={findOpen && destMatches.length > 0}
                    aria-controls="home-find-list"
                    aria-autocomplete="list"
                    aria-activedescendant={findOpen && destMatches.length
                      ? `home-find-opt-${findHi}` : undefined}
                    autoComplete="off"
                    spellCheck="false"
                    placeholder={t('home.findPh')}
                    value={destQuery}
                    onChange={(e) => { setDestQuery(e.target.value); setFindOpen(true); setFindHi(0); }}
                    onKeyDown={onFindKey}
                    onBlur={() => setFindOpen(false)}
                  />
                  {pickedId && (
                    <button
                      type="button"
                      className="home-find-clear"
                      aria-label={t('home.findClear')}
                      title={t('home.findClear')}
                      onClick={clearPick}
                    >
                      ×
                    </button>
                  )}
                </div>
                {findOpen && destQuery.trim().length >= 2 && (
                  <ul className="home-find-list" id="home-find-list" role="listbox">
                    {destMatches.length ? destMatches.map((m, i) => (
                      <li key={m.id} id={`home-find-opt-${i}`} role="option" aria-selected={i === findHi}>
                        <button
                          type="button"
                          tabIndex={-1}
                          className={i === findHi ? 'is-hi' : ''}
                          onMouseDown={(e) => { e.preventDefault(); pickDest(m); }}
                          onMouseEnter={() => setFindHi(i)}
                        >
                          <span>{m.city}, {m.country}</span>
                          {m.pp != null
                            ? (() => {
                              const prov = fareProv(pricedById.get(m.id)?.prov || pricedById.get(m.id));
                              return (
                                <b className="home-num">
                                  {!prov?.est && <FromWord />}
                                  {`${estPrefix(prov)}${eur(m.pp)}`}
                                </b>
                              );
                            })()
                            : <i>{t('home.findNoFare')}</i>}
                        </button>
                      </li>
                    )) : (
                      <li className="home-find-none">
                        {t('home.findNone', { q: destQuery.trim(), total: totalLabel })}
                      </li>
                    )}
                  </ul>
                )}
              </div>

              {trip && !trip.unpriced ? (
                <div className="home-receipt">
                  <div className="home-r-head">
                    <div>
                      <p className="home-r-title">{trip.city}, {trip.country}</p>
                      <p className="home-r-sub">
                        {trip.route}, {t('home.rNights', { n: nights })}, {t('home.rParty', { n: groupSize })}
                      </p>
                    </div>
                    {/* The app's own badge, not a lookalike: same score chip,
                        same tier colour, same hidden-gem tag as the map. */}
                    <div className="home-r-rating">
                      <RatingBadge rating={trip.rating} size="md" showLabel />
                    </div>
                  </div>
                  <div className="home-r-body">
                    {trip.lines.map((l) => (
                      <p className="home-r-line" key={l.label}>
                        <span>{l.label}<FareTag prov={l.prov} /></span>
                        <b>{`${estPrefix(l.prov)}${eurExact(l.amount)}`}</b>
                      </p>
                    ))}
                  </div>
                  <div className="home-r-total">
                    <div>
                      <p className="home-r-total-label">{t('home.rWholeTrip')}</p>
                      <p className="home-r-total-sub">
                        {t('home.rPerDay', { price: eurExact(trip.perDay) })}
                        {trip.showPerPerson
                          && `, ${t('home.rPerPerson', { price: eurExact(trip.perPerson) })}`}
                      </p>
                    </div>
                    <p className="home-r-big">{eurExact(trip.total)}</p>
                  </div>
                  <p className="home-r-foot">{trip.shiftLine}</p>
                </div>
              ) : (
                <div className="home-receipt">
                  <div className="home-r-head">
                    <p className="home-r-title">
                      {trip?.unpriced ? `${trip.city}, ${trip.country}` : t('home.rEmptyTitle')}
                    </p>
                  </div>
                  <div className="home-r-body">
                    <p className="home-r-line">
                      <span>
                        {trip?.unpriced
                          ? t('home.rUnpriced', { city: trip.city, origin: originCity })
                          : t('home.rEmptyBody', { city: originCity })}
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── The three tools, in one frame ──────────────────────────────
            Stacked, these were three screens of scrolling and three half-size
            screenshots. The deck gives them one section and one large frame,
            and each still carries a live micro-preview built from the same
            priced data as the map tab, so what the page shows is what the
            visitor gets. */}
        <section className="home-section home-section-tight home-deck" id="home-features">
          <div className="home-wrap">
            <p className="home-eyebrow">{t('home.deckEyebrow')}</p>
            <h2 className="home-h2">{t('home.deckTitle')}</h2>
            <p className="home-lede home-lede-wide">{t('home.deckBody')}</p>
            <HomeDeck slides={deckSlides} copy={deckCopy} />
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
            Rendered from the same TIERS table and the same pass.* strings as
            the in-app PassModal, so this page and the checkout can never
            quote different numbers. pricing.js is the client mirror of
            public.plan_tiers; the server enforces, this displays. */}
        <section className="home-section" id="home-pricing">
          <div className="home-wrap">
            <p className="home-eyebrow">{t('home.priceEyebrow')}</p>
            <h2 className="home-h2">
              {t('home.priceTitle', { price: formatPrice(TIERS.trip.priceCents, priceLocale) })}
            </h2>
            <p className="home-lede">{t('home.priceBody')}</p>
            <div ref={plansRef} className={`home-prices ${plansSeen ? 'home-prices-live' : ''}`}>
              {TIER_ORDER.map((id) => {
                const tier = TIERS[id];
                const paid = tier.priceCents > 0;
                return (
                  <div key={id} className={`home-plan ${tier.featured ? 'home-plan-hi' : ''}`}>
                    {tier.featured && <p className="home-badge">{t('pass.mostPopular')}</p>}
                    <p className="home-plan-name">{t(tier.labelKey)}</p>
                    <p className="home-plan-price">
                      {paid ? formatPrice(tier.priceCents, priceLocale) : '€0'}
                    </p>
                    <p className="home-plan-per">
                      {id === 'trip' ? t('pass.perTrip')
                        : id === 'year' ? t('pass.perYear')
                          : t('home.planFreePer')}
                    </p>
                    <p className="home-plan-blurb">{t(tier.blurbKey)}</p>
                    <ul>
                      {id === 'free' ? (
                        <>
                          <li>{t('home.planFree1', { total: totalLabel })}</li>
                          <li>{t('home.planFree2')}</li>
                          <li>{t('pass.featPlansFree', { n: tier.aiPlans })}</li>
                          <li>{t('pass.featSearchOff')}</li>
                        </>
                      ) : (
                        <>
                          <li>{t('home.planEverything')}</li>
                          <li>{t('pass.featPlansPaid', { n: tier.aiPlans })}</li>
                          <li>{t('pass.featSearchOn', { n: tier.grounded })}</li>
                          {id === 'year' && (
                            <li>{t('pass.featValue', { n: yearPassTripsEquivalent() })}</li>
                          )}
                          <li>{t('pass.featOneOff')}</li>
                        </>
                      )}
                    </ul>
                    {paid ? (
                      <button
                        className={`home-btn ${tier.featured ? 'home-btn-primary' : 'home-btn-ghost'} home-btn-wide`}
                        onClick={onOpenPass}
                      >
                        {t('pass.buy')}
                      </button>
                    ) : (
                      <button className="home-btn home-btn-ghost home-btn-wide" onClick={onExplore}>
                        {t('home.mapCta')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="home-price-fine">{t('pass.vatNote')} {t('pass.noSubNote')}</p>
          </div>
        </section>

        {/* ── FAQ: a controlled accordion, one open at a time ── */}
        <section className="home-section home-section-tight" id="home-faq">
          <div className="home-wrap home-faq">
            <h2 className="home-h2">{t('home.faqTitle')}</h2>
            {faq.map(([q, a], i) => (
              <div className="home-faq-item" key={q}>
                <button
                  className="home-faq-q"
                  aria-expanded={openFaq === i}
                  onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                >
                  {q}
                  <span className="home-num" aria-hidden="true">{openFaq === i ? '−' : '+'}</span>
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
                <li>
                  <button className="home-footer-link" onClick={onExplore}>{t('nav.map')}</button>
                </li>
                <li>
                  <button className="home-footer-link" onClick={onPlanTrip}>{t('nav.trip')}</button>
                </li>
                <li>
                  <button className="home-footer-link" onClick={() => onNavigate('day')}>
                    {t('nav.day')}
                  </button>
                </li>
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
          {/* Data credits. Every source whose license asks for a visible
              credit, from continent-app/src/data/attribution.js, which is
              derived from docs/tos/data_licenses.md. A hairline list rather
              than cards: it is a run of related facts, and the licenses ask
              for legibility, not for decoration. */}
          <section className="home-credits" aria-labelledby="home-credits-h">
            <h3 id="home-credits-h">{t('home.footData')}</h3>
            <p className="home-credits-lede">{t('home.footDataBody')}</p>
            <ul className="home-credits-list">
              {ATTRIBUTIONS.map((a) => (
                <li key={a.source}>{a.credit}</li>
              ))}
            </ul>
          </section>

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
