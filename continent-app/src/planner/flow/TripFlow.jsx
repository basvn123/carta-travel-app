import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { plannerStore } from '../plannerStore.js';
import { Button, ChoiceRows, IconButton } from '../../components/ui/index.js';
import { HomeIcon, PlusIcon, SettingsIcon } from '../../components/Icons.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { PlanStage, SheetHead } from './PlanStage.jsx';
import { QUESTIONS } from './questions.js';
import { QuestionBody } from './QuestionScreen.jsx';
import { TripSettingsSheet } from './TripSettingsSheet.jsx';
import { useBcp47, useMonths, useTripSettings, whenText } from './flowHooks.js';
import { engineScreens, guideScreens, hasDoors, nextScreen, prevScreen, progressOf } from './flowGraph.js';
import { quizAnswers, spendFor } from './tripSettings.js';

/**
 * TripFlow (T656), the trip planner before a route exists: the trip's own
 * page after the Polarsteps trip view (the map on top, the sheet with when it
 * starts, the nights planned and Start planning), then how the traveller
 * wants to choose where (the doors), the help-me-choose questions behind
 * "Guide me", and then the planning engine itself, the wizard's planning
 * steps, rendered by the caller through `renderEngine`.
 *
 *   renderEngine({ flowSteps, initialWhereTab, onCancel })
 *      the caller's GuidedTripWizard mount with those props
 */
