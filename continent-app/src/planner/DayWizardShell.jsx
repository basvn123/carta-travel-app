import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { SheetShell } from '../browse/SheetShell.jsx';
import { Button, Recap, StepRail, StepMini, StepList } from '../components/ui/index.js';

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
 *
 * T459 gave it the rest of the trip wizard's frame:
 *   recap     [{ key, Icon, text, onClick }] "Planning around", a band under
 *             the head on a desktop, the top of the body on a phone
 *   title     the step's question, an h1 straight inside .guide-canvas so the
 *             trip wizard's title size and spacing apply; `sub` under it and
 *             `lead` (a small line such as "Question 3 of 7") above it
 *   rail      the card beside the step from 1100 px (the trip wizard's
 *             "Your trip"); every step then takes the wide column, as there.
 *             Narrower, `railSummary` is a footer button that opens the same
 *             card as a sheet (the trip wizard's PlanTotalButton)
 */
export function DayWizardShell({
  steps, at, onGo, layout = 'form', foot = {}, onStartOver = null,
  canvasKey, dir = 'fwd', className = '', children,
  recap = [], title = null, sub = null, lead = null, rail = null, railSummary = null, railTitle = '',
}) {
  const { t } = useI18n();
  const isDesktop = useIsDesktop();
  const [stepsOpen, setStepsOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  // The rail stands beside the step where there is room for both, the trip
  // wizard's own breakpoint.
  const [railRoom, setRailRoom] = useState(() => typeof window !== 'undefined'
    && Boolean(window.matchMedia?.('(min-width: 1100px)').matches));
  useEffect(() => {
    const mq = typeof window !== 'undefined' ? window.matchMedia?.('(min-width: 1100px)') : null;
    if (!mq) return undefined;
    const on = (e) => setRailRoom(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const railOn = Boolean(rail) && railRoom;
  const width = railOn ? 'wide' : layout;
  const recapLabel = t('wizard.planningAround');
  const n = steps.length;
  const now = steps[at] || steps[0];
  const go = (i) => { setStepsOpen(false); onGo(i); };

  return (
    <div className="guide-inline trip-wizard-inline day-wizard-host">
      <div
        className={`guide-modal trip-wizard-modal wiz-${width} wiz-inline day-wizard ${dir === 'back' ? 'wiz-back' : ''} ${className}`}
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

        {recap.length > 0 && isDesktop && <Recap label={recapLabel} chips={recap} />}

        <div className="guide-body">
          {recap.length > 0 && !isDesktop && <Recap label={recapLabel} chips={recap} inBody />}
          <div className={`wiz-main ${railOn ? 'has-rail' : ''}`}>
            <div className="guide-canvas" key={canvasKey}>
              {lead}
              {title && <h1 className="guide-title">{title}</h1>}
              {sub && <p className="guide-sub">{sub}</p>}
              {children}
            </div>
            {railOn && <aside className="wiz-rail">{rail}</aside>}
          </div>
        </div>

        {(foot.back || foot.next || foot.summary || foot.secondary || railSummary) && (
          <div className="guide-foot">
            <div className="guide-foot-inner">
              <div className="guide-foot-summary">
                {onStartOver && isDesktop && at > 0 && (
                  <Button variant="quiet" size="sm" className="guide-startover" onClick={onStartOver}>
                    {t('wizard.startOver')}
                  </Button>
                )}
                {foot.summary}
                {!foot.summary && rail && !railOn && railSummary && (
                  <Button variant="quiet" className="plan-total-btn dayw-rail-btn" onClick={() => setRailOpen(true)} aria-haspopup="dialog">
                    {railSummary}
                  </Button>
                )}
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

      {railOpen && rail && !railOn && (
        <SheetShell
          title={railTitle}
          onClose={() => setRailOpen(false)}
          className="plan-total-sheet dayw-rail-sheet"
          labelId="day-rail-title"
          width={480}
        >
          {rail}
        </SheetShell>
      )}

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
