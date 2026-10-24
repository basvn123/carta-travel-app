import React, { useRef } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button, Money } from '../components/ui/index.js';
import { SheetShell } from '../browse/SheetShell.jsx';
import { ReceiptCard } from '../components/ReceiptCard.jsx';
import { ChevronRightIcon } from '../components/Icons.jsx';
import { useSettledFigure } from '../lib/figureChange.js';
import { formatMoney } from '../lib/money.js';
import { dayReceiptFigures } from '../lib/dayTickets.js';

/**
 * What the day costs, always in sight (T501, roadmap 1.3d sections 2 to 5,
 * owner T492-d, T492-f, T492-k). Three pieces, one figure:
 *
 *   DayCostBar      the bar fixed at the foot of the day on a desktop; inside
 *                   a trip it shows the trip's total first, then the day
 *   DayStrip        the phone drawer's 72 px strip: the day's name and facts,
 *                   and the figure, a tap away from the receipt
 *   DayReceiptSheet the compact receipt: bed, food and drink, the tickets
 *                   Carta knows, the total for the party, the figure a person
 *
 * The day's figure is the cost index's bed plus food a person a day at the
 * traveller's Lifestyle (the figure Explore prints for the town), plus the
 * tickets whose price is known (lib/dayTickets.js). Every piece reads the one
 * `dayCost` object the planner builds, so the bar, the strip and the receipt
 * can never say two figures.
 *
 *   dayCost  { eur, est, stayEur, foodEur, tickets, party } or null
 *   trip     { priced } a trip's quoteTrip() output, or null outside a trip
 */

/** How many people a trip is priced for, counted as TripTotalBar counts it. */
function pricedPartySize(priced) {
  const p = priced?.party || null;
  if (p) return Math.max(1, (p.adults || 0) + (p.children || 0) + (p.babies || 0));
  return Math.max(1, priced?.groupSize || 1);
}

function peopleWord(n, t) {
  return n === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n });
}

/** The day's figure with its unit, the way the strip and the bar set it. */
function DayFigure({ dayCost, t }) {
  const ref = useRef(null);
  useSettledFigure(ref, dayCost?.eur ?? null);
  return (
    <span className="dcb-fig">
      <span ref={ref} className="dcb-n"><Money value={dayCost.eur} est={dayCost.est} /></span>
      <span className="dcb-unit">{t('dayws.costLabel')}</span>
    </span>
  );
}

export function DayCostBar({ dayCost, dayNumber, trip = null, onOpen, onOpenTrip = null, receiptId = null, open = false }) {
  const { t, lang } = useI18n();
  const tripRef = useRef(null);
  const priced = trip?.priced || null;
  const hasTrip = Boolean(priced && Number.isFinite(priced.grandTotal) && priced.grandTotal > 0);
  useSettledFigure(tripRef, hasTrip ? priced.grandTotal : null);
  if (!dayCost && !hasTrip) return null;
  const tripPeople = hasTrip ? pricedPartySize(priced) : 1;
  const daySpoken = dayCost ? t('dayws.costBarName', {
    n: dayNumber,
    price: dayCost.est
      ? t('money.estSpoken', { price: formatMoney(dayCost.eur, { locale: lang }) })
      : formatMoney(dayCost.eur, { locale: lang }),
  }) : '';
  return (
    <div className={`day-cost-bar${hasTrip ? ' has-trip' : ''}`} role="group" aria-label={t('dayws.costBarAria')}>
      {hasTrip && (
        <Button
          variant="quiet"
          className="dcb-part dcb-trip"
          onClick={onOpenTrip || undefined}
          disabled={!onOpenTrip}
          aria-label={t('dayws.costBarTripName', {
            price: t('money.estSpoken', { price: formatMoney(priced.grandTotal, { precision: 'cents', locale: lang }) }),
            people: peopleWord(tripPeople, t),
          })}
        >
          <span className="dcb-lbl">{t('plan.yourTrip')}</span>
          <span className="dcb-fig">
            <span ref={tripRef} className="dcb-n"><Money value={priced.grandTotal} est precision="cents" /></span>
            <span className="dcb-unit">{t('receipt.total', { people: peopleWord(tripPeople, t) })}</span>
          </span>
        </Button>
      )}
      {dayCost && (
        <Button
          variant="quiet"
          className="dcb-part dcb-day"
          onClick={onOpen}
          aria-label={daySpoken}
          aria-haspopup="dialog"
          aria-controls={open && receiptId ? receiptId : undefined}
          aria-expanded={open}
        >
          {hasTrip && <span className="dcb-lbl">{t('itin.dayN', { n: dayNumber })}</span>}
          <DayFigure dayCost={dayCost} t={t} />
          <span className="dcb-open">
            {!hasTrip && t('plan.whatsIn')}
            <ChevronRightIcon size={16} />
          </span>
        </Button>
      )}
    </div>
  );
}

