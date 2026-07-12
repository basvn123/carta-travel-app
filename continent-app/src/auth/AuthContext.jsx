import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, authConfigured } from '../lib/supabaseClient.js';

const AuthContext = createContext(null);

/**
 * Wraps the whole app. Tracks the Supabase session and exposes the handful
 * of auth actions the UI needs. When Supabase isn't configured (no env vars),
 * `configured` is false and everything else is inert - the app just runs
 * guest-only, as it always has.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(authConfigured);
  // True while the URL carries a password-recovery link, until the user sets
  // a new password - the app shows the "set new password" screen instead of
  // the normal UI during this window.
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    if (!authConfigured) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      setSession(next);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
    // If email confirmation is required, Supabase returns a user but no session.
    return { needsEmailConfirmation: !data.session };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
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

  const value = {
    configured: authConfigured,
    session,
    user: session?.user || null,
    loading,
    recoveryMode,
    exitRecoveryMode: () => setRecoveryMode(false),
    signUp,
    signIn,
    signOut,
    sendPasswordReset,
    updatePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
