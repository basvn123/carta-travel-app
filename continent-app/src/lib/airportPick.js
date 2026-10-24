// T651: which airport the Nearest airport stat names, from one place.
//
// getting.airports[] = { iata, straight_km, road_km, ryanair,
//   options: [{ mode, minutes, source }], transfer_min, transfer_mode,
//   transfer_source }. A road option is { mode: 'car', source:
// 'road_estimate' }: a distance divided by a speed, with no timetable behind
// it. A public transport option has a timetable source (gtfs).
//
// Best airport = the shortest public transport option anywhere, else the
// shortest road estimate. A road estimate is worded "by road": it does not
// claim a car, a taxi or a shuttle, and the data has no shuttle (T642-c).

export const ROAD_SOURCE = 'road_estimate';

const num = (n) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null);
const isRoad = (o) => o.source === ROAD_SOURCE;

/** The i18n key of a mode name: 'train+bus' is its own word. */
export const modeKey = (mode) => `mode.${String(mode).replace('+', '_')}`;

/** All options of the airports as { iata, minutes, mode, source, road }. */
export function airportOptions(airports) {
  const out = [];
  for (const a of airports || []) {
    if (!a?.iata) continue;
    for (const o of a.options || []) {
      const minutes = num(o?.minutes);
      if (minutes == null || !o.mode) continue;
      out.push({ iata: a.iata, minutes, mode: o.mode, source: o.source || null, road: isRoad(o) });
    }
  }
  return out;
}

const shortest = (xs) => xs.reduce((b, x) => (b == null || x.minutes < b.minutes ? x : b), null);

/**
 * The airport to name: { iata, minutes, mode, source, road }, or null when the
 * place has no airport. `minutes` and `mode` are null when the data has none
 * (the caller shows the placeholder, never a default mode).
 */
export function pickAirport(getting) {
  const opts = airportOptions(getting?.airports);
  const best = shortest(opts.filter((o) => !o.road)) || shortest(opts);
  if (best) return best;
  // No option list (an older record): the single transfer the record carries.
  const iata = getting?.airport || getting?.airports?.[0]?.iata || null;
  if (!iata) return null;
  const rec = (getting?.airports || []).find((a) => a.iata === iata) || getting;
  const road = rec.transfer_source === ROAD_SOURCE;
  return {
    iata,
    minutes: num(rec.transfer_min),
    mode: rec.transfer_mode || null,
    source: rec.transfer_source || null,
    road,
  };
}

/** One option of the full list: "146 min by train" or "60 min by road, estimate". */
export function airportOptionLabel(o, t) {
  return o.source === ROAD_SOURCE
    ? t('dest.airportOptRoad', { n: o.minutes })
    : t('dest.airportOpt', { n: o.minutes, mode: t(modeKey(o.mode)) });
}

/**
 * The stat as words: "BGY, 60 min by road", "MXP, 206 min by train", the
 * bare code while there is no time, or the code, the time and `placeholder`
 * when there is a time but no mode. `placeholder` is the NotYet word.
 */
export function airportLine(pick, t, placeholder) {
  if (!pick) return null;
  if (pick.minutes == null) return pick.iata;
  if (pick.road) return t('dest.keyAirportValueRoad', { iata: pick.iata, n: pick.minutes });
  if (pick.mode) return t('dest.keyAirportValue', { iata: pick.iata, n: pick.minutes, mode: t(modeKey(pick.mode)) });
  return t('dest.keyAirportNoMode', { iata: pick.iata, n: pick.minutes, mode: placeholder });
}

/** The same for Getting there's lead row: "Fly to BGY, then 60 min by road". */
export function flyLine(pick, t, placeholder) {
  if (!pick) return null;
  if (pick.minutes == null) return t('dest.flyTo', { iata: pick.iata });
  if (pick.road) return t('dest.flyToWithRoad', { iata: pick.iata, n: pick.minutes });
  if (pick.mode) return t('dest.flyToWithTransfer', { iata: pick.iata, n: pick.minutes, mode: t(modeKey(pick.mode)) });
  return t('dest.flyToTransferNoMode', { iata: pick.iata, n: pick.minutes, mode: placeholder });
}
