import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabaseClient.js';

/**
 * The weekly model-call report (migration 071, T1139). null until it loads,
 * and null for good on a project where 071 is not pasted yet or the caller is
 * not an admin, which hides the panel.
 */
export function useAiCalls(unlocked, weeks = 4) {
  const [report, setReport] = useState(null);
  useEffect(() => {
    if (!unlocked) return undefined;
    let live = true;
    (async () => {
      try {
        const supabase = await getSupabase();
        if (!supabase) return;
        const { data, error } = await supabase.rpc('admin_ai_calls_weekly', { p_weeks: weeks });
        if (live) setReport(error || !data || data.error ? null : data);
      } catch { if (live) setReport(null); }
    })();
    return () => { live = false; };
  }, [unlocked, weeks]);
  return report;
}
