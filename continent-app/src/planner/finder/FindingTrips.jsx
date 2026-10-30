import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import {
  BanIcon, BusIcon, CalendarIcon, CheckIcon, CompassIcon, FriendsIcon, HeartIcon, HomeIcon, MapPinIcon, PiggyIcon, PlaneIcon, RouteIcon, SunIcon,
} from '../../components/Icons.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { SheetHead } from '../flow/PlanStage.jsx';
import { useBcp47, useMonths, whenText } from '../flow/flowHooks.js';
import { useKeepTrip, useTripFinder } from './finderHooks.js';
import { answersLine, stageLines, tripName, tripPhotos, widenQuestion } from './finderText.js';
import { durationMs, prefersReducedMotion } from '../../lib/motion.js';
import { TripsForYou } from './TripsForYou.jsx';
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

/** The least time the search stands, from its first frame (owner, plan flow
 *  walk 2026-10-30: "at least 4 seconds ... all the requirements get
 *  placed"), and the beat "8 trips found" holds before the list. A run
 *  already done when the screen opens (back from a trip) skips both. */
const MIN_STAND_MS = 4000;
const FOUND_BEAT_MS = 700;
// The brief's lines share this span (the last lands near 3.1 s, "found"
// after it, the list at 4 s); a short brief keeps a calm step.
const BRIEF_SPAN_MS = 2800;
const BRIEF_MAX_STEP_MS = 420;

// One icon per answer in the brief, by the answer chip's id.
const BRIEF_ICONS = {
  place: MapPinIcon, from: HomeIcon, when: CalendarIcon, who: FriendsIcon, like: HeartIcon, shape: RouteIcon,
  weather: SunIcon, reach: PlaneIcon, around: BusIcon, avoid: BanIcon, budget: PiggyIcon, persona: CompassIcon,
};
// The stage of real work that applies each answer, so its tick is earned.
const BRIEF_STAGE = {
  from: 'flights', when: 'flights', reach: 'flights',
  who: 'stays', around: 'stays', budget: 'stays', avoid: 'stays',
  place: 'likes', like: 'likes', shape: 'likes', weather: 'likes', persona: 'likes',
};
const headOf = (chip) => chip.id.split(':')[0];

/**
 * Searching (T797, T867; rebuilt on the owner's plan flow walk): the
 * traveller's own answers assemble into the trip's brief, Carta's receipt
 * grammar: each answer lands as a line with its icon, one after another,
 * and takes a tick once the stage of real work that applies it is done
 * (flights for from and when, the stays for who and the budget, the
 * matching for the likes). Under a rule, one live line names the work in
 * hand and ends on "8 trips found". Above it the first trips the engine
 * prices fan in as their own photographs, the names under them. Nothing
 * loops; under reduced motion everything stands and the ticks still come.
 */
