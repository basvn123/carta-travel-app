// Harness for scripts/verify_ai_page.mjs (T1156): mounts the page the app
// opens at /?legal=ai, and the footer that links to it, without the
// catalogue, so the check runs where the data host is out of reach. Uses the
// same LegalFromUrl, I18nProvider and styles as src/main.jsx.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nProvider } from '../../src/i18n/index.jsx';
import { LegalFromUrl } from '../../src/components/LegalFromUrl.jsx';
import { SiteFooter } from '../../src/components/SiteFooter.jsx';
import '../../src/styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <I18nProvider>
    <LegalFromUrl />
    <SiteFooter />
  </I18nProvider>,
);
