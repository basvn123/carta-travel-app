import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// The rules only this route renders load with its chunk (T474, CSS per route;
// scripts/css-routes.mjs).
import '../styles/planners.css';
import { Dropdown } from '../components/Dropdown.jsx';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { favDestIds } from '../lib/favorites.js';
import { Button } from '../components/Button.jsx';
import { ErrorBlock } from '../components/StateBlocks.jsx';
import { TripMap } from '../map/TripMap.jsx';
import { TripItinerary } from './TripItinerary.jsx';
import { carAdvice } from '../lib/transport.js';
import { GuidedTripWizard } from './GuidedTripWizard.jsx';
import { TripFlow } from './flow/TripFlow.jsx';
import { TripSettingsSheet } from './flow/TripSettingsSheet.jsx';
import { usePlannerStore, plannerStore } from './plannerStore.js';
import { fromDraft } from './flow/tripSettings.js';
import { staysFromImports } from './flow/importStays.js';
import { PARTIAL_DOORS } from '../lib/plan/doors.js';
import { useTripSettings } from './flow/flowHooks.js';
import { syncParty, syncWhen } from './flow/appSync.js';
import { useSettings } from '../components/SettingsLine.jsx';
import { useMedia } from '../browse/home/useHome.js';
import { useEditHistory } from './trip/useEditHistory.js';
import { TripUndoToast } from './trip/TripUndoToast.jsx';
import { ChipEditor } from './trip/ChipEditor.jsx';
import { ChangeFlight } from './trip/ChangeFlight.jsx';
import { SwapCity } from './trip/SwapCity.jsx';
import { DayTripPicker } from './trip/DayTripPicker.jsx';
import { BudgetCard } from './trip/BudgetCard.jsx';
import { ShareSheet } from './trip/ShareSheet.jsx';
import { TripDays } from './trip/TripDays.jsx';
import { budgetCheck } from './flow/budget.js';
import { offeredStayTiers } from '../lib/runtime_pricing.js';
import { offeredSleepGroups, optionsFor } from '../lib/sleepGroups.js';
import { TripSummary } from './TripSummary.jsx';
import { PlanStage } from './flow/PlanStage.jsx';
import { DaysPrompt } from './flow/DaysPrompt.jsx';
import { SheetShell } from '../browse/SheetShell.jsx';
import {
  loadDeviceTrip, saveDeviceTrip, clearDeviceTrip, newDeviceKey, deviceSaveDecision, deviceMeetsAccount,
} from './deviceTripStore.js';
import { CheapTipsSection } from './CheapTipsSection.jsx';
import { eurExact } from '../lib/format.js';
import { formatMoney } from '../lib/money.js';
import { fmtDate } from '../lib/dates.js';
import { movedWindow, nightsBetween } from '../lib/tripDates.js';
import { fetchDrivingRoute } from '../lib/routing.js';
import { useTripPlanner } from '../hooks/useTripPlanner.js';
import { MAX_PARTY } from '../lib/tripTotal.js';
import { useLifestyleLabel } from './planHooks.js';
import { useCountryInsights } from '../hooks/useCountryInsights.js';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { fetchTripPlans } from '../auth/tripPlanStorage.js';
import { useI18n } from '../i18n/index.jsx';
import { loadAssignments, TRIP_DRAFT_PLAN_ID } from './dayPlanStore.js';
import { SparkIcon, TrainIcon, CarIcon, BulbIcon, BookmarkIcon, MoreIcon } from '../components/Icons.jsx';
import { IconButton, Chip, ChipGroup } from '../components/ui/index.js';
import { geocodeAddress } from '../lib/geocode.js';
import { cityLabel } from '../lib/placeName.js';
import { scrollBehavior } from '../lib/motion.js';
import { originLabel } from '../lib/origins.js';
import { isGateway } from '../lib/rating.js';

// The trip page's map card and its full-size view (T819): room above each
// pin, which is drawn about 38 px over its point (tripmap-embed gotchas).
const CARD_MAP_PAD = { top: 64, left: 40, right: 150, bottom: 36 };
const FULL_MAP_PAD = { top: 110, left: 80, right: 200, bottom: 80 };

// One shared empty catalogue for the moments before data lands. A fresh `{}`
// per render would hand every memo below a new dependency each time and
// rebuild the country and city lists on every render (T192).
const NO_DESTINATIONS = Object.freeze({});

// The trip page's tabs, in order (T819); the address carries one (T828).
const TRIP_TABS = ['overview', 'itinerary', 'costs', 'days'];


/**
 * The planned view's "More" menu (carta-design "More" menu rule, T388): the
 * footer keeps Plan your days and Save trip, and every further action sits
 * behind one secondary button with menu semantics. Escape and a click outside
 * close it and focus returns to the button; the arrow keys move between the
 * items. A destructive item is drawn in --danger text and keeps its confirm.
 */
