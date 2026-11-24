import React, { useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useSettings } from '../../components/SettingsLine.jsx';
import { Button } from '../../components/ui/index.js';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { QUESTIONS } from './questions.js';
import { QuestionBody } from './QuestionScreen.jsx';
import { StyleSwitch } from './StyleBar.jsx';
import { useBcp47, useMonths, whenText } from './flowHooks.js';
import { assumptionChips } from './assumptions.js';

/**
 * The shared assumption bar (G12 plan rethink, decision §1.4, §3.3): the
 * same chips on Trips for you, the found trip and the trip page, so a
 * direct landing never hides what was assumed. Who, From, When and length,
 * the style switch, then More. Solid = given; dashed = assumed. A chip
 * opens that question's own body (the screens of the flow) and saves it
 * for this trip; the trips re-price from the new settings. The delta on a
 * change and "Check my assumptions" are B5 (decision §3.3).
 *
 *   settings, save(next)  the trip's settings and their store
 *   onEdit(id)            instead of the bar's own sheet (the trip page
 *                         opens its trip settings, which keep the route in step)
 *   onMore()              the trip settings (way there, bed, budget, ...)
 */
export function AssumptionBar({ settings, save, onEdit = null, onMore = null }) {
  const { t } = useI18n();
  const app = useSettings();
  const months = useMonths();
  const bcp47 = useBcp47();
  const [open, setOpen] = useState('');
  const anchorRef = useRef(null);
  const when = whenText(t, settings.when, months, bcp47);
  const chips = assumptionChips(settings, { t, when, fromName: app?.model?.fromPlace?.name || '' });
  const edit = (id, el) => {
    if (onEdit) { onEdit(id); return; }
    anchorRef.current = el;
    setOpen(id);
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
        {onMore && (
          <li><Button variant="quiet" size="sm" onClick={onMore}>{t('pf.abar.more')}</Button></li>
        )}
      </ul>
      {open && (
        <SheetShell title={t(QUESTIONS[open]?.titleKey || 'pf.sheet')} onClose={() => setOpen('')} anchorRef={anchorRef} width={440} className="pf-settings">
          <div className="pf-set-edit">
            <QuestionBody id={open} settings={settings} doneLabel={t('pf.set.save')} commit={(next) => { save(next); setOpen(''); }} />
          </div>
        </SheetShell>
      )}
    </div>
  );
}
