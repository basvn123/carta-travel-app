import React from 'react';
import '../styles/74-dest-food.css';
import { useFirstRun } from '../lib/firstRunContext.js';
import { DEFAULT_LIFESTYLE } from '../lib/runtime_pricing.js';
import { foodBreakdown, DEFAULT_PRICE_REQUEST } from '../lib/price/index.js';
import { ReceiptLine, ReceiptSum, useSettleChanged } from '../components/ReceiptCard.jsx';
import { Button, Money } from '../components/ui/index.js';
import { ChevronRightIcon, DiningIcon } from '../components/Icons.jsx';
import { Fold } from './Fold.jsx';
import { matchProfile, PROFILE_LABEL_KEYS } from './LifestylePanel.jsx';

/**
 * The destination page's Food and drink fold (T515), in the Practical tab
 * after Where to sleep.
 *
 * Two readings of the same prices, no method line (carta-design: the
 * estimate mark is the whole pedigree on the page):
 *   What you spend a day   the traveller's own day at their Lifestyle, from
 *                          groundSpendPerPerson, the function the price card,
 *                          the Explore card and the trip receipt all price
 *                          food from, so the sum here IS the price card's
 *                          food figure for one person and one day
 *   What things cost       the place's own prices, item by item
 *
 * The day is five receipt lines, one per segment of the thin bar above them
 * (the five-step --kind ramp), so the drawing and the lines say the same
 * thing in the same order. A line the Lifestyle never buys is left out.
 */
const LINES = [
  { key: 'dinners', label: 'lifestyle.dinnersOut', parts: ['dinners'] },
  { key: 'meals', label: 'food.lineMeals', parts: ['lunches', 'fastfood'] },
  { key: 'drinks', label: 'food.lineDrinks', parts: ['drinks', 'clubbing'] },
  { key: 'coffees', label: 'detail.coffees', parts: ['coffees'] },
  { key: 'groceries', label: 'food.lineGroceries', parts: ['groceries'] },
];
const RAMP = ['metro', 'city', 'town', 'village', 'area'];
const ITEMS = ['meal_mid_eur', 'meal_cheap_eur', 'fastfood_eur', 'drink_out_eur',
  'coffee_eur', 'cocktail_eur', 'grocery_day_eur'];

const round2 = (v) => Math.round(v * 100) / 100;

/** The item prices this place has (a coffee, a meal), in their order. */
export function foodPriceKeys(destination) {
  const costs = destination?.costs;
  return costs ? ITEMS.filter((k) => costs[k] > 0) : [];
}

export function DestFood({ t, city, destination, isOpen, toggle, onOpenLifestyle, inline = false }) {
  const ctx = useFirstRun();
  const costs = destination?.costs;
  const lifestyle = ctx?.choices?.lifestyle || DEFAULT_LIFESTYLE;
  // T664 (F2): the engine's food line item by item, at the request's
  // lifestyle and the party's child share, so the fold and the day figure
  // price the same seat.
  const request = ctx?.priceRequest || DEFAULT_PRICE_REQUEST;
  const costRow = ctx?.indices?.get?.(destination?.id) || null;
  // Food only: the bed's level is the price card's business, not this fold's.
  const est = (costRow?.foodLevel ?? costs?.level) !== 'city';

  const day = React.useMemo(() => {
    const g = costs ? foodBreakdown(destination, request, 1) : null;
    if (!g) return null;
    const lines = LINES
      .map((l, i) => ({ ...l, ramp: RAMP[i], eur: round2(l.parts.reduce((s, k) => s + (g[k] || 0), 0)) }))
      .filter((l) => l.eur > 0);
    // The sum is the sum of the rounded lines, so the receipt adds up on screen.
    return { lines, total: round2(lines.reduce((s, l) => s + l.eur, 0)) };
  }, [costs, destination, request]);

  const linesRef = React.useRef(null);
  useSettleChanged(linesRef, day ? `${day.lines.map((l) => `${l.key}:${l.eur}`).join('|')}|${day.total}` : '');

  // T912: the place page's Eat and drink shows what things cost here, open,
  // beside the dishes; the day's spending lives in the price card's split.
  if (inline) {
    const prices = foodPriceKeys(destination);
    if (!prices.length) return null;
    return (
      <dl className="dfood-prices dfood-menu">
        {prices.map((k) => (
          <div className="dfood-price" key={k}>
            <dt>{t(`food.item.${k}`)}</dt>
            <dd><Money value={costs[k]} precision="cents" est={est} /></dd>
          </div>
        ))}
      </dl>
    );
  }

  if (!costs || !day || day.total <= 0) return null;
  const profileKey = matchProfile(lifestyle);
  const vibe = profileKey ? t(PROFILE_LABEL_KEYS[profileKey]) : t('lifestyle.custom');
  const prices = ITEMS.filter((k) => costs[k] > 0);

  return (
    <Fold level={2}
      id="sec-food"
      icon={DiningIcon}
      title={t('receipt.ground')}
      summary={(
        <>
          <Money value={day.total} est={est} />
          {' '}{t('dest.priceDayUnit')}
        </>
      )}
      open={isOpen('food')}
      onToggle={() => toggle('food')}
    >
      <div className="dfood">
        <div className="dfood-head">
          <h3 className="destp-subhead">{t('food.spendHead')}</h3>
          {onOpenLifestyle && (
            <Button
              variant="quiet"
              size="sm"
              aria-haspopup="dialog"
              aria-label={`${t('filter.lifestyle')} ${vibe}`}
              iconEnd={<ChevronRightIcon size={14} />}
              onClick={onOpenLifestyle}
            >
              {vibe}
            </Button>
          )}
        </div>

        {day.lines.length > 1 && (
          <div className="dfood-bar" aria-hidden="true">
            {day.lines.map((l) => (
              <span key={l.key} className={`dfood-seg is-${l.ramp}`} style={{ flexGrow: l.eur }} />
            ))}
          </div>
        )}

        <dl className="frr-lines costrows dfood-lines" ref={linesRef}>
          {day.lines.map((l) => (
            <ReceiptLine key={l.key} t={t} line={{ key: l.key, label: t(l.label), eur: l.eur, est }} />
          ))}
          <ReceiptSum sumLabel={t('food.sum')} total={day.total} est={est} t={t} />
        </dl>

        <h3 className="destp-subhead">{t('food.pricesHead', { city })}</h3>
        <dl className="dfood-prices">
          {prices.map((k) => (
            <div className="dfood-price" key={k}>
              <dt>{t(`food.item.${k}`)}</dt>
              <dd><Money value={costs[k]} precision="cents" est={est} /></dd>
            </div>
          ))}
        </dl>
      </div>
    </Fold>
  );
}
