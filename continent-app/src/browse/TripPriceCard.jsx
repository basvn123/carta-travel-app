import React, { useId, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useFirstRun } from '../lib/firstRunContext.js';
import { readOwnFare, writeOwnFare, markFirstResultSeen } from '../lib/firstRun.js';
import { Button, Money, Segmented } from '../components/ui/index.js';
import { DateField } from '../components/DateField.jsx';
import { addDays } from '../lib/dates.js';
import { Stepper } from '../components/FilterControls.jsx';
import { FlightSheet } from '../components/FlightSheet.jsx';
import { ReportProblem } from '../components/ReportProblem.jsx';
import { useSettings } from '../components/SettingsLine.jsx';
import { matchProfile, PROFILE_LABEL_KEYS } from './LifestylePanel.jsx';
import { formatMoney, formatEst } from '../lib/money.js';
import { useSettledFigure } from '../lib/figureChange.js';
import { SLOTS, includedRows, lifestyleShares, tripPrice } from '../lib/tripPrice.js';
import { BedIcon, BookmarkIcon, DiningIcon, DownloadIcon, RouteIcon, TicketIcon, TrainIcon } from '../components/Icons.jsx';
import { legCost } from '../lib/flights/flights.js';
import { FlightRow, FlightLink, AirlineMark } from '../components/flights/Flights.jsx';
import { homeFlightSetup, journeyAirports, bestRoundTrip, backDate, withEnds } from './cartaFlight.js';
import { loadLiveStay, nearestLiveDest, useLiveStaysVersion } from '../lib/liveStays.js';
import { liveStayRatio } from '../lib/stayPrice.js';
import { useStaysVersion } from '../lib/staysData.js';
import { rule } from '../lib/price/config.js';

/**
 * The trip page's price card (T431; since T913 the place page's shell, the
 * owner's approved spec of 2026-10-30): what the trip costs a person, the
 * inputs that move it, and the page's one primary.
 *
 *   the figure   the trip's written range a person at the length on screen
 *   length       the short version or the whole trip (lib/tripLength.js)
 *   fields       Start (a calendar on the app's leaving day), Travellers (the
 *                app's party, a stepper) and the stay level (the one
 *                Lifestyle panel, carta-design T474)
 *   the ranges   accommodation, food, transport and visits, each its range
 *   the total    Carta's return flight from the home airport to the week's
 *                cheapest gateway (T518, cartaFlight.js) or the traveller's
 *                own fare, which wins; then "Total for N" as a range
 *   actions      ONE primary (Plan this trip), Save and PDF as secondaries,
 *                the own fare as a quiet link; no "Not included" rows
 *
 * The PDF still prints the Lifestyle-placed figure and what is in and out
 * (priceModel), as the booklet did. From 1024 px the page holds the card
 * in a sticky side column; below it the card sits in the page and the foot
 * bar carries the primary (`openSignal` opens the start from that bar).
 */
const MAX_PARTY = rule('party.limits').max_seats;   // T691: one cap

const LINE_KEY = {
  accommodation: 'journey.bAccommodation',
  food: 'journey.bFood',
  transport: 'journey.bTransport',
  activities: 'journey.bActivities',
};

// The icon each breakdown line carries.
const SLOT_ICON = { accommodation: BedIcon, food: DiningIcon, transport: TrainIcon, activities: TicketIcon };

