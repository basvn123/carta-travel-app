import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { plannerStore } from '../plannerStore.js';
import { Button, IconButton, Tile, TileGroup } from '../../components/ui/index.js';
import { HomeIcon, MapPinIcon, PlaneIcon, PlusIcon, RouteIcon, SettingsIcon, TicketIcon } from '../../components/Icons.jsx';
import { TripHead } from '../TripSummary.jsx';
import { partyText } from '../../lib/party.js';
import { PlanStage, SheetHead } from './PlanStage.jsx';
import { QUESTIONS } from './questions.js';
import { QuestionBody } from './QuestionScreen.jsx';
import { TripSettingsSheet } from './TripSettingsSheet.jsx';
import { CartaTrips } from './CartaTrips.jsx';
import { KnowDoor } from './KnowDoor.jsx';
import { BookedDoor } from './BookedDoor.jsx';
import { bookedTrip, selectionOfPlan, suggestDoor } from '../../lib/plan/doors.js';
import { useFirstRun } from '../../lib/firstRunContext.js';
import { useBcp47, useMonths, useTripSettings, whenText } from './flowHooks.js';
import { TRIPS_SCREEN, engineScreens, guideQuestions, guideScreens, hasDoors, nextScreen, prevScreen, progressOf } from './flowGraph.js';
import { normalizeSettings, quizAnswers, spendFor } from './tripSettings.js';
import { takePlan } from '../../lib/recommend/keptStore.js';
import NotYet from '../../components/NotYet.jsx';
import { AirlineMark } from '../../components/flights/Flights.jsx';
import { useAirlines, airlineName } from '../../lib/flights/useAirlines.js';

// The trip finder (TF2, T797): the loader and the priced trips behind
// question 7, with lib/recommend, in a chunk of their own.
const TripFinderScreen = lazy(() => import('../finder/FindingTrips.jsx'));
// T864, T865: Find my flight first and I know where's route, in the same
// chunk as the finder (they run its engine), so no preload is added.
const FlightFirstScreen = lazy(() => import('../finder/FindingTrips.jsx').then((m) => ({ default: m.FlightFirstScreen })));
const KnowBuildScreen = lazy(() => import('../finder/FindingTrips.jsx').then((m) => ({ default: m.KnowBuildScreen })));
/** The trip page's id in the address (#tf=<id>, the finder's TRIP_HASH), or null. */
function readTripHash() {
  try {
    const h = typeof window !== 'undefined' ? window.location.hash || '' : '';
    return h.startsWith('#tf=') ? decodeURIComponent(h.slice(4)) || null : null;
  } catch { return null; }
}
// The app parts the finder draws, handed down so its lazy chunk does not
// import them (see FindingTrips).
const FINDER_UI = { NotYet, AirlineMark, useAirlines, airlineName };

/**
 * TripFlow (T656), the trip planner before a route exists: the trip's own
 * page after the Polarsteps trip view (the map on top, the sheet with when it
 * starts, the nights planned and Start planning), then how the traveller
 * wants to choose where (the doors), the help-me-choose questions behind
 * "Guide me", and then the planning engine itself, the wizard's planning
 * steps, rendered by the caller through `renderEngine`.
 *
 *   renderEngine({ flowSteps, initialWhereTab, lockWhereTab, onCancel })
 *      the caller's GuidedTripWizard mount with those props
 *   onOpenJourney(id)   one of Carta's own trips, its whole week (T752)
 *   onLand(selection)   T863 to T866: a trip a door made, straight onto the
 *                       trip page (the planner's loadFromWizard hand-over)
 */
