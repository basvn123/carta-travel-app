import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { plannerStore } from '../plannerStore.js';
import { Button, IconButton } from '../../components/ui/index.js';
import { ArrowRightIcon, HomeIcon, MapPinIcon, PlusIcon, SettingsIcon } from '../../components/Icons.jsx';
import { TripHead } from '../TripSummary.jsx';
import { partyText } from '../../lib/party.js';
import { PlanStage, SheetHead } from './PlanStage.jsx';
import { usePickTick, useStepIn } from './paintGuard.js';
import { QUESTIONS } from './questions.js';
import { QuestionBody } from './QuestionScreen.jsx';
import { FlowRail } from './FlowRail.jsx';
import { FlowSide, SideFold, usePersonaFit } from './FlowSide.jsx';
import { personaOf } from '../../lib/recommend/persona.js';
import { groupsOf, stepAnswer } from './stepText.js';
import { TripSettingsSheet } from './TripSettingsSheet.jsx';
import { selectionOfPlan } from '../../lib/plan/doors.js';
import { useBcp47, useMonths, useTripSettings, whenText } from './flowHooks.js';
import { GUIDE_SKIP, TRIPS_SCREEN, continueTo, landingOf, firstOpenGuide, guideQuestions, guideScreens, openGuideQuestions, prevScreen, progressOf } from './flowGraph.js';
import { takePlan } from '../../lib/recommend/keptStore.js';
import { clearQuickStart, peekQuickMode } from './quickStart.js';
import { recallPlace, rememberPlace } from './flowMemory.js';
import { tripsStore } from '../tripsStore.js';
import { RefineCard } from './RefineCard.jsx';
import { SaveStyleOffer, StyleSwitch } from './StyleBar.jsx';
import { AssumptionBar } from './AssumptionBar.jsx';
import NotYet from '../../components/NotYet.jsx';
import { AirlineMark } from '../../components/flights/Flights.jsx';
import { useAirlines, airlineName } from '../../lib/flights/useAirlines.js';

