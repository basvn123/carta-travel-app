import React from 'react';
import Logo from '../components/Logo.jsx';

/**
 * Full-screen entry gate shown on load whenever there's no active session and
 * the visitor hasn't already chosen to continue as a guest (App.jsx tracks
 * that choice in localStorage). Mirrors ResetPasswordScreen's solid-overlay
 * takeover so it reads as part of the same auth flow, not a separate page.
 */
export function AuthGate({ onSignIn, onSignUp, onGuest }) {
  return (
    <div className="auth-overlay auth-overlay-solid">
      <div className="auth-modal auth-gate">
        <div className="auth-brand auth-brand-center">
          <Logo size={34} />
          <span className="auth-brand-name">Carta</span>
        </div>

        <h2 className="auth-title auth-gate-title">Find your next trip</h2>
        <p className="auth-sub auth-gate-sub">
          Sign in to save trips and sync your settings across devices, or jump
          straight in without an account.
        </p>

        <div className="auth-gate-actions">
          <button type="button" className="auth-submit" onClick={onSignIn}>
            Sign in
          </button>
          <button type="button" className="auth-submit auth-submit-ghost" onClick={onSignUp}>
            Create an account
          </button>
        </div>

        <button type="button" className="auth-link auth-gate-guest" onClick={onGuest}>
          Continue without an account
        </button>
      </div>
    </div>
  );
}
