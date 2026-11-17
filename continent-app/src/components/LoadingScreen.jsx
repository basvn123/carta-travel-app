/*
 * LoadingScreen (G5, HANDBOOK "Opening screen"): what the app shows while it
 * waits on the session or the travel data. The opening screen itself is the
 * static #boot-splash in index.html (src/lib/bootSplash.js runs it); this
 * component only holds it up while mounted, hands it the words in the
 * reader's language, and lets it lift when it unmounts.
 *
 * If the page has no #boot-splash (an index.html cached from before it), it
 * draws the same screen itself, at rest, from the same classes.
 */
import React, { useLayoutEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { holdBootSplash, releaseBootSplash, setBootSplashWords } from '../lib/bootSplash.js';

export default function LoadingScreen() {
  const { t, lang } = useI18n();
  const [hasSplash] = useState(() => typeof document !== 'undefined' && !!document.getElementById('boot-splash'));
  const tagline = t('shell.tagline');
  const slow = t('shell.slowLoad');

  // Layout effects run before the root's settle (a passive effect), so the
  // splash is held before anything could lift it.
  useLayoutEffect(() => {
    if (!hasSplash) return undefined;
    holdBootSplash();
    return releaseBootSplash;
  }, [hasSplash]);

  useLayoutEffect(() => {
    if (hasSplash) setBootSplashWords({ tagline, slow, lang });
  }, [hasSplash, tagline, slow, lang]);

  if (hasSplash) return null;
  return (
    <div className="boot-splash no-intro" data-state="held" aria-busy="true">
      <div className="boot-stack">
        <span className="boot-blaze" aria-hidden="true"><i className="boot-paint" /><i className="boot-heel" /></span>
        <div className="boot-name">Carta</div>
        <div className="boot-tag">{tagline}</div>
        <span className="hs-wait" aria-hidden="true">
          <span className="hs-blaze blaze-sm" /><span className="hs-blaze blaze-sm" /><span className="hs-blaze blaze-sm" />
        </span>
      </div>
    </div>
  );
}
