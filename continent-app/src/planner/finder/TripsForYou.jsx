import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Segmented } from '../../components/ui/index.js';
import { ChevronDownIcon, FilterIcon } from '../../components/Icons.jsx';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { SheetHead } from '../flow/PlanStage.jsx';
import { useBcp47, useMonths, whenText } from '../flow/flowHooks.js';
import { MAX_COMPARE } from '../../lib/recommend/compare.js';
import { LEVERS } from '../../lib/recommend/rank.js';
import { answersOf, useKeepTrip, useLevers } from './finderHooks.js';
import { readSkips, writeSkips } from '../../lib/recommend/keptStore.js';
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

/**
 * One lever as a labelled Segmented control (T810). A group the answers
 * left unset has no chosen segment, and the kit's Segmented then has no
 * tab stop: the first segment takes it until one is chosen.
 */
function LeverControl({ group, value, onPick, t }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const items = [...(ref.current?.querySelectorAll('.seg-item') || [])];
    items.forEach((el, i) => { el.tabIndex = value ? (el.getAttribute('aria-checked') === 'true' ? 0 : -1) : (i === 0 ? 0 : -1); });
  });
  return (
    <div className="tff-lever" ref={ref}>
      <span className="tff-lever-label" aria-hidden="true">{t(`tf.lever.${group.id}`)}</span>
      <Segmented
        label={t(`tf.lever.${group.id}`)}
        size="sm"
        block
        value={value}
        onChange={(v) => onPick(group.id, v)}
        options={group.values.map((v) => ({ value: v, label: t(`tf.lever.short.${group.id}.${v}`) }))}
      />
    </div>
  );
}
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
 * Trips for you (T798): the answers, then the priced trips, six at a time
 * with "Show more trips" for the rest.
 *
 * The toolbar (T810, owner 2026-10-29: "not structured, not aligned"): the
 * answers as one line with Edit answers, which lists each answer to reopen
 * (Continue there comes straight back), and the three levers as labelled
 * Segmented controls on one row from 769 px; a phone shows one Adjust
 * button that opens them in a sheet. One column on a phone, two on a
 * tablet, three across the wide stage on a desktop (up to 1200 px).
 *
 * Compare (T802): each card has a Compare tick, up to four. From two ticks
 * a tray at the foot opens the compare table (TripCompare); closing it
 * returns focus to the tray.
 *
 * Levers (T803): flight, food and bases, each starting from the traveller's own answers. A tap
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
  const keeper = useKeepTrip({ destinations, lang, keepWith });
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const adjustRef = useRef(null);
  const [skips, setSkips] = useSkips(settings);
  const trips = skips.length ? found.filter((x) => !skips.includes(x.id)) : found;
  const hidden = found.length - trips.length;
  const focusNext = useRef(null);
  const months = useMonths();
  const bcp47 = useBcp47();
  const titleRef = useRef(null);
  const listId = useId();
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

  // The answers in one line (T810): where from, when and the likes; the
  // rest are counted and listed under Edit answers.
  const lead = chips.filter((c) => c.id === 'from' || c.id === 'when' || c.id.startsWith('like:'));
  const summary = lead.map((c) => c.label);
  const rest = chips.length - lead.length;
  const levers3 = LEVER_GROUPS.map((g) => (
    <LeverControl key={g.id} group={g} value={levers[g.id] || null} onPick={pull} t={t} />
  ));

  return (
    <div className="pf-step tff-trips">
      <SheetHead onBack={onBack} backLabel={t('pf.back')} />
      <div className="tff-head">
        <h2 className="pf-title tff-title" tabIndex={-1} ref={titleRef}>{t('tf.list.title')}</h2>
        <p className="tff-count" aria-live="polite">{t('tf.list.count', { n: trips.length })}</p>
      </div>

      <div className="tff-toolbar">
        {chips.length > 0 && (
          <div className="tff-answers">
            <p className="tff-summary">
              {summary.join(', ')}
              {rest > 0 && <span className="tff-summary-more">{t('tf.bar.more', { n: rest })}</span>}
            </p>
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
            <Button
              variant="secondary"
              size="sm"
              className="tff-adjust"
              ref={adjustRef}
              iconStart={<FilterIcon size={16} />}
              onClick={() => setAdjusting(true)}
            >
              {t('tf.lever.adjust')}
            </Button>
          </div>
        )}
        {editing && (
          <ul className="tff-ansbar" id={`${listId}-answers`} aria-label={t('tf.chip.change')}>
            {chips.map((c) => (
              <li key={c.id}>
                <Button size="sm" variant="secondary" className="tff-ans" aria-label={t('tf.chip.changeOne', { answer: c.label })} onClick={() => onReopen(c.q)}>
                  {c.label}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="tff-levers" role="group" aria-label={t('tf.lever.label')}>
          {levers3}
        </div>
      </div>
      {adjusting && (
        <SheetShell title={t('tf.lever.sheet')} onClose={() => setAdjusting(false)} className="tff-adjust-sheet" labelId={`${listId}-adjust`} closeLabel={t('tf.lever.done')}>
          <div className="tff-adjust-body" role="group" aria-label={t('tf.lever.label')}>
            {levers3}
            <Button variant="primary" block onClick={() => setAdjusting(false)}>
              {t('tf.lever.show', { n: trips.length })}
            </Button>
          </div>
        </SheetShell>
      )}
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
              keep={{ kept: keeper.isKept(trip.id), onKeep: keeper.toggle, onSkip: skipOne }}
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
