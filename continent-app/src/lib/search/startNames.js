/**
 * The start town's name in every UI language (fixes-r1, with Lane 3's E7).
 * A start picked through search carries its names (`start_names`); the
 * default home town and "here" do not, so they read "Brussels" in Dutch.
 * This looks the town up in the gazetteer by its name near its position
 * and returns `{ nl: 'Brussel', fr: 'Bruxelles', ... }`, fetched lazily (one
 * shard) and cached per town. No answer is null: the English name stays.
 */
import React from 'react';
import { foldName } from '../searchIndex.js';
import { loadTownsFor } from './gazetteer.js';
import { cityPart, kmBetween } from './places.js';

const NEAR_KM = 30;
const cache = new Map();

/** The town's names per language, or null (pure over the towns given). */
export function namesFromTowns(towns, name, lat, lon) {
  const want = foldName(cityPart(name));
  let best = null;
  for (const t of towns || []) {
    if (!t.folds.includes(want)) continue;
    if (typeof lat === 'number' && typeof lon === 'number' && kmBetween(lat, lon, t.lat, t.lon) > NEAR_KM) continue;
    if (!best || t.pop > best.pop) best = t;
  }
  if (!best) return null;
  const names = { ...(best.l || {}) };
  // A language with no name of its own shows the town's main name.
  return Object.keys(names).length ? names : null;
}

export function townNames(name, lat, lon) {
  const key = `${foldName(name)}@${Math.round((lat || 0) * 10)},${Math.round((lon || 0) * 10)}`;
  if (!cache.has(key)) {
    cache.set(key, loadTownsFor(cityPart(name))
      .then((towns) => namesFromTowns(towns, name, lat, lon))
      .catch(() => null));
  }
  return cache.get(key);
}

/** Where the model's start town is: the picked or home town, else the
 *  origin airport's city. Null for a country start (Intl names those). */
export function startTown(model, data) {
  if (!model || model.originKind === 'country') return null;
  const p = model.fromPlace;
  if (p?.name) return { name: p.name, lat: p.lat, lon: p.lon };
  const o = data?.meta?.origins?.[model.origin];
  return o ? { name: o.city || o.name || '', lat: o.lat, lon: o.lon } : null;
}

/**
 * The model with `startNames` filled in from the gazetteer when the start
 * has none of its own. Same object until the names arrive, so nothing
 * re-renders for nothing.
 */
export function useStartNames(model, data) {
  const town = startTown(model, data);
  const has = !!model?.startNames && Object.keys(model.startNames).length > 0;
  const key = town && !has ? `${town.name}|${town.lat}|${town.lon}` : '';
  const [found, setFound] = React.useState({ key: '', names: null });
  React.useEffect(() => {
    if (!key) return undefined;
    let live = true;
    townNames(town.name, town.lat, town.lon).then((names) => { if (live) setFound({ key, names }); });
    return () => { live = false; };
    // key holds the town
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return React.useMemo(
    () => (key && found.key === key && found.names ? { ...model, startNames: found.names } : model),
    [model, key, found],
  );
}
