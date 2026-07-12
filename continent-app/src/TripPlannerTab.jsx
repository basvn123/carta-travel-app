import React, { useEffect, useRef, useState } from 'react';
import { Dropdown } from './Dropdown.jsx';
import { DateField } from './DateField.jsx';
import { GemIcon } from './GemRating.jsx';
import { TripMap } from './TripMap.jsx';
import { TripItinerary } from './TripItinerary.jsx';
import { GuidedTripWizard } from './GuidedTripWizard.jsx';
import { eur } from './format.js';
import { useTripPlanner } from './hooks/useTripPlanner.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHEET_H_KEY = 'carta.tripSheetH.v1';

function fmtDate(iso, withWeekday = false) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const base = `${String(d).padStart(2, '0')} ${MONTHS[m - 1]}`;
  if (!withWeekday) return `${base} ${y}`;
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${base}`;
}

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
  const tp = useTripPlanner(data);
  const destinations = data?.destinations || {};
  const dateMin = data?.meta?.start_date;
  const dateMax = data?.meta?.end_date;

  const [pendingDestId, setPendingDestId] = useState('');
  const [saveError, setSaveError] = useState('');
  const [sheetH, setSheetH] = useState(340);
  const [selectedStop, setSelectedStop] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [planPromptOpen, setPlanPromptOpen] = useState(false);
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

  const handleWizardComplete = (selection) => {
    tp.loadFromWizard(selection);
    setWizardOpen(false);
    setSelectedStop(null);
    setPlanPromptOpen(true);
  };

  const handleCartaPlan = (optimize) => {
    if (optimize) tp.optimizeRoute();
    tp.setPlanned(true);
    setPlanPromptOpen(false);
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
      <TripMap stops={mapStops} padBottom={isNarrow ? sheetH : 48} onSelectStop={setSelectedStop} selectedIndex={selectedStop} />

      {/* Left panel (desktop) / bottom sheet (mobile) */}
      <div
        className={`trip-sheet ${dragging ? 'dragging' : ''}`}
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
            <span className="trip-guide-spark">✦</span>
            <span className="trip-guide-cta-text">
              <b>Let Carta guide you</b>
              <small>Answer a few questions and we'll build the trip for you</small>
            </span>
            <span className="trip-guide-arrow">→</span>
          </button>

          {/* Step 1 — travel window */}
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
                        <div className="trip-leg">
                          {tp.legs[i]
                            ? `↳ ~${tp.legs[i].road_km} km overland, est. ${eur(tp.legs[i].ground_eur_per_person)}/person, ~${tp.legs[i].hours}h${tp.legs[i].long_haul ? ' (long leg, consider flying)' : ''}`
                            : '↳ No overland route (sea crossing)'}
                        </div>
                      )}
                    </React.Fragment>
                  ))}
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
                    {tp.planId && (
                      <button className="trip-newtrip-btn" onClick={tp.clearPlan}>New trip</button>
                    )}
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

      {/* Planned itinerary: quick way back to editing */}
      {tp.planned && (
        <div className="trip-planned-actions" onClick={(e) => e.stopPropagation()}>
          <button className="trip-edit-btn" onClick={() => tp.setPlanned(false)}>Edit</button>
          <button className="trip-plan-again-btn" onClick={() => tp.optimizeRoute()} title="Re-run Carta's routing">↻ Replan</button>
        </div>
      )}

      {wizardOpen && (
        <GuidedTripWizard data={data} onCancel={() => setWizardOpen(false)} onComplete={handleWizardComplete} />
      )}

      {planPromptOpen && (
        <div className="trip-plan-prompt-overlay" onClick={() => handleCartaPlan(false)}>
          <div className="trip-plan-prompt" onClick={(e) => e.stopPropagation()}>
            <div className="trip-plan-prompt-spark">✦</div>
            <h3>Do you want Carta to plan this trip?</h3>
            <p>We'll arrange your stops into an efficient route and spread your chosen highlights across each day. You can always edit it afterwards.</p>
            <div className="trip-plan-prompt-actions">
              <button className="trip-plan-prompt-no" onClick={() => handleCartaPlan(false)}>No, I'll arrange it</button>
              <button className="trip-plan-prompt-yes" onClick={() => handleCartaPlan(true)}>Yes, plan it for me</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