// The trip finder (TF2, T797): the loader and the priced trips behind
// question 7, with lib/recommend, in a chunk of their own.
const TripFinderScreen = lazy(() => import('../finder/FindingTrips.jsx'));
// T864: the flights first, in the same chunk as the finder (it runs its
// engine), so no preload is added.
const FlightFirstScreen = lazy(() => import('../finder/FindingTrips.jsx').then((m) => ({ default: m.FlightFirstScreen })));
// G12 L6: the place lander (a known place's priced found trip), same chunk.
const PlaceLander = lazy(() => import('../finder/FindingTrips.jsx').then((m) => ({ default: m.PlaceLander })));
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
 * starts, the nights planned and Start planning), then the help-me-choose
 * questions, the last of them how to plan (the whole trip: the trips for
 * you; the flights first: their screen), or a known place's found trip.
 * G12 L14: the planning engine (the old wizard's steps) is folded; a country
 * page's Plan a trip here reaches the place lander through openPlan.
 *
 *   onLand(selection)   T863 to T866: a trip a door made, straight onto the
 *                       trip page (the planner's loadFromWizard hand-over)
 */
export function TripFlow({ onLand = null }) {
  const { t, lang } = useI18n();
  const [settings, save] = useTripSettings();
  // T870: an address with a trip page on it (#tf=<id>) opens on the trips,
  // with that trip's page open (the hash is read here, not imported from the
  // finder's lazy chunk).
  const arriveTrip = useRef(readTripHash());
  // T1103 (G12): a trip made by the Plan opening's short setup opens on its
  // priced trips; the help-me-choose questions then refine them.
  // G12 §12: the mark's mode says where: 'ask' walks the questions the
  // style leaves open first, 'trips' (Show the trips now) opens on them.
  const [quickMode] = useState(peekQuickMode);
  const fresh = Boolean(quickMode);
  const asking = quickMode === 'ask';
  useEffect(() => { clearQuickStart(); }, []);
  // T1123 (G4): a reload (or a tab hop that remounts the planner) comes back
  // to the screen it left, the priced trips above all, instead of the trip's
  // empty home. Not over an address's trip page, a fresh short setup or a
  // country page's seed, which each say where to open.
  const [kept] = useState(() => (arriveTrip.current || fresh ? null
    : recallPlace('trip', tripsStore.getActiveId(), [...guideScreens(settings), 'ff', 'home', 'know'])));
  // The trip came from the short setup (now, or before the reload).
  const quick = useRef(fresh || Boolean(kept?.quick));
  const [walked, setWalked] = useState(kept ? Boolean(kept.walked) : (!fresh || asking));
  const [phase, setPhase] = useState(() => {
    if (arriveTrip.current) return TRIPS_SCREEN;
    if (fresh) return asking ? (firstOpenGuide(settings) || landingOf(settings)) : landingOf(settings);
    return kept?.phase || 'home';
  }); // home | g:* | ff | know
  // House style: the question settles in when the step changes (presentation only).
  const stepRef = useRef(null);
  useStepIn(stepRef, phase);
  usePickTick(stepRef);
  useEffect(() => {
    rememberPlace('trip', tripsStore.getActiveId(), { phase, walked, quick: quick.current });
  }, [phase, walked]);
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
    if (phase === 'home') return;
    rootRef.current?.querySelector('.pf-title')?.focus({ preventScroll: true });
    rootRef.current?.scrollIntoView?.({ block: 'start' });
  }, [phase]);

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

  // T806: a kept trip planned from My trips (keptStore holdPlan) opens the
  // planner on it, the same hand-off as the finder's "Plan this trip"
  // (T872: straight onto the trip page, no wizard).
  useEffect(() => {
    const plan = takePlan();
    if (!plan) return;
    setMarkedId(plan.tripId);
    landPlan(plan, 'guide');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- read once, on arrival

  const guide = useMemo(() => guideScreens(settings), [settings]);
  const questions = useMemo(() => guideQuestions(settings), [settings]);
  const months = useMonths();
  const bcp47 = useBcp47();
  // T893: from 1100 px a question stands between the step list and Your
  // trip so far (the studio); the trip's own answers lead the list, each
  // opening the trip settings.
  const studio = !!QUESTIONS[phase] && questions.includes(phase);
  const whenWords = whenText(t, settings.when, months, bcp47);
  const answerOf = (id) => stepAnswer(t, id, settings, { when: whenWords, locale: lang });
  const tripSteps = ['from', 'when', 'who'].map((id) => ({ id, label: t(`pf.step.${id}`), answer: answerOf(id), done: Boolean(answerOf(id)), onClick: () => setSettingsOpen(true) }));
  const firstOpen = questions.find((id) => !settings.answered.includes(id));
  const stepItems = (ids) => ids.map((id) => {
    const done = settings.answered.includes(id);
    return {
      id,
      n: questions.indexOf(id) + 1,
      label: t(`pf.step.${id}`),
      answer: done ? answerOf(id) : '',
      done,
      now: id === phase,
      onClick: id !== phase && (done || id === firstOpen) ? () => { setReturnTo(null); setPhase(id); } : null,
    };
  });
  // T894: Your trip so far counts the places that fit the trip's personas
  // (derived from its answers since the persona question left, G12).
  const fit = usePersonaFit(personaOf(settings.guide));
  const sideRows = [...tripSteps, ...stepItems(questions)];
  const side = studio ? <FlowSide rows={sideRows} fit={fit} /> : null;
  const foldSummary = fit ? t('pf.side.chip', { n: fit.count }) : [settings.from?.name, whenWords.start].filter(Boolean).join(', ');
  const rail = studio ? (
    <FlowRail
      label={t('pf.groups')}
      groups={[
        { key: 'trip', label: t('pf.group.trip'), items: tripSteps },
        ...groupsOf(questions).map((g) => ({ key: g.key, label: t(`pf.group.${g.key}`), items: stepItems(g.ids) })),
      ]}
    />
  ) : null;
  const afterGuide = (id, s) => {
    if (returnTo) { setReturnTo(null); setPhase(returnTo); return; }
    // How do you want to plan: the flights first opens their screen.
    if (id === 'g:how') { setPhase(s.door === 'flight' ? 'ff' : landingOf(s)); return; }
    // Skip what the Tell sentence or the travel style answered (never the trips).
    const k = continueTo(guideScreens(s), id, s, TRIPS_SCREEN, GUIDE_SKIP);
    // G12 L6: a known place lands on its found trip, not the list.
    setPhase(!k || k === TRIPS_SCREEN ? landingOf(s) : k);
  };
  /** Reopen one question from the trips, and come back to them after it. */
  const reopen = (id) => { setReturnTo(TRIPS_SCREEN); setFinderEdits({}); setMarkedId(null); setPhase(id); };
  // Owner, plan flow walk 2026-10-30: the four doors repeated what the Plan
  // opening already asked, so Start planning goes straight into the
  // help-me-choose questions; the last of them (g:how) asks whole trip or
  // flights first.
  const start = () => { setWalked(true); setReturnTo(null); setPhase(firstOpenGuide(settings) || guide[0]); };

  const bar = (
    <IconButton ref={gearRef} tone="surface" label={t('pf.settings')} onClick={() => setSettingsOpen(true)} className="pf-round">
      <SettingsIcon size={18} />
    </IconButton>
  );
  // Every step carries the gear in its own head, level with the back
  // control (owner, plan flow walk), instead of a bar floating above it.
  const inHead = !!QUESTIONS[phase] || phase === 'ff' || phase === TRIPS_SCREEN || phase === 'know';

  let body;
  if (phase === 'home') {
    // T1123 (G4): after the short setup the trip's next step is its priced
    // trips, not the ten questions in front of them (Back from the trips
    // lands here, and Start planning used to walk them all again).
    const toTrips = quick.current && !walked;
    body = (
      <TripHome
        settings={settings}
        onStart={toTrips ? () => setPhase(landingOf(settings)) : start}
        startLabel={toTrips ? t('pf.home.seeTrips') : ''}
        actions={bar}
      />
    );
  } else if (phase === 'ff') {
    body = (
      <Suspense fallback={<div className="pf-step" aria-busy="true"><span className="sr-only">{t('state.loading')}</span></div>}>
        <FlightFirstScreen
          ui={FINDER_UI}
          settings={settings}
          onBack={() => setPhase('g:how')}
          headEnd={bar}
          onChange={() => setSettingsOpen(true)}
          onPick={(plan) => landPlan(plan, 'flight')}
        />
      </Suspense>
    );
  } else if (phase === 'know') {
    // G12 L6: a known place's priced found trip; its back opens every trip.
    body = (
      <Suspense fallback={<div className="pf-step" aria-busy="true"><span className="sr-only">{t('state.loading')}</span></div>}>
        <PlaceLander
          ui={FINDER_UI}
          settings={settings}
          bar={<AssumptionBar settings={settings} save={save} onMore={() => setSettingsOpen(true)} />}
          onBack={() => setPhase(walked && questions.length ? questions[questions.length - 1] : 'home')}
          onList={() => setPhase(TRIPS_SCREEN)}
          onLand={(plan) => { setMarkedId(plan.tripId); landPlan(plan, 'know'); }}
        />
      </Suspense>
    );
  } else if (phase === TRIPS_SCREEN) {
    body = (
      <Suspense fallback={<div className="pf-step" aria-busy="true"><span className="sr-only">{t('state.loading')}</span></div>}>
        <TripFinderScreen
          ui={FINDER_UI}
          settings={settings}
          guide={questions}
          // T1103: straight from the short setup there is no question
          // behind the trips yet; back is the trip's own page.
          onBack={() => setPhase(walked ? questions[questions.length - 1] : 'home')}
          // G12 §12: with no travel style, Save as travel style after the first result.
          // G12 §3.3: the shared assumption bar on the list and the found trip.
          bar={<AssumptionBar settings={settings} save={save} onMore={() => setSettingsOpen(true)} />}
          refine={(<><AssumptionBar settings={settings} save={save} onMore={() => setSettingsOpen(true)} />{walked ? null : <RefineCard count={openGuideQuestions(settings).length || questions.length} onFit={start} onSleep={() => reopen('sleep')} />}<SaveStyleOffer settings={settings} /></>)}
          headEnd={bar}
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
    // T1103: the refine walk began on the trips, so its first question goes back there.
    const back = returnTo || prevScreen(guide, phase) || (quick.current ? TRIPS_SCREEN : 'home');
    body = (
      <div className="pf-step" ref={stepRef}>
        <SheetHead
          onBack={() => { setReturnTo(null); setPhase(back); }}
          backLabel={t('pf.back')}
          position={pos.index >= 0 && questions.includes(phase) ? t('pf.position', { x: pos.index + 1, n: questions.length }) : ''}
          marks={questions.includes(phase) ? questions.map((id) => ({ key: id, now: id === phase, done: settings.answered.includes(id) })) : null}
          end={bar}
        />
        {studio && (
          <SideFold summary={foldSummary}>
            <FlowSide rows={sideRows} fit={fit} heading={false} />
          </SideFold>
        )}
        {/* G12: the trip's style, switchable for this trip, on every step. */}
        <StyleSwitch settings={settings} save={save} />
        <h2 className="pf-title" tabIndex={-1}>{q ? t(q.titleKey) : ''}</h2>
        <QuestionBody id={phase} settings={settings} commit={(s) => { save(s); afterGuide(phase, s); }} />
        {/* G12 §12: a quiet way past the rest of the questions. */}
        {questions.includes(phase) && (
          <Button variant="quiet" size="sm" className="pf-show-now" onClick={() => { setReturnTo(null); setWalked(true); setPhase(landingOf(settings)); }}>
            {t('pf.showNow')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={`pf${phase === 'home' ? ' is-trip' : ''}`} ref={rootRef}>
      <PlanStage bar={phase === 'home' || inHead ? null : bar} rail={rail} side={side} sheetLabel={settings.trip.name || t('pf.sheet')} wide={phase === 'g:likes' || phase === TRIPS_SCREEN || phase === 'ff' || phase === 'know'}>
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
function TripHome({ settings, onStart, startLabel = '', actions = null }) {
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
        {startLabel
          ? <Button variant="primary" block iconEnd={<ArrowRightIcon size={18} />} onClick={onStart}>{startLabel}</Button>
          : <Button variant="primary" block iconStart={<PlusIcon size={18} />} onClick={onStart}>{t('pf.home.plan')}</Button>}
      </div>
    </div>
  );
}
