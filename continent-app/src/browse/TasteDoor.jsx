import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useFirstRun } from '../lib/firstRunContext.js';
import { tasteListText } from '../lib/taste.js';
import { Button } from '../components/ui/index.js';
import { durationMs } from '../lib/motion.js';
import { ChevronRightIcon, SparkIcon } from '../components/Icons.jsx';
import '../styles/84-explore-overview.css';
import { useSettings } from '../components/SettingsLine.jsx';
import { styleName } from './TravelStylesSheet.jsx';

/*
 * The doors to "Your travel style" (T947, the owner: "make sure across the
 * app this is shown in the necessary settings so people know that this
 * exists"). One sheet, TasteSheet, opened from wherever travel settings are
 * edited: Account's Your travel, the Lifestyle panel, Explore's Filters, the
 * plan setup's lifestyle question, and a place page's match line while no
 * taste is set. Every door calls openTasteSheet(); App mounts the one
 * TasteSheetHost, so the sheet is never drawn inside another sheet and a
 * door inside a dialog closes that dialog first.
 */

const EVENT = 'carta:taste-open';
const TasteSheet = React.lazy(() => import('./TasteSheet.jsx').then((m) => ({ default: m.TasteSheet })));

/** Opens the one TasteSheet; focus returns to `opener` when it closes. */
// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
export function openTasteSheet(opener = null) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { opener } }));
}

/** Mounted once in App, inside the choices context the sheet writes to.
 *  Since the travel styles (lib/travelStyles.js, 2026-11-12) the taste is the
 *  active style's explore half, so every door opens Travel styles on that
 *  half; the four-question sheet stays only where no styles exist (a host
 *  outside the app shell). */
export function TasteSheetHost() {
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef(null);
  const ts = useSettings()?.travelStyles;
  const tsRef = React.useRef(ts);
  tsRef.current = ts;
  React.useEffect(() => {
    const on = (e) => {
      if (tsRef.current) { tsRef.current.setOpen('explore'); return; }
      const el = e.detail?.opener || (typeof document !== 'undefined' ? document.activeElement : null);
      anchorRef.current = el && el !== document.body ? el : null;
      setOpen(true);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  if (!open) return null;
  const close = () => {
    setOpen(false);
    const el = anchorRef.current;
    if (el?.isConnected) el.focus?.();
  };
  return (
    <React.Suspense fallback={null}>
      <TasteSheet onClose={close} anchorRef={anchorRef} />
    </React.Suspense>
  );
}

/**
 * The row: "Your travel style" and what is set ("hiking, villages") or
 * "Not set yet". `before` runs first (a dialog closing itself).
 */
export function TasteRow({ className = '', before }) {
  const { t } = useI18n();
  const firstRun = useFirstRun();
  const style = useSettings()?.travelStyles?.active;
  if (!firstRun?.setChoices) return null;
  const value = style ? styleName(t, style) : tasteListText(firstRun.choices?.taste, t);
  return (
    <Button
      variant="quiet"
      block
      className={`taste-door ${className}`.trim()}
      aria-haspopup="dialog"
      onClick={(e) => {
        if (!before) { openTasteSheet(e.currentTarget); return; }
        // A dialog closes first and hands focus back to its opener; the
        // sheet opens once it has gone, and returns focus there.
        before();
        setTimeout(() => openTasteSheet(null), durationMs('--dur-3') + 40);
      }}
    >
      <SparkIcon size={20} className="taste-door-icon" />
      <span className="taste-door-label">{t('taste.title')}</span>
      <span className={`taste-door-v${value ? '' : ' is-unset'}`}>{value || t('taste.notSet')}</span>
      <ChevronRightIcon size={16} className="taste-door-chev" />
    </Button>
  );
}
