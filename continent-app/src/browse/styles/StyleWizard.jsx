import React from 'react';
import { Pressable } from '../../components/ui/Pressable.jsx';
// Capitalised so the linter sees the JSX use (`<Motion.div>`).
import { m as Motion } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, IconButton } from '../../components/ui/index.js';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { ArrowRightIcon } from '../../components/Icons.jsx';
import { offeredStayTiers } from '../../lib/runtime_pricing.js';
import { SPRING } from '../home/motionKit.jsx';
import { styleName } from './styleBits.jsx';
import { StaySpendFields, DraftDayFigure } from './StaySpendFields.jsx';
import { ExploreStep, StepName, StepPriority, StepTitle, StepWay } from './StyleSteps.jsx';
import { EXPLORE_STEPS, STAY_STEPS, STEPS, applyTemplate, draftChanged, draftToSave, stepPlace } from './studioSteps.js';

/**
 * View 2, the create or edit wizard (Style Studio, G12, decision.md): one
 * question a step, ten steps in two parts. The draft lives here; nothing
 * reaches the store, and so no price, until Save or Done
 * (`ts.createFrom(draft)` for a new style, `ts.commit(id, draft)` for an
 * edit). Closing a changed draft asks first, in place.
 *
 * Create: Next walks the steps; from step 4 "Save style" keeps the explore
 * answers the template gave. Edit: the progress bars are buttons to any
 * step and Save is the primary on every step.
 */
