import { useEffect } from 'react';
import { loadDeviceTrip } from '../deviceTripStore.js';
import { scrollBehavior } from '../../lib/motion.js';

export function useTripPlannerEffects({
  destinations, hist, onOpenPlanConsumed, onSharedTripConsumed, openPlanId, openSharedTrip,
  selectedStop, setChipOpen, setDeviceTrip, setSaveError, setSelectedStop, setToast, setTripTab,
  setView, setWizardOpen, stopRefs, t, tp, tripSeed,
}) {
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
  }, [tp.planned, histUndo, histRedo, setToast]);

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
  }, [tripSeed, tp.planned, tp.stopDetails.length, setWizardOpen]);

  // Selecting a stop (via pin or card) scrolls its card into view.
  useEffect(() => {
    if (selectedStop == null) return;
    stopRefs.current[selectedStop]?.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
  }, [selectedStop, stopRefs]);

  // Drop the highlight if the selected stop was removed/reordered out of range.
  useEffect(() => {
    if (selectedStop != null && selectedStop >= tp.stopDetails.length) setSelectedStop(null);
  }, [tp.stopDetails.length, selectedStop, setSelectedStop]);
  return { handleStartOver };
}
