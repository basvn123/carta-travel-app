import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { ratingWords } from '../../lib/rating.js';
import { formatApprox, formatMoney } from '../../lib/money.js';
import { useDayView } from '../../hooks/useDayView.js';
import { Money } from '../../components/ui/Money.jsx';
import { NotYet } from '../../components/ui/StateBlock.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { isNational } from '../../components/CostSummary.jsx';
import { PriceItems } from '../../components/PriceItems.jsx';

/**
 * Explore's house parts (G1, house style 2026-11; DESIGN.md "Signature
 * components", the explore lane's decision in .work/2026-11-13-hs-explore).
 *
 * PlaceScore    the Score as the dark plate after a name. It keeps what the
 *               old ScoreChip said: an estimated Score reads "about 8.1", an
 *               unscored place "Not yet", and the accessible name carries the
 *               band word ("Score 9.7, Exceptional"). The kit's ScorePlate
 *               only prints a number, so these rows draw the same .hs-score
 *               plate here.
 * RowFormation  the price row as the house formation (getting there
 *               outlined, the bed solid umber, food and drink beige, then the
 *               day figure, loudest). Every figure, unit and switch is the
 *               one PriceParts shows (T590, T694, T695): the traveller's
 *               price view (per person or the group's stay), a way there the
 *               traveller switched off leaves the row, estimates carry the
 *               tilde, and a press on the day figure opens the items in it
 *               (PriceItems). It formats only; it never prices or sums.
 *               `.xprice` and the `.pparts-*` names stay for the harnesses.
 */

export function PlaceScore({ rating, size = 'md', className = '' }) {
  const { t } = useI18n();
  if (rating?.unscored) return <NotYet className={`xscore-none ${className}`.trim()} />;
  const w = ratingWords(rating, t);
  if (!w) return null;
  const aria = w.word ? `${t('score.aria', { n: w.shown })}, ${w.word}` : t('score.aria', { n: w.shown });
  return (
    <span className={`hs-score xscore${size === 'lg' ? ' is-lg' : ''}${w.estimated ? ' is-est' : ''}${className ? ` ${className}` : ''}`}
      role="img" aria-label={aria} title={aria} data-band={w.band || ''} data-score={w.figure}>
      <span aria-hidden="true">{w.shown}</span>
    </span>
  );
}

/** The band word ("Exceptional") beside the plate, where a row has room. */
export function BandWord({ rating, className = '' }) {
  const { t } = useI18n();
  const w = ratingWords(rating, t);
  if (!w?.word) return null;
  return <span className={`xband ${className}`.trim()} aria-hidden="true">{w.word}</span>;
}

const WAY_ICON = { plane: HouseIcon.flight, train: HouseIcon.train, bus: HouseIcon.bus, car: HouseIcon.car };

function wayOf(cost) {
  const way = cost?.way;
  return way && way.perPerson > 0 && WAY_ICON[way.mode] ? way : null;
}

/** The price parts as the house formation. `weighted` sizes the bed and food
 *  wagons by their euros (rail cards); rows keep them content-sized. */
export function RowFormation({ cost, t, figRef = null, weighted = false, className = '' }) {
  const view = useDayView();
  const way = view.request.excluded?.includes('flight') ? null : wayOf(cost);
  const day = cost && Number.isFinite(cost.dayEur);
  if (!day && !way) return null;
  // An estimate is spoken as "about {price}", the tilde's meaning in words.
  const say = (eur, est) => (est ? t('money.estSpoken', { price: formatMoney(eur) }) : formatMoney(eur));

  let go = null;
  if (way) {
    const Icon = WAY_ICON[way.mode];
    const plane = way.mode === 'plane';
    const eur = view.way(way.perPerson);
    const fig = plane ? formatMoney(eur) : formatApprox(eur);
    const spoken = plane
      ? t('card.flightSpoken', { price: fig })
      : t('card.waySpoken', { mode: t(`way.${way.mode}`), price: say(eur, true) });
    go = (
      <span className="hs-wagon is-go pparts-part" data-part="way" title={spoken}>
        <Icon size={13} />
        <span className="pparts-fig money" aria-hidden="true">{fig}</span>
        <span className="sr-only">{spoken}</span>
      </span>
    );
  }

  const part = (key, kind, eur, est, Icon, spokenKey) => {
    if (!Number.isFinite(eur)) return null;
    const shown = view.day(eur);
    const spoken = t(spokenKey, { price: say(shown, est) });
    return (
      <span className={`hs-wagon is-${kind} pparts-part`} data-part={key} title={spoken}
        style={weighted ? { '--ww': Math.max(1, Math.round(shown)) } : undefined}>
        <Icon size={13} />
        <span className="pparts-fig money" aria-hidden="true">{formatMoney(shown)}</span>
        <span className="sr-only">{spoken}</span>
      </span>
    );
  };
  const bed = part('bed', 'bed', cost?.stayEur, cost?.stayLevel !== 'city', HouseIcon.bed, 'card.bedSpoken');
  const food = part('food', 'food', cost?.foodEur, cost?.foodLevel !== 'city', HouseIcon.food, 'card.foodSpoken');

  return (
    <span className={`hs-formation xprice xform${weighted ? ' is-weighted' : ''}${className ? ` ${className}` : ''}`}>
      {/* The day figure first: a screen reader hears the price before its
          parts; CSS draws it last, the loudest thing at the row's end. */}
      {day && (
        <span className="hs-formation-day pparts-total" ref={figRef}>
          {/* T695: a press on the amount opens the items in it, with switches. */}
          <PriceItems cost={cost} way={wayOf(cost)}>
            <Money value={view.day(cost.dayEur)} est={isNational(cost)} />
          </PriceItems>
          {/* The unit is said once on screen (the list head); a screen
              reader hears it with every figure. */}
          <span className="sr-only"> {view.unit}</span>
        </span>
      )}
      {(go || bed || food) && (
        <span className="xform-parts pparts-list">
          {go}
          {(bed || food) && <span className="hs-formation-train">{bed}{food}</span>}
        </span>
      )}
    </span>
  );
}
