import React from 'react';
import { BAND_KEY, eurDay } from '../lib/costIndex.js';
import { BedIcon, DiningIcon } from './Icons.jsx';
import { useSettledFigure } from '../lib/figureChange.js';
import { Money } from './ui/Money.jsx';
import { AirlineMark } from './flights/Flights.jsx';
import { formatMoney } from '../lib/money.js';

/**
 * The cost language for the whole Explore page: a euro figure, a five-step
 * gauge to read it against, and a sentence naming where the number came from.
 *
 * The gauge exists because a number needs a scale. "EUR 71 a day" is only
 * meaningful to someone who already knows what Europe costs, and the whole
 * point of a comparison page is that the reader does not. Five filled segments
 * is Portugal against Switzerland without either of them having to be named.
 *
 * Colour is used as data, not decoration: the cheapest band is green because
 * cheapest is the one thing this product exists to point at, and every other
 * band is ink (V4, explore N7: the accent means an action, never a price). A five-colour ramp would
 * turn a measurement into a mood.
 */

const BAND_CLASS = ['cheapest', 'cheap', 'mid', 'dear', 'dearest'];

/** Five segments, filled up to the band. Decorative in the a11y sense: the
 *  figure and the band word next to it carry the same information as text. */
export function CostGauge({ band, size = 'sm' }) {
  if (band == null) return null;
  return (
    <span className={`cost-gauge ${size} ${BAND_CLASS[band]}`} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={`cost-seg ${i <= band ? 'on' : ''}`} />
      ))}
    </span>
  );
}

/**
 * True when the day figure leans on a country-level stand-in: the bed or the
 * food was not measured in the town (a national figure, or a country median
 * repairing a broken harvest). The card then says so in one word (house rule
 * "Pedigree word", DIRECTION.md part 9, explore N3), never only by colour.
 */
export function isNational(cost) {
  if (!cost || cost.dayEur == null) return false;
  return cost.stayLevel !== 'city' || cost.foodLevel !== 'city';
}

/**
 * The card foot: what a day here costs one person, and the gauge that says
 * whether that is cheap. One line, one number, no decimals the data cannot
 * support.
 *
 * V3 (T383): the figure leads and the gauge follows it, and a figure that
 * includes a national stand-in carries the word "national" after its unit.
 * `gauge={false}` draws the figure alone (the card's first line), and
 * `figure={false}` draws the gauge alone (the line under it). The word's
 * InfoDot cannot sit here: the line is inside the card's open-the-place
 * button, and a button cannot hold a button.
 */
export function CostLine({ cost, t, gauge = true, figure = true }) {
  // V4 (T393): when the Lifestyle changes, the figure changes in place and
  // settles with one opacity dip (house rule "Figure in place"); a card that
  // mounts with its figure does not dip.
  const eurRef = React.useRef(null);
  useSettledFigure(eurRef, figure ? cost?.dayEur : null);
  if (!cost || cost.dayEur == null) return null;
  if (!figure) {
    return gauge
      ? <span className="xcard-cost xcard-cost--gauge"><CostGauge band={cost.dayBand} /></span>
      : null;
  }
  const bandWord = t(BAND_KEY[cost.dayBand]);
  const national = isNational(cost);
  return (
    <span
      className="xcard-cost"
      title={t('cost.dayTitle', { bed: eurDay(cost.stayEur), food: eurDay(cost.foodEur) })}
      aria-label={t(national ? 'cost.dayAriaNational' : 'cost.dayAria', { eur: eurDay(cost.dayEur), band: bandWord })}
    >
      <span className="xcard-cost-eur mono" ref={eurRef}>{eurDay(cost.dayEur)}</span>
      <span className="xcard-cost-unit">{t('cost.perDay')}</span>
      {national && <span className="xcard-cost-level">{t('cost.national')}</span>}
      {gauge && <CostGauge band={cost.dayBand} />}
    </span>
  );
}

/** One row of the receipt: what it is, the gauge, the figure. A figure not
 *  measured in the town carries the estimate mark, as everywhere else. */
function CostRow({ icon: Icon, label, eur, band, est }) {
  if (eur == null) return null;
  return (
    <div className="cost-row">
      <span className="cost-row-label">
        <Icon size={13} />
        <span className="cost-row-text">{label}</span>
      </span>
      <CostGauge band={band} />
      <span className="cost-row-eur"><Money value={eur} est={est} /></span>
    </div>
  );
}

/**
 * The compact day receipt in Explore's hover preview: bed, food, a rule,
 * the day, with the cost bar above them. The same day figure as the card,
 * the pin and the destination page (one cost truth, T429).
 *
 * T429 (row T427-c) took the source words off it: the "city" and
 * "country" level words became the estimate mark on the figure itself
 * (the tilde and "est."), the way every other price on Carta says it, and the
 * method sentences the destination page used to print under it left with
 * the page's own (owner, 2026-10-13: the method stays in the data).
 *
 * T518: under the day, when the card shows one, the cheapest return flight
 * a person in the travel month (`cost.flight`), whole euros as on the card.
 * It is not part of the day, so it sits after the day's sum, not in it.
 */
export function CostReceipt({ cost, t }) {
  if (!cost || cost.dayEur == null) return null;
  const bandWord = t(BAND_KEY[cost.dayBand]);

  // The cost bar (house rule "The cost bar", V4 T393): one segment per line
  // in receipt order, in the ink ramp, 8 px, no figures on the bar; the lines
  // below carry them. Drawn only when both lines are.
  const bar = cost.stayEur != null && cost.foodEur != null && cost.stayEur + cost.foodEur > 0;

  return (
    <div className="cost-receipt">
      {bar && (
        <span className="xcost-bar" aria-hidden="true">
          <span className="xcost-bar-seg" style={{ flexGrow: cost.stayEur }} />
          <span className="xcost-bar-seg" style={{ flexGrow: cost.foodEur }} />
        </span>
      )}
      <CostRow icon={BedIcon} label={t('cost.bed')} eur={cost.stayEur} band={cost.stayBand}
        est={cost.stayLevel !== 'city'} />
      <CostRow icon={DiningIcon} label={t('cost.food')} eur={cost.foodEur} band={cost.foodBand}
        est={cost.foodLevel !== 'city'} />
      <div className="cost-total">
        <span className="cost-total-label">{t('cost.dayTotal')}</span>
        <span className={`cost-total-band ${BAND_CLASS[cost.dayBand]}`}>{bandWord}</span>
        <span className="cost-total-eur"><Money value={cost.dayEur} est={isNational(cost)} /></span>
      </div>
      {cost.flight?.perSeat > 0 && (
        <div className="cost-row cost-row-flight">
          <span className="cost-row-label">
            <AirlineMark code={cost.flight.airline} size="sm" />
            <span className="cost-row-text">{t('flight.flightLine')}</span>
          </span>
          {/* The gauge's column stays empty: a flight has no cost band. */}
          <span aria-hidden="true" />
          <span className="cost-row-eur">{t('flight.returnPerson', { price: formatMoney(cost.flight.perSeat) })}</span>
        </div>
      )}
    </div>
  );
}
