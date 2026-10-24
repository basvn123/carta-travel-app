import React, { useState } from 'react';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { useI18n } from '../../i18n/index.jsx';
import { Button, ChoiceRows } from '../../components/ui/index.js';
import { QUESTIONS } from './questions.js';
import { QuestionBody } from './QuestionScreen.jsx';
import { useTripSettings } from './flowHooks.js';
import { dayScreens, nextScreen, progressOf } from './flowGraph.js';
import { normalizeSettings } from './tripSettings.js';

/**
 * Plan your days? (T658), the sheet over a trip that was just planned: yes or
 * not now, then the day rhythm the planner did not ask at the start (mornings,
 * pace, how planned, the main goal, eating, getting around; answered ones are
 * skipped), then whether Carta plans the days or the traveller does. The
 * answers land in the trip settings, which the day planner reads.
 *
 *   onPlan(how)   'carta' | 'self': open the trip's first day
 */
export function DaysPrompt({ onClose, onPlan }) {
  const { t } = useI18n();
  const [settings, save] = useTripSettings();
  const [list] = useState(() => dayScreens(settings));
  const [id, setId] = useState(list[0]);
  const [pick, setPick] = useState('');
  const q = QUESTIONS[id];
  const pos = progressOf(list, id);
  const next = () => setId(nextScreen(list, id));

  let body;
  if (id === 'daysAsk' || id === 'daysHow') {
    const options = q.options.map((o) => ({ value: o.value, icon: o.icon, label: t(o.labelKey), sub: o.subKey ? t(o.subKey) : '' }));
    const go = () => {
      if (id === 'daysAsk') {
        if (pick === 'no') { onClose(); return; }
        setPick('');
        next();
        return;
      }
      save(normalizeSettings({ ...settings, daysHow: pick }));
      onPlan(pick);
    };
    body = (
      <>
        {q.helpKey && <p className="pf-help">{t(q.helpKey)}</p>}
        <ChoiceRows label={t(q.titleKey)} options={options} value={pick ? [pick] : []} onPick={setPick} />
        <div className="pf-foot">
          <Button variant="primary" block disabled={!pick} onClick={go}>
            {id === 'daysHow' ? t('pf.days.go') : t('pf.continue')}
          </Button>
        </div>
      </>
    );
  } else {
    body = (
      <QuestionBody
        id={id}
        settings={settings}
        commit={(s) => { save(s); next(); }}
      />
    );
  }

  return (
    <SheetShell title={t(q.titleKey)} onClose={onClose} className="pf-days">
      <div className="pf-step">
        {id !== 'daysAsk' && <p className="pf-head-pos">{t('pf.position', { x: pos.index, n: list.length - 1 })}</p>}
        {body}
      </div>
    </SheetShell>
  );
}
