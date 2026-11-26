import React, { useEffect, useRef } from 'react';
import { useDialogExit } from '../lib/motion.js';
import { useI18n } from '../i18n/index.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { langFromPath, langRoot } from '../lib/langPath.js';
import { Blaze, Button } from './ui/index.js';
import { BrandMark, BrandWordmark } from './BrandMarks.jsx';
import '../styles/brand-pages.css';

/**
 * The 404 (house style G1, 2026-11): an address the app has no page for.
 * The empty state of the house style (DESIGN.md "States"): the dashed
 * blaze, the path not yet walked, at rest (no motion: it is not loading),
 * one line of what happened, one umber action and a quiet second one.
 * It lies over the app on the stone ground as a modal page: focus starts
 * on the heading, the trap keeps it inside, and "Open the map" puts the
 * address back to the app's root and shows the app that was always there.
 */
export function NotFoundPage({ onClose }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const headRef = useRef(null);
  const root = langRoot(langFromPath(typeof window !== 'undefined' ? window.location.pathname : '/'));
  useFocusTrap(ref, null, { initialFocusRef: headRef });

  useEffect(() => {
    const before = document.title;
    document.title = t('nf.title');
    return () => { document.title = before; };
  }, [t]);

  // The page lifts away on the kit's exit timing (--dur-2), then the app is
  // there; under reduced motion it goes at once (useDialogExit).
  const exit = useDialogExit(onClose);
  const toMap = () => {
    try { window.history.replaceState(null, '', `${root}${window.location.search}`); } catch { /* sandboxed */ }
    exit.close();
  };

  return (
    <div className={`hs-nf${exit.leaving ? ' is-leaving' : ''}`} ref={ref} role="dialog" aria-modal="true" aria-labelledby="hs-nf-title">
      {/* The wordmark slot, as in the header: the blaze and the name. */}
      <div className="hs-nf-mark"><BrandMark className="auth-brand-mark" /><span className="hs-nf-name"><BrandWordmark /></span></div>
      <div className="hs-nf-body">
        <Blaze size="xl" state="blank" className="hs-nf-blaze" />
        <h1 className="hs-nf-title" id="hs-nf-title" ref={headRef} tabIndex={-1}>{t('nf.title')}</h1>
        <p className="hs-nf-text">{t('nf.text')}</p>
        <div className="hs-nf-actions">
          <Button variant="primary" onClick={toMap}>{t('nf.map')}</Button>
          <Button variant="quiet" href={`${root}?tab=plan`}>{t('nf.plan')}</Button>
        </div>
      </div>
    </div>
  );
}
