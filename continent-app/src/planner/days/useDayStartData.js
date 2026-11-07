import { useMemo, useState, useRef, useEffect } from 'react';
import { todayISO, addDays, laterISO } from '../../lib/dates.js';
import { cityCoords, tripDaysBetween, haversineKm } from '../../lib/runtime_pricing.js';
import { cityLabel, cityKeyName } from '../../lib/placeName.js';
import { scrollBehavior } from '../../lib/motion.js';
import { isGateway } from '../../lib/rating.js';
import { duplicatePoiIndices, isTransportInfraPoi, isCommercialNoisePoi, poiCategory, isMustSee, poiScore, poiIdentityKeys } from '../dayDraft.js';

export function useDayStartData({
  actFull, authConfigured, destinations, ensurePois, ideas, landingStep, newStartDate,
  newStayPoint, newStayWindow, resolveNearestTown, savedPlans, searchStay, setIdeas,
  setLandingStep, setNewDayCount, setNewStartDate, setNewStayPoint, setNewStayWindow,
  setNewStops, setSelPois, setStayQuery, setStayResults, standalonePlans, stayResults, t, today,
  user,
}) {
  // Where a signed-in traveller is actually sleeping in the fortnight ahead:
  // every stop of every saved trip whose window covers today or one of the
  // next 14 days. Somebody opening the day planner mid-trip is overwhelmingly
  // planning a day IN that trip, so the stop they are in is the first answer
  // offered, and picking it presets the date too (step 2 opens answered).
  const UPCOMING_STAY_DAYS = 14;
  const upcomingStays = useMemo(() => {
    if (!user || !authConfigured) return [];
    const today = todayISO();
    const horizon = addDays(today, UPCOMING_STAY_DAYS);
    const out = [];
    const seen = new Set();
    for (const p of savedPlans) {
      for (const st of (p.stops || [])) {
        const from = st.arrive_date;
        const to = st.depart_date || st.arrive_date;
        // Overlap, not containment: a stop that started last week and runs
        // through next Tuesday is exactly the one being planned right now.
        if (!from || from > horizon || to < today) continue;
        const dest = destinations[st.destination_id];
        const c = dest ? cityCoords(dest) : { lat: null, lon: null };
        if (c.lat == null) continue;
        const name = cityLabel(dest.city);
        const key = `${cityKeyName(dest.city)}|${dest.country}|${from}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          key,
          name,
          country: dest.country || st.country || '',
          lat: c.lat,
          lon: c.lon,
          // The day the stop begins, which is also the date step 2 opens on.
          // Already inside the stop? Today is the day being planned.
          from,
          to,
          date: from <= today ? today : from,
        });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  }, [user, authConfigured, savedPlans, destinations]);

  const pickUpcomingStay = (row) => {
    setStayQuery('');
    setStayResults(null);
    setNewStayPoint({
      lat: row.lat,
      lon: row.lon,
      label: row.country ? `${row.name}, ${row.country}` : row.name,
      shortLabel: row.name,
      locality: row.name,
    });
    // The trip already says which day this is, so step 2 opens answered
    // rather than asking a question its own answer is sitting next to. It
    // also says which days are POSSIBLE: the calendar narrows to the stop's
    // own window, and the chips become its days.
    setNewStayWindow({ from: row.from, to: row.to });
    setNewStartDate(row.date);
    // The stop's nights left from that day are the days to plan.
    setNewDayCount(Math.max(1, Math.min(7, tripDaysBetween(row.date, row.to) || 1)));
  };

  // Where the last few standalone plans started. Dedupe by label: planning
  // three days from the same hotel is the normal case, and three identical
  // chips would say nothing the first one did not.
  const recentStays = useMemo(() => {
    const out = [];
    const seen = new Set();
    for (const sp of standalonePlans) {
      const pt = sp.stayPoint;
      if (!pt || pt.lat == null || pt.lon == null) continue;
      const label = pt.shortLabel || pt.label || '';
      const key = label.toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label, point: pt });
      if (out.length === 3) break;
    }
    return out;
  }, [standalonePlans]);

  const pickRecentStay = (row) => {
    setStayQuery('');
    setStayResults(null);
    setNewStayPoint(row.point);
    // A repeat of a free-form start, not a trip stop: back to a free calendar.
    setNewStayWindow(null);
  };

  // Keyboard navigation over the results list: the arrow keys move a
  // highlight, Enter takes it. Without it the only way past the geocoder is a
  // mouse, which for a step every single day plan has to pass through is the
  // difference between the planner being usable from the keyboard and not.
  const [stayCursor, setStayCursor] = useState(-1);
  const stayResultRefs = useRef([]);
  useEffect(() => { setStayCursor(-1); }, [stayResults]);

  // The on-screen keyboard (T414 phone checks): when it opens, the viewport
  // shrinks and the field could end up under the bottom nav. While the stay
  // field has focus, a resize brings the field and its Find button back to
  // the middle of what is left of the screen.
  const keepStayInView = useRef(null);
  const onStayFocus = (e) => {
    const box = e.currentTarget.closest('.day-flow-search');
    const go = () => box?.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
    keepStayInView.current = go;
    window.visualViewport?.addEventListener('resize', go);
    window.addEventListener('resize', go);
  };
  const onStayBlur = () => {
    const go = keepStayInView.current;
    if (!go) return;
    window.visualViewport?.removeEventListener('resize', go);
    window.removeEventListener('resize', go);
    keepStayInView.current = null;
  };
  useEffect(() => onStayBlur, []);

  const onStayKeyDown = (e) => {
    const n = stayResults?.length || 0;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!n) return;
      e.preventDefault();
      const next = e.key === 'ArrowDown'
        ? (stayCursor + 1) % n
        : (stayCursor <= 0 ? n - 1 : stayCursor - 1);
      setStayCursor(next);
      stayResultRefs.current[next]?.focus();
      return;
    }
    if (e.key === 'Enter') {
      // Enter inside the box searches; Enter on a highlighted row takes it.
      if (stayCursor >= 0 && stayResults?.[stayCursor]) {
        e.preventDefault();
        setNewStayWindow(null);
        setNewStayPoint(stayResults[stayCursor]);
        return;
      }
      searchStay();
      return;
    }
    if (e.key === 'Escape' && stayResults) {
      setStayCursor(-1);
      e.currentTarget.closest('.day-flow-step')?.querySelector('.day-stay-input')?.focus();
    }
  };

  /* ---- The date step's bounds ---- */

  // A day plan is a plan for a day you have not had yet. Nothing behind today
  // is choosable, and a year ahead is as far as the catalogue's opening hours,
  // weather and fares mean anything, so the calendar stops there too.
  const DATE_HORIZON_DAYS = 365;
  const dayDateMin = useMemo(
    () => (newStayWindow?.from ? laterISO(newStayWindow.from, today) : today),
    [newStayWindow, today],
  );
  const dayDateMax = useMemo(() => {
    const horizon = addDays(today, DATE_HORIZON_DAYS);
    // The trip's own end, unless the trip runs past the horizon.
    if (newStayWindow?.to) return newStayWindow.to < horizon ? newStayWindow.to : horizon;
    return horizon;
  }, [newStayWindow, today]);
  // A trip whose whole window is already behind us leaves min above max; the
  // date step then has nothing to offer, and clamping into an empty range
  // would put the calendar on a day the trip does not contain. Treat it as a
  // free-form date instead of an impossible one.
  const dayWindowUsable = dayDateMin <= dayDateMax;

  // Restored plans and tabs left open across midnight both arrive holding a
  // date that has since fallen out of bounds. Pull it back into range rather
  // than let the next step run on a day the traveller can no longer have.
  useEffect(() => {
    if (!newStartDate || !dayWindowUsable) return;
    if (newStartDate < dayDateMin) setNewStartDate(dayDateMin);
    else if (newStartDate > dayDateMax) setNewStartDate(dayDateMax);
  }, [newStartDate, dayDateMin, dayDateMax, dayWindowUsable, setNewStartDate]);

  // The three dates almost every day trip actually falls on, so the date step
  // is one tap rather than a calendar hunt. "This weekend" is the coming
  // Saturday, which on a Saturday AND on a Sunday means today: a weekend chip
  // that resolves to the Saturday just gone is a past date, and offering to
  // plan yesterday is the bug this guards.
  //
  // With a stay taken from a saved trip the generic three are replaced by the
  // trip's own days: inside a week in Porto, "today / tomorrow / this weekend"
  // are either wrong or a roundabout way of saying "day 3".
  const quickDates = useMemo(() => {
    if (newStayWindow && dayWindowUsable) {
      const out = [];
      // Numbered from the stop's FIRST night, not from the first selectable
      // day: mid-trip, "day 1" would otherwise mean today, and the traveller
      // counts their days from when they arrived. The walk starts at
      // dayDateMin, so find its day number once and count up from there.
      let n = 1;
      for (let iso = newStayWindow.from; iso && iso < dayDateMin && n < 400; iso = addDays(iso, 1)) n += 1;
      for (let iso = dayDateMin; iso <= dayDateMax && out.length < 6; iso = addDays(iso, 1), n += 1) {
        out.push({
          key: `trip-${iso}`,
          iso,
          label: iso === today ? t('day.quickToday') : t('day.quickTripDay', { n }),
        });
      }
      return out;
    }
    const [y, m, d] = today.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    // Sunday (0) is already the weekend, so its offset is 0, not the six days
    // it would take to reach next Saturday.
    const toSaturday = dow === 0 ? 0 : (6 - dow);
    const all = [
      { key: 'today', labelKey: 'day.quickToday', iso: today },
      { key: 'tomorrow', labelKey: 'day.quickTomorrow', iso: addDays(today, 1) },
      { key: 'weekend', labelKey: 'day.quickWeekend', iso: addDays(today, toSaturday) },
    ];
    // On a Friday "tomorrow" IS the weekend, and on a Saturday so is "today":
    // two chips carrying the same date read as a bug, so the earlier, more
    // specific wording wins and the duplicate drops.
    const seen = new Set();
    return all
      .filter((q) => q.iso >= today && q.iso <= dayDateMax)
      .filter((q) => !seen.has(q.iso) && seen.add(q.iso));
  }, [today, newStayWindow, dayWindowUsable, dayDateMin, dayDateMax, t]);

  // ---- Landing explore map: what's around the traveller's stay ----
  // Towns within day-trip reach, and (from the full POI catalogue) beaches &
  // nature, must-see sights and active outings, each behind its own filter
  // chip so the map never opens as a wall of pins.
  const EXPLORE_TOWN_KM = 110;
  const EXPLORE_POI_KM = 60;
  // Every town this close is a realistic outing regardless of its rating, so
  // nearby ones are guaranteed a pin before the wider circle competes.
  const EXPLORE_NEAR_KM = 30;
  const EXPLORE_TOWN_CAP = 34;
  // A catalogue town this close to the stay IS the stay: the red stay pin
  // stands in for it, so we don't draw a duplicate town label on top of it.
  const STAY_TOWN_KM = 3;

  const exploreTowns = useMemo(() => {
    if (!newStayPoint || newStayPoint.lat == null) return [];
    const all = Object.entries(destinations)
      .map(([id, d]) => {
        if (isGateway(d)) return null;
        const c = cityCoords(d);
        if (c.lat == null) return null;
        const km = haversineKm(newStayPoint.lat, newStayPoint.lon, c.lat, c.lon);
        return km != null && km <= EXPLORE_TOWN_KM ? { id, dest: d, km: Math.round(km), ...c } : null;
      })
      .filter(Boolean);
    // Multi-airport cities ("Milan (Malpensa)" / "(Linate)" / "(Bergamo)") all
    // share the same city-centre pin: keep one per base city name so the map
    // never stacks three identical Milans.
    const byBaseCity = new Map();
    for (const t of all) {
      const key = `${cityKeyName(t.dest.city)}|${t.dest.country}`;
      const cur = byBaseCity.get(key);
      if (!cur || t.km < cur.km) byBaseCity.set(key, t);
    }
    const deduped = [...byBaseCity.values()];
    // Close-by towns first (they're the realistic day trips), each set ranked
    // by rating, then the best of the wider circle fills the remaining pins.
    const byScore = (a, b) => (b.dest.rating?.score || 0) - (a.dest.rating?.score || 0);
    const near = deduped.filter((t) => t.km <= EXPLORE_NEAR_KM).sort(byScore);
    const far = deduped.filter((t) => t.km > EXPLORE_NEAR_KM).sort(byScore);
    return [...near, ...far].slice(0, EXPLORE_TOWN_CAP);
  }, [newStayPoint, destinations]);

  // The catalogue town the stay sits in (if any). Its pin is folded into the
  // red stay pin, which is clickable to brief it and everything around it.
  const stayTownId = useMemo(() => {
    let best = null;
    for (const t of exploreTowns) {
      if (t.km != null && (best == null || t.km < best.km)) best = t;
    }
    return best && best.km <= STAY_TOWN_KM ? best.id : null;
  }, [exploreTowns]);

  // What the fork step's second card is offering, named and pictured (D7).
  // The town is the one the stay sits in when there is one, otherwise the
  // nearest in reach; the photos are the three strongest places around it.
  //
  // T433, the "Elst" bug: the name used to be the catalogue town within 3 km,
  // or else the BEST-RATED town within 30 km, and a town researched once was
  // kept on the device as a catalogue town for every later stay. So a start
  // in one village was announced as somewhere else entirely. The start is now
  // named by where it actually is: the locality the geocoder reports for it,
  // then the NEAREST catalogue town if one is close, then its own label.
  const nearestTown = useMemo(() => {
    let best = null;
    for (const tn of exploreTowns) if (tn.km != null && (!best || tn.km < best.km)) best = tn;
    return best;
  }, [exploreTowns]);
  const startName = useMemo(() => {
    if (!newStayPoint) return '';
    if (newStayPoint.locality) return cityLabel(newStayPoint.locality);
    if (nearestTown && nearestTown.km <= 8) return cityLabel(nearestTown.dest.city);
    return newStayPoint.shortLabel || newStayPoint.label || '';
  }, [newStayPoint, nearestTown]);
  // The catalogue town a day is planned in when nothing else says: the
  // nearest one with places to fill a day, by distance, never by rating.
  const homeTownId = useMemo(() => {
    if (nearestTown && nearestTown.km <= 15) return nearestTown.id;
    return exploreTowns[0]?.id || null;
  }, [nearestTown, exploreTowns]);

  // The explore map draws POIs for every town in day-trip reach of the stay,
  // so those shards have to be in hand before the memo below can place a pin.
  // Up to 34 requests of ~8.6 KB, which HTTP/2 multiplexes; the memo re-runs
  // when they land because `actFull` is one of its dependencies.
  useEffect(() => {
    if (!exploreTowns.length) return;
    ensurePois(exploreTowns.map((t) => t.id));
  }, [exploreTowns, ensurePois]);

  const explorePois = useMemo(() => {
    if (!newStayPoint || newStayPoint.lat == null) return [];
    const out = [];
    for (const t of exploreTowns) {
      const items = (t.dest.activities?.items_full?.length
        ? t.dest.activities.items_full
        : actFull?.[t.id]) || [];
      const suppressed = duplicatePoiIndices(items); // dupes within this town
      items.forEach((item, idx) => {
        if (suppressed.has(idx)) return;
        if (item.lat == null || item.lon == null || isTransportInfraPoi(item) || isCommercialNoisePoi(item)) return;
        const km = haversineKm(newStayPoint.lat, newStayPoint.lon, item.lat, item.lon);
        if (km == null || km > EXPLORE_POI_KM) return;
        // Same classifier as the in-day picker map (poiCategory), so the two
        // maps never disagree on what counts as nature. Non-must-see plain
        // sights still stay off this wide map to keep it legible.
        const cat0 = poiCategory(item);
        const cat = cat0 === 'nature' ? 'beach'
          : cat0 === 'active' ? 'active'
          : isMustSee(item) ? 'sight'
          : null;
        if (!cat) return;
        out.push({ key: `p:${t.id}:${idx}`, destId: t.id, idx, item, cat, km: Math.round(km), lat: item.lat, lon: item.lon });
      });
    }
    // Keep the strongest of each category near the top; cap so the map stays
    // legible. Sorting by strength first means that when the same place was
    // harvested into two overlapping towns, the richer copy is the one kept by
    // the cross-town dedup below.
    const byCat = { beach: [], sight: [], active: [] };
    const seen = new Set();
    out.sort((a, b) => poiScore(b.item) - poiScore(a.item));
    out.forEach((p) => {
      const keys = poiIdentityKeys(p.item);
      if (keys.some((k) => seen.has(k))) return; // same place from another town
      keys.forEach((k) => seen.add(k));
      if (byCat[p.cat].length < 28) byCat[p.cat].push(p);
    });
    return [...byCat.beach, ...byCat.sight, ...byCat.active];
  }, [newStayPoint, exploreTowns, actFull]);


  const togglePoiPick = (p) => {
    setSelPois((prev) => (prev.some((x) => x.key === p.key)
      ? prev.filter((x) => x.key !== p.key)
      : [...prev, { key: p.key, destId: p.destId, idx: p.idx }]));
  };

  /** Reorder the tray by hand. The order matters because it is the order the
   *  day is built in, and the traveller's own sense of what comes first beats
   *  a nearest-neighbour walk often enough to be worth two arrows. */
  const movePick = (key, dir) => {
    setSelPois((prev) => {
      const i = prev.findIndex((x) => x.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  /**
   * "Let Carta plan the rest": hand the builder's tray to the chat planner.
   *
   * Everything picked so far becomes a must-include, so the generated day
   * keeps every one of them rather than proposing its own shortlist over the
   * top. The questions the tray already answers are skipped: the town is the
   * one the picks are in, so asking "which town" after somebody has chosen
   * four places in it is asking them to repeat themselves.
   *
   * With an empty tray this is simply the bot with no preset, which is why
   * the button is offered at zero picks too.
   */
  const letCartaFinish = (rows = []) => {
    const fromTray = rows
      .filter((r) => r.add && r.add.destId != null)
      .map((r) => ({
        key: r.key,
        destId: r.add.destId,
        poiIdx: r.add.idx,
        name: r.name,
        label: r.name,
        lat: r.lat,
        lon: r.lon,
        // The bot pre-ticks its mood questions off `cat`/`kind`, so a tray of
        // four beaches has to arrive saying "beach". Without these the handoff
        // would carry the places over and lose the taste behind them.
        cat: r.kind,
        kind: r.sub || r.kind,
      }));
    if (fromTray.length) {
      // Merge rather than replace: an idea given in step 3 that was never
      // added to the tray is still something the traveller asked for.
      setIdeas((prev) => {
        const have = new Set(prev.map((i) => i.key).filter(Boolean));
        const add = fromTray.filter((i) => !have.has(i.key));
        return add.length ? [...prev, ...add] : prev;
      });
    }
    setLandingStep('chat');
  };

  // Search across EVERYTHING on the explore map at once, towns, sights,
  // beaches & nature and activities, regardless of which filter chips are on,
  // so a place is findable by name even when its category is hidden. Strongest
  // Reopen an existing plan on the builder to change its towns and picks. Its
  // stay and towns are pre-loaded so the screen opens on the same place;
  // hitting the button again updates that plan in place (see below).

  // Every landing step after the first is built around the chosen stay: the
  // date question names it, the explore map is centred on it, the chat plans
  // from it. Starting a plan (or cancelling an edit) clears that answer while
  // the plan itself is on screen, so coming back to the landing used to land
  // on a step whose subject no longer existed: no map, no picks, nothing but
  // a dead "Start planning" button. Losing the stay sends the flow back to
  // the question that asks for one, which is also the only step that lists
  // the day plans already saved.
  useEffect(() => {
    if (!newStayPoint && landingStep !== 'stay') setLandingStep('stay');
  }, [newStayPoint, landingStep, setLandingStep]);

  // Continue sits at the foot of a question, so the screen is scrolled down
  // when the next one renders, with its title under the app header. Each
  // question starts at the top, the way a new page would.
  useEffect(() => {
    const screen = document.querySelector('.day-flow-screen');
    if (screen) screen.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [landingStep]);

  // Start planning from the explore picks. Towns each get their days; picked
  // beaches/sights/activities land pre-assigned on day 1 of their town (they
  // are already specific, so no wizard for them). Towns picked without
  // specific places open with the shape-your-day question exactly as before.
  /**
   * "Build it myself" (D6), carrying step 3's answer into the map.
   *
   * An idea that resolved to a catalogue row already speaks the tray's
   * language: selPois entries are { key, destId, idx } and the explore key
   * format is `p:<destId>:<idx>`, which is exactly what the ideas step
   * minted. Those go straight in, and their towns are added as stops so the
   * places have somewhere to belong.
   *
   * A geocoded idea has no catalogue row to add, so it cannot be a tray pick.
   * Its nearest town joins the stops instead: the traveller lands on a map
   * centred on somewhere their idea actually is, which is the most the manual
   * mode can honour without inventing a POI record for it.
   */
  const goManualWithIdeas = () => {
    const poiIdeas = ideas.filter((i) => i.destId && i.poiIdx != null);
    if (poiIdeas.length) {
      setSelPois((prev) => {
        const have = new Set(prev.map((x) => x.key));
        const add = poiIdeas
          .filter((i) => !have.has(i.key))
          .map((i) => ({ key: i.key, destId: i.destId, idx: i.poiIdx }));
        return add.length ? [...prev, ...add] : prev;
      });
    }
    // Every town an idea implies: the town ideas themselves, the towns the
    // picked POIs were harvested into, and the nearest town to anything that
    // came off the geocoder.
    const townIds = new Set();
    for (const i of ideas) {
      if (i.destId) { townIds.add(i.destId); continue; }
      const near = resolveNearestTown(i.lat, i.lon);
      if (near) townIds.add(near.id);
    }
    if (townIds.size) {
      setNewStops((prev) => {
        const have = new Set(prev.map((s) => s.destinationId));
        const add = [...townIds].filter((id) => !have.has(id)).map((id) => ({ destinationId: id, days: 1 }));
        return add.length ? [...prev, ...add] : prev;
      });
    }
    setLandingStep('manual');
  };
  return { upcomingStays, pickUpcomingStay, recentStays, pickRecentStay, stayCursor, setStayCursor, stayResultRefs, onStayFocus, onStayBlur, onStayKeyDown, DATE_HORIZON_DAYS, dayDateMin, dayDateMax, dayWindowUsable, quickDates, exploreTowns, stayTownId, startName, homeTownId, explorePois, togglePoiPick, movePick, letCartaFinish, goManualWithIdeas };
}
