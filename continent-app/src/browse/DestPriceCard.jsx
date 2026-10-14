import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useFirstRun } from '../lib/firstRunContext.js';
import { readOwnFare, writeOwnFare, markFirstResultSeen } from '../lib/firstRun.js';
import { tripDaysBetween } from '../lib/runtime_pricing.js';
import { addDays } from '../lib/dates.js';
import { priceFromIndex } from '../lib/destPrice.js';
import { useSettledFigure } from '../lib/figureChange.js';
import { Button, Money, Segmented } from '../components/ui/index.js';
import { formatMoney } from '../lib/money.js';
import { Stepper } from '../components/FilterControls.jsx';
import { DateField } from '../components/DateField.jsx';
import { ReceiptLine, ReceiptSum, useSettleChanged } from '../components/ReceiptCard.jsx';
import { FlightSheet } from '../components/FirstRunReceipt.jsx';
import { ReportProblem } from '../components/ReportProblem.jsx';
import { ChevronDownIcon, ChevronRightIcon, RouteIcon, SunIcon } from '../components/Icons.jsx';
import { isNational } from '../components/CostSummary.jsx';
import { InfoDot } from '../components/InfoDot.jsx';
import { matchProfile, PROFILE_LABEL_KEYS } from './LifestylePanel.jsx';

/**
 * The destination page's price card (T429): what a day here costs at the
 * traveller's Lifestyle, what the stay comes to, and the page's one primary.
 *
 * One cost truth (owner decision 2026-10-13, closing T374-d and T385-a): the
 * day figure is the computeCosts row the Explore card and the map pin print,
 * and the total is that day times the nights and the party (lib/destPrice.js).
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
const MAX_PARTY = 12;

export function DestPriceCard({
  dest, city, onOpenLifestyle, onPlanTrip, onPlanDay, reportItem, carDayEur = null,
}) {
  const { t, lang, languages } = useI18n();
  const ctx = useFirstRun();
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
  const nights = from && to && to > from ? Math.max(1, tripDaysBetween(from, to)) : 7;
  const people = Math.max(1, Math.min(MAX_PARTY, Math.round(choices?.group_size || 2)));
  const price = React.useMemo(
    () => priceFromIndex(costRow, nights, people, fare),
    [costRow, nights, people, fare],
  );

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

  const label = (line) => (line.key === 'flight' ? t('receipt.yourFlight')
    : line.key === 'stay' ? t('receipt.stay', { nights: nightsText }) : t('receipt.ground'));
  const stayLine = price.lines.find((l) => l.key === 'stay');
  const foodLine = price.lines.find((l) => l.key === 'ground');
  const share = (l) => (price.total > 0 ? `${(l.eur / price.total) * 100}%` : '0');

  return (
    <section className="dprice" aria-labelledby={`${uid}-h`}>
      <header className="dprice-head">
        <h2 className="dprice-title" id={`${uid}-h`}>{t('dest.priceTitle', { nights: nightsText, city })}</h2>
        <p className="dprice-day">
          {/* One dot explains the mark, on its first occurrence (carta-design
              "InfoDot", T446), set against "est." so it never reads as a
              separator between the figure and its unit. */}
          <span className="dprice-fig">
            <span ref={dayRef}><Money value={price.dayEur} est={isNational(costRow)} /></span>
            {isNational(costRow) && <InfoDot term="estimate" />}
          </span>
          <span className="dprice-day-unit">{t('dest.priceDayUnit')}</span>
        </p>
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

      <dl className="frr-lines dprice-lines" ref={linesRef}>
        {price.lines.map((line) => (
          <ReceiptLine key={line.key} t={t} line={{ key: line.key, label: label(line), eur: line.eur, est: line.est }} />
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

      <div className="dprice-foot">
        <p className="dprice-excludes">
          {t(fare ? 'dest.priceExcludesFare' : 'dest.priceExcludes')}
          {/* Where the page says a car is needed, its hire is the largest
              cost the day figure leaves out: said once, as a figure (T446). */}
          {Number.isFinite(carDayEur) && carDayEur > 0 && (
            <> {t('dest.priceCarHire', { eur: formatMoney(carDayEur) })}</>
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