export function TripFlow({ renderEngine }) {
  const { t } = useI18n();
  const [settings, save] = useTripSettings();
  const [phase, setPhase] = useState('home'); // home | doors | g:* | engine
  const [door, setDoor] = useState('guide');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const gearRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (phase === 'home' || phase === 'engine') return;
    rootRef.current?.querySelector('.pf-title')?.focus({ preventScroll: true });
    rootRef.current?.scrollIntoView?.({ block: 'start' });
  }, [phase]);

  /** Hand over to the engine: its first step by name, the build mode the
   *  door implies, and (behind Guide me) the quiz answered from the guide, so
   *  its Where step opens on the matches. */
  const startEngine = (d = door) => {
    const steps = engineScreens(settings, hasDoors(settings) ? d : 'know').map((x) => x.slice(2));
    const wizard = { stepName: steps[0], step: 1, buildMode: d === 'ready' ? 'ready' : 'custom' };
    if (d === 'guide') wizard.quiz = { ...quizAnswers(settings, spendFor(settings)), editing: '' };
    // A flight read from an uploaded booking brings its price: the way there
    // and home start as the traveller's own figures, never overwriting one
    // they typed (T657).
    const tv = { ...(plannerStore.getState().wizard?.travelValues || {}) };
    for (const b of settings.imports) {
      const key = b.kind === 'flight_home' ? 'back' : (b.kind === 'flight_out' || b.kind === 'flight' ? 'out' : '');
      if (key && b.eur > 0 && !tv[key]?.eur) tv[key] = { mode: 'fly', service: b.title || b.code || '', eur: String(b.eur) };
    }
    // "No flying" makes the train the way there and home until the traveller
    // picks another; they type what it cost (Carta has no train fares yet).
    if (settings.guide.reach === 'overland') {
      for (const key of ['out', 'back']) if (!tv[key]?.mode) tv[key] = { ...(tv[key] || {}), mode: 'train' };
    }
    if (Object.keys(tv).length) wizard.travelValues = tv;
    plannerStore.setWizard(wizard);
    setPhase('engine');
  };
  const guide = useMemo(() => guideScreens(settings), [settings]);
  const afterGuide = (id, s) => {
    let k = nextScreen(guide, id);
    // Skip what the free field already answered.
    while (k && s.answered.includes(k)) k = nextScreen(guide, k);
    if (k) setPhase(k); else startEngine('guide');
  };
  const start = () => (hasDoors(settings) ? setPhase('doors') : startEngine('know'));

  if (phase === 'engine') {
    const d = hasDoors(settings) ? door : 'know';
    return renderEngine({
      flowSteps: engineScreens(settings, d).map((x) => x.slice(2)),
      initialWhereTab: d === 'guide' ? 'help' : 'hand',
      onCancel: () => setPhase(d === 'guide' ? guide[guide.length - 1] : (hasDoors(settings) ? 'doors' : 'home')),
    });
  }

  const bar = (
    <IconButton ref={gearRef} tone="surface" label={t('pf.settings')} onClick={() => setSettingsOpen(true)}>
      <SettingsIcon size={20} />
    </IconButton>
  );

  let body;
  if (phase === 'home') {
    body = <TripHome settings={settings} onStart={start} />;
  } else if (phase === 'doors') {
    body = (
      <div className="pf-step">
        <SheetHead onBack={() => setPhase('home')} backLabel={t('pf.back')} />
        <h2 className="pf-title" tabIndex={-1}>{t('pf.doors.title')}</h2>
        <p className="pf-help">{t('pf.doors.help')}</p>
        <ChoiceRows
          label={t('pf.doors.title')}
          options={[
            { value: 'guide', icon: 'CompassIcon', label: t('pf.doors.guide'), sub: t(settings.booked.flights ? 'pf.doors.guideFlightSub' : 'pf.doors.guideSub') },
            { value: 'know', icon: 'MapPinIcon', label: t('pf.doors.know'), sub: t('pf.doors.knowSub') },
            { value: 'ready', icon: 'RouteIcon', label: t('pf.doors.ready'), sub: t('pf.doors.readySub') },
          ]}
          value={[door]}
          onPick={setDoor}
        />
        <div className="pf-foot">
          <Button variant="primary" block onClick={() => (door === 'guide' ? setPhase(guide[0]) : startEngine(door))}>
            {t('pf.continue')}
          </Button>
        </div>
      </div>
    );
  } else {
    const q = QUESTIONS[phase];
    const pos = progressOf(guide, phase);
    body = (
      <div className="pf-step">
        <SheetHead
          onBack={() => setPhase(prevScreen(guide, phase) || 'doors')}
          backLabel={t('pf.back')}
          position={t('pf.position', { x: pos.index + 1, n: guide.length })}
        />
        <h2 className="pf-title" tabIndex={-1}>{q ? t(q.titleKey) : ''}</h2>
        <QuestionBody id={phase} settings={settings} commit={(s) => { save(s); afterGuide(phase, s); }} />
      </div>
    );
  }

  return (
    <div className="pf" ref={rootRef}>
      <PlanStage bar={bar} sheetLabel={settings.trip.name || t('pf.sheet')} wide={phase === 'g:likes'}>
        {body}
      </PlanStage>
      {settingsOpen && <TripSettingsSheet anchorRef={gearRef} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

/**
 * The trip's page with no route yet (after the Polarsteps trip view): the
 * trip's name, when it starts, how many of its nights are planned, three
 * empty rows where the stops will be, and Start planning.
 */
function TripHome({ settings, onStart }) {
  const { t } = useI18n();
  const months = useMonths();
  const bcp47 = useBcp47();
  const w = whenText(t, settings.when, months, bcp47);
  const nights = settings.when.mode === 'exact' && settings.when.start && settings.when.end
    ? Math.max(1, Math.round((new Date(`${settings.when.end}T12:00:00`) - new Date(`${settings.when.start}T12:00:00`)) / 86400000))
    : settings.when.nights;
  return (
    <div className="pf-home">
      {settings.trip.cover && (
        <HeroImage url={settings.trip.cover} city={settings.trip.name} className="pf-home-cover" ratio={[16, 9]} maxWidth={720} />
      )}
      <h1 className="pf-title pf-home-name" tabIndex={-1}>{settings.trip.name || t('pf.create.defaultName')}</h1>
      <div className="pf-home-start">
        <span className="pf-home-dot" aria-hidden="true"><HomeIcon size={18} /></span>
        <span className="pf-home-when">
          <span className="pf-home-label">{t('pf.home.starts')}</span>
          <span className="pf-home-date">{w.start || t('pf.when.unsure')}</span>
        </span>
        <span className="pf-home-nights">{t('pf.home.nightsPlanned', { x: 0, n: nights })}</span>
      </div>
      <ul className="pf-home-empty" aria-hidden="true">
        <li><span /><span /></li>
        <li><span /><span /></li>
        <li><span /><span /></li>
      </ul>
      <div className="pf-foot">
        <Button variant="primary" block iconStart={<PlusIcon size={18} />} onClick={onStart}>{t('pf.home.plan')}</Button>
      </div>
    </div>
  );
}
