import React from 'react';
import { safeUrl } from '../lib/format.js';
import { BulbIcon, ShoeIcon } from '../components/Icons.jsx';
import { DestFood, foodPriceKeys } from './DestFood.jsx';
import { PSection } from './PageTemplate.jsx';
import { tipText } from './destParts.js';

/**
 * The place page's Overview (T912, the owner's approved one-page spec,
 * 2026-10-30; was the first of four tabs, T499): Good to know, then Eat and
 * drink. The intro and the facts row sit in the head above the jump bar.
 *
 *   Good to know   the insider tips (d.tips, rule codes with evidence), a
 *                  steep-streets row when d.access.steep (what to book ahead
 *                  is in Practical's quick facts)
 *   Eat and drink  the local dishes and drinks (d.eat.dishes) as chips beside
 *                  what a coffee, a meal and a drink cost here (DestFood)
 *
 * A row without data is not drawn, nor a section without rows: the jump
 * bar's Overview link goes with them (`overviewShown`).
 */
const DISH_KINDS = ['dish', 'drink', 'sweet'];

function goodRows(p) {
  const { t, d, tips } = p;
  const rows = tips.map((tip, i) => ({ key: `tip-${i}-${tip.code}`, Icon: BulbIcon, text: tipText(tip, t) }))
    .filter((r) => r.text);
  if (d?.access?.steep) {
    rows.push({
      key: 'steep', Icon: ShoeIcon, title: t('destx.steep'),
      text: d.access.note === 'funicular' ? t('destx.steepFunicular') : t('destx.steepBody'),
    });
  }
  return rows;
}

function dishesOf(d) {
  return (d?.eat?.dishes || []).filter((x) => x?.name && (!x.kind || DISH_KINDS.includes(x.kind)));
}

/** Whether the Overview has anything to show (the jump bar asks). */
export function overviewShown(p) {
  return goodRows(p).length > 0 || dishesOf(p.d).length > 0 || foodPriceKeys(p.destination).length > 0;
}

export function DestOverview({ p }) {
  const { t, city, destination, onOpenLifestyle } = p;
  const rows = goodRows(p);
  const dishes = dishesOf(p.d);
  const eat = dishes.length > 0 || foodPriceKeys(destination).length > 0;
  if (!rows.length && !eat) return null;
  return (
    <div className="pt-group" id="pt-overview">
      {rows.length > 0 && (
        <PSection id="pt-good" title={t('destx.goodToKnow')}>
          <ul className="pt-tips">
            {rows.map(({ key, Icon, title, text }) => (
              <li key={key}>
                <span className="pt-tip-icon" aria-hidden="true"><Icon size={16} /></span>
                <span>
                  {title && <b>{title}</b>}
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </PSection>
      )}
      {eat && (
        <PSection id="pt-eat" title={t('destx.eatDrink')}>
          <div className={`pt-eat${dishes.length ? '' : ' is-prices'}`}>
            {dishes.length > 0 && (
              <ul className="pt-dishes" aria-label={t('destx.dishesAria', { city })}>
                {dishes.map((x) => {
                  const href = safeUrl(x.wiki);
                  return (
                    <li key={x.name} className="pt-dish" data-kind={x.kind || 'dish'}>
                      {href ? <a href={href} target="_blank" rel="noreferrer">{x.name}</a> : x.name}
                    </li>
                  );
                })}
              </ul>
            )}
            <DestFood t={t} city={city} destination={destination} inline onOpenLifestyle={onOpenLifestyle} />
          </div>
        </PSection>
      )}
    </div>
  );
}
