import { useMemo } from 'react';
import { dwellMinutes, poiKind, isMustSee } from '../dayDraft.js';
import { buildDays, previewClock } from '../dayBuild.js';
import { cityCoords } from '../../lib/runtime_pricing.js';
import { addDays, todayISO } from '../../lib/dates.js';
import { cityLabel } from '../../lib/placeName.js';
import { persistAssignments, persistPrefs, persistStandalonePlans } from '../dayPlanStore.js';

export function useDayBuilder({
  actFull, destinations, ensurePois, homeTownId, itemOf, itemsForStop, newDayCount,
  newStartDate, newStayPoint, newStops, openStandalone, selPois, setIdeas, setLandingStep,
  setNewStops, setSelPois, setStandalonePlans, setStayQuery, setStayResults, standalonePlans, t,
}) {
  // The builder's picks as the day cutter reads them.
  const builderPicks = useMemo(() => selPois.map((p) => {
    const it = itemOf(p.destId, p.idx);
    if (!it) return null;
    return {
      destId: p.destId,
      idx: p.idx,
      key: p.key,
      name: it.name,
      img: it.img || '',
      lat: it.lat,
      lon: it.lon,
      minutes: dwellMinutes(poiKind(it)),
      must: isMustSee(it),
    };
  }).filter(Boolean), [selPois, destinations, actFull]); // eslint-disable-line react-hooks/exhaustive-deps -- itemOf reads exactly these

  // The days the builder's picks make, exactly as "Open my days" will open
  // them: the tray previews this, the planner receives this (T433).
  const builderDays = useMemo(() => buildDays({
    picks: builderPicks,
    townIds: newStops.map((s) => s.destinationId),
    dayCount: newDayCount,
    homeId: homeTownId,
    townPos: (id) => (destinations[id] ? cityCoords(destinations[id]) : null),
    start: newStayPoint,
  }), [builderPicks, newStops, newDayCount, homeTownId, destinations, newStayPoint]);

  const builderPreview = useMemo(() => builderDays.days.map((d, k) => ({
    ...d,
    no: k + 1,
    date: newStartDate ? addDays(newStartDate, k) : null,
    town: cityLabel(destinations[d.destId]?.city || ''),
    clock: previewClock(d.picks, { start: newStayPoint }),
  })), [builderDays, newStartDate, destinations, newStayPoint]);

  const openBuiltPlan = (built, label, extraPrefs = null) => {
    if (!built.stops.length) return;
    const sp = {
      id: `local:${Date.now()}`,
      label: label || built.stops.map((s) => cityLabel(destinations[s.destinationId]?.city || '')).filter(Boolean).join(' + ') || t('day.dayPlanFallback'),
      startDate: newStartDate || todayISO(),
      stayPoint: newStayPoint,
      stops: built.stops,
    };
    persistAssignments(sp.id, built.assign);
    if (extraPrefs) persistPrefs(sp.id, extraPrefs);
    const next = [sp, ...standalonePlans];
    setStandalonePlans(next);
    persistStandalonePlans(next);
    setNewStops([]);
    setStayQuery('');
    setStayResults(null);
    setSelPois([]);
    setIdeas([]);
    setLandingStep('stay');
    openStandalone(sp);
  };

  const startExplorePlanning = () => openBuiltPlan(builderDays, '');

  /* ---- Carta chat planner (landing): answers -> AI day -> new plan ---- */

  // The chat's chosen town, resolved to its destination record and full POI
  // list. Everything the chat does hangs off this one lookup.
  const chatDest = async (destId) => {
    const dest = destinations[destId];
    if (!dest) return null;
    const fullMap = await ensurePois([destId]);
    // The same list the day workspace reads: the coordinate-bearing shard
    // when it loaded, else the boot index's trimmed items, so a shard that
    // failed to load still lets the chat plan from what the boot carries.
    const { items, walkable } = itemsForStop({ dest, destination_id: destId }, fullMap);
    if (!items.length) return null;
    return { dest, items, walkable };
  };

  // The chat's answers speak the traveller's language; the ranking engine and
  // the prompt speak interests and pace. Translate once, here. The chat now
  // asks one "mood" question where it used to ask focus and interests, so
  // this is the single map from what was tapped to what the deck ranks by.
  const chatInterests = (a) => {
    const map = {
      sights: ['culture', 'architecture', 'photo'],
      museums: ['museums', 'culture'],
      nature: ['outdoors'],
      beach: ['beaches', 'outdoors'],
      active: ['sports', 'outdoors'],
      food: ['food'],
      local: ['food', 'cafes', 'shopping'],
      views: ['photo'],
      shopping: ['shopping'],
      nightlife: ['nightlife', 'food'],
    };
    const out = new Set();
    (a.moods || []).forEach((k) => (map[k] || []).forEach((v) => out.add(v)));
    return [...out];
  };

  // The prompt's coarse "vibe" is derived from the moods rather than asked
  // for: the traveller already said what they are in the mood for, and a
  // second, vaguer version of the same question would earn nothing.
  const chatVibe = (a) => {
    const m = a.moods || [];
    if (m.includes('active') || m.includes('nature') || m.includes('beach')) return 'active';
    if (m.includes('museums')) return 'culture';
    if (m.includes('food')) return 'foodie';
    if (m.includes('sights')) return 'classic';
    return 'mix';
  };

  // Who is coming, as a party size the prompt can reason about. These are
  // defaults the traveller never has to confirm, not counts we claim to know:
  // a group is planned as five because five is where a day stops behaving
  // like a small party's day.
  const GROUP_SIZE_BY_COMPANIONS = {
    solo: 1, partner: 2, friends: 3, family: 4, group: 5,
  };
  const groupSizeFor = (companions) => GROUP_SIZE_BY_COMPANIONS[companions] || null;

  // The town-suggestion function speaks the retired focus/interest words.
  // These two translate the mood answers into its vocabulary; anything the
  // older whitelist does not know is simply dropped by it.
  const MOOD_TO_INTEREST = {
    sights: 'landmarks', museums: 'museums', nature: 'nature', beach: 'beach',
    active: 'active', food: 'food', local: 'local', views: 'photo',
  };
  const moodInterests = (moods) => (moods || []).map((m) => MOOD_TO_INTEREST[m]).filter(Boolean);
  return { builderPreview, openBuiltPlan, startExplorePlanning, chatDest, chatInterests, chatVibe, groupSizeFor, moodInterests };
}