export function TripFlow({ renderEngine, seed = null, onOpenJourney = null, onLand = null }) {
  const { t } = useI18n();
  const ctx = useFirstRun();
  const [settings, save] = useTripSettings();
  // T870: an address with a trip page on it (#tf=<id>) opens on the trips,
  // with that trip's page open (the hash is read here, not imported from the
  // finder's lazy chunk).
  const arriveTrip = useRef(readTripHash());
  const [phase, setPhase] = useState(() => (arriveTrip.current ? TRIPS_SCREEN : 'home')); // home | doors | carta | g:* | ff | kw | kw:build | bk | engine
  const [door, setDoor] = useState(() => suggestDoor(settings));
  const [settingsOpen, setSettingsOpen] = useState(false);
  // A question reopened from the trips' answers bar (T798) comes straight
  // back to the trips on Continue, not through the questions after it.
  const [returnTo, setReturnTo] = useState(null);
  // The trip finder's own state across a visit to the planner (T801): the
  // receipt's swaps by trip id, and the trip the traveller planned, marked
  // when they come back.
  const [finderEdits, setFinderEdits] = useState({});
  const [markedId, setMarkedId] = useState(null);
  const gearRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (phase === 'home' || phase === 'engine') return;
    rootRef.current?.querySelector('.pf-title')?.focus({ preventScroll: true });
    rootRef.current?.scrollIntoView?.({ block: 'start' });
  }, [phase]);

  /** Hand over to the engine: its first step by name, the build mode the
   *  door implies, and (behind Guide me) the quiz answered from the guide, so
   *  its Where step opens on the matches. T872: only the paths with no
   *  picked trip reach it now (a country page's Plan a trip here); a picked
   *  trip lands on the trip page. */
  const startEngine = (d = door, s = settings) => {
    const steps = engineScreens(s, hasDoors(s) ? d : 'know').map((x) => x.slice(2));
    const wizard = { stepName: steps[0], step: 1, buildMode: d === 'ready' ? 'ready' : 'custom', finder: null };
    if (d === 'guide') wizard.quiz = { ...quizAnswers(s, spendFor(s)), editing: '' };
    // A flight read from an uploaded booking brings its price: the way there
    // and home start as the traveller's own figures, never overwriting one
    // they typed (T657).
    const tv = { ...(plannerStore.getState().wizard?.travelValues || {}) };
    for (const b of s.imports) {
      const key = b.kind === 'flight_home' ? 'back' : (b.kind === 'flight_out' || b.kind === 'flight' ? 'out' : '');
      if (key && b.eur > 0 && !tv[key]?.eur) tv[key] = { mode: 'fly', service: b.title || b.code || '', eur: String(b.eur) };
    }
    // "No flying" makes the train the way there and home until the traveller
    // picks another; they type what it cost (Carta has no train fares yet).
    if (s.guide.reach === 'overland') {
      for (const key of ['out', 'back']) if (!tv[key]?.mode) tv[key] = { ...(tv[key] || {}), mode: 'train' };
    }
    if (Object.keys(tv).length) wizard.travelValues = tv;
    plannerStore.setWizard(wizard);
    setPhase('engine');
  };
  /** T863 to T866: a door's trip onto the trip page, the door kept on the
   *  trip and the dates and party set as the planner reads them. */
  const land = (selection, d, s = settings) => {
    if (!selection) return;
    save({ ...s, door: d });
    const nights = selection.stops.reduce((n, x) => n + x.nights, 0);
    const end = selection.startDate
      ? new Date(Date.parse(`${selection.startDate}T12:00:00Z`) + nights * 86400000).toISOString().slice(0, 10)
      : '';
    if (selection.startDate) plannerStore.setTravelDates({ startDate: selection.startDate, endDate: end });
    plannerStore.setTravelers({ adults: selection.groupSize, children: selection.children, babies: selection.babies });
    onLand?.(selection);
  };
  const landPlan = (plan, d) => land(selectionOfPlan(plan, { label: settings.trip.name || '' }), d);

  // T675 (row T656-d): "Plan a trip here" is the I know where door with the
  // country picked; the engine lands on its Where. Booked stays switch off,
  // as they did in the old wizard: that path has no Where to land on.
  useEffect(() => {
    if (!seed?.iso2) return;
    const next = { ...settings, booked: { ...settings.booked, stays: false } };
    if (settings.booked.stays) save(next);
    setDoor('know');
    startEngine('know', normalizeSettings(next));
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot hand-off per seed; the wizard consumes it and clears it

  // T806: a kept trip planned from My trips (keptStore holdPlan) opens the
  // planner on it, the same hand-off as the finder's "Plan this trip"
  // (T872: straight onto the trip page, no wizard).
  useEffect(() => {
    const plan = takePlan();
    if (!plan) return;
    setDoor('guide');
    setMarkedId(plan.tripId);
    landPlan(plan, 'guide');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- read once, on arrival

  const guide = useMemo(() => guideScreens(settings), [settings]);
  const questions = useMemo(() => guideQuestions(settings), [settings]);
  const afterGuide = (id, s) => {
    if (returnTo) { setReturnTo(null); setPhase(returnTo); return; }
    let k = nextScreen(guide, id);
    // Skip what the free field already answered (never the trips).
    while (k && k !== TRIPS_SCREEN && s.answered.includes(k)) k = nextScreen(guide, k);
    if (k) setPhase(k); else setPhase(TRIPS_SCREEN);
  };
  /** Reopen one question from the trips, and come back to them after it. */
  const reopen = (id) => { setReturnTo(TRIPS_SCREEN); setFinderEdits({}); setMarkedId(null); setPhase(id); };
  // T863: the doors always show; the words (and what is booked) preselect one.
  const start = () => { setDoor(suggestDoor(settings)); setPhase('doors'); };

  if (phase === 'engine') {
    const d = hasDoors(settings) ? door : 'know';
    return renderEngine({
      flowSteps: engineScreens(settings, d).map((x) => x.slice(2)),
      initialWhereTab: d === 'guide' ? 'help' : 'hand',
      // "I know where" is the picker alone (T752): no Help me choose tab.
      lockWhereTab: d === 'know',
      // Behind Guide me the step before the planner is Trips for you (T801).
      onCancel: () => setPhase(d === 'guide' ? TRIPS_SCREEN : 'doors'),
    });
  }

  const bar = (
    <IconButton ref={gearRef} tone="surface" label={t('pf.settings')} onClick={() => setSettingsOpen(true)}>
      <SettingsIcon size={20} />
    </IconButton>
  );

  // Carta's own trips (T752): the same page the Plan opening opens, a full
  // page rather than a step on the card. T863: no longer a door of its own
  // (the four doors are how much Carta plans); a quiet link under them.
  if (phase === 'carta') {
    return (
      <div className="pf is-carta" ref={rootRef}>
        <CartaTrips titleTag="h2" onBack={() => setPhase('doors')} onOpenJourney={(id) => onOpenJourney?.(id)} />
      </div>
    );
  }

  let body;
  if (phase === 'home') {
    body = <TripHome settings={settings} onStart={start} actions={bar} />;
  } else if (phase === 'doors') {
    // T863 (owner: "more modern, icons, no subtext; each title clear on its
    // own"): four large tiles, one line icon and one title each.
    const doors = [
      { value: 'guide', icon: <RouteIcon size={24} /> },
      { value: 'flight', icon: <PlaneIcon size={24} /> },
      { value: 'know', icon: <MapPinIcon size={24} /> },
      { value: 'booked', icon: <TicketIcon size={24} /> },
    ];
    const go = () => {
      save({ ...settings, door });
      if (door === 'guide') setPhase(guide[0]);
      else if (door === 'flight') setPhase('ff');
      else if (door === 'know') setPhase('kw');
      else setPhase('bk');
    };
    body = (
      <div className="pf-step">
        <SheetHead onBack={() => setPhase('home')} backLabel={t('pf.back')} />
        <h2 className="pf-title" tabIndex={-1}>{t('pf.doors.title')}</h2>
        <TileGroup label={t('pf.doors.title')} kind="choice" columns={2} className="pf-doors">
          {doors.map(({ value, icon }) => (
            <Tile key={value} kind="choice" className="pf-door" data-door={value} selected={door === value}
              icon={icon} onClick={() => setDoor(value)}>
              {t(`pf.doors.${value}`)}
            </Tile>
          ))}
        </TileGroup>
        <div className="pf-foot">
          <Button variant="primary" block onClick={go}>{t('pf.continue')}</Button>
          <Button variant="quiet" size="sm" className="pf-doors-carta" onClick={() => setPhase('carta')}>{t('pf.carta.title')}</Button>
        </div>
      </div>
    );
  } else if (phase === 'ff' || phase === 'kw:build') {
    const loading = <div className="pf-step" aria-busy="true"><span className="sr-only">{t('state.loading')}</span></div>;
    body = (
      <Suspense fallback={loading}>
        {phase === 'ff' ? (
          <FlightFirstScreen
            ui={FINDER_UI}
            settings={settings}
            onBack={() => setPhase('doors')}
            onChange={() => setSettingsOpen(true)}
            onPick={(plan) => landPlan(plan, 'flight')}
          />
        ) : (
          <KnowBuildScreen settings={settings} onBack={() => setPhase('kw')} onLand={(plan) => landPlan(plan, 'know')} />
        )}
      </Suspense>
    );
  } else if (phase === 'kw') {
    body = (
      <KnowDoor
        settings={settings}
        onBack={() => setPhase('doors')}
        onGo={(places) => {
          // The places are the trip's named places (the finder's pool, T859)
          // and the Where step's countries, as Tell Carta's words set them.
          save({ ...settings, places, door: 'know' });
          plannerStore.setWizard({ countries: [...new Set(places.map((p) => p.country).filter(Boolean))].slice(0, 3) });
          setPhase('kw:build');
        }}
      />
    );
  } else if (phase === 'bk') {
    body = (
      <BookedDoor
        settings={settings}
        save={save}
        onBack={() => setPhase('doors')}
        onGo={(s) => {
          const made = bookedTrip(s, ctx?.data?.destinations || {}, { label: s.trip.name || '' });
          if (made) land(made.selection, 'booked', s);
        }}
      />
    );
  } else if (phase === TRIPS_SCREEN) {
    body = (
      <Suspense fallback={<div className="pf-step" aria-busy="true"><span className="sr-only">{t('state.loading')}</span></div>}>
        <TripFinderScreen
          ui={FINDER_UI}
          settings={settings}
          guide={questions}
          onBack={() => setPhase(questions[questions.length - 1])}
          onWiden={reopen}
          edits={finderEdits}
          setEdits={setFinderEdits}
          markedId={markedId}
          openId={arriveTrip.current}
          // T872 (owner: "Retire the wizard after a pick", Go): Plan this
          // trip lands on the trip page, as every other door does.
          onPlan={(plan) => { arriveTrip.current = null; setMarkedId(plan.tripId); landPlan(plan, 'guide'); }}
        />
      </Suspense>
    );
  } else {
    const q = QUESTIONS[phase];
    const pos = progressOf(questions, phase);
    const back = returnTo || prevScreen(guide, phase) || 'doors';
    body = (
      <div className="pf-step">
        <SheetHead
          onBack={() => { setReturnTo(null); setPhase(back); }}
          backLabel={t('pf.back')}
          position={pos.index >= 0 && questions.includes(phase) ? t('pf.position', { x: pos.index + 1, n: questions.length }) : ''}
          marks={questions.includes(phase) ? questions.map((id) => ({ key: id, now: id === phase, done: settings.answered.includes(id) })) : null}
        />
        <h2 className="pf-title" tabIndex={-1}>{q ? t(q.titleKey) : ''}</h2>
        <QuestionBody id={phase} settings={settings} commit={(s) => { save(s); afterGuide(phase, s); }} />
      </div>
    );
  }

  return (
    <div className={`pf${phase === 'home' ? ' is-trip' : ''}`} ref={rootRef}>
      <PlanStage bar={phase === 'home' ? null : bar} sheetLabel={settings.trip.name || t('pf.sheet')} wide={phase === 'g:likes' || phase === TRIPS_SCREEN || phase === 'ff'}>
        {body}
      </PlanStage>
      {settingsOpen && <TripSettingsSheet anchorRef={gearRef} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

/**
 * The trip's page with no route yet (after the Polarsteps trip view): the
 * trip's head (T814: the same head as the planned trip's summary, so both
 * read as one trip page: the photo, the name, the dates with a calendar,
 * the people), then where it starts, how many of its nights are planned,
 * one dashed slot where the first stop will go (T751: three grey rows read
 * as a page still loading), and Start planning.
 */
function TripHome({ settings, onStart, actions = null }) {
  const { t } = useI18n();
  const months = useMonths();
  const bcp47 = useBcp47();
  const w = whenText(t, settings.when, months, bcp47);
  const nights = settings.when.mode === 'exact' && settings.when.start && settings.when.end
    ? Math.max(1, Math.round((new Date(`${settings.when.end}T12:00:00`) - new Date(`${settings.when.start}T12:00:00`)) / 86400000))
    : settings.when.nights;
  const p = settings.party;
  const dates = w.start && w.end ? t('plan.dateRange', { a: w.start, b: w.end }) : w.start;
  return (
    <div className="pf-home">
      <TripHead
        name={settings.trip.name || t('pf.create.defaultName')}
        photos={settings.trip.cover ? [{ url: settings.trip.cover, city: settings.trip.name }] : []}
        dates={dates}
        people={partyText(t, { adults: p.adults, children: p.kids, babies: p.babies })}
        actions={actions}
      />
      <div className="pf-home-start">
        <span className="pf-home-dot" aria-hidden="true"><HomeIcon size={18} /></span>
        <span className="pf-home-when">
          <span className="pf-home-label">{settings.from?.name || t('pf.home.starts')}</span>
          <span className="pf-home-date">{w.start || t('pf.when.unsure')}</span>
        </span>
        <span className="pf-home-nights">{t('pf.home.nightsPlanned', { x: 0, n: nights })}</span>
      </div>
      <div className="pf-home-slot">
        <span className="pf-home-slot-icon" aria-hidden="true"><MapPinIcon size={18} /></span>
        <span className="pf-home-slot-text">
          <span className="pf-home-slot-title">{t('pf.home.noStops')}</span>
          <span className="pf-home-slot-sub">{t('pf.home.noStopsSub')}</span>
        </span>
      </div>
      <div className="pf-foot">
        <Button variant="primary" block iconStart={<PlusIcon size={18} />} onClick={onStart}>{t('pf.home.plan')}</Button>
      </div>
    </div>
  );
}
