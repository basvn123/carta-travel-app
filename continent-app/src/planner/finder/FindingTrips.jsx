import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { CheckIcon } from '../../components/Icons.jsx';
import { SheetHead } from '../flow/PlanStage.jsx';
import { useBcp47, useMonths, whenText } from '../flow/flowHooks.js';
import { useKeepTrip, useTripFinder } from './finderHooks.js';
import { stageLines, widenQuestion } from './finderText.js';
import { TripsForYou } from './TripsForYou.jsx';
import { TripCard } from './TripCard.jsx';
import { TripPage } from './TripPage.jsx';
import { planOf } from './planOf.js';
import '../../styles/87-trip-finder.css';

// Decide together (T808) rides in this chunk: App opens it from a link. Its
// own chunk made the bundler split SheetShell out, one more preload a page.
export { default as TogetherSheet } from './TogetherSheet.jsx';
// The kept trips' price since (T807), for the Plan home and My trips.
export { dropsFor } from '../../lib/recommend/kept.js';
// T864, T865: two doors' screens ride in this chunk with the engine they run.
export { FlightFirstScreen, KnowBuildScreen } from './DoorScreens.jsx';

const PARTY_TITLE = { solo: 'solo', couple: 'couple', friends: 'friends', family: 'family', group: 'group' };
/**
 * Searching (T797, rebuilt in T867): "Finding trips for the two of you",
 * then the stages of real work, each named from the answers, ticking as
 * the engine finishes it (useTripFinder); the working one carries a live
 * dot. The best trips priced so far show under the stages as cards, so the
 * wait turns into the list. It stands exactly as long as the work: no
 * minimum, no made-up delay. Under reduced motion nothing moves; the
 * stages still tick.
 */
