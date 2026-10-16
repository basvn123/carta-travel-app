/**
 * planHooks.js (T432): the two hooks the trip's price card reads, kept apart
 * from PlanTotal.jsx so that file exports components only (fast refresh).
 */
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useSettings } from '../components/SettingsLine.jsx';
import { matchProfile, PROFILE_LABEL_KEYS } from '../browse/LifestylePanel.jsx';

/** "Entire place, Easygoing": the Lifestyle the trip is priced at, in the
 *  settings line's own words. */
export function useLifestyleLabel() {
  const { t } = useI18n();
  const s = useSettings();
  if (!s) return '';
  const bed = t(`stay.${s.stayTier || 'home'}`);
  const key = matchProfile(s.lifestyle || {});
  const vibe = key ? t(PROFILE_LABEL_KEYS[key]) : t('lifestyle.custom');
  return `${bed}, ${vibe}`;
}

/** What the last change did to the total, for three seconds. */
export function useTotalDelta(total) {
  const [delta, setDelta] = useState(null);
  const prev = useRef(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = total;
    if (total == null || before == null || Math.abs(total - before) < 0.005) return undefined;
    setDelta(total - before);
    const id = setTimeout(() => setDelta(null), 3000);
    return () => clearTimeout(id);
  }, [total]);
  return delta;
}

