import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useFirstRun } from '../lib/firstRunContext.js';
import { readOwnFare, writeOwnFare, markFirstResultSeen } from '../lib/firstRun.js';
import { tripDaysBetween } from '../lib/runtime_pricing.js';
import { addDays, fmtDate } from '../lib/dates.js';
import { quoteNights } from '../lib/price/nights.js';
import { useSettledFigure } from '../lib/figureChange.js';
import { Button, Money, Segmented } from '../components/ui/index.js';
import { formatMoney } from '../lib/money.js';
import { doPriceOf } from '../lib/price/doPrice.js';
import { Switch } from '../components/ui/Switch.jsx';
import '../styles/86-price-items.css';
import { Stepper } from '../components/FilterControls.jsx';
import { DateField } from '../components/DateField.jsx';
import { useSettleChanged } from '../components/ReceiptCard.jsx';
import { FlightSheet } from '../components/FlightSheet.jsx';
import { ReportProblem } from '../components/ReportProblem.jsx';
import {
  RouteIcon, BedIcon, DiningIcon, TicketIcon, BusIcon, CalendarIcon, PersonIcon, PencilIcon, ChevronDownIcon, ExternalIcon,
} from '../components/Icons.jsx';
import { matchProfile, PROFILE_LABEL_KEYS } from './LifestylePanel.jsx';
import { legCost, googleFlightsLink } from '../lib/flights/flights.js';
import { bagTier } from '../lib/flights/bagFees.js';
import { flightLegs, flightQuote } from '../lib/price/flight.js';
import { destAnchor } from '../lib/origins.js';
import { AirlineMark, PassEnds, PassHead } from '../components/flights/Flights.jsx';
import { stopsText } from '../lib/flights/flightText.js';
import { useAirlines } from '../lib/flights/useAirlines.js';
import { homeFlightSetup, withEnds } from './cartaFlight.js';
import { useStaysVersion } from '../lib/staysData.js';
import { loadLiveStay } from '../lib/liveStays.js';
import { rule } from '../lib/price/config.js';
import { useDayView } from '../hooks/useDayView.js';
import { PriceItems } from '../components/PriceItems.jsx';
import { CostArc, CostRow } from '../components/CostCardKit.jsx';

/**
 * The destination page's price card (T429): what a day here costs at the
 * traveller's Lifestyle, what the stay comes to, and the page's one primary.
 *
 * One cost truth (owner decision 2026-10-13, closing T374-d and T385-a): the
 * day figure is the computeCosts row the Explore card and the map pin print,
 * and the total is that day times the nights and the party (lib/price/nights.js).
 * The card says no more than that: no orientation sentence, no method rows
 * under the lines, no "what a different stay would cost" footer. Since T912
 * (the owner's approved spec, 2026-10-30) it reads top to bottom: the price
 * a person a day, the fields (dates, travellers, stay), the split of the day
 * with thin bars, the stay for the party, the way there and the total for
 * the party in bold, then ONE primary (Plan a trip here) with "Or plan one
 * day here" as a quiet link under it. The "Not included" line is gone.
 *
 * Its inputs are the app's own (FirstRunContext), so a change here moves
 * every card and pin behind the page, as the settings line does:
 *   Dates   an in-card calendar (the settings line's own picker logic; its
 *           popover is fixed under the shell's top bar and cannot open here)
 *   People  the shared Stepper, behind a Travellers field
 *   Stay    opens the one Lifestyle panel (carta-design "Lifestyle control":
 *           a surface opens it and never builds a second one)
 *
 * Below 1024 px the card sits in the page (What a day costs) and the page's
 * foot bar carries the primary, so the card's own hides; from 1024 px it is
 * the sticky right column. `openSignal` lets the foot bar open the dates.
 *
 * T1019 (owner 2026-11-03: "clean, more structured, no redundant text", in
 * the plan tab's language): the plan tab's umber cost card. The dates and
 * travellers as two pills; the day a person inside the half arc (CostArc),
 * the arc being the day's split; the split as the cost card's rows, Bed and
 * Food opening the Lifestyle (so no separate Stay field); the trip at these
 * inputs (the nights, Flights with its airline marks, the total for the
 * party); the flights as the itinerary's passes one tap away under Flights,
 * with one line for where the price is from; Plan one day and the fare in
 * the card's foot; the page's primary under the card.
 */
const MAX_PARTY = rule('party.limits').max_seats;   // T691: one cap

