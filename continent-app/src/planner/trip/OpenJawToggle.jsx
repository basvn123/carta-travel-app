import React, { useId } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { formatMoney } from '../../lib/money.js';

/**
 * Fly home from the last stop (G12 lane L11, decision §3.6): the two ways
 * home as a pair of choices on the cost card, each with its whole-trip
 * total (lib/plan/openJaw.js openJawTotals, both through quoteTrip). An
 * option whose flight has no price yet says so instead of a smaller total
 * that leaves the flight out; the difference shows only like for like.
 *
 *   jaw    { choice, round, open, diff } from useTripPlanner's openJaw
 *   names  { in, out } the two airports' town names
 *   div    1 for the group, the people for a person (the card's own unit)
 *   onPick('round' | 'open')
 */
export function OpenJawToggle({ jaw, names, div = 1, onPick }) {
  const { t, lang } = useI18n();
  const id = useId();
  if (!jaw?.choice || !onPick) return null;
  const money = (v) => formatMoney(v / div, { precision: 'whole', locale: lang });
  const cur = jaw.choice.current;
  const option = (which) => {
    const side = jaw[which];
    const label = which === 'open' ? t('tp.jaw.open', { place: names?.out || '' }) : t('tp.jaw.round', { place: names?.in || '' });
    return (
      <label key={which} className={`ccard-jaw-opt${cur === which ? ' is-on' : ''}`}>
        <input type="radio" name={id} value={which} checked={cur === which} onChange={() => onPick(which)} />
        <span className="ccard-jaw-label">{label}</span>
        <span className="ccard-jaw-total money">
          {side?.flight && Number.isFinite(side.total) ? money(side.total) : t('tp.jaw.notYet')}
        </span>
      </label>
    );
  };
  return (
    <fieldset className="ccard-jaw" data-open-jaw="">
      <legend className="ccard-jaw-title">{t('tp.jaw.title')}</legend>
      {option('round')}
      {option('open')}
      {Number.isFinite(jaw.diff) && Math.abs(jaw.diff) >= 1 && (
        <p className="ccard-jaw-diff">
          {t(jaw.diff < 0 ? 'tp.jaw.less' : 'tp.jaw.more', { eur: money(Math.abs(jaw.diff)) })}
        </p>
      )}
    </fieldset>
  );
}
