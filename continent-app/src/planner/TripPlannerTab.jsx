import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// The rules only this route renders load with its chunk (T474, CSS per route;
// scripts/css-routes.mjs).
import '../styles/planners.css';
import { Dropdown } from '../components/Dropdown.jsx';
import { favDestIds } from '../lib/favorites.js';
import { Button } from '../components/Button.jsx';
import { ErrorBlock } from '../components/StateBlocks.jsx';
import { TripMap } from '../map/TripMap.jsx';
import { GuidedTripWizard } from './GuidedTripWizard.jsx';
import { TripFlow } from './flow/TripFlow.jsx';
import { usePlannerStore, plannerStore } from './plannerStore.js';
import { fromDraft } from './flow/tripSettings.js';
import { useTripSettings } from './flow/flowHooks.js';
import { syncParty, syncWhen } from './flow/appSync.js';
import { useSettings } from '../components/SettingsLine.jsx';
import { useMedia } from '../browse/home/useHome.js';
import { offeredStayTiers } from '../lib/runtime_pricing.js';
import { offeredSleepGroups, optionsFor } from '../lib/sleepGroups.js';
import { PlanStage } from './flow/PlanStage.jsx';
import { loadDeviceTrip } from './deviceTripStore.js';
import { CheapTipsSection } from './CheapTipsSection.jsx';
import { eurExact } from '../lib/format.js';
import { fmtDate } from '../lib/dates.js';
import { movedWindow, nightsBetween } from '../lib/tripDates.js';
import { useTripPlanner } from '../hooks/useTripPlanner.js';
import { useLifestyleLabel } from './planHooks.js';
import { useCountryInsights } from '../hooks/useCountryInsights.js';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { useI18n } from '../i18n/index.jsx';
import { loadAssignments, TRIP_DRAFT_PLAN_ID } from './dayPlanStore.js';
import { SparkIcon, TrainIcon, CarIcon, BulbIcon } from '../components/Icons.jsx';
import { Chip, ChipGroup } from '../components/ui/index.js';
import { cityLabel } from '../lib/placeName.js';
import { scrollBehavior } from '../lib/motion.js';
import { originLabel } from '../lib/origins.js';
import { isGateway } from '../lib/rating.js';
import { OwnCarFromEditor } from './trip/OwnCarFromEditor.jsx';
import { ShortlistStops, Suggestions } from './trip/Suggestions.jsx';
import { KeepTripChoice } from './trip/KeepTripChoice.jsx';
import { TripPageSummary } from './trip/TripPageSummary.jsx';
import { NO_DESTINATIONS } from './trip/tripPlannerConsts.js';
import { TripOverlays } from './trip/TripOverlays.jsx';
import { TripItineraryView } from './trip/TripItineraryView.jsx';
import { useTripSave } from './trip/useTripSave.js';
import { useTripMap } from './trip/useTripMap.js';
import { useTripPlannerEffects } from './trip/useTripPlannerEffects.js';
import { useTripHistory } from './trip/useTripHistory.js';

// The trip page's map card and its full-size view (T819): room above each
// pin, which is drawn about 38 px over its point (tripmap-embed gotchas).
const CARD_MAP_PAD = { top: 64, left: 40, right: 150, bottom: 36 };
const FULL_MAP_PAD = { top: 110, left: 80, right: 200, bottom: 80 };


