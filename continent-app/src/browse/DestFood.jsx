import React from 'react';
import '../styles/74-dest-food.css';
import { useFirstRun } from '../lib/firstRunContext.js';
import { DEFAULT_LIFESTYLE } from '../lib/runtime_pricing.js';
import { foodBreakdown, DEFAULT_PRICE_REQUEST } from '../lib/price/index.js';
import { ReceiptLine, ReceiptSum, useSettleChanged } from '../components/ReceiptCard.jsx';
import { BAND_KEY, FOOD_ITEMS, eurDay, priceFeel } from '../lib/costIndex.js';
import { useI18n } from '../i18n/index.jsx';
import { Button, Money } from '../components/ui/index.js';
import { ChevronDownIcon, ChevronRightIcon, DiningIcon } from '../components/Icons.jsx';
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

const round2 = (v) => Math.round(v * 100) / 100;

/** The engine's food breakdown as the receipt's lines and their sum. */
function dayOf(g) {
  if (!g) return null;
  const lines = LINES
    .map((l, i) => ({ ...l, ramp: RAMP[i], eur: round2(l.parts.reduce((s, k) => s + (g[k] || 0), 0)) }))
    .filter((l) => l.eur > 0);
  // The sum is the sum of the rounded lines, so the receipt adds up on screen.
  return { lines, total: round2(lines.reduce((s, l) => s + l.eur, 0)) };
}

/** One row of Cheaper or Dearer than usual: the thing, about what it costs,
 *  and a bar from the norm (the centre tick) out to `item.reach`, the share
 *  of the half width its distance off the norm fills. */
function FeelRow({ t, item, side }) {
  const pct = Math.round(Math.abs(item.ratio) * 100);
  return (
    <li className="pfeel-row">
      <span className="pfeel-name">{t(`feel.item.${item.key}`)}</span>
      <span className="pfeel-about">{t('feel.about', { price: eurDay(item.eur) })}</span>
      <span className={`pfeel-dev is-${side}`} role="img" style={{ '--reach': item.reach }}
        aria-label={t(side === 'cheap' ? 'feel.below' : 'feel.above', { pct })}>
        <i /><b />
      </span>
    </li>
  );
}

function FeelGroup({ t, side, head, rows }) {
  if (!rows.length) return null;
  return (
    <div className={`pfeel-group is-${side}`}>
      <h3 className="pfeel-head">{t(head)}</h3>
      <ul className="pfeel-rows">
        {rows.map((item) => <FeelRow key={item.key} t={t} item={item} side={side} />)}
      </ul>
    </div>
  );
}

// German keeps its nouns capitalised mid-sentence; the other five lower-case.
const midSentence = (s, lang) => (lang === 'de' ? s : s.toLocaleLowerCase(lang));

/** "About usual: fast food and groceries", each name bold, joined the way
 *  the reader's language joins a list. */
function UsualLine({ t, lang, items }) {
  const names = items.map((i) => midSentence(t(`feel.item.${i.key}`), lang));
  let parts;
  try {
    parts = new Intl.ListFormat(lang, { type: 'conjunction' }).formatToParts(names);
  } catch {
    parts = names.flatMap((value, n) => [...(n ? [{ type: 'literal', value: ', ' }] : []), { type: 'element', value }]);
  }
  return (
    <p className="pfeel-usual">
      {t('feel.usual')}{' '}
      {parts.map((x, n) => (x.type === 'element' ? <b key={n}>{x.value}</b> : x.value))}
    </p>
  );
}

/**
 * The price feel (T1018, owner's mock 2026-11-02): the place page's Eat and
 * drink. The food band word on a five-step scale, then what is cheaper and
 * dearer than the European norm, the rest named once, and the prices
 * themselves behind All prices in whole euros. On the page's ground, no
 * card, no tip line. The food day is the cost row's, or the engine's when
 * the row is not in yet.
 */
