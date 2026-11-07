import './lib/pathBoot.js';
// T1122: keep a ?cc=umber cost card preview before the address is rewritten.
import './planner/trip/costCardVariant.js';
import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { I18nProvider } from './i18n/index.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { installAffiliateClickCounter } from './lib/launchEvents.js';
import { trackChannelVisit } from './lib/channelCounts.js';
import { installTouchFeedback } from './lib/touchFeedback.js';
import { installErrorReporting } from './lib/errorReporter.js';
import { registerServiceWorker } from './pwa/registerServiceWorker.js';
import './styles.css';

// One document listener counts clicks on decorated partner links, by the
// sub-ID they already carry (migration 048, T215-c). Nothing is stored on
// the device.
installAffiliateClickCounter();
trackChannelVisit();
installTouchFeedback();
// Error tracking (T1120): a no-op until VITE_ERROR_DSN is set.
installErrorReporting();

// T1000: a tab left open across a deploy asks for chunks the new deploy no
// longer serves. Vite fires vite:preloadError when a JS or CSS chunk will not
// load (a CSS failure says "Unable to preload CSS", which the crash panel's
// stale-bundle test did not know). Reload for the fresh build instead of
// showing "This page stopped working"; at most once a minute, so a chunk
// that is really broken still reaches the panel rather than a reload loop.
const PRELOAD_RELOAD_KEY = 'continent.preloadReloadAt.v1';
window.addEventListener('vite:preloadError', (event) => {
  let last = 0;
  try { last = Number(window.sessionStorage.getItem(PRELOAD_RELOAD_KEY)) || 0; } catch { /* storage blocked */ }
  if (Date.now() - last < 60000) return;
  try { window.sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(Date.now())); } catch { /* storage blocked */ }
  event.preventDefault();
  window.location.reload();
});

// ?styleguide opens the design system page (T424, roadmap 1.2) instead of the
// app: lazy, with its own stylesheet, so the app's first paint carries none of it.
// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
const StyleGuide = lazy(() => import('./styleguide/StyleGuide.jsx'));
const showStyleGuide = new URLSearchParams(window.location.search).has('styleguide');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {showStyleGuide ? (
        <I18nProvider>
          <Suspense fallback={null}><StyleGuide /></Suspense>
        </I18nProvider>
      ) : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);

// Register the service worker so the app is installable and works offline
// (src/pwa/registerServiceWorker.js; production only).
registerServiceWorker();