export function StyleWizard({ ts, style, startStep, destinations, meta, escRef, onBack, onClose, onDone }) {
  const { t } = useI18n();
  const edit = Boolean(style);
  const [start] = React.useState(() => (edit ? structuredClone(style) : ts.emptyDraft()));
  const [draft, setDraft] = React.useState(start);
  // The steps the traveller answered; a template picked later in step 1
  // fills only the others. An edit starts with every step answered.
  const [touched, setTouched] = React.useState(() => new Set(edit ? STEPS : []));
  const [step, setStep] = React.useState(() => (STEPS.includes(startStep) ? startStep : 'name'));
  const [dir, setDir] = React.useState(1);
  const [asking, setAsking] = React.useState(null); // the leave waiting on "Discard changes?"
  // Whether the traveller has moved between steps: the first step arrives
  // still, every later one slides in from the side it came from.
  const [moved, setMoved] = React.useState(false);
  const stayTiers = React.useMemo(() => offeredStayTiers(meta), [meta]);
  const idx = STEPS.indexOf(step);
  const last = idx === STEPS.length - 1;
  const place = stepPlace(step);
  const changed = draftChanged(draft, start);

  const set = (stepId, next) => {
    setDraft(next);
    setTouched((s) => (s.has(stepId) ? s : new Set([...s, stepId])));
  };
  const go = (to) => {
    const j = STEPS.indexOf(to);
    if (j < 0 || j === idx) return;
    setMoved(true);
    setDir(j > idx ? 1 : -1);
    setStep(to);
  };

  const leave = (how) => {
    if (changed) { setAsking(how); return; }
    (how === 'close' ? onClose : onBack)();
  };
  const back = () => (idx === 0 ? leave('back') : go(STEPS[idx - 1]));
  const save = () => {
    const out = draftToSave(draft);
    if (edit) {
      ts.commit(style.id, out);
      onDone(style.id, out, 'saved');
    } else {
      const id = ts.createFrom(out);
      onDone(id, out, 'created');
    }
  };

  // Escape: the discard question answers "keep editing"; otherwise it is
  // the close, which asks when the draft changed.
  React.useEffect(() => {
    escRef.current = () => {
      if (asking) { setAsking(null); return true; }
      if (changed) { setAsking('close'); return true; }
      return false;
    };
    return () => { escRef.current = null; };
  }, [escRef, asking, changed]);

  const keepRef = React.useRef(null);
  React.useEffect(() => { if (asking) keepRef.current?.focus(); }, [asking]);

  // The question takes focus when a step arrives, and when the wizard opens
  // anywhere but a desktop's first step (that one focuses the name field).
  const [deskName] = React.useState(() => !edit && step === 'name'
    && typeof window !== 'undefined' && Boolean(window.matchMedia?.('(min-width: 769px) and (pointer: fine)').matches));
  const focusTitle = moved || !deskName;
  let body;
  if (step === 'name') {
    body = (
      <StepName
        draft={draft}
        set={set}
        focusTitle={focusTitle}
        autoName={!edit && !moved}
        onWho={(kind) => {
          setDraft(applyTemplate(draft, ts.draftFromTemplate(kind), touched));
          setTouched((s) => new Set([...s, 'name']));
        }}
      />
    );
  } else if (step === 'spend') {
    body = (
      <>
        <StepTitle focus={focusTitle}>{t('studio.q.spend')}</StepTitle>
        <StaySpendFields
          stay={draft.stay}
          lifestyle={draft.lifestyle}
          stayTiers={stayTiers}
          onStay={(tier) => set('spend', { ...draft, stay: tier })}
          onLifestyle={(ls) => set('spend', { ...draft, lifestyle: ls })}
        />
      </>
    );
  } else if (step === 'way') {
    body = <StepWay draft={draft} set={set} focusTitle={focusTitle} />;
  } else if (step === 'priority') {
    body = <StepPriority draft={draft} set={set} focusTitle={focusTitle} />;
  } else {
    body = <ExploreStep step={step} draft={draft} set={set} focusTitle={focusTitle} showSkip={!edit && !last} onSkip={() => go(STEPS[idx + 1])} />;
  }

  const partName = t(place.part === 'stay' ? 'studio.partStay' : 'studio.partExplore');
  return (
    <>
      <header className="sst-head sst-wz-head">
        <div className={`sst-prog${edit ? ' is-edit' : ''}`}>
          {[['stay', STAY_STEPS], ['explore', EXPLORE_STEPS]].map(([part, steps]) => (
            <div key={part} className={`sst-prog-group${place.part === part ? ' is-here' : ''}`} style={{ flexGrow: steps.length }}>
              <span className="sst-prog-label" aria-hidden="true">{t(part === 'stay' ? 'studio.partStay' : 'studio.partExplore')}</span>
              <span className="sst-prog-bars">
                {steps.map((s) => {
                  const j = STEPS.indexOf(s);
                  const cls = `sst-bar-step${j < idx ? ' is-done' : ''}${j === idx ? ' is-now' : ''}`;
                  return edit ? (
                    <Pressable key={s} type="button" className={cls} aria-current={j === idx ? 'step' : undefined}
                      aria-label={t('studio.goTo', { step: t(`studio.s.${s}`) })} onClick={() => go(s)}>
                      <i aria-hidden="true" />
                    </Pressable>
                  ) : (
                    <span key={s} className={cls} aria-hidden="true"><i /></span>
                  );
                })}
              </span>
            </div>
          ))}
        </div>
        <IconButton className="sst-close" label={t('studio.close')} onClick={() => leave('close')}>
          <HouseIcon.close size={18} />
        </IconButton>
        <p className="sst-where">
          {/* The progress label above already names the part; the line
              adds the style's name only when editing one (judge 1). */}
          {edit && <b>{styleName(t, style)}</b>}
          <span>{t('studio.stepOf', { n: place.n, total: place.of })}</span>
          <span className="sr-only">{t('studio.stepAria', { n: idx + 1, total: STEPS.length, part: partName })}</span>
        </p>
      </header>

      <div className="sst-body sst-wz-body">
        <Motion.div
          key={step}
          className={`sst-step sst-step-${step}`}
          initial={moved ? { opacity: 0, x: dir * 24 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={SPRING.surface}
        >
          {body}
        </Motion.div>
        {step === 'spend' && <DraftDayFigure draft={draft} destinations={destinations} />}
      </div>

      <footer className="sst-foot">
        {asking ? (
          <div className="sst-discard" role="group" aria-labelledby="sst-discard-ask">
            <p className="sst-discard-ask" id="sst-discard-ask">{t('studio.discardAsk')}</p>
            <span className="sst-foot-end">
              <Button ref={keepRef} variant="secondary" onClick={() => setAsking(null)}>{t('studio.keepEditing')}</Button>
              <Button variant="danger" onClick={() => { const how = asking; setAsking(null); (how === 'close' ? onClose : onBack)(); }}>{t('studio.discard')}</Button>
            </span>
          </div>
        ) : (
          <>
            <Button variant="quiet" className="sst-back" iconStart={<HouseIcon.back size={18} />} onClick={back}>
              {idx === 0 ? t('studio.backToStyles') : t('studio.back')}
            </Button>
            <span className="sst-foot-end">
              {edit && !last && (
                <Button variant="secondary" onClick={() => go(STEPS[idx + 1])}>{t('studio.next')}</Button>
              )}
              {!edit && idx >= STAY_STEPS.length - 1 && !last && (
                <Button variant="secondary" onClick={save} haptic="confirm">{t('studio.saveStyle')}</Button>
              )}
              {edit ? (
                <Button variant="primary" onClick={save} haptic="confirm">{t('studio.save')}</Button>
              ) : last ? (
                <Button variant="primary" onClick={save} haptic="confirm">{t('studio.done')}</Button>
              ) : (
                <Button variant="primary" className="sst-next" iconEnd={<ArrowRightIcon size={18} />} onClick={() => go(STEPS[idx + 1])}>
                  {t('studio.next')}
                </Button>
              )}
            </span>
          </>
        )}
      </footer>
    </>
  );
}
