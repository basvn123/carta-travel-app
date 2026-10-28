import React from 'react';
import { createPortal } from 'react-dom';
import { Button, Field, IconButton } from '../components/ui/index.js';
import { CloseIcon, SparkIcon } from '../components/Icons.jsx';
import { LoadingBlock } from '../components/StateBlocks.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { useDialogExit } from '../lib/motion.js';
import { openAskChat } from './ask/askChatStore.js';
import '../styles/84-explore-overview.css';

// T764: the taste profile's four questions load with the path, not with Explore.
const TasteSteps = React.lazy(() => import('./TasteSheet.jsx').then((m) => ({ default: m.TasteSteps })));

/**
 * The start dialog (T585, owner reference "Tell me what matters most"): the
 * first time Explore opens on a wide screen, one question in the traveller's
 * own words, which goes to Ask Carta, and the four settings the prices hang
 * on (From, Where to, When, Who), each showing its value and opening its own
 * part of the settings line. "Show places" closes it. Since T595 it opens on
 * the first visit only; Ask Carta's field on the overview is the way back in.
 *
 * Shown once per device (localStorage, in try/catch), and never when the
 * address already carries a view (a shared link, a filter) or the browser is
 * driven by a script (navigator.webdriver: the verify harnesses and the end
 * check would find a dialog over every screen).
 *
 * T764 (rating v5, "Tell Carta what you like"): from 1024 px the dialog
 * gains a door to the taste profile's four questions. Below 1024 px, where
 * T585 showed nothing, a first visit with no taste set opens straight on
 * those questions (mode 'taste'), with Skip one tap on every screen.
 */
export const START_KEY = 'carta.exploreStart.v1';

const WIDE = '(min-width: 1024px)';

/** 'home' (the T585 dialog), 'taste' (straight to the four questions) or null (no dialog). */
export function startMode({ tasteEmpty = true } = {}) {
  if (typeof window === 'undefined') return null;
  try {
    if (navigator.webdriver) return null;
    const q = new URLSearchParams(window.location.search);
    for (const k of q.keys()) if (k.startsWith('x')) return null;
    if (window.location.hash) return null;
    if (window.localStorage.getItem(START_KEY) === '1') return null;
    if (window.matchMedia(WIDE).matches) return 'home';
    return tasteEmpty ? 'taste' : null;
  } catch {
    return null;
  }
}

export function shouldOpenStart(opts) {
  return startMode(opts) != null;
}

export function markStartSeen() {
  try { window.localStorage.setItem(START_KEY, '1'); } catch { /* storage unavailable */ }
}

// The settings line's parts this dialog offers, in the reference's order.
const ROWS = [
  { part: 'origin', labelKey: 'settings.from' },
  { part: 'countries', labelKey: 'explore.startWhere' },
  { part: 'dates', labelKey: 'dates.when' },
  { part: 'party', labelKey: 'explore.startWho' },
];

// The part's button on the settings line, and the value it shows now.
function partButton(part) {
  return document.querySelector(`.settings-line .settings-part-${part}`);
}

export function StartDialog({ t, onClose, mode: firstMode = 'home' }) {
  const panelRef = React.useRef(null);
  const fieldRef = React.useRef(null);
  const after = React.useRef(null);
  const [text, setText] = React.useState('');
  const [mode, setMode] = React.useState(firstMode);
  const exit = useDialogExit(onClose);
  // Whatever a row or the primary asked for runs once the dialog has gone
  // and the focus trap has handed focus back, so the part's own popover
  // (or the chat) keeps the focus it takes.
  React.useEffect(() => () => {
    const f = after.current;
    if (f) setTimeout(f, 0);
  }, []);
  useFocusTrap(panelRef, exit.close, { initialFocusRef: firstMode === 'home' ? fieldRef : null });
  const rows = React.useMemo(() => ROWS.map((r) => {
    const btn = partButton(r.part);
    const value = btn?.querySelector('.settings-part-value')?.textContent?.trim() || '';
    return btn ? { ...r, value } : null;
  }).filter(Boolean), []);
  const openPart = (part) => {
    after.current = () => partButton(part)?.click();
    exit.close();
  };
  const show = () => {
    const q = text.trim();
    if (q) after.current = () => openAskChat(null, { text: q, n: Date.now() });
    exit.close();
  };
  return createPortal(
    <div className={`xstart-scrim${exit.leaving ? ' is-leaving' : ''}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) exit.close(); }}>
      <div className={`xstart${mode === 'taste' ? ' is-taste' : ''}${exit.leaving ? ' is-leaving' : ''}`} ref={panelRef}
        role="dialog" aria-modal="true" aria-labelledby="xstart-title">
        <IconButton className="xstart-close" tone="plain" label={t('a11y.close')} onClick={exit.close}>
          <CloseIcon size={16} />
        </IconButton>
        {mode === 'taste' ? (
          <React.Suspense fallback={<LoadingBlock label={t('state.loading')} rows={4} />}>
            <TasteSteps mode="start" onFinish={exit.close} titleId="xstart-title" />
          </React.Suspense>
        ) : (
          <>
            <span className="xstart-icon" aria-hidden="true"><SparkIcon size={24} /></span>
            <h2 className="xstart-title" id="xstart-title">{t('explore.startTitle')}</h2>
            <Field ref={fieldRef} as="textarea" className="xstart-field" label={t('explore.startField')}
              value={text} maxLength={500} rows={3} onChange={(e) => setText(e.target.value)} />
            <Button variant="secondary" block className="xstart-taste" iconStart={<SparkIcon size={20} />}
              onClick={() => setMode('taste')}>
              {t('taste.chipEmpty')}
            </Button>
            {rows.length > 0 && (
              <>
                <p className="xstart-lead">{t('explore.startDetails')}</p>
                <div className="xstart-rows">
                  {rows.map((r) => (
                    <Button key={r.part} variant="secondary" block className="xstart-row"
                      aria-haspopup="dialog"
                      aria-label={t('settings.changeAria', { label: t(r.labelKey), value: r.value })}
                      onClick={() => openPart(r.part)}>
                      <span className="xstart-row-label">{t(r.labelKey)}</span>
                      <span className="xstart-row-value">{r.value}</span>
                    </Button>
                  ))}
                </div>
              </>
            )}
            <div className="xstart-foot">
              <Button variant="primary" onClick={show}>{t('explore.startGo')}</Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
