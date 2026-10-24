/**
 * flowHooks.js (T655): the hooks and small helpers the planner flow's
 * screens share, kept apart from the component files (fast refresh).
 */
import { useCallback, useMemo } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { plannerStore, usePlannerStore } from '../plannerStore.js';
import { fromDraft, draftPatch, normalizeSettings } from './tripSettings.js';

/**
 * The trip settings, read from the planner draft and written back to it on
 * every change, so a reload, a tab hop, the settings sheet and the planning
 * engine all see the same answers.
 */
export function useTripSettings() {
  const draft = usePlannerStore();
  const settings = useMemo(() => fromDraft(draft), [draft]);
  const save = useCallback((next) => {
    const s = normalizeSettings(next);
    plannerStore.set(draftPatch(s, plannerStore.getState()));
  }, []);
  return [settings, save];
}

/** The language's BCP 47 tag, for Intl dates and month names. */
export function useBcp47() {
  const { lang, languages } = useI18n();
  return (languages.find((l) => l.code === lang) || languages[0]).bcp47;
}

/** Twelve months from this one, as numbers 1 to 12 with their names. */
export function useMonths() {
  const bcp47 = useBcp47();
  return useMemo(() => {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat(bcp47, { month: 'long' });
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return { m: d.getMonth() + 1, label: fmt.format(d) };
    });
  }, [bcp47]);
}

/** The two halves of the dates card, from the When answer. */
export function whenText(t, w, months, bcp47) {
  const fmt = (iso) => new Intl.DateTimeFormat(bcp47, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${iso}T12:00:00`));
  if (w.mode === 'exact' && w.start) return { start: fmt(w.start), end: w.end ? fmt(w.end) : '' };
  if (w.mode === 'months' && w.months.length) {
    const names = months.filter((x) => w.months.includes(x.m)).map((x) => x.label);
    return { start: names.join(', '), end: t('pf.nightsN', { n: w.nights }) };
  }
  if (w.mode === 'any') return { start: t('pf.when.any'), end: t('pf.nightsN', { n: w.nights }) };
  return { start: '', end: '' };
}
