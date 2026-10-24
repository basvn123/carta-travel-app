import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useFirstRun } from '../lib/firstRunContext.js';
import { readOwnFare, writeOwnFare, markFirstResultSeen } from '../lib/firstRun.js';
import { tripDaysBetween } from '../lib/runtime_pricing.js';
import { addDays } from '../lib/dates.js';
import { quoteNights } from '../lib/price/nights.js';
import { useSettledFigure } from '../lib/figureChange.js';
import { Button, Money, Segmented } from '../components/ui/index.js';
import { formatEst, formatMoney } from '../lib/money.js';
import { doPriceOf } from '../lib/price/doPrice.js';
import { Switch } from '../components/ui/Switch.jsx';
import '../styles/86-price-items.css';
import { Stepper } from '../components/FilterControls.jsx';
import { DateField } from '../components/DateField.jsx';
import { ReceiptLine, ReceiptSum, useSettleChanged } from '../components/ReceiptCard.jsx';
import { FlightSheet } from '../components/FlightSheet.jsx';
import { ReportProblem } from '../components/ReportProblem.jsx';
import { ChevronDownIcon, ChevronRightIcon, RouteIcon, SunIcon } from '../components/Icons.jsx';
import { InfoDot } from '../components/InfoDot.jsx';
import { dayIncludesText } from '../lib/dayIncludes.js';
import { matchProfile, PROFILE_LABEL_KEYS } from './LifestylePanel.jsx';
import { legCost } from '../lib/flights/flights.js';
import { flightLegs, flightQuote } from '../lib/price/flight.js';
import { destAnchor } from '../lib/origins.js';
import { FlightRow, FlightLink, AirlineMark } from '../components/flights/Flights.jsx';
import { homeFlightSetup, withEnds } from './cartaFlight.js';
import { useStaysVersion } from '../lib/staysData.js';
import { loadLiveStay } from '../lib/liveStays.js';
import { rule } from '../lib/price/config.js';
import { useDayView } from '../hooks/useDayView.js';
import { PriceItems } from '../components/PriceItems.jsx';
import { includedParts } from '../lib/price/display.js';

/**
 * The destination page's price card (T429): what a day here costs at the
 * traveller's Lifestyle, what the stay comes to, and the page's one primary.
 *
 * One cost truth (owner decision 2026-10-13, closing T374-d and T385-a): the
 * day figure is the computeCosts row the Explore card and the map pin print,
 * and the total is that day times the nights and the party (lib/price/nights.js).
 * The card says no more than that: no orientation sentence, no method rows
 * under the lines, no "what a different stay would cost" footer, and one
 * line naming what the total leaves out (owner, T429 brief).
 *
 * Its inputs are the app's own (FirstRunContext), so a change here moves
 * every card and pin behind the page, as the settings line does:
 *   Dates   an in-card calendar (the settings line's own picker logic; its
 *           popover is fixed under the shell's top bar and cannot open here)
 *   People  the shared Stepper
 *   Stay    opens the one Lifestyle panel (carta-design "Lifestyle control":
 *           a surface opens it and never builds a second one)
 *
 * On a phone the card sits in the page after the key facts, never sticky;
 * from 1024 px the page's grid holds it in a sticky side column.
 */
const MAX_PARTY = rule('party.limits').max_seats;   // T691: one cap

