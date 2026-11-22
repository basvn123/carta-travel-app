import React from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/index.jsx';
import { IconButton, Button } from '../../components/ui/index.js';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';
import { useDialogExit } from '../../lib/motion.js';
import { useSettingsSheet, stepOf } from './settingsSheetStore.js';
import { useSettingsModel } from './settingsModel.js';
import { useMedia, useLiveStatus } from './settingsBits.jsx';
import { SettingsOverview } from './SettingsOverview.jsx';
import { StartStep } from './StartStep.jsx';
import { WhenStep } from './WhenStep.jsx';
import { WayStep, PricesStep } from './WayPricesSteps.jsx';
// The studio's tiles, tick and cost bar are this sheet's too.
import '../../styles/79-style-studio.css';
import '../../styles/81-settings.css';

/** From this width Settings docks beside the list instead of covering it
 *  (decision.md, APPROVED: "Settings docked beside the list"). */
export const DOCK_QUERY = '(min-width: 1100px)';

/**
 * Settings (G12, Explore top): the five inputs every price on Explore reads,
 * in the Style Studio's own look. An overview of exactly five rows (Start,
 * When, Getting there, Style, Prices shown); each row opens one question;
 * Back returns. The Style row is the one door out: it opens the Style
 * Studio over this sheet, and closing the studio lands back here.
 *
 * Mount it once (App or Explore); it draws nothing while closed:
 *
 *   <SettingsSheet />                     a phone sheet, a tablet dialog, a
 *                                         desktop panel fixed at the right
 *   <SettingsSheet dockTo={element} />    the desktop panel inside `element`
 *                                         (the map column), in the flow
 *
 * Every door opens it through the store: `openSettings({ step })` or
 * `useSettingsSheet().open({ step })`.
 *
 * Phone and tablet: a modal sheet (focus trapped, Escape closes). Desktop:
 * a non-modal labelled region beside the list, so the list stays in view and
 * its figures change as the traveller changes a setting; Escape closes it.
 * Every change applies at once (the model reprices); one polite status line
 * says "Prices updated", debounced, once per pause.
 */
export function SettingsSheet({ dockTo = null }) {
  const sheet = useSettingsSheet();
  if (!sheet.isOpen) return null;
  return <SettingsHost dockTo={dockTo} step={sheet.step} nonce={sheet.nonce} onClose={sheet.close} />;
}

