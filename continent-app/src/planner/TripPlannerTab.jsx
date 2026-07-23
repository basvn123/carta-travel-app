import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dropdown } from '../components/Dropdown.jsx';
import { DateField } from '../components/DateField.jsx';
import { OriginPicker } from '../components/OriginPicker.jsx';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { CountryIntel } from '../components/CountryIntel.jsx';
import { TripMap } from '../map/TripMap.jsx';
import { TripItinerary, TransferModePicker } from './TripItinerary.jsx';
import { GuidedTripWizard } from './GuidedTripWizard.jsx';
import { StarterTrips } from './StarterTrips.jsx';
import { CheapTipsSection } from './CheapTipsSection.jsx';
import { eur, fmtHours, flightTimes } from '../lib/format.js';
import { fmtDate } from '../lib/dates.js';
import { fetchDrivingRoute } from '../lib/routing.js';
import { useTripPlanner } from '../hooks/useTripPlanner.js';
import { useCountryInsights } from '../hooks/useCountryInsights.js';
import { useI18n } from '../i18n/index.jsx';
import { loadAssignments, TRIP_DRAFT_PLAN_ID } from './dayPlanStore.js';
import { SparkIcon, TrainIcon, BusIcon, CarIcon, BulbIcon, InfoIcon, ReceiptIcon, BedIcon } from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { knownForFacts } from '../lib/knownFor.js';
import { flightReasonLabel } from '../lib/trip_planner_pricing.js';
import { geocodeAddress } from '../lib/geocode.js';
import { carrierName } from '../lib/carriers.js';

const SHEET_H_KEY = 'carta.tripSheetH.v1';

// Small circular progress ring for "planned vs available nights".
function NightsRing({ planned, total }) {
  const pct = total > 0 ? Math.min(1, planned / total) : 0;
  const r = 15;
  const c = 2 * Math.PI * r;
  const over = total > 0 && planned > total;
  return (
    <svg className="nights-ring" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r={r} className="nights-ring-track" fill="none" strokeWidth="3" />
      <circle
        cx="20" cy="20" r={r} fill="none" strokeWidth="3" strokeLinecap="round"
        className={`nights-ring-arc ${over ? 'over' : ''}`}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 20 20)"
      />
    </svg>
  );
}

function Stepper({ value, onChange, min = 0, max = 60, suffix }) {
  const { t } = useI18n();
  return (
    <div className="trip-stepper">
      <button type="button" className="trip-step-btn" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={t('trip.fewer')}>-</button>
      <div className="trip-step-val">
        <span className="trip-step-num">{value}</span>
        {suffix && <span className="trip-step-suffix">{suffix(value)}</span>}
      </div>
      <button type="button" className="trip-step-btn" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={t('trip.more')}>+</button>
    </div>
  );
}

// `label` is an i18n key, render it through t().
const MODE_META = {
  train: { Icon: TrainIcon, label: 'trip.modeTrain' },
  bus: { Icon: BusIcon, label: 'trip.modeBus' },
  car: { Icon: CarIcon, label: 'trip.modeCar' },
};
const ModeIcon = ({ mode, size = 13 }) => {
  const I = MODE_META[mode]?.Icon;
  return I ? <I size={size} className="trip-mode-icon" /> : null;
};

/** One overland leg between two stops: the chosen mode inline, expandable to
 *  compare all three (train/bus/car), switch mode, and jump to booking links. */
