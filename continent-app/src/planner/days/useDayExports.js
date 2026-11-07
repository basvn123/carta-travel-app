import { todayISO } from '../../lib/dates.js';
import { loadStandalonePlans, persistStandalonePlans, persistAssignments, persistPrefs } from '../dayPlanStore.js';
import { dwellMinutes, poiKind } from '../dayDraft.js';
import { DAY_START_MIN } from '../daySchedule.js';
import { cityLabel } from '../../lib/placeName.js';
import { openDayPlanKml } from '../dayPlanKml.js';
import { openDayPlanIcs } from '../dayPlanIcs.js';
import { buildDayShareUrl } from '../../lib/shareLink.js';
import { trackFunnel } from '../../lib/funnelCounts.js';

export function useDayExports({
  aiGroupSize, assignedItems, assignments, costs, daySaveState, gmapsShareParts, isNarrow,
  itemsForStop, lang, paywall, plan, prefs, setDaySaveState, setSaveToast, setShareState,
  setStandalonePlans, stop, stopCost, stops, t, visitFactor,
}) {
  // Snapshot a trip-based day plan (saved trip / trip draft) into the local
  // day-plan store, so it shows up under Saved trips like any standalone plan.
  const saveToSavedTrips = () => {
    if (!plan || plan.standalone || daySaveState === 'saved') return;
    const newId = `local:${Date.now()}`;
    const sp = {
      id: newId,
      label: plan.label || stops.map((s) => s.dest?.city).filter(Boolean).join(' + ') || t('day.dayPlanFallback'),
      startDate: stops[0]?.arrive_date || todayISO(),
      stayCityId: plan.stayCityId || '',
      stayPoint: plan.stayPoint || null,
      stops: stops.map((s) => ({ destinationId: s.destination_id, days: s.nights })),
    };
    const next = [sp, ...loadStandalonePlans()];
    setStandalonePlans(next);
    persistStandalonePlans(next);
    persistAssignments(newId, assignments);
    if (prefs) persistPrefs(newId, prefs);
    setDaySaveState('saved');
    setSaveToast(t('day.savedToast'));
    window.setTimeout(() => setSaveToast(''), 3500);
  };

  // A clean, printable booklet of every planned day across the whole trip.
  // Opens the browser's print dialog, where "Save as PDF" produces the
  // shareable file, no libraries, no external services, and it wears the
  // app's own palette (warm paper, deep ink, one rust accent). Every place
  // gets an explanation, and each place + each day carries a Google Maps link.
  // T433: the Figtree booklet (lib/dayPdf.js), loaded on the tap so jsPDF
  // never rides in the day planner's own chunk. Every day is routed and timed
  // by the same checker and clock as the screen.
  const downloadPdf = async () => {
    if (!paywall.require('export')) return;
    const { downloadDayPdf } = await import('../../lib/dayPdf.js');
    await downloadDayPdf({
      label: plan?.label || '',
      stops,
      assignments,
      itemsForStop,
      dwellOf: (it) => dwellMinutes(poiKind(it), visitFactor),
      startMin: Number.isFinite(prefs?.dayStartMin) ? prefs.dayStartMin : DAY_START_MIN,
      stay: plan?.stayPoint ? { label: plan.stayPoint.shortLabel || plan.stayPoint.label || '', lat: plan.stayPoint.lat, lon: plan.stayPoint.lon } : null,
      pace: prefs?.pace || 'balanced',
      stepFree: !!prefs?.stepFree,
      groupSize: prefs?.groupSize || aiGroupSize(),
      dayFig: (id) => {
        const c = stopCost(stops.find((s) => s.destination_id === id)) || costs?.get(id);
        return c && c.dayEur != null ? { eur: c.dayEur, est: c.stayLevel !== 'city' || c.foodLevel !== 'city' } : null;
      },
      t,
      lang,
      cityLabel,
    });
  };

  // The same walk as the PDF, but as a KML download: every planned day a
  // My Maps folder of pins in walking order. The toast repeats the import
  // steps because mymaps.google.com is not a path most travellers know.
  const downloadKmlFile = () => {
    if (!paywall.require('exportMap')) return;
    const ok = openDayPlanKml({ stop, stops, assignments, plan, visitFactor, itemsForStop, t });
    if (ok) {
      setSaveToast(t('export.myMapsHint'));
      window.setTimeout(() => setSaveToast(''), 9000);
    }
  };

  // Every planned day as timed calendar blocks, spoken in the same clock the
  // timeline shows, so the plan lands in Google/Apple/Outlook calendars.
  const downloadIcsFile = () => {
    if (!paywall.require('exportCal')) return;
    const ok = openDayPlanIcs({
      stop, stops, assignments, plan, visitFactor, itemsForStop, t,
      startMin: Number.isFinite(prefs?.dayStartMin) ? prefs.dayStartMin : DAY_START_MIN,
    });
    if (ok) {
      // The day planner's own words: the trip's hint spoke of "every flight
      // and stay", which a day plan has neither of (brief M9).
      setSaveToast(t('dayws.icsHint'));
      window.setTimeout(() => setSaveToast(''), 6000);
    }
  };

  // A link that opens this plan on any device (T433): its towns, days, start
  // and places by index; the receiver re-routes every walk itself.
  const shareDayLink = async () => {
    if (!plan) return;
    const a = {};
    Object.entries(assignments || {}).forEach(([si, ds]) => {
      a[si] = {};
      Object.entries(ds || {}).forEach(([di, list]) => { if ((list || []).length) a[si][di] = list; });
    });
    const url = await buildDayShareUrl({
      v: 1,
      label: plan.label || '',
      start: stops[0]?.arrive_date || null,
      stay: plan.stayPoint ? { lat: plan.stayPoint.lat, lon: plan.stayPoint.lon, label: plan.stayPoint.shortLabel || '' } : null,
      stops: stops.map((s) => ({ d: s.destination_id, n: s.nights })),
      a,
    });
    if (!url) return;
    trackFunnel('shared');
    try {
      if (navigator.share && isNarrow) { await navigator.share({ title: plan.label || t('day.myDay'), url }); return; }
    } catch { /* cancelled: fall through to the clipboard */ }
    try {
      await navigator.clipboard.writeText(url);
      setShareState('linked');
      setTimeout(() => setShareState('idle'), 2500);
    } catch { /* clipboard unavailable */ }
  };

  const shareDay = async () => {
    const cityName = stop?.dest?.city || t('day.myDay');
    const lines = assignedItems.map((it, i) => `${i + 1}. ${it.name}`);
    const text = [t('day.shareTextTitle', { city: cityName }), ...lines, ...gmapsShareParts.map((p) => t('day.shareRoute', { url: p.url }))]
      .filter(Boolean).join('\n');
    try {
      if (navigator.share) {
        await navigator.share({ title: t('day.shareTitle', { city: cityName }), text });
        return;
      }
    } catch { /* cancelled - fall through to clipboard */ }
    try {
      await navigator.clipboard.writeText(text);
      setShareState('copied');
      setTimeout(() => setShareState('idle'), 2000);
    } catch { /* clipboard unavailable */ }
  };
  return { saveToSavedTrips, downloadPdf, downloadKmlFile, downloadIcsFile, shareDayLink, shareDay };
}
