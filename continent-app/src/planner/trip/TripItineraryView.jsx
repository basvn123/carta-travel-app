import { TripItinerary } from '../TripItinerary.jsx';
import { MAX_PARTY } from '../../lib/tripTotal.js';
import { RECEIPT_ID } from './tripPlannerConsts.js';
import { TRIP_DRAFT_PLAN_ID } from '../dayPlanStore.js';

export function TripItineraryView({
  addStopBlock, beforeYouGo, betweenBlock, cheaperBlock, data, downloadPdf, grouped,
  isDayPlanned, onPlanDay, onReceiptLine, receiptKey, sections, selectedStop, setFlightSheet,
  setSelectedStop, setTravelPaid, sharePayload, stopEdit, tp,
}) {
  return (
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
}
