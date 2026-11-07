import { DAY_START_MIN, fmtClockLoose } from '../daySchedule.js';
import { cityLabel } from '../../lib/placeName.js';
import { buildAiCandidates, requestAiDayPlan, decorateAiStops, splitAiPlan } from '../aiDayPlan.js';
import { formatSteps, kmToSteps, stepsToKm } from '../../lib/steps.js';
import { cityCoords, haversineKm } from '../../lib/runtime_pricing.js';
import { todayISO } from '../../lib/dates.js';
import { isGateway } from '../../lib/rating.js';
import { buildCityCandidates, requestCitySuggestion } from '../aiCitySuggest.js';
import { dwellMinutes, poiKind } from '../dayDraft.js';
import { buildDays } from '../dayBuild.js';

export function useDayChatAi({
  chatDest, chatInterests, chatVibe, chatWeather, destinations, groupSizeFor, homeTownId, ideas,
  ideasTownId, lang, moodFocus, moodInterests, newDayCount, newStartDate, newStayPoint,
  openBuiltPlan, prefs,
}) {
  /**
   * Fold the ideas into the free-text wish the prompt already treats as a
   * hard requirement. The Edge Function caps this field at 280 characters
   * and knows how to add a place that is not on the candidate deck, so this
   * is the must-include channel that exists rather than one invented for it.
   *
   * The traveller's OWN words come first and are never truncated away: the
   * wishes fill whatever room is left, and any that do not fit are dropped
   * whole rather than cut mid-name into a place that does not exist.
   */
  const withIdeaWishes = (own, a = {}) => {
    const CAP = 280;
    const head = own ? `${own.trim()} ` : '';
    // The answers the deployed function does not yet have a field for, said
    // in plain words. This is deliberate redundancy: the profile carries them
    // properly, and this line means a function that has not been redeployed
    // still honours them rather than silently ignoring the day's shape.
    const notes = [];
    if (a.companions === 'family') notes.push('travelling with children, keep it kid friendly');
    if (a.companions === 'solo') notes.push('travelling alone');
    if (a.startMin != null && a.startMin !== DAY_START_MIN) {
      notes.push(`start the day at ${fmtClockLoose(a.startMin)}`);
    }
    if (a.transitOk) notes.push('a bus or tram for the longer hops is fine');
    if ((a.diet || []).length) notes.push(`food must suit: ${a.diet.join(', ')}`);
    if (a.avoidCrowds) notes.push('avoid the most crowded places and hours');
    if (a.indoor) notes.push('keep one indoor option each day');
    if (a.stepFree) notes.push('step-free: no stairs, pushchair or wheelchair');
    if (chatWeather?.rain) notes.push('rain likely, favour indoor stops');
    else if (chatWeather?.hot) notes.push('very hot, favour shade and indoor stops midday');
    const tail = notes.length ? `${notes.join('; ')}.` : '';

    let line = '';
    for (const i of ideas) {
      const when = i.timeOfDay && i.timeOfDay !== 'any' ? ` (${i.timeOfDay})` : '';
      const piece = `${line ? ', ' : ''}${i.name}${when}`;
      if (head.length + tail.length + 'Must include: '.length + line.length + piece.length + 2 > CAP) break;
      line += piece;
    }
    const wishes = line ? `Must include: ${line}.` : '';
    return [head.trim(), wishes, tail].filter(Boolean).join(' ').slice(0, CAP);
  };

  const runChatAi = async (a, onStage = () => {}) => {
    // The ideas step may already have decided the town: when every idea sits
    // in one place, that is where the day is, and the chat never asked.
    const destId = a.town || ideasTownId || homeTownId;
    const info = await chatDest(destId);
    if (!info) return { ok: false, code: 'too_few' };
    onStage({ key: 'read', vars: { n: info.items.length, city: cityLabel(info.dest.city) } });
    // Ideas that are catalogue rows OF THIS TOWN can be pinned onto the deck
    // by index. One from a neighbouring town cannot (the indices belong to a
    // different items array), so it travels as a named wish instead.
    const forceIdx = new Set(
      ideas.filter((i) => i.destId === destId && i.poiIdx != null).map((i) => i.poiIdx),
    );
    const candidates = buildAiCandidates({
      items: info.items,
      walkable: info.walkable,
      excludeIdx: null,
      interests: chatInterests(a),
      limit: 24,
      forceIdx,
    });
    if (candidates.length < 3) return { ok: false, code: 'too_few' };
    onStage({ key: 'shortlist', vars: { n: candidates.length } });
    onStage({ key: 'route', vars: { steps: formatSteps(a.steps || kmToSteps(5), lang) } });
    const centre = cityCoords(info.dest);
    const maxWalkKm = a.maxWalkKm || (a.steps ? stepsToKm(a.steps) : null);
    // Places the traveller named by hand are the one part of the answer the
    // model may not drop. They travel as their own field, with the candidate
    // id attached wherever the idea resolved to a catalogue row of THIS town,
    // so the prompt can pin them without inventing anything.
    const mustInclude = ideas.slice(0, 8).map((i) => ({
      name: i.name,
      lat: Number.isFinite(i.lat) ? i.lat : null,
      lon: Number.isFinite(i.lon) ? i.lon : null,
      id: i.destId === destId && i.poiIdx != null ? String(i.poiIdx) : null,
      timeOfDay: i.timeOfDay && i.timeOfDay !== 'any' ? i.timeOfDay : null,
    })).filter((i) => i.name);
    const res = await requestAiDayPlan({
      dest: {
        id: destId, city: info.dest.city, country: info.dest.country,
        lat: centre.lat, lon: centre.lon,
      },
      date: newStartDate || todayISO(),
      // The days the plan covers (T433). A plan-day without the field plans
      // one day; the import then fills the rest from the catalogue.
      days: Math.max(1, newDayCount),
      groupSize: groupSizeFor(a.companions) || prefs?.aiGroupSize || 2,
      // A morning or an afternoon is a short day, and a day that runs into
      // the evening is a long one; the rest is an ordinary balanced day.
      pace: a.window === 'morning' || a.window === 'afternoon' ? 'relaxed'
        : a.window === 'evening' ? 'packed' : 'balanced',
      vibe: chatVibe(a),
      avoidHills: !!a.avoidHills,
      freeText: withIdeaWishes(a.freeText || '', a),
      wantEvents: !!a.events,
      mustInclude,
      // The full answer profile rides along so the prompt can honour the
      // things no single existing field captures (walking budget, who is
      // coming, when the day starts, first visit or not, what they eat).
      profile: {
        companions: a.companions || null,
        startTime: fmtClockLoose(a.startMin ?? DAY_START_MIN),
        steps: Number(a.steps) || null,
        maxWalkKm,
        avoidHills: !!a.avoidHills,
        transitOk: !!a.transitOk,
        moods: a.moods || [],
        window: a.window || null,
        known: a.known || null,
        food: a.food || null,
        diet: a.diet || [],
        avoidCrowds: !!a.avoidCrowds,
        indoor: !!a.indoor,
        stepFree: !!a.stepFree,
        weather: chatWeather,
      },
      refine: a.refine || '',
      prevStops: a.prevStops || [],
      lang,
      stay: newStayPoint ? { lat: newStayPoint.lat, lon: newStayPoint.lon } : null,
      candidates,
    });
    // Rejoin each proposed stop with the catalogue photo it came from, so the
    // proposal shows the places rather than only naming them.
    return res.ok ? { ...res, plan: decorateAiStops(res.plan, info.items) } : res;
  };

  // The "ask AI" town tab: a wider, coarser candidate list than the nearby
  // map (which caps at 110km/34 towns to stay legible) since a suggestion
  // can reasonably range further than a browsable list.
  const SUGGEST_TOWN_KM = 300;
  const SUGGEST_TOWN_CAP = 150;

  const suggestCityAi = async (freeText, a) => {
    if (!newStayPoint || newStayPoint.lat == null) return { ok: false, code: 'too_few' };
    const wide = Object.entries(destinations)
      .map(([id, d]) => {
        if (isGateway(d)) return null;
        const c = cityCoords(d);
        if (c.lat == null) return null;
        const km = haversineKm(newStayPoint.lat, newStayPoint.lon, c.lat, c.lon);
        return km != null && km <= SUGGEST_TOWN_KM ? { id, dest: d, km, ...c } : null;
      })
      .filter(Boolean)
      .sort((x, y) => (y.dest.rating?.score || 0) - (x.dest.rating?.score || 0))
      .slice(0, SUGGEST_TOWN_CAP);
    const candidates = buildCityCandidates(wide);
    if (candidates.length < 3) return { ok: false, code: 'too_few' };
    return requestCitySuggestion({
      stay: { lat: newStayPoint.lat, lon: newStayPoint.lon },
      // suggest-city has its own, older vocabulary (focus + interests) and is
      // a separately deployed function, so the chat's moods are translated
      // into it here rather than changing a second contract. Without this the
      // town suggestion silently lost everything the traveller had said.
      focus: moodFocus(a?.moods),
      interests: moodInterests(a?.moods),
      freeText,
      lang,
      candidates,
    });
  };

  // Import: build the standalone plan the chat just designed, carry the AI
  // schedule into its prefs, and open it. From here it is an ordinary day
  // plan, editable like any other.
  const importChatPlan = async (result, a) => {
    const destId = a.town || ideasTownId || homeTownId;
    const info = await chatDest(destId);
    if (!info) return;
    // Only catalogue places become stops (T433, route safety): a place the
    // model named that Carta does not hold has no checked position, so it is
    // never put on a walking route. The day is never left empty for it: the
    // strongest places that fit the answers fill in.
    const { orderedIdx } = splitAiPlan(result, info.items);
    const days = Math.max(1, newDayCount);
    const perDay = a.window === 'morning' || a.window === 'afternoon' ? 3 : a.window === 'evening' ? 6 : 5;
    const want = Math.max(orderedIdx.length, perDay * days);
    const chosen = [...orderedIdx];
    if (chosen.length < want) {
      const deck = buildAiCandidates({
        items: info.items,
        walkable: info.walkable,
        excludeIdx: new Set(chosen),
        interests: chatInterests(a),
        limit: want,
      });
      for (const c of deck) {
        if (chosen.length >= want) break;
        chosen.push(Number(c.id));
      }
    }
    const picks = chosen.map((idx) => {
      const it = info.items[idx];
      return it ? {
        destId, idx, name: it.name, lat: it.lat, lon: it.lon,
        minutes: dwellMinutes(poiKind(it)), must: orderedIdx.includes(idx),
      } : null;
    }).filter(Boolean);
    // One day keeps Carta's own order (indoor stops in the hot hours, the
    // viewpoint at sunset); several are cut by neighbourhood.
    const built = days === 1 && orderedIdx.length
      ? { stops: [{ destinationId: destId, days: 1 }], assign: { 0: { 0: chosen } } }
      : buildDays({ picks, dayCount: days, homeId: destId, start: newStayPoint });
    openBuiltPlan(built, cityLabel(info.dest.city || ''), {
      routeMode: days === 1 && orderedIdx.length ? 'manual' : 'auto',
      dayStartMin: Number.isFinite(a.startMin) ? a.startMin : DAY_START_MIN,
      pace: a.window === 'morning' || a.window === 'afternoon' ? 'relaxed' : (a.steps >= 15000 ? 'packed' : 'balanced'),
      stepFree: !!a.stepFree,
      groupSize: groupSizeFor(a.companions) || 2,
      aiPlans: {
        '0:0': {
          summary: result.summary || '',
          stops: (result.stops || []).filter((x) => !x.external),
          totals: result.totals || null,
          meta: result.meta || null,
          refineToken: result.refineToken || null,
          appliedAt: Date.now(),
        },
      },
    });
  };
  return { runChatAi, suggestCityAi, importChatPlan };
}