export function FindingTrips({ settings, finder, onBack, onWiden, guide, ui, onOpen, cardRefs, keeper }) {
  const { t, lang } = useI18n();
  const months = useMonths();
  const bcp47 = useBcp47();
  const titleRef = useRef(null);
  const when = whenText(t, settings.when, months, bcp47);
  const lines = useMemo(
    () => stageLines(settings, { t, lang, when, data: finder.data, origin: finder.origin, stayTier: finder.stayTier }),
    [settings, finder.data, finder.origin, finder.stayTier, t, lang, when.start, when.end], // eslint-disable-line react-hooks/exhaustive-deps -- when is rebuilt each render from its parts
  );
  const failed = finder.trips && finder.trips.length === 0;
  const kind = PARTY_TITLE[settings.party.kind] || 'solo';

  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, []);

  if (failed) {
    const q = widenQuestion(settings, guide);
    return (
      <div className="pf-step tff-load">
        <SheetHead onBack={onBack} backLabel={t('pf.back')} />
        <h2 className="pf-title" tabIndex={-1} ref={titleRef}>{t('tf.load.failedTitle')}</h2>
        <p className="tff-fail" role="status">{t(finder.error ? 'tf.load.error' : 'tf.load.none')}</p>
        <div className="pf-foot">
          <Button variant="primary" block onClick={() => onWiden(q)}>
            {t(q === 'g:budget' ? 'tf.load.widenBudget' : q === 'g:reach' ? 'tf.load.widenReach' : 'tf.load.widenAny')}
          </Button>
        </div>
      </div>
    );
  }

  const working = lines.find((l) => !finder.stages[l.key]);
  const early = finder.early || [];
  return (
    <div className="pf-step tff-load">
      <SheetHead onBack={onBack} backLabel={t('pf.back')} />
      <h2 className="pf-title" tabIndex={-1} ref={titleRef}>{t(`tf.load.title.${kind}`)}</h2>
      <ol className="tff-checks" aria-live="polite">
        {lines.map((l) => {
          const done = finder.stages[l.key];
          const state = done ? 'is-done' : l === working ? 'is-working' : 'is-waiting';
          return (
            <li key={l.key} className={`tff-check ${state}`}>
              <span className="tff-check-mark" aria-hidden="true">{done && <CheckIcon size={12} />}</span>
              <span>{l.text}</span>
              {done && <span className="sr-only">{t('tf.load.done')}</span>}
            </li>
          );
        })}
      </ol>
      {early.length > 0 && (
        <ol className="tff-list tff-early" aria-label={t('tf.load.first')}>
          {early.map((trip) => (
            <li key={trip.id}>
              <TripCard
                trip={trip}
                destinations={finder.data?.destinations}
                onOpen={onOpen}
                ui={ui}
                keep={{ kept: keeper.isKept(trip.id), onKeep: keeper.toggle }}
                ref={(el) => { if (el) cardRefs.current.set(trip.id, el); else cardRefs.current.delete(trip.id); }}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The trip page's address (T870): #tf=<trip id>, one history step over the list. */
const TRIP_HASH = '#tf=';
const tripFromHash = (hash) => {
  const h = String(hash || '');
  if (!h.startsWith(TRIP_HASH)) return null;
  try { return decodeURIComponent(h.slice(TRIP_HASH.length)) || null; } catch { return null; }
};
const withoutHash = () => `${window.location.pathname}${window.location.search}`;
/** The element the list scrolls in: the nearest scrolling ancestor, else the document. */
function scrollerOf(el) {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const y = getComputedStyle(n).overflowY;
    if ((y === 'auto' || y === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return document.scrollingElement || document.documentElement;
}

/**
 * The finder screen behind question 7 (g:trips): searching, then Trips
 * for you, then a trip's own page. TripFlow loads it lazily, with
 * lib/recommend, so the Plan tab's first load does not carry the engine.
 *
 *   ui              { NotYet, AirlineMark, useAirlines, airlineName }: TripFlow imports these and
 *                   hands them down. They ship in the Plan tab's chunks
 *                   already; imported from this lazy chunk, rolldown split
 *                   each into a chunk of its own, two more preloads on
 *                   every page (T801 end check).
 *   onBack()        back to question 7
 *   onWiden(id)     reopen one question (the answers line, an empty result)
 *   edits, setEdits the trip page's swaps by trip id (kept by TripFlow)
 *   markedId        the trip planned last, marked on the way back
 *   openId          T870: a trip to open on arrival (an address with #tf=)
 *   onPlan(plan)    "Plan this trip": the trip's plan (planOf.js)
 *
 * T870: a card opens the trip's page (TripPage) in place of the list, with
 * its own address (#tf=<id>) pushed as one history step, so the browser's
 * Back and the page's own back control return to the list where it was:
 * the list stays mounted under the page (its sort, view and scroll held)
 * and focus goes back to the card that opened it.
 *
 * The list shows the moment the trips are ranked: back from the planner
 * the run is memoised, so it is there at once (T867: no minimum stand).
 */
export default function TripFinderScreen({ ui, settings, guide, edits, setEdits, markedId = null, openId: arriveId = null, onBack, onWiden, onPlan }) {
  const { lang } = useI18n();
  const finder = useTripFinder(settings);
  const [openId, setOpenId] = useState(arriveId);
  const cardRefs = useRef(new Map());
  const pushed = useRef(false);
  const underRef = useRef(null);
  const listAt = useRef(null); // { el, top }: where the list stood when a trip opened
  const keepWith = { origin: finder.origin?.iata || null, file: finder.input?.flights || null };
  const keeper = useKeepTrip({ destinations: finder.data?.destinations, lang, keepWith });
  const all = (finder.trips || finder.early || []).map((x) => edits[x.id] || x);
  const open = openId ? all.find((x) => x.id === openId) : null;
  const ready = Boolean(finder.trips && finder.trips.length);

  // An address that names a trip the answers no longer give: back to the list.
  useEffect(() => {
    if (!openId || !finder.trips || open) return;
    setOpenId(null);
    try { window.history.replaceState(window.history.state, '', withoutHash()); } catch { /* sandboxed */ }
  }, [openId, finder.trips, open]);

  // Back and Forward: a step without #tf= is the list, a step with it the trip.
  useEffect(() => {
    const onPop = () => {
      const id = tripFromHash(window.location.hash);
      if (!id) {
        pushed.current = false;
        setOpenId((was) => {
          if (was) {
            window.requestAnimationFrame(() => {
              const at = listAt.current;
              if (at?.el) at.el.scrollTop = at.top;
              cardRefs.current.get(was)?.focus({ preventScroll: true });
            });
          }
          return null;
        });
      } else setOpenId(id);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openTrip = (trip) => {
    if (!openId) {
      const el = scrollerOf(underRef.current);
      listAt.current = { el, top: el.scrollTop };
    }
    const url = `${withoutHash()}${TRIP_HASH}${encodeURIComponent(trip.id)}`;
    try {
      if (pushed.current) window.history.replaceState({ ...(window.history.state || {}), cartaTrip: trip.id }, '', url);
      else window.history.pushState({ ...(window.history.state || {}), cartaTrip: trip.id }, '', url);
      pushed.current = true;
    } catch { /* the page still opens; only the address stays put */ }
    setOpenId(trip.id);
  };
  const closeTrip = () => {
    if (pushed.current) {
      try { window.history.back(); return; } catch { /* fall through */ }
    }
    // Opened from an address: no step of ours to go back through.
    try { window.history.replaceState(window.history.state, '', withoutHash()); } catch { /* sandboxed */ }
    setOpenId(null);
  };
  const planTrip = (trip) => {
    // The trip page's address does not outlive the plan.
    try { window.history.replaceState(window.history.state, '', withoutHash()); } catch { /* sandboxed */ }
    pushed.current = false;
    onPlan(planOf(trip));
  };

  return (
    <>
      <div hidden={Boolean(open)} className="tff-under" ref={underRef}>
        {ready ? (
          <TripsForYou
            settings={settings}
            trips={all}
            destinations={finder.data?.destinations}
            originName={settings.from?.name || finder.origin?.name || ''}
            markedId={markedId}
            ui={ui}
            onBack={onBack}
            onReopen={onWiden}
            onOpen={openTrip}
            onPlan={planTrip}
            cardRefs={cardRefs}
            keeper={keeper}
          />
        ) : (
          <FindingTrips
            settings={settings}
            finder={finder}
            guide={guide}
            onBack={onBack}
            onWiden={onWiden}
            ui={ui}
            onOpen={openTrip}
            cardRefs={cardRefs}
            keeper={keeper}
          />
        )}
      </div>
      {open && (
        <TripPage
          trip={open}
          settings={settings}
          destinations={finder.data?.destinations}
          ui={ui}
          keepWith={keepWith}
          others={finder.trips ? all : []}
          onBack={closeTrip}
          onOpen={openTrip}
          onPlan={planTrip}
          onEdit={(next) => setEdits((e) => ({ ...e, [open.id]: next }))}
        />
      )}
    </>
  );
}
