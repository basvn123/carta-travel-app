import React, { useEffect, useRef, useState } from 'react';
import { Dropdown } from '../components/Dropdown.jsx';
import { DateField } from '../components/DateField.jsx';
import { GemIcon } from '../components/GemRating.jsx';
import { CountryIntel } from '../components/CountryIntel.jsx';
import { TripMap } from '../map/TripMap.jsx';
import { TripItinerary } from './TripItinerary.jsx';
import { GuidedTripWizard } from './GuidedTripWizard.jsx';
import { eur } from '../lib/format.js';
import { fmtDate } from '../lib/dates.js';
import { fetchDrivingRoute } from '../lib/routing.js';
import { useTripPlanner } from '../hooks/useTripPlanner.js';
import { useCountryInsights } from '../hooks/useCountryInsights.js';
import { SparkIcon, TrainIcon, BusIcon, CarIcon, BulbIcon } from '../components/Icons.jsx';

const SHEET_H_KEY = 'carta.tripSheetH.v1';

const REASON_LABELS = {
  no_shared_origin: "These two stops don't share a Ryanair origin airport, so there's no single flight plan connecting them. Try a different first or last stop, or fly home and out again.",
  no_fare_for_date: 'No fare is stored for one of these exact dates yet. Try nudging the trip dates.',
  missing_input: 'Pick your travel dates and at least one stop to price the flights.',
};

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
  return (
    <div className="trip-stepper">
      <button type="button" className="trip-step-btn" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Fewer">–</button>
      <div className="trip-step-val">
        <span className="trip-step-num">{value}</span>
        {suffix && <span className="trip-step-suffix">{suffix(value)}</span>}
      </div>
      <button type="button" className="trip-step-btn" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="More">+</button>
    </div>
  );
}

const MODE_META = {
  train: { Icon: TrainIcon, label: 'Train' },
  bus: { Icon: BusIcon, label: 'Bus' },
  car: { Icon: CarIcon, label: 'Car' },
};
const ModeIcon = ({ mode, size = 13 }) => {
  const I = MODE_META[mode]?.Icon;
  return I ? <I size={size} className="trip-mode-icon" /> : null;
};

/** One overland leg between two stops: the chosen mode inline, expandable to
 *  compare all three (train/bus/car), switch mode, and jump to booking links. */
function LegRow({ leg, onMode }) {
  const [open, setOpen] = useState(false);
  if (!leg) return <div className="trip-leg">↳ Route unknown</div>;
  if (leg.no_road || !leg.mode) return <div className="trip-leg">↳ {leg.note || 'No overland route (sea crossing)'}</div>;
  const chosen = leg.modes[leg.mode];
  return (
    <div className="trip-leg trip-leg-rich">
      <button className="trip-leg-main" onClick={() => setOpen(!open)} aria-expanded={open}>
        ↳ <ModeIcon mode={leg.mode} /> {MODE_META[leg.mode].label}, ~{leg.road_km} km, est. {eur(chosen.eur_pp)}/person, ~{chosen.hours}h
        {leg.long_haul ? ' · long leg - consider flying' : ''}
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
                title={leg.recommended === m ? "Carta's pick for this leg" : undefined}
              >
                <span><ModeIcon mode={m} /> {MODE_META[m].label}{leg.recommended === m && <span className="guide-reco-mark"><SparkIcon size={10} /></span>}</span>
                <b>{eur(o.eur_pp)}/p</b>
                <small>~{o.hours}h</small>
              </button>
            ))}
          </div>
          {chosen.note && <p className="trip-leg-note">{chosen.note}</p>}
          <div className="trip-leg-links">
            {chosen.links.map((l, j) => (
              <a key={j} href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>
            ))}
          </div>
          <p className="trip-leg-disclaimer">Estimates, not live fares - check the links for real times &amp; prices.</p>
        </div>
      )}
    </div>
  );
}

