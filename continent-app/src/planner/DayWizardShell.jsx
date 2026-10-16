import React, { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { SheetShell } from '../browse/SheetShell.jsx';
import { Button, StepRail, StepMini, StepList } from '../components/ui/index.js';

/**
 * The day planner's questions in the trip planner's own frame (T433).
 *
 * The owner asked for the two planners' steps to be the same structure, the
 * same colour and the same styling. Copying the trip wizard's look into a
 * second set of rules would drift the first time either was touched, so the
 * day flow wears the trip wizard's classes instead: the same full-page shell
 * (guide-inline, trip-wizard-modal wiz-inline), the same head (the step's
 * name, "Step x of n", the named rail on a desktop, the one-line bar and the
 * steps sheet on a phone, all from the kit's StepRail) and the same footer
 * (Back on the left of a primary that names where it goes). Every rule the
 * trip planner's T432 and T458 passes settled applies here by construction.
 *
 *   steps     [{ key, label }] in order
 *   at        index of the step on screen
 *   onGo(i)   jump to a done step (rail, sheet)
 *   layout    'form' | 'mid' | 'wide', the column width the step needs
 *   foot      { summary?, back?: fn, secondary?: { label, onClick }, next?: { label, onClick, disabled } }
 *   onStartOver  clears the answers (desktop footer, phone steps sheet)
 *   canvasKey changes when the step's content changes, replaying its entrance
 *   dir       'fwd' | 'back', which side the entrance comes from
 */
export function DayWizardShell({
  steps, at, onGo, layout = 'form', foot = {}, onStartOver = null,
  canvasKey, dir = 'fwd', className = '', children,
}) {
  const { t } = useI18n();
  const isDesktop = useIsDesktop();
  const [stepsOpen, setStepsOpen] = useState(false);
  const n = steps.length;
  const now = steps[at] || steps[0];
  const go = (i) => { setStepsOpen(false); onGo(i); };

  return (
    <div className="guide-inline trip-wizard-inline day-wizard-host">
      <div
        className={`guide-modal trip-wizard-modal wiz-${layout} wiz-inline day-wizard ${dir === 'back' ? 'wiz-back' : ''} ${className}`}
      >
        <div className="guide-head">
          <div className="guide-head-inner">
            <div className="shape-head-title">
              {now?.label}
              {n > 1 && isDesktop && (
                <span className="shape-head-step">{t('wizard.stepOf', { x: at + 1, n })}</span>
              )}
            </div>
            {n > 1 && !isDesktop && (
              <StepMini
                at={at}
                n={n}
                text={t('wizard.stepOf', { x: at + 1, n })}
                open={stepsOpen}
                onOpen={() => setStepsOpen(true)}
              />
            )}
            {n > 1 && isDesktop && (
              <StepRail steps={steps} at={at} onGo={go} label={t('day.progressAria')} />
            )}
          </div>
        </div>

        <div className="guide-body">
          <div className="wiz-main">
            <div className="guide-canvas" key={canvasKey}>
              {children}
            </div>
          </div>
        </div>

        {(foot.back || foot.next || foot.summary || foot.secondary) && (
          <div className="guide-foot">
            <div className="guide-foot-inner">
              <div className="guide-foot-summary">
                {onStartOver && isDesktop && at > 0 && (
                  <Button variant="quiet" size="sm" className="guide-startover" onClick={onStartOver}>
                    {t('wizard.startOver')}
                  </Button>
                )}
                {foot.summary}
              </div>
              <div className="guide-foot-actions">
                {foot.back && (
                  <Button className="guide-back" onClick={foot.back}>{t('wizard.back')}</Button>
                )}
                {foot.secondary && (
                  <Button className="guide-secondary" onClick={foot.secondary.onClick}>{foot.secondary.label}</Button>
                )}
                {foot.next && (
                  <Button
                    variant={foot.next.quiet ? 'secondary' : 'primary'}
                    className="guide-next"
                    onClick={foot.next.onClick}
                    disabled={!!foot.next.disabled}
                  >
                    {foot.next.label}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {stepsOpen && (
        <SheetShell
          title={t('wizard.stepsTitle')}
          onClose={() => setStepsOpen(false)}
          className="wiz-steps-sheet"
          labelId="day-steps-title"
        >
          <StepList steps={steps} at={at} onGo={go} editLabel={t('wizard.editStep')} />
          {onStartOver && at > 0 && (
            <Button
              variant="quiet"
              className="guide-startover wiz-sheet-startover"
              onClick={() => { setStepsOpen(false); onStartOver(); }}
            >
              {t('wizard.startOver')}
            </Button>
          )}
        </SheetShell>
      )}
    </div>
  );
}
