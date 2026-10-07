import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button } from '../components/Button.jsx';

/**
 * The install hint (owner call T362 on T246-d; carta-design, Components).
 *
 * One line with a secondary button, in My trips only. It shows on a phone
 * browser that is not already running the installed app, after the traveller
 * has saved a trip, and only where an install path exists: the browser's own
 * install prompt (Chromium) or, on iOS Safari, the Share sheet, which the
 * button explains in place because iOS has no prompt to call. Dismissed once,
 * it never returns. Never a modal, never on the first run, never a banner
 * over content: it is an ordinary row under the tabs.
 */
const DISMISS_KEY = 'carta.installHintDismissed.v1';

const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

function isStandalone() {
  if (typeof window === 'undefined') return false;
  if (window.navigator.standalone === true) return true;
  try { return window.matchMedia('(display-mode: standalone)').matches; } catch { return false; }
}

function isPhoneBrowser() {
  if (typeof window === 'undefined') return false;
  try { return window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches; } catch { return false; }
}

// iOS Safari has no install prompt; the Share sheet is the only way in.
function isIosSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

// The browser fires beforeinstallprompt once, early, usually before My trips
// is opened, so the listener is registered when this module loads (App imports
// SavedTripsPanel eagerly) and the panel reads what was kept.
let kept = null;
const listeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    kept = e;
    listeners.forEach((fn) => fn(e));
  });
  window.addEventListener('appinstalled', () => {
    safeSet(DISMISS_KEY, '1');
    kept = null;
    listeners.forEach((fn) => fn(null));
  });
}

export function InstallHint({ hasSavedTrip }) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(() => safeGet(DISMISS_KEY) === '1');
  const [deferred, setDeferred] = useState(kept);
  const [showHow, setShowHow] = useState(false);

  useEffect(() => {
    const onChange = (e) => { setDeferred(e); if (!e) setDismissed(true); };
    listeners.add(onChange);
    return () => { listeners.delete(onChange); };
  }, []);

  if (dismissed || !hasSavedTrip || isStandalone() || !isPhoneBrowser()) return null;
  const ios = isIosSafari();
  if (!deferred && !ios) return null;

  const dismiss = () => { safeSet(DISMISS_KEY, '1'); setDismissed(true); };
  const add = async () => {
    if (deferred) {
      try {
        deferred.prompt();
        await deferred.userChoice;
      } catch { /* the browser refused; the hint stays until dismissed */ }
      kept = null;
      setDeferred(null);
      return;
    }
    setShowHow(true);
  };

  return (
    <div className="install-hint" role="region" aria-label={t('install.add')}>
      <p className="install-hint-text">{showHow ? t('install.ios') : t('install.hint')}</p>
      <div className="install-hint-actions">
        {!showHow && <Button size="sm" onClick={add}>{t('install.add')}</Button>}
        <button type="button" className="install-hint-x" onClick={dismiss} aria-label={t('install.dismiss')}>x</button>
      </div>
    </div>
  );
}
