import { TripSummary } from '../TripSummary.jsx';
import { BudgetCard } from './BudgetCard.jsx';
import { fromDraft } from '../flow/tripSettings.js';
import { plannerStore } from '../plannerStore.js';
import { PARTIAL_DOORS } from '../../lib/plan/doors.js';
import { scrollBehavior } from '../../lib/motion.js';
import { staysFromImports } from '../flow/importStays.js';
import { TripDays } from './TripDays.jsx';
import { TRIP_DRAFT_PLAN_ID } from '../dayPlanStore.js';
import { IconButton } from '../../components/ui/index.js';
import { BookmarkIcon } from '../../components/Icons.jsx';
import { MoreMenu } from './MoreMenu.jsx';

export function TripPageSummary({
  carDelta, carTip, cardMap, data, fullMap, handleSave, handleStartOver, headCount, hist,
  onPlanDay, onPlanHome, renameTrip, renderItinerary, saveChip, saveStatus, saveTripSet, saved,
  setAskDays, setChipOpen, setFlightSheet, setSettingsOpen, setShareOpen, setToast,
  setTravelPaid, setTripTab, settingsGearRef, t, tp, trace, tripName, tripOrigin, tripSet,
  tripTab, wideTrip,
}) {
  return (
    <TripSummary
      onRename={renameTrip}
      onChip={(kind, ref) => {
        // The chip rises near the top first, so the editor hung from it
        // has the screen under it (T836).
        const el = ref?.current;
        if (el && el.getBoundingClientRect().top > window.innerHeight * 0.4) el.scrollIntoView({ block: 'start' });
        setChipOpen({ kind, ref });
      }}
      // T1003: the cost card's Flights row opens the same flight sheet as the Itinerary.
      onChangeFlight={tp.planned && tp.priced?.cartaFlight ? setFlightSheet : null}
      trace={trace}
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
      // T888: Change your trip prices a move of the dates and saves it
      // the way the dates chip does, so Undo takes it back.
      quoteDelta={tp.quoteDelta}
      onDates={(start, end) => saveChip('dates', { start, end })}
      onFlights={tp.planned && !tp.flight?.driving ? () => setFlightSheet('out') : null}
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
        // T889: the Notes tab, the trip extras inline.
        notes: renderItinerary(['extras']),
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
  );
}
