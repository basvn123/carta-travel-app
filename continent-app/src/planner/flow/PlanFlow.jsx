import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../../styles/planners.css';
import { useI18n } from '../../i18n/index.jsx';
import { tabHref } from '../../lib/urlState.js';
import { loadTripDraft } from '../tripDraftStore.js';
import Logo from '../../components/Logo.jsx';
import { Button, ChoiceRows, IconButton } from '../../components/ui/index.js';
import { ChevronRightIcon, ClockIcon, SettingsIcon } from '../../components/Icons.jsx';
import { PlanStage, SheetHead } from './PlanStage.jsx';
import { QUESTIONS } from './questions.js';
import { setupScreens, nextScreen, prevScreen, progressOf } from './flowGraph.js';
import { QuestionBody } from './QuestionScreen.jsx';
import { useTripSettings } from './flowHooks.js';
import { CreateScreen } from './setupScreens.jsx';
import { TripSettingsSheet } from './TripSettingsSheet.jsx';

/** A plain click stays in the app; a modified click opens the address. */
function door(go) {
  return (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go();
  };
}

/**
 * PlanFlow (T654, T655), the Plan place with nothing open yet: the opening
 * screen (after Mindtrip's assistant), the "what do you want to plan?" sheet
 * (after Polarsteps), the setup questions of a new trip, one per screen on
 * the same sheet, and Create trip. Replaces PlanStart.
 *
 *   onNavigate(view)   'trip' | 'day' | 'trips'  (App's goTo)
 *   onCreated()        the trip exists: open it in the trip planner
 *   onAddPast()        My trips' past-trip form (T659)
 */