function LegRow({ leg, onMode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!leg) return <div className="trip-leg">↳ {t('trip.routeUnknown')}</div>;
  if (leg.no_road || !leg.mode) return <div className="trip-leg">↳ {leg.note || t('trip.noOverland')}</div>;
  const chosen = leg.modes[leg.mode];
  return (
    <div className="trip-leg trip-leg-rich">
      <button className="trip-leg-main" onClick={() => setOpen(!open)} aria-expanded={open}>
        ↳ <ModeIcon mode={leg.mode} /> {t('trip.legSummary', { mode: t(MODE_META[leg.mode].label), km: leg.road_km, price: eur(chosen.eur_pp), hours: fmtHours(chosen.hours) })}
        {leg.long_haul ? `, ${t('trip.longLeg')}` : ''}
        <span className="trip-leg-caret">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="trip-leg-detail">
          <div className="trip-leg-modes">
            {Object.entries(leg.modes).map(([m, o]) => (
              <button
                key={m}
                className={`trip-leg-mode ${leg.mode === m ? 'on' : ''}`}
                onClick={() => onMode(m)}
                title={leg.recommended === m ? t('trip.cartaPick') : undefined}
              >
                <span><ModeIcon mode={m} /> {t(MODE_META[m].label)}{leg.recommended === m && <span className="guide-reco-mark"><SparkIcon size={10} /></span>}</span>
                <b>{t('trip.perPersonShort', { price: eur(o.eur_pp) })}</b>
                <small>~{fmtHours(o.hours)}</small>
              </button>
            ))}
          </div>
          {chosen.note && <p className="trip-leg-note">{chosen.note}</p>}
          <div className="trip-leg-links">
            {chosen.links.map((l, j) => (
              <a key={j} href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>
            ))}
          </div>
          <p className="trip-leg-disclaimer">{t('trip.legDisclaimer')}</p>
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
            title={t('trip.suggestFrom', { city: s.city, country: s.country, km: s.km, from: s.shared_origin || t('trip.overland') })}
          >
            <div className="trip-suggest-thumb" style={s.image ? { backgroundImage: `url(${s.image})` } : undefined}>
              {!s.image && <span className="trip-suggest-fallback">{s.city.slice(0, 1)}</span>}
              {s.reason && <span className="trip-suggest-chip">{s.reason}</span>}
            </div>
            <div className="trip-suggest-meta">
              <span className="trip-suggest-city">{s.city}</span>
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

export function TripPlannerTab({ data, user, authConfigured, onRequestAuth, openPlanId, onOpenPlanConsumed, origin, onChangeOrigin, onPlanDay, openSharedTrip, onSharedTripConsumed }) {
  const { t } = useI18n();
  const countryInsights = useCountryInsights();
  const tp = useTripPlanner(data, countryInsights);
  const destinations = data?.destinations || {};
  const dateMin = data?.meta?.start_date;
  const dateMax = data?.meta?.end_date;

  const [pendingCountry, setPendingCountry] = useState('');
  const [pendingDestId, setPendingDestId] = useState('');
  // Which stop's "what is this city known for" facts are expanded (index|null).
  const [stopInfoIdx, setStopInfoIdx] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [sheetH, setSheetH] = useState(340);
  const [selectedStop, setSelectedStop] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  // Mobile only: the planner opens from a clean "Plan your trip" launcher rather
  // than dumping the whole bottom sheet on screen at once. Inert on desktop,
  // where the sheet is a permanent left column (see isNarrow below).
  const [sheetOpen, setSheetOpen] = useState(false);
  // Remembered panel height (px). null = auto (content height).
  const [sheetHeight, setSheetHeight] = useState(() => {
    if (typeof window === 'undefined') return null;
    const v = Number(localStorage.getItem(SHEET_H_KEY));
    return v > 0 ? v : null;
  });
  const [dragging, setDragging] = useState(false);
  // Below 768px the panel is a draggable bottom sheet; above it's a fixed
  // full-height left column (so it never overlaps the bottom nav and the map
  // fills the right). The grip drag/height only applies in the narrow layout.
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
  );
  const sheetRef = useRef(null);
  const stopRefs = useRef({});
  const dragRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (e) => setIsNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const persistHeight = (h) => {
    try { localStorage.setItem(SHEET_H_KEY, String(Math.round(h))); } catch { /* private mode */ }
  };

  // Drag the grip to raise the sheet clear of the bottom nav (or tuck it away);
  // a plain tap toggles between a small peek and (nearly) full height.
  const onGripDown = (e) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    dragRef.current = { startY: e.clientY, startH: sheet.offsetHeight, moved: false };
    setDragging(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
  };
  const onGripMove = (e) => {
    if (!dragRef.current) return;
    const screen = sheetRef.current?.parentElement;
    if (!screen) return;
    const dy = dragRef.current.startY - e.clientY; // drag up → taller
    if (Math.abs(dy) > 4) dragRef.current.moved = true;
    const maxH = screen.clientHeight - 14;
    setSheetHeight(Math.max(120, Math.min(maxH, dragRef.current.startH + dy)));
  };
  const onGripUp = (e) => {
    const st = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* older browsers */ }
    const screen = sheetRef.current?.parentElement;
    if (!st || !screen) return;
    if (st.moved) {
      persistHeight(sheetRef.current.offsetHeight);
    } else {
      // Tap: toggle peek ↔ expanded around the halfway mark.
      const maxH = screen.clientHeight - 14;
      const next = sheetRef.current.offsetHeight > screen.clientHeight * 0.5 ? 150 : maxH;
      setSheetHeight(next);
      persistHeight(next);
    }
  };

  // The wizard hands over a trip Carta already arranged (routed from the
  // fly-in, days filled from the interests), show it planned right away, with
  // the route on the map. Edit / Replan / Start over stay one tap away.
  const handleWizardComplete = (selection) => {
    tp.loadFromWizard(selection);
    tp.setPlanned(true);
    setWizardOpen(false);
    setSelectedStop(null);
    setSheetOpen(true);
  };

  const handleStartOver = () => {
    if (!window.confirm(t('trip.confirmStartOver'))) return;
    tp.clearPlan();
    setSelectedStop(null);
    setSaveError('');
    if (isNarrow) setSheetOpen(false);
  };

  // Leave the planned overview without touching the trip: drop back to the
  // standard planner (the launcher on mobile, the map on desktop). Nothing is
  // saved, deleted or edited, it's just an escape hatch off this screen.
  const handleExitOverview = () => {
    tp.clearPlan();
    tp.setPlanned(false);
    setSelectedStop(null);
    setSaveError('');
    if (isNarrow) setSheetOpen(false);
  };

  // A trip plan chosen from the Saved-trips overview: load it and switch
  // straight to its planned view, or, for { id, edit: true }, into the
  // editable stop list so dates/stops can be changed right away.
  useEffect(() => {
    if (!openPlanId) return;
    const planId = typeof openPlanId === 'object' ? openPlanId.id : openPlanId;
    const editMode = typeof openPlanId === 'object' && openPlanId.edit;
    tp.loadPlan(planId).then(() => {
      tp.setPlanned(!editMode);
      setSelectedStop(null);
      setSheetOpen(true);
    }).catch(() => {
      // A failed fetch used to leave the tab silently stuck; surface it instead.
      setSaveError(t('trip.openFailed'));
    });
    onOpenPlanConsumed && onOpenPlanConsumed();
  }, [openPlanId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      });
      // The sender's trip name wins here (loadFromWizard treats its label as a
      // fallback so wizard runs never clobber a typed name; a share must).
      tp.setPlanLabel(d.label || '');
      Object.entries(d.legModes || {}).forEach(([i, m]) => tp.setLegMode(Number(i), m));
      tp.setPlanned(true);
      setSelectedStop(null);
      setSheetOpen(true);
    }
    onSharedTripConsumed && onSharedTripConsumed();
  }, [openSharedTrip]); // eslint-disable-line react-hooks/exhaustive-deps

  // Selecting a stop (via pin or card) scrolls its card into view.
  useEffect(() => {
    if (selectedStop == null) return;
    stopRefs.current[selectedStop]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedStop]);

  // Drop the highlight if the selected stop was removed/reordered out of range.
  useEffect(() => {
    if (selectedStop != null && selectedStop >= tp.stopDetails.length) setSelectedStop(null);
  }, [tp.stopDetails.length, selectedStop]);

  // Keep the map's bottom padding in sync with however tall the sheet is, so
  // the whole route stays visible in the strip above it.
  useEffect(() => {
    const el = sheetRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setSheetH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
          .filter(([, d]) => d.country === pendingCountry)
          .map(([id, d]) => ({ value: id, label: d.city }))
          .sort((a, b) => a.label.localeCompare(b.label))
      : []),
    [destinations, pendingCountry],
  );

  const hasDates = tp.tripStart && tp.tripEnd && tp.windowNights > 0;
  // The inline builder is now only an editor for a trip that already exists,   // opened from Saved trips' "Edit", or "Edit stops" on a planned trip. A fresh
  // trip planner shows only the guide launcher; new trips are built by the wizard.
  const hasTrip = tp.stopDetails.length > 0;
  const mapStops = tp.stopDetails
    .filter((s) => s.dest && s.dest.lat != null && s.dest.lon != null)
    .map((s) => ({ lat: s.dest.lat, lon: s.dest.lon, city: s.dest.city }));

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
  }, [routeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const tripRouteOk = tripRoute && tripRoute.key === routeKey;

  const addPending = () => {
    if (!pendingDestId) return;
    tp.addStop(pendingDestId);
    setPendingDestId('');
  };

  const handlePendingCountry = (c) => {
    setPendingCountry(c);
    setPendingDestId(''); // city choice no longer valid once the country changes
  };

  const handleSave = async () => {
    setSaveError('');
    if (!user) { onRequestAuth && onRequestAuth(); return; }
    const wasUpdate = Boolean(tp.planId);
    const fromEdit = !tp.planned;
    try {
      await tp.savePlan(user.id);
      setSaveNotice(wasUpdate ? t('trip.updatedNotice') : t('trip.savedNotice'));
      window.setTimeout(() => setSaveNotice(''), 3500);
      if (fromEdit && wasUpdate) {
        // Done editing an existing trip: hand the traveller back to the Trip
        // planner's start page (the trip itself is safe under Saved trips).
        tp.clearPlan();
        setSelectedStop(null);
        if (isNarrow) setSheetOpen(false);
      }
    } catch (e) {
      setSaveError(e?.message || t('trip.saveFailed'));
    }
  };

  const groundTotal = tp.legs.reduce((sum, l) => sum + (l ? l.ground_total : 0), 0);
  // Anchor-city connection legs ("fly into Bergamo, then get to Como"), real
  // journeys that belong in the receipt next to the flights they bracket.
  const AnchorLegRow = ({ leg, from, to }) => {
    if (!leg || !leg.ground_total) return null;
    const Icon = (leg.mode === 'taxi' || leg.mode === 'rental' || leg.mode === 'car') ? CarIcon
      : (leg.mode === 'public' || leg.mode === 'bus') ? BusIcon : TrainIcon;
    return (
      <div className="trip-total-row">
        <span className="lbl">
          <Icon size={11} /> {from} → {to}
          <small>{t('trip.legStats', { km: leg.road_km, hours: fmtHours(leg.hours) })}</small>
        </span>
        <span className="val">{eur(leg.ground_total)}</span>
      </div>
    );
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

  // Planned-view actions, pinned at the BOTTOM of the sheet on every layout:
  // one primary Save/Update, then the plainly-labelled secondary actions.
  const plannedActionButtons = (
    <>
      <button className="trip-save-planned-btn" onClick={handleSave} disabled={tp.saveState === 'saving'}>
        {tp.saveState === 'saving' ? t('trip.saving') : tp.saveState === 'saved' ? t('trip.savedTick') : tp.planId ? t('trip.updateTrip') : t('trip.saveTrip')}
      </button>
      <div className="trip-planned-secondary">
        <button
          className="trip-edit-btn"
          onClick={() => { tp.setPlanned(false); setSheetOpen(true); }}
          title={t('trip.editStopsTitle')}
        >
          {t('trip.editStops')}
        </button>
        {tp.stopDetails.length >= 3 && (
          <button className="trip-plan-again-btn" onClick={() => tp.optimizeRoute()} title={t('trip.replanTitle')}>↻ {t('trip.replanRoute')}</button>
        )}
        <button className="trip-startover-btn" onClick={handleStartOver} title={t('trip.startOverTitle')}>{t('trip.startOver')}</button>
      </div>
    </>
  );

  return (
    <div className="trip-planner-screen">
      <TripMap
        stops={mapStops}
        padBottom={isNarrow ? (sheetOpen ? sheetH : 96) : 48}
        onSelectStop={setSelectedStop}
        selectedIndex={selectedStop}
        routeGeometry={tripRouteOk ? tripRoute.geometry : null}
        routeSegments={tripRouteOk ? tripRoute.segments : null}
      />

      {/* Mobile: a clean launcher card over the map until the traveller chooses
          to start. Trips are built through the guide, so "Plan your trip" opens
          the wizard straight away. Never shown on desktop (isNarrow) or once a
          plan exists. */}
      {isNarrow && !sheetOpen && !tp.planned && (
        <div className="trip-launcher" onClick={(e) => e.stopPropagation()}>
          <div className="trip-launcher-card">
            <div className="trip-launcher-spark"><SparkIcon size={20} /></div>
            <h2 className="trip-launcher-title">{t('trip.planYourTrip')}</h2>
            <p className="trip-launcher-sub">{t('trip.launcherSub')}</p>
            <button className="trip-launcher-primary" onClick={() => setWizardOpen(true)}>{t('trip.planYourTrip')}</button>
          </div>
        </div>
      )}

      {/* Left panel (desktop) / bottom sheet (mobile) */}
      <div
        className={`trip-sheet ${dragging ? 'dragging' : ''} ${isNarrow && !sheetOpen && !tp.planned ? 'sheet-hidden' : ''}`}
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        style={isNarrow && sheetHeight != null ? { height: sheetHeight } : undefined}
      >
        <div
          className="trip-sheet-grip-hit"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          role="separator"
          aria-label={t('trip.gripAria')}
          title={t('trip.gripTitle')}
        >
          <div className="trip-sheet-grip" />
        </div>

        {/* Trip header. On phones the whole card doubles as a drag handle
            (the bare grip strip was too small a target to discover), so the
            sheet can be swiped down to reveal the map and back up again.
            The name input opts out - typing must not start a drag. */}
        <div
          className="trip-topcard"
          onPointerDown={isNarrow ? (e) => { if (!e.target.closest('input, button')) onGripDown(e); } : undefined}
          onPointerMove={isNarrow ? onGripMove : undefined}
          onPointerUp={isNarrow ? onGripUp : undefined}
          onPointerCancel={isNarrow ? onGripUp : undefined}
          style={isNarrow ? { touchAction: 'none' } : undefined}
        >
          {tp.planned && (
            <button
              className="trip-topcard-close"
              onClick={handleExitOverview}
              aria-label={t('trip.closeOverviewAria')}
              title={t('trip.closeOverviewTitle')}
            >
              ×
            </button>
          )}
          <input
            className="trip-topcard-name"
            value={tp.planLabel}
            onChange={(e) => tp.setPlanLabel(e.target.value)}
            placeholder={t('trip.namePlaceholder')}
            aria-label={t('trip.nameAria')}
          />
          <div className="trip-topcard-sub">
            {hasDates
              ? `${fmtDate(tp.tripStart)} → ${fmtDate(tp.tripEnd)}`
              : ''}
            {tp.stopDetails.length > 0 && (
              <span className="trip-topcard-count">{tp.stopDetails.length} {tp.stopDetails.length === 1 ? t('trip.stopOne') : t('trip.stopMany')}</span>
            )}
          </div>
        </div>

        <div className="trip-sheet-scroll">
          {tp.planned ? (
            <>
            <TripItinerary
              dayPlan={tp.dayPlan}
              label={tp.planLabel}
              stopDetails={tp.stopDetails}
              grandTotal={tp.grandTotal}
              groupSize={tp.groupSize}
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
              sharePayload={tp.stops.length ? {
                tripStart: tp.tripStart,
                stops: tp.stops,
                groupSize: tp.groupSize,
                transportPref: tp.transportPref,
                legModes: tp.legModes,
                pace: tp.pace,
                baggage: tp.baggage,
                anchorId: tp.anchorId,
                anchorOrigin: tp.anchorOrigin,
                returnAnchorId: tp.returnAnchorId,
                ownFlight: tp.ownFlight,
                label: tp.planLabel,
              } : null}
              onPlanDay={onPlanDay ? (day) => onPlanDay({
                planId: tp.planId,
                stopIndex: day.stopIndex,
                dayIndex: day.dayOfStay - 1,
              }) : null}
            />
            <CheapTipsSection
              stopDetails={tp.stopDetails}
              tripStart={tp.tripStart}
              transportPref={tp.transportPref}
              groupSize={tp.groupSize}
            />
            </>
          ) : hasTrip ? (
          <>
          {/* Step 1 - travel window */}
          <div className="trip-block">
            <div className="trip-block-title">{t('trip.whenTitle')}</div>
            <div className="trip-dates-row">
              <label className="trip-field">
                <span className="trip-field-label">{t('trip.start')}</span>
                <DateField value={tp.tripStart} min={dateMin} max={tp.tripEnd || dateMax} onChange={tp.setTripStart} placeholder={t('trip.startDate')} />
              </label>
              <span className="trip-dates-arrow">→</span>
              <label className="trip-field">
                <span className="trip-field-label">{t('trip.end')}</span>
                <DateField value={tp.tripEnd} min={tp.tripStart || dateMin} max={dateMax} onChange={tp.setTripEnd} placeholder={t('trip.endDate')} />
              </label>
            </div>
          </div>

          {/* Step 2 - where the trip starts from. Dates first, then this, then
              the stops - the same order a traveller actually decides things. */}
          {hasDates && onChangeOrigin && (
            <div className="trip-block">
              <div className="trip-block-title">{t('trip.whereFromTitle')}</div>
              <div className="trip-origin-row">
                <OriginPicker data={data} origin={origin} onChangeOrigin={onChangeOrigin} />
              </div>
            </div>
          )}

          {hasDates && (
            <>
              {/* Planned-nights indicator */}
              <div className="trip-nights-summary">
                <NightsRing planned={tp.plannedNights} total={tp.windowNights} />
                <div className="trip-nights-text">
                  <strong>{tp.plannedNights}/{tp.windowNights}</strong> {t('trip.nightsPlanned')}
                  {tp.plannedNights > tp.windowNights && <span className="trip-nights-warn"> {t('trip.overWindow')}</span>}
                </div>
              </div>

              {/* Stops list */}
              {tp.stopDetails.length > 0 && (
                <div className="trip-stops">
                  {tp.stopDetails.map((s, i) => (
                    <React.Fragment key={i}>
                      <div className="trip-stop-wrap">
                        <div
                          className={`trip-stop ${selectedStop === i ? 'active' : ''} ${dragIdx === i ? 'dragging' : ''}`}
                          ref={(el) => { stopRefs.current[i] = el; }}
                          onClick={() => setSelectedStop(i)}
                          onDragOver={(e) => { if (dragIdx != null) e.preventDefault(); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (dragIdx != null && dragIdx !== i) tp.reorderStop(dragIdx, i);
                            setDragIdx(null);
                          }}
                        >
                          <div
                            className="trip-stop-idx"
                            draggable
                            onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; }}
                            onDragEnd={() => setDragIdx(null)}
                            title={t('trip.dragReorder')}
                          >{i + 1}</div>
                          <div className="trip-stop-body">
                            <div className="trip-stop-city">
                              {s.dest ? s.dest.city : t('trip.unknown')}
                              {s.dest && (
                                <button
                                  className={`guide-city-info-btn ${stopInfoIdx === i ? 'open' : ''}`}
                                  onClick={(e) => { e.stopPropagation(); setStopInfoIdx(stopInfoIdx === i ? null : i); }}
                                  aria-expanded={stopInfoIdx === i}
                                  title={t('trip.aboutCity', { city: s.dest.city })}
                                ><InfoIcon size={12} /></button>
                              )}
                            </div>
                            <div className="trip-stop-when">
                              {s.arriveDate ? `${fmtDate(s.arriveDate, true)} → ${fmtDate(s.departDate, true)}` : t('trip.setDates')}
                            </div>
                          </div>
                          <Stepper
                            value={s.nights}
                            onChange={(n) => tp.setStopNights(i, n)}
                            suffix={(n) => (n === 1 ? t('trip.nightOne') : t('trip.nightMany'))}
                          />
                          <div className="trip-stop-tools" onClick={(e) => e.stopPropagation()}>
                            {i > 0 && <button className="trip-stop-move" onClick={() => tp.moveStop(i, -1)} aria-label={t('trip.moveUp')} title={t('trip.moveUp')}>↑</button>}
                            {i < tp.stopDetails.length - 1 && <button className="trip-stop-move" onClick={() => tp.moveStop(i, 1)} aria-label={t('trip.moveDown')} title={t('trip.moveDown')}>↓</button>}
                            <button className="trip-stop-remove" onClick={() => tp.removeStop(i)} aria-label={t('trip.removeStopAria')} title={t('trip.remove')}>×</button>
                          </div>
                        </div>
                        {/* Full width of the row (not squeezed into the narrow
                            body column alongside the stepper and tools), so
                            long facts read as normal sentences instead of
                            wrapping one word per line. */}
                        {stopInfoIdx === i && s.dest && (
                          <div className="guide-city-facts" onClick={(e) => e.stopPropagation()}>
                            {knownForFacts(s.dest).map(([label, value]) => (
                              <div className={`guide-city-fact ${label === 'Known for' ? 'guide-city-fact-known' : ''}`} key={label}>
                                <span className="guide-city-fact-label">{label}</span>
                                <span className="guide-city-fact-value">{value}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {i < tp.legs.length && (
                        <LegRow leg={tp.legs[i]} onMode={(m) => tp.setLegMode(i, m)} />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* How to travel between the stops */}
              {tp.stopDetails.length > 1 && (
                <div className="trip-block">
                  <div className="trip-block-title">{t('trip.betweenTitle')}</div>
                  <div className="trip-transport-seg">
                    {[
                      ['auto', SparkIcon, 'trip.cartaPicks'],
                      ['public', TrainIcon, 'trip.trainBus'],
                      ['car', CarIcon, 'trip.rentalCarOpt'],
                      ['owncar', CarIcon, 'trip.ownCarOpt'],
                    ].map(([k, I, lbl]) => (
                      <button
                        key={k}
                        className={tp.transportPref === k ? 'on' : ''}
                        onClick={() => tp.setTransportPref(k)}
                      ><I size={12} /> {t(lbl)}</button>
                    ))}
                  </div>
                  {tp.transportPref === 'car' && tp.carRental && (
                    <p className="trip-note">
                      {t('trip.carRentalNote', { total: eur(tp.carRental.eur_total), days: tp.carRental.days, perDay: eur(tp.carRental.eur_per_day), group: tp.groupSize })}
                    </p>
                  )}
                  {tp.transportPref === 'owncar' && (
                    <>
                      <p className="trip-note">{t('trip.ownCarNote')}</p>
                      <OwnCarFromEditor carHome={tp.carHome} setCarHome={tp.setCarHome} />
                    </>
                  )}
                </div>
              )}

              {/* Cheaper dates / cheaper order */}
              {tp.stopDetails.length > 0 && (tp.cheaperOrder
                || tp.cheaperDates.candidates.some((c) => c.saving_vs_current == null || c.saving_vs_current > 5)) && (
                <div className="trip-block trip-savings">
                  <div className="trip-block-title"><BulbIcon size={13} /> {t('trip.cheaperTitle')}</div>
                  {tp.cheaperOrder && (
                    <div className="trip-saving-row">
                      <span>{t('trip.cheaperOrder', { amount: eur(tp.cheaperOrder.saving_eur) })}</span>
                      <button onClick={tp.applyCheaperOrder}>{t('trip.reorder')}</button>
                    </div>
                  )}
                  {tp.cheaperDates.candidates
                    .filter((c) => c.saving_vs_current == null || c.saving_vs_current > 5)
                    .map((c) => (
                      <div className="trip-saving-row" key={c.start}>
                        <span>
                          {t('trip.cheaperStart')} <b>{fmtDate(c.start, true)}</b>{t('trip.cheaperFlights', { price: eur(c.total) })}
                          {c.saving_vs_current != null && c.saving_vs_current > 0 && (
                            <em className="trip-saving-amount"> - {t('trip.cheaperBy', { amount: eur(c.saving_vs_current) })}</em>
                          )}
                        </span>
                        <button onClick={() => tp.applyStartDate(c.start)}>{t('trip.useDates')}</button>
                      </div>
                    ))}
                </div>
              )}

              {/* Recommendations */}
              <Suggestions suggestions={tp.nextStopSuggestions} onPick={(s) => tp.addStop(s.id)} />

              {/* Add stop */}
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
                  <button className="trip-add-btn" onClick={addPending} disabled={!pendingDestId}>{t('trip.add')}</button>
                </div>
              </div>

              {/* Totals */}
              {tp.stopDetails.length > 0 && (
                <div className="trip-block">
                  <div className="trip-block-title"><ReceiptIcon size={13} /> {t('trip.totalTitle')}</div>

                  {tp.flight?.combinable ? (
                    <>
                      <div className="trip-total-row">
                        <span className="lbl">
                          <PlaneIcon size={11} /> {t('trip.flightOut')}
                          <small>{carrierName(tp.flight.into_carrier)}, {tp.flight.origin} → {tp.flight.into_anchor}{flightTimes(tp.flight.into_time) ? `, ${t('trip.departs', { time: flightTimes(tp.flight.into_time).dep })}` : ''}, {tp.groupSize} {tp.groupSize === 1 ? t('trip.seatOne') : t('trip.seatMany')}</small>
                        </span>
                        <span className="val">{eur(tp.flight.into_fare_eur * tp.groupSize)}</span>
                      </div>
                      <div className="trip-total-row">
                        <span className="lbl">
                          <PlaneIcon size={11} /> {t('trip.flightHome')}
                          <small>{carrierName(tp.flight.out_of_carrier)}, {tp.flight.out_anchor} → {tp.flight.origin}{flightTimes(tp.flight.out_of_time) ? `, ${t('trip.departs', { time: flightTimes(tp.flight.out_of_time).dep })}` : ''}, {tp.groupSize} {tp.groupSize === 1 ? t('trip.seatOne') : t('trip.seatMany')}</small>
                        </span>
                        <span className="val">{eur(tp.flight.out_of_fare_eur * tp.groupSize)}</span>
                      </div>
                      {tp.flight.ground_total > 0 && (
                        <div className="trip-total-row">
                          <span className="lbl">
                            <PlaneIcon size={11} /> {t('trip.airportTransfers')}
                            <small>{t('trip.transfersSub')}</small>
                          </span>
                          <span className="val">{eur(tp.flightTransfer ? tp.flightTransfer.ground_total : tp.flight.ground_total)}</span>
                        </div>
                      )}
                    </>
                  ) : tp.flight?.own ? (
                    <div className="trip-ownflight">
                      <div className="trip-total-row">
                        <span className="lbl">
                          <PlaneIcon size={11} /> {t('trip.yourFlight')}
                          <small>{t('trip.ownFlightSub')}</small>
                        </span>
                        <span className="val">{tp.flight.cost_total ? eur(tp.flight.cost_total) : '…'}</span>
                      </div>
                      <div className="trip-ownflight-fields">
                        <input
                          className="trip-ownflight-input"
                          type="text"
                          placeholder={t('trip.airlinePlaceholder')}
                          aria-label={t('trip.airlineAria')}
                          value={tp.ownFlight?.airline || ''}
                          onChange={(e) => tp.setOwnFlight({ ...tp.ownFlight, airline: e.target.value })}
                        />
                        <input
                          className="trip-ownflight-input trip-ownflight-cost"
                          type="number"
                          min="0"
                          inputMode="numeric"
                          placeholder={t('trip.totalCostPlaceholder')}
                          aria-label={t('trip.totalCostAria')}
                          value={tp.ownFlight?.costTotal || ''}
                          onChange={(e) => tp.setOwnFlight({ ...tp.ownFlight, costTotal: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                        />
                      </div>
                      <div className="trip-ownflight-fields">
                        <label className="trip-ownflight-date">
                          <span>{t('wizard.ownFlightOutLabel')}</span>
                          <input
                            className="trip-ownflight-input"
                            type="date"
                            value={tp.ownFlight?.outDate || ''}
                            onChange={(e) => tp.setOwnFlight({ ...tp.ownFlight, outDate: e.target.value || null })}
                          />
                        </label>
                        <label className="trip-ownflight-date">
                          <span>{t('wizard.ownFlightRetLabel')}</span>
                          <input
                            className="trip-ownflight-input"
                            type="date"
                            min={tp.ownFlight?.outDate || undefined}
                            value={tp.ownFlight?.retDate || ''}
                            onChange={(e) => tp.setOwnFlight({ ...tp.ownFlight, retDate: e.target.value || null })}
                          />
                        </label>
                      </div>
                    </div>
                  ) : tp.flight?.driving ? (
                    <>
                      {tp.driveLegs?.out && (
                        <div className="trip-total-row">
                          <span className="lbl">
                            <CarIcon size={11} /> {t('trip.driveOut', { city: tp.stopDetails[0]?.dest?.city || '' })}
                            <small>{t('trip.driveSub', { km: tp.driveLegs.out.road_km, hours: fmtHours(tp.driveLegs.out.hours) })}</small>
                          </span>
                          <span className="val">{eur(tp.driveLegs.out.ground_total)}</span>
                        </div>
                      )}
                      {tp.driveLegs?.home && (
                        <div className="trip-total-row">
                          <span className="lbl">
                            <CarIcon size={11} /> {t('trip.driveHome', { city: tp.stopDetails[tp.stopDetails.length - 1]?.dest?.city || '' })}
                            <small>{t('trip.driveSub', { km: tp.driveLegs.home.road_km, hours: fmtHours(tp.driveLegs.home.hours) })}</small>
                          </span>
                          <span className="val">{eur(tp.driveLegs.home.ground_total)}</span>
                        </div>
                      )}
                    </>
                  ) : tp.flight && !tp.tripHasCar ? (
                    // Travelling by car (rental or own) means no flight plan is
                    // needed, so the "no single flight plan" dead end is noise.
                    <p className="trip-note">{flightReasonLabel(tp.flight.reason)}</p>
                  ) : null}

                  <AnchorLegRow
                    leg={tp.anchorLegs?.in}
                    from={tp.anchorLegs?.inCity || tp.anchorLegs?.anchor?.city}
                    to={tp.stopDetails[0]?.dest?.city}
                  />
                  <AnchorLegRow
                    leg={tp.anchorLegs?.out}
                    from={tp.stopDetails[tp.stopDetails.length - 1]?.dest?.city}
                    to={tp.anchorLegs?.outCity || tp.anchorLegs?.anchor?.city}
                  />
                  <TransferModePicker
                    flightTransfer={tp.flightTransfer}
                    anchorIn={tp.anchorLegs?.in}
                    anchorOut={tp.anchorLegs?.out}
                    setTransferMode={tp.setTransferMode}
                  />

                  {groundTotal > 0 && (
                    <div className="trip-total-row">
                      <span className="lbl"><TrainIcon size={11} /> {t('trip.groundBetween')} <small>{t('trip.groundEstimate')}</small></span>
                      <span className="val">{eur(groundTotal)}</span>
                    </div>
                  )}

                  {tp.carRental && (
                    <div className="trip-total-row">
                      <span className="lbl"><CarIcon size={11} /> {t('trip.rentalCar')} <small>{t('trip.rentalDays', { days: tp.carRental.days })}</small></span>
                      <span className="val">{eur(tp.carRental.eur_total)}</span>
                    </div>
                  )}

                  {tp.vignettes && (
                    <div className="trip-total-row">
                      <span className="lbl"><CarIcon size={11} /> {t('trip.vignettes')} <small>{t('trip.vignettesSub', { countries: tp.vignettes.items.map((v) => v.iso2).join(', ') })}</small></span>
                      <span className="val">{eur(tp.vignettes.eur_total)}</span>
                    </div>
                  )}

                  {tp.stopDetails.map((s, i) => tp.stayCosts[i] && (
                    <React.Fragment key={i}>
                      <div className="trip-total-row">
                        <span className="lbl"><BedIcon size={11} /> {s.dest?.city} <small>{s.nights === 1 ? t('trip.accomOne', { n: s.nights }) : t('trip.accomMany', { n: s.nights })}</small></span>
                        <span className="val">{eur(tp.stayCosts[i].accomTotal)}</span>
                      </div>
                      <div className="trip-total-row">
                        <span className="lbl"><ReceiptIcon size={11} /> {s.dest?.city} <small>{t('trip.onGroundSub')}</small></span>
                        <span className="val">{eur(tp.stayCosts[i].groundTotal)}</span>
                      </div>
                    </React.Fragment>
                  ))}

                  <div className="trip-total-row grand">
                    <span className="lbl">{t('trip.total')} <small>{tp.groupSize} {tp.groupSize === 1 ? t('trip.personOne') : t('trip.personMany')}</small></span>
                    <span className="val">{eur(tp.grandTotal)}</span>
                  </div>

                  <div className="trip-save-row">
                    <button className="trip-newtrip-btn" onClick={handleStartOver}>{t('trip.startOver')}</button>
                    <button className="trip-save-btn" onClick={handleSave} disabled={tp.saveState === 'saving'}>
                      {tp.saveState === 'saving' ? t('trip.saving') : tp.saveState === 'saved' ? t('trip.savedTick') : tp.planId ? t('trip.updateTrip') : t('trip.saveTrip')}
                    </button>
                  </div>
                  {saveError && <p className="trip-note trip-note-error">{saveError}</p>}
                  {!authConfigured && <p className="trip-note">{t('trip.noAuthNote')}</p>}
                  {authConfigured && !user && <p className="trip-note">{t('trip.signInNote')}</p>}
                </div>
              )}
            </>
          )}

          </>
          ) : (
          <>
          <button className="trip-guide-cta" onClick={() => setWizardOpen(true)}>
            <span className="trip-guide-spark"><SparkIcon size={15} /></span>
            <span className="trip-guide-cta-text">
              <b>{t('trip.guideCta')}</b>
              <small>{t('trip.guideCtaSub')}</small>
            </span>
            <span className="trip-guide-arrow">→</span>
          </button>
          {/* Ready-made trips: pick a country, get Carta's researched routes
              (most beautiful / best value / cheap but lovely / hidden gems),
              then edit dates, stops and nights like any other trip. */}
          <StarterTrips
            destinations={destinations}
            groupSize={tp.groupSize}
            onPick={(selection) => {
              tp.loadFromWizard(selection);
              tp.setPlanned(false);
              setSelectedStop(null);
              setSheetOpen(true);
            }}
          />
          </>
          )}

          {/* Deep country intel for every country on the route. Sits outside the
              planned/edit branches so the briefing shows on both the overview tab
              and the edit-stops view; the stop-count guard hides it pre-trip. */}
          {countryInsights && tp.stopDetails.length > 0 && (() => {
            const tripCountries = [...new Set(tp.stopDetails.map((s) => s.dest?.country).filter(Boolean))];
            const withIntel = tripCountries.filter((c) => countryInsights[c]);
            if (!withIntel.length) return null;
            return (
              <div className="trip-block">
                <div className="trip-block-title">{t('trip.knowTitle')}</div>
                {withIntel.map((c) => (
                  <CountryIntel key={c} country={c} rec={countryInsights[c]} />
                ))}
              </div>
            );
          })()}
        </div>

        {/* The planned trip's actions live at the bottom of this panel on
            every layout, always visible under the itinerary. */}
        {tp.planned && (
          <div className="trip-sheet-footer">
            {saveError && <p className="trip-note trip-note-error trip-footer-error">{saveError}</p>}
            <div className="trip-sheet-footer-row">{plannedActionButtons}</div>
          </div>
        )}
      </div>

      {saveNotice && (
        <div className="trip-save-toast" role="status">{saveNotice}</div>
      )}

      {wizardOpen && (
        <GuidedTripWizard data={data} origin={origin} onChangeOrigin={onChangeOrigin} onCancel={() => setWizardOpen(false)} onComplete={handleWizardComplete} />
      )}
    </div>
  );
}
