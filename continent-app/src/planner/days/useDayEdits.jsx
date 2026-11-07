import { persistPrefs, persistAssignments } from '../dayPlanStore.js';
import { MountainIcon, CloseIcon } from '../../components/Icons.jsx';
import { scenicWalksFor } from '../../lib/scenicWalks.js';
import { formatSteps, kmToSteps } from '../../lib/steps.js';
import { VISIT_PACES } from '../dayDraft.js';
import { useState } from 'react';
import { cityCoords, haversineKm } from '../../lib/runtime_pricing.js';
import { geocodeAddress } from '../../lib/geocode.js';
import { toInboxItems } from '../bookingImport.js';

export function useDayEdits({
  activities, assignments, customPoisFor, dayIdx, lang, plan, prefs, setAssignments,
  setPoiQuery, setPrefs, stop, stopIdx, t,
}) {
  // Iconic walks the traveller pinned onto a day ("the walk itself is the
  // sight"). They aren't POIs with catalogue indices, so they live beside the
  // assignments in the plan's prefs, keyed stop -> day -> walk names, and
  // travel with the plan through the same persist/sync rails.
  const dayWalks = prefs?.dayWalks?.[stopIdx]?.[dayIdx] || [];
  const toggleWalk = (name) => {
    const cur = prefs?.dayWalks?.[stopIdx]?.[dayIdx] || [];
    const next = cur.includes(name) ? cur.filter((w) => w !== name) : [...cur, name];
    const savedPrefs = {
      ...(prefs || {}),
      dayWalks: {
        ...(prefs?.dayWalks || {}),
        [stopIdx]: { ...(prefs?.dayWalks?.[stopIdx] || {}), [dayIdx]: next },
      },
    };
    setPrefs(savedPrefs);
    persistPrefs(plan?.id, savedPrefs);
  };

  // How much of a pinned walk the traveller wants: the full route, about
  // half, or just a taste. Stored per walk beside the pins (prefs.dayWalkLen)
  // so the day plan, the km shown and the PDF all speak the chosen length.
  const WALK_LENGTHS = [
    { key: 1, label: 'Full' },
    { key: 0.5, label: 'Half' },
    { key: 0.25, label: 'Taste' },
  ];
  const walkLenOf = (name) => prefs?.dayWalkLen?.[stopIdx]?.[dayIdx]?.[name] ?? 1;
  const setWalkLen = (name, frac) => {
    const savedPrefs = {
      ...(prefs || {}),
      dayWalkLen: {
        ...(prefs?.dayWalkLen || {}),
        [stopIdx]: {
          ...(prefs?.dayWalkLen?.[stopIdx] || {}),
          [dayIdx]: { ...(prefs?.dayWalkLen?.[stopIdx]?.[dayIdx] || {}), [name]: frac },
        },
      },
    };
    setPrefs(savedPrefs);
    persistPrefs(plan?.id, savedPrefs);
  };
  const walkKmFor = (w, name) => Math.max(0.3, Math.round(w.km * walkLenOf(name) * 10) / 10);

  // The pinned walks as plan rows (shown under today's route, whether or not
  // the day has POI stops yet). Rendered from the walk catalogue so the km
  // and the note stay with the name.
  const pinnedWalksBlock = stop && dayWalks.length > 0 ? (
    <div className="day-plan-walks">
      <div className="day-scenic-title"><MountainIcon size={11} /> {t('dayws.todaysWalk')}</div>
      {dayWalks.map((name) => {
        const w = scenicWalksFor(stop.dest?.city || '').find((x) => x.name === name);
        const frac = walkLenOf(name);
        return (
          <div key={name} className="day-plan-walk">
            <span className="day-plan-walk-text">
              <b>{name}</b>
              {w && (
                <small>
                  {frac < 1
                    ? t('day.walkStepsOf', {
                      n: formatSteps(kmToSteps(walkKmFor(w, name)), lang),
                      total: formatSteps(kmToSteps(w.km), lang),
                    })
                    : t('day.walkSteps', { n: formatSteps(kmToSteps(walkKmFor(w, name)), lang) })}
                  {' '}
                  {w.note}
                </small>
              )}
              {w && (
                <span className="day-walk-len" role="group" aria-label={t('dayws.walkLenAria')}>
                  {WALK_LENGTHS.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      className={`day-walk-len-btn ${frac === o.key ? 'on' : ''}`}
                      onClick={() => setWalkLen(name, o.key)}
                      aria-pressed={frac === o.key}
                      title={t('day.walkLenTitle', {
                        n: formatSteps(kmToSteps(Math.max(0.3, Math.round(w.km * o.key * 10) / 10)), lang),
                      })}
                    >{o.label}</button>
                  ))}
                </span>
              )}
            </span>
            <button
              className="trip-stop-remove"
              onClick={() => toggleWalk(name)}
              aria-label={t('dayws.removeWalk')}
              title={t('day.remove')}
            ><CloseIcon size={12} /></button>
          </div>
        );
      })}
    </div>
  ) : null;

  // "How long at each stop" answer scales the visit-time estimates shown on
  // the timeline and in the day total.
  const visitFactor = (VISIT_PACES.find((v) => v.key === prefs?.visit) || VISIT_PACES[1]).factor;

  const commitDay = (nextForDay) => {
    const next = { ...assignments, [stopIdx]: { ...(assignments[stopIdx] || {}), [dayIdx]: nextForDay } };
    setAssignments(next);
    persistAssignments(plan?.id, next);
  };

  // A place the catalogue does not know (Gaisberg, a cousin's restaurant, a
  // spot from an imported itinerary) still belongs on the day. Best effort to
  // pin it for real: one explicit Nominatim lookup scoped to the city; a hit
  // within day-trip range gives it true coordinates, anything else (miss,
  // offline, wrong-country namesake) falls back to the city centre with
  // unmapped:true, so the day keeps scheduling and the row says the location
  // is approximate. Never a thrown error, never a silently-lost place.
  const CUSTOM_POI_MAX_KM = 60;
  const [customBusy, setCustomBusy] = useState(false);
  // `dropIdeaId` folds "and take it out of the import-ideas drawer" into the
  // SAME prefs write: two sequential writes both derived from the same stale
  // `prefs` would have raced, and the loser's change would silently vanish.
  const addCustomPlace = async (rawName, { kind = 'Custom place', note = '', dropIdeaId = null } = {}) => {
    const name = (rawName || '').trim().slice(0, 90);
    if (!name || !stop?.dest || customBusy) return;
    setCustomBusy(true);
    const centre = cityCoords(stop.dest);
    let lat = null;
    let lon = null;
    try {
      const hits = await geocodeAddress(`${name}, ${stop.dest.city}`);
      const near = hits.find((h) => {
        const km = haversineKm(centre.lat, centre.lon, h.lat, h.lon);
        return km != null && km <= CUSTOM_POI_MAX_KM;
      });
      if (near) { lat = near.lat; lon = near.lon; }
    } catch { /* geocoder down: the centre fallback below carries the day */ }
    const unmapped = lat == null;
    const item = {
      id: `c${Date.now()}`,
      name,
      kind,
      desc: note || '',
      lat: unmapped ? centre.lat : lat,
      lon: unmapped ? centre.lon : lon,
      custom: true,
      ...(unmapped ? { unmapped: true } : {}),
    };
    const destKey = stop.destination_id;
    const savedPrefs = {
      ...(prefs || {}),
      customPois: {
        ...(prefs?.customPois || {}),
        [destKey]: [...(prefs?.customPois?.[destKey] || []), item],
      },
      ...(dropIdeaId ? {
        ideaInbox: {
          ...(prefs?.ideaInbox || {}),
          [destKey]: (prefs?.ideaInbox?.[destKey] || []).filter((i) => i.id !== dropIdeaId),
        },
      } : {}),
    };
    // The merged list appends customs at the end, so the new item's index is
    // simply the current length; assign it to today in the same breath.
    const newIdx = activities.items.length;
    const current = assignments[stopIdx]?.[dayIdx] || [];
    const nextAssign = {
      ...assignments,
      [stopIdx]: { ...(assignments[stopIdx] || {}), [dayIdx]: [...current, newIdx] },
    };
    setPrefs(savedPrefs);
    persistPrefs(plan?.id, savedPrefs);
    setAssignments(nextAssign);
    persistAssignments(plan?.id, nextAssign);
    setPoiQuery('');
    setCustomBusy(false);
    return item;
  };

  // ---- Import ideas: documents or a link in, one-tap custom stops out ----
  // Extracted activities wait per destination in prefs.ideaInbox (same rails,
  // same sync as everything else in the plan) until each is added to the open
  // day as a custom place, or discarded.
  const ideaList = prefs?.ideaInbox?.[stop?.destination_id] || [];
  const stageIdeas = (result) => {
    if (!stop) return { filled: 0, staged: 0 };
    const destKey = stop.destination_id;
    const fresh = toInboxItems(result.activities, {
      existingNames: [
        ...ideaList.map((i) => i.name),
        ...customPoisFor(destKey).map((c) => c.name),
      ],
    });
    if (fresh.length) {
      const saved = {
        ...(prefs || {}),
        ideaInbox: { ...(prefs?.ideaInbox || {}), [destKey]: [...ideaList, ...fresh] },
      };
      setPrefs(saved);
      persistPrefs(plan?.id, saved);
    }
    return { filled: 0, staged: fresh.length };
  };
  const discardIdea = (idea) => {
    if (!stop) return;
    const destKey = stop.destination_id;
    const saved = {
      ...(prefs || {}),
      ideaInbox: {
        ...(prefs?.ideaInbox || {}),
        [destKey]: ideaList.filter((i) => i.id !== idea.id),
      },
    };
    setPrefs(saved);
    persistPrefs(plan?.id, saved);
  };
  // What the parse-booking prompt matches against: the one open city.
  const dayImportContext = stop?.dest ? {
    stops: [{
      city: stop.dest.city,
      country: stop.dest.country || '',
      arrive: '',
      nights: 1,
    }],
    groupSize: prefs?.aiGroupSize || 2,
  } : null;
  return { dayWalks, toggleWalk, pinnedWalksBlock, visitFactor, commitDay, customBusy, addCustomPlace, ideaList, stageIdeas, discardIdea, dayImportContext };
}