function PriceFeel({ t, destination }) {
  const ctx = useFirstRun();
  const { lang } = useI18n();
  const [open, setOpen] = React.useState(false);
  const listId = React.useId();
  const costs = destination?.costs;
  const lifestyle = ctx?.choices?.lifestyle || DEFAULT_LIFESTYLE;
  const request = ctx?.priceRequest || DEFAULT_PRICE_REQUEST;
  const costRow = ctx?.indices?.get?.(destination?.id) || null;
  const est = (costRow?.foodLevel ?? costs?.level) !== 'city';
  const rowEur = costRow?.foodEur;
  const feel = React.useMemo(() => {
    const foodEur = rowEur ?? (costs ? dayOf(foodBreakdown(destination, request, 1))?.total : null);
    return priceFeel(costs, foodEur, lifestyle);
  }, [rowEur, costs, destination, request, lifestyle]);
  if (!feel) return null;
  const { band, pos, lean, cheaper, dearer, usual, brief } = feel;
  const bandWord = band != null ? t(BAND_KEY[band]) : null;

  return (
    <div className="pfeel">
      {bandWord && (
        <>
          <p className="pfeel-verdict">
            {bandWord}
            {lean && <>, <span>{t(`feel.lean.${lean}`)}</span></>}
          </p>
          <div className="pfeel-scale" role="img"
            aria-label={t('feel.scaleAria', { band: midSentence(bandWord, lang) })}>
            <span className="pfeel-steps" aria-hidden="true">
              {BAND_KEY.map((k, i) => <i key={k} className={`is-${i}`} />)}
              <b className="pfeel-pin" style={{ left: `${pos * 100}%` }} />
            </span>
            <span className="pfeel-ends" aria-hidden="true">
              <span>{t(BAND_KEY[0])}</span><span>{t(BAND_KEY[BAND_KEY.length - 1])}</span>
            </span>
          </div>
        </>
      )}

      {!brief && (
        <>
          <FeelGroup t={t} side="cheap" head="feel.cheaper" rows={cheaper} />
          <FeelGroup t={t} side="dear" head="feel.dearer" rows={dearer} />
          {cheaper.length + dearer.length === 0
            ? <p className="pfeel-usual">{t('feel.allUsual')}</p>
            : usual.length > 0 && <UsualLine t={t} lang={lang} items={usual} />}
        </>
      )}

      <Button variant="quiet" className="pfeel-more" aria-expanded={open} aria-controls={listId}
        iconEnd={<ChevronDownIcon size={14} />} onClick={() => setOpen((v) => !v)}>
        {t('feel.allPrices')}
      </Button>
      <dl className="dfood-prices pfeel-prices" id={listId} hidden={!open}>
        {feel.items.map(({ key, eur }) => (
          <div className="dfood-price" key={key}>
            <dt>{t(`food.item.${key}`)}</dt>
            <dd><Money value={eur} est={est} /></dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The item prices this place has (a coffee, a meal), in their order. */
export function foodPriceKeys(destination) {
  const costs = destination?.costs;
  return costs ? FOOD_ITEMS.filter((k) => costs[k] > 0) : [];
}

/** The Eat and drink prices: the place page's price feel when `inline`
 *  (T1018), else the Food and drink fold. */
export function DestFood(props) {
  return props.inline ? <PriceFeel t={props.t} destination={props.destination} /> : <FoodFold {...props} />;
}

function FoodFold({ t, city, destination, isOpen, toggle, onOpenLifestyle }) {
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

  const day = React.useMemo(() => (costs ? dayOf(foodBreakdown(destination, request, 1)) : null),
    [costs, destination, request]);

  const linesRef = React.useRef(null);
  useSettleChanged(linesRef, day ? `${day.lines.map((l) => `${l.key}:${l.eur}`).join('|')}|${day.total}` : '');

  if (!costs || !day || day.total <= 0) return null;
  const profileKey = matchProfile(lifestyle);
  const vibe = profileKey ? t(PROFILE_LABEL_KEYS[profileKey]) : t('lifestyle.custom');
  const prices = FOOD_ITEMS.filter((k) => costs[k] > 0);

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
