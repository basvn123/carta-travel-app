import React from 'react';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { Button } from '../../components/Button.jsx';
import { TripTotalBar } from '../TripTotalBar.jsx';
import { ArrowLeftIcon, CheckIcon, ChevronDownIcon, CloseIcon } from '../../components/Icons.jsx';
import { IconButton, StepList } from '../../components/ui/index.js';
import '../../styles/planners/88-pf2-wizard.css';
import { cityLabel } from '../../lib/placeName.js';
import { STEP_LABEL_KEYS } from './wizardSteps.js';
import { useI18n } from '../../i18n/index.jsx';

/**
 * The wizard's head (T812): one row, the way back, the step's name and one
 * stepper, nothing else. From 769 px the steps stand inline after the name
 * (a number or a tick, the word), the current one in the selected tint, the
 * done ones a tap back. On a phone the name is a button that opens the step
 * list ("3 of 4", "Getting there"), so Where and Stay stay one tap away, and
 * one thin line under the row is the only progress drawn.
 */
export function WizardHead({ inline, onClose, steps, step, isDesktop, stepsOpen, setStepsOpen, goStep, flowBack = null }) {
  const { t } = useI18n();
  const name = steps[step - 1] ? t(STEP_LABEL_KEYS[steps[step - 1]]) : t('wizard.planYourTrip');
  const multi = steps.length > 1;
  return (
    <div className={`guide-head wz-head ${isDesktop ? 'is-wide' : 'is-phone'}`}>
      <div className="wz-head-row">
        {flowBack ? (
          <IconButton tone="surface" className="wz-head-back" label={t('pf.back')} onClick={flowBack}>
            <ArrowLeftIcon size={18} />
          </IconButton>
        ) : <span className="wz-head-gap" aria-hidden="true" />}
        {multi && !isDesktop ? (
          <Button
            variant="quiet"
            className="wz-head-menu"
            onClick={() => setStepsOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={stepsOpen}
            aria-label={`${name}, ${t('pf.position', { x: step, n: steps.length })}. ${t('wizard.stepsTitle')}`}
          >
            <span className="wz-head-pos">{t('pf.position', { x: step, n: steps.length })}</span>
            <span className="wz-head-name">
              {name}
              <ChevronDownIcon size={16} className="wz-head-chev" />
            </span>
          </Button>
        ) : (
          <span className="wz-head-name is-plain">{name}</span>
        )}
        {multi && isDesktop && (
          <ol className="wz-stepper" aria-label={t('wizard.stepsTitle')}>
            {steps.map((label, i) => {
              const n = i + 1;
              const state = n < step ? 'done' : n === step ? 'now' : 'todo';
              const mark = <span className="wz-stepper-mark" aria-hidden="true">{state === 'done' ? <CheckIcon size={12} /> : n}</span>;
              return (
                <li key={label} className={`wz-stepper-step is-${state}`}>
                  {state === 'done' ? (
                    <Button variant="quiet" size="sm" className="wz-stepper-btn" onClick={() => goStep(n)}>
                      {mark}
                      {t(STEP_LABEL_KEYS[label])}
                    </Button>
                  ) : (
                    <span className="wz-stepper-btn" aria-current={state === 'now' ? 'step' : undefined}>
                      {mark}
                      {t(STEP_LABEL_KEYS[label])}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {!inline && !flowBack ? (
          <IconButton className="wz-head-close" label={t('wizard.close')} onClick={onClose}>
            <CloseIcon size={16} />
          </IconButton>
        ) : !isDesktop && <span className="wz-head-gap" aria-hidden="true" />}
      </div>
      {multi && !isDesktop && (
        <span
          className="wz-progress"
          role="progressbar"
          aria-label={t('wizard.stepsTitle')}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={step}
        >
          <span style={{ transform: `scaleX(${Math.min(1, step / Math.max(1, steps.length))})` }} />
        </span>
      )}
    </div>
  );
}

/**
 * The phone's step list, opened from the head. Done steps are tappable;
 * the ones still to come are named but inert. Start over lives here on a
 * phone (T388), which keeps the footer to one row.
 */
export function WizardStepsSheet({ steps, step, goStep, onClose, hasProgress, startOver }) {
  const { t } = useI18n();
  return (
    <SheetShell title={t('wizard.stepsTitle')} onClose={onClose} className="wiz-steps-sheet" labelId="wiz-steps-title">
      <StepList
        steps={steps.map((label) => ({ key: label, label: t(STEP_LABEL_KEYS[label]) }))}
        at={step - 1}
        onGo={(i) => goStep(i + 1)}
        editLabel={t('wizard.editStep')}
      />
      {hasProgress && (
        <Button
          variant="quiet"
          className="wz-startover wiz-sheet-startover"
          onClick={() => { onClose(); startOver(); }}
          title={t('wizard.startOverTitle')}
        >
          {t('wizard.startOver')}
        </Button>
      )}
    </SheetShell>
  );
}

/**
 * The footer: where the traveller has got to, and the way on. T812: one
 * row at every width, Start over as a quiet link (on a phone it is in the
 * step list), the trip's running total (a tap opens the receipt) with its
 * size under it, and Next. Back and Next are --tap-main.
 */
export function WizardFoot({
  priced, onOpenTotal, hasProgress, isDesktop, startOver, stepName, tripPick, pickFreeNights,
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
  } else if (includedIds.length > 0) {
    note = t(includedIds.length === 1 ? 'wizard.footSummaryOne' : 'wizard.footSummary', { cities: includedIds.length, nights: totalNights });
  }
  return (
    <div className="guide-foot wz-foot">
      <div className="guide-foot-inner">
        {hasProgress && isDesktop && (
          <Button variant="quiet" size="sm" className="wz-startover" onClick={startOver} title={t('wizard.startOverTitle')}>
            {t('wizard.startOver')}
          </Button>
        )}
        <div className="guide-foot-summary wz-foot-sum">
          <TripTotalBar priced={priced} layout="foot" onOpen={onOpenTotal} className="wiz-foot-total" />
          {note && <span className="wz-foot-note">{note}</span>}
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