// The trip page's tabs, in order (T819); the address carries one (T828).
// T1015: 'notes' was missing, so every tap on the Notes tab fell back to
// the Overview (the tab never opened).
const TRIP_TABS = ['overview', 'itinerary', 'costs', 'days', 'notes'];









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
  const { hist, toast, setToast, noteRef, headCount, carTip, carDelta } = useTripHistory({ app, countryInsights, lang, saveTripSet, t, tp, tripSet, wizardOpen });

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
  const closeToast = useCallback(() => setToast(null), [setToast]);
  const cityOf = (id) => cityLabel(data?.destinations?.[id]?.city || '');
  const { handleStartOver } = useTripPlannerEffects({
    destinations, hist, onOpenPlanConsumed, onSharedTripConsumed, openPlanId, openSharedTrip,
    selectedStop, setChipOpen, setDeviceTrip, setSaveError, setSelectedStop, setToast,
    setTripTab, setView, setWizardOpen, stopRefs, t, tp, tripSeed,
  });

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
  const { trace, pinStops, toStop, toMapIndex, tripRoute, tripRouteOk } = useTripMap({ data, pinTag, t, tp });

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

  const { handlePendingCountry, handleSave, keptHere, keepDeviceTrip, keepAccountTrip } = useTripSave({
    deviceTrip, keepChoice, migrating, paywall, pendingMove, setDeviceError, setDeviceTrip,
    setKeepChoice, setPendingCountry, setPendingDestId, setPendingMove, setSaveError,
    setSaveNotice, setSelectedStop, t, tp, user,
  });

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
    <TripItineraryView
      addStopBlock={addStopBlock} beforeYouGo={beforeYouGo} betweenBlock={betweenBlock}
      cheaperBlock={cheaperBlock} data={data} downloadPdf={downloadPdf} grouped={grouped}
      isDayPlanned={isDayPlanned} onPlanDay={onPlanDay} onReceiptLine={onReceiptLine}
      receiptKey={receiptKey} sections={sections} selectedStop={selectedStop}
      setFlightSheet={setFlightSheet} setSelectedStop={setSelectedStop}
      setTravelPaid={setTravelPaid} sharePayload={sharePayload} stopEdit={stopEdit} tp={tp}
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
          // T1012: the mode's icon in the chip's own icon slot, so it and
          // the words sit on one centre line (it was inline in the label).
          <Chip key={k} kind="choice" selected={tp.transportPref === k} onClick={() => tp.setTransportPref(k)}
            icon={React.createElement(ModeIco, { size: 18 })}>
            {t(lbl)}
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
    <TripOverlays
      applySettings={applySettings} askDays={askDays} chipOpen={chipOpen} cityOf={cityOf}
      closeToast={closeToast} data={data} dayTripAt={dayTripAt} downloadPdf={downloadPdf}
      flightSheet={flightSheet} hist={hist} keepAccountTrip={keepAccountTrip}
      keepChoice={keepChoice} keepDeviceTrip={keepDeviceTrip} onPlanDay={onPlanDay}
      saveChip={saveChip} saveNotice={saveNotice} saveTripSet={saveTripSet}
      setAskDays={setAskDays} setChipOpen={setChipOpen} setDayTripAt={setDayTripAt}
      setFlightSheet={setFlightSheet} setKeepChoice={setKeepChoice}
      setSelectedStop={setSelectedStop} setSettingsOpen={setSettingsOpen}
      setShareOpen={setShareOpen} setSwapAt={setSwapAt} setToast={setToast}
      setTripTab={setTripTab} settingsGearRef={settingsGearRef} settingsOpen={settingsOpen}
      shareOpen={shareOpen} sharePayload={sharePayload} swapAt={swapAt} t={t} toast={toast}
      tp={tp} tripName={tripName} tripSet={tripSet}
    />
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
          <TripPageSummary
            carDelta={carDelta} carTip={carTip} cardMap={cardMap} data={data} fullMap={fullMap}
            handleSave={handleSave} handleStartOver={handleStartOver} headCount={headCount}
            hist={hist} onPlanDay={onPlanDay} onPlanHome={onPlanHome} renameTrip={renameTrip}
            renderItinerary={renderItinerary} saveChip={saveChip} saveStatus={saveStatus}
            saveTripSet={saveTripSet} saved={saved} setAskDays={setAskDays}
            setChipOpen={setChipOpen} setFlightSheet={setFlightSheet}
            setSettingsOpen={setSettingsOpen} setShareOpen={setShareOpen} setToast={setToast}
            setTravelPaid={setTravelPaid} setTripTab={setTripTab}
            settingsGearRef={settingsGearRef} t={t} tp={tp} trace={trace} tripName={tripName}
            tripOrigin={tripOrigin} tripSet={tripSet} tripTab={tripTab} wideTrip={wideTrip}
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