export function FindingTrips({ settings, finder, onBack, onWiden, guide, headEnd = null }) {
  const { t, lang } = useI18n();
  const months = useMonths();
  const bcp47 = useBcp47();
  const titleRef = useRef(null);
  const when = whenText(t, settings.when, months, bcp47);
  const lines = useMemo(
    () => stageLines(settings, { t, lang, when, data: finder.data, origin: finder.origin, stayTier: finder.stayTier }),
    [settings, finder.data, finder.origin, finder.stayTier, t, lang, when.start, when.end], // eslint-disable-line react-hooks/exhaustive-deps -- when is rebuilt each render from its parts
  );
  const brief = useMemo(
    () => answersLine(settings, { t, lang, originName: settings.from?.name || finder.origin?.name || '', when }).chips,
    [settings, finder.origin, t, lang, when.start, when.end], // eslint-disable-line react-hooks/exhaustive-deps -- when is rebuilt each render from its parts
  );
  const failed = finder.trips && finder.trips.length === 0;
  const kind = PARTY_TITLE[settings.party.kind] || 'solo';
  // The pace: the lines share BRIEF_SPAN_MS whatever their number, each
  // tick follows its own line, and "found" waits for the last line.
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const mountAt = useRef(Date.now());
  const step = reduced ? 0 : Math.round(Math.min(BRIEF_MAX_STEP_MS, BRIEF_SPAN_MS / Math.max(1, brief.length)));
  const arrive = (i) => (reduced ? 0 : i * step + durationMs('--dur-3'));
  const [placed, setPlaced] = useState(reduced);
  useEffect(() => {
    if (placed) return undefined;
    const id = setTimeout(() => setPlaced(true), Math.max(0, arrive(brief.length) - (Date.now() - mountAt.current)));
    return () => clearTimeout(id);
  }, [placed, brief.length]); // eslint-disable-line react-hooks/exhaustive-deps -- arrive reads the step of this render

  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, []);

  if (failed) {
    const q = widenQuestion(settings, guide);
    return (
      <div className="pf-step tff-load">
        <SheetHead onBack={onBack} backLabel={t('pf.back')} end={headEnd} />
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

  const found = finder.trips?.length || 0;
  const working = lines.find((l) => !finder.stages[l.key]);
  const stageKeys = new Set(lines.map((l) => l.key));
  // An answer is ticked when its stage is done; one whose stage this trip
  // does not run (no flights to check) waits for the whole search.
  const applied = (chip) => {
    const stage = BRIEF_STAGE[headOf(chip)];
    return stage && stageKeys.has(stage) ? Boolean(finder.stages[stage]) : found > 0;
  };
  const live = found && placed
    ? t(found === 1 ? 'tf.load.foundOne' : 'tf.load.foundN', { n: found })
    : (working || lines[lines.length - 1])?.text || '';
  const destinations = finder.data?.destinations;
  // Three trips with three different photographs (two trips may open in
  // the same town); their names under the fan, one comma apart, since a
  // trip's own name may hold an "and".
  // Each trip's lead photo first, then the trips' other places, until three.
  const shots = [];
  const urls = new Set();
  const found3 = finder.early?.length ? finder.early : finder.trips || [];
  for (const pass of [0, 1]) {
    for (const trip of found3) {
      const photos = tripPhotos(trip, destinations).filter((p) => p?.url);
      for (const photo of pass === 0 ? photos.slice(0, 1) : photos.slice(1)) {
        if (shots.length === 3 || urls.has(photo.url)) continue;
        urls.add(photo.url);
        shots.push({ trip, photo });
      }
    }
  }
  const names = [...new Set(shots.map((s) => tripName(s.trip, destinations, lang)).filter(Boolean))];
  const tickDelay = (i) => `${Math.max(0, arrive(i) - (Date.now() - mountAt.current))}ms`;
  return (
    <div className="pf-step tff-load">
      <SheetHead onBack={onBack} backLabel={t('pf.back')} end={headEnd} />
      <h2 className="pf-title" tabIndex={-1} ref={titleRef}>{t(`tf.load.title.${kind}`)}</h2>
      <div className="tff-brief-stage">
        <div className="tff-fan">
          <div className="tff-fan-deck" aria-hidden="true">
            {[0, 1, 2].map((i) => {
              const shot = shots[i];
              return (
                <span key={shot ? shot.photo.url : `slot${i}`} className={`tff-fan-card is-${i}${shot ? ' is-in' : ''}`}>
                  {shot && (
                    <HeroImage url={shot.photo.url} city={shot.photo.city || shot.trip.country} iso2={shot.photo.iso2 || shot.trip.iso2}
                      className="tff-fan-img" maxWidth={320} ratio={[4, 5]} />
                  )}
                </span>
              );
            })}
          </div>
          <p className="tff-fan-names">{names.length ? names.join(', ') : ' '}</p>
        </div>
        <section className="tff-brief" aria-labelledby="tff-brief-h" style={{ '--brief-step': `${step}ms` }}>
          <h3 className="tff-brief-h" id="tff-brief-h">{t('tf.load.brief')}</h3>
          <ul className="tff-brief-lines">
            {brief.map((chip, i) => {
              const Icon = BRIEF_ICONS[headOf(chip)] || CheckIcon;
              const on = applied(chip);
              return (
                <li key={chip.id} className={`tff-brief-line${on ? ' is-on' : ''}`} style={{ '--i': i }}>
                  <span className="tff-brief-icon" aria-hidden="true"><Icon size={18} /></span>
                  <span className="tff-brief-text">{chip.label}</span>
                  <span className="tff-brief-tick" aria-hidden="true" style={on ? { animationDelay: tickDelay(i) } : undefined}>
                    <CheckIcon size={14} />
                  </span>
                  {on && <span className="sr-only">{t('tf.load.done')}</span>}
                </li>
              );
            })}
          </ul>
          <p className={`tff-brief-live${found && placed ? ' is-found' : ''}`} style={{ '--i': 0 }} aria-live="polite">
            <span className="tff-brief-dot" aria-hidden="true">{found > 0 && placed && <CheckIcon size={12} />}</span>
            <span key={live} className="tff-brief-live-text">{live}</span>
          </p>
        </section>
      </div>
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
export default function TripFinderScreen({ ui, settings, guide, edits, setEdits, markedId = null, openId: arriveId = null, onBack, onWiden, onPlan, headEnd = null }) {
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
  const done = Boolean(finder.trips && finder.trips.length);
  // The search stands at least MIN_STAND_MS, then holds "8 trips found" for
  // FOUND_BEAT_MS (owner, plan flow walk). A run already done on arrival
  // (back from a trip, the memoised run) or a trip's own address skips it.
  const holdFrom = useRef(done || arriveId ? null : Date.now());
  const [released, setReleased] = useState(!holdFrom.current);
  useEffect(() => {
    if (released || !done) return undefined;
    const wait = Math.max(MIN_STAND_MS - (Date.now() - holdFrom.current), FOUND_BEAT_MS);
    const id = setTimeout(() => setReleased(true), wait);
    return () => clearTimeout(id);
  }, [done, released]);
  // A reopened question leaves this screen, so a new answer set mounts it
  // again and stands again.
  const ready = done && released;

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
            home={finder.origin}
            markedId={markedId}
            ui={ui}
            onBack={onBack}
            headEnd={headEnd}
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
            headEnd={headEnd}
            onWiden={onWiden}
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
