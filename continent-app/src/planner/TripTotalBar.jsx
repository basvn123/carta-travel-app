import React, { useRef } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button, Money } from '../components/ui/index.js';
import { useSettledFigure } from '../lib/figureChange.js';
import { formatMoney } from '../lib/money.js';
import { ChevronRightIcon } from '../components/Icons.jsx';

/** How many people the trip is priced for, from quoteTrip()'s own party. */
function pricedPartySize(priced) {
  const p = priced?.party || null;
  if (p) return Math.max(1, (p.adults || 0) + (p.children || 0) + (p.babies || 0));
  return Math.max(1, priced?.groupSize || 1);
}

/**
 * The total bar (T500, roadmap 1.3c section 3, owner T490-g).
 *
 * The trip's one figure, fixed where the traveller can always see it: under
 * the map from 1024 px, in the drawer's strip on a phone, in the wizard's foot.
 * It reads ONLY quoteTrip()'s output (`priced.grandTotal`, `priced.party`),
 * the same object the receipt (PlanTotal) reads, so the two can never say two
 * totals. It sums nothing.
 *
 * It is not the cost bar (the 8 px stacked bar above a receipt's lines) and it
 * never holds the view's primary: a tap opens the receipt, nothing more.
 *
 *   layout 'bar'    one row: "Your trip costs", the figure, "What the price holds"
 *   layout 'strip'  the figure over "Total for 2 people" (the phone drawer)
 *   layout 'foot'   "Your trip" over the figure (a wizard step's footer)
 *
 * With no place chosen yet there is no figure to show: the bar says when there
 * will be one, as plain text, never a dash or a zero, and is not a button.
 */
export function TripTotalBar({ priced, onOpen = null, layout = 'bar', className = '', controls = null, expanded = undefined }) {
  const { t, lang } = useI18n();
  const figRef = useRef(null);
  const hasTrip = Boolean(priced && priced.stopDetails?.length);
  const total = hasTrip ? priced.grandTotal : null;
  useSettledFigure(figRef, total);
  const cls = `trip-total-bar is-${layout} ${className}`.trim();

  if (!hasTrip) {
    return (
      <div className={`${cls} is-empty`}>
        <span className="ttb-body"><span className="ttb-empty">{t('plan.pricedOnce')}</span></span>
      </div>
    );
  }

  const n = pricedPartySize(priced);
  const people = n === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n });
  const forPeople = t('receipt.total', { people });
  // One accessible name, read as one sentence (T490-i): the figure in its
  // spoken form, then who it is for, then what a tap does.
  const spoken = t('plan.totalBarName', {
    price: t('money.estSpoken', { price: formatMoney(total, { precision: 'cents', locale: lang }) }),
    people,
  });

  const body = layout === 'foot' ? (
    <>
      <span className="ttb-lbl">{t('plan.yourTrip')}</span>
      <span ref={figRef} className="ttb-n"><Money value={total} est precision="cents" /></span>
    </>
  ) : layout === 'strip' ? (
    <>
      <span className="ttb-text">
        <span ref={figRef} className="ttb-n"><Money value={total} est precision="cents" /></span>
        <span className="ttb-sub">{forPeople}</span>
      </span>
    </>
  ) : (
    <>
      <span className="ttb-lbl">{t('plan.tripTotal')}</span>
      <span ref={figRef} className="ttb-n"><Money value={total} est precision="cents" /></span>
      <span className="ttb-sub">{forPeople}</span>
      <span className="ttb-open">
        {t('plan.whatsIn')}
        <ChevronRightIcon size={16} />
      </span>
    </>
  );

  if (!onOpen) {
    return <div className={cls} aria-label={spoken} role="group"><span className="ttb-body">{body}</span></div>;
  }
  return (
    <Button
      variant="quiet"
      className={cls}
      onClick={onOpen}
      aria-label={spoken}
      aria-controls={controls || undefined}
      aria-expanded={expanded}
    >
      <span className="ttb-body">{body}</span>
    </Button>
  );
}
