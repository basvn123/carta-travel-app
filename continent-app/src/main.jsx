import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Register the service worker so the app is installable and works offline.
// Dev (vite) serves from /src without the built SW, so only register in prod.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // A new worker (skipWaiting + clients.claim in sw.js) takes the page over
  // while it is open; one reload then serves everything from the new cache.
  // Only when a controller is being REPLACED: the first install of all has
  // no previous controller and must not reload the page it just loaded.
  let reloading = false;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
