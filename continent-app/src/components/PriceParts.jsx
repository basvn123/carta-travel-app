import React from 'react';
import { BedIcon, BusIcon, CarIcon, DiningIcon, TrainIcon } from './Icons.jsx';
import { PlaneIcon } from './TransportIcons.jsx';
import { Money } from './ui/Money.jsx';
import { isNational } from './CostSummary.jsx';
import { formatApprox, formatMoney } from '../lib/money.js';
import '../styles/79-place-card.css';

/**
 * PriceParts (T590, owner decision 5 of 2026-10-22): a place's cost as a row
 * of icon + figure parts and one clean total, in whole euros.
 *
 *   plane  the way there, return a person: the cheapest flight for the
 *          traveller's dates when the row has one (no tilde, a flight is a
 *          real fare), or the train, bus or car the settings line asks for
 *          (its own icon, with the tilde: those are estimates). Read from
 *          `cost.way` ({ mode, perPerson, airline }), which ExploreTab's
 *          `withWay` sets on the row; nothing when the row has no way.
 *   bed    the stay, a person a night (`cost.stayEur`)
 *   fork   food and drink, a person a day (`cost.foodEur`)
 *   total  bed + food, a person a day (`cost.dayEur`), the strong figure,
 *          with the tilde when it leans on a stand-in (isNational).
 *
 * Every figure comes from the row's own cost object (lib/costIndex.js
 * through the catalogue); this component never prices anything itself.
 * The icons carry no words on screen; each part says what it is to a
 * screen reader and in its title (a pointer's tooltip).
 *
 * Props
 *   cost      the row's cost object ({ dayEur, stayEur, foodEur, stayLevel,
 *             foodLevel, way }); renders nothing when it has no day figure
 *             and no way
 *   t         the i18n function
 *   variant   'inline' (default): the total then the parts on one line,
 *             wrapping as two groups on a narrow card; 'stack': one part a
 *             row, icon, figure and a quiet unit, the total last under a
 *             hairline (the map's side panel)
 *   showTotal false leaves the total out (a caller that prints it itself)
 *   className added to the root
 *   figRef    a ref for the total's figure (useSettledFigure)
 *
 * Classes: .pparts, .pparts--inline | .pparts--stack, .pparts-total,
 * .pparts-list, .pparts-part[data-part=way|bed|food], .pparts-icon,
 * .pparts-unit. Styles: src/styles/79-place-card.css.
 */

const WAY_ICON = { plane: PlaneIcon, train: TrainIcon, bus: BusIcon, car: CarIcon };

function wayOf(cost) {
  const way = cost?.way;
  return way && way.perPerson > 0 && WAY_ICON[way.mode] ? way : null;
}

export function PriceParts({ cost, t, variant = 'inline', showTotal = true, className = '', figRef = null }) {
  const way = wayOf(cost);
  const day = cost && Number.isFinite(cost.dayEur);
  if (!day && !way) return null;
  const stack = variant === 'stack';
  // An estimate is spoken as "about {price}", the tilde's meaning in words.
  const say = (eur, est) => (est ? t('money.estSpoken', { price: formatMoney(eur) }) : formatMoney(eur));
  const parts = [];

  if (way) {
    const Icon = WAY_ICON[way.mode];
    const plane = way.mode === 'plane';
    const fig = plane ? formatMoney(way.perPerson) : formatApprox(way.perPerson);
    const spoken = plane
      ? t('card.flightSpoken', { price: fig })
      : t('card.waySpoken', { mode: t(`way.${way.mode}`), price: say(way.perPerson, true) });
    parts.push({ key: 'way', Icon, fig, spoken, unit: t('card.unitReturn') });
  }
  if (Number.isFinite(cost?.stayEur)) {
    const est = cost.stayLevel !== 'city';
    parts.push({
      key: 'bed', Icon: BedIcon,
      fig: est ? formatApprox(cost.stayEur) : formatMoney(cost.stayEur),
      spoken: t('card.bedSpoken', { price: say(cost.stayEur, est) }),
      unit: t('card.unitNight'),
    });
  }
  if (Number.isFinite(cost?.foodEur)) {
    const est = cost.foodLevel !== 'city';
    parts.push({
      key: 'food', Icon: DiningIcon,
      fig: est ? formatApprox(cost.foodEur) : formatMoney(cost.foodEur),
      spoken: t('card.foodSpoken', { price: say(cost.foodEur, est) }),
      unit: t('card.unitDay'),
    });
  }

  const total = day && showTotal ? (
    <span className="pparts-total" ref={figRef}>
      <Money value={cost.dayEur} est={isNational(cost)} />
      <span className="pparts-unit"> {t('dest.priceDayUnit')}</span>
    </span>
  ) : null;

  const list = parts.map((part) => {
    const { key, fig, spoken, unit, Icon: PartIcon } = part;
    return (
      <span className="pparts-part" data-part={key} key={key} title={spoken}>
        <PartIcon size={16} className="pparts-icon" />
        <span className="pparts-fig money" aria-hidden="true">{fig}</span>
        {stack && <span className="pparts-unit" aria-hidden="true">{unit}</span>}
        <span className="sr-only">{spoken}</span>
      </span>
    );
  });

  return (
    <span className={`pparts pparts--${stack ? 'stack' : 'inline'}${className ? ` ${className}` : ''}`}>
      {stack ? (
        <>
          {list}
          {total}
        </>
      ) : (
        <>
          {total}
          {list.length > 0 && <span className="pparts-list">{list}</span>}
        </>
      )}
    </span>
  );
}
