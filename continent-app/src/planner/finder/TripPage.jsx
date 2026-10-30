import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, IconButton } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import {
  AlertIcon, ArrowLeftIcon, ArrowRightIcon, BeachIcon, BikeIcon, BootIcon, BusIcon, CalendarIcon, CheckIcon, ChevronRightIcon,
  CityIcon, ClockIcon, DiamondIcon, DiningIcon, FriendsIcon, HeartIcon, LakeIcon, LotusIcon, MapPinIcon, MoonIcon, MuseumIcon,
  MusicIcon, PalmIcon, PlaneIcon, SnowIcon, SparkIcon, SunIcon, SwimIcon,
} from '../../components/Icons.jsx';
import { prefersReducedMotion } from '../../lib/motion.js';
import { fetchDestPoiMap } from '../../lib/appData.js';
import { creditFor, creditLine } from '../../lib/imageCredit.js';
import { formatMoney } from '../../lib/money.js';
import { monthName } from '../../lib/dates.js';
import { cityLabel } from '../../lib/placeName.js';
import { CROWD_KEYS, crowdTier, dayHighs } from '../../lib/recommend/compare.js';
import { slotTotals } from '../../lib/recommend/slots.js';
import { useBcp47, useMonths, whenText } from '../flow/flowHooks.js';
import { useKeepTrip } from './finderHooks.js';
import { useTotalDelta } from '../planHooks.js';
import { LinePicker } from './LinePicker.jsx';
import { TripCard } from './TripCard.jsx';
import { whoFor } from './whoFor.js';
import {
  factText, groupHead, likeLabel, matchBars, pickLine, signedMoney, thereMinutes, topSights, totalLeavesOut, tripName, tripPhotos, withSlot,
} from './finderText.js';

// The route map rides in the map's own chunk (TripsMap.jsx), so maplibre
// arrives only with a map and no chunk is added.
const RouteMap = lazy(() => import('./TripsMap.jsx').then((m) => ({ default: m.RouteMap })));

/** The icon of each like (question 2's answers). */
const LIKE_ICON = {
  beach: BeachIcon, hiking: BootIcon, lakes: LakeIcon, culture: MuseumIcon, city: CityIcon, food: DiningIcon,
  nightlife: MusicIcon, hidden: DiamondIcon, cycling: BikeIcon, ski: SnowIcon, wellness: LotusIcon, islands: PalmIcon,
};

/** The four cost groups (DESIGN.md "Cost groups") of a finder trip's price lines. */
const GROUP_OF = { flight: 'travel', local: 'around', stay: 'stay', food: 'food' };
const GROUP_LABEL = { travel: 'tp.tile.flights', around: 'tp.tile.around', stay: 'tp.tile.stay', food: 'tp.tile.food' };

/** The POI lists of the trip's places (public/poi shards, cached by appData). */
function usePlacePois(ids) {
  const key = ids.join('|');
  const [state, setState] = useState({ key: null, map: null });
  useEffect(() => {
    let alive = true;
    fetchDestPoiMap(key.split('|')).then((map) => { if (alive) setState({ key, map }); }).catch(() => { if (alive) setState({ key, map: {} }); });
    return () => { alive = false; };
  }, [key]);
  return state.key === key ? state.map : null;
}

/**
 * A photo's credit (T871, row T811-c): the author and the licence from the
 * Commons credits file (lib/imageCredit.js), else a link to the file page
 * that names them. The catalogue's own credit field holds a page title, so
 * it is never shown as the photographer.
 */
function useCredit(url) {
  const [state, setState] = useState({ url: null, credit: null });
  useEffect(() => {
    let live = true;
    if (!url) return undefined;
    creditFor(url).then((c) => { if (live) setState({ url, credit: c }); }).catch(() => { if (live) setState({ url, credit: null }); });
    return () => { live = false; };
  }, [url]);
  return state.url === url ? state.credit : null;
}

function Credit({ url, t }) {
  const credit = useCredit(url);
  if (!credit?.page) return null;
  const who = creditLine(credit) || t('tf.tp.commons');
  return (
    <a className="tff-tp-credit" href={credit.page} target="_blank" rel="noopener noreferrer">
      {t('region.photoBy', { credit: who })}
    </a>
  );
}

