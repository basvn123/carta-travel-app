/**
 * Live site configuration, read from public.site_config (migration 014).
 *
 * The table is world-readable and tiny: a handful of jsonb knobs (the
 * announcement banner, feature flags) that the admin panel can change without
 * a deploy. One read per page load, module-cached, and every failure mode
 * degrades to "no config" rather than an error, because a banner is never
 * worth blocking the app for.
 */
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const EMPTY = {};
let cache = null;

export function useSiteConfig() {
  const [config, setConfig] = useState(cache || EMPTY);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return undefined;
    if (!supabase) { setLoading(false); return undefined; }
    let live = true;
    supabase
      .from('site_config')
      .select('key,value')
      .then(({ data, error }) => {
        if (!live) return;
        if (!error && Array.isArray(data)) {
          cache = Object.fromEntries(data.map((r) => [r.key, r.value]));
          setConfig(cache);
        }
        setLoading(false);
      });
    return () => { live = false; };
  }, []);

  return { config, loading };
}

/**
 * One feature flag, by name, from site_config.features. Strictly boolean:
 * anything missing, malformed, or unloaded reads as off, so a flag can gate
 * a surface without ever being able to break one.
 */
export function useFeature(name) {
  const { config } = useSiteConfig();
  return config.features?.[name] === true;
}