// T832: `round` draws the button as the trip page's round icon button and
// opens the menu downward (it sits on the page's top row now, not a footer).
function MoreMenu({ items, round = false }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const first = wrapRef.current?.querySelector('[role="menuitem"]');
    first?.focus();
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const list = [...(wrapRef.current?.querySelectorAll('[role="menuitem"]') || [])];
      if (!list.length) return;
      e.preventDefault();
      const i = list.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
      list[next].focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  const shown = items.filter(Boolean);
  if (!shown.length) return null;
  return (
    <div className={`trip-more${round ? ' is-down' : ''}`} ref={wrapRef}>
      {round ? (
        <IconButton
          ref={btnRef}
          tone="surface"
          className="trip-more-btn"
          label={t('trip.moreActionsAria')}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <MoreIcon size={20} />
        </IconButton>
      ) : (
        <Button
          ref={btnRef}
          className="trip-more-btn"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {t('trip.moreActions')}
        </Button>
      )}
      {open && (
        <div className="trip-more-menu" role="menu" aria-label={t('trip.moreActionsAria')}>
          {shown.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              className={`trip-more-item ${it.danger ? 'is-danger' : ''} ${it.className || ''}`}
              title={it.title}
              onClick={() => { setOpen(false); it.onClick(); }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Driving from" editor for own-car trips: the drive out/home legs price
 *  from this point. Same explicit-search Nominatim flow as the wizard. */
function OwnCarFromEditor({ carHome, setCarHome }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const search = async () => {
    const q = query.trim();
    if (q.length < 3 || busy) return;
    setBusy(true);
    setResults(await geocodeAddress(q));
    setBusy(false);
  };
  if (carHome) {
    return (
      <p className="trip-note trip-carfrom-note">
        <CarIcon size={11} /> {t('trip.drivingFrom', { from: carHome.name })}
        {' '}
        <button className="trip-carfrom-change" onClick={() => setCarHome(null)}>{t('wizard.change')}</button>
      </p>
    );
  }
  return (
    <div className="trip-carfrom">
      <div className="trip-carfrom-row">
        <input
          className="trip-ownflight-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          placeholder={t('wizard.carFromPlaceholder')}
          aria-label={t('wizard.carFromLabel')}
        />
        <button className="trip-carfrom-btn" onClick={search} disabled={busy || query.trim().length < 3}>
          {busy ? t('wizard.searching') : t('wizard.search')}
        </button>
      </div>
      {results.length > 0 && (
        <div className="trip-carfrom-results">
          {results.map((r, i) => (
            <button
              key={`${r.lat},${r.lon},${i}`}
              className="trip-carfrom-result"
              onClick={() => { setCarHome({ name: r.shortLabel, lat: r.lat, lon: r.lon }); setResults([]); setQuery(''); }}
            >{r.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Suggestions({ suggestions, onPick }) {
  const { t } = useI18n();
  if (!suggestions.length) return null;
  return (
    <div className="trip-block">
      <div className="trip-block-title">{t('trip.suggestTitle')}</div>
      <div className="trip-suggest-row">
        {suggestions.map((s) => (
          <button
            key={s.id}
            className="trip-suggest-card"
            onClick={() => onPick(s)}
            title={t('trip.suggestFrom', { city: cityLabel(s.city), country: s.country, km: s.km, from: s.shared_origin || t('trip.overland') })}
          >
            <div className="trip-suggest-thumb" style={s.image ? { backgroundImage: `url(${s.image})` } : undefined}>
              {!s.image && <span className="trip-suggest-fallback">{cityLabel(s.city).slice(0, 1)}</span>}
              {s.reason && <span className="trip-suggest-chip">{s.reason}</span>}
            </div>
            <div className="trip-suggest-meta">
              <span className="trip-suggest-city">{cityLabel(s.city)}</span>
              <span className="trip-suggest-sub">
                {s.km} km
                {s.rating?.score != null && <ScoreChip rating={s.rating} size="xs" />}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The stops you already said you wanted.
 *
 * The shortlist existed and the planner never read it: you starred a city on
 * the map and then typed its name again here. This closes that. It sits
 * above the recommendations deliberately - your own wishes outrank the app's
 * suggestions - and it is drawn in the same card shape, because "somewhere I
 * might add" is one idea and should not look like two.
 *
 * Only DESTINATIONS appear: a trip stop is a place you sleep in, and a
 * shortlisted beach or walk is not one. They are reachable from the day
 * planner instead, which is where a beach belongs.
 *
 * A city already in the trip is dropped from the strip rather than shown
 * disabled: it is no longer somewhere you could add.
 */
function ShortlistStops({ rows, onPick }) {
  const { t } = useI18n();
  if (!rows.length) return null;
  return (
    <div className="trip-block">
      <div className="trip-block-title">{t('fav.addFromShortlist')}</div>
      <div className="trip-suggest-row">
        {rows.map((s) => (
          <button
            key={s.id}
            className="trip-suggest-card"
            onClick={() => onPick(s)}
            title={t('trip.add')}
          >
            <div className="trip-suggest-thumb" style={s.image ? { backgroundImage: `url(${s.image})` } : undefined}>
              {!s.image && <span className="trip-suggest-fallback">{cityLabel(s.city).slice(0, 1) || '?'}</span>}
            </div>
            <div className="trip-suggest-meta">
              <span className="trip-suggest-city">{cityLabel(s.city)}</span>
              <span className="trip-suggest-sub">
                {s.country}
                {s.rating?.score != null && <ScoreChip rating={s.rating} size="xs" />}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// The receipt the total bar opens (one per planner view).
const RECEIPT_ID = 'trip-receipt';

/** "Sat 14 Nov to Sat 21 Nov, 3 stops" for a trip in the keep-which choice. */
function keptTripLine(t, label, start, end, stops) {
  return [
    start && end ? t('plan.dateRange', { a: fmtDate(start, true), b: fmtDate(end, true) }) : '',
    stops ? t(stops === 1 ? 'trip.stopsOne' : 'trip.stopsMany', { n: stops }) : '',
  ].filter(Boolean).join(', ') || label;
}

/**
 * A trip kept on this device meets an account that already holds a trip on
 * the free plan (T490-f): the traveller chooses which one to keep. Two equal
 * cards, one sentence, no default: nothing happens until one is chosen, and
 * closing keeps both where they are.
 */
function KeepTripChoice({ device, account, onKeepDevice, onKeepAccount, onClose }) {
  const { t } = useI18n();
  const d = device?.trip || {};
  const rows = [
    {
      key: 'device', name: d.planLabel || t('trip.keepDeviceName'), where: t('trip.keepOnDevice'),
      line: keptTripLine(t, '', d.tripStart, d.tripEnd, d.stops?.length || 0), onKeep: onKeepDevice,
    },
    {
      key: 'account', name: account?.label || t('trip.keepAccountName'), where: t('trip.keepInAccount'),
      line: keptTripLine(t, '', account?.start_date, account?.end_date, account?.cities?.length || 0), onKeep: onKeepAccount,
    },
  ];
  return (
    <SheetShell title={t('trip.keepTitle')} onClose={onClose} className="trip-keep-sheet" labelId="trip-keep-title">
      <p className="trip-keep-lead">{t('trip.keepLead')}</p>
      <ul className="trip-keep-list" role="list">
        {rows.map((r) => (
          <li key={r.key} className="trip-keep-card">
            <span className="trip-keep-where">{r.where}</span>
            <span className="trip-keep-name">{r.name}</span>
            {r.line && <span className="trip-keep-line">{r.line}</span>}
            <Button variant="secondary" className="trip-keep-btn" onClick={r.onKeep}>{t('trip.keepThis')}</Button>
          </li>
        ))}
      </ul>
    </SheetShell>
  );
}

export const TripPlannerTab = React.memo(function TripPlannerTab({ data, user, authConfigured, onRequestAuth, openPlanId, onOpenPlanConsumed, onPlanDay, openSharedTrip, onSharedTripConsumed, tripSeed = null, onTripSeedConsumed = null, stayTier = 'home', lifestyle = null, favorites = null, onOpenDest = null, onOpenCountry = null, onOpenTrip = null, onOpenJourney = null, onPlanHome = null }) {
  const { t, lang } = useI18n();
  const paywall = usePaywall();
  const countryInsights = useCountryInsights();
  const lifestyleLabel = useLifestyleLabel();
  // `stayTier` is the lifestyle panel's "where you sleep" choice; the planner
  // prices its stays from the same setting as the map and the receipt.
  // The days are priced at the Lifestyle panel's habits, live, the same
  // value the wizard's estimate reads (T432).
  const tp = useTripPlanner(data, countryInsights, stayTier, lifestyle || data?.meta?.defaults?.lifestyle || null);
  // No offer opens when a trip is finished (T488-c): the pass appears only
  // when something paid is tapped.
  const destinations = data?.destinations || NO_DESTINATIONS;

  const [pendingCountry, setPendingCountry] = useState('');
  const [pendingDestId, setPendingDestId] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [selectedStop, setSelectedStop] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  // The receipt's lines open on a new key (T432).
  const [receiptKey] = useState(0);
  // The trip kept on this device without an account (T500, 2.19).
  const [deviceTrip, setDeviceTrip] = useState(() => loadDeviceTrip());
  const [deviceError, setDeviceError] = useState(false);
  // A device trip meeting an account that already holds one (T490-f).
  const [keepChoice, setKeepChoice] = useState(null);
  // T675: the trip settings sheet, opened from the planned trip's gear.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsGearRef = useRef(null);
  const [pendingMove, setPendingMove] = useState(null);
  const migrating = useRef(false);
  const stopRefs = useRef({});

  // The wizard hands over a trip Carta already arranged (routed from the
  // fly-in, days filled from the interests), show it planned right away, with
  // the route on the map. Edit / Replan / Start over stay one tap away.
  const handleWizardComplete = (selection) => {
    tp.loadFromWizard(selection);
    tp.setPlanned(true);
    setWizardOpen(false);
    setSelectedStop(null);
    // T814 (owner 2026-10-29): Finish lands on the trip's summary, with no
    // sheet over it; Plan your days is one of its buttons (T658 asked here).
    setView('summary');
  };
  const [askDays, setAskDays] = useState(false);
  // T814: a planned trip opens on its summary (photos, dates, the route, the
  // total) and the full trip page is one button away. `editFrom` is where
  // Done editing goes back to: the page the editor was opened from.
  const [, setView] = useState('summary');
  // The trip page's tab (T819): Overview, Itinerary, Costs, Days. T828: it
  // rides in the address (?tt=costs), so a reload or a copied link opens
  // the same tab; Overview, the default, leaves the address clean.
  const [tripTab, setTripTabState] = useState(() => {
    try {
      const v = new URLSearchParams(window.location.search).get('tt');
      return TRIP_TABS.includes(v) ? v : 'overview';
    } catch { return 'overview'; }
  });
  const setTripTab = useCallback((v) => {
    const next = TRIP_TABS.includes(v) ? v : 'overview';
    setTripTabState(next);
    try {
      const url = new URL(window.location.href);
      if (next === 'overview') url.searchParams.delete('tt'); else url.searchParams.set('tt', next);
      if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
    } catch { /* sandboxed: the tab still works, the address just does not follow */ }
  }, []);
  const draft = usePlannerStore();
  const tripSet = fromDraft(draft);
  // T819: the trip page names where it starts even when the settings hold no
  // From name (an origin picked on the map or in the address), from the code.
  const tripOrigin = tripSet.from?.name || originLabel(data, tp.anchorOrigin || data?.meta?.selected_origin) || '';
  // The name the traveller gave the trip wins over the route's own label (end check).
  const tripName = tripSet.trip?.name || tp.planLabel;

  // T835 (owner D1): Undo and Redo on the trip page. A step holds the
  // planner's fields and the trip's own settings (dates, people, from,
  // name), so a chip, a stepper or a typed price all go back the same way.
  const app = useSettings();
  const [, saveTripSet] = useTripSettings();
  const wideTrip = useMedia('(min-width: 1024px)');
  const histState = {
    ...tp.editState,
    set: { when: tripSet.when, party: tripSet.party, from: tripSet.from || null, name: tripSet.trip?.name || '', budget: tripSet.guide?.budget || null },
  };
  const restoreEdit = tp.restoreEdit;
  const restoreHist = useCallback((st) => {
    restoreEdit(st);
    const cur = fromDraft(plannerStore.getState());
    const fromMoved = JSON.stringify(cur.from || null) !== JSON.stringify(st.set.from || null);
    saveTripSet({
      ...cur, when: st.set.when, party: st.set.party, from: st.set.from, trip: { ...cur.trip, name: st.set.name },
      guide: st.set.budget ? { ...cur.guide, budget: st.set.budget } : cur.guide,
    });
    syncWhen(app, st.set.when);
    syncParty(app, st.set.party);
    if (fromMoved && st.set.from) app?.setFrom?.({ name: st.set.from.name, lat: st.set.from.lat, lon: st.set.from.lng });
  }, [restoreEdit, saveTripSet, app]);
  const hist = useEditHistory({
    state: histState,
    restore: restoreHist,
    enabled: tp.planned && tp.stops.length > 0 && !wizardOpen,
    resetKey: tp.planId || tp.deviceKey || 'draft',
  });
  // The Undo message for the newest step (not for a name being typed), or a
  // note on what a changed setting did.
  const [toast, setToast] = useState(null);
  // A chip's note on what its change did (From: "Flights are now priced
  // from Ghent."), shown with that change's Undo.
  const noteRef = useRef(null);
  // T846: a change that takes the trip over its budget says so on its Undo
  // message ("€120 over your budget"), so it can be taken back at once.
  const headCount = Math.max(1, tp.groupSize + tp.children + tp.babies);
  // T873: the car advice, one row on the trip page's route (Review's block before).
  const carDests = tp.stopDetails.map((x) => x.dest).filter(Boolean);
  const carKey = carDests.map((d) => d.id).join('|');
  const carTip = useMemo(
    () => (tp.tripHasCar || tp.transportPref === 'owncar' ? null : carAdvice(carDests, headCount, countryInsights)),
    [carKey, headCount, countryInsights, tp.tripHasCar, tp.transportPref], // eslint-disable-line react-hooks/exhaustive-deps -- carKey stands for the stops
  );
  // T887: what the advised hire car does to the total (two quotes, so memoised).
  const quoteDelta = tp.quoteDelta;
  const carDelta = useMemo(
    () => (carTip && carTip.verdict !== 'no' ? quoteDelta?.({ transportPref: 'car' }) ?? null : null),
    [carTip, quoteDelta],
  );
  const budgetNow = tp.stops.length ? budgetCheck(tp.priced, tripSet.guide?.budget, { party: headCount, nights: tp.plannedNights }) : null;
  const overRef = useRef(null);
  useEffect(() => {
    const was = overRef.current;
    overRef.current = budgetNow ? budgetNow.over : null;
    if (!hist.last || hist.last.kind === 'name') return;
    const crossed = budgetNow?.over && was === false;
    const note = crossed
      ? t('tp.bud.nowOver', { price: formatMoney(budgetNow.gap, { precision: 'whole', locale: lang }) })
      : noteRef.current && noteRef.current.kind === hist.last.kind ? noteRef.current.text : '';
    noteRef.current = null;
    setToast({ change: hist.last, note });
  }, [hist.last?.seq, hist.last?.at]); // eslint-disable-line react-hooks/exhaustive-deps -- a new step, not a new object
  useEffect(() => {
    if (overRef.current == null && budgetNow) overRef.current = budgetNow.over;
  });

  // T845: a Costs line's "Change" goes where that line is set: a flight to
  // Change flight, food and drink to the Lifestyle, everything else to its
  // place on the route (a stay's type, a hop, the transfers, a day trip).
  const ROUTE_SPOT = {
    out: '#paid-out, #itin-fare-out', back: '#paid-back, .itin-end:last-of-type', travel: '#paid-out, #itin-fare-out',
    drive: '#itin-fare-out', beds: '.itin-stay select, .itin-bed', between: '.itin-hop', transfers: '.transfer-picker, .itin-hop',
    car: '.itin-route-extra, .itin-extras', daytrips: '.itin-daytrips',
  };
  const onReceiptLine = (key) => {
    if ((key === 'out' || key === 'back') && tp.priced?.cartaFlight?.[key]) { setFlightSheet(key); return; }
    if (key === 'days' && app?.openLifestyle) { app.openLifestyle(); return; }
    setTripTab('itinerary');
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const el = document.querySelector(ROUTE_SPOT[key] || '#itin-route-h');
      el?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
      if (el?.matches?.('input, select, button')) el.focus({ preventScroll: true });
    }));
  };

  // T836: the chips' own editors. Each answer goes to the planner and to the
  // trip settings at once, so the chip, the settings sheet and Explore say
  // the same, and Undo takes both back in one step.
  const [chipOpen, setChipOpen] = useState(null);
  // T840: Change flight, open on one way ('out' | 'back') or closed.
  const [flightSheet, setFlightSheet] = useState(null);
  // T841: Swap city, open on one stop's index or closed.
  const [swapAt, setSwapAt] = useState(null);
  // T843: Add a day trip, open on one stop's index or closed.
  const [dayTripAt, setDayTripAt] = useState(null);
  // T847: Share this trip, open or closed (with the control it hangs from).
  const [shareOpen, setShareOpen] = useState(null);
  const saveChip = (kind, v) => {
    const cur = fromDraft(plannerStore.getState());
    if (kind === 'dates') {
      const end = v.option?.kind === 'keep' ? v.option.end : v.end;
      if (v.option?.kind === 'stop') tp.setStopNights(v.option.index, v.option.nights);
      tp.setTripStart(v.start);
      tp.setTripEnd(end);
      const when = { ...cur.when, mode: 'exact', start: v.start, end, nights: nightsBetween(v.start, end) };
      saveTripSet({ ...cur, when });
      syncWhen(app, when);
    } else if (kind === 'people') {
      const kidAges = [...(cur.party.kidAges || []), ...Array(Math.max(0, v.children - (cur.party.kidAges || []).length)).fill(7)].slice(0, v.children);
      const party = { ...cur.party, adults: v.adults, kids: v.children, babies: v.babies, kidAges };
      tp.setParty(v);
      saveTripSet({ ...cur, party });
      syncParty(app, party);
    } else if (kind === 'from' && v) {
      noteRef.current = { kind: 'from', text: t('pf.set.nFrom', { name: v.name }) };
      app?.setFrom?.({ name: v.name, lat: v.lat, lon: v.lon });
      saveTripSet({ ...cur, from: { name: v.name, lat: v.lat, lng: v.lon, countryCode: v.iso2 || '' } });
      tp.setAnchorOrigin(null);
    }
  };
  // The name in place: the trip settings' name (what the page shows) and the
  // plan's label (what an account keeps).
  const renameTrip = (name) => {
    const cur = fromDraft(plannerStore.getState());
    saveTripSet({ ...cur, trip: { ...cur.trip, name } });
    tp.setPlanLabel(name);
  };
  const closeToast = useCallback(() => setToast(null), []);
  const cityOf = (id) => cityLabel(data?.destinations?.[id]?.city || '');
  // Ctrl or Cmd with Z (and Shift, or Y) on a keyboard, outside a field.
  const { undo: histUndo, redo: histRedo } = hist;
  useEffect(() => {
    if (!tp.planned) return undefined;
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const el = e.target;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); histUndo(); setToast(null); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); histRedo(); setToast(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tp.planned, histUndo, histRedo]);

  const handleStartOver = () => {
    if (!window.confirm(t('trip.confirmStartOver'))) return;
    tp.clearPlan();
    setSelectedStop(null);
    setSaveError('');
  };

  // The planned overview had a close cross in its top card that called
  // clearPlan() and emptied an unsaved trip with one tap (row T377-e). Closing
  // without clearing would only have led to the editor, which is what Edit
  // stops does, so the cross is gone and Start over (with its confirm) is the
  // one way to clear a trip (T388).

  // A trip plan chosen from the Saved-trips overview: load it and switch
  // straight to its planned view, or, for { id, edit: true }, into the
  // editable stop list so dates/stops can be changed right away.
  useEffect(() => {
    if (!openPlanId) return;
    // The trip kept on this device, opened from My trips (T503, T500-a).
    if (typeof openPlanId === 'object' && openPlanId.device) {
      const stored = loadDeviceTrip();
      if (stored) { tp.loadSnapshot(stored.trip, stored.key); setSelectedStop(null); setDeviceTrip(stored); setView('summary'); }
      onOpenPlanConsumed && onOpenPlanConsumed();
      return;
    }
    const planId = typeof openPlanId === 'object' ? openPlanId.id : openPlanId;
    const editMode = typeof openPlanId === 'object' && openPlanId.edit;
    tp.loadPlan(planId).then(() => {
      // T838: one page, no edit mode; My trips' Edit opens the route.
      tp.setPlanned(true);
      if (editMode) setTripTab('itinerary');
      setSelectedStop(null);
      setView('summary');
    }).catch(() => {
      // A failed fetch used to leave the tab silently stuck; surface it instead.
      setSaveError(t('trip.openFailed'));
    });
    onOpenPlanConsumed && onOpenPlanConsumed();
  }, [openPlanId]); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot hand-off: tp is a fresh object every render, and a re-run before App clears the id would load the plan twice

  // A trip that arrived via a share link (decoded + sanitized in App): load it
  // like a wizard hand-over and open the planned view. Stops whose destination
  // id no longer exists in the data are dropped rather than crashing the view.
  useEffect(() => {
    if (!openSharedTrip) return;
    const d = openSharedTrip;
    const stops = d.stops.filter((s) => destinations[s.destinationId]);
    if (stops.length) {
      tp.loadFromWizard({
        startDate: d.tripStart,
        stops,
        label: d.label || '',
        groupSize: d.groupSize,
        transport: d.transportPref,
        pace: d.pace,
        baggage: d.baggage,
        anchorId: d.anchorId,
        anchorOrigin: d.anchorOrigin,
        returnAnchorId: d.returnAnchorId,
        ownFlight: d.ownFlight?.airline || d.ownFlight?.costTotal ? d.ownFlight : null,
        legModes: d.legModes,
        ownLegs: d.ownLegs,
        ownStays: d.ownStays,
        children: d.children,
        babies: d.babies,
      });
      // The sender's trip name wins here (loadFromWizard treats its label as a
      // fallback so wizard runs never clobber a typed name; a share must).
      tp.setPlanLabel(d.label || '');
      // A published itinerary carries stops and nights but no dates, and the
      // planned view is a dated thing: opening it on a trip with no window
      // showed a route whose every stop said nothing about when. So a trip that
      // arrives without dates lands in the editor, which opens on the travel
      // window and gates the rest of itself on having one. A shared trip that
      // DOES carry dates is a finished plan and opens planned, as before.
      // T838: it opens on the trip page; one without dates (a published
      // itinerary) opens with the Dates editor up, the one thing it lacks.
      tp.setPlanned(true);
      setView('summary');
      if (!d.tripStart) setChipOpen({ kind: 'dates', ref: null });
      setSelectedStop(null);
    }
    onSharedTripConsumed && onSharedTripConsumed();
  }, [openSharedTrip]); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot hand-off: tp is a fresh object every render, and a re-run before App clears the trip would load it twice

  // A country seed ("Plan a trip here") with a trip already on the map: the
  // wizard is not on screen, so open it as the modal and let it take the
  // seed from there. On an empty planner the inline wizard already holds it.
  useEffect(() => {
    if (!tripSeed) return;
    if (tp.planned || tp.stopDetails.length > 0) setWizardOpen(true);
  }, [tripSeed, tp.planned, tp.stopDetails.length]);

  // Selecting a stop (via pin or card) scrolls its card into view.
  useEffect(() => {
    if (selectedStop == null) return;
    stopRefs.current[selectedStop]?.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
  }, [selectedStop]);

  // Drop the highlight if the selected stop was removed/reordered out of range.
  useEffect(() => {
    if (selectedStop != null && selectedStop >= tp.stopDetails.length) setSelectedStop(null);
  }, [tp.stopDetails.length, selectedStop]);

  // Manual "Add stop": country first, then city within it, picking both at once
  // made the combined list noisy, and country-first mirrors how travellers
  // actually think about where to go next.
  // Both scan the whole destinations map; memoize so a sheet-drag or stop-select
  // re-render doesn't re-dedupe/re-sort ~24,800 rows every time.
  const countryOptions = useMemo(
    () => [...new Set(Object.values(destinations).map((d) => d.country).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
      .map((c) => ({ value: c, label: c })),
    [destinations],
  );
  const cityOptions = useMemo(
    () => (pendingCountry
      ? Object.entries(destinations)
          .filter(([, d]) => d.country === pendingCountry && !isGateway(d))
          .map(([id, d]) => ({ value: id, label: cityLabel(d.city) }))
          .sort((a, b) => a.label.localeCompare(b.label))
      : []),
    [destinations, pendingCountry],
  );

  // Know before you go: the countries' rules and this trip's savings, as one
  // track (planner/CheapTipsSection.jsx, T432).
  const beforeYouGo = tp.stopDetails.length > 0 ? (() => {
    const tripCountries = [...new Set(tp.stopDetails.map((s) => s.dest?.country).filter(Boolean))];
    const withIntel = countryInsights ? tripCountries.filter((c) => countryInsights[c]) : [];
    return (
      <CheapTipsSection
        stopDetails={tp.stopDetails}
        tripStart={tp.tripStart}
        transportPref={tp.transportPref}
        groupSize={tp.groupSize}
        intelRecs={withIntel.map((c) => ({ country: c, rec: countryInsights[c] }))}
      />
    );
  })() : null;

  // What the traveller paid to get there or home (T432), typed on the
  // overview's route. One record holds both directions, kept apart.
  const setTravelPaid = (dir, n) => {
    const base = tp.ownFlight || { airline: '', mode: tp.transportPref === 'owncar' ? 'car' : 'fly' };
    const split = base.costOut != null || base.costBack != null;
    const costOut = dir === 'out' ? n : (split ? Number(base.costOut) || 0 : Number(base.costTotal) || 0);
    const costBack = dir === 'back' ? n : (split ? Number(base.costBack) || 0 : 0);
    tp.setOwnFlight({ ...base, costOut, costBack, costTotal: Math.round((costOut + costBack) * 100) / 100 });
  };
  // The map's stops, held by value rather than rebuilt per render. TripMap
  // clears its pins and refits the camera whenever `stops` changes identity,
  // so a fresh array here replayed that whole redraw (and a 700 ms camera
  // glide) on every nights bump, stop select or sheet drag, none of which
  // moves a pin. stopDetails itself changes on every nights bump, so the
  // array is keyed on what the map draws: the coordinates and the names.
  // A planned trip's pins carry their nights (T432): the map reads as the
  // trip, "Berat, 3 nights", not as a row of numbers.
  const pinTag = (s) => (tp.planned ? t(s.nights === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n: s.nights }) : '');
  // A flown trip starts and ends at an airport (T458): the planned map shows
  // it as a pin of its own, and the road to it is part of the drawn route.
  const flying = Boolean(tp.planned && tp.flight && !tp.flight.driving
    && (tp.flight.combinable || (tp.flight.own && (tp.flight.mode || 'fly') === 'fly')));
  // T874 (row T864-c): the airport the priced flight lands at or leaves from
  // (the finder's held leg can use another airport than the stop's anchor:
  // Lake Como flies into Malpensa, its anchor is Bergamo), else the anchor.
  const airportOf = (dest, flown = null) => {
    const iata = (flown && data?.meta?.origins?.[flown] ? flown : null) || dest?.anchor_airport || null;
    const o = iata ? data?.meta?.origins?.[iata] : null;
    return o && o.lat != null ? { lat: o.lat, lon: o.lon, city: `${cityLabel(o.city || iata)} ${iata}`, tag: t('plan.pinAirport'), plain: true, airport: true } : null;
  };
  const geoStops = tp.stopDetails.filter((s) => s.dest && s.dest.lat != null && s.dest.lon != null);
  const airIn = flying ? airportOf(geoStops[0]?.dest, tp.priced?.cartaFlight?.inAirport) : null;
  const airOut = flying ? airportOf(geoStops[geoStops.length - 1]?.dest, tp.priced?.cartaFlight?.outAirport) : null;
  const mapStopsKey = [
    airIn ? `${airIn.lat},${airIn.lon}` : '',
    ...geoStops.map((s) => `${s.dest.lat},${s.dest.lon},${cityLabel(s.dest.city)},${pinTag(s)}`),
    airOut ? `${airOut.lat},${airOut.lon}` : '',
  ].join('|');
  const mapStops = useMemo(
    () => [
      ...(airIn ? [airIn] : []),
      ...tp.stopDetails
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.dest && s.dest.lat != null && s.dest.lon != null)
        .map(({ s, i }) => ({
          lat: s.dest.lat, lon: s.dest.lon, city: cityLabel(s.dest.city), tag: pinTag(s),
          tagImg: tp.planned ? (s.dest.image?.url || null) : null, stopIndex: i,
        })),
      // Flying home from the same airport: the route still returns to it,
      // with no second pin on top of the first.
      ...(airOut ? [airIn && airIn.lat === airOut.lat && airIn.lon === airOut.lon ? { ...airOut, ghost: true } : airOut] : []),
    ],
    [mapStopsKey], // eslint-disable-line react-hooks/exhaustive-deps -- keyed by value on purpose, see above
  );
  // The pins TripMap draws (no ghost), and its indexes back to the trip's.
  const pinStops = useMemo(() => mapStops.filter((m) => !m.ghost), [mapStops]);
  const toStop = (i) => (pinStops[i]?.stopIndex ?? null);
  const toMapIndex = (stop) => (stop == null ? null : pinStops.findIndex((m) => m.stopIndex === stop));

  // Draw the real road route through the stops whenever there are two or more
  // (keyless OSRM, same as the day planner's walking route), while editing
  // AND once planned, so the line never cuts across water when a road exists.
  // Keyed on the coordinates so a stale response for a since-changed route is
  // ignored; falls back to the dashed straight-line hops when the router has
  // no answer (a genuine sea crossing).
  const routeKey = mapStops.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join(';');
  const [tripRoute, setTripRoute] = useState(null);
  useEffect(() => {
    if (mapStops.length < 2) { setTripRoute(null); return undefined; }
    let alive = true;
    fetchDrivingRoute(mapStops).then((r) => { if (alive && r) setTripRoute({ key: routeKey, ...r }); });
    return () => { alive = false; };
  }, [mapStops, routeKey]);
  const tripRouteOk = tripRoute && tripRoute.key === routeKey;

  const addPending = () => {
    if (!pendingDestId) return;
    tp.addStop(pendingDestId);
    setPendingDestId('');
  };

  /**
   * The shortlist as stops you could add.
   *
   * Destinations only (a shortlisted beach is not somewhere you sleep), and
   * anything already in the trip is dropped rather than shown disabled: it
   * is no longer somewhere you could add.
   */
  const shortlistStops = useMemo(() => {
    if (!favorites || !favorites.size) return [];
    const already = new Set(tp.stopDetails.map((st) => st.destinationId));
    const out = [];
    for (const id of favDestIds(favorites)) {
      if (already.has(id)) continue;
      const d = destinations[id];
      if (!d) continue;
      out.push({ id, city: cityLabel(d.city), country: d.country, image: d.image?.url || null, rating: d.rating });
    }
    return out;
  }, [favorites, destinations, tp.stopDetails]);

  const handlePendingCountry = (c) => {
    setPendingCountry(c);
    setPendingDestId(''); // city choice no longer valid once the country changes
  };

  const notify = (msg) => {
    setSaveNotice(msg);
    window.setTimeout(() => setSaveNotice(''), 3500);
  };

  // Without an account the first trip is kept on this device (T473, T500):
  // "Save trip" writes it to carta.deviceTrip.v1 and says so. A second trip
  // asks for the pass, as a second account trip does; a browser that keeps
  // nothing (a private window, a full store) says so and offers sign-in.
  const saveOnDevice = () => {
    if (deviceSaveDecision(loadDeviceTrip(), tp.deviceKey) === 'second') {
      paywall.require('save');
      return;
    }
    const key = tp.deviceKey || newDeviceKey();
    if (!saveDeviceTrip({ key, trip: tp.snapshot })) {
      setDeviceError(true);
      return;
    }
    tp.setDeviceKey(key);
    setDeviceTrip(loadDeviceTrip());
    setDeviceError(false);
    notify(t('trip.savedDeviceNotice'));
  };

  const handleSave = async () => {
    setSaveError('');
    if (!user) { saveOnDevice(); return; }
    const wasUpdate = Boolean(tp.planId);
    const fromEdit = !tp.planned;
    // A free traveller keeps one trip. The second one is somebody who came
    // back, which is the person worth asking. Saving over an existing trip is
    // never gated, and the count is only fetched when it can change the
    // answer, so a pass holder never pays for the round trip.
    if (!wasUpdate && !paywall.paid) {
      let existing = [];
      try { existing = await fetchTripPlans(user.id); } catch { existing = []; }
      if (existing.length >= 1 && !paywall.require('save')) return;
    }
    try {
      await tp.savePlan(user.id);
      notify(wasUpdate ? t('trip.updatedNotice') : t('trip.savedNotice'));
      if (fromEdit && wasUpdate) {
        // Done editing an existing trip: hand the traveller back to the Trip
        // planner's start page (the trip itself is safe under Saved trips).
        tp.clearPlan();
        setSelectedStop(null);
      }
    } catch (e) {
      // The service's own text ("JWT expired", a constraint name) is for the
      // console; the traveller gets what failed and what to do (T193).
      console.warn('trip save failed', e);
      setSaveError(t('state.tripSaveFailed'));
    }
  };

  // A trip kept on the device follows its edits, as a day plan does: once
  // kept, it stays "Saved on this device" without a second press.
  const keptHere = !user && Boolean(tp.deviceKey) && deviceTrip?.key === tp.deviceKey;
  useEffect(() => {
    if (!keptHere || !tp.stops.length) return;
    if (!saveDeviceTrip({ key: tp.deviceKey, trip: tp.snapshot })) setDeviceError(true);
  }, [tp.snapshot]); // eslint-disable-line react-hooks/exhaustive-deps -- written when the trip changes, not when the key is first set (saveOnDevice already wrote it)

  // Signing in with a trip on the device (T490-f). With room on the account
  // (no trip yet, or a pass) the trip moves across; on the free plan with a
  // trip already there, the traveller chooses which one to keep.
  useEffect(() => {
    if (!user || migrating.current) return;
    const stored = loadDeviceTrip();
    if (!stored) return;
    migrating.current = true;
    (async () => {
      let existing;
      try { existing = await fetchTripPlans(user.id); } catch { migrating.current = false; return; }
      const how = deviceMeetsAccount(stored, existing.length, paywall.paid);
      if (how === 'move') setPendingMove({ stored, asPlanId: null });
      else if (how === 'choose') setKeepChoice({ stored, account: existing[0] });
    })();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps -- once per sign-in

  // The move itself waits one render: the device trip is put on the planner
  // first, then saved, so savePlan reads the trip it is saving.
  useEffect(() => {
    if (!pendingMove || !user) return;
    const { stored, asPlanId } = pendingMove;
    if (tp.deviceKey !== stored.key) { tp.loadSnapshot(stored.trip, stored.key); return; }
    setPendingMove(null);
    tp.savePlan(user.id, { asPlanId }).then(() => {
      clearDeviceTrip();
      setDeviceTrip(null);
      notify(t('trip.savedNotice'));
    }).catch((e) => {
      console.warn('device trip move failed', e);
      setSaveError(t('state.tripSaveFailed'));
    });
  }, [pendingMove, tp.deviceKey, user]); // eslint-disable-line react-hooks/exhaustive-deps -- tp is a fresh object every render

  const keepDeviceTrip = () => {
    const c = keepChoice;
    setKeepChoice(null);
    if (c) setPendingMove({ stored: c.stored, asPlanId: c.account.id });
  };
  const keepAccountTrip = () => {
    const c = keepChoice;
    setKeepChoice(null);
    clearDeviceTrip();
    setDeviceTrip(null);
    if (!c) return;
    tp.loadPlan(c.account.id).then(() => { tp.setPlanned(true); setSelectedStop(null); })
      .catch(() => setSaveError(t('trip.openFailed')));
  };

  // Which itinerary days already have Day-planner picks on this device, so the
  // per-day button can honestly read "Modify" instead of "Plan". Re-read when
  // the planned view (re)opens, picks are made over in the Day planner tab.
  const dayAssignments = useMemo(
    () => (tp.planned ? loadAssignments(tp.planId || TRIP_DRAFT_PLAN_ID) : {}),
    [tp.planned, tp.planId],
  );
  const isDayPlanned = (stopIndex, dayOfStay) => {
    const picks = dayAssignments?.[stopIndex]?.[dayOfStay - 1];
    return Array.isArray(picks) && picks.length > 0;
  };


  // An empty planner has nothing to put on a map: no stops, no route, no
  // prices. So the tab opens on the question instead of on a locator map of
  // Europe, and the guide runs as the page itself, under the app header,
  // rather than as a modal that covers it. The map layout returns the moment
  // there is a trip to draw.
  // T832: a trip with no stops (planned or not) has nothing to show but the
  // way in, so it opens on the question.
  // T838: a trip with stops is always shown planned; a draft kept from the
  // old editor (planned false) opens on its page too.
  const { planned: isPlanned, setPlanned: setIsPlanned } = tp;
  const stopCount = tp.stops.length;
  useEffect(() => {
    if (stopCount > 0 && !isPlanned && !wizardOpen) setIsPlanned(true);
  }, [stopCount, isPlanned, wizardOpen, setIsPlanned]);
  const emptyPlanner = tp.stopDetails.length === 0;
  const renderWizard = ({ flowSteps = null, initialWhereTab = null, lockWhereTab = false, onCancel = null } = {}) => (
    <GuidedTripWizard
      inline
      data={data}
      stayTier={tp.stayTier}
      lifestyle={lifestyle}
      favorites={favorites}
      onOpenDest={onOpenDest}
      onOpenCountry={onOpenCountry}
      onOpenTrip={onOpenTrip}
      onCancel={onCancel || (() => setWizardOpen(false))}
      onComplete={handleWizardComplete}
      seed={tripSeed}
      onSeedConsumed={onTripSeedConsumed}
      flowSteps={flowSteps}
      initialWhereTab={initialWhereTab}
      lockWhereTab={lockWhereTab}
    />
  );
  if (emptyPlanner) {
    return (
      <div className="trip-planner-screen trip-planner-blank">
        {/* T656: the trip's page before a route (TripFlow), which hands the
            wizard only its planning steps. T675: a "Plan a trip here" seed
            enters there too, on the I know where door. */}
        <TripFlow renderEngine={renderWizard} seed={tripSeed} onOpenJourney={onOpenJourney} onLand={handleWizardComplete} />
        {saveNotice && <div className="trip-save-toast" role="status">{saveNotice}</div>}
        {keepChoice && (
          <KeepTripChoice
            device={keepChoice.stored}
            account={keepChoice.account}
            onKeepDevice={keepDeviceTrip}
            onKeepAccount={keepAccountTrip}
            onClose={() => setKeepChoice(null)}
          />
        )}
      </div>
    );
  }

  // The trip as a share link carries it, and its PDF (T847: the route's
  // export block and the Share sheet use the same two).
  const sharePayload = tp.stops.length ? {
                tripStart: tp.tripStart,
                stops: tp.stops,
                groupSize: tp.groupSize,
                transportPref: tp.transportPref,
                legModes: tp.legModes,
                ownLegs: tp.ownLegs,
                ownStays: tp.ownStays,
                children: tp.children,
                babies: tp.babies,
                pace: tp.pace,
                baggage: tp.baggage,
                anchorId: tp.anchorId,
                anchorOrigin: tp.anchorOrigin,
                returnAnchorId: tp.returnAnchorId,
                ownFlight: tp.ownFlight,
                label: tp.planLabel,
              } : null;
  const downloadPdf = async () => {
    const { downloadPlanPdf } = await import('../lib/planPdf.js');
    await downloadPlanPdf({
      label: tp.planLabel, priced: tp.priced, dayPlan: tp.dayPlan,
      lifestyle: lifestyleLabel, t, lang, transportPref: tp.transportPref,
    });
  };

  // The planned trip's detail, whole or a part of it (T821: the trip page's
  // Itinerary, Costs and Days tabs each show their part).
  const renderItinerary = (sections = null, grouped = false) => (
    <TripItinerary
              stopEdit={tp.planned && sections?.includes('route') ? stopEdit : null}
              onChangeFlight={tp.planned && sections?.includes('route') ? setFlightSheet : null}
              onSwapAirport={tp.planned && sections?.includes('route') ? tp.setAnchorOrigin : null}
              airportOrigins={data?.meta?.origins}
              tripStayTier={tp.stayTier}
              onReceiptLine={tp.planned && sections?.includes('receipt') ? onReceiptLine : null}
              routeExtra={tp.planned && sections?.includes('route') && (betweenBlock || cheaperBlock) ? <>{betweenBlock}{cheaperBlock}</> : null}
              addStopSlot={tp.planned && sections?.includes('route') ? addStopBlock : null}
      sections={sections}
      receiptGrouped={grouped}
              dayPlan={tp.dayPlan}
              label={tp.planLabel}
              stopDetails={tp.stopDetails}
              grandTotal={tp.grandTotal}
              groupSize={tp.groupSize}
              onSetGroupSize={(n) => tp.setGroupSize(Math.max(1, Math.min(MAX_PARTY, n)))}
              priced={tp.priced}
              party={{ adults: tp.groupSize, children: tp.children, babies: tp.babies }}
              onSetParty={tp.setParty}
              ownFlight={tp.ownFlight}
              onTravelPaid={setTravelPaid}
              onOwnLeg={(i, mode, n) => tp.setOwnLeg(i, mode, n)}
              onOwnStay={tp.setOwnStay}
              flightHours={tp.flightHours}
              onFlightHours={tp.planned ? null : tp.setFlightHours}
              baggage={tp.baggage}
              receiptId={RECEIPT_ID}
              receiptOpenKey={receiptKey}
              onPdf={downloadPdf}
              beforeSlot={beforeYouGo}
              flight={tp.flight}
              legs={tp.legs}
              setLegMode={tp.setLegMode}
              anchorLegs={tp.anchorLegs}
              flightTransfer={tp.flightTransfer}
              transferMode={tp.transferMode}
              setTransferMode={tp.setTransferMode}
              driveLegs={tp.driveLegs}
              stayCosts={tp.stayCosts}
              carRental={tp.carRental}
              vignettes={tp.vignettes}
              tripHasCar={tp.tripHasCar}
              activeStopIndex={selectedStop}
              onSelectStop={setSelectedStop}
              isDayPlanned={isDayPlanned}
              extrasPlanId={tp.planId || TRIP_DRAFT_PLAN_ID}
              sharePayload={sharePayload}
              onPlanDay={onPlanDay ? (day) => onPlanDay({
                planId: tp.planId,
                stopIndex: day.stopIndex,
                dayIndex: day.dayOfStay - 1,
              }) : null}
            />
  );

  // The list: the planned trip, or the stop editor (T500: the same place).
  // Adding a stop (T837): your own wishes first, then Carta's suggestions,
  // then any town by country. The same block in the first-stops editor and
  // on the trip page's route.
  const addStopBlock = (
    <>
      <ShortlistStops rows={shortlistStops} onPick={(s) => tp.addStop(s.id)} />
      <Suggestions suggestions={tp.nextStopSuggestions} onPick={(s) => tp.addStop(s.id)} />
      <div className="trip-block">
        <div className="trip-block-title">{tp.stopDetails.length === 0 ? t('trip.addFirstStop') : t('trip.addAnotherStop')}</div>
        <div className="trip-add-row">
          <Dropdown
            className="trip-add-country"
            value={pendingCountry}
            onChange={handlePendingCountry}
            options={countryOptions}
            placeholder={t('trip.country')}
            searchPlaceholder={t('trip.searchCountries')}
          />
          <Dropdown
            className="trip-add-city"
            value={pendingDestId}
            onChange={setPendingDestId}
            options={cityOptions}
            placeholder={pendingCountry ? t('trip.city') : t('trip.pickCountryFirst')}
            searchPlaceholder={t('trip.searchCities')}
            disabled={!pendingCountry}
          />
          <Button variant="secondary" className="trip-add-btn" onClick={addPending} disabled={!pendingDestId}>{t('trip.add')}</Button>
        </div>
      </div>
    </>
  );

  const stayOptions = offeredSleepGroups(offeredStayTiers(data?.meta)).flatMap((g) => {
    const opts = optionsFor(g);
    return (opts.length ? opts : g.offered.map((tier) => ({ tier, labelKey: g.labelKey })))
      .map((o) => ({ tier: o.tier, label: opts.length ? `${t(g.labelKey)}: ${t(o.labelKey)}` : t(g.labelKey) }));
  });

  // The stops' own controls on the trip page (T837): every change is the
  // planner's own setter, so each one is a step of the page's Undo.
  const stopEdit = {
    stops: tp.stops,
    tripStart: tp.tripStart,
    tripEnd: tp.tripEnd,
    setNights: tp.setStopNights,
    applyNights: (stops, end) => {
      stops.forEach((st, i) => { if (st.nights !== tp.stops[i]?.nights) tp.setStopNights(i, st.nights); });
      if (end) tp.setTripEnd(end);
    },
    move: tp.moveStop,
    reorder: tp.reorderStop,
    remove: (i) => { setSelectedStop(null); tp.removeStop(i); },
    swap: (i) => setSwapAt(i),
    // T842: the ways a stop can sleep, as "Hotel: 3 star", the dataset's own.
    stayOptions: stayOptions,
    tripStayLabel: t(`stay.${tp.stayTier || 'home'}`),
    setStay: tp.setStopStay,
    addDayTrip: (i) => setDayTripAt(i),
    setDayTrips: tp.setStopDayTrips,
    quoteDelta: tp.quoteDelta,
  };

  // T838: the old stop editor is gone (every fact is changed where it is
  // shown). Two of its parts had no other home, so they move to the route on
  // the Itinerary tab: how the trip gets between its stops (own car
  // included), and a cheaper order of the stops when there is one.
  const betweenBlock = tp.stopDetails.length > 1 ? (
    <div className="trip-block">
      <div className="trip-block-title">{t('trip.betweenTitle')}</div>
      <ChipGroup label={t('trip.betweenTitle')} className="trip-transport-chips">
        {[
          ['auto', SparkIcon, 'trip.cartaPicks'],
          ['public', TrainIcon, 'trip.trainBus'],
          ['car', CarIcon, 'trip.rentalCarOpt'],
          ['owncar', CarIcon, 'trip.ownCarOpt'],
        ].map(([k, ModeIco, lbl]) => (
          <Chip key={k} kind="choice" selected={tp.transportPref === k} onClick={() => tp.setTransportPref(k)}>
            {React.createElement(ModeIco, { size: 16 })} {t(lbl)}
          </Chip>
        ))}
      </ChipGroup>
      {tp.transportPref === 'car' && tp.carRental && (
        <p className="trip-note">
          {t('trip.carRentalNote', { total: eurExact(tp.carRental.eur_total), days: tp.carRental.days, perDay: eurExact(tp.carRental.eur_per_day), group: tp.groupSize })}
        </p>
      )}
      {tp.transportPref === 'owncar' && (
        <>
          <p className="trip-note">{t('trip.ownCarNote')}</p>
          <OwnCarFromEditor carHome={tp.carHome} setCarHome={tp.setCarHome} />
        </>
      )}
    </div>
  ) : null;
  const cheaperBlock = tp.stopDetails.length > 0 && tp.cheaperOrder ? (
    <div className="trip-block trip-savings">
      <div className="trip-block-title"><BulbIcon size={13} /> {t('trip.cheaperTitle')}</div>
      <div className="trip-saving-row">
        <span>{t('trip.cheaperOrder', { amount: eurExact(tp.cheaperOrder.saving_eur) })}</span>
        <Button variant="secondary" size="sm" onClick={tp.applyCheaperOrder}>{t('trip.reorder')}</Button>
      </div>
    </div>
  ) : null;

  const routeProps = {
    stops: pinStops,
    onSelectStop: (i) => { const s = toStop(i); if (s != null) setSelectedStop(s); },
    selectedIndex: toMapIndex(selectedStop),
    routeGeometry: tripRouteOk ? tripRoute.geometry : null,
    routeSegments: tripRouteOk ? tripRoute.segments : null,
  };


  // T675: a saved trip setting moves the planned trip too, which keeps its
  // own party and dates: the people, and a new start date (the nights stay,
  // so the end moves with it). What matters most needs nothing here: the
  // trip reads it from the settings and re-ranks its flights.
  // T731 (row T675-a, decided): a planned trip is the traveller's own work, so
  // a saved answer never rebuilds it. Each answer says in one line what it
  // did, with the next move where there is one: From prices the flights from
  // the new place; booked flights or stays ask for what was paid; a When
  // that is not two dates keeps the trip's dates; the help-me-choose answers
  // steer Carta's suggestions and leave the stops alone.
  const goToTripPart = (id) => {
    setSettingsOpen(false);
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
    });
  };
  const applySettings = (s, prev) => {
    const p = s.party;
    const q = prev.party;
    if (p.adults !== q.adults || p.kids !== q.kids || p.babies !== q.babies) {
      tp.setParty({ adults: p.adults, children: p.kids, babies: p.babies });
    }
    if (s.booked.flights && !prev.booked.flights) {
      return { text: t('pf.set.nFlights'), actionLabel: t('pf.set.nFlightsGo'), onAction: () => goToTripPart('itin-fare-out') };
    }
    if (s.booked.stays && !prev.booked.stays) {
      return { text: t('pf.set.nStays'), actionLabel: t('pf.set.nStaysGo'), onAction: () => goToTripPart('itin-route-h') };
    }
    const fromName = s.from?.name || '';
    if (fromName && fromName !== (prev.from?.name || '')) {
      // The trip's own departure airport gives way to the new From.
      tp.setAnchorOrigin(null);
      return { text: t('pf.set.nFrom', { name: fromName }) };
    }
    if (JSON.stringify(s.when) !== JSON.stringify(prev.when)) {
      // T815: a new end moves the trip too (it was ignored when the start
      // stayed), and the end is the settings' own, so the trip, the sheet
      // and Explore say the same dates (movedWindow, lib/tripDates.js).
      const moved = movedWindow(s.when, tp.tripStart, tp.tripEnd, tp.plannedNights);
      if (moved) {
        tp.setTripStart(moved.start);
        tp.setTripEnd(moved.end);
        return { text: t('pf.set.nMoved', { date: fmtDate(moved.start, true) }) };
      }
      return { text: t('pf.set.nWhenKept') };
    }
    if (JSON.stringify(s.guide) !== JSON.stringify(prev.guide)) return { text: t('pf.set.guideNote') };
    return null;
  };


  // Saved, and where (T500). Without an account: "Saved on this device" and a
  // quiet way to have it on another device; a browser that kept nothing says
  // so with sign-in as the way out.
  const saveStatus = deviceError ? (
    <ErrorBlock className="trip-footer-error" message={t('trip.deviceSaveFailed')}>
      {authConfigured && onRequestAuth && (
        <Button size="sm" variant="secondary" onClick={onRequestAuth}>{t('trip.signIn')}</Button>
      )}
    </ErrorBlock>
  ) : keptHere ? (
    <p className="trip-device-status">
      <span className="trip-device-dot" aria-hidden="true" />
      <span>{t('trip.savedDevice')}</span>
      {authConfigured && onRequestAuth && (
        <Button variant="quiet" size="sm" className="trip-device-signin" onClick={onRequestAuth}>{t('trip.savedDeviceSignIn')}</Button>
      )}
    </p>
  ) : null;



  // What lies over either view: the save notice, the trip settings, the day
  // questions and the device-or-account choice.
  const overlays = (
    <>
      {saveNotice && (
        <div className="trip-save-toast" role="status">{saveNotice}</div>
      )}

      {chipOpen && (
        <ChipEditor
          kind={chipOpen.kind}
          anchorRef={chipOpen.ref}
          trip={{
            tripStart: tp.tripStart, tripEnd: tp.tripEnd, stops: tp.stops, stopDetails: tp.stopDetails,
            plannedNights: tp.plannedNights, party: { adults: tp.groupSize, children: tp.children, babies: tp.babies },
          }}
          quoteDelta={tp.quoteDelta}
          onSave={(v) => saveChip(chipOpen.kind, v)}
          onClose={() => { const el = chipOpen.ref?.current; setChipOpen(null); el?.focus?.(); }}
        />
      )}

      {shareOpen && (
        <ShareSheet
          anchorRef={shareOpen.ref}
          title={tripName || t('itin.myTrip')}
          visibility={tripSet.trip?.visibility || 'private'}
          onVisibility={(v) => {
            const cur = fromDraft(plannerStore.getState());
            saveTripSet({ ...cur, trip: { ...cur.trip, visibility: v } });
          }}
          sharePayload={sharePayload}
          onPdf={downloadPdf}
          onMore={() => {
            setTripTab('itinerary');
            window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
              document.getElementById('itin-export-h')?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
            }));
          }}
          onClose={() => { const el = shareOpen.ref?.current; setShareOpen(null); el?.focus?.(); }}
        />
      )}

      {dayTripAt != null && tp.stopDetails[dayTripAt] && (
        <DayTripPicker
          stop={tp.stopDetails[dayTripAt]}
          destinations={data?.destinations || NO_DESTINATIONS}
          cost={(id, day) => tp.quoteDelta({
            stops: tp.stops.map((s, j) => (j === dayTripAt ? { ...s, dayTrips: [...(s.dayTrips || []), { destinationId: id, day }] } : s)),
          })}
          onPick={(id, day) => {
            const s = tp.stops[dayTripAt];
            tp.setStopDayTrips(dayTripAt, [...(s.dayTrips || []), { destinationId: id, day }]);
            setDayTripAt(null);
          }}
          onClose={() => setDayTripAt(null)}
        />
      )}

      {swapAt != null && tp.stopDetails[swapAt] && (
        <SwapCity
          stop={tp.stopDetails[swapAt]}
          destinations={data?.destinations || NO_DESTINATIONS}
          exclude={tp.stops.map((s) => s.destinationId)}
          delta={(id) => tp.quoteDelta({ stops: tp.stops.map((s, j) => (j === swapAt ? { ...s, destinationId: id } : s)) })}
          onPick={(id) => { tp.swapStop(swapAt, id); setSelectedStop(null); setSwapAt(null); }}
          onClose={() => setSwapAt(null)}
        />
      )}

      {flightSheet && (
        <ChangeFlight
          dir={flightSheet}
          cartaFlight={tp.priced?.cartaFlight}
          answers={tp.liveAnswers}
          prefs={tp.flightPrefs}
          onPrefs={tp.setFlightPrefs}
          onPick={tp.setFlightPick}
          party={{ paying: tp.groupSize + tp.children, babies: tp.babies, bagKey: tp.baggage }}
          onOwnFare={(dir) => {
            setFlightSheet(null);
            setTripTab('itinerary');
            window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
              const el = document.getElementById(dir === 'back' ? 'paid-back' : 'paid-out');
              el?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
              el?.focus?.({ preventScroll: true });
            }));
          }}
          onClose={() => setFlightSheet(null)}
        />
      )}

      {toast && (
        <TripUndoToast
          change={toast.change}
          note={toast.note}
          cityOf={cityOf}
          onUndo={hist.canUndo ? () => { hist.undo(); setToast(null); } : null}
          onClose={closeToast}
        />
      )}

      {settingsOpen && (
        <TripSettingsSheet anchorRef={settingsGearRef} onClose={() => setSettingsOpen(false)} onSaved={applySettings} planned />
      )}

      {askDays && (
        <DaysPrompt
          skipAsk
          onClose={() => setAskDays(false)}
          onPlan={(how) => {
            setAskDays(false);
            // T674: Carta plans: the first day opens with the plan at work;
            // planning yourself: the days overview with the ideas.
            onPlanDay(how === 'carta'
              ? { planId: tp.planId, stopIndex: 0, dayIndex: 0, autoFill: true }
              : { planId: tp.planId, stopIndex: 0, dayIndex: 0, overview: true });
          }}
        />
      )}

      {keepChoice && (
        <KeepTripChoice
          device={keepChoice.stored}
          account={keepChoice.account}
          onKeepDevice={keepDeviceTrip}
          onKeepAccount={keepAccountTrip}
          onClose={() => setKeepChoice(null)}
        />
      )}
    </>
  );

  // T819-T821: a planned trip is one page in tabs, the page it lands on
  // after Finish and whenever it is opened from Plan: Overview (what it
  // costs, the route), Itinerary (the planner's detail), Costs (the receipt)
  // and Days. See trip details is the Itinerary tab; Edit trip is the stop
  // editor (the workspace below), and Done comes back here.
  // T830: Edit trip is the same page in edit mode, the editor where the
  // tabs' body goes, so the trip never jumps to a second layout.
  // T832: this is the only layout of a trip with stops; the old half-screen
  // map workspace is gone, and the wizard opens over this page as a sheet.
  {
    const saved = tp.saveState === 'saved' || keptHere;
    const cardMap = (
      <TripMap
        {...routeProps}
        onSelectStop={undefined}
        selectedIndex={null}
        padBottom={24}
        fitPadding={CARD_MAP_PAD}
        scrollZoom={false}
        easeToSelected={false}
        cooperativeGestures={false}
      />
    );
    const fullMap = (
      <TripMap {...routeProps} onSelectStop={undefined} selectedIndex={null} padBottom={24} fitPadding={FULL_MAP_PAD} fitMaxZoom={9} />
    );
    return (
      <div className="trip-planner-screen trip-planner-blank">
        <div className="pf is-trip is-trip-page">
          {saveError && <ErrorBlock className="trip-footer-error" message={saveError} />}
          <TripSummary
            onRename={renameTrip}
            onChip={(kind, ref) => {
              // The chip rises near the top first, so the editor hung from it
              // has the screen under it (T836).
              const el = ref?.current;
              if (el && el.getBoundingClientRect().top > window.innerHeight * 0.4) el.scrollIntoView({ block: 'start' });
              setChipOpen({ kind, ref });
            }}
            budgetCard={(
              <BudgetCard
                priced={tp.priced}
                party={headCount}
                nights={tp.plannedNights}
                budget={tripSet.guide?.budget}
                compact
                onSave={(b) => {
                  const cur = fromDraft(plannerStore.getState());
                  saveTripSet({ ...cur, guide: { ...cur.guide, budget: b } });
                }}
              />
            )}
            // T863: a trip from Find my flight first or I've booked part of it
            // offers the rest: the Itinerary's Add a stop, opened.
            onPlanRest={PARTIAL_DOORS.includes(tripSet.door) ? () => {
              setTripTab('itinerary');
              window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
                const li = document.querySelector('.itin-add');
                const open = li?.querySelector(':scope > button');
                if (open) open.click();
                li?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
                window.requestAnimationFrame(() => li?.querySelector('button, input, [tabindex]')?.focus?.({ preventScroll: true }));
              }));
            } : null}
            // T866: what the traveller booked is marked as booked on the route.
            booked={{
              flights: Boolean(tp.ownFlight?.booked),
              stays: tripSet.booked?.stays ? staysFromImports(tripSet.imports, data?.destinations || {}, tripSet.when).map((r) => r.id) : [],
            }}
            // T873: Ready to book writes the same fields as the Itinerary.
            book={{ onTravelPaid: setTravelPaid, onOwnStay: tp.setOwnStay, onOwnLeg: (i, mode, n) => tp.setOwnLeg(i, mode, n) }}
            carTip={carTip}
            // T887: the car the advice names, added with what it does to the total.
            onCar={carTip && carTip.verdict !== 'no' ? () => tp.setTransportPref('car') : null}
            carDelta={carDelta}
            onAddPaid={() => {
              // T839: what was paid goes in on the route, where each part is.
              setTripTab('itinerary');
              window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
                const el = document.getElementById('paid-out') || document.querySelector('#itin-fare-out button, .itin-bed .plan-paid button');
                el?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
                el?.focus?.({ preventScroll: true });
              }));
            }}
            name={tripName}
            tripStart={tp.tripStart}
            tripEnd={tp.tripEnd}
            party={{ adults: tp.groupSize, children: tp.children, babies: tp.babies }}
            stopDetails={tp.stopDetails}
            stayCosts={tp.stayCosts}
            stayTier={tp.stayTier}
            priced={tp.priced}
            flight={tp.flight}
            ownFlight={tp.ownFlight}
            driveLegs={tp.driveLegs}
            origin={tripOrigin}
            tab={tripTab}
            onTab={setTripTab}
            history={tp.planned ? { canUndo: hist.canUndo, canRedo: hist.canRedo, undo: () => { hist.undo(); setToast(null); }, redo: () => { hist.redo(); setToast(null); } } : null}
            panels={{
              itinerary: renderItinerary(['route', 'tools', 'export', 'before']),
              costs: renderItinerary(['receipt'], true),
              // T849-T851: the Days tab, each day as a card of what it holds.
              days: (
                <TripDays
                  dayPlan={tp.dayPlan}
                  dayTrips={tp.priced?.dayTrips || []}
                  planKey={tp.planId || TRIP_DRAFT_PLAN_ID}
                  onPlanDay={onPlanDay ? (day) => onPlanDay({ planId: tp.planId, stopIndex: day.stopIndex, dayIndex: day.dayOfStay - 1 }) : null}
                  onCartaPlan={onPlanDay ? () => onPlanDay({ planId: tp.planId, stopIndex: 0, dayIndex: 0, autoFill: true }) : null}
                />
              ),
            }}
            map={cardMap}
            mapFull={fullMap}
            onPlanHome={onPlanHome}
            onPlanDays={onPlanDay ? () => setAskDays(true) : null}
            onSettings={() => setSettingsOpen(true)}
            settingsRef={settingsGearRef}
            onExport={(ref) => setShareOpen({ ref: ref || null })}
            bar={(
              <>
                <IconButton tone="surface" className="ts-save" pressed={saved}
                  label={tp.saveState === 'saving' ? t('trip.saving') : saved ? t('trip.savedTick') : tp.planId ? t('trip.updateTrip') : t('trip.saveTrip')}
                  disabled={tp.saveState === 'saving'} onClick={handleSave}>
                  <BookmarkIcon size={20} />
                </IconButton>
                {/* T832: what the old workspace's More held (Replan route,
                    Start over) lives on the trip page's top row now. */}
                <MoreMenu
                  round
                  items={[
                    // T835: on a phone and a tablet Undo and Redo live here;
                    // from 1024 px they sit at the end of the tab row.
                    !wideTrip && hist.canUndo && { key: 'undo', className: 'trip-undo-item', label: t('saved.undo'), onClick: () => { hist.undo(); setToast(null); } },
                    !wideTrip && hist.canRedo && { key: 'redo', className: 'trip-redo-item', label: t('tp.undo.redo'), onClick: () => { hist.redo(); setToast(null); } },
                    // T885: Trip settings left the top row's gear for here.
                    { key: 'settings', className: 'trip-settings-item', label: t('pf.settings'), onClick: () => setSettingsOpen(true) },
                    tp.stopDetails.length >= 3 && { key: 'replan', className: 'trip-plan-again-btn', label: t('trip.replanRoute'), title: t('trip.replanTitle'), onClick: () => tp.optimizeRoute() },
                    { key: 'over', className: 'trip-startover-btn', label: t('trip.startOver'), title: t('trip.startOverTitle'), danger: true, onClick: handleStartOver },
                  ]}
                />
              </>
            )}
            footer={(
              <>
                {saveStatus}
              </>
            )}
          />
        </div>
        {overlays}
        {wizardOpen && (
          <GuidedTripWizard data={data} stayTier={tp.stayTier} lifestyle={lifestyle} favorites={favorites} onOpenDest={onOpenDest} onOpenCountry={onOpenCountry} onOpenTrip={onOpenTrip} onCancel={() => setWizardOpen(false)} onComplete={handleWizardComplete} seed={tripSeed} onSeedConsumed={onTripSeedConsumed} />
        )}
      </div>
    );
  }
});