function Suggestions({ suggestions, onPick }) {
  if (!suggestions.length) return null;
  return (
    <div className="trip-block">
      <div className="trip-block-title">You might love these next</div>
      <div className="trip-suggest-row">
        {suggestions.map((s) => (
          <button
            key={s.id}
            className="trip-suggest-card"
            onClick={() => onPick(s)}
            title={`${s.city}, ${s.country}, ~${s.km} km from ${s.shared_origin || 'overland'}`}
          >
            <div className="trip-suggest-thumb" style={s.image ? { backgroundImage: `url(${s.image})` } : undefined}>
              {!s.image && <span className="trip-suggest-fallback">{s.city.slice(0, 1)}</span>}
              {s.reason && <span className="trip-suggest-chip">{s.reason}</span>}
            </div>
            <div className="trip-suggest-meta">
              <span className="trip-suggest-city">{s.city}</span>
              <span className="trip-suggest-sub">
                {s.km} km
                {s.gems ? <>, <GemIcon size={9} /> {s.gems}</> : null}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function TripPlannerTab({ data, user, authConfigured, onRequestAuth }) {
  const countryInsights = useCountryInsights();
  const tp = useTripPlanner(data, countryInsights);
  const destinations = data?.destinations || {};
  const dateMin = data?.meta?.start_date;
  const dateMax = data?.meta?.end_date;

  const [pendingDestId, setPendingDestId] = useState('');
  const [saveError, setSaveError] = useState('');
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
  // fly-in, days filled from the interests) - show it planned right away, with
  // the route on the map. Edit / Replan / Start over stay one tap away.
  const handleWizardComplete = (selection) => {
    tp.loadFromWizard(selection);
    tp.setPlanned(true);
    setWizardOpen(false);
    setSelectedStop(null);
    setSheetOpen(true);
  };

  const handleStartOver = () => {
    if (!window.confirm('Delete this trip and start over?')) return;
    tp.clearPlan();
    setSelectedStop(null);
    setSaveError('');
    if (isNarrow) setSheetOpen(false);
  };

  useEffect(() => {
    if (user) tp.loadSavedPlans(user.id);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const destOptions = Object.entries(destinations)
    .map(([id, d]) => ({ value: id, label: `${d.city}, ${d.country}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const hasDates = tp.tripStart && tp.tripEnd && tp.windowNights > 0;
  const mapStops = tp.stopDetails
    .filter((s) => s.dest)
    .map((s) => ({ lat: s.dest.lat, lon: s.dest.lon, city: s.dest.city }));

  // Once the trip is planned, draw the real road route through the stops
  // (keyless OSRM, same as the day planner's walking route). Keyed on the
  // coordinates so a stale response for a since-changed route is ignored;
  // falls back to the dashed straight-line hops when unavailable.
  const routeKey = mapStops.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join(';');
  const [tripRoute, setTripRoute] = useState(null);
  useEffect(() => {
    if (!tp.planned || mapStops.length < 2) { setTripRoute(null); return undefined; }
    let alive = true;
    fetchDrivingRoute(mapStops).then((r) => { if (alive && r) setTripRoute({ key: routeKey, ...r }); });
    return () => { alive = false; };
  }, [tp.planned, routeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const tripRouteOk = tripRoute && tripRoute.key === routeKey;

  const addPending = () => {
    if (!pendingDestId) return;
    tp.addStop(pendingDestId);
    setPendingDestId('');
  };

  const handleSave = async () => {
    setSaveError('');
    if (!user) { onRequestAuth && onRequestAuth(); return; }
    try {
      await tp.savePlan(user.id);
      tp.loadSavedPlans(user.id);
    } catch (e) {
      setSaveError(e?.message || 'Could not save this trip.');
    }
  };

  const groundTotal = tp.legs.reduce((sum, l) => sum + (l ? l.ground_total : 0), 0);

  return (
    <div className="trip-planner-screen">
      <TripMap
        stops={mapStops}
        padBottom={isNarrow ? (sheetOpen ? sheetH : 96) : 48}
        onSelectStop={setSelectedStop}
        selectedIndex={selectedStop}
        routeGeometry={tp.planned && tripRouteOk ? tripRoute.geometry : null}
      />

      {/* Mobile: a clean launcher card over the map until the traveller chooses
          to start. Tapping "Plan your trip" raises the bottom sheet; "Let Carta
          guide you" opens the wizard. Never shown on desktop (isNarrow) or once
          a plan exists. */}
      {isNarrow && !sheetOpen && !tp.planned && (
        <div className="trip-launcher" onClick={(e) => e.stopPropagation()}>
          <div className="trip-launcher-card">
            <div className="trip-launcher-spark"><SparkIcon size={20} /></div>
            <h2 className="trip-launcher-title">Plan your trip</h2>
            <p className="trip-launcher-sub">Map a multi-stop European route, price the flights and stays, and let Carta line it all up.</p>
            <button className="trip-launcher-primary" onClick={() => setSheetOpen(true)}>Plan your trip</button>
            <button className="trip-launcher-guide" onClick={() => setWizardOpen(true)}>
              <span className="trip-guide-spark"><SparkIcon size={15} /></span>
              <span className="trip-guide-cta-text">
                <b>Let Carta guide you</b>
                <small>Answer a few questions and we'll build it for you</small>
              </span>
              <span className="trip-guide-arrow">→</span>
            </button>
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
          aria-label="Drag to resize the panel"
          title="Drag up or down to move this panel"
        >
          <div className="trip-sheet-grip" />
        </div>

        {/* Trip header */}
        <div className="trip-topcard">
          <input
            className="trip-topcard-name"
            value={tp.planLabel}
            onChange={(e) => tp.setPlanLabel(e.target.value)}
            placeholder="Name your trip"
            aria-label="Trip name"
          />
          <div className="trip-topcard-sub">
            {hasDates
              ? `${fmtDate(tp.tripStart)} – ${fmtDate(tp.tripEnd)}`
              : 'Pick your travel dates below'}
            {tp.stopDetails.length > 0 && (
              <span className="trip-topcard-count">{tp.stopDetails.length} {tp.stopDetails.length === 1 ? 'stop' : 'stops'}</span>
            )}
          </div>
        </div>

        <div className="trip-sheet-scroll">
          {tp.planned ? (
            <TripItinerary
              dayPlan={tp.dayPlan}
              stopDetails={tp.stopDetails}
              grandTotal={tp.grandTotal}
              groupSize={tp.groupSize}
              flight={tp.flight}
              activeStopIndex={selectedStop}
              onSelectStop={setSelectedStop}
            />
          ) : (
          <>
          <button className="trip-guide-cta" onClick={() => setWizardOpen(true)}>
            <span className="trip-guide-spark"><SparkIcon size={15} /></span>
            <span className="trip-guide-cta-text">
              <b>Let Carta guide you</b>
              <small>Answer a few questions and we'll build the trip for you</small>
            </span>
            <span className="trip-guide-arrow">→</span>
          </button>

          {/* Step 1 - travel window */}
          <div className="trip-block">
            <div className="trip-block-title">When are you travelling?</div>
            <div className="trip-dates-row">
              <label className="trip-field">
                <span className="trip-field-label">Start</span>
                <DateField value={tp.tripStart} min={dateMin} max={tp.tripEnd || dateMax} onChange={tp.setTripStart} placeholder="Start date" />
              </label>
              <span className="trip-dates-arrow">→</span>
              <label className="trip-field">
                <span className="trip-field-label">End</span>
                <DateField value={tp.tripEnd} min={tp.tripStart || dateMin} max={dateMax} onChange={tp.setTripEnd} placeholder="End date" />
              </label>
              <label className="trip-field trip-field-people">
                <span className="trip-field-label">People</span>
                <div className="trip-people">
                  <button type="button" onClick={() => tp.setGroupSize(Math.max(1, tp.groupSize - 1))} disabled={tp.groupSize <= 1} aria-label="Fewer people">–</button>
                  <span>{tp.groupSize}</span>
                  <button type="button" onClick={() => tp.setGroupSize(Math.min(20, tp.groupSize + 1))} disabled={tp.groupSize >= 20} aria-label="More people">+</button>
                </div>
              </label>
            </div>
          </div>

          {hasDates && (
            <>
              {/* Planned-nights indicator */}
              <div className="trip-nights-summary">
                <NightsRing planned={tp.plannedNights} total={tp.windowNights} />
                <div className="trip-nights-text">
                  <strong>{tp.plannedNights}/{tp.windowNights}</strong> nights planned
                  {tp.plannedNights > tp.windowNights && <span className="trip-nights-warn"> (over your window)</span>}
                </div>
              </div>

              {/* Stops list */}
              {tp.stopDetails.length > 0 && (
                <div className="trip-stops">
                  {tp.stopDetails.map((s, i) => (
                    <React.Fragment key={i}>
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
                          title="Drag to reorder"
                        >{i + 1}</div>
                        <div className="trip-stop-body">
                          <div className="trip-stop-city">{s.dest ? s.dest.city : 'Unknown'}</div>
                          <div className="trip-stop-when">
                            {s.arriveDate ? `${fmtDate(s.arriveDate, true)} – ${fmtDate(s.departDate, true)}` : 'Set trip dates'}
                          </div>
                        </div>
                        <Stepper
                          value={s.nights}
                          onChange={(n) => tp.setStopNights(i, n)}
                          suffix={(n) => (n === 1 ? 'night' : 'nights')}
                        />
                        <div className="trip-stop-tools" onClick={(e) => e.stopPropagation()}>
                          {i > 0 && <button className="trip-stop-move" onClick={() => tp.moveStop(i, -1)} aria-label="Move up" title="Move up">↑</button>}
                          {i < tp.stopDetails.length - 1 && <button className="trip-stop-move" onClick={() => tp.moveStop(i, 1)} aria-label="Move down" title="Move down">↓</button>}
                          <button className="trip-stop-remove" onClick={() => tp.removeStop(i)} aria-label="Remove stop" title="Remove">×</button>
                        </div>
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
                  <div className="trip-block-title">Getting between stops</div>
                  <div className="trip-transport-seg">
                    {[
                      ['auto', SparkIcon, 'Carta picks'],
                      ['public', TrainIcon, 'Train & bus'],
                      ['car', CarIcon, 'Car'],
                    ].map(([k, I, lbl]) => (
                      <button
                        key={k}
                        className={tp.transportPref === k ? 'on' : ''}
                        onClick={() => tp.setTransportPref(k)}
                      ><I size={12} /> {lbl}</button>
                    ))}
                  </div>
                  {tp.transportPref === 'car' && tp.carRental && (
                    <p className="trip-note">
                      One rental for the whole trip: ~{eur(tp.carRental.eur_total)} for {tp.carRental.days} days
                      ({eur(tp.carRental.eur_per_day)}/day, seasonal rate) - split it {tp.groupSize} ways and add fuel + tolls per leg below.
                    </p>
                  )}
                </div>
              )}

              {/* Cheaper dates / cheaper order */}
              {tp.stopDetails.length > 0 && (tp.cheaperOrder
                || tp.cheaperDates.candidates.some((c) => c.saving_vs_current == null || c.saving_vs_current > 5)) && (
                <div className="trip-block trip-savings">
                  <div className="trip-block-title"><BulbIcon size={13} /> Take it cheaper</div>
                  {tp.cheaperOrder && (
                    <div className="trip-saving-row">
                      <span>Visiting your stops in a smarter order shortens the route - save ~{eur(tp.cheaperOrder.saving_eur)} on ground travel.</span>
                      <button onClick={tp.applyCheaperOrder}>Reorder</button>
                    </div>
                  )}
                  {tp.cheaperDates.candidates
                    .filter((c) => c.saving_vs_current == null || c.saving_vs_current > 5)
                    .map((c) => (
                      <div className="trip-saving-row" key={c.start}>
                        <span>
                          Start <b>{fmtDate(c.start, true)}</b>: flights {eur(c.total)}
                          {c.saving_vs_current != null && <em className="trip-saving-amount"> - save {eur(c.saving_vs_current)}</em>}
                        </span>
                        <button onClick={() => tp.applyStartDate(c.start)}>Use dates</button>
                      </div>
                    ))}
                  <p className="trip-note">Same stops, same nights - only the start date shifts. Flight prices are real stored Ryanair fares; ground costs are estimates.</p>
                </div>
              )}

              {/* Recommendations */}
              <Suggestions suggestions={tp.nextStopSuggestions} onPick={(s) => tp.addStop(s.id)} />

              {/* Add stop */}
              <div className="trip-block">
                <div className="trip-block-title">{tp.stopDetails.length === 0 ? 'Add your first stop' : 'Add another stop'}</div>
                <div className="trip-add-row">
                  <Dropdown
                    value={pendingDestId}
                    onChange={setPendingDestId}
                    options={destOptions}
                    placeholder="Search a city or country"
                    searchPlaceholder="Search"
                  />
                  <button className="trip-add-btn" onClick={addPending} disabled={!pendingDestId}>Add</button>
                </div>
              </div>

              {/* Totals */}
              {tp.stopDetails.length > 0 && (
                <div className="trip-block">
                  <div className="trip-block-title">Trip total</div>

                  {tp.flight?.combinable ? (
                    <div className="trip-total-row">
                      <span className="lbl">Flights <small>{tp.flight.into_anchor} in, {tp.flight.out_anchor} out, via {tp.flight.origin}</small></span>
                      <span className="val">{eur(tp.flight.fare_total + tp.flight.ground_total)}</span>
                    </div>
                  ) : tp.flight ? (
                    <p className="trip-note">{REASON_LABELS[tp.flight.reason] || 'Flights for this trip could not be priced.'}</p>
                  ) : null}

                  {groundTotal > 0 && (
                    <div className="trip-total-row">
                      <span className="lbl">Ground between stops <small>estimated, not a live fare</small></span>
                      <span className="val">{eur(groundTotal)}</span>
                    </div>
                  )}

                  {tp.carRental && (
                    <div className="trip-total-row">
                      <span className="lbl">Rental car <small>{tp.carRental.days} days, whole group</small></span>
                      <span className="val">{eur(tp.carRental.eur_total)}</span>
                    </div>
                  )}

                  {tp.stopDetails.map((s, i) => tp.stayCosts[i] && (
                    <div className="trip-total-row" key={i}>
                      <span className="lbl">{s.dest?.city} <small>{s.nights} {s.nights === 1 ? 'night' : 'nights'}, stay + on the ground</small></span>
                      <span className="val">{eur(tp.stayCosts[i].total)}</span>
                    </div>
                  ))}

                  <div className="trip-total-row grand">
                    <span className="lbl">Total <small>{tp.groupSize} {tp.groupSize === 1 ? 'person' : 'people'}</small></span>
                    <span className="val">{eur(tp.grandTotal)}</span>
                  </div>

                  <div className="trip-save-row">
                    <button className="trip-newtrip-btn" onClick={handleStartOver}>Start over</button>
                    <button className="trip-save-btn" onClick={handleSave} disabled={tp.saveState === 'saving'}>
                      {tp.saveState === 'saving' ? 'Saving…' : tp.saveState === 'saved' ? 'Saved ✓' : tp.planId ? 'Update trip' : 'Save trip'}
                    </button>
                  </div>
                  {saveError && <p className="trip-note trip-note-error">{saveError}</p>}
                  {!authConfigured && <p className="trip-note">Accounts aren't set up for this deployment, so trips can't be saved.</p>}
                  {authConfigured && !user && <p className="trip-note">Sign in to save this trip to your account and edit it later.</p>}
                </div>
              )}
            </>
          )}

          {/* Deep country intel for every country on the route */}
          {countryInsights && tp.stopDetails.length > 0 && (() => {
            const tripCountries = [...new Set(tp.stopDetails.map((s) => s.dest?.country).filter(Boolean))];
            const withIntel = tripCountries.filter((c) => countryInsights[c]);
            if (!withIntel.length) return null;
            return (
              <div className="trip-block">
                <div className="trip-block-title">Know before you go</div>
                {withIntel.map((c) => (
                  <CountryIntel key={c} country={c} rec={countryInsights[c]} />
                ))}
              </div>
            );
          })()}

          {/* Saved trips */}
          {authConfigured && user && tp.savedPlans.length > 0 && (
            <div className="trip-block">
              <div className="trip-block-title">Your saved trips</div>
              <div className="trip-saved-list">
                {tp.savedPlans.map((p) => (
                  <div className={`trip-saved-item ${p.id === tp.planId ? 'active' : ''}`} key={p.id}>
                    <button className="trip-saved-main" onClick={() => tp.loadPlan(p.id)} title="Open this trip">
                      {p.label || 'Untitled trip'}
                    </button>
                    <button className="trip-saved-del" onClick={() => tp.removeSavedPlan(p.id)} aria-label="Delete trip" title="Delete">×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          </>
          )}
        </div>
      </div>

      {/* Planned itinerary: save it, go back to editing, re-run the routing,
          or throw it away and start over. */}
      {tp.planned && (
        <div className="trip-planned-actions" onClick={(e) => e.stopPropagation()}>
          <button className="trip-save-planned-btn" onClick={handleSave} disabled={tp.saveState === 'saving'}>
            {tp.saveState === 'saving' ? 'Saving…' : tp.saveState === 'saved' ? 'Saved ✓' : tp.planId ? 'Update trip' : 'Save trip'}
          </button>
          <button className="trip-edit-btn" onClick={() => { tp.setPlanned(false); setSheetOpen(true); }}>Edit</button>
          {tp.stopDetails.length >= 3 && (
            <button className="trip-plan-again-btn" onClick={() => tp.optimizeRoute()} title="Re-run Carta's routing from your first stop">↻ Replan</button>
          )}
          <button className="trip-startover-btn" onClick={handleStartOver} title="Delete this trip and begin again">Start over</button>
        </div>
      )}
      {tp.planned && saveError && (
        <div className="trip-planned-error" onClick={(e) => e.stopPropagation()}>{saveError}</div>
      )}

      {wizardOpen && (
        <GuidedTripWizard data={data} onCancel={() => setWizardOpen(false)} onComplete={handleWizardComplete} />
      )}
    </div>
  );
}
