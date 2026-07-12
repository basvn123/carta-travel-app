import React from 'react';
import Logo from './Logo.jsx';
import { PersonIcon } from './Icons.jsx';

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

// Always-mounted top panel: brand (desktop-only) on the left, the Map tab's
// filters in the middle, and account access on the right - a single row, not a
// separate header stacked above the filter bar. The Map/Trip planner/Day
// planner switch lives in BottomNav (a persistent bottom bar, all screen
// sizes). `children` is the FilterBar, injected only on the Map tab.
export function AppHeader({ user, onOpenAccount, children }) {
  return (
    <div className={`app-header ${children ? 'has-filters' : ''}`}>
      <div className="app-header-brand">
        <Logo size={26} className="brand-mark" />
        <span className="app-header-name">Carta</span>
      </div>

      {children && <div className="app-header-filters">{children}</div>}

      <div className="app-header-account">
        <AccountButton user={user} onOpenAccount={onOpenAccount} />
      </div>
    </div>
  );
}
