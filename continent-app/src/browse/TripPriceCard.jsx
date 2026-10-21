import React, { useId, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useFirstRun } from '../lib/firstRunContext.js';
import { readOwnFare, writeOwnFare, markFirstResultSeen } from '../lib/firstRun.js';
import { Button, Money, Segmented } from '../components/ui/index.js';
import { Stepper } from '../components/FilterControls.jsx';
import { FlightSheet } from '../components/FlightSheet.jsx';
import { InfoDot } from '../components/InfoDot.jsx';
import { ReportProblem } from '../components/ReportProblem.jsx';
import { useSettings } from '../components/SettingsLine.jsx';
import { matchProfile, PROFILE_LABEL_KEYS } from './LifestylePanel.jsx';
import { formatMoney, formatEst } from '../lib/money.js';
import { useSettledFigure } from '../lib/figureChange.js';
import { SLOTS, includedRows, lifestyleShares, tripPrice } from '../lib/tripPrice.js';
import { IncludedList } from './ItemParts.jsx';
import { ChevronDownIcon, ChevronRightIcon, DownloadIcon, PlusIcon } from '../components/Icons.jsx';
import { legCost } from '../lib/flights/flights.js';
import { FlightRow, AirlineMark } from '../components/flights/Flights.jsx';
import { homeFlightSetup, journeyAirports, bestRoundTrip, backDate, withEnds } from './cartaFlight.js';

/**
 * The trip page's price card (T431, owner 2026-10-15): what the week costs a
 * person at the traveller's own choices, said plainly, with everything that
 * moves it within reach and nothing that does not.
 *
 *   the figure   the total a person at the length on screen, an estimate
 *                (the trips' budgets are written ranges), with its dot
 *   length       the short version or the whole trip (lib/tripLength.js)
 *   people       the app's party (FirstRunContext), so every card agrees
 *   Lifestyle    the one Lifestyle control (carta-design, T474): a row that
 *                names the traveller's Lifestyle and opens the panel, and one
 *                sentence with the trip's own range; the Lifestyle places the
 *                bed line and the other three on the trip's written ranges
 *                (lib/tripPrice.js lifestyleShares), so this page and every
 *                other price in the app move together
 *   your travel  Carta's return flight from the home airport to the week's
 *                cheapest gateway near the app's dates (T518, cartaFlight.js),
 *                or the traveller's own fare to the start and home, typed in
 *                and labelled as theirs, which wins; the same sheet and store
 *                as the destination page, keyed journey:<id>
 *   breakdown    four lines, closed until asked, each with its note behind
 *                a dot; then what is in and what is not, as rows
 *
 * From 1024 px the page holds it in a sticky side column; on a phone it sits
 * in the page after the reasons to go.
 */
const MAX_PARTY = 12;

const LINE_KEY = {
  accommodation: 'journey.bAccommodation',
  food: 'journey.bFood',
  transport: 'journey.bTransport',
  activities: 'journey.bActivities',
};

const SLOT = '';
/** A sentence with one money node in it, keeping the language's word order. */
function withMoney(text, money) {
  const [before, after = ''] = String(text).split(SLOT);
  return <>{before}{money}{after}</>;
}