export function DestPriceCard({
  dest, city, onOpenLifestyle, onPlanTrip, onPlanDay, reportItem, doItems = null,
  // T912: a number the page bumps when its foot bar asks for the inputs;
  // the card then opens its dates and takes the focus.
  openSignal = 0,
}) {
  const { t, lang, languages } = useI18n();
  const ctx = useFirstRun();
  const view = useDayView();   // T694: per person or the group's total
  const airlines = useAirlines();
  const flightOff = !!view.request.excluded?.includes('flight');
  const excluded = new Set(view.request.excluded || []);
  const uid = React.useId();
  const receiptKey = `dest:${dest.id}`;
  const [fare, setFare] = React.useState(() => readOwnFare(receiptKey));
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [datesOpen, setDatesOpen] = React.useState(false);
  const [pickEnd, setPickEnd] = React.useState('start');
  const [partyOpen, setPartyOpen] = React.useState(false);
  const [flightsOpen, setFlightsOpen] = React.useState(false);
  const datesBtnRef = React.useRef(null);
  React.useEffect(() => {
    if (!openSignal) return;
    setPickEnd('start');
    setDatesOpen(true);
    setPartyOpen(false);
    requestAnimationFrame(() => datesBtnRef.current?.focus?.({ preventScroll: true }));
  }, [openSignal]);
  React.useEffect(() => {
    setFare(readOwnFare(receiptKey));
    setDatesOpen(false);
    setPartyOpen(false);
    setFlightsOpen(false);
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

  if (!ctx) return null;
  // T1021: a place the scrape did not reach has no bed price. Missing data
  // leaves this page (owner, 2026-10-30), so the card goes; the trip can
  // still be planned, so the primary stays.
  if (!price) {
    return onPlanTrip ? (
      <div className="dpc-wrap">
        <Button variant="primary" block className="destp-plan-btn" iconStart={<RouteIcon size={18} />} onClick={onPlanTrip}>
          {t('dest.planTrip')}
        </Button>
      </div>
    ) : null;
  }

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
  const cartaLine = price.lines.find((l) => l.key === 'flight' && l.carta) || null;
  const flightLine = price.lines.find((l) => l.key === 'flight') || null;
  const stayTotal = Math.round(price.lines.filter((l) => l.key !== 'flight').reduce((sum, l) => sum + l.eur, 0) * 100) / 100;

  // What the day is made of, a person (T912): the engine's own lines that
  // carry an amount; a part the data does not price is left out, never a
  // zero. Each is one length of the arc in its ccard colour and one row
  // under it; the bed and the food are the Lifestyle's, so they open it.
  const lineEur = (key) => (costRow?.lines || []).find((l) => l.key === key && l.status === 'included' && l.eur != null)?.eur;
  const split = [
    { key: 'stay', Icon: BedIcon, label: t('destx.split.bed'), sub: t(`stay.${tier}`), eur: excluded.has('bed') ? null : costRow?.stayEur },
    { key: 'food', Icon: DiningIcon, label: t('destx.split.food'), sub: vibe, eur: excluded.has('food') ? null : costRow?.foodEur },
    { key: 'do', Icon: TicketIcon, label: t('destx.split.sights'), eur: lineEur('activities') },
    { key: 'around', Icon: BusIcon, label: t('destx.split.around'), eur: lineEur('transport') },
  ].map((r) => ({ ...r, eur: Number(r.eur) })).filter((r) => Number.isFinite(r.eur) && r.eur > 0);
  const datesText = from && to ? t('settings.datesRange', { start: shortDate(from), end: shortDate(to) }) : '';
  const carriers = cartaLine ? [...new Set([carta.out?.airline, carta.back?.airline].filter(Boolean))] : [];
  const pill = (open) => `dpc-pill${open ? ' is-open' : ''}`;

  return (
    <div className="dpc-wrap">
      <section className="ccard dpc" aria-labelledby={`${uid}-h`}>
        <h3 className="sr-only" id={`${uid}-h`}>{t('dest.priceTitle', { nights: nightsText, city })}</h3>

        {/* The two inputs the price depends on, as pills; the stay is the
            Bed and Food rows' (they open the Lifestyle). */}
        <div className="dpc-inputs" role="group" aria-label={t('receipt.stripAria')}>
          <button type="button" className={pill(datesOpen)} ref={datesBtnRef}
            aria-expanded={datesOpen} aria-controls={`${uid}-dates`} aria-label={`${t('settings.dates')}: ${datesText}`}
            onClick={() => { setPickEnd('start'); setDatesOpen((v) => !v); setPartyOpen(false); }}>
            <CalendarIcon size={16} />{datesText}
          </button>
          <button type="button" className={pill(partyOpen)}
            aria-expanded={partyOpen} aria-controls={`${uid}-party`} aria-label={`${t('destx.travellers')}: ${peopleText}`}
            onClick={() => { setPartyOpen((v) => !v); setDatesOpen(false); }}>
            <PersonIcon size={16} />{peopleText}
          </button>
        </div>

        {datesOpen && (
          <div className="dpc-sheet dprice-dates" id={`${uid}-dates`}>
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
              <Button variant="secondary" size="sm" onClick={() => {
                acted();
                ctx.setDepartDate(defaults.start);
                ctx.setReturnDate(defaults.end);
                setDatesOpen(false);
              }}>
                {t('settings.useCartaDates')}
              </Button>
            )}
          </div>
        )}
        {partyOpen && (
          <div className="dpc-party" id={`${uid}-party`}>
            <span className="pt-field-label">{t('settings.party')}</span>
            <Stepper value={people} min={1} max={MAX_PARTY} onChange={setPeople}
              ariaLabel={t('settings.partyAria', { n: people })}
              decLabel={t('settings.partyDec')} incLabel={t('settings.partyInc')} />
          </div>
        )}

        {/* Plan rule 2 (2026-10-24): the amount and its unit, no estimate
            mark; a tap opens the items in it (T695). */}
        <CostArc parts={split}>
          <p className="ccard-sum">
            <span className="ccard-n" ref={dayRef}>
              <PriceItems cost={costRow} way={carta?.perSeat > 0 ? { mode: 'plane', perPerson: carta.perSeat } : null}>
                <Money value={view.day(price.dayEur)} />
              </PriceItems>
            </span>
            <span className="ccard-unit">{view.unit}</span>
          </p>
        </CostArc>

        {split.length > 0 && (
          <ul className="ccard-rows is-plain" aria-label={t('destx.splitAria')}>
            {split.map(({ key, Icon, label, sub, eur }) => (
              <CostRow key={key} k={key} go={false} lead={<span className="ccard-ico"><Icon size={18} /></span>}
                label={label} sub={sub} edits={!!(sub && onOpenLifestyle)} fig={<Money value={view.day(eur)} />}
                onAct={sub && onOpenLifestyle ? onOpenLifestyle : null} popup actLabel={t('lifestyle.title')} />
            ))}
          </ul>
        )}

        {/* The trip at these inputs: the stay for the party, the way there
            (its passes one tap away), and the total. */}
        <dl className="dpc-trip" ref={linesRef}>
          <div>
            <dt>{nightsText}</dt>
            <dd><Money value={stayTotal} precision="cents" /></dd>
          </div>
          {flightLine && (
            <div>
              <dt>
                {cartaLine ? (
                  <button type="button" className="dpc-flt-toggle" aria-expanded={flightsOpen} aria-controls={`${uid}-flights`}
                    onClick={() => setFlightsOpen((v) => !v)}>
                    <span className="dpc-marks">{carriers.map((c) => <AirlineMark key={c} code={c} size="sm" />)}</span>
                    {t('tp.tile.flights')}
                    <ChevronDownIcon size={14} />
                  </button>
                ) : t('receipt.yourFlight')}
              </dt>
              <dd><Money value={flightLine.eur} precision="cents" /></dd>
            </div>
          )}
          <div className="is-big">
            <dt>{t('destx.totalFor', { people: peopleText })}</dt>
            <dd><Money value={price.total} precision="cents" /></dd>
          </div>
        </dl>

        {cartaLine && flightsOpen && (
          <div className="dpc-flights" id={`${uid}-flights`}>
            <FlightPass dir="out" leg={withEnds(carta.out, home, airport)} paying={people} bagKey={bagKey} airlines={airlines} />
            <FlightPass dir="back" leg={withEnds(carta.back, airport, home)} paying={people} bagKey={bagKey} airlines={airlines} />
            <p className="dpc-flt-note">
              <a className="btn btn-secondary btn-sm jr-book" target="_blank" rel="noopener noreferrer"
                href={googleFlightsLink(home, airport, carta.out?.date, { back: carta.back?.date, lang })}
                aria-label={t('plan.findOn', { provider: 'Google Flights' })}>
                <span className="btn-label">{t('tp.book')}</span>
                <ExternalIcon size={13} />
              </a>
            </p>
          </div>
        )}

        <div className="ccard-foot">
          {onPlanDay && (
            <Button variant="quiet" size="sm" className="ccard-all" onClick={onPlanDay}>{t('destx.planOneDay')}</Button>
          )}
          <Button variant="quiet" size="sm" className="ccard-paid dprice-fare" iconStart={<PencilIcon size={16} />}
            onClick={() => setSheetOpen(true)}>
            {fare ? t('receipt.changeFare') : t('trip.addOwnFare')}
          </Button>
        </div>
      </section>

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

      {/* The page's one primary (hidden below 1024 px, where the foot bar
          carries it). */}
      {onPlanTrip && (
        <Button variant="primary" block className="destp-plan-btn" iconStart={<RouteIcon size={18} />} onClick={onPlanTrip}>
          {t('dest.planTrip')}
        </Button>
      )}
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
    </div>
  );
}

/** One way of the flight as the itinerary's pass (T1008): its head and
 *  ends (Flights.jsx), then what it comes to for the party and a seat. */
function FlightPass({ dir, leg, paying, bagKey, airlines }) {
  const { t, lang } = useI18n();
  if (!leg) return null;
  const cost = legCost(leg, { paying, bagKey });
  const bag = cost.bags > 0 ? `, ${t(bagTier(bagKey) === 'checked' ? 'tp.pass.withBag' : 'tp.pass.withCabin')}` : '';
  return (
    <div className="dpc-pass">
      <PassHead airline={leg.airline} airlines={airlines}
        meta={[t(dir === 'back' ? 'flight.back' : 'flight.out'), fmtDate(leg.date, true), stopsText(t, leg.stops)].filter(Boolean).join(', ')} />
      <PassEnds leg={leg} />
      <p className="dpc-pass-fig">
        <Money value={cost.total} precision="cents" />
        <small>{t('tp.pass.each', { price: formatMoney(cost.perSeat, { precision: 'cents', locale: lang }) })}{bag}</small>
      </p>
    </div>
  );
}
