import { ChipEditor } from './ChipEditor.jsx';
import { ShareSheet } from './ShareSheet.jsx';
import { fromDraft } from '../flow/tripSettings.js';
import { plannerStore } from '../plannerStore.js';
import { scrollBehavior } from '../../lib/motion.js';
import { DayTripPicker } from './DayTripPicker.jsx';
import { NO_DESTINATIONS } from './tripPlannerConsts.js';
import { SwapCity } from './SwapCity.jsx';
import { ChangeFlight } from './ChangeFlight.jsx';
import { TripUndoToast } from './TripUndoToast.jsx';
import { TripSettingsSheet } from '../flow/TripSettingsSheet.jsx';
import { DaysPrompt } from '../flow/DaysPrompt.jsx';
import { KeepTripChoice } from './KeepTripChoice.jsx';

export function TripOverlays({
  applySettings, askDays, chipOpen, cityOf, closeToast, data, dayTripAt, downloadPdf,
  flightSheet, hist, keepAccountTrip, keepChoice, keepDeviceTrip, onPlanDay, saveChip,
  saveNotice, saveTripSet, setAskDays, setChipOpen, setDayTripAt, setFlightSheet, setKeepChoice,
  setSelectedStop, setSettingsOpen, setShareOpen, setSwapAt, setToast, setTripTab,
  settingsGearRef, settingsOpen, shareOpen, sharePayload, swapAt, t, toast, tp, tripName,
  tripSet,
}) {
  return (
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
          onClose={() => setAskDays(false)}
          onPlan={(how) => {
            setAskDays(false);
            // T674: Carta plans: the first day opens with the plan at work;
            // planning yourself: the days overview with the ideas. T896: the
            // Carta bot: the first day with the bot open beside it.
            onPlanDay(how === 'carta'
              ? { planId: tp.planId, stopIndex: 0, dayIndex: 0, autoFill: true }
              : how === 'bot'
                ? { planId: tp.planId, stopIndex: 0, dayIndex: 0, bot: true }
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
}
