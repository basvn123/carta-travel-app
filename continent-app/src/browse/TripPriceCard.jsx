import React, { useId, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useFirstRun } from '../lib/firstRunContext.js';
import { readOwnFare, writeOwnFare, markFirstResultSeen } from '../lib/firstRun.js';
import { Button, Money, Segmented } from '../components/ui/index.js';
import { Stepper } from '../components/FilterControls.jsx';
import { FlightSheet } from '../components/FirstRunReceipt.jsx';
import { InfoDot } from '../components/InfoDot.jsx';
import { ReportProblem } from '../components/ReportProblem.jsx';
import { formatMoney } from '../lib/money.js';
import { useSettledFigure } from '../lib/figureChange.js';
import { offeredSleepGroups, tierForGroup } from '../lib/sleepGroups.js';
import { stopIndexFor, stopShare } from '../lib/lifestyleSlider.js';
import {
  SLOTS, SPEND_STOPS, includedRows, readSpend, tripPrice, writeSpend,
} from '../lib/tripPrice.js';
import { IncludedList } from './ItemParts.jsx';
import { ChevronDownIcon, DownloadIcon, PlusIcon } from '../components/Icons.jsx';

/**
 * The trip page's price card (T431, owner 2026-10-15): what the week costs a
 * person at the traveller's own choices, said plainly, with everything that
 * moves it within reach and nothing that does not.
 *
 *   the figure   the total a person at the length on screen, an estimate
 *                (the trips' budgets are written ranges), with its dot
 *   length       the short version or the whole trip (lib/tripLength.js)
 *   people       the app's party (FirstRunContext), so every card agrees
 *   two sliders  where you sleep (the Lifestyle stay groups the dataset
 *                offers, which moves the bed line) and how you spend (food,
 *                getting around and activities, low end to high end)
 *   your travel  the traveller's own fare to the start and home, typed in
 *                and labelled as theirs (Carta never prices a flight); the
 *                same sheet and store as the destination page, keyed
 *                journey:<id>
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

/** A stepped range control with its words under the stops. */
function StopRange({ label, stops, index, onPick, id }) {
  const { t, lang } = useI18n();
  const n = stops.length;
  return (
    <div className="tprice-range" style={{ '--n': n }}>
      <label className="tprice-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        className="tprice-range-input"
        min="0"
        max={n - 1}
        step="1"
        value={index}
        aria-valuetext={t(stops[index]?.labelKey)}
        onChange={(e) => onPick(Number(e.target.value))}
      />
      <div className="tprice-stops" aria-hidden="true" lang={lang}>
        {stops.map((s, i) => (
          <span key={s.key} className={`tprice-stop${i === index ? ' is-on' : ''}`}>{t(s.labelKey)}</span>
        ))}
      </div>
    </div>
  );
}

export function TripPriceCard({
  trip, budget, days, lengthControl = null, stayTier = 'home', stayTiers = null, onChangeStayTier = null,
  onPdf = null, pdfBusy = false,
}) {
  const { t, lang } = useI18n();
  const ctx = useFirstRun();
  const uid = useId();
  const receiptKey = `journey:${trip.id}`;
  const [fare, setFare] = useState(() => readOwnFare(receiptKey));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [spend, setSpendKey] = useState(readSpend);
  React.useEffect(() => { setFare(readOwnFare(receiptKey)); }, [receiptKey]);

  // Where you sleep: the stay groups the dataset offers (T173), or the four
  // a week can be slept in when the host passes none.
  const sleepStops = useMemo(() => {
    const offered = offeredSleepGroups(stayTiers);
    return offered.length > 1 ? offered : [];
  }, [stayTiers]);
  const [localStop, setLocalStop] = useState(null);
  const sleepAt = localStop ?? stopIndexFor(sleepStops, stayTier);
  const pickSleep = (i) => {
    setLocalStop(i);
    const g = sleepStops[i];
    if (g && onChangeStayTier) onChangeStayTier(tierForGroup(g, stayTier));
  };
  const spendAt = Math.max(0, SPEND_STOPS.findIndex((s) => s.key === spend));
  const pickSpend = (i) => { const k = SPEND_STOPS[i]?.key || 'mid'; setSpendKey(k); writeSpend(k); };

  const people = Math.max(1, Math.min(MAX_PARTY, Math.round(ctx?.choices?.group_size || 1)));
  const setPeople = (n) => {
    markFirstResultSeen();
    ctx?.setChoices?.((prev) => ({ ...prev, group_size: Math.min(MAX_PARTY, Math.max(1, Math.round(n))) }));
  };

  const price = useMemo(() => tripPrice(budget, {
    sleepShare: sleepStops.length ? stopShare(sleepAt, sleepStops.length) : 0.5,
    spendShare: SPEND_STOPS[spendAt]?.share ?? 0.5,
    days,
    party: people,
    fare: fare?.costTotal || 0,
  }), [budget, sleepStops.length, sleepAt, spendAt, days, people, fare]);

  const figRef = React.useRef(null);
  useSettledFigure(figRef, price ? `${trip.id}:${price.perPerson}` : '');

  const eur = (v) => formatMoney(v, { precision: 'cents', locale: lang });
  const peopleText = people === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: people });
  const included = includedRows(trip, { nights: Math.max(1, days - 1), fare: fare?.costTotal || 0 })
    .map((r) => ({
      key: r.key,
      in: r.in,
      label: r.text || t(r.labelKey, r.params || {}),
      srState: t(r.in ? 'journey.incYes' : 'journey.incNo'),
      value: r.key === 'travel' && fare?.costTotal ? eur(fare.costTotal) : null,
    }));
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

      {price?.perPerson != null && sleepStops.length > 1 && (
        <StopRange id={`${uid}-sleep`} label={t('journey.bedsLabel')} stops={sleepStops} index={sleepAt} onPick={pickSleep} />
      )}
      {price?.perPerson != null && (
        <StopRange id={`${uid}-spend`} label={t('journey.spendLabel')} stops={SPEND_STOPS} index={spendAt} onPick={pickSpend} />
      )}

      {price?.total != null && (
        <dl className="tprice-sum">
          {price.fare > 0 && (
            <div className="tprice-line is-own">
              <dt>{t('journey.yourTravel')}</dt>
              <dd>{eur(price.fare)}</dd>
            </div>
          )}
          <div className="tprice-line is-total">
            <dt>{t('receipt.total', { people: peopleText })}</dt>
            <dd><Money value={price.total} est precision="cents" /></dd>
          </div>
        </dl>
      )}

      <div className="tprice-acts">
        <Button variant="secondary" block className="tprice-fare" onClick={() => setSheetOpen(true)}
          iconStart={fare ? null : <PlusIcon size={20} />}>
          {fare ? t('journey.changeTravel') : t('journey.addTravel')}
        </Button>
        {onPdf && (
          <Button variant="secondary" block className="ipage-pdf" onClick={onPdf} loading={pdfBusy}
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
        </div>
      )}

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
