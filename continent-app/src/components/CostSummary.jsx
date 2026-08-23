import React from 'react';
import { BAND_KEY, eurDay } from '../lib/costIndex.js';
import { BedIcon, DiningIcon } from './Icons.jsx';

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
 * cheapest is the one thing this product exists to point at, the priciest is
 * the accent, and the three bands in between are ink. A five-colour ramp would
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
 * The card foot: what a day here costs one person, and the gauge that says
 * whether that is cheap. One line, one number, no decimals the data cannot
 * support.
 */
export function CostLine({ cost, t }) {
  if (!cost || cost.dayEur == null) return null;
  const bandWord = t(BAND_KEY[cost.dayBand]);
  return (
    <span
      className="xcard-cost"
      title={t('cost.dayTitle', { bed: eurDay(cost.stayEur), food: eurDay(cost.foodEur) })}
      aria-label={t('cost.dayAria', { eur: eurDay(cost.dayEur), band: bandWord })}
    >
      <CostGauge band={cost.dayBand} />
      <span className="xcard-cost-eur mono">{eurDay(cost.dayEur)}</span>
      <span className="xcard-cost-unit">{t('cost.perDay')}</span>
    </span>
  );
}

/** One row of the receipt: what it is, the gauge, the figure. */
function CostRow({ icon: Icon, label, eur, band }) {
  if (eur == null) return null;
  return (
    <div className="cost-row">
      <span className="cost-row-label"><Icon size={13} /> {label}</span>
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
export function CostReceipt({ cost, t, lifestyleLabel, onOpenLifestyle, compact = false }) {
  if (!cost || cost.dayEur == null) return null;
  const bandWord = t(BAND_KEY[cost.dayBand]);

  // Each figure states its own provenance. Rolling them into one sentence is
  // what produced the earlier lie: 234 of the 786 city-measured stay rates
  // ship without a listing count (Rome is one), and the old wording read that
  // missing count as "nothing has been measured in this town", which was
  // exactly backwards.
  const provenance = () => {
    const stay = cost.stayLevel === 'region' ? t('cost.stayRepaired')
      : cost.stayLevel !== 'city' ? t('cost.stayNational')
      : cost.listings
        ? t('cost.stayMeasuredN', {
          n: cost.listings.toLocaleString('en-GB'),
          place: cost.source || '',
          when: cost.captured ? cost.captured.slice(0, 7) : '',
        })
        : t('cost.stayMeasured');
    const food = cost.foodLevel === 'city' ? t('cost.foodMeasured') : t('cost.foodNational');
    return `${stay} ${food}`;
  };

  return (
    <div className="cost-receipt">
      <CostRow icon={BedIcon} label={t('cost.bed')} eur={cost.stayEur} band={cost.stayBand} />
      <CostRow icon={DiningIcon} label={t('cost.food')} eur={cost.foodEur} band={cost.foodBand} />
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
      {!compact && <p className="cost-source">{provenance()}</p>}
    </div>
  );
}
