import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { CheckIcon, ListDayIcon, MapPinIcon, ScaleIcon } from '../../components/Icons.jsx';
import { SheetHead } from '../flow/PlanStage.jsx';
import { useBcp47, useMonths, whenText } from '../flow/flowHooks.js';
import { MAX_COMPARE } from '../../lib/recommend/compare.js';
import { answersOf } from './finderHooks.js';
import { readSkips, writeSkips } from '../../lib/recommend/keptStore.js';
import { TripCard } from './TripCard.jsx';
import { TripCompare } from './TripCompare.jsx';
import { SortMenu } from './SortMenu.jsx';
import { PAGE, QUICK_FILTERS, SORTS, answersLine, countryLabel, filterTrips, shortDuration, sortTrips, thereMinutes, totalLeavesOut, tripName } from './finderText.js';
import { themedRows, rowWhy } from '../../lib/recommend/rows.js';
import { crowdTier, dayHighs } from '../../lib/recommend/compare.js';
import { formatMoney } from '../../lib/money.js';
import { monthName } from '../../lib/dates.js';
import { diverseOrder } from '../../lib/recommend/diversify.js';
import { budgetSplit } from '../../lib/recommend/budgetCompass.js';
import { haversineKm } from '../../lib/nearby.js';
import { lessHint, lessOrder, likeThis, markOf } from '../../lib/recommend/moreLess.js';
import { useHoldApp } from '../flow/StyleBar.jsx';

/** The cheapest whole total in the list (the best-value pin), when two or more have one. */
// The planner's own words for a trip shape (questions.js g:shape).
const SHAPE_LABEL = { one: 'pf.o.shapeOne', towns: 'pf.o.shapeTowns', road: 'pf.o.shapeRoad', countries: 'pf.o.shapeCountries' };

const cheapestOf = (trips) => {
  const whole = sortTrips(trips, 'cheapest').filter((x) => !totalLeavesOut(x) && Number.isFinite(x.total?.group ?? x.total?.perPerson));
  return whole.length > 1 ? whole[0].id : null;
};

// maplibre arrives only when the traveller asks for the map (T868).
const TripsMap = lazy(() => import('./TripsMap.jsx'));

// From 1024 px the map stands beside the list (T880), as on Explore.
const WIDE = '(min-width: 1024px)';
function useWide() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(WIDE);
    if (!mq) return undefined;
    const on = (e) => setWide(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

// The Compare ticks for this visit (T802), per answer set: the same answers
// find the same trips with the same ids, so the ticks hold while the
// traveller reopens a question and comes back, and clear when an answer
// changes. Memory only, never stored. The sort and the view keep the same
// way (T868).
const TICKS = new Map();
const VIEW = new Map();
// G12 R4: More and Less like this, per answer set for this visit only.
const MORE_LESS = new Map();
const answersKey = (s) => JSON.stringify([answersOf(s).guide, s.when, s.party, s.priority, s.from, s.places]);

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// The motion tokens, read once and before a change: reading computed style
// right after the new order is committed forces a whole style pass (about
// 11 ms a tap at 4x CPU, T803 end check).
let TIMING = null;
const motionTiming = () => {
  if (!TIMING) {
    const css = getComputedStyle(document.documentElement);
    TIMING = { duration: parseFloat(css.getPropertyValue('--dur-2')) || 200, easing: css.getPropertyValue('--ease-out').trim() || 'ease-out' };
  }
  return TIMING;
};

/**
 * Cards move to their new place when a sort re-orders the list: the
 * positions before the change are taken on the tap, and after the new
 * order is laid out each card slides from where it was (transform only,
 * --dur-2, --ease-out). Under reduced motion they jump.
 */
function useReorderMotion(order, items) {
  const before = useRef(null);
  useLayoutEffect(() => {
    const was = before.current;
    before.current = null;
    if (!was || reducedMotion()) return;
    const timing = motionTiming();
    for (const [id, el] of items.current) {
      const from = was.get(id);
      if (!el.animate) continue;
      if (!from) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], timing);
        continue;
      }
      const to = el.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (!dx && !dy) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], timing);
    }
  }, [order]); // eslint-disable-line react-hooks/exhaustive-deps -- runs when the order changes
  return () => {
    motionTiming();
    before.current = new Map([...items.current].map(([id, el]) => [id, el.getBoundingClientRect()]));
  };
}