export function DestPriceCard({
  dest, city, onOpenLifestyle, onPlanTrip, onPlanDay, reportItem, carDayEur = null, doItems = null,
}) {
  const { t, lang, languages } = useI18n();
  const ctx = useFirstRun();
  const view = useDayView();   // T694: per person or the group's total
  const flightOff = !!view.request.excluded?.includes('flight');
  const uid = React.useId();
  const receiptKey = `dest:${dest.id}`;
  const [fare, setFare] = React.useState(() => readOwnFare(receiptKey));
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [datesOpen, setDatesOpen] = React.useState(false);
  const [pickEnd, setPickEnd] = React.useState('start');
  React.useEffect(() => {
    setFare(readOwnFare(receiptKey));
    setDatesOpen(false);
  }, [receiptKey]);

  const choices = ctx?.choices;
  const defaults = ctx?.defaultDates || null;
  const from = ctx?.departDate || defaults?.start || null;
  const to = ctx?.returnDate || defaults?.end || null;
  const datesOwn = !!(defaults && from && to && (from !== defaults.start || to !== defaults.end));
  const costRow = ctx?.indices?.get?.(dest.id) || null;
  // T663: the request's nights (the date pair's length), the ones the day
  // figure was priced over.
  const request = ctx?.priceRequest || null;
  const nights = request?.nights || (from && to && to > from ? Math.max(1, tripDaysBetween(from, to)) : 7);
  const people = Math.max(1, Math.min(MAX_PARTY, Math.round(choices?.group_size || 2)));
  // Carta's return flight (T518), from the home airport's sweep, on the
  // bed's date mode (T663, V7): near the exact dates, the month's cheapest,
  // or the year's cheapest. A fare the traveller typed wins over it, and with
  // neither the card prices the stay alone, as before.
  const flightFile = ctx?.data?.flights || null;
  const bagKey = homeFlightSetup(ctx).bagKey;
  const airport = destAnchor(dest);
  const carta = React.useMemo(
    () => (fare ? null : flightQuote(flightLegs(flightFile, airport, request), { paying: people, bagKey })),
    [fare, flightFile, airport, request, people, bagKey],
  );
  // T715 (plan F9, B10): the things to do here with a price, as switches in
  // the calculator, all off by default; never in the day figure or a card.
  const pricedDo = React.useMemo(() => (doItems || []).map((item) => {
    const rec = item.price || (Number.isFinite(item.fee_eur) ? { value: item.fee_eur, currency: 'EUR' } : null);
    const p = doPriceOf(rec, 'activity');
    return p?.kind === 'eur' ? { key: item.name, name: item.name, eur: p.eur } : null;
  }).filter(Boolean).slice(0, 6), [doItems]);
  const [actsOn, setActsOn] = React.useState(() => new Set());
  const chosenActs = React.useMemo(() => pricedDo.filter((a) => actsOn.has(a.key)), [pricedDo, actsOn]);
  const price = React.useMemo(
    // T695: a flight switched off in the opened price leaves the receipt.
    () => (flightOff
      ? quoteNights(costRow, nights, people, null, null, chosenActs)
      : quoteNights(costRow, nights, people, fare, carta, chosenActs)),
    [costRow, nights, people, fare, carta, flightOff, chosenActs],
  );
  // T540: with the traveller's own dates, ask for tonight's hotel prices on
  // those nights; the cost index reprices the bed from them when they land.
  const staysVersion = useStaysVersion();
  const ownFrom = ctx?.departDate || null;
  const ownTo = ctx?.returnDate || null;
  React.useEffect(() => {
    if (ownFrom && ownTo && ownTo > ownFrom) {
      loadLiveStay(dest.id, ownFrom, Math.max(1, tripDaysBetween(ownFrom, ownTo)), people);
    }
  }, [dest.id, ownFrom, ownTo, people, staysVersion]);

  const dayRef = React.useRef(null);
  useSettledFigure(dayRef, price ? `${dest.id}:${Math.round(price.dayEur)}` : '');
  const linesRef = React.useRef(null);
  useSettleChanged(linesRef, price ? `${price.lines.map((l) => `${l.key}:${l.eur}`).join('|')}|${price.total}` : '');

  if (!ctx || !price) return null;

  const bcp47 = languages.find((l) => l.code === lang)?.bcp47 || 'en-GB';
  const shortDate = (iso) => {
    try {
      return new Intl.DateTimeFormat(bcp47, { day: 'numeric', month: 'short', timeZone: 'UTC' })
        .format(new Date(`${iso}T00:00:00Z`));
    } catch { return iso; }
  };
  const nightsText = nights === 1 ? t('receipt.oneNight') : t('receipt.nNights', { n: nights });
  const peopleText = people === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: people });
  const tier = costRow?.tierFallback ? 'home' : (costRow?.stayTier || choices?.stay_tier || 'home');
  const profileKey = matchProfile(choices?.lifestyle || {});
  const vibe = profileKey ? t(PROFILE_LABEL_KEYS[profileKey]) : t('lifestyle.custom');

  const acted = () => markFirstResultSeen();
  // A pick on the leaving end moves the stay and keeps its length, then hands
  // the next pick to the return; a pick on the return end sets it, unless it
  // lands on or before the leaving day, which then moves instead (the
  // settings line's rule, SettingsLine.jsx, so both pickers agree).
  const pickDate = (iso) => {
    if (!iso) return;
    acted();
    if (pickEnd === 'end' && from && iso > from) {
      ctx.setReturnDate(iso);
      return;
    }
    ctx.setDepartDate(iso);
    ctx.setReturnDate(addDays(iso, nights));
    setPickEnd('end');
  };
  const setPeople = (n) => {
    acted();
    ctx.setChoices((prev) => ({ ...prev, group_size: Math.min(MAX_PARTY, Math.max(1, Math.round(n))) }));
  };
  const saveFare = (f) => {
    acted();
    writeOwnFare(receiptKey, f);
    setFare(readOwnFare(receiptKey) || f);
    setSheetOpen(false);
  };
  const removeFare = () => {
    acted();
    writeOwnFare(receiptKey, null);
    setFare(null);
    setSheetOpen(false);
  };

  const home = flightFile?.from || null;
  const flightLabel = (line) => (line.carta ? (
    <span className="dprice-flt-label">
      <AirlineMark code={line.carta.out.airline} size="sm" />{' '}
      {t('flight.flightLine')}
    </span>
  ) : t('receipt.yourFlight'));
  const label = (line) => (line.key === 'flight' ? flightLabel(line)
    : line.key === 'stay' ? t('receipt.stay', { nights: nightsText })
    : line.key === 'car' ? t('price.item.car')
    : line.key === 'transport' ? t('price.item.transport')
    : line.key === 'activities' ? t('price.item.activities') : t('receipt.ground'));
  const cartaLine = price.lines.find((l) => l.key === 'flight' && l.carta) || null;
  const stayLine = price.lines.find((l) => l.key === 'stay');
  const foodLine = price.lines.find((l) => l.key === 'ground');
  const share = (l) => (price.total > 0 ? `${(l.eur / price.total) * 100}%` : '0');

  return (
    <section className="dprice" aria-labelledby={`${uid}-h`}>
      <header className="dprice-head">
        <h2 className="dprice-title" id={`${uid}-h`}>{t('dest.priceTitle', { nights: nightsText, city })}</h2>
        <p className="dprice-day">
          {/* Plan rule 2 (2026-10-24): the amount and its unit, no estimate
              mark and no dot explaining one. */}
          <span className="dprice-fig">
            <span ref={dayRef}>
              <PriceItems cost={costRow} way={carta?.perSeat > 0 ? { mode: 'plane', perPerson: carta.perSeat } : null}>
                <Money value={view.day(price.dayEur)} />
              </PriceItems>
            </span>
          </span>
          <span className="dprice-day-unit">{view.unit}</span>
        </p>
        {/* What the day includes (T499, owner answer T491-h). From 1024 px
            the card is where the first screen reads it; on a phone the head
            carries it and this line hides (64-v6-destination.css). */}
        <p className="dprice-incl">{dayIncludesText(t, includedParts(costRow))}</p>
      </header>

      <div className="dprice-inputs" role="group" aria-label={t('receipt.stripAria')}>
        <div className={`dprice-row${datesOpen ? ' is-open' : ''}`}>
          <Button
            variant="quiet"
            block
            className="dprice-input"
            aria-expanded={datesOpen}
            aria-controls={`${uid}-dates`}
            iconEnd={<ChevronDownIcon size={14} className="dprice-chev" />}
            onClick={() => { setPickEnd('start'); setDatesOpen((v) => !v); }}
          >
            <span className="dprice-input-label">{t('settings.dates')}</span>
            <span className="dprice-input-value">
              {from && to ? t('settings.datesRange', { start: shortDate(from), end: shortDate(to) }) : ''}
            </span>
          </Button>
          {datesOpen && (
            <div className="dprice-dates" id={`${uid}-dates`}>
              <Segmented
                block
                className="dprice-ends"
                label={t('settings.dates')}
                value={pickEnd}
                onChange={setPickEnd}
                options={['start', 'end'].map((end) => ({
                  value: end,
                  label: (
                    <span className="dprice-end">
                      <span className="dprice-end-label">{t(end === 'start' ? 'settings.leave' : 'settings.return')}</span>
                      <span>{shortDate(end === 'start' ? from : to)}</span>
                    </span>
                  ),
                }))}
              />
              <DateField
                inline
                value={pickEnd === 'start' ? from : to}
                rangeStart={from}
                rangeEnd={to}
                min={pickEnd === 'end' ? (from || ctx.dateBounds?.min) : ctx.dateBounds?.min}
                max={ctx.dateBounds?.max}
                onChange={pickDate}
              />
              {datesOwn && defaults && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    acted();
                    ctx.setDepartDate(defaults.start);
                    ctx.setReturnDate(defaults.end);
                    setDatesOpen(false);
                  }}
                >
                  {t('settings.useCartaDates')}
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="dprice-row">
          <span className="dprice-input is-static">
            <span className="dprice-input-label" id={`${uid}-party`}>{t('settings.party')}</span>
          </span>
          <Stepper
            value={people}
            min={1}
            max={MAX_PARTY}
            onChange={setPeople}
            ariaLabel={t('settings.partyAria', { n: people })}
            decLabel={t('settings.partyDec')}
            incLabel={t('settings.partyInc')}
          />
        </div>

        {onOpenLifestyle && (
          <div className="dprice-row">
            <Button
              variant="quiet"
              block
              className="dprice-input"
              aria-haspopup="dialog"
              iconEnd={<ChevronRightIcon size={14} className="dprice-chev" />}
              onClick={onOpenLifestyle}
            >
              <span className="dprice-input-label">{t('receipt.stripStay')}</span>
              <span className="dprice-input-value">{`${t(`stay.${tier}`)}, ${vibe}`}</span>
            </Button>
          </div>
        )}
      </div>

      {/* The one primary under the inputs, before the receipt (a booking
          card's order), so it is in view at 1280 x 720 without a scroll. */}
      <div className="dprice-actions">
        {onPlanTrip && (
          <Button variant="primary" block className="destp-plan-btn" iconStart={<RouteIcon size={18} />} onClick={onPlanTrip}>
            {t('dest.planTrip')}
          </Button>
        )}
        {onPlanDay && (
          <Button variant="secondary" block className="destp-plan-btn is-day" iconStart={<SunIcon size={18} />} onClick={onPlanDay}>
            {t('dest.planDay')}
          </Button>
        )}
      </div>

      {/* The split of the total, drawn once: bed and food on the ink ramp,
          the figures beside it in the lines below (carta-design "Data
          drawings": the drawing reads the same when removed). */}
      {stayLine && foodLine && (
        <div className="dprice-bar" aria-hidden="true">
          <span className="dprice-bar-stay" style={{ width: share(stayLine) }} />
          <span className="dprice-bar-food" style={{ width: share(foodLine) }} />
        </div>
      )}

      <dl className="frr-lines costrows dprice-lines" ref={linesRef}>
        {price.lines.map((line) => (
          <ReceiptLine key={line.key} t={t} line={{
            key: line.key, label: label(line), eur: line.eur, est: line.est,
          }} />
        ))}
        <ReceiptSum
          sumLabel={t('receipt.total', { people: peopleText })}
          total={price.total}
          est={price.est}
          each={price.each}
          eachText={(eur) => t('receipt.each', { eur })}
          t={t}
        />
      </dl>
      {pricedDo.length > 0 && (
        <ul className="pitems-list dprice-acts" aria-label={t('price.item.activities')}>
          {pricedDo.map((a) => (
            <li className="pitems-row" key={a.key}>
              <Switch label={a.name} hint={t('price.actEach', { price: formatMoney(a.eur, { precision: Number.isInteger(a.eur) ? 'whole' : 'cents' }) })}
                checked={actsOn.has(a.key)}
                onChange={(on) => setActsOn((prev) => { const next = new Set(prev); if (on) next.add(a.key); else next.delete(a.key); return next; })} />
            </li>
          ))}
        </ul>
      )}

      {/* The flight the line prices, there and home, each with its airline,
          times, when Google Flights was checked and the link to book. */}
      {cartaLine && (
        <div className="dprice-flights">
          <FlightRow leg={withEnds(carta.out, home, airport)} cost={legCost(carta.out, { paying: people, bagKey })}
            dir="out" bagKey={bagKey} wantedDate={from} linkOut={false} />
          <FlightRow leg={withEnds(carta.back, airport, home)} cost={legCost(carta.back, { paying: people, bagKey })}
            dir="back" bagKey={bagKey} wantedDate={to} linkOut={false} />
          {/* One way out to this return on Google Flights, not two one-way searches. */}
          <FlightLink from={home} to={airport} date={carta.out?.date} back={carta.back?.date} />
        </div>
      )}

      <div className="dprice-foot">
        <p className="dprice-excludes">
          {/* With a flight in the total, typed or Carta's, getting there is
              no longer left out. */}
          {t(fare || cartaLine ? 'dest.priceExcludesFare' : 'dest.priceExcludes')}
          {/* Where the page says a car is needed, its hire is the largest
              cost the day figure leaves out: said once, as a figure (T446). */}
          {Number.isFinite(carDayEur) && carDayEur > 0 && (
            <> {t('dest.priceCarHire', { eur: formatEst(carDayEur, t('money.est'), { locale: lang }) })}</>
          )}
        </p>
        <Button variant="quiet" size="sm" className="dprice-fare" onClick={() => setSheetOpen(true)}>
          {fare ? t('receipt.changeFare') : t('trip.addOwnFare')}
        </Button>
      </div>
      {reportItem && (
        <div className="dprice-report">
          <ReportProblem priceOnly item={reportItem} />
        </div>
      )}

      {sheetOpen && (
        <FlightSheet
          fare={fare}
          origin={choices?.origin}
          data={ctx.data}
          setOrigin={(code) => { acted(); ctx.setOrigin(code); }}
          from={from}
          to={to}
          people={peopleText}
          onSave={saveFare}
          onRemove={removeFare}
          onClose={() => setSheetOpen(false)}
          t={t}
        />
      )}
    </section>
  );
}
