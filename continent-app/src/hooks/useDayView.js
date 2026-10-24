import { useMemo } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useFirstRun } from '../lib/firstRunContext.js';
import { DEFAULT_PRICE_REQUEST } from '../lib/price/request.js';
import { dayUnit, isTotalView, shownDay, shownWay, viewFactor } from '../lib/price/display.js';

/**
 * The traveller's price view for a screen (T694, plan rule 4): per person,
 * or the whole group's total. Every day-price screen draws its figure and its
 * unit through this, from the app's one price request, so a card, a pin, the
 * header and the filters always say the same thing in the same unit.
 *
 *   day(eur)   a per-person day amount in the view
 *   way(eur)   a per-person way-there amount in the view
 *   unit       "a person a day" or "for 2 people, 7 nights"
 *   factor     1, or seats x nights
 *   total      true in the group view
 */
export function useDayView() {
  const { t } = useI18n();
  const req = useFirstRun()?.priceRequest || DEFAULT_PRICE_REQUEST;
  return useMemo(() => ({
    request: req,
    day: (eur) => shownDay(eur, req),
    way: (eur) => shownWay(eur, req),
    unit: dayUnit(t, req),
    factor: viewFactor(req),
    total: isTotalView(req),
  }), [req, t]);
}
