import React from 'react';
import { useSiteConfig } from '../hooks/useSiteConfig.js';
import { useIsAdmin } from '../hooks/useIsAdmin.js';
import { useI18n } from '../i18n/index.jsx';
import Logo from './Logo.jsx';

// Closing the doors, from the admin panel, without a deploy.
//
// Two deliberate choices. Admins pass straight through, because locking
// yourself out of the tool that lifts the lock would be a poor design and
// somebody has to check the site actually works before reopening it. And the
// gate fails OPEN: if site_config cannot be read for any reason, the app
// renders normally rather than showing a maintenance screen nobody asked
// for. A wrongly closed shop is worse than a wrongly open one.
export function MaintenanceGate({ children }) {
  const { config, loading } = useSiteConfig();
  const { isAdmin } = useIsAdmin();
  const { t } = useI18n();

  const m = config.maintenance;
  const closed = !loading && m && m.enabled === true;

  if (!closed || isAdmin) {
    return (
      <>
        {closed && isAdmin && (
          <div className="maintenance-strip" role="status">
            {t('maintenance.adminNote')}
          </div>
        )}
        {children}
      </>
    );
  }

  return (
    <div className="maintenance">
      <div className="maintenance-card">
        <Logo />
        <h1 className="maintenance-title">{t('maintenance.title')}</h1>
        <p className="maintenance-body">
          {(typeof m.message === 'string' && m.message.trim()) || t('maintenance.body')}
        </p>
        <button type="button" className="maintenance-retry" onClick={() => window.location.reload()}>
          {t('maintenance.retry')}
        </button>
      </div>
    </div>
  );
}
