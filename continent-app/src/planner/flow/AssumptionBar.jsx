import React, { useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useSettings } from '../../components/SettingsLine.jsx';
import { Button } from '../../components/ui/index.js';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { QUESTIONS } from './questions.js';
import { QuestionBody } from './QuestionScreen.jsx';
import { StyleSwitch } from './StyleBar.jsx';
import { useBcp47, useMonths, whenText } from './flowHooks.js';
import { assumptionChips, checkWalk } from './assumptions.js';
import { useChipDelta } from './useChipDelta.js';
import { signedMoney } from '../finder/finderText.js';

/**
 * The shared assumption bar (G12 plan rethink, decision §1.4, §3.3): the
 * same chips on Trips for you, the found trip and the trip page, so a
 * direct landing never hides what was assumed. Who, From, When and length,
 * the style switch, then More. Solid = given; dashed = assumed. A chip
 * opens that question's own body (the screens of the flow) and saves it
 * for this trip; the trips re-price from the new settings. The delta on a
 * change is B5 (decision §3.3). "Check my assumptions" (G12 L7) walks the
 * dashed chips one sheet at a time, biggest price effect first.
 *
 *   settings, save(next)  the trip's settings and their store
 *   onEdit(id)            instead of the bar's own sheet (the trip page
 *                         opens its trip settings, which keep the route in step)
 *   onMore()              the trip settings (way there, bed, budget, ...)
 *   receipt               G12 L9: the price shown now (lib/price/receiptDiff.js
 *                         receiptOfTrip or receiptOfQuote); after a chip
 *                         change the bar says what it did, with Undo
 */
export function AssumptionBar({ settings, save, onEdit = null, onMore = null, receipt = null }) {
  const { t, lang } = useI18n();
  const delta = useChipDelta(settings, receipt, save);
  const app = useSettings();
  const months = useMonths();
  const bcp47 = useBcp47();
  const [open, setOpen] = useState('');
  // G12 L7 "Check my assumptions": the dashed chips still to walk, in order
  // of price effect; each save opens the next, the walk ends by itself.
  const [walk, setWalk] = useState([]);
  const anchorRef = useRef(null);
  const when = whenText(t, settings.when, months, bcp47);
  const chips = assumptionChips(settings, { t, when, fromName: app?.model?.fromPlace?.name || '' });
  const toCheck = checkWalk(settings);
  const edit = (id, el) => {
    if (onEdit) { onEdit(id); return; }
    anchorRef.current = el;
    setOpen(id);
  };
  const startCheck = (el) => {
    const [first, ...rest] = toCheck;
    if (!first) return;
    setWalk(onEdit ? [] : rest);
    edit(first, el);
  };
  const close = () => { setOpen(''); setWalk([]); };
  const commit = (next) => {
    save(next);
    const [nextId, ...rest] = walk;
    setWalk(rest);
    setOpen(nextId || '');
  };
  return (
    <div className="pf-abar-wrap">
      <ul className="pf-abar" aria-label={t('pf.abar.label')}>
        {chips.map((c) => (
          <li key={c.id}>
            <Button
              variant="secondary"
              size="sm"
              className={`pf-abar-chip${c.assumed ? ' is-assumed' : ''}`}
              aria-label={t(c.assumed ? 'pf.abar.assumed' : 'pf.abar.given', { q: t(`pf.step.${c.id}`), a: c.label })}
              onClick={(e) => edit(c.id, e.currentTarget)}
            >
              {c.label}
            </Button>
          </li>
        ))}
        <li><StyleSwitch settings={settings} save={save} /></li>
        {toCheck.length > 0 && (
          <li><Button variant="quiet" size="sm" className="pf-abar-check" onClick={(e) => startCheck(e.currentTarget)}>{t('pf.abar.check')}</Button></li>
        )}
        {onMore && (
          <li><Button variant="quiet" size="sm" onClick={onMore}>{t('pf.abar.more')}</Button></li>
        )}
      </ul>
      {delta.diff && (
        <p className="pf-abar-delta" role="status">
          <span className="money">{deltaText(t, lang, delta.diff)}</span>
          <Button variant="quiet" size="sm" onClick={delta.undo}>{t('pf.delta.undo')}</Button>
        </p>
      )}
      {open && (
        <SheetShell title={t(QUESTIONS[open]?.titleKey || 'pf.sheet')} onClose={close} anchorRef={anchorRef} width={440} className="pf-settings">
          <div className="pf-set-edit">
            <QuestionBody id={open} settings={settings} doneLabel={t('pf.set.save')} key={open} commit={commit} />
          </div>
        </SheetShell>
      )}
    </div>
  );
}

/**
 * The words for a change's price difference (G12 L9). A whole-trip figure
 * only like for like; with a "Not yet" line in both, the difference is
 * named on the lines that moved ("-40 euros on beds"), never as a cheaper
 * trip; with different live lines, no figure at all.
 */
function deltaText(t, lang, d) {
  if (!d.comparable) return t('pf.delta.notComparable');
  const eur = signedMoney(d.total, { locale: lang });
  if (!d.partial) return t('pf.delta.total', { eur });
  const names = d.lines.map((x) => t(`pf.delta.l.${x.id}`)).join(', ');
  return t('pf.delta.lines', { eur, lines: names });
}
