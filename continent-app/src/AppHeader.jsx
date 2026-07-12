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

// Always-mounted top row: brand + account access. The Map/Trip planner/Day
// planner switch lives in BottomNav (a persistent bottom bar, all screen
// sizes) - this stays a slim header rather than duplicating the tabs here.
export function AppHeader({ user, onOpenAccount }) {
  return (
    <div className="app-header">
      <div className="app-header-brand">
        <Logo size={26} className="brand-mark" />
        <span className="app-header-name">Carta</span>
      </div>

      <div className="app-header-account">
        <AccountButton user={user} onOpenAccount={onOpenAccount} />
      </div>
    </div>
  );
}
