import React from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/index.jsx';
import { useFirstRun } from '../lib/firstRunContext.js';
import { Button, Chip, ChoiceRows, IconButton, Segmented, Switch } from '../components/ui/index.js';
import { CloseIcon } from '../components/Icons.jsx';
import { SheetShell } from './SheetShell.jsx';
import { LikeTiles, partyKindOptions } from '../planner/flow/setupScreens.jsx';
import { PROFILE_LABEL_KEYS } from './LifestylePanel.jsx';
import { PROFILES } from '../lib/lifestyleProfiles.js';
import {
  SIZES, lifestyleKey, normalizeTaste, recordAsked, setTasteAnswer, toggleLike,
} from '../lib/taste.js';
import '../styles/84-explore-overview.css';

/*
 * The taste profile's four questions (T764, rating v5 Layer 3): who usually
 * comes, what you go for, where you like to stay and how you travel. One
 * component, TasteSteps, is drawn by the Explore start dialog's "Tell Carta
 * what you like" path (StartDialog.jsx) and by TasteSheet, the sheet the
 * doors in TasteDoor.jsx open (Account, Lifestyle, Filters, plan setup, a
 * place page; T947 took the Explore header chip away).
 *
 * Every tap writes choices.taste at once (through FirstRunContext, so it
 * rides urlState and the account like every other choice); closing at any
 * point keeps what was answered and leaves the rest null, which is "No
 * preference". The rows and tiles are the planner's own: the Who rows
 * (partyKindOptions) and the like tiles with their photographs (LikeTiles).
 */

const NONE = 'none';
export const TASTE_STEPS = 4;

// The Lifestyle presets' glyphs, by their Icons.jsx names (the same glyphs
// LifestylePanel's PROFILE_ICONS draws), because ChoiceRows takes names.
const PRESET_ICONS = {
  Backpacker: 'BackpackIcon',
  Easygoing: 'LeafIcon',
  Foodie: 'DiningIcon',
  'Cafe & culture': 'CoffeeIcon',
  Nightlife: 'MusicIcon',
  Family: 'FriendsIcon',
};

/** The traveller's taste and the writers for it. */
export function useTaste() {
  const ctx = useFirstRun();
  const setChoices = ctx?.setChoices;
  const taste = normalizeTaste(ctx?.choices?.taste);
  const update = React.useCallback((fn) => {
    setChoices?.((prev) => ({ ...prev, taste: normalizeTaste(fn(normalizeTaste(prev.taste))) }));
  }, [setChoices]);
  // A preset is also the Lifestyle every price reads (carta-design: one
  // Lifestyle control, the same choices.lifestyle); No preference leaves the
  // prices as they are.
  const pickPreset = React.useCallback((name) => {
    setChoices?.((prev) => ({
      ...prev,
      taste: setTasteAnswer(prev.taste, 'lifestyle', name ? lifestyleKey(name) : null),
      ...(name && PROFILES[name] ? { lifestyle: { ...PROFILES[name] } } : {}),
    }));
  }, [setChoices]);
  return { taste, update, pickPreset, ready: !!setChoices };
}

function WhoStep({ taste, update, t }) {
  return (
    <ChoiceRows
      label={t('taste.q.party')}
      options={[...partyKindOptions(t), { value: NONE, icon: null, label: t('taste.noPref') }]}
      value={[taste.party || NONE]}
      onPick={(v) => update((cur) => setTasteAnswer(cur, 'party', v === NONE ? null : v))}
    />
  );
}

function LikesStep({ taste, update, t }) {
  const none = taste.likes.length === 0;
  return (
    <>
      <div className="taste-row">
        <p className="taste-help">{t('pf.q.likesHelp')}</p>
        <Chip kind="filter" selected={none} onClick={() => update((cur) => setTasteAnswer(cur, 'likes', []))}>
          {t('taste.noPref')}
        </Chip>
      </div>
      <LikeTiles picked={taste.likes} onToggle={(k) => update((cur) => toggleLike(cur, k))} />
    </>
  );
}

function StayStep({ taste, update, t }) {
  return (
    <>
      <div className="taste-group">
        <p className="taste-label" aria-hidden="true">{t('taste.q.size')}</p>
        <ChoiceRows
          label={t('taste.q.size')}
          options={[...SIZES.map((s) => ({ value: s, icon: null, label: t(`taste.opt.${s}`) })), { value: NONE, icon: null, label: t('taste.noPref') }]}
          value={[taste.size || NONE]}
          onPick={(v) => update((cur) => setTasteAnswer(cur, 'size', v === NONE ? null : v))}
        />
      </div>
      <div className="taste-group">
        <p className="taste-label" aria-hidden="true">{t('taste.q.quiet')}</p>
        <Segmented
          block
          label={t('taste.q.quiet')}
          value={taste.quiet || NONE}
          onChange={(v) => update((cur) => setTasteAnswer(cur, 'quiet', v === NONE ? null : v))}
          options={[
            { value: NONE, label: t('taste.noPref') },
            { value: 'quiet', label: t('taste.opt.quiet') },
            { value: 'lively', label: t('taste.opt.lively') },
          ]}
        />
      </div>
    </>
  );
}

