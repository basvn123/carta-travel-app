/**
 * useIsAdmin, the client's read of whether the staff door should render.
 *
 * This is a HINT, never a gate. Membership lives in public.admin_users, a
 * table the client cannot read or write, and every admin_* RPC re-checks it
 * on the server. The worst a wrong answer here can do is show a menu row
 * whose every action comes back "forbidden".
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, authConfigured } from '../lib/supabaseClient.js';
import { useAuth } from '../auth/AuthContext.jsx';

export function useIsAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  // Guards against a slow response for a previous user landing after a
  // switch, same as useEntitlement.
  const reqId = useRef(0);

  const refresh = useCallback(async () => {
    if (!authConfigured || !user) { setIsAdmin(false); setLoading(false); return; }
    const id = ++reqId.current;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('is_admin');
      if (id !== reqId.current) return;
      setIsAdmin(!error && data === true);
    } catch {
      if (id === reqId.current) setIsAdmin(false);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return { isAdmin, loading, refresh };
}
