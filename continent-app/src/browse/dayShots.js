/** At most four photographs a day: enough to show where it goes, few
 *  enough that the strip does not become the page. */
export const MAX_PER_DAY = 4;

/**
 * The photographs for one planned day, best claim first.
 *
 * A day's own named sights come first because they are what the day is for.
 * The town it sleeps in fills the rest, so a travel day or a slow last morning
 * still shows the place rather than an empty row. Anything without a name is
 * dropped rather than captioned generically.
 */
export function dayShots(day, detail) {
  const stop = detail.stops[day.stop];
  const out = [];
  const seen = new Set();
  const push = (url, name) => {
    if (!url || !name || seen.has(url) || out.length >= MAX_PER_DAY) return;
    seen.add(url);
    out.push({ url, name });
  };

  const out_ = day.daytrip
    ? (detail.daytrips || []).find((x) => x.dest === day.daytrip)
    : null;
  const pool = out_ ? out_.highlights : (stop?.highlights || []);

  // The sights this day actually names, in the order the plan names them.
  for (const name of day.items || []) {
    const poi = pool.find((h) => h.name === name);
    if (poi?.img) push(poi.img, poi.name);
  }
  // Then the rest of that place's photographed sights.
  for (const poi of pool) {
    if (poi.img) push(poi.img, poi.name);
  }
  // Then the town itself, which is the one picture that is never wrong.
  if (out_?.img) push(out_.img, out_.city);
  if (stop?.img) push(stop.img, stop.city);

  return out;
}
