import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import '../../styles/planners.css';
import { useI18n } from '../../i18n/index.jsx';
import { loadTripDraft } from '../tripDraftStore.js';
import { Button, ChoiceRows, IconButton } from '../../components/ui/index.js';
import { ClockIcon, SettingsIcon } from '../../components/Icons.jsx';
import { PlanStage, SheetHead } from './PlanStage.jsx';
import { QUESTIONS } from './questions.js';
import { setupScreens, continueTo, prevScreen, progressOf } from './flowGraph.js';
import { QuestionBody } from './QuestionScreen.jsx';
import { useBcp47, useMonths, useTripSettings, whenText } from './flowHooks.js';
import { FlowRail } from './FlowRail.jsx';
import { stepAnswer } from './stepText.js';
import { CreateScreen } from './setupScreens.jsx';
import { TripSettingsSheet } from './TripSettingsSheet.jsx';
import { PlanHome } from './PlanHome.jsx';
import { showKeptNext } from '../../lib/recommend/keptStore.js';
import { CartaTrips } from './CartaTrips.jsx';
import { tripsStore } from '../tripsStore.js';
import { useAuth } from '../../auth/AuthContext.jsx';

/**
 * PlanFlow (T654, T655), the Plan place with nothing open yet: the opening
 * screen (after Mindtrip's assistant), the "what do you want to plan?" sheet
 * (after Polarsteps), the setup questions of a new trip, one per screen on
 * the same sheet, and Create trip. Replaces PlanStart.
 *
 *   onNavigate(view)   'trip' | 'day' | 'trips'  (App's goTo)
 *   onCreated()        the trip exists: open it in the trip planner
 *   onAddPast()        My trips' past-trip form (T659)
 *   onOpenJourney(id)  one of Carta's own trips, its whole week (T752)
 *   onOpenPlan(id)     an account trip, through App's open-saved-trip path
 *   destinations       the catalogue by id, for a trip's first photo and towns
 *
 * T809: the opening lists every trip on this device (tripsStore) and, signed
 * in, the account's trips; Start planning always starts a new one.
 */
