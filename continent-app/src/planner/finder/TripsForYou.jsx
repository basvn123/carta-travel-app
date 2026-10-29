import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip, ChipGroup } from '../../components/ui/index.js';
import { SheetHead } from '../flow/PlanStage.jsx';
import { useBcp47, useMonths, whenText } from '../flow/flowHooks.js';
import { MAX_COMPARE } from '../../lib/recommend/compare.js';
import { LEVERS } from '../../lib/recommend/rank.js';
import { keepRecordOf, answersOf, useLevers } from './finderHooks.js';
import { keep, readSkips, unkeep, useKept, writeSkips } from '../../lib/recommend/keptStore.js';
import { TripCard } from './TripCard.jsx';
import { TripCompare } from './TripCompare.jsx';
import { PAGE, answerChips } from './finderText.js';

// The Compare ticks for this visit (T802), per answer set: the same answers
// find the same trips with the same ids, so the ticks hold while the
// traveller reopens a question and comes back, and clear when an answer
// changes. Memory only, never stored.
const TICKS = new Map();
const answersKey = (s) => JSON.stringify([answersOf(s).guide, s.when, s.party, s.priority, s.from]);

// The lever groups (T803), each a single choice, in the plan's order.
const LEVER_GROUPS = ['flight', 'food', 'bases'].map((id) => ({ id, values: Object.keys(LEVERS[id].values) }));
const ONE_BASE = (t) => t.places.length === 1;

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
 * Cards move to their new place when a lever re-orders the list: the
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

function useTicks(settings) {
  const key = answersKey(settings);
  const [ticks, setState] = useState(() => TICKS.get(key) || []);
  const seen = useRef(key);
  useEffect(() => {
    if (seen.current === key) return;
    seen.current = key;
    setState([]);
  }, [key]);
  const set = (next) => {
    TICKS.clear();
    TICKS.set(key, next);
    setState(next);
  };
  return [ticks, set];
}

/**
 * Trips for you (T798): the answers as chips (a tap reopens that question,
 * and Continue there comes straight back), then the priced trips, six at a
 * time with "Show more trips" for the rest. One column on a phone; on a
 * desktop a grid of equal cards across the plan stage's width.
 *
 * Compare (T802): each card has a Compare tick, up to four. From two ticks
 * a tray at the foot opens the compare table (TripCompare); closing it
 * returns focus to the tray.
 *
 * Levers (T803): one row of choice chips under the answers, flight, food
 * and bases, each starting from the traveller's own answers. A tap
 * re-ranks the list in place (useTripFinder applies the levers, so the
 * card, the receipt and the compare table read the same trips); the
 * answers bar stays as it is and a ticked trip stays ticked while it is
 * in the list. A bases choice no trip fits says so in one line and keeps
 * the whole list.
 *
 *   trips          the ranked trips, with any swap the receipt made
 *   markedId       the trip the traveller planned last (back from the planner)
 *   onOpen(trip, el)  open its receipt; `el` gets focus back on close
 *   onReopen(id)   reopen one question
 *   onPlan(trip)   "Plan this trip" from the compare table (T801's hand-off)
 *   keepWith       { origin, file }: the home airport and the swept file the
 *                  trips were priced with, kept with a kept trip (T807)
 *
 * Keep and skip (T806): a heart on each card keeps the trip in My trips
 * (keptStore), Skip hides it for these answers; the hidden ones are counted
 * under the list with "Show them again".
 */
