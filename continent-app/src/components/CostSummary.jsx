import React from 'react';
import { BAND_KEY, eurDay } from '../lib/costIndex.js';
import { BedIcon, DiningIcon } from './Icons.jsx';
import { accuracyVars } from '../lib/accuracy.js';
import { useSettledFigure } from '../lib/figureChange.js';

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

/** One row of the receipt: what it is, the gauge, the figure. */
function CostRow({ icon: Icon, label, eur, band, level, t }) {
  if (eur == null) return null;
  return (
    <div className="cost-row">
      <span className="cost-row-label">
        <Icon size={13} />
        <span className="cost-row-text">{label}</span>
        {/* The compact receipt cannot carry the provenance sentence, so each
            figure carries one word: measured in the city, or a country-level
            figure standing in (owner call, T362 on T098-b). */}
        {level && (
          <span className="cost-level" title={t(level === 'city' ? 'cost.levelCityTitle' : 'cost.levelCountryTitle')}>
            {t(level === 'city' ? 'cost.levelCity' : 'cost.levelCountry')}
          </span>
        )}
      </span>
      <CostGauge band={band} />
      <span className="cost-row-eur mono">{eurDay(eur)}</span>
    </div>
  );
}

/**
 * The panel's receipt: bed, food, a rule, the day. The same shape the trip
 * receipt uses everywhere else in the product, because a reader who has seen
 * one of them can read all of them.
 *
 * The footer is not a disclaimer, it is the measurement's provenance, and it
 * is the reason to believe the three numbers above it.
 */
export function CostReceipt({ cost, t, lang, lifestyleLabel, onOpenLifestyle, compact = false }) {
  if (!cost || cost.dayEur == null) return null;
  const bandWord = t(BAND_KEY[cost.dayBand]);

  // Each figure states its own provenance, and states it at its own level:
  // a city measurement says so and names the source, a country-level figure
  // says that instead. The old receipt stayed silent on country figures
  // ("silence is the honest default") but that hid the difference between the
  // Ljubljana bed price, measured, and an Albanian one that is a prior, and
  // made the strong number read as weak as the weak one (T098). Source names
  // are the ones data_licenses.md credits: Inside Airbnb for the bed, Numbeo
  // for the food anchors, Eurostat's price level index where a figure is scaled.
  const monthYear = (iso) => {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat(lang || 'en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(`${iso.slice(0, 7)}-15T12:00:00Z`));
    } catch { return iso.slice(0, 7); }
  };
  const bedLine = () => {
    if (cost.stayEur == null) return '';
    if (cost.stayLevel === 'region') return t('cost.bedRepaired');
    if (cost.stayLevel === 'city') {
      return cost.listings
        ? t('cost.bedCityN', {
          n: cost.listings.toLocaleString('en-GB'),
          place: cost.source || '',
          when: monthYear(cost.captured),
        })
        : t('cost.bedCity');
    }
    return String(cost.stayBasis || '').startsWith('airbnb_pli_scaled') ? t('cost.bedScaled') : t('cost.bedCountry');
  };
  const foodLine = () => {
    if (cost.foodEur == null) return '';
    if (cost.foodLevel === 'city') return t('cost.foodCity');
    return String(cost.foodBasis || '').startsWith('pli_scaled') ? t('cost.foodScaled') : t('cost.foodCountry');
  };

  // The compact receipt's cost bar (house rule "The cost bar", V4 T393): one
  // segment per line in receipt order, in the ink ramp, 8 px, no figures on
  // the bar; the lines below carry them. Drawn only when both lines are.
  const bar = compact && cost.stayEur != null && cost.foodEur != null
    && cost.stayEur + cost.foodEur > 0;

  return (
    <div className="cost-receipt">
      {bar && (
        <span className="xcost-bar" aria-hidden="true">
          <span className="xcost-bar-seg" style={{ flexGrow: cost.stayEur }} />
          <span className="xcost-bar-seg" style={{ flexGrow: cost.foodEur }} />
        </span>
      )}
      <CostRow icon={BedIcon} label={t('cost.bed')} eur={cost.stayEur} band={cost.stayBand} t={t}
        level={compact && cost.stayEur != null ? (cost.stayLevel === 'city' ? 'city' : 'country') : null} />
      <CostRow icon={DiningIcon} label={t('cost.food')} eur={cost.foodEur} band={cost.foodBand} t={t}
        level={compact && cost.foodEur != null ? (cost.foodLevel === 'city' ? 'city' : 'country') : null} />
      <div className="cost-total">
        <span className="cost-total-label">{t('cost.dayTotal')}</span>
        <span className={`cost-total-band ${BAND_CLASS[cost.dayBand]}`}>{bandWord}</span>
        <span className="cost-total-eur mono">{eurDay(cost.dayEur)}</span>
      </div>
      {/* What the three numbers above assume, with the door to change it. A
          price the reader cannot trace back to a setting is a price they have
          to take on faith, and this whole receipt exists not to ask that. */}
      {lifestyleLabel && (
        <p className="cost-assumes">
          <span>{lifestyleLabel}</span>
          {onOpenLifestyle && (
            <button type="button" className="cost-assumes-edit" onClick={onOpenLifestyle}>
              {t('cost.editLifestyle')}
            </button>
          )}
        </p>
      )}
      {!compact && cost.tierFallback && <p className="cost-source">{t('cost.tierFallback')}</p>}
      {!compact && bedLine() && <p className="cost-source">{bedLine()}</p>}
      {!compact && foodLine() && <p className="cost-source">{foodLine()}</p>}
      {/* The accuracy figure, with its date and method one click away. Food
          only: the bed figure is not published until the stay hold-out is
          big enough to quote (src/lib/accuracy.js). */}
      {!compact && (
        <details className="cost-accuracy">
          <summary>{t('cost.accuracy', accuracyVars(lang))}</summary>
          <p>{t('cost.accuracyMethod', accuracyVars(lang))}</p>
        </details>
      )}
    </div>
  );
}
