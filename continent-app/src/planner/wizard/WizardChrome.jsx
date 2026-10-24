import React from 'react';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { Button } from '../../components/Button.jsx';
import { TripTotalBar } from '../TripTotalBar.jsx';
import { ArrowLeftIcon, CheckIcon, ChevronRightIcon, CloseIcon } from '../../components/Icons.jsx';
import { IconButton, StepRail } from '../../components/ui/index.js';
import { cityLabel } from '../../lib/placeName.js';
import { STEP_LABEL_KEYS } from './wizardSteps.js';
import { useI18n } from '../../i18n/index.jsx';

/**
 * The wizard's head: the step's name, and where the traveller is in the
 * list. On a phone the rail is the count, a progress bar in --text (it does
 * not act, so it is not brown) and a button that opens the list as a sheet;
 * from 769 px every step is named, done ones tappable.
 */
export function WizardHead({ inline, onClose, steps, step, isDesktop, stepsOpen, setStepsOpen, goStep, flowBack = null }) {
  const { t } = useI18n();
  // T667: inside the trip planner flow the head is the flow's sheet head: a
  // round back control, the step's name in the middle with where it sits
  // ("2 of 5"), and a thin progress line; done steps stay one tap away on a
  // desktop through the rail under it.
  if (flowBack) {
    return (
      <div className="guide-head pf-ehead">
        <div className="pf-ehead-row">
          <IconButton tone="surface" className="pf-round" label={t('pf.back')} onClick={flowBack}>
            <ArrowLeftIcon size={18} />
          </IconButton>
          <span className="pf-ehead-mid">
            <span className="pf-ehead-title">{steps[step - 1] ? t(STEP_LABEL_KEYS[steps[step - 1]]) : t('wizard.planYourTrip')}</span>
            {steps.length > 1 && <span className="pf-ehead-pos">{t('pf.position', { x: step, n: steps.length })}</span>}
          </span>
          <span className="pf-ehead-end" aria-hidden="true" />
        </div>
        <span className="pf-ehead-bar" aria-hidden="true">
          <span style={{ transform: `scaleX(${Math.min(1, step / Math.max(1, steps.length))})` }} />
        </span>
        {steps.length > 1 && isDesktop && (
          <div className="pf-ehead-rail">
            <StepRail
              label={t('wizard.stepsTitle')}
              steps={steps.map((label) => ({ key: label, label: t(STEP_LABEL_KEYS[label]) }))}
              at={step - 1}
              onGo={(i) => goStep(i + 1)}
            />
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="guide-head">
      {!inline && <button className="guide-close" onClick={onClose} aria-label={t('wizard.close')}><CloseIcon size={16} /></button>}
      <div className="guide-head-inner">
        <div className="shape-head-title">
          {steps[step - 1] ? t(STEP_LABEL_KEYS[steps[step - 1]]) : t('wizard.planYourTrip')}
          {steps.length > 1 && isDesktop && (
            <span className="shape-head-step">{t('wizard.stepOf', { x: step, n: steps.length })}</span>
          )}
        </div>
        {steps.length > 1 && !isDesktop && (
          <button
            type="button"
            className="wiz-mini"
            onClick={() => setStepsOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={stepsOpen}
          >
            <span className="wiz-mini-line">
              <span className="wiz-mini-now">{t('wizard.stepOf', { x: step, n: steps.length })}</span>
              <ChevronRightIcon size={13} />
            </span>
            <span className="wiz-mini-bar" aria-hidden="true">
              <span style={{ width: `${Math.round((step / steps.length) * 100)}%` }} />
            </span>
          </button>
        )}
        {steps.length > 1 && isDesktop && (
          <ol className="wiz-steps">
            {steps.map((label, i) => {
              const n = i + 1;
              const state = n < step ? 'done' : n === step ? 'now' : 'todo';
              return (
                <li key={label} className={`wiz-step ${state}`}>
                  <button
                    type="button"
                    className="wiz-step-btn"
                    disabled={state !== 'done'}
                    onClick={() => goStep(n)}
                    aria-current={state === 'now' ? 'step' : undefined}
                  >
                    <span className="wiz-step-mark">{state === 'done' ? <CheckIcon size={10} /> : n}</span>
                    <span className="wiz-step-name">{t(STEP_LABEL_KEYS[label])}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

/**
 * The phone's step list, opened from the one-line rail. Done steps are
 * tappable; the ones still to come are named but inert. Start over lives here
 * on a phone (T388), which keeps the footer to one row.
 */
export function WizardStepsSheet({ steps, step, goStep, onClose, hasProgress, startOver }) {
  const { t } = useI18n();
  return (
    <SheetShell title={t('wizard.stepsTitle')} onClose={onClose} className="wiz-steps-sheet" labelId="wiz-steps-title">
      <ol className="wiz-sheet-list">
        {steps.map((label, i) => {
          const n = i + 1;
          const state = n < step ? 'done' : n === step ? 'now' : 'todo';
          return (
            <li key={label} className={`wiz-sheet-step ${state}`}>
              <button
                type="button"
                disabled={state !== 'done'}
                onClick={() => goStep(n)}
                aria-current={state === 'now' ? 'step' : undefined}
              >
                <span className="wiz-step-mark">{state === 'done' ? <CheckIcon size={11} /> : n}</span>
                <span className="wiz-sheet-name">{t(STEP_LABEL_KEYS[label])}</span>
                {state === 'done' && <span className="wiz-sheet-edit">{t('wizard.editStep')}</span>}
              </button>
            </li>
          );
        })}
      </ol>
      {hasProgress && (
        <button
          type="button"
          className="guide-startover wiz-sheet-startover"
          onClick={() => { onClose(); startOver(); }}
          title={t('wizard.startOverTitle')}
        >
          {t('wizard.startOver')}
        </button>
      )}
    </SheetShell>
  );
}

/**
 * The footer: where the traveller has got to, and the way on. Under 1024 px
 * the trip's total bar opens the receipt sheet; from 1024 px the total sits
 * at the foot of the right column. Back and Next are --tap-main.
 */
export function WizardFoot({
  railOn, priced, onOpenTotal, hasProgress, isDesktop, startOver, stepName, tripPick, pickFreeNights,
  windowNights, totalNights, includedIds, step, steps, goStep, canNext, finish,
  onBackOut = null,
}) {
  const { t } = useI18n();
  let note = null;
  if (stepName === 'Trips' && tripPick) {
    // The chosen trip, in the footer already on screen; when the trip is
    // shorter than the window the footer says how many nights are left free.
    note = (
      <span className={`guide-nights-budget ${pickFreeNights > 0 ? '' : 'done'}`}>
        {pickFreeNights > 0 ? (
          t(pickFreeNights === 1 ? 'ready.footFreeOne' : 'ready.footFreeMany', {
            n: windowNights - pickFreeNights, of: windowNights, free: pickFreeNights,
          })
        ) : (
          <>
            <CheckIcon size={11} />
            {t('ready.footPicked', {
              route: (tripPick.cities || tripPick.stops || []).map((c) => cityLabel(c.city)).join(', '),
              days: tripPick.days,
            })}
          </>
        )}
      </span>
    );
  } else if (stepName === 'Stay' && windowNights > 0) {
    note = (
      <span className={`guide-nights-budget ${totalNights > windowNights ? 'over' : ''} ${totalNights === windowNights ? 'done' : ''}`}>
        {totalNights === windowNights && <CheckIcon size={11} />}
        {t(totalNights > windowNights ? 'wizard.nightsPlannedOver' : 'wizard.nightsPlanned', { n: totalNights, of: windowNights })}
      </span>
    );
  } else if (railOn && includedIds.length > 0) {
    note = t(includedIds.length === 1 ? 'wizard.footSummaryOne' : 'wizard.footSummary', { cities: includedIds.length, nights: totalNights });
  }
  return (
    <div className="guide-foot">
      <div className="guide-foot-inner">
        <div className="guide-foot-summary">
          {!railOn && <TripTotalBar priced={priced} layout="foot" onOpen={onOpenTotal} className="wiz-foot-total" />}
          {hasProgress && isDesktop && (
            <button className="guide-startover" onClick={startOver} title={t('wizard.startOverTitle')}>
              {t('wizard.startOver')}
            </button>
          )}
          {note}
        </div>
        <div className="guide-foot-actions">
          {/* In the trip planner flow (T656, T667) Back is the head's round
              control, so the foot keeps the way on only. */}
          {step > 1 && !onBackOut && (
            <Button className="guide-back wiz-foot-btn" onClick={() => goStep(step - 1)}>{t('wizard.back')}</Button>
          )}
          {step < steps.length ? (
            // "Next" names where it goes: the difference between a form that
            // could go anywhere and one whose end is in sight.
            <Button variant="primary" className="guide-next wiz-foot-btn" onClick={() => goStep(step + 1)} disabled={!canNext}>
              {t('wizard.nextTo', { step: t(STEP_LABEL_KEYS[steps[step]] || 'wizard.stepFinish') })}
            </Button>
          ) : (
            <Button variant="primary" className="guide-next wiz-foot-btn" onClick={finish} disabled={includedIds.length === 0}>
              {t('plan.planIt')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