export function DayStrip({ title, sub, dayCost, onOpen, dayNumber }) {
  const { t, lang } = useI18n();
  return (
    <div className="day-strip">
      <span className="day-strip-text">
        <b className="day-strip-title">{title}</b>
        {sub && <span className="day-strip-sub">{sub}</span>}
      </span>
      {dayCost && (
        <Button
          variant="quiet"
          className="day-strip-cost"
          onClick={onOpen}
          aria-haspopup="dialog"
          aria-label={t('dayws.costBarName', {
            n: dayNumber,
            price: dayCost.est
              ? t('money.estSpoken', { price: formatMoney(dayCost.eur, { locale: lang }) })
              : formatMoney(dayCost.eur, { locale: lang }),
          })}
        >
          <DayFigure dayCost={dayCost} t={t} />
        </Button>
      )}
    </div>
  );
}

export function DayReceiptSheet({
  dayCost, city, dayNumber, dateLabel = '', trip = null, tripName = '', onBackToTrip = null,
  onLifestyle = null, onClose, id = 'day-receipt',
}) {
  const { t } = useI18n();
  if (!dayCost) return null;
  const fig = dayReceiptFigures({
    stayEur: dayCost.stayEur, foodEur: dayCost.foodEur, tickets: dayCost.tickets, party: dayCost.party,
  });
  const people = peopleWord(fig.party, t);
  const label = {
    bed: t('receipt.stay', { nights: t('receipt.oneNight') }),
    food: t('receipt.ground'),
    tickets: t('receipt.tickets'),
  };
  const lines = fig.lines.map((l) => ({
    key: l.key,
    label: label[l.key],
    prov: fig.party > 1 ? [t('receipt.each', { eur: formatMoney(l.each, { precision: 'cents' }) })] : [],
    eur: l.eur,
    est: l.key === 'tickets' ? false : dayCost.est,
  }));
  const foot = [
    fig.unknownTickets === 1 ? t('receipt.ticketsUnknownOne')
      : fig.unknownTickets > 1 ? t('receipt.ticketsUnknownN', { n: fig.unknownTickets }) : '',
    t('dayws.receiptHolds'),
  ];
  const priced = trip?.priced || null;
  const tripTotal = priced && Number.isFinite(priced.grandTotal) && priced.grandTotal > 0 ? priced.grandTotal : null;
  const tripPeople = priced ? pricedPartySize(priced) : 1;
  return (
    <SheetShell
      title={t('dayws.receiptTitle', { n: dayNumber })}
      onClose={onClose}
      className="day-receipt-sheet"
      labelId={`${id}-title`}
      width={480}
    >
      <div className="day-receipt" id={id}>
        <ReceiptCard
          headingLevel={3}
          title={city}
          sub={[dateLabel, people].filter(Boolean).join(', ')}
          lines={lines}
          sumLabel={t('receipt.total', { people })}
          total={fig.total}
          est={dayCost.est}
          each={fig.party > 1 ? fig.each : null}
          eachText={(eur) => t('receipt.each', { eur })}
          foot={foot.filter(Boolean)}
          bar
          t={t}
        />
        {tripTotal != null && (
          <div className="day-receipt-trip">
            <span className="day-receipt-trip-text">
              <span className="dcb-lbl">{tripName ? t('dayws.receiptTripNamed', { name: tripName }) : t('plan.yourTrip')}</span>
              <span className="dcb-fig">
                <span className="dcb-n"><Money value={tripTotal} est precision="cents" /></span>
                <span className="dcb-unit">{t('receipt.total', { people: peopleWord(tripPeople, t) })}</span>
              </span>
            </span>
            {onBackToTrip && (
              <Button variant="quiet" size="sm" onClick={() => { onClose(); onBackToTrip(); }}>{t('dayws.backToTrip')}</Button>
            )}
          </div>
        )}
        {onLifestyle && (
          <Button variant="quiet" className="day-receipt-life" onClick={() => { onClose(); onLifestyle(); }}>
            {t('dayws.receiptLifestyle')}
          </Button>
        )}
      </div>
    </SheetShell>
  );
}
