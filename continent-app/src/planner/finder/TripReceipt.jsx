import React, { useId, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { ChevronRightIcon } from '../../components/Icons.jsx';
import NotYet from '../../components/NotYet.jsx';
import { ReceiptFigure } from '../../components/ReceiptCard.jsx';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { useAirlines, airlineName } from '../../lib/flights/useAirlines.js';
import { formatMoney } from '../../lib/money.js';
import { useTotalDelta } from '../planHooks.js';
import { TripBar, WhyMatch } from './TripCard.jsx';
import { pickLine, signedMoney, totalLeavesOut, tripName, whyLine } from './finderText.js';

// The cost bar's ramp, so a row's swatch is its segment's colour (CostBar RAMP).
const RAMP = ['var(--kind-metro)', 'var(--kind-city)', 'var(--kind-town)', 'var(--kind-village)'];

/**
 * The live receipt (T799): one trip, one row per slot in slot order (the
 * cost bar's order), each with its label, Carta's pick in a few words and
 * its figure in cents. A row with options opens its line picker (T800), in
 * any order; a slot the traveller chooses reads "You choose" at its typical
 * price and still opens; a NotYet row shows NotYet and does not open.
 *
 * It is the planner's own sheet (SheetShell): full screen on a phone, the
 * centred sheet on a desktop. A picker is a view inside it, never a second
 * sheet. Closing it returns focus to the card that opened it (useFocusTrap).
 *
 *   trip           the trip as it stands, swaps included
 *   onClose()      close the receipt
 *   onPlan(trip)   "Plan this trip": hand every pick to the planner (T801)
 *   renderLine(slot, back)  the picker view for one slot (T800), or null
 */
export function TripReceipt({ trip, destinations, onClose, onPlan, renderLine = null }) {
  const { t, lang } = useI18n();
  const airlines = useAirlines();
  const titleId = useId();
  const [why, setWhy] = useState(null); // 'price' | 'match' | null
  const [line, setLine] = useState(null); // the slot id whose picker is open
  const [rowFocus, setRowFocus] = useState(null);
  const delta = useTotalDelta(trip.total.perPerson);
  const name = tripName(trip, destinations, lang);
  const partial = totalLeavesOut(trip);
  const many = trip.party.head + (trip.party.babies || 0) > 1;
  const pct = trip.match?.pct;
  const segIndex = new Map(trip.slots.filter((s) => s.eur != null && s.eur > 0).map((s, i) => [s.id, i]));
  const airline = (code) => airlineName(airlines, code);

  const openSlot = line ? trip.slots.find((s) => s.id === line) : null;
  const back = () => {
    const id = line;
    setLine(null);
    setRowFocus(id);
  };

  return (
    <SheetShell title={name} onClose={onClose} className="tff-rc-sheet" labelId={titleId} closeLabel={t('tf.rc.close')}>
      {openSlot && renderLine ? renderLine(openSlot, back) : (
        <div className="tff-rc">
          <div className="tff-rc-head">
            <p className="tff-rc-total">
              <span className="tff-rc-eur"><ReceiptFigure eur={trip.total.perPerson} t={t} precision="cents" /></span>
              <span className="tff-rc-unit">{t(partial ? 'tf.card.unitPartial' : 'tf.card.unit')}</span>
              {delta != null && Math.abs(delta) >= 1 && (
                <span className="tff-delta" role="status">{signedMoney(delta, { locale: lang })}</span>
              )}
            </p>
            <TripBar trip={trip} t={t} lang={lang} />
            <div className="tff-rc-whys">
              <Button variant="quiet" size="sm" aria-expanded={why === 'price'} onClick={() => setWhy(why === 'price' ? null : 'price')}>
                {t('tf.rc.whyPrice')}
              </Button>
              {pct != null && (
                <Button variant="quiet" size="sm" aria-expanded={why === 'match'} onClick={() => setWhy(why === 'match' ? null : 'match')}>
                  {t('tf.rc.whyMatch', { pct })}
                </Button>
              )}
            </div>
            {why === 'match' && <WhyMatch trip={trip} t={t} lang={lang} />}
          </div>

          <ul className="tff-rc-rows">
            {trip.slots.map((s) => {
              const swatch = segIndex.has(s.id) ? RAMP[segIndex.get(s.id) % RAMP.length] : null;
              const body = (
                <>
                  <span className="tff-rc-sw" style={swatch ? { background: swatch } : undefined} aria-hidden="true" />
                  <span className="tff-rc-what">
                    <span className="tff-rc-label">{t(s.labelKey)}</span>
                    <span className="tff-rc-pick">
                      {s.eur == null ? null : pickLine(s, { t, airline })}
                    </span>
                    {why === 'price' && <span className="tff-rc-why">{whyLine(s, trip, { t, lang, destinations })}</span>}
                  </span>
                  <span className="tff-rc-fig">
                    {s.eur == null ? <NotYet /> : <ReceiptFigure eur={s.eur} t={t} precision="cents" />}
                  </span>
                </>
              );
              const opens = s.eur != null && renderLine && (s.options?.length || s.id === 'flight');
              return (
                <li key={s.id} className={`tff-rc-row-wrap${s.eur == null ? ' is-notyet' : ''}`}>
                  {opens ? (
                    <Button
                      variant="quiet"
                      className="tff-rc-row"
                      ref={(el) => { if (el && rowFocus === s.id) { el.focus(); setRowFocus(null); } }}
                      aria-label={t('tf.rc.openLine', { line: t(s.labelKey), price: formatMoney(s.eur, { precision: 'cents', locale: lang }) })}
                      onClick={() => setLine(s.id)}
                    >
                      {body}
                      <ChevronRightIcon size={16} className="tff-rc-chev" />
                    </Button>
                  ) : (
                    <div className="tff-rc-row is-static">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="tff-rc-foot">
            {many && (
              <p className="tff-rc-group">
                <span>{t('tf.card.group', { n: trip.party.head + (trip.party.babies || 0) })}</span>
                <span className="money"><ReceiptFigure eur={trip.total.group} t={t} precision="cents" /></span>
              </p>
            )}
            <Button variant="primary" block onClick={() => onPlan(trip)}>{t('tf.rc.plan')}</Button>
          </div>
        </div>
      )}
    </SheetShell>
  );
}