/**
 * The gallery across the width: one photo a screen on a phone, a large one
 * and two beside it from 769 px, swiped or stepped; the place's name, the
 * position and the photo's credit on the caption line under it.
 */
function Gallery({ photos, name, t }) {
  const track = useRef(null);
  const [at, setAt] = useState(0);
  const step = () => {
    const el = track.current;
    const slide = el?.firstElementChild;
    return slide ? slide.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap || '0') : 0;
  };
  const go = (dir) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * step(), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };
  const onScroll = () => {
    const s = step();
    if (s) setAt(Math.min(photos.length - 1, Math.round(track.current.scrollLeft / s)));
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  };
  if (!photos.length) return null;
  const cur = photos[at] || photos[0];
  return (
    <div className="tff-gal tff-tp-gal">
      <div className="tff-gal-track" ref={track} onScroll={onScroll} onKeyDown={onKeyDown} tabIndex={0} role="region" aria-label={t('tf.pv.gallery', { name })}>
        {photos.map((p, i) => (
          <div className="tff-gal-slide" key={p.url}>
            <HeroImage url={p.url} city={p.city} iso2={p.iso2} className="tff-gal-img" maxWidth={1280} sizes="(max-width: 768px) 100vw, 640px" ratio={[3, 2]} eager={i === 0} />
          </div>
        ))}
      </div>
      {photos.length > 1 && (
        <>
          <IconButton tone="photo" className="tff-gal-prev" label={t('tf.pv.prev')} disabled={at === 0} onClick={() => go(-1)}>
            <ArrowLeftIcon size={18} />
          </IconButton>
          <IconButton tone="photo" className="tff-gal-next" label={t('tf.pv.next')} disabled={at >= photos.length - 1} onClick={() => go(1)}>
            <ArrowRightIcon size={18} />
          </IconButton>
        </>
      )}
      <p className="tff-gal-cap">
        <span className="tff-gal-name">{cur.caption}</span>
        <span className="tff-tp-cap-end">
          <Credit url={cur.url} t={t} />
          {photos.length > 1 && <span className="tff-gal-pos">{t('tf.pv.pos', { n: at + 1, total: photos.length })}</span>}
        </span>
      </p>
    </div>
  );
}