export function PlanFlow({ onNavigate, onCreated, onAddPast = null, pageOver = false }) {
  const { t } = useI18n();
  const [settings, save] = useTripSettings();
  const [screen, setScreen] = useState('home');
  const [kind, setKind] = useState('new');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const gearRef = useRef(null);
  const sheetRef = useRef(null);
  const Title = pageOver ? 'div' : 'h1';

  // Every move lands at the top of the sheet, focus on its heading, so a
  // screen reader hears the new question and a phone shows its start.
  useEffect(() => {
    if (screen === 'home') return;
    const el = sheetRef.current?.querySelector('.pf-title');
    if (el) el.focus({ preventScroll: true });
    sheetRef.current?.scrollIntoView?.({ block: 'start' });
  }, [screen]);

  const list = useMemo(() => [...setupScreens(settings), 'create'], [settings]);
  const go = (id) => setScreen(id);
  const next = (id, s) => {
    const l = [...setupScreens(s), 'create'];
    // Skip what an earlier answer (the free text, a booking) already gave,
    // so the traveller only meets the questions still open.
    let k = nextScreen(l, id);
    while (k && k !== 'create' && s.answered.includes(k)) k = nextScreen(l, k);
    go(k || 'create');
  };
  const back = () => go(prevScreen(list, screen) || 'kind');

  const draft = loadTripDraft();
  const hasTrip = Boolean(settings.trip.created || draft?.stops?.length || draft?.planId);

  const bar = hasTrip ? (
    <IconButton ref={gearRef} tone="surface" label={t('pf.settings')} onClick={() => setSettingsOpen(true)}>
      <SettingsIcon size={20} />
    </IconButton>
  ) : null;

  let body;
  if (screen === 'home') {
    body = (
      <HomeIntro
        titleTag={Title}
        hasTrip={hasTrip}
        tripName={settings.trip.name}
        onStart={() => go('kind')}
        onContinue={() => onNavigate('trip')}
        onNavigate={onNavigate}
      />
    );
  } else if (screen === 'kind') {
    body = (
      <KindSheet
        value={kind}
        onPick={setKind}
        onClose={() => go('home')}
        onContinue={() => go(kind === 'now' ? 'now' : 'tell')}
        onPast={() => (onAddPast ? onAddPast() : onNavigate('trips'))}
      />
    );
  } else if (screen === 'now') {
    body = (
      <OnTripSheet
        onBack={() => go('kind')}
        onPick={(v) => (v === 'add' ? go('tell') : onNavigate('day'))}
      />
    );
  } else if (screen === 'create') {
    body = (
      <CreateScreen
        settings={settings}
        save={save}
        onBack={back}
        onEditWhen={() => go('when')}
        onDone={() => onCreated && onCreated()}
      />
    );
  } else {
    const q = QUESTIONS[screen];
    const pos = progressOf(list, screen);
    body = (
      <div className="pf-step">
        <SheetHead
          onBack={back}
          backLabel={t('pf.back')}
          onClose={() => go('home')}
          closeLabel={t('pf.close')}
          position={t('pf.position', { x: pos.index + 1, n: list.length })}
        />
        <h2 className="pf-title" tabIndex={-1}>{q ? t(q.titleKey) : ''}</h2>
        <QuestionBody
          id={screen}
          settings={settings}
          commit={(s) => { save(s); next(screen, s); }}
        />
      </div>
    );
  }

  return (
    <div className="pf" ref={sheetRef}>
      <PlanStage bar={bar} sheetLabel={t('pf.sheet')}>
        {body}
      </PlanStage>
      {settingsOpen && (
        <TripSettingsSheet anchorRef={gearRef} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

/** The opening screen: the mark, one sentence, Start planning (Mindtrip). */
function HomeIntro({ titleTag, hasTrip, tripName, onStart, onContinue, onNavigate }) {
  const { t } = useI18n();
  const Title = titleTag;
  return (
    <div className="pf-intro">
      <Logo size={48} className="pf-mark" />
      <Title className="pf-title pf-intro-line" tabIndex={-1}>{t('pf.home.line')}</Title>
      <Button variant="primary" className="pf-intro-start" onClick={onStart}>{t('pf.home.start')}</Button>
      {hasTrip && (
        <a className="pf-continue" href={tabHref('trip')} onClick={door(onContinue)}>
          <span className="pf-continue-text">
            <span className="pf-continue-label">{t('pf.home.continue')}</span>
            {tripName && <span className="pf-continue-sub">{tripName}</span>}
          </span>
          <ChevronRightIcon size={18} />
        </a>
      )}
      <a className="pf-quiet" href={tabHref('trips')} onClick={door(() => onNavigate('trips'))}>{t('pf.home.trips')}</a>
    </div>
  );
}

/**
 * I'm on a trip now (T659): plan a day of a trip already in Carta, add the
 * trip as it stands (what is booked, where you are, until when) so it stays
 * up to date even if Carta was not used before leaving, or plan today right
 * where you are. The first and last open the day planner, whose start offers
 * the saved trips and "Use my location"; the middle runs the setup questions.
 */
function OnTripSheet({ onBack, onPick }) {
  const { t } = useI18n();
  const [pick, setPick] = useState('day');
  return (
    <div className="pf-step">
      <SheetHead onBack={onBack} backLabel={t('pf.back')} />
      <h2 className="pf-title" tabIndex={-1}>{t('pf.now.title')}</h2>
      <ChoiceRows
        label={t('pf.now.title')}
        options={[
          { value: 'day', icon: 'ListDayIcon', label: t('pf.now.day'), sub: t('pf.now.daySub') },
          { value: 'add', icon: 'UploadIcon', label: t('pf.now.add'), sub: t('pf.now.addSub') },
          { value: 'today', icon: 'CrosshairIcon', label: t('pf.now.today'), sub: t('pf.now.todaySub') },
        ]}
        value={[pick]}
        onPick={setPick}
      />
      <div className="pf-foot">
        <Button variant="primary" block onClick={() => onPick(pick)}>{t('pf.continue')}</Button>
      </div>
    </div>
  );
}

/** "What do you want to plan?", the Polarsteps trip-kind sheet. */
function KindSheet({ value, onPick, onClose, onContinue, onPast }) {
  const { t } = useI18n();
  const options = [
    { value: 'new', icon: 'CalendarIcon', label: t('pf.kind.new'), sub: t('pf.kind.newSub') },
    { value: 'now', icon: 'ShoeIcon', label: t('pf.kind.now'), sub: t('pf.kind.nowSub') },
  ];
  return (
    <div className="pf-step">
      <SheetHead onClose={onClose} closeLabel={t('pf.close')} />
      <h2 className="pf-title" tabIndex={-1}>{t('pf.kind.title')}</h2>
      <p className="pf-help">{t('pf.kind.help')}</p>
      <ChoiceRows label={t('pf.kind.title')} options={options} value={[value]} onPick={onPick} />
      <div className="pf-foot">
        <Button variant="primary" block onClick={onContinue}>{t('pf.continue')}</Button>
        <Button variant="secondary" block onClick={onClose}>{t('pf.cancel')}</Button>
      </div>
      <Button variant="quiet" size="sm" className="pf-past" iconStart={<ClockIcon size={16} />} onClick={onPast}>
        {t('pf.kind.past')}
      </Button>
    </div>
  );
}