export function TripsForYou({ settings, trips: found, destinations, originName, markedId = null, onBack, onOpen, onReopen, onPlan, cardRefs, ui, keepWith = null }) {
  const { t, lang } = useI18n();
  const kept = useKept();
  const [skips, setSkips] = useSkips(settings);
  const trips = skips.length ? found.filter((x) => !skips.includes(x.id)) : found;
  const hidden = found.length - trips.length;
  const focusNext = useRef(null);
  const months = useMonths();
  const bcp47 = useBcp47();
  const titleRef = useRef(null);
  const markedAt = markedId ? trips.findIndex((x) => x.id === markedId) : -1;
  const [shown, setShown] = useState(() => Math.max(PAGE, markedAt + 1));
  const [ticks, setTicks] = useTicks(settings);
  const [refused, setRefused] = useState(null);
  const [comparing, setComparing] = useState(false);
  const { levers, setLever } = useLevers(settings);
  const items = useRef(new Map());
  const order = trips.slice(0, shown).map((x) => x.id).join();
  const snapshot = useReorderMotion(order, items);
  const pull = (group, value) => {
    if (levers[group] === value) return;
    snapshot();
    setLever(group, value);
  };
  // The bases lever kept the whole list when no trip had that many bases.
  const basesMiss = levers.bases === 'one' ? trips.some((x) => !ONE_BASE(x))
    : levers.bases === 'several' ? trips.some(ONE_BASE) : false;
  const otherBases = levers.bases === 'one' ? 'several' : 'one';
  const when = whenText(t, settings.when, months, bcp47);
  const chips = answerChips(settings, { t, lang, originName, when, trip: trips[0] || null, locale: lang });
  // A ticked trip that is no longer in the list is not compared.
  const ticked = ticks.map((id) => trips.find((x) => x.id === id)).filter(Boolean);

  useEffect(() => {
    // Back from the planner: focus the trip they planned; else the heading.
    const card = markedId ? cardRefs.current.get(markedId) : null;
    (card || titleRef.current)?.focus({ preventScroll: !card });
    if (card) card.scrollIntoView?.({ block: 'center' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival

  useEffect(() => {
    // After a skip, focus moves to the next trip's total (or the heading).
    if (!focusNext.current) return;
    const id = focusNext.current;
    focusNext.current = null;
    (cardRefs.current.get(id) || titleRef.current)?.focus();
  });

  const keepOne = (trip) => {
    if (kept.some((r) => r.id === trip.id)) unkeep(trip.id);
    else keep(keepRecordOf(trip, { destinations, lang, ...(keepWith || {}) }));
  };
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

  return (
    <div className="pf-step tff-trips">
      <SheetHead onBack={onBack} backLabel={t('pf.back')} />
      <h2 className="pf-title" tabIndex={-1} ref={titleRef}>{t('tf.list.title')}</h2>
      {chips.length > 0 && (
        <ul className="tff-ansbar" aria-label={t('tf.chip.change')}>
          {chips.map((c) => (
            <li key={c.id}>
              <Button size="sm" className="tff-ans" aria-label={t('tf.chip.changeOne', { answer: c.label })} onClick={() => onReopen(c.q)}>
                {c.label}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="tff-levers" role="group" aria-label={t('tf.lever.label')}>
        {LEVER_GROUPS.map((g) => (
          <ChipGroup key={g.id} label={t(`tf.lever.${g.id}`)} className="tff-lever">
            {g.values.map((v, i) => (
              <Chip
                key={v}
                kind="choice"
                selected={levers[g.id] === v}
                // A group with nothing chosen yet is still reached by Tab.
                {...(!levers[g.id] && i === 0 ? { tabIndex: 0 } : {})}
                onClick={() => pull(g.id, v)}
              >
                {t(`tf.lever.${g.id}.${v}`)}
              </Chip>
            ))}
          </ChipGroup>
        ))}
      </div>
      {basesMiss && (
        <p className="tff-lever-miss" role="status">
          <span>{t(`tf.lever.miss.${levers.bases}`)}</span>
          <Button variant="quiet" size="sm" onClick={() => pull('bases', otherBases)}>{t(`tf.lever.back.${otherBases}`)}</Button>
        </p>
      )}
      <ol className="tff-list">
        {trips.slice(0, shown).map((trip) => (
          <li key={trip.id} ref={(el) => { if (el) items.current.set(trip.id, el); else items.current.delete(trip.id); }}>
            <TripCard
              trip={trip}
              destinations={destinations}
              marked={trip.id === markedId}
              onOpen={onOpen}
              ui={ui}
              compare={{ ticked: ticks.includes(trip.id), refused: refused === trip.id, onToggle: toggle }}
              keep={{ kept: kept.some((r) => r.id === trip.id), onKeep: keepOne, onSkip: skipOne }}
              ref={(el) => { if (el) cardRefs.current.set(trip.id, el); else cardRefs.current.delete(trip.id); }}
            />
          </li>
        ))}
      </ol>
      {hidden > 0 && (
        <p className="tff-hidden" role="status">
          <span>{t('tf.keep.hidden', { n: hidden })}</span>
          <Button variant="quiet" size="sm" onClick={() => setSkips([])}>{t('tf.keep.unhide')}</Button>
        </p>
      )}
      {trips.length > shown && (
        <div className="tff-more">
          <Button variant="quiet" onClick={() => setShown(shown + PAGE)}>{t('tf.list.more')}</Button>
        </div>
      )}
      {ticked.length >= 2 && (
        <div className="tff-tray" role="region" aria-label={t('tf.cmp.tray')}>
          <p className="tff-tray-text" aria-live="polite">{t('tf.cmp.count', { n: ticked.length })}</p>
          <Button variant="primary" size="sm" onClick={() => setComparing(true)}>{t('tf.cmp.open')}</Button>
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