/** "5 h 40 min", "45 min", "6 h". */
function durationText(t, min) {
  if (!Number.isFinite(min) || min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return t('tf.tp.min', { m });
  return m ? t('tf.tp.hm', { h, m }) : t('tf.tp.h', { h });
}

/**
 * The fact band: door to door, the weather that month, the sea, the
 * crowds, getting around and the airport, as label-over-value rows with an
 * icon each. A fact the data does not hold is left out (carta-design,
 * detail page grammar), never "Not recorded".
 */
function FactBand({ trip, destinations, t, lang }) {
  const month = monthName(trip.month, lang);
  const facts = [];
  const door = durationText(t, thereMinutes(trip));
  if (door) facts.push({ key: 'door', Icon: ClockIcon, label: t('tf.tp.door'), value: door });
  const highs = dayHighs(trip, destinations);
  if (highs && month) facts.push({ key: 'weather', Icon: SunIcon, label: t('tf.tp.weather', { month }), value: t(highs.lo === highs.hi ? 'tf.cmp.high' : 'tf.cmp.highs', { lo: highs.lo, hi: highs.hi }) });
  // The sea that month (climate.water_c, NASA MUR SST) where the wire carries
  // it; read here rather than through lib/waterFacts.js, whose import split a
  // preloaded chunk (37 preloads).
  const sea = trip.places.map((p) => destinations?.[p.id]?.climate?.water_c?.[trip.month - 1]).find(Number.isFinite);
  if (Number.isFinite(sea) && month) facts.push({ key: 'sea', Icon: SwimIcon, label: t('tf.tp.sea', { month }), value: t('tf.cmp.high', { lo: Math.round(sea) }) });
  const crowd = crowdTier(trip, destinations);
  if (crowd != null && CROWD_KEYS[crowd] && month) facts.push({ key: 'crowds', Icon: FriendsIcon, label: t('tf.pv.crowds', { month }), value: t(CROWD_KEYS[crowd]) });
  const local = trip.slots.find((s) => s.id === 'local');
  if (local?.pick?.labelKey) facts.push({ key: 'around', Icon: BusIcon, label: t('tp.tile.around'), value: t(local.pick.labelKey) });
  const gw = trip.gateway;
  const airportCity = gw?.iata ? cityLabel(destinations?.[gw.iata]?.city || destinations?.[gw.placeId]?.city || '') : '';
  if (gw?.iata && trip.slots.find((s) => s.id === 'flight')?.pick?.id !== 'drive') {
    facts.push({ key: 'airport', Icon: PlaneIcon, label: t('tf.tp.airport'), value: airportCity ? t('tf.tp.airportVal', { city: airportCity, iata: gw.iata }) : gw.iata });
  }
  if (!facts.length) return null;
  return (
    <dl className="tff-tp-facts" aria-label={t('tf.tp.factsLabel')}>
      {facts.map(({ key, Icon, label, value }) => (
        <div key={key} className="tff-tp-fact" data-fact={key}>
          <dt><Icon size={16} />{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The price card: the total for the group, the cost bar in the four cost
 * colours with a dot before each group's name (the trip page v4's own
 * grammar), the four lines (a line with choices opens its picker), then
 * save and Plan this trip, the page's one primary. Sticky beside the page
 * from 1024 px.
 */
function PriceCard({ trip, t, lang, onLine, onPlan, keeper, name, ui, delta = null }) {
  const { NotYet } = ui;
  const airlines = ui.useAirlines();
  const airline = (code) => ui.airlineName(airlines, code);
  const head = groupHead(trip);
  const partial = totalLeavesOut(trip);
  const group = Number.isFinite(trip.total?.group) ? trip.total.group : trip.total?.perPerson;
  const lines = trip.slots.filter((s) => GROUP_OF[s.id]);
  const parts = lines.filter((s) => (s.eurGroup ?? 0) > 0);
  const sum = parts.reduce((n, s) => n + s.eurGroup, 0);
  const money = (eur) => formatMoney(eur, { precision: 'cents', locale: lang });
  const flight = trip.slots.find((s) => s.id === 'flight');
  const driving = flight?.pick?.id === 'drive';
  const codes = !driving && trip.origin && trip.gateway?.iata ? t('tf.tp.codes', { from: trip.origin, to: trip.gateway.iata }) : '';
  return (
    <section className="tff-tp-price" aria-labelledby="tff-tp-price-h">
      <h2 className="tff-tp-price-h" id="tff-tp-price-h">{t('tf.tp.price')}</h2>
      <p className="tff-tp-total">
        <span className="tff-tp-eur money">{Number.isFinite(group) ? money(group) : t('money.onRequest')}</span>
        <span className="tff-tp-unit">{t(`tf.card.${head === 1 ? 'forYou' : 'forN'}${partial ? 'Partial' : ''}`, { n: head })}</span>
        {/* What the last swap did to the total, for three seconds (useTotalDelta). */}
        {delta != null && Math.abs(delta) >= 1 && <span className="tff-delta" role="status">{signedMoney(delta, { locale: lang })}</span>}
      </p>
      {parts.length > 1 && sum > 0 && (
        <span className="tff-tp-costbar" aria-hidden="true">
          {parts.map((s) => <span key={s.id} className={`is-${GROUP_OF[s.id]}`} style={{ flexGrow: s.eurGroup / sum }} />)}
        </span>
      )}
      <ul className="tff-tp-lines">
        {lines.map((s) => {
          const g = GROUP_OF[s.id];
          const label = g === 'travel' && driving ? t('tp.tile.driving') : t(GROUP_LABEL[g]);
          const opens = s.eur != null && (s.options?.length || s.id === 'flight');
          const sub = s.id === 'flight' && codes ? [codes, s.eur != null ? pickLine(s, { t, airline }) : ''].filter(Boolean).join(', ') : (s.eur != null ? pickLine(s, { t, airline }) : '');
          const body = (
            <>
              <span className={`tff-tp-line-name is-${g}`}><span className="plan-total-dot" aria-hidden="true" />{label}</span>
              <span className="tff-tp-line-fig">{s.eurGroup == null ? <NotYet /> : <span className="money">{money(s.eurGroup)}</span>}</span>
              {sub && <span className="tff-tp-line-sub">{sub}</span>}
            </>
          );
          return (
            <li key={s.id} className={`tff-tp-line is-${g}`}>
              {opens ? (
                <Button variant="quiet" className="tff-tp-line-btn" iconEnd={<ChevronRightIcon size={16} />}
                  aria-label={t('tf.rc.openLine', { line: label, price: money(s.eurGroup ?? s.eur) })} onClick={() => onLine(s.id)}>
                  {body}
                </Button>
              ) : <div className="tff-tp-line-btn is-static">{body}</div>}
            </li>
          );
        })}
      </ul>
      <div className="tff-tp-acts">
        <IconButton
          tone="surface"
          className={`tff-pv-heart${keeper.isKept(trip.id) ? ' is-kept' : ''}`}
          pressed={keeper.isKept(trip.id)}
          label={t('tf.keep.one', { name })}
          onClick={() => keeper.toggle(trip)}
        >
          <HeartIcon size={18} />
        </IconButton>
        <Button variant="primary" className="tff-tp-plan" onClick={() => onPlan(trip)}>{t('tf.rc.plan')}</Button>
      </div>
    </section>
  );
}

/** Why it fits (a bar a like on the ink ramp, then the reasons) and the catch, side by side from 769 px. */
function FitAndCatch({ trip, t, lang }) {
  const against = (trip.match?.conflicts || []).filter((c) => ['busy', 'car', 'heat'].includes(c.key));
  const againstText = (c) => (c.key === 'heat'
    ? t('tf.why.heat', { month: monthName(c.month ?? trip.month, lang) })
    : factText({ key: `tf.catch.${c.key}`, facts: { place: c.place, month: c.month ?? trip.month } }, { t, lang }));
  const catches = [...new Set([...against.map(againstText), trip.catch ? factText(trip.catch, { t, lang }) : ''].filter(Boolean))];
  const reasons = trip.reasons.map((r) => factText(r, { t, lang })).filter(Boolean);
  const bars = matchBars(trip);
  if (!reasons.length && !catches.length && !bars.length) return null;
  return (
    <div className="tff-tp-two">
      {(reasons.length > 0 || bars.length > 0) && (
        <section className="tff-sec" aria-labelledby="tff-tp-fits">
          <h2 className="tff-tp-h" id="tff-tp-fits">{t('tf.pv.why')}</h2>
          {bars.length > 0 && (
            <ul className="tff-fit-bars">
              {bars.map((b) => {
                const Icon = LIKE_ICON[b.key] || SparkIcon;
                return (
                  <li key={b.key} className="tff-fit-bar">
                    <Icon size={18} />
                    <span className="tff-fit-label">{likeLabel(t, b.key)}</span>
                    <span className="tff-fit-track" aria-hidden="true"><span className="tff-fit-fill" style={{ transform: `scaleX(${b.pct / 100})` }} /></span>
                    <span className="tff-fit-pct">{t('tf.why.pct', { pct: b.pct })}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <ul className="tff-fit-lines">
            {reasons.map((x) => <li key={x}><CheckIcon size={14} /><span>{x}</span></li>)}
          </ul>
        </section>
      )}
      {catches.length > 0 && (
        <section className="tff-sec" aria-labelledby="tff-tp-catch">
          <h2 className="tff-tp-h" id="tff-tp-catch">{t('tf.tp.catch')}</h2>
          <ul className="tff-fit-lines">
            {catches.map((x) => <li key={x} className="is-catch"><AlertIcon size={14} /><span>{x}</span></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * The trip page (T870, T871; plan flow v3, owner 2026-10-29: "Full trip
 * page" Go). What a card on Trips for you opens, in place of the T811
 * preview dialog: a page with its own address (#tf=<trip id>, so Back
 * returns to the list), ordered the way people decide. The bar (back to the
 * trips), the gallery with credits, the head (name, country, when, nights,
 * bases, match), then two columns from 1024 px: who it is for (a template
 * over the facts, whoFor.js), the fact band, the route on a map with the
 * nights per base, what you would do, why it fits and the catch, and
 * alternatives; beside them the price card, sticky. On a phone the price
 * card follows the fact band, in the content.
 *
 *   trip, settings, destinations, ui, keepWith   as the card's
 *   others          the other trips in the list's order, for alternatives
 *   onBack()        back to the trips (history back)
 *   onPlan(trip)    "Plan this trip"
 *   onEdit(next)    the trip with a line swapped (a picker)
 *   onOpen(trip)    an alternative opened in its place
 */
export function TripPage({ trip, settings, destinations, ui, others = [], keepWith = null, onBack, onPlan, onEdit, onOpen }) {
  const { t, lang } = useI18n();
  const months = useMonths();
  const bcp47 = useBcp47();
  const titleRef = useRef(null);
  const rowFocus = useRef(null);
  const [line, setLine] = useState(null);
  const keeper = useKeepTrip({ destinations, lang, keepWith });
  // A swapped line moves the group total; another trip opened in place does not count as a change.
  const delta = useTotalDelta(trip.total?.group ?? null);
  const shownFor = useRef(trip.id);
  const sameTrip = shownFor.current === trip.id;
  useEffect(() => { shownFor.current = trip.id; }, [trip.id]);
  const name = tripName(trip, destinations, lang);
  const pct = trip.match?.pct;
  const bases = trip.places.length;
  const when = settings ? whenText(t, settings.when, months, bcp47) : null;
  const dates = settings?.when?.mode === 'exact' && when?.start ? (when.end ? t('tf.chip.dates', { start: when.start, end: when.end }) : when.start) : monthName(trip.month, lang);
  const placeIds = useMemo(() => trip.places.map((p) => p.id), [trip.places]);
  const pois = usePlacePois(placeIds);
  const who = useMemo(() => whoFor(trip, { settings, destinations, t, lang }), [trip, settings, destinations, t, lang]);
  const photos = useMemo(() => {
    const out = tripPhotos(trip, destinations).map((p) => ({ ...p, caption: cityLabel(p.city) }));
    const seen = new Set(out.map((p) => p.url));
    for (const id of placeIds) {
      const d = destinations?.[id];
      for (const s of topSights(pois?.[id], 2)) {
        if (seen.has(s.img)) continue;
        seen.add(s.img);
        out.push({ url: s.img, city: s.name, iso2: d?.iso2 || null, caption: `${s.name}, ${cityLabel(d?.city || '')}` });
      }
    }
    return out.slice(0, 8);
  }, [trip, destinations, pois, placeIds]);
  const alts = others.filter((x) => x.id !== trip.id).slice(0, 3);

  // Arriving on the page (or on another trip from Not quite right?) puts
  // the page at its top and focus on its heading.
  useEffect(() => {
    if (line) return;
    titleRef.current?.focus({ preventScroll: true });
  }, [trip.id, line]);
  const pageRef = useRef(null);
  useEffect(() => { pageRef.current?.scrollIntoView?.({ block: 'start', behavior: 'auto' }); }, [trip.id]);

  const openSlot = line ? trip.slots.find((s) => s.id === line) : null;
  const back = () => { rowFocus.current = line; setLine(null); };
  if (openSlot) {
    return (
      <div className="tff-tp is-picking">
        <LinePicker
          trip={trip}
          slot={openSlot}
          ui={ui}
          onBack={back}
          onApply={(next) => { onEdit(withSlot(trip, next, slotTotals)); back(); }}
        />
      </div>
    );
  }

  return (
    <article className="tff-tp" aria-labelledby="tff-tp-title" ref={pageRef}>
      <div className="tff-tp-bar">
        <Button variant="quiet" className="tff-tp-back" iconStart={<ArrowLeftIcon size={20} />} onClick={onBack}>
          {t('tf.tp.back')}
        </Button>
      </div>

      <Gallery photos={photos} name={name} t={t} />

      <header className="tff-tp-head">
        <h1 className="pf-title tff-tp-title" id="tff-tp-title" tabIndex={-1} ref={titleRef}>{name}</h1>
        <p className="tff-pv-meta">
          <span className="tff-meta-item">{trip.iso2 && <CountryFlag country={trip.iso2} size={13} />}{trip.country}</span>
          <span className="tff-meta-item"><CalendarIcon size={14} />{dates}</span>
          <span className="tff-meta-item"><MoonIcon size={14} />{t('tf.keep.nights', { n: trip.nights })}</span>
          <span className="tff-meta-item"><MapPinIcon size={14} />{t(bases === 1 ? 'tf.card.base1' : 'tf.card.bases', { n: bases })}</span>
          {pct != null && <span className="tff-pv-match">{t('tf.card.match', { pct })}</span>}
        </p>
      </header>

      <div className="tff-tp-grid">
        <div className="tff-tp-lead">
          {who && (
            <section className="tff-tp-who" aria-labelledby="tff-tp-who">
              <h2 className="tff-tp-h" id="tff-tp-who">{t('tf.tp.whoTitle')}</h2>
              <p className="tff-tp-prose">{who}</p>
            </section>
          )}
          <FactBand trip={trip} destinations={destinations} t={t} lang={lang} />
        </div>

        <aside className="tff-tp-side">
          <PriceCard trip={trip} t={t} lang={lang} ui={ui} name={name} keeper={keeper} onPlan={onPlan} onLine={setLine} delta={sameTrip ? delta : null} />
        </aside>

        <div className="tff-tp-main">
          <section className="tff-sec" aria-labelledby="tff-tp-route">
            <h2 className="tff-tp-h" id="tff-tp-route">{t('tf.pv.route')}</h2>
            <Suspense fallback={<div className="tff-tp-map is-loading" aria-busy="true" />}>
              <RouteMap trip={trip} destinations={destinations} label={t('tf.tp.mapLabel')} />
            </Suspense>
            <ol className="tff-route">
              {trip.places.map((p, i) => {
                const d = destinations?.[p.id];
                return (
                  <li key={p.id} className="tff-route-stop">
                    <span className="tff-tp-stop-n" aria-hidden="true">{i + 1}</span>
                    <span className="tff-route-name">{cityLabel(d?.city || '')}</span>
                    <span className="tff-route-n"><MoonIcon size={14} />{t('tf.keep.nights', { n: p.nights })}</span>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="tff-sec" aria-labelledby="tff-tp-do">
            <h2 className="tff-tp-h" id="tff-tp-do">{t('tf.tp.doTitle')}</h2>
            {trip.places.map((p) => {
              const d = destinations?.[p.id];
              const sights = pois ? topSights(pois[p.id], 6) : null;
              return (
                <div key={p.id} className="tff-see">
                  {trip.places.length > 1 && <h3 className="tff-see-place">{cityLabel(d?.city || '')}</h3>}
                  {sights == null ? (
                    <div className="tff-see-row is-loading" aria-busy="true"><span className="sr-only">{t('tf.pv.loading')}</span></div>
                  ) : sights.length ? (
                    <ul className="tff-see-row">
                      {sights.map((s) => (
                        <li key={s.name} className="tff-sight">
                          <HeroImage url={s.img} city={s.name} iso2={d?.iso2} className="tff-sight-img" maxWidth={320} sizes="200px" ratio={[4, 3]} />
                          <span className="tff-sight-name">{s.name}</span>
                          {s.desc && <span className="tff-sight-desc">{s.desc}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : <ui.NotYet line />}
                </div>
              );
            })}
          </section>

          <FitAndCatch trip={trip} t={t} lang={lang} />

          {alts.length > 0 && (
            <section className="tff-sec" aria-labelledby="tff-tp-alts">
              <h2 className="tff-tp-h" id="tff-tp-alts">{t('tf.tp.alts')}</h2>
              <ol className="tff-list tff-tp-alts">
                {alts.map((x) => (
                  <li key={x.id}>
                    <TripCard
                      trip={x}
                      destinations={destinations}
                      onOpen={onOpen}
                      ui={ui}
                      keep={{ kept: keeper.isKept(x.id), onKeep: keeper.toggle }}
                    />
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}
