import React, { Suspense, lazy, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Segmented } from '../../components/ui/index.js';
import { ChevronDownIcon, ListDayIcon, MapPinIcon, ScaleIcon } from '../../components/Icons.jsx';
import { SheetHead } from '../flow/PlanStage.jsx';
import { useBcp47, useMonths, whenText } from '../flow/flowHooks.js';
import { MAX_COMPARE } from '../../lib/recommend/compare.js';
import { answersOf } from './finderHooks.js';
import { readSkips, writeSkips } from '../../lib/recommend/keptStore.js';
import { TripCard } from './TripCard.jsx';
import { TripCompare } from './TripCompare.jsx';
import { PAGE, SORTS, answersLine, sortTrips, totalLeavesOut } from './finderText.js';

/** The cheapest whole total in the list (the best-value pin), when two or more have one. */
const cheapestOf = (trips) => {
  const whole = sortTrips(trips, 'cheapest').filter((x) => !totalLeavesOut(x) && Number.isFinite(x.total?.group ?? x.total?.perPerson));
  return whole.length > 1 ? whole[0].id : null;
};

// maplibre arrives only when the traveller asks for the map (T868).
const TripsMap = lazy(() => import('./TripsMap.jsx'));

// The Compare ticks for this visit (T802), per answer set: the same answers
// find the same trips with the same ids, so the ticks hold while the
// traveller reopens a question and comes back, and clear when an answer
// changes. Memory only, never stored. The sort and the view keep the same
// way (T868).
const TICKS = new Map();
const VIEW = new Map();
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
 * The head: "21 trips for you" with the answers in one line under it (the
 * places named first, row T859-b; then from, when, who, the likes, and
 * "+3 more") and Edit answers, which lists every answer to reopen
 * (Continue there comes straight back, and the search runs again). Then
 * one row: Sort (Best match, Cheapest, Shortest trip there), Compare once
 * two trips are ticked, and the Map toggle naming where it goes. The trips
 * as a photo gallery across the full width: three across from 1024 px,
 * two on a tablet, one on a phone; six at a time with "Show more trips".
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
 *   onPlan(trip)   "Plan this trip" from the compare table (T801's hand-off)
 *   keeper         the heart (useKeepTrip), shared with the searching screen
 *   ui             the app parts TripFlow hands down (see FindingTrips)
 *
 * Keep and skip (T806): a heart on each card keeps the trip in My trips
 * (keptStore), Skip in its menu hides it for these answers; the hidden ones
 * are counted under the list with "Show them again".
 */
export function TripsForYou({ settings, trips: found, destinations, originName, markedId = null, onBack, onOpen, onReopen, onPlan, cardRefs, keeper, ui, headEnd = null }) {
  const { t, lang } = useI18n();
  const [editing, setEditing] = useState(false);
  const [skips, setSkips] = useSkips(settings);
  const [sort, setSortState] = useVisit(VIEW, settings, { sort: 'match', map: false });
  const kept = skips.length ? found.filter((x) => !skips.includes(x.id)) : found;
  const trips = sortTrips(kept, sort.sort);
  const hidden = found.length - kept.length;
  const focusNext = useRef(null);
  const months = useMonths();
  const bcp47 = useBcp47();
  const titleRef = useRef(null);
  const listId = useId();
  const markedAt = markedId ? trips.findIndex((x) => x.id === markedId) : -1;
  const [shown, setShown] = useState(() => Math.max(PAGE, markedAt + 1));
  const [ticks, setTicks] = useVisit(TICKS, settings, []);
  const [refused, setRefused] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [pickedId, setPickedId] = useState(null);
  const items = useRef(new Map());
  const order = trips.slice(0, shown).map((x) => x.id).join();
  const snapshot = useReorderMotion(order, items);
  const when = whenText(t, settings.when, months, bcp47);
  const answers = answersLine(settings, { t, lang, originName, when, trip: trips[0] || null, locale: lang });
  // A ticked trip that is no longer in the list is not compared.
  const ticked = ticks.map((id) => trips.find((x) => x.id === id)).filter(Boolean);
  const onMap = sort.map;
  const picked = (pickedId && trips.find((x) => x.id === pickedId)) || trips[0] || null;

  const setSort = (value) => {
    if (value === sort.sort) return;
    snapshot();
    setSortState({ ...sort, sort: value });
  };
  const setMap = (on) => setSortState({ ...sort, map: on });

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
  // The top pick takes a whole row while the list is in the engine's order (T879).
  const featId = sort.sort === 'match' && trips.length > 2 ? trips[0].id : null;
  const card = (trip, { feat = false } = {}) => (
    <TripCard
      trip={trip}
      destinations={destinations}
      feat={feat}
      best={trip.id === cheapestId}
      marked={trip.id === markedId}
      onOpen={onOpen}
      compare={{ ticked: ticks.includes(trip.id), refused: refused === trip.id, full: ticked.length >= MAX_COMPARE, onToggle: toggle }}
      keep={{ kept: keeper.isKept(trip.id), onKeep: keeper.toggle, onSkip: skipOne }}
      ref={(el) => { if (el) cardRefs.current.set(trip.id, el); else cardRefs.current.delete(trip.id); }}
    />
  );

  return (
    <div className="pf-step tff-trips">
      <SheetHead onBack={onBack} backLabel={t('pf.back')} end={headEnd} />
      <div className="tff-head">
        <div className="tff-head-text">
          <h2 className="pf-title tff-title" tabIndex={-1} ref={titleRef} aria-live="polite">
            {t(trips.length === 1 ? 'tf.list.titleOne' : 'tf.list.titleN', { n: trips.length })}
          </h2>
          {answers.line && (
            <p className="tff-summary">
              {answers.line}
              {answers.rest > 0 && <span className="tff-summary-more">{t('tf.bar.more', { n: answers.rest })}</span>}
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="tff-edit"
          aria-expanded={editing}
          aria-controls={`${listId}-answers`}
          iconEnd={<ChevronDownIcon size={14} />}
          onClick={() => setEditing((v) => !v)}
        >
          {t('tf.bar.edit')}
        </Button>
      </div>
      {editing && (
        <ul className="tff-ansbar" id={`${listId}-answers`} aria-label={t('tf.chip.change')}>
          {answers.chips.map((c) => (
            <li key={c.id}>
              <Button size="sm" variant="secondary" className="tff-ans" aria-label={t('tf.chip.changeOne', { answer: c.label })} onClick={() => onReopen(c.q)}>
                {c.label}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="tff-toolbar">
        <Segmented
          label={t('tf.sort.label')}
          size="sm"
          className="tff-sort"
          value={sort.sort}
          onChange={setSort}
          options={SORTS.map((v) => ({ value: v, label: t(`tf.sort.${v}`) }))}
        />
        <div className="tff-tools">
          {ticked.length >= 2 && (
            <Button variant="secondary" size="sm" className="tff-cmp-open" iconStart={<ScaleIcon size={16} />} onClick={() => setComparing(true)}>
              {t('tf.cmp.openN', { n: ticked.length })}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="tff-view"
            iconStart={onMap ? <ListDayIcon size={16} /> : <MapPinIcon size={16} />}
            onClick={() => setMap(!onMap)}
          >
            {t(onMap ? 'explore.viewList' : 'explore.viewMap')}
          </Button>
        </div>
      </div>

      {onMap ? (
        <div className="tff-mapview">
          <Suspense fallback={<div className="tff-map is-loading" aria-busy="true"><span className="sr-only">{t('state.loading')}</span></div>}>
            <TripsMap trips={trips} destinations={destinations} pickedId={picked?.id || null} cheapestId={cheapestId} onPick={setPickedId} label={t('tf.map.label')} />
          </Suspense>
          {picked && <div className="tff-mapcard">{card(picked)}</div>}
        </div>
      ) : (
        <ol className="tff-list">
          {trips.slice(0, shown).map((trip) => (
            <li key={trip.id} className={trip.id === featId ? 'is-feat' : undefined} ref={(el) => { if (el) items.current.set(trip.id, el); else items.current.delete(trip.id); }}>
              {card(trip, { feat: trip.id === featId })}
            </li>
          ))}
        </ol>
      )}
      {hidden > 0 && (
        <p className="tff-hidden" role="status">
          <span>{t('tf.keep.hidden', { n: hidden })}</span>
          <Button variant="quiet" size="sm" onClick={() => setSkips([])}>{t('tf.keep.unhide')}</Button>
        </p>
      )}
      {!onMap && trips.length > shown && (
        <div className="tff-more">
          <Button variant="quiet" onClick={() => setShown(shown + PAGE)}>{t('tf.list.more')}</Button>
        </div>
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