export function PlanFlow({
  onNavigate, onCreated, onAddPast = null, onOpenJourney = null, onOpenPlan = null, destinations = null, pageOver = false,
}) {
  const { t, lang } = useI18n();
  const months = useMonths();
  const bcp47 = useBcp47();
  const trips = useHomeTrips(destinations);
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
    // Skip only what the Tell sentence answered; a question answered on its
    // own screen is the next stop again (continueTo).
    go(continueTo(l, id, s, 'create') || 'create');
  };
  const back = () => go(prevScreen(list, screen) || 'kind');

  const draft = loadTripDraft();
  const hasTrip = Boolean(settings.trip.created || draft?.stops?.length || draft?.planId);

  const bar = hasTrip ? (
    <IconButton ref={gearRef} tone="surface" label={t('pf.settings')} onClick={() => setSettingsOpen(true)}>
      <SettingsIcon size={20} />
    </IconButton>
  ) : null;

  // The opening is a page of its own on warm paper (T743): no map, no sheet.
  if (screen === 'home') {
    return (
      <div className="pf is-opening" ref={sheetRef}>
        <PlanHome
          titleTag={Title}
          trips={trips}
          onStart={() => {
            // A new trip every time; the one open stays in the list. T856:
            // always, so an open draft too empty to be listed (answers with
            // no trip made yet) never hands its old answers to the new plan.
            tripsStore.startNew();
            setKind('new');
            go('kind');
          }}
          onOpenTrip={(trip) => {
            if (trip.device) tripsStore.open(trip.id);
            if (trip.planId && onOpenPlan) { onOpenPlan(trip.planId); return; }
            onNavigate('trip');
          }}
          onDeleteTrip={(trip) => tripsStore.remove(trip.id)}
          onOpenTrips={() => go('carta')}
          onOpenKept={() => { showKeptNext(); onNavigate('trips'); }}
        />
      </div>
    );
  }

  // Carta's own trips (T752): a full page of its own, like the opening.
  if (screen === 'carta') {
    return (
      <div className="pf is-carta" ref={sheetRef}>
        <CartaTrips
          titleTag={Title}
          onBack={() => go('home')}
          onOpenJourney={(id) => (onOpenJourney ? onOpenJourney(id) : onNavigate('trips'))}
        />
      </div>
    );
  }

  let body;
  let rail = null;
  if (screen === 'kind') {
    body = (
      <KindSheet
        value={kind}
        onPick={setKind}
        onClose={() => go('home')}
        onContinue={() => {
          if (kind === 'now') { go('now'); return; }
          if (settings.kind !== 'new') save({ ...settings, kind: 'new' });
          go('tell');
        }}
        onPast={() => (onAddPast ? onAddPast() : onNavigate('trips'))}
      />
    );
  } else if (screen === 'now') {
    body = (
      <OnTripSheet
        onBack={() => go('kind')}
        onPick={(v) => {
          if (v !== 'add') { onNavigate('day'); return; }
          // T675: adding a trip under way asks where you are and until when.
          if (settings.kind !== 'now') save({ ...settings, kind: 'now' });
          go('tell');
        }}
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
    // T893: from 1100 px the setup questions stand beside their step list.
    const whenWords = whenText(t, settings.when, months, bcp47);
    const steps = list.filter((id) => id !== 'create');
    rail = (
      <FlowRail
        label={t('pf.groups')}
        groups={[{
          key: 'trip',
          label: t('pf.group.trip'),
          items: steps.map((id, i) => {
            const done = settings.answered.includes(id);
            return {
              id,
              n: i + 1,
              label: t(`pf.step.${id}`),
              answer: done ? stepAnswer(t, id, settings, { when: whenWords, locale: lang }) : '',
              done,
              now: id === screen,
              onClick: done && id !== screen ? () => go(id) : null,
            };
          }),
        }]}
      />
    );
    body = (
      <div className="pf-step">
        <SheetHead
          onBack={back}
          backLabel={t('pf.back')}
          onClose={() => go('home')}
          closeLabel={t('pf.close')}
          position={t('pf.position', { x: pos.index + 1, n: list.length })}
          marks={list.map((id) => ({ key: id, now: id === screen, done: settings.answered.includes(id) }))}
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
      <PlanStage bar={bar} rail={rail} sheetLabel={t('pf.sheet')}>
        {body}
      </PlanStage>
      {settingsOpen && (
        <TripSettingsSheet anchorRef={gearRef} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

const NO_TRIPS = [];

/**
 * The Plan home's trips (T809), ready to draw: the device's list, latest
 * first, then the account's trips that no device trip already carries.
 * Re-read whenever the list changes (open, new, delete).
 */
function useHomeTrips(destinations) {
  const { t } = useI18n();
  const { user } = useAuth() || {};
  const tick = useSyncExternalStore(tripsStore.subscribe, tripsStore.getActiveId);
  const [bump, setBump] = useState(0);
  useEffect(() => tripsStore.subscribe(() => setBump((n) => n + 1)), []);
  const [plans, setPlans] = useState(NO_TRIPS);
  useEffect(() => {
    if (!user?.id) { setPlans(NO_TRIPS); return undefined; }
    let live = true;
    import('../../auth/tripPlanStorage.js')
      .then((m) => m.fetchTripPlans(user.id))
      .then((rows) => { if (live) setPlans(rows || NO_TRIPS); })
      .catch(() => { if (live) setPlans(NO_TRIPS); });
    return () => { live = false; };
  }, [user?.id]);

  return useMemo(() => {
    const dest = destinations || {};
    const photo = (ids) => {
      for (const id of ids) { const u = dest[id]?.image?.url; if (u) return u; }
      return '';
    };
    const towns = (ids) => [...new Set(ids.map((id) => dest[id]?.city).filter(Boolean))].slice(0, 2).join(', ');
    // T890: a name that is only the country a finder trip landed with
    // ("Italy" for a week in Rome) reads as its places, as on the trip page.
    const named = (name, ids) => {
      const own = (name || '').trim();
      return own && !ids.some((id) => (dest[id]?.country || '').trim().toLowerCase() === own.toLowerCase()) ? own : '';
    };
    const device = tripsStore.list().map((x) => ({
      id: x.id,
      device: true,
      active: x.active,
      planId: x.meta.planId,
      name: named(x.meta.name, x.meta.stops) || towns(x.meta.stops) || t('pf.home.yourTrip'),
      cover: x.meta.cover || photo(x.meta.stops),
      start: x.meta.start,
      end: x.meta.end,
      months: x.meta.months,
      nights: x.meta.nights,
      stopCount: x.meta.stops.length,
      status: x.meta.status,
      account: Boolean(x.meta.planId),
    }));
    const carried = new Set(device.map((x) => x.planId).filter(Boolean));
    const account = plans.filter((p) => p?.id && !carried.has(p.id)).map((p) => {
      const ids = p.destination_ids || [];
      const nights = p.start_date && p.end_date
        ? Math.round((Date.parse(p.end_date) - Date.parse(p.start_date)) / 86400000) : null;
      return {
        id: `plan-${p.id}`,
        planId: p.id,
        name: named(p.label, ids) || towns(ids) || (p.cities || []).slice(0, 2).join(', ') || t('pf.home.yourTrip'),
        cover: photo(ids),
        start: p.start_date || '',
        end: p.end_date || '',
        months: [],
        nights: nights > 0 ? nights : null,
        stopCount: ids.length,
        status: ids.length ? 'planned' : 'planning',
        account: true,
      };
    });
    return [...device, ...account];
  }, [destinations, plans, tick, bump, t]); // eslint-disable-line react-hooks/exhaustive-deps -- tick and bump re-read the device list
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
    { value: 'new', icon: 'CalendarIcon', label: t('pf.kind.new') },
    { value: 'now', icon: 'ShoeIcon', label: t('pf.kind.now') },
  ];
  return (
    <div className="pf-step">
      <SheetHead onClose={onClose} closeLabel={t('pf.close')} />
      <h2 className="pf-title" tabIndex={-1}>{t('pf.kind.title')}</h2>
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
