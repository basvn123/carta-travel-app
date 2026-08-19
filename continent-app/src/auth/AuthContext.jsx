import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, authConfigured } from '../lib/supabaseClient.js';

const AuthContext = createContext(null);

// Supabase's email links land back on the app with `#...&type=signup` (or
// `type=recovery`, handled separately below) in the URL hash. Read it once,
// synchronously, before supabase-js's async session hydration has a chance
// to strip the hash, that's how we tell "just clicked the confirmation
// link" apart from an ordinary reload with an existing session.
function initialUrlAuthType() {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  return new URLSearchParams(hash.replace(/^#/, '')).get('type');
}

/**
 * Does this account have a password at all?
 *
 * Somebody who only ever pressed "Continue with Google" has no password to
 * confirm and no password to change, so the account panel must not ask for
 * one. Supabase reports the linked identities three different ways depending
 * on how the session was hydrated, hence the ladder; when none of them are
 * present we assume there IS a password, because hiding the current-password
 * field on a guess would remove the check this whole flow exists to add.
 */
export function hasPasswordIdentity(user) {
  if (!user) return false;
  const ids = user.identities;
  if (Array.isArray(ids) && ids.length) return ids.some((i) => i.provider === 'email');
  const meta = user.app_metadata || {};
  if (Array.isArray(meta.providers) && meta.providers.length) return meta.providers.includes('email');
  if (meta.provider) return meta.provider === 'email';
  return true;
}

/**
 * Wraps the whole app. Tracks the Supabase session and exposes the handful
 * of auth actions the UI needs. When Supabase isn't configured (no env vars),
 * `configured` is false and everything else is inert, the app just runs
 * guest-only, as it always has.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(authConfigured);
  // True while the URL carries a password-recovery link, until the user sets
  // a new password, the app shows the "set new password" screen instead of
  // the normal UI during this window.
  const [recoveryMode, setRecoveryMode] = useState(false);
  // True right after landing here from an email-confirmation link, until the
  // "you're verified" toast auto-dismisses.
  const [emailConfirmed, setEmailConfirmed] = useState(() => initialUrlAuthType() === 'signup');

  useEffect(() => {
    if (!emailConfirmed) return;
    const t = setTimeout(() => setEmailConfirmed(false), 6000);
    return () => clearTimeout(t);
  }, [emailConfirmed]);

  useEffect(() => {
    if (!authConfigured) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    }).catch(() => {
      // Network/config failure: fall back to guest mode rather than hanging
      // forever behind the full-screen loading gate.
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      setSession(next);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
    if (error) throw error;
    // If email confirmation is required, Supabase returns a user but no session.
    return { needsEmailConfirmation: !data.session };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  // Google OAuth through Supabase: redirects to Google and back to the app,
  // where onAuthStateChange picks up the new session. Requires the Google
  // provider (client id + secret) to be enabled in the Supabase dashboard.
  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  /**
   * Sign out everywhere except here.
   *
   * Changing a password is the moment somebody remembers the laptop they lent
   * out, so the form offers this alongside it. Supabase's 'others' scope
   * revokes every other refresh token for the user and leaves the current
   * session alone, which is exactly the promise the checkbox makes: the device
   * you are typing on stays signed in.
   */
  const signOutOtherDevices = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    if (error) throw error;
  }, []);

  const sendPasswordReset = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    setRecoveryMode(false);
  }, []);

  /**
   * Prove the person at the keyboard is the account holder, by signing in
   * again with the password they claim to have.
   *
   * An access token alone is not proof of that: a session left open on an
   * unlocked phone is enough to reach this panel. So anything that would lock
   * the real owner out (changing the password, deleting the account) goes
   * through here first. Supabase has no dedicated verify endpoint, and
   * signInWithPassword against the current email is the standard stand-in; it
   * returns a fresh session for the same user, which also satisfies the
   * "recent login" requirement when secure password change is switched on.
   */
  const reauthenticate = useCallback(async (password) => {
    const email = session?.user?.email;
    if (!email) throw new Error('This account has no email address to verify against.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, [session]);

  /**
   * Edit the name and email on the account.
   *
   * Supabase does NOT switch the address on request: it mails a confirmation
   * link to the new one and keeps the old address live until it is clicked.
   * `emailPending` reports that, so the UI can say what will happen rather
   * than claiming a change that has not landed yet.
   */
  const updateProfile = useCallback(async ({ fullName, email }) => {
    const attrs = {};
    if (fullName !== undefined) attrs.data = { full_name: fullName };
    if (email !== undefined) attrs.email = email;
    if (!Object.keys(attrs).length) return { emailPending: false };
    const { data, error } = await supabase.auth.updateUser(attrs, {
      emailRedirectTo: window.location.origin,
    });
    if (error) throw error;
    const emailPending = email !== undefined
      && (data?.user?.email || '').toLowerCase() !== email.toLowerCase();
    return { emailPending };
  }, []);

  // In-app account deletion (App Store guideline 5.1.1(v)): a SECURITY
  // DEFINER Postgres function `delete_user()` removes the auth user and every
  // row they own (see supabase/migrations/005_delete_user.sql). The anon
  // client can't delete auth users itself, so the RPC is the whole mechanism.
  const deleteAccount = useCallback(async () => {
    const { error } = await supabase.rpc('delete_user');
    if (error) throw error;
    await supabase.auth.signOut();
  }, []);

  const value = {
    configured: authConfigured,
    session,
    user: session?.user || null,
    hasPassword: hasPasswordIdentity(session?.user || null),
    loading,
    recoveryMode,
    exitRecoveryMode: () => setRecoveryMode(false),
    emailConfirmed,
    dismissEmailConfirmed: () => setEmailConfirmed(false),
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    signOutOtherDevices,
    sendPasswordReset,
    updatePassword,
    reauthenticate,
    updateProfile,
    deleteAccount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
