import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useFirstRun } from '../lib/firstRunContext.js';
import { readOwnFare, writeOwnFare, markFirstResultSeen } from '../lib/firstRun.js';
import { tripDaysBetween } from '../lib/runtime_pricing.js';
import { addDays, fmtDate } from '../lib/dates.js';
import { quoteNights } from '../lib/price/nights.js';
import { priceNotes } from '../lib/price/notes.js';
import { NotMeasuredValue, ThinBedNote } from '../components/PriceNotes.jsx';
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
  RouteIcon, BusIcon, CarIcon, TrainIcon, CalendarIcon, PersonIcon, PencilIcon, ChevronDownIcon, ExternalIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { minutesText } from '../lib/journeys.js';
import { tiersAt } from '../lib/stayPrice.js';
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
import { rule } from '../lib/price/config.js';
import { useDayView } from '../hooks/useDayView.js';
import { PriceItems } from '../components/PriceItems.jsx';

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
const WAY_ICONS = { plane: PlaneIcon, train: TrainIcon, bus: BusIcon, car: CarIcon };

export function DestPriceCard({
  dest, city, onOpenLifestyle, onPlanTrip, onPlanDay, reportItem, doItems = null, ways = null,
  // T912: a number the page bumps when its foot bar asks for the inputs;
  // the card then opens its dates and takes the focus.
  openSignal = 0,
}) {
  const { t, lang, languages } = useI18n();
  const ctx = useFirstRun();
  const view = useDayView();   // T694: per person or the group's total
  const airlines = useAirlines();
  const flightOff = !!view.request.excluded?.includes('flight');
  const uid = React.useId();
  const receiptKey = `dest:${dest.id}`;
  const [fare, setFare] = React.useState(() => readOwnFare(receiptKey));
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [datesOpen, setDatesOpen] = React.useState(false);
  const [pickEnd, setPickEnd] = React.useState('start');
  const [partyOpen, setPartyOpen] = React.useState(false);
  const [flightsOpen, setFlightsOpen] = React.useState(false);
  const [modePick, setModePick] = React.useState(null);
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
    setModePick(null);
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
  // T1026: the way there the traveller picked among the page's ways (plane,
  // train, bus, car); a typed fare keeps the plane, else the way the rule
  // picks by door-to-door time and cost (T1100, D13, lib/wayChoice.js).
  const rows = ways?.rows || [];
  const mode = rows.some((w) => w.mode === modePick) ? modePick
    : fare || !rows.length ? 'plane' : (ways.pick || ways.cheapest || rows[0].mode);
  const pickedWay = rows.find((w) => w.mode === mode) || null;
  const price = React.useMemo(
    // T695: a flight switched off in the opened price leaves the receipt.
    () => (flightOff
      ? quoteNights(costRow, nights, people, null, null, chosenActs)
      : quoteNights(costRow, nights, people, fare, carta, chosenActs,
        pickedWay && mode !== 'plane' ? { mode, total: pickedWay.perPerson * people } : null)),
    [costRow, nights, people, fare, carta, flightOff, chosenActs, mode, pickedWay],
  );
  // Re-render when a country's stays arrive (T1074: the live Xotelo ask is gone).
  useStaysVersion();

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
  const datesText = from && to ? t('settings.datesRange', { start: shortDate(from), end: shortDate(to) }) : '';
  const pill = (open) => `dpc-pill${open ? ' is-open' : ''}`;
  const money = (v) => formatMoney(v, { precision: 'whole', locale: lang });
  // T1100: fastest door to door (the airport and the transfer count), so a
  // flight is not "Fastest" on its air time alone.
  const fastest = ways?.fastest || null;
  // T1100: when the card opens on a dearer way than the cheapest, it says
  // why in numbers: the door-to-door hours of the pick against the cheapest.
  const pickRow = !modePick && !fare && ways?.pick && ways.pick !== ways.cheapest
    ? rows.find((w) => w.mode === ways.pick) : null;
  const cheapRow = pickRow ? rows.find((w) => w.mode === ways.cheapest) : null;
  const pickNote = pickRow && cheapRow && pickRow.doorHours != null && cheapRow.doorHours != null
    && cheapRow.doorHours > pickRow.doorHours
    ? t('destx.wayPickWhy', {
      time: minutesText(Math.round(pickRow.doorHours * 60)),
      other: minutesText(Math.round(cheapRow.doorHours * 60)),
    }) : '';
  const wayName = (w) => (w.mode === 'plane' ? (w.iata ? t('destx.flyToIata', { iata: w.iata }) : t('way.plane')) : t(`way.${w.mode}`));
  const waySub = (w) => (w.mode === 'plane' && w.dep && w.arr
    ? [t('destx.flightTimes', { dep: w.dep, arr: w.arr }), w.minutes ? minutesText(w.minutes) : ''].filter(Boolean)
      .map((part, i, all) => <span key={part}>{part}{i < all.length - 1 ? ',' : ''}</span>)
    : Number.isFinite(w.hours) ? t('destx.aboutTime', { time: minutesText(Math.round(w.hours * 60)) }) : '');
  const offered = tiersAt(dest);
  const lineLabel = (l) => (l.key === 'flight' ? (l.carta ? t('tp.tile.flights') : t('receipt.yourFlight'))
    : l.key === 'way' ? t(`way.${l.mode}`)
    : l.key === 'stay' ? t('receipt.stay', { nights: nightsText })
    : l.key === 'ground' ? t('destx.split.food')
    : l.key === 'car' ? t('price.item.car')
    : l.key === 'transport' ? t('price.item.transport') : t('price.item.activities'));
  const lineSub = (l) => (l.key === 'stay' ? t(`stay.${tier}`) : l.key === 'ground' ? vibe : '');
  const opensLifestyle = (l) => onOpenLifestyle && (l.key === 'stay' || l.key === 'ground');

  return (
    <div className="dpc-wrap">
      <section className="ccard tcard" aria-labelledby={`${uid}-h`}>
        <h3 className="sr-only" id={`${uid}-h`}>{t('dest.priceTitle', { nights: nightsText, city })}</h3>

        {/* The band: the inputs, then the trip's total for the party (the
            research's one anchor), then a person and a day under it. */}
        <div className="tcard-band">
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
          <p className="tcard-total" ref={linesRef}>
            <Money value={price.total} />
            <span>{t('tc.forParty', { people: peopleText, nights: nightsText })}</span>
          </p>
          <p className="tcard-each" ref={dayRef}>
            {price.each != null && <span>{t('tc.each', { price: money(price.each) })}</span>}
            <PriceItems cost={costRow} way={carta?.perSeat > 0 ? { mode: 'plane', perPerson: carta.perSeat } : null}>
              <Money value={view.day(price.dayEur)} />
            </PriceItems>
            <span>{view.unit}</span>
          </p>
        </div>

        {datesOpen && (
          <div className="dpc-sheet dprice-dates tcard-sheet" id={`${uid}-dates`}>
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
          <div className="dpc-party tcard-sheet" id={`${uid}-party`}>
            <span className="pt-field-label">{t('settings.party')}</span>
            <Stepper value={people} min={1} max={MAX_PARTY} onChange={setPeople}
              ariaLabel={t('settings.partyAria', { n: people })}
              decLabel={t('settings.partyDec')} incLabel={t('settings.partyInc')} />
          </div>
        )}

        <div className="tcard-body">
          {/* Getting there (T1026): every way that prices, one to pick; the
              pick is the way there in the total. */}
          {rows.length > 0 && (
            <div className="tcard-part">
              <h4 className="tcard-h">{ways?.from ? t('destx.gettingFrom', { place: ways.from }) : t('detail.gettingThere')}</h4>
              <div className="tcard-ways" role="radiogroup" aria-label={t('detail.gettingThere')}>
                {rows.map((w) => {
                  const Icon = WAY_ICONS[w.mode] || RouteIcon;
                  const on = w.mode === mode;
                  return (
                    <button type="button" key={w.mode} role="radio" aria-checked={on}
                      className={`tcard-way${on ? ' is-on' : ''}`} onClick={() => { acted(); setModePick(w.mode); }}>
                      <span className="tcard-way-ico" aria-hidden="true">
                        {w.mode === 'plane' && w.airline ? <AirlineMark code={w.airline} size="sm" /> : <Icon size={18} />}
                      </span>
                      <span className="tcard-way-what">
                        <span className="tcard-way-name">
                          {wayName(w)}
                          {rows.length > 1 && w.mode === ways.cheapest && <span className="tcard-badge is-cheap">{t('destx.cheapest')}</span>}
                          {fastest === w.mode && fastest !== ways.cheapest && <span className="tcard-badge">{t('tc.fastest')}</span>}
                        </span>
                        <span className="tcard-way-sub">{waySub(w)}</span>
                      </span>
                      <span className="tcard-way-fig">
                        <b>{money(w.perPerson)}</b>
                        <small>{t('tc.returnEach')}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
              {pickNote && <p className="tcard-note">{pickNote}</p>}
              {mode === 'plane' && (
                <div className="tcard-acts">
                  {cartaLine && (
                    <Button variant="quiet" size="sm" aria-expanded={flightsOpen} aria-controls={`${uid}-flights`}
                      iconEnd={<ChevronDownIcon size={14} />} className="tcard-more" onClick={() => setFlightsOpen((v) => !v)}>
                      {t('tc.flightDetails')}
                    </Button>
                  )}
                  <Button variant="quiet" size="sm" iconStart={<PencilIcon size={14} />} onClick={() => setSheetOpen(true)}>
                    {fare ? t('receipt.changeFare') : t('tp.fl.change')}
                  </Button>
                </div>
              )}
              {mode === 'plane' && cartaLine && flightsOpen && (
                <div className="dpc-flights tcard-flights" id={`${uid}-flights`}>
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
            </div>
          )}

          {/* Where you sleep (T1026, owner: "change stays"): the stay types
              this place prices, one tap each; the same choice the Lifestyle
              holds, so every card follows. */}
          {offered.length > 1 && (
            <div className="tcard-part">
              <h4 className="tcard-h">{t('lifestyle.stay')}</h4>
              <div className="tcard-chips" role="radiogroup" aria-label={t('lifestyle.stay')}>
                {offered.map((k) => (
                  <button type="button" key={k} role="radio" aria-checked={k === tier}
                    className={`tcard-chip${k === tier ? ' is-on' : ''}`}
                    onClick={() => { acted(); ctx.setChoices((prev) => ({ ...prev, stay_tier: k })); }}>
                    {t(`stay.${k}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* The breakdown: every line of the total, the total under them. */}
          <dl className="tcard-lines">
            {price.lines.map((l) => (
              <div key={l.key} className="tcard-line">
                <dt>
                  {opensLifestyle(l) ? (
                    <button type="button" className="tcard-line-btn" aria-haspopup="dialog" onClick={onOpenLifestyle}>
                      {lineLabel(l)}
                      <small>{lineSub(l)}<PencilIcon size={12} /></small>
                    </button>
                  ) : lineLabel(l)}
                </dt>
                <dd>
                  <Money value={l.eur} />
                  {l.thin && <ThinBedNote />}
                </dd>
              </div>
            ))}
            {/* T1075 (D10): a part with no figure yet says so in words; the
                total under it does not include it, and is never padded. */}
            {priceNotes(costRow).unmeasured.map((key) => (
              <div key={key} className="tcard-line is-unmeasured">
                <dt>{t(`price.item.${key}`)}</dt>
                <dd><NotMeasuredValue /></dd>
              </div>
            ))}
            <div className="tcard-line is-total">
              <dt>{t('destx.totalFor', { people: peopleText })}</dt>
              <dd><Money value={price.total} /></dd>
            </div>
          </dl>
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
          carries it), and one day as a quiet link under it. */}
      {onPlanTrip && (
        <Button variant="primary" block className="destp-plan-btn" iconStart={<RouteIcon size={18} />} onClick={onPlanTrip}>
          {t('dest.planTrip')}
        </Button>
      )}
      {onPlanDay && (
        <Button variant="quiet" size="sm" className="tcard-day" onClick={onPlanDay}>{t('destx.planOneDay')}</Button>
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
