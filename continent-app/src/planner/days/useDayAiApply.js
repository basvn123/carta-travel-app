import { splitAiPlan } from '../aiDayPlan.js';
import { persistAssignments, persistPrefs, loadAssignments, loadPrefs } from '../dayPlanStore.js';
import { useEffect } from 'react';
import { DAY_STYLES } from '../dayDraft.js';

export function useDayAiApply({
  activities, aiGroupSize, aiKey, applyDraft, assignments, autoBusy, autoQueue, dayIdx, days,
  entitlement, plan, prefs, runAi, setAiOpen, setAssignments, setAutoQueue, setDayIdx,
  setOverview, setPrefs, setRouteMode, setStopIdx, stop, stopIdx, stops,
}) {
  // "Put it on the map": catalogue stops become the day's assignments in the
  // AI's optimized order (numbered pins + OSRM walking route redraw on their
  // own), discoveries become spark pins, and the schedule card is kept in
  // prefs. Route mode flips to manual so the AI's deliberate chronology
  // (indoor stops in the hot hours) is not instantly reshuffled.
  // T899: the chat stays open beside the day on a desktop after Add.
  const applyAiResult = (result, { keepOpen = false } = {}) => {
    const { orderedIdx } = splitAiPlan(result, activities.items);
    if (orderedIdx.length) {
      const next = {
        ...assignments,
        [stopIdx]: { ...(assignments[stopIdx] || {}), [dayIdx]: orderedIdx },
      };
      setAssignments(next);
      persistAssignments(plan?.id, next);
    }
    setRouteMode('manual');
    const saved = {
      ...(prefs || {}),
      routeMode: 'manual',
      aiPlans: {
        ...(prefs?.aiPlans || {}),
        [aiKey]: {
          summary: result.summary || '',
          stops: result.stops || [],
          totals: result.totals || null,
          meta: result.meta || null,
          appliedAt: Date.now(),
        },
      },
    };
    setPrefs(saved);
    persistPrefs(plan?.id, saved);
    if (!keepOpen) setAiOpen(false);
  };

  // T823: the queue that plans every day. It moves the planner to each day
  // in turn (so the day's own closures, places and stay are the ones used),
  // asks the bot through the same runAi the form uses, puts the answer on
  // the map with applyAiResult, and goes on. A day that already has places
  // is left as it is. A failure stops the queue and says how far it got.
  useEffect(() => {
    if (!autoQueue) return;
    if (autoQueue.phase === 'init') {
      if (!stops.length) return;
      const have = loadAssignments(autoQueue.planKey) || {};
      const list = [];
      stops.forEach((st, si) => {
        for (let di = 0; di < st.nights; di++) {
          if (!(have?.[si]?.[di]?.length > 0)) list.push([si, di]);
        }
      });
      setOverview(false);
      setAutoQueue((q) => ({ ...q, phase: list.length ? 'run' : 'done', list, total: stops.reduce((n, st) => n + st.nights, 0) }));
      return;
    }
    if (autoQueue.phase !== 'run' || autoBusy.current) return;
    const target = autoQueue.list[autoQueue.i];
    if (!target) { setAutoQueue((q) => ({ ...q, phase: 'done' })); setOverview(true); return; }
    const [si, di] = target;
    if (stopIdx !== si || dayIdx !== di) {
      if (stopIdx !== si) setStopIdx(si);
      if (dayIdx !== di) setDayIdx(di);
      return;
    }
    if (!stop?.dest) return;
    autoBusy.current = true;
    const p = autoQueue.preset || {};
    (async () => {
      let res;
      try {
        res = await runAi({
          // T851: the day's own pace (Days tab) before the trip's preset.
          vibe: p.vibe || 'mix', pace: (loadPrefs(autoQueue.planKey) || {}).dayPace?.[`${si}-${di}`] || p.pace || 'balanced', avoidHills: !!p.avoidHills, freeText: p.freeText || '',
          // T896: Plan your days' Keep in mind (events, short walks) reach every day.
          date: days[di] || null, groupSize: aiGroupSize(), wantEvents: !!p.wantEvents,
        });
      } catch {
        res = { ok: false, code: 'network' };
      }
      autoBusy.current = false;
      entitlement?.refresh?.();
      setAutoQueue((q) => {
        if (!q || q.phase !== 'run') return q;
        if (res.ok) return { ...q, i: q.i + 1, planned: q.planned + 1 };
        // Too few places in one town is that day's matter, not the trip's.
        if (res.code === 'too_few') return { ...q, i: q.i + 1, skipped: (q.skipped || 0) + 1 };
        return { ...q, phase: 'fail', code: res.code || 'ai_error' };
      });
      if (res.ok) applyAiResult(res.plan);
    })();
  }, [autoQueue, stops, stopIdx, dayIdx, stop]); // eslint-disable-line react-hooks/exhaustive-deps -- runAi and applyAiResult are rebuilt every render; the queue reads them on the render that lands on its day

  // Every AI failure path lands here: the deterministic built-in draft, fed
  // with the same answers, so the button always ends in a planned day.
  const fallbackAi = (answers) => {
    setAiOpen(false);
    const style = DAY_STYLES.find((s) => s.key === answers.vibe) || DAY_STYLES[4];
    applyDraft({
      scope: 'day',
      style: style.key,
      interests: style.interests,
      dayLen: 'full',
      walk: answers.avoidHills ? 'light' : 'moderate',
      fill: answers.pace === 'relaxed' ? 'light' : answers.pace === 'packed' ? 'packed' : 'balanced',
      visit: answers.pace === 'relaxed' ? 'deep' : answers.pace === 'packed' ? 'quick' : 'standard',
      areaKey: 'all',
      areaIdx: null,
    });
  };
  return { applyAiResult, fallbackAi };
}
