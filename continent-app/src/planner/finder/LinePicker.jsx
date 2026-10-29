import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, IconButton } from '../../components/ui/index.js';
import { ArrowLeftIcon, CheckIcon } from '../../components/Icons.jsx';
import { chooseOption, slotTotals } from '../../lib/recommend/slots.js';
import { formatMoney } from '../../lib/money.js';
import { FlightOptions } from './FlightOptions.jsx';
import { signedMoney, withSlot } from './finderText.js';

/** One choice in a picker: a radio row with its figure and its difference. */
export function OptionRow({ chosen, selected, onPick, label, sub = '', eur, delta, lead = null, t, lang }) {
  return (
    <Button
      variant="quiet"
      role="radio"
      aria-checked={selected}
      className={`tff-opt${selected ? ' is-selected' : ''}`}
      onClick={onPick}
    >
      {lead}
      <span className="tff-opt-what">
        <span className="tff-opt-label">{label}</span>
        {sub && <span className="tff-opt-sub">{sub}</span>}
      </span>
      <span className="tff-opt-fig">
        <span className="money">{eur == null ? '' : formatMoney(eur, { locale: lang })}</span>
        <span className="tff-opt-delta">
          {chosen ? t('tf.pick.chosen') : delta ? signedMoney(delta, { locale: lang }) : ''}
        </span>
      </span>
      {selected && <span className="tff-opt-tick" aria-hidden="true"><CheckIcon size={12} /></span>}
    </Button>
  );
}

/**
 * The line picker (T800): one shell for every slot. A title, a row per
 * option with its figure and its difference to the current pick, the
 * current pick marked "Chosen", and the foot with the trip's total a person
 * as it would stand and the one primary, "Use this {line}". A slot that
 * config/slots.json gives options gets this shell with no new code; the
 * flight slot fills it with the live day (FlightOptions).
 *
 * It is a view inside the trip preview (T811), never a sheet of its own. Escape
 * and the back arrow return to the Cost row it came from.
 *
 *   onApply(slot)   the slot as chosen; the preview's trip takes it
 *   onBack()        back to the Cost tab, focus on this row
 */
export function LinePicker({ trip, slot, onApply, onBack, ui }) {
  const { t, lang } = useI18n();
  const headRef = useRef(null);
  const [pending, setPending] = useState(null); // { id, slot }: the slot as it would be
  const next = pending?.slot || slot;
  const total = withSlot(trip, next, slotTotals).total.perPerson;
  const known = ['flight', 'stay', 'food', 'local'].includes(slot.id);
  const lineLabel = t(slot.labelKey);

  useEffect(() => { headRef.current?.focus({ preventScroll: true }); }, []);
  // Escape closes the picker, not the preview: a window capture listener
  // runs before the sheet's own trap on the document (escape-stack gotcha).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      onBack();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onBack]);

  return (
    <div className="tff-pick">
      <div className="tff-pick-head">
        <IconButton tone="plain" label={t('tf.pick.toReceipt')} onClick={onBack}>
          <ArrowLeftIcon size={18} />
        </IconButton>
        <h3 className="tff-pick-title" tabIndex={-1} ref={headRef}>
          {known ? t(`tf.pick.title.${slot.id}`) : t('tf.pick.titleAny', { line: lineLabel })}
        </h3>
      </div>

      <div className="tff-pick-body">
        {slot.id === 'flight' ? (
          <FlightOptions trip={trip} slot={slot} ui={ui} onPending={(s) => setPending(s ? { id: 'flight', slot: s } : null)} />
        ) : (
          <div className="tff-opts" role="radiogroup" aria-label={lineLabel}>
            {(slot.options || []).map((o) => {
              const current = (slot.pick?.id ?? null) === o.id;
              const selected = pending ? pending.id === o.id : current;
              return (
                <OptionRow
                  key={o.id}
                  t={t}
                  lang={lang}
                  label={t(o.labelKey)}
                  eur={o.eur}
                  delta={o.delta}
                  chosen={current}
                  selected={selected}
                  onPick={() => setPending(current ? null : { id: o.id, slot: chooseOption(slot, o.id) })}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="tff-pick-foot">
        <p className="tff-pick-total">
          <span>{t('tf.pick.tripTotal')}</span>
          <span className="money">{formatMoney(total, { locale: lang })}</span>
        </p>
        <Button variant="primary" block disabled={!pending} onClick={() => onApply(pending.slot)}>
          {known ? t(`tf.pick.use.${slot.id}`) : t('tf.pick.useAny')}
        </Button>
      </div>
    </div>
  );
}