function SettingsHost({ dockTo, step: openStep, nonce, onClose }) {
  const docked = useMedia(DOCK_QUERY);
  // The control that opened Settings, for focus on the way out.
  const [opener] = React.useState(() => (typeof document !== 'undefined' ? document.activeElement : null));
  const closeAndReturn = React.useCallback(() => {
    onClose();
    requestAnimationFrame(() => {
      const now = document.activeElement;
      if (now && now !== document.body && now.isConnected) return;
      if (opener?.isConnected && opener.getClientRects().length > 0) opener.focus();
    });
  }, [onClose, opener]);
  const exit = useDialogExit(closeAndReturn);

  // `dockTo` is an element or a ref to one.
  const dockEl = dockTo && 'current' in dockTo ? dockTo.current : dockTo;
  const inline = Boolean(docked && dockEl && dockEl.nodeType === 1);
  const panel = (
    <SettingsPanel key={docked ? 'dock' : 'sheet'} docked={docked} inline={inline} openStep={openStep} nonce={nonce}
      leaving={exit.leaving} onClose={exit.close} />
  );
  if (docked) return createPortal(panel, inline ? dockEl : document.body);
  return createPortal(
    <div
      className={`fsheet-scrim set-scrim${exit.leaving ? ' is-leaving' : ''}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) exit.close(); }}
    >
      {panel}
    </div>,
    document.body,
  );
}

function SettingsPanel({ docked, inline, openStep, nonce, leaving, onClose }) {
  const { t } = useI18n();
  const model = useSettingsModel();
  const [step, setStep] = React.useState(() => stepOf(openStep));
  const [dir, setDir] = React.useState(0);
  // The row a step belongs to, so Back puts focus on it, also when a chip
  // opened the step directly (flow-B m4).
  const [cameFrom, setCameFrom] = React.useState(() => (stepOf(openStep) === 'overview' ? '' : stepOf(openStep)));
  const panelRef = React.useRef(null);
  const titleRef = React.useRef(null);
  const status = useLiveStatus(t('settings.sheet.updated'));

  // A door pressed while Settings is open (a chip above the docked panel)
  // moves the sheet to its step, with focus on the step's title.
  const lastNonce = React.useRef(nonce);
  React.useEffect(() => {
    if (nonce === lastNonce.current) return;
    lastNonce.current = nonce;
    setDir(0);
    setCameFrom(stepOf(openStep) === 'overview' ? '' : stepOf(openStep));
    setStep(stepOf(openStep));
  }, [nonce, openStep]);

  // Phone and tablet: a modal, its focus trapped, Escape closes.
  useFocusTrap(panelRef, onClose, { initialFocusRef: titleRef, enabled: !docked, afterPaint: true });
  // Desktop: non-modal. Focus moves to the title on open and Escape closes
  // while focus is inside the panel; Tab leaves it into the page as usual.
  // preventScroll (G12, D10, lane 1 round 3): the title is in view, and a
  // focus that may scroll forces a layout of the whole Explore page (0.7 to
  // 0.8 s at 4x CPU on desktop).
  React.useEffect(() => {
    if (docked) titleRef.current?.focus({ preventScroll: true });
  }, [docked]);
  const onKeyDown = (e) => {
    if (docked && e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      onClose();
    }
  };
  // Escape with focus on the page or on the band's Settings button closes
  // the docked panel too: it is the one side panel open (flow-corners 1).
  React.useEffect(() => {
    if (!docked) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const at = document.activeElement;
      if (at && at !== document.body && !at.closest?.('.band-settings')) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [docked, onClose]);

  // A fixed docked panel covers the page's right edge: the page is told,
  // so Explore can keep its list clear of it (Lane 1 reads the class).
  // G12, D10 (lane 1, round 4): only the class. The panel's width is a
  // constant in CSS (--settings-dock-w, 85-explore-rails.css), because
  // writing it on the root each open restyled the whole desktop page (1 to
  // 1.5 s at 4x CPU), and measuring it here forced a layout first.
  React.useEffect(() => {
    if (!docked || inline) return undefined;
    const root = document.documentElement;
    root.classList.add('has-settings-dock');
    return () => { root.classList.remove('has-settings-dock'); };
  }, [docked, inline]);

  // The phone's keyboard shrinks the visual viewport, not the layout one;
  // the sheet follows it so the foot stays above the keys (Style Studio).
  React.useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const el = panelRef.current;
    if (!vv || !el || docked) return undefined;
    const fit = () => el.style.setProperty('--set-vvh', `${Math.round(vv.height)}px`);
    fit();
    vv.addEventListener('resize', fit);
    return () => vv.removeEventListener('resize', fit);
  }, [docked]);

  const go = (to) => {
    // Focus leaves the pressed row for the title first: removing a focused
    // row with the overview cost a second full style pass (about 1 s at 4x
    // CPU), and the title is where the step's effect puts focus anyway.
    titleRef.current?.focus({ preventScroll: true });
    setDir(1);
    setCameFrom(to);
    setStep(to);
  };
  const back = () => {
    setDir(-1);
    setStep('overview');
  };
  // The overview's Style row: the studio opens over this sheet; its own
  // close puts focus back on the row (StyleStudio returns to its opener).
  const openStyle = () => model.ts?.setOpen?.({ view: model.ts?.list?.length ? 'overview' : 'create' });

  // Every change from a step goes through here: the model reprices at
  // once, and the status line speaks once the changes pause.
  const changed = status.ping;

  const onStep = step !== 'overview';
  const titleId = 'set-title';
  const props = { model, onChange: changed };
  let body;
  if (step === 'start') body = <StartStep {...props} />;
  else if (step === 'when') body = <WhenStep {...props} />;
  else if (step === 'way') body = <WayStep {...props} />;
  else if (step === 'prices') body = <PricesStep {...props} />;
  else body = <SettingsOverview model={model} focusRow={cameFrom} onOpen={go} onStyle={openStyle} />;

  // A step that arrives takes focus on its question, so a screen reader
  // hears where it is; the overview gives focus to the row it came from.
  const firstStep = React.useRef(true);
  React.useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    if (step !== 'overview' && document.activeElement !== titleRef.current) titleRef.current?.focus({ preventScroll: true });
  }, [step]);

  const cls = [
    'set',
    docked ? 'set-dock' : 'fsheet set-sheet',
    inline ? 'is-inline' : '',
    onStep ? 'is-step' : 'is-overview',
    leaving ? 'is-leaving' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={panelRef}
      className={cls}
      role={docked ? 'region' : 'dialog'}
      aria-modal={docked ? undefined : 'true'}
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
    >
      <header className="set-head">
        {onStep && (
          <IconButton className="set-back" label={t('settings.sheet.backAria')} onClick={back}>
            <HouseIcon.back size={20} />
          </IconButton>
        )}
        <h2 className="set-title" id={titleId} ref={titleRef} tabIndex={-1}>
          {t(onStep ? `settings.sheet.q.${step}` : 'settings.sheet.title')}
        </h2>
        <IconButton className="set-close" label={t('settings.sheet.close')} onClick={onClose}>
          <HouseIcon.close size={18} />
        </IconButton>
      </header>

      <div className="set-body">
        <div key={step} className={`set-view${dir > 0 ? ' is-in-next' : dir < 0 ? ' is-in-back' : ''}`}>
          {body}
        </div>
      </div>

      <footer className="set-foot">
        {/* One polite live region for the whole sheet, mounted from the
            start so "Prices updated" is announced when it arrives. */}
        <p className="set-status" role="status">
          {status.text && (
            <span className="set-status-line">
              <span className="set-status-tick" aria-hidden="true"><HouseIcon.check size={12} /></span>
              {status.text}
            </span>
          )}
        </p>
        {/* Changes are already live: Done and Show places only close. */}
        {onStep ? (
          <Button variant="primary" className="set-done" onClick={onClose}>{t('settings.sheet.done')}</Button>
        ) : !docked ? (
          <Button variant="primary" className="set-done" onClick={onClose}>{t('settings.sheet.showPlaces')}</Button>
        ) : null}
      </footer>
    </div>
  );
}