export function TripPriceCard({
  trip, budget, days, lengthControl = null, onPdf = null, pdfBusy = false,
}) {
  const { t, lang } = useI18n();
  const ctx = useFirstRun();
  const uid = useId();
  const receiptKey = `journey:${trip.id}`;
  const [fare, setFare] = useState(() => readOwnFare(receiptKey));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [open, setOpen] = useState(false);
  React.useEffect(() => { setFare(readOwnFare(receiptKey)); }, [receiptKey]);

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

  const price = useMemo(() => tripPrice(budget, {
    sleepShare: shares.sleepShare,
    spendShare: shares.spendShare,
    days,
    party: people,
    fare: fare?.costTotal || 0,
    carta,
  }), [budget, shares.sleepShare, shares.spendShare, days, people, fare, carta]);
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

  return (
    <section className="tprice" id="sec-budget" aria-labelledby={`${uid}-h`}>
      <header className="tprice-head">
        <h2 className="tprice-title" id={`${uid}-h`}>{t('journey.priceHead', { n: days })}</h2>
        {price?.perPerson != null ? (
          <p className="tprice-fig">
            <span ref={figRef} className="tprice-fig-n"><Money value={price.perPerson} est /></span>
            <span className="tprice-unit">{t('journey.pricePp')}</span>
            <InfoDot term="estimate" />
          </p>
        ) : (
          <p className="tprice-none">{t('money.onRequest')}</p>
        )}
      </header>

      {lengthControl && <div className="tprice-row">{lengthControl}</div>}

      <div className="tprice-row is-split">
        <span className="tprice-label" id={`${uid}-party`}>{t('settings.party')}</span>
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

      {price?.perPerson != null && settings?.openLifestyle && (
        <div className="tprice-ls">
          <Button
            variant="secondary"
            block
            className="tprice-ls-btn"
            aria-haspopup="dialog"
            onClick={settings.openLifestyle}
            iconEnd={<ChevronRightIcon size={18} />}
          >
            <span className="tprice-ls-label">{t('settings.lifestyle')}</span>
            <span className="tprice-ls-value">{lifestyleText}</span>
          </Button>
          {ends.low != null && ends.high != null && ends.high > ends.low && (
            <p className="tprice-ls-say">
              {withMoney(t('journey.lsRange', { range: SLOT }), <Money low={ends.low} high={ends.high} est />)}
            </p>
          )}
        </div>
      )}

      {price?.total != null && (
        <dl className="tprice-sum">
          {price.fare > 0 && (
            <div className="tprice-line is-own">
              <dt>{t('journey.yourTravel')}</dt>
              <dd>{eur(price.fare)}</dd>
            </div>
          )}
          {flight && (
            <div className="tprice-line is-own">
              <dt><AirlineMark code={flight.out.airline} size="sm" />{' '}{t('flight.flightLine')}</dt>
              <dd><Money value={flight.total} precision="cents" /></dd>
            </div>
          )}
          <div className="tprice-line is-total">
            <dt>{t('receipt.total', { people: peopleText })}</dt>
            <dd><Money value={price.total} est precision="cents" /></dd>
          </div>
        </dl>
      )}

      {flight && (
        <div className="tprice-flights">
          <FlightRow leg={withEnds(flight.out, fl.file?.from, flight.airport)}
            cost={legCost(flight.out, { paying: people, bagKey: fl.bagKey })}
            dir="out" bagKey={fl.bagKey} wantedDate={fl.from} />
          <FlightRow leg={withEnds(flight.back, flight.airport, fl.file?.from)}
            cost={legCost(flight.back, { paying: people, bagKey: fl.bagKey })}
            dir="back" bagKey={fl.bagKey} wantedDate={flightBack} />
        </div>
      )}

      <div className="tprice-acts">
        <Button variant="secondary" block className="tprice-fare" onClick={() => setSheetOpen(true)}
          iconStart={fare ? null : <PlusIcon size={20} />}>
          {fare ? t('journey.changeTravel') : t('journey.addTravel')}
        </Button>
        {onPdf && (
          <Button variant="secondary" block className="ipage-pdf" onClick={() => onPdf(priceModel())} loading={pdfBusy}
            iconStart={<DownloadIcon size={20} />}>
            {t('item.pdf')}
          </Button>
        )}
      </div>

      <IncludedList rows={included} label={t('journey.incAria')} />

      {price && budget?.breakdown && (
        <div className="tprice-more">
          <Button variant="quiet" size="sm" className="tprice-toggle" aria-expanded={open}
            aria-controls={`${uid}-lines`} onClick={() => setOpen((v) => !v)}
            iconEnd={<ChevronDownIcon size={16} className={open ? 'tday-chev is-open' : 'tday-chev'} />}>
            {t('journey.seeBreakdown')}
          </Button>
          <dl className="tprice-lines" id={`${uid}-lines`} hidden={!open}>
            {SLOTS.map((slot) => {
              const row = budget.breakdown[slot];
              const v = price.rows[slot];
              if (!row || v == null) return null;
              return (
                <div key={slot} className="tprice-line">
                  <dt>
                    {t(LINE_KEY[slot])}
                    {row.note && (
                      <InfoDot title={t(LINE_KEY[slot])}>
                        <p className="infodot-text">{row.note}</p>
                      </InfoDot>
                    )}
                  </dt>
                  <dd><Money value={v} est /></dd>
                </div>
              );
            })}
          </dl>
          {open && (
            <div className="tprice-report">
              <ReportProblem priceOnly item={{ layer: 'trip', id: trip.id, name: trip.title }} />
            </div>
          )}
        </div>
      )}

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