/**
 * The trips skipped for this answer set (T806): stored on the device, so a
 * skipped trip stays away when the same answers come back, and the list
 * says how many are hidden with a way to bring them back.
 */
function useSkips(settings) {
  const key = answersKey(settings);
  const [state, setState] = useState(() => ({ key, ids: readSkips(key) }));
  const ids = state.key === key ? state.ids : readSkips(key);
  const set = (next) => { writeSkips(key, next); setState({ key, ids: next }); };
  return [ids, set];
}

/** A value kept per answer set for this visit (the ticks, the sort, the view). */
function useVisit(store, settings, fallback) {
  const key = answersKey(settings);
  const [value, setState] = useState(() => (store.has(key) ? store.get(key) : fallback));
  const seen = useRef(key);
  useEffect(() => {
    if (seen.current === key) return;
    seen.current = key;
    setState(fallback);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- the fallback is a constant
  const set = (next) => {
    if (store === TICKS) store.clear();
    store.set(key, next);
    setState(next);
  };
  return [value, set];
}

/**
 * Trips for you, layout A (T798, rebuilt as the gallery in T868, owner's
 * marks 2026-10-29: "Results layout A, the gallery"; "Remove the levers").
 *
 * The head (T880): "21 trips for you", then every answer as a chip in one
 * row (the places named first, row T859-b), each reopening its question
 * (Continue there comes straight back, and the search runs again). Then
 * one toolbar: Sort as a menu (Best match, Cheapest, Quickest there,
 * Warmest, Quietest), Compare once two trips are ticked, the quick filters
 * (Direct, Within budget, Quiet, 25 or warmer, One base) and, from 1024 px,
 * Hide map. The trips as a photo gallery (T879): two across on a phone,
 * three from 600 px, the top pick a whole row; six at a time with "Show
 * more trips". From 1024 px the map stands beside the gallery (two across
 * there); on a phone a floating Map button above the nav switches views.
 * The Flight, Food and Bases levers are gone: the answers decide, and an
 * answer changed reruns the search instead of a second set of controls.
 *
 * Map: the same trips as price pins (TripsMap); a pin picks a trip and its
 * card shows beside the map (under it on a phone); the card opens it.
 *
 * Compare (T802): each card's small menu ticks it, up to four; from two
 * ticks Compare in the row opens the compare table (TripCompare).
 *
 *   trips          the ranked trips, with any swap the preview made
 *   markedId       the trip the traveller planned last (back from the planner)
 *   onOpen(trip, el)  open the trip; `el` gets focus back on close
 *   onReopen(id)   reopen one question
 *   refine         T1103: a node under the answers (the refine card after the short setup)
 *   onPlan(trip)   "Plan this trip" from the compare table (T801's hand-off)
 *   keeper         the heart (useKeepTrip), shared with the searching screen
 *   ui             the app parts TripFlow hands down (see FindingTrips)
 *
 * Keep and skip (T806): a heart on each card keeps the trip in My trips
 * (keptStore), Skip in its menu hides it for these answers; the hidden ones
 * are counted under the list with "Show them again".
 */
export function TripsForYou({ settings, trips: found, destinations, originName, home = null, markedId = null, onBack, onOpen, onReopen, onPlan, cardRefs, keeper, ui, headEnd = null, refine = null }) {
  const { t, lang } = useI18n();
  const [skips, setSkips] = useSkips(settings);
  const [sort, setSortState] = useVisit(VIEW, settings, { sort: 'match', map: false, side: true, quick: [] });
  const wide = useWide();
  // G12 L8: under a ceiling the trips over it leave the list; up to three
  // just over (within 10%) come back apart under "Just over".
  const capped = budgetSplit(found, settings.guide?.budget);
  const kept = skips.length ? capped.list.filter((x) => !skips.includes(x.id)) : capped.list;
  const nearBy = capped.near.filter((x) => !skips.includes(x.trip.id));
  const quick = sort.quick || [];
  const sorted = sortTrips(filterTrips(kept, quick, destinations), sort.sort, destinations);
  // G12 R1: in the engine's own order rank 1 stays the pure best and the next
  // five are picked to differ (country, shape, price band); the rest follow.
  const [ml, setMl] = useVisit(MORE_LESS, settings, { more: null, less: [], undo: null });
  // G12 R4: what was marked "Less like this" sinks softly (capped, never a filter).
  const trips = lessOrder(sort.sort === 'match' ? diverseOrder(sorted) : sorted, ml.less);
  const moreOf = ml.more ? found.find((x) => x.id === ml.more) || null : null;
  const likeRow = moreOf ? likeThis(moreOf, trips) : [];
  const hint = lessHint(ml.less);
  const app = useHoldApp();
  const hidden = capped.list.length - kept.length;
  const focusNext = useRef(null);
  const months = useMonths();
  const bcp47 = useBcp47();
  const titleRef = useRef(null);
  const markedAt = markedId ? trips.findIndex((x) => x.id === markedId) : -1;
  const [shown, setShown] = useState(() => Math.max(PAGE, markedAt + 1));
  const [ticks, setTicks] = useVisit(TICKS, settings, []);
  const [refused, setRefused] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [pickedId, setPickedId] = useState(null);
  // The trip under the pointer, shared by the gallery and the map (T883).
  const [hotId, setHotId] = useState(null);
  const items = useRef(new Map());
  const order = trips.slice(0, shown).map((x) => x.id).join();
  const snapshot = useReorderMotion(order, items);
  const when = whenText(t, settings.when, months, bcp47);
  const answers = answersLine(settings, { t, lang, originName, when, trip: found[0] || null, locale: lang });
  // A ticked trip that is no longer in the list is not compared.
  const ticked = ticks.map((id) => trips.find((x) => x.id === id)).filter(Boolean);
  const onMap = !wide && sort.map;
  const side = wide && sort.side !== false;
  const picked = (pickedId && trips.find((x) => x.id === pickedId)) || trips[0] || null;

  const setSort = (value) => {
    if (value === sort.sort) return;
    snapshot();
    setSortState({ ...sort, sort: value });
  };
  const setMap = (on) => setSortState({ ...sort, map: on });
  const setSide = (on) => setSortState({ ...sort, side: on });
  const toggleQuick = (k) => {
    snapshot();
    setSortState({ ...sort, quick: quick.includes(k) ? quick.filter((x) => x !== k) : [...quick, k] });
  };

  useEffect(() => {
    // Back from the planner: focus the trip they planned; else the heading.
    const card = markedId ? cardRefs.current.get(markedId) : null;
    (card || titleRef.current)?.focus({ preventScroll: !card });
    if (card) card.scrollIntoView?.({ block: 'center' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival

  useEffect(() => {
    // After a skip, focus moves to the next trip's name (or the heading).
    if (!focusNext.current) return;
    const id = focusNext.current;
    focusNext.current = null;
    (cardRefs.current.get(id) || titleRef.current)?.focus();
  });

  const skipOne = (trip) => {
    const at = trips.findIndex((x) => x.id === trip.id);
    focusNext.current = (trips[at + 1] || trips[at - 1])?.id || '__title';
    setTicks(ticks.filter((x) => x !== trip.id));
    setSkips([...skips, trip.id]);
  };

  const moreLike = (trip) => setMl({ ...ml, more: trip.id, undo: null });
  const lessLike = (trip) => {
    skipOne(trip);
    setMl({ ...ml, less: [...ml.less.filter((x) => x.id !== trip.id), markOf(trip)], undo: trip.id });
  };
  const undoLess = () => {
    setSkips(skips.filter((x) => x !== ml.undo));
    setMl({ ...ml, less: ml.less.filter((x) => x.id !== ml.undo), undo: null });
  };
  const hintText = hint && (hint.kind === 'country'
    ? countryLabel({ iso2: hint.iso2, country: hint.iso2 }, lang)
    : t(SHAPE_LABEL[hint.shape] || 'pf.o.shapeTowns'));

  const toggle = (id) => {
    const live = ticked.map((x) => x.id);
    if (live.includes(id)) {
      setRefused(null);
      setTicks(live.filter((x) => x !== id));
    } else if (live.length >= MAX_COMPARE) {
      setRefused(id);
    } else {
      setRefused(null);
      setTicks([...live, id]);
    }
  };

  const cheapestId = cheapestOf(trips);
  // G12 L12 (decision §3.4, 0013): the past trip's own logged spend a day, as
  // a reference line only. It is the traveller's figure, not like for like
  // with Carta's totals, so it never sets a budget, sorts, or is compared.
  const ref = settings.spendRef;
  const spendLine = ref?.eurPP > 0 && ref.nights > 0
    ? t('tf.spendRef', { name: [ref.label, ref.year || ''].filter(Boolean).join(' '), eur: formatMoney(ref.eurPP / ref.nights, { locale: lang }) })
    : '';
  // G12 R2: themed rows from the trips already priced, under the best pick
  // and the diverse five, only in the engine's own order with no quick
  // filter (a sort or a filter is the traveller's own way to keep looking).
  // G12 B5: the straight-line distance from home, for Close by when the flight times are missing.
  const kmFromHome = (x) => {
    const d = destinations?.[x.places?.[0]?.id];
    const lat = d?.city_lat ?? d?.lat;
    const lon = d?.city_lon ?? d?.lon;
    if (!Number.isFinite(home?.lat) || !Number.isFinite(home?.lon) || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return haversineKm(home.lat, home.lon, lat, lon);
  };
  const acc = { minutes: thereMinutes, km: kmFromHome, highs: (x) => dayHighs(x, destinations), crowd: (x) => crowdTier(x, destinations) };
  const rows = sort.sort === 'match' && !quick.length && !onMap
    ? themedRows(trips, { ...acc, settings, topIds: trips.slice(0, PAGE).map((x) => x.id) })
    : [];
  const rowTitle = (r) => {
    if (r.key === 'near' && r.basis === 'km') return t('tf.row.nearKm');
    if (r.key === 'warm') return r.month ? t('tf.row.warm', { month: monthName(r.month, lang) }) : t('tf.row.warmAny');
    return t(`tf.row.${r.key}`);
  };
  const whyText = (r, trip) => {
    const w = rowWhy(r, trip, acc);
    if (!w) return '';
    if (w.key === 'tf.row.less') return t(w.key, { eur: formatMoney(w.eur, { locale: lang }) });
    if (w.key === 'tf.row.time') return t(w.key, { time: shortDuration(t, w.minutes) });
    if (w.key === 'tf.row.high') return t(w.key, { c: w.c });
    if (w.key === 'tf.row.km') return t(w.key, { km: new Intl.NumberFormat(lang).format(w.km) });
    return t(w.key, { month: monthName(w.month, lang) });
  };
  // "All n" opens the row's sort on the full list below.
  const showAll = (r) => { setSort(r.sort); titleRef.current?.scrollIntoView?.({ block: 'start' }); };
  // The top pick takes a whole row while the list is in the engine's order (T879).
  const featId = sort.sort === 'match' && trips.length > 2 ? trips[0].id : null;
  const card = (trip, { feat = false, why = '' } = {}) => (
    <TripCard
      trip={trip}
      destinations={destinations}
      feat={feat}
      why={why}
      best={trip.id === cheapestId}
      marked={trip.id === markedId}
      onOpen={onOpen}
      compare={{ ticked: ticks.includes(trip.id), refused: refused === trip.id, full: ticked.length >= MAX_COMPARE, onToggle: toggle }}
      keep={{ kept: keeper.isKept(trip.id), onKeep: keeper.toggle, onSkip: skipOne, onMore: moreLike, onLess: lessLike }}
      ref={(el) => { if (el) cardRefs.current.set(trip.id, el); else cardRefs.current.delete(trip.id); }}
    />
  );

  return (
    <div className="pf-step tff-trips">
      <SheetHead onBack={onBack} backLabel={t('pf.back')} end={headEnd} />
      <div className="tff-head">
        <h2 className="pf-title tff-title" tabIndex={-1} ref={titleRef} aria-live="polite">
          {t(trips.length === 1 ? 'tf.list.titleOne' : 'tf.list.titleN', { n: trips.length })}
        </h2>
      </div>
      {spendLine && <p className="tff-spendref">{spendLine}</p>}
      {answers.chips.length > 0 && (
        <ul className="tff-answers" aria-label={t('tf.chip.change')}>
          {answers.chips.map((c) => (
            <li key={c.id}>
              <Button variant="secondary" size="sm" className="tff-answer" aria-label={t('tf.chip.changeOne', { answer: c.label })} onClick={() => onReopen(c.q)}>
                {c.label}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* T1103: after the short setup, the way to fit the trips closer. */}
      {refine}

      <div className="tff-toolbar" role="toolbar" aria-label={t('tf.quick.label')}>
        <SortMenu label={t('tf.sort.label')} value={sort.sort} onChange={setSort}
          options={SORTS.map((v) => ({ key: v, label: t(`tf.sort.${v}`) }))} />
        {ticked.length >= 2 && (
          <Button variant="secondary" size="sm" className="tff-cmp-open" iconStart={<ScaleIcon size={16} />} onClick={() => setComparing(true)}>
            {t('tf.cmp.openN', { n: ticked.length })}
          </Button>
        )}
        {Object.keys(QUICK_FILTERS).map((k) => {
          const on = quick.includes(k);
          return (
            <Button key={k} variant="secondary" size="sm" className={`tff-quick${on ? ' is-on' : ''}`} aria-pressed={on}
              iconStart={on ? <CheckIcon size={14} /> : null} onClick={() => toggleQuick(k)}>
              {t(`tf.quick.${k}`)}
            </Button>
          );
        })}
        {wide && (
          <Button variant="secondary" size="sm" className="tff-view" iconStart={<MapPinIcon size={16} />} aria-pressed={side} onClick={() => setSide(!side)}>
            {t(side ? 'tf.view.hideMap' : 'tf.view.showMap')}
          </Button>
        )}
      </div>

      {ml.undo && (
        <p className="tff-ml-note" role="status">
          <span>{t('tf.ml.lessDone')}</span>
          <Button variant="quiet" size="sm" onClick={undoLess}>{t('pf.delta.undo')}</Button>
        </p>
      )}
      {hint && app?.travelStyles?.setOpen && (
        <p className="tff-ml-note">
          <span>{t('tf.ml.hint', { what: hintText })}</span>
          <Button variant="quiet" size="sm" onClick={() => app.travelStyles.setOpen({ view: 'overview' })}>{t('tf.ml.hintGo')}</Button>
        </p>
      )}
      {likeRow.length > 0 && (
        <section className="tff-row tff-ml-row" aria-labelledby="tff-ml-h">
          <div className="tff-row-head">
            <h3 className="tff-row-title" id="tff-ml-h">{t('tf.ml.rowTitle', { name: tripName(moreOf, destinations, lang) })}</h3>
            <Button variant="quiet" size="sm" onClick={() => setMl({ ...ml, more: null })}>{t('pf.delta.undo')}</Button>
          </div>
          <ul className="tff-row-cards" aria-labelledby="tff-ml-h">
            {likeRow.map((trip) => <li key={trip.id}>{card(trip)}</li>)}
          </ul>
        </section>
      )}
      {(() => {
        const empty = !trips.length && quick.length > 0 && (
          <div className="tff-none" role="status">
            <p>{t('tf.quick.none')}</p>
            <Button variant="secondary" size="sm" onClick={() => setSortState({ ...sort, quick: [] })}>{t('tf.quick.clear')}</Button>
          </div>
        );
        const item = (trip) => (
          <li key={trip.id} className={[trip.id === featId ? 'is-feat' : '', trip.id === hotId ? 'is-hot' : ''].filter(Boolean).join(' ') || undefined}
            onMouseEnter={side ? () => setHotId(trip.id) : undefined} onMouseLeave={side ? () => setHotId(null) : undefined}
            ref={(el) => { if (el) items.current.set(trip.id, el); else items.current.delete(trip.id); }}>
            {card(trip, { feat: trip.id === featId })}
          </li>
        );
        // G12 R2: with rows, the best pick and the diverse five, then the
        // rows, then the rest of the list under "Keep looking".
        const list = rows.length ? (
          <>
            <ol className="tff-list">{trips.slice(0, PAGE).map(item)}</ol>
            <section className="tff-rows" aria-labelledby="tff-rows-h">
              <h3 className="tff-rows-h" id="tff-rows-h">{t('tf.row.label')}</h3>
              {rows.map((r) => (
                <div key={r.key} className="tff-row">
                  <div className="tff-row-head">
                    <h4 className="tff-row-title">{rowTitle(r)}</h4>
                    <Button variant="quiet" size="sm" aria-label={t('tf.row.allOf', { n: r.n, row: rowTitle(r) })} onClick={() => showAll(r)}>
                      {t('tf.row.all', { n: r.n })}
                    </Button>
                  </div>
                  <ul className="tff-row-cards" aria-label={rowTitle(r)}>
                    {r.trips.map((trip) => <li key={trip.id}>{card(trip, { why: whyText(r, trip) })}</li>)}
                  </ul>
                </div>
              ))}
            </section>
            {trips.length > PAGE && <h3 className="tff-more-h">{t('tf.list.keepLooking')}</h3>}
            {shown > PAGE && <ol className="tff-list">{trips.slice(PAGE, shown).map(item)}</ol>}
          </>
        ) : (
          <ol className="tff-list">
            {trips.slice(0, shown).map((trip) => (
              <li key={trip.id} className={[trip.id === featId ? 'is-feat' : '', trip.id === hotId ? 'is-hot' : ''].filter(Boolean).join(' ') || undefined}
                onMouseEnter={side ? () => setHotId(trip.id) : undefined} onMouseLeave={side ? () => setHotId(null) : undefined}
                ref={(el) => { if (el) items.current.set(trip.id, el); else items.current.delete(trip.id); }}>
                {card(trip, { feat: trip.id === featId })}
              </li>
            ))}
          </ol>
        );
        const map = (
          <Suspense fallback={<div className="tff-map is-loading" aria-busy="true"><span className="sr-only">{t('state.loading')}</span></div>}>
            <TripsMap trips={trips} destinations={destinations} pickedId={picked?.id || null} cheapestId={cheapestId} onPick={setPickedId} label={t('tf.map.label')}
              home={home} hotId={hotId} onHot={setHotId}
              pad={side ? { top: 72, right: 64, bottom: 320, left: 64 } : 56} />
          </Suspense>
        );
        if (side) {
          return (
            <div className="tff-split">
              <div className="tff-split-list">{empty || list}</div>
              <div className="tff-split-map">
                {map}
                {picked && <div className="tff-mapcard is-float">{card(picked)}</div>}
              </div>
            </div>
          );
        }
        if (onMap) {
          return (
            <div className="tff-mapview">
              {map}
              {picked && <div className="tff-mapcard">{card(picked)}</div>}
            </div>
          );
        }
        return empty || list;
      })()}
      {!wide && trips.length > 0 && (
        <div className="tff-fab-slot">
          <Button variant="secondary" size="sm" className="tff-fab" iconStart={onMap ? <ListDayIcon size={16} /> : <MapPinIcon size={16} />} onClick={() => setMap(!onMap)}>
            {t(onMap ? 'explore.viewList' : 'explore.viewMap')}
          </Button>
        </div>
      )}
      {hidden > 0 && (
        <p className="tff-hidden" role="status">
          <span>{t('tf.keep.hidden', { n: hidden })}</span>
          <Button variant="quiet" size="sm" onClick={() => setSkips([])}>{t('tf.keep.unhide')}</Button>
        </p>
      )}
      {(!onMap || side) && trips.length > shown && (
        <div className="tff-more">
          <Button variant="quiet" onClick={() => setShown(shown + PAGE)}>{t('tf.list.more')}</Button>
        </div>
      )}
      {!onMap && capped.out > 0 && (
        <section className="tff-near" aria-labelledby="tff-near-h" data-near="">
          <h3 className="tff-rows-h" id="tff-near-h">{t('tf.near.title')}</h3>
          <p className="tff-near-note">{t('tf.near.out', { n: capped.out })}</p>
          {nearBy.length > 0 && (
            <ul className="tff-row-cards" aria-labelledby="tff-near-h">
              {nearBy.map(({ trip, verdict }) => (
                <li key={trip.id}>{card(trip, { why: t(settings.guide?.budget?.kind === 'day' ? 'tf.near.whyDay' : 'tf.near.why', { eur: formatMoney(verdict.gap, { locale: lang }) }) })}</li>
              ))}
            </ul>
          )}
        </section>
      )}
      {comparing && ticked.length >= 2 && (
        <TripCompare
          trips={ticked}
          settings={settings}
          destinations={destinations}
          ui={ui}
          onClose={() => setComparing(false)}
          onRemove={(id) => setTicks(ticked.map((x) => x.id).filter((x) => x !== id))}
          onOpen={onOpen}
          onPlan={onPlan}
        />
      )}
    </div>
  );
}