function TravelStep({ taste, update, pickPreset, t }) {
  const names = Object.keys(PROFILES);
  const picked = names.find((n) => lifestyleKey(n) === taste.lifestyle) || NONE;
  return (
    <>
      <ChoiceRows
        label={t('taste.q.travel')}
        options={[
          ...names.map((n) => ({ value: n, icon: PRESET_ICONS[n] || null, label: PROFILE_LABEL_KEYS[n] ? t(PROFILE_LABEL_KEYS[n]) : n })),
          { value: NONE, icon: null, label: t('taste.noPref') },
        ]}
        value={[picked]}
        onPick={(v) => pickPreset(v === NONE ? null : v)}
      />
      <Switch
        label={t('taste.noCar')}
        hint={t('taste.noCarHint')}
        checked={taste.noCar === true}
        onChange={(on) => update((cur) => setTasteAnswer(cur, 'noCar', on ? true : null))}
      />
    </>
  );
}

const STEPS = [
  { key: 'party', q: 'taste.q.party', Body: WhoStep },
  { key: 'likes', q: 'taste.q.likes', Body: LikesStep },
  { key: 'stay', q: 'taste.q.stay', Body: StayStep },
  { key: 'travel', q: 'taste.q.travel', Body: TravelStep },
];

/**
 * The four questions, one at a time. `mode` 'start' (the start dialog) puts
 * Skip in the foot, one tap that leaves with what is answered so far; 'sheet'
 * (the chip and Account) puts Back there instead, since the sheet's close
 * already leaves. `titleId` names the question for the dialog's label.
 */
export function TasteSteps({ mode = 'sheet', onFinish, titleId = 'taste-q', TitleTag = 'h2' }) {
  const { t } = useI18n();
  const { taste, update, pickPreset } = useTaste();
  const [step, setStep] = React.useState(0);
  const headRef = React.useRef(null);
  const last = step === STEPS.length - 1;
  const { q, Body, key } = STEPS[step];
  const go = (n) => {
    setStep(n);
    // The next question takes the focus, so a screen reader hears it and the
    // keyboard starts at the top of the new screen.
    requestAnimationFrame(() => headRef.current?.focus({ preventScroll: false }));
  };
  return (
    <div className={`taste-steps is-${mode}`} data-step={key}>
      <div className="taste-head">
        <p className="taste-pos">{t('taste.step', { n: step + 1, total: STEPS.length })}</p>
        <TitleTag className="taste-q" id={titleId} tabIndex={-1} ref={headRef}>{t(q)}</TitleTag>
      </div>
      <div className="taste-body">
        <Body taste={taste} update={update} pickPreset={pickPreset} t={t} />
      </div>
      <div className="taste-foot">
        {mode === 'start' ? (
          <Button variant="quiet" className="taste-skip" onClick={onFinish}>{t('taste.skip')}</Button>
        ) : step > 0 ? (
          <Button variant="secondary" className="taste-back" onClick={() => go(step - 1)}>{t('taste.back')}</Button>
        ) : <span />}
        <Button variant="primary" className="taste-next" onClick={() => (last ? onFinish?.() : go(step + 1))}>
          {last ? t('taste.done') : t('taste.next')}
        </Button>
      </div>
    </div>
  );
}

/** The same four questions as a sheet: the Explore header chip and Account's "Your travel style". */
export function TasteSheet({ onClose, anchorRef = null }) {
  const { t } = useI18n();
  return (
    <SheetShell title={t('taste.title')} onClose={onClose} anchorRef={anchorRef} width={560}
      className="taste-sheet" labelId="taste-sheet-title" closeLabel={t('a11y.close')}>
      <TasteSteps mode="sheet" onFinish={onClose} titleId="taste-sheet-q" TitleTag="h3" />
    </SheetShell>
  );
}

/**
 * The learning question (rating v5 plan, "only with consent"): asked once,
 * after a save, when five saved places share a facet the traveller did not
 * pick. In the shell's one bottom slot, the Undo toast's pattern. Yes adds
 * the facet; No, or the close, records the answer, so it is never asked again.
 */
export function TasteLearnPrompt({ facet, onDone }) {
  const { t } = useI18n();
  const { update } = useTaste();
  const answer = (yes) => {
    update((cur) => recordAsked(cur, facet, yes));
    onDone?.();
  };
  const node = (
    <div className="undo-toast taste-learn" role="status">
      <span className="taste-learn-text">{t(`taste.learn.${facet}`)}</span>
      <Button size="sm" variant="secondary" className="taste-learn-yes" onClick={() => answer(true)}>{t('taste.learnYes')}</Button>
      <Button size="sm" variant="quiet" className="taste-learn-no" onClick={() => answer(false)}>{t('taste.learnNo')}</Button>
      <IconButton label={t('a11y.close')} onClick={() => answer(false)}><CloseIcon size={16} /></IconButton>
    </div>
  );
  const slot = typeof document !== 'undefined' ? document.querySelector('.bottom-slot') : null;
  return slot ? createPortal(node, slot) : node;
}

export default TasteSheet;