export function TripPriceCard({
  trip, budget, days, lengthControl = null, onPdf = null, pdfBusy = false,
  // T913: the page's one primary, the trip's save, and the foot bar's signal.
  onPlan = null, fav = false, onFav = null, openSignal = 0,
}) {
  const { t, lang, languages } = useI18n();
  const ctx = useFirstRun();
  const uid = useId();
  const bcp47 = languages?.find?.((l) => l.code === lang)?.bcp47 || 'en-GB';
  const shortDate = (iso) => {
    try {
      return new Intl.DateTimeFormat(bcp47, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(`${iso}T00:00:00Z`));
    } catch { return iso; }
  };
  const receiptKey = `journey:${trip.id}`;
  const [fare, setFare] = useState(() => readOwnFare(receiptKey));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const startBtnRef = React.useRef(null);
  React.useEffect(() => { setFare(readOwnFare(receiptKey)); }, [receiptKey]);
  React.useEffect(() => {
    if (!openSignal) return;
    setDateOpen(true);
    setPartyOpen(false);
    requestAnimationFrame(() => startBtnRef.current?.focus?.({ preventScroll: true }));
  }, [openSignal]);

  // The traveller's one Lifestyle (the settings line's, App's choices) places
  // each line on the trip's written range; the panel is where it changes.
  const settings = useSettings();
  const shares = lifestyleShares(settings?.lifestyle, settings?.stayTier);
  const profileKey = matchProfile(settings?.lifestyle || {});
  const lifestyleText = [
    t(`stay.${settings?.stayTier || 'home'}`),
    profileKey ? t(PROFILE_LABEL_KEYS[profileKey]) : t('lifestyle.custom'),
  ].join(', ');

  const people = Math.max(1, Math.min(MAX_PARTY, Math.round(ctx?.choices?.group_size || 1)));
  const setPeople = (n) => {
    markFirstResultSeen();
    ctx?.setChoices?.((prev) => ({ ...prev, group_size: Math.min(MAX_PARTY, Math.max(1, Math.round(n))) }));
  };

  // Carta's flight (T518): out on the app's leaving day, home after the
  // week's own nights, into whichever gateway is cheapest. A typed fare wins.
  const fl = homeFlightSetup(ctx);
  const codes = useMemo(() => journeyAirports(trip), [trip]);
  const flightBack = backDate(fl.from, days - 1);
  const carta = useMemo(
    () => (fare?.costTotal ? null : bestRoundTrip(fl.file, codes, fl.from, flightBack, { paying: people, bagKey: fl.bagKey })),
    [fare, fl.file, codes, fl.from, flightBack, people, fl.bagKey],
  );

  // T559: with the traveller's own dates, the week's beds follow tonight's
  // prices at the nearest place Carta prices live (a journey names towns, not
  // destinations), within 40 km of where it starts. The accommodation line
  // moves by that place's live to model ratio; nothing else changes.
  const staysVersion = useStaysVersion();
  const liveVersion = useLiveStaysVersion();
  const ownStart = ctx?.departDate || null;
  const nights = Math.max(1, days - 1);
  const liveDest = useMemo(
    () => (ownStart && staysVersion >= 0
      ? nearestLiveDest(ctx?.data?.destinations, trip.coordinates?.lat, trip.coordinates?.lon) : null),
    [ownStart, staysVersion, ctx?.data, trip.coordinates?.lat, trip.coordinates?.lon],
  );
  React.useEffect(() => {
    if (liveDest && ownStart) loadLiveStay(liveDest.id, ownStart, nights, people);
  }, [liveDest, ownStart, nights, people]);
  const live = useMemo(
    () => (liveDest && ownStart && liveVersion >= 0
      ? liveStayRatio({ dest: liveDest, tier: settings?.stayTier || 'home', adults: people, nights, start: ownStart })
      : null),
    [liveDest, ownStart, liveVersion, settings?.stayTier, people, nights],
  );
  const price = useMemo(() => {
    const p = tripPrice(budget, {
      sleepShare: shares.sleepShare,
      spendShare: shares.spendShare,
      days,
      party: people,
      fare: fare?.costTotal || 0,
      carta,
    });
    const bed = p?.rows?.accommodation;
    if (!live || !(bed > 0)) return p;
    const delta = bed * (live.ratio - 1);
    const perPerson = p.perPerson + delta;
    return {
      ...p,
      rows: { ...p.rows, accommodation: bed + delta },
      perPerson,
      perDay: days > 0 ? Math.round(perPerson / days) : p.perDay,
      total: p.total + delta * p.party,
      liveStay: true,
    };
  }, [budget, shares.sleepShare, shares.spendShare, days, people, fare, carta, live]);
  // The trip's own range a person, simplest end to most generous, for the
  // sentence under the Lifestyle row.
  const ends = useMemo(() => ({
    low: tripPrice(budget, { sleepShare: 0, spendShare: 0, days })?.perPerson ?? null,
    high: tripPrice(budget, { sleepShare: 1, spendShare: 1, days })?.perPerson ?? null,
  }), [budget, days]);

  const figRef = React.useRef(null);
  useSettledFigure(figRef, price ? `${trip.id}:${price.perPerson}` : '');

  const eur = (v) => formatMoney(v, { precision: 'cents', locale: lang });
  const peopleText = people === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: people });
  const flight = price?.carta || null;
  const included = includedRows(trip, { nights: Math.max(1, days - 1), fare: fare?.costTotal || 0, carta: flight })
    .map((r) => ({
      key: r.key,
      in: r.in,
      label: r.text || t(r.labelKey, r.params || {}),
      srState: t(r.in ? 'journey.incYes' : 'journey.incNo'),
      value: r.key === 'travel' && fare?.costTotal ? eur(fare.costTotal)
        : r.key === 'travel' && r.in && flight ? eur(flight.total) : null,
    }));
  // What the booklet prints for the price (lib/tripPdf.js): this card's
  // own figures at the traveller's choices, never a second sum.
  const est = (v, precision = 'whole') => formatEst(v, t('money.est'), { precision, locale: lang });
  const priceModel = () => (price ? {
    days,
    title: t('journey.priceHead', { n: days }),
    perPerson: price.perPerson,
    lines: SLOTS.filter((slot) => price.rows[slot] != null)
      .map((slot) => ({ label: t(LINE_KEY[slot]), value: est(price.rows[slot]) })),
    ppLabel: t('journey.pricePpLine'),
    ppValue: est(price.perPerson),
    partyLabel: t('receipt.total', { people: peopleText }),
    partyValue: est(price.total, 'cents'),
    included: included.map((r) => ({ in: r.in, label: r.label, value: r.value })),
  } : null);
  const saveFare = (f) => {
    markFirstResultSeen();
    writeOwnFare(receiptKey, f);
    setFare(readOwnFare(receiptKey) || f);
    setSheetOpen(false);
  };
  const removeFare = () => {
    writeOwnFare(receiptKey, null);
    setFare(null);
    setSheetOpen(false);
  };

  // The written ranges a person (the card's four lines and its headline,
  // the owner's spec): the trip's own low and high, at the length on screen.
  const ranges = SLOTS.map((slot) => {
    const row = budget?.breakdown?.[slot];
    return row && Number.isFinite(row.lowEur) && Number.isFinite(row.highEur)
      ? { slot, low: row.lowEur, high: row.highEur } : null;
  }).filter(Boolean);
  const travelEur = price?.fare > 0 ? price.fare : (flight ? flight.total : 0);
  const totalLow = ends.low != null ? ends.low * people + travelEur : null;
  const totalHigh = ends.high != null ? ends.high * people + travelEur : null;
  const startText = fl.from ? shortDate(fl.from) : '';

  return (
    <section className="tprice pt-card" id="sec-budget" aria-labelledby={`${uid}-h`}>
      <h3 className="sr-only" id={`${uid}-h`}>{t('journey.priceHead', { n: days })}</h3>
      {ends.low != null && ends.high != null ? (
        <p className="pt-pr">
          <span ref={figRef} className="pt-pr-fig"><Money low={ends.low} high={ends.high} /></span>
          <span className="pt-pr-unit">{t('journey.pricePp')}</span>
        </p>
      ) : (
        <p className="tprice-none">{t('money.onRequest')}</p>
      )}

      {lengthControl && <div className="tprice-row">{lengthControl}</div>}

      {/* The inputs the price depends on, as fields (the place page's): the
          start opens a calendar, the travellers a stepper, the stay level the
          one Lifestyle panel. */}
      <div className="pt-fields" role="group" aria-label={t('receipt.stripAria')}>
        <Button variant="quiet" className="pt-field" aria-expanded={dateOpen} aria-controls={`${uid}-start`}
          ref={startBtnRef} onClick={() => { setDateOpen((v) => !v); setPartyOpen(false); }}>
          <span className="pt-field-label">{t('jx.start')}</span>
          <span className="pt-field-value">{startText}</span>
        </Button>
        <Button variant="quiet" className="pt-field" aria-expanded={partyOpen} aria-controls={`${uid}-party`}
          onClick={() => { setPartyOpen((v) => !v); setDateOpen(false); }}>
          <span className="pt-field-label">{t('destx.travellers')}</span>
          <span className="pt-field-value">{peopleText}</span>
        </Button>
        {settings?.openLifestyle && (
          <Button variant="quiet" className="pt-field is-wide" aria-haspopup="dialog" onClick={settings.openLifestyle}>
            <span className="pt-field-label">{t('receipt.stripStay')}</span>
            <span className="pt-field-value">{lifestyleText}</span>
          </Button>
        )}
      </div>
      {dateOpen && ctx?.setDepartDate && (
        <div className="dprice-dates" id={`${uid}-start`}>
          <DateField
            inline
            value={fl.from}
            min={ctx.dateBounds?.min}
            max={ctx.dateBounds?.max}
            onChange={(iso) => {
              if (!iso) return;
              markFirstResultSeen();
              ctx.setDepartDate(iso);
              ctx.setReturnDate?.(addDays(iso, Math.max(1, days - 1)));
              setDateOpen(false);
            }}
          />
        </div>
      )}
      {partyOpen && (
        <div className="pt-party" id={`${uid}-party`}>
          <span className="pt-field-label">{t('settings.party')}</span>
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
      )}

      {ranges.length > 0 && (
        <ul className="pt-split" aria-label={t('destx.splitAria')}>
          {ranges.map((r) => {
            const Icon = SLOT_ICON[r.slot];
            return (
              <li key={r.slot}>
                <Icon size={16} className="pt-split-icon" />
                <span>{t(LINE_KEY[r.slot])}</span>
                <b><Money low={r.low} high={r.high} /></b>
              </li>
            );
          })}
        </ul>
      )}

      {totalLow != null && totalHigh != null && (
        <dl className="pt-tot">
          {price?.fare > 0 && (
            <div>
              <dt>{t('journey.yourTravel')}</dt>
              <dd><Money value={price.fare} precision="cents" /></dd>
            </div>
          )}
          {!(price?.fare > 0) && flight && (
            <div>
              <dt className="dprice-flt-label"><AirlineMark code={flight.out.airline} size="sm" />{' '}{t('flight.flightLine')}</dt>
              <dd><Money value={flight.total} precision="cents" /></dd>
            </div>
          )}
          <div className="is-big">
            <dt>{t('destx.totalFor', { people: peopleText })}</dt>
            <dd><Money low={totalLow} high={totalHigh} /></dd>
          </div>
        </dl>
      )}

      {flight && (
        <div className="tprice-flights">
          <FlightRow leg={withEnds(flight.out, fl.file?.from, flight.airport)}
            cost={legCost(flight.out, { paying: people, bagKey: fl.bagKey })}
            dir="out" bagKey={fl.bagKey} wantedDate={fl.from} linkOut={false} />
          <FlightRow leg={withEnds(flight.back, flight.airport, fl.file?.from)}
            cost={legCost(flight.back, { paying: people, bagKey: fl.bagKey })}
            dir="back" bagKey={fl.bagKey} wantedDate={flightBack} linkOut={false} />
          <FlightLink from={fl.file?.from} to={flight.airport} date={flight.out?.date} back={flight.back?.date} />
        </div>
      )}

      {/* The page's one primary, then Save and PDF as two secondaries. */}
      {onPlan && (
        <Button variant="primary" block className="destp-plan-btn" iconStart={<RouteIcon size={18} />} onClick={onPlan}>
          {t('brief.planThisTrip')}
        </Button>
      )}
      {(onFav || onPdf) && (
        <div className="pt-card-row">
          {onFav && (
            <Button variant="secondary" size="sm" aria-pressed={fav} onClick={onFav}
              iconStart={<BookmarkIcon size={16} />}>
              {fav ? t('jx.saved') : t('jx.save')}
            </Button>
          )}
          {onPdf && (
            <Button variant="secondary" size="sm" className="ipage-pdf" onClick={() => onPdf(priceModel())} loading={pdfBusy}
              iconStart={<DownloadIcon size={16} />}>
              {t('jx.pdf')}
            </Button>
          )}
        </div>
      )}
      <div className="pt-alts">
        <Button variant="quiet" size="sm" className="tprice-fare pt-alt" onClick={() => setSheetOpen(true)}>
          {fare ? t('journey.changeTravel') : t('journey.addTravel')}
        </Button>
      </div>
      <div className="tprice-report">
        <ReportProblem priceOnly item={{ layer: 'trip', id: trip.id, name: trip.title }} />
      </div>

      {sheetOpen && (
        <FlightSheet
          fare={fare}
          origin={ctx?.choices?.origin}
          data={ctx?.data}
          setOrigin={(code) => ctx?.setOrigin?.(code)}
          from={ctx?.departDate || null}
          to={ctx?.returnDate || null}
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

/** The segmented length choice, for the card's first row. */
export function TripLengthChoice({ lengths, value, onChange }) {
  const { t } = useI18n();
  if (!lengths || lengths.short.days >= lengths.week.days) return null;
  return (
    <Segmented
      block
      size="sm"
      className="tprice-length"
      label={t('journey.lenLabel')}
      value={value}
      onChange={onChange}
      options={[
        { value: 'short', label: t('journey.nDays', { n: lengths.short.days }) },
        { value: 'week', label: t('journey.nDays', { n: lengths.week.days }) },
      ]}
    />
  );
}
