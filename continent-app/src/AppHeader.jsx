import React from 'react';
import Logo from './Logo.jsx';
import { PersonIcon } from './Icons.jsx';

export const APP_TABS = [
  { key: 'map', label: 'Map' },
  { key: 'trip', label: 'Trip planner' },
  { key: 'day', label: 'Day planner' },
];

function AccountButton({ user, onOpenAccount }) {
  const fullName = user?.user_metadata?.full_name?.trim();
  const initial = (fullName || user?.email || '?')[0].toUpperCase();
  return (
    <button
      className="account-avatar-btn"
      onClick={onOpenAccount}
      title={user ? (fullName || user.email) : 'Account & preferences'}
    >
      <span className="account-avatar">
        {user ? initial : <PersonIcon size={14} />}
      </span>
      <span className="account-avatar-label">Account</span>
    </button>
  );
}

// Always-mounted top row: brand, the Map/Trip planner/Day planner switch, and
// account access - present no matter which tab is active, since FilterBar
// (Map-only) is no longer where the account button lives.
export function AppHeader({ activeTab, onChangeTab, user, onOpenAccount }) {
  return (
    <div className="app-header">
      <div className="app-header-brand">
        <Logo size={26} className="brand-mark" />
        <span className="app-header-name">Carta</span>
      </div>

      <div className="tabs app-tabs" role="tablist" aria-label="Sections">
        {APP_TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={activeTab === t.key}
            className={`tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => onChangeTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="app-header-account">
        <AccountButton user={user} onOpenAccount={onOpenAccount} />
      </div>
    </div>
  );
}
