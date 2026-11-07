/**
 * The way back for a one-way walk (T1185, ROADMAP D24): the pure half. The
 * record is pipeline/trails/way_back.py's (`wb`, docs/SCHEMA.md "Way back").
 * Nothing here invents a number: a time we do not have is not returned, and
 * a public transport time is never returned at all (no timetable feed).
 */

/** Minutes as the unit the copy wants: {h, min} split, hours dropped at 0. */
export function splitMinutes(total) {
  const m = Math.max(0, Math.round(Number(total) || 0));
  return { h: Math.floor(m / 60), min: m % 60 };
}

/** The record that applies to a trail page: the row's own, else its trek's
 *  (a trek stage is walked as part of the whole). `viaTrek` says which. */
export function wayBackFor(row, trek) {
  if (row?.trek && trek?.wb) return { wb: trek.wb, viaTrek: true };
  if (row?.wb) return { wb: row.wb, viaTrek: false };
  if (trek?.wb && trek.row != null && String(trek.row) === String(row?.id)) return { wb: trek.wb, viaTrek: true };
  return { wb: null, viaTrek: false };
}

/** What the block prints, in order: public transport first when a stop of
 *  one kind sits at both ends (cheapest, no times), then the taxi, then the
 *  walk. `pt` is 'both' | 'none' | 'unknown'. */
export function wayBackPlan(wb) {
  if (!wb || !Number.isFinite(wb.km)) return null;
  const pt = !wb.pt ? 'unknown' : (wb.pt.both?.length ? 'both' : 'none');
  return {
    km: wb.km,
    pt,
    modes: wb.pt?.both || [],
    taxi: wb.taxi && Number.isFinite(wb.taxi.min) ? wb.taxi : null,
    walk: wb.walk && (Number.isFinite(wb.walk.km) || Number.isFinite(wb.walk.min)) ? wb.walk : null,
  };
}
