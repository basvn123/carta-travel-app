/**
 * treks.js, the pure half of the multi-stage trek record (T1184, ROADMAP
 * D24): which trek a trail row belongs to and the numbers its block prints.
 * The loader is lib/trails.js loadTreks; the record is written by
 * pipeline/trails/treks.py (docs/SCHEMA.md "Multi-stage treks").
 */

/** Which country file holds a row's trek: the stage's own pointer, else the
 *  row's country (a published parent row is filed with its first stage). */
export function trekCountry(row) {
  return String(row?.trek?.cc || row?.country || row?.cc || '').toUpperCase();
}

/** The trek a row belongs to, as a stage (`row.trek.id`) or as the trek's
 *  own published parent row (`trek.row`), or null. */
export function trekOfRow(treks, row) {
  if (!row || !Array.isArray(treks)) return null;
  const id = row.trek?.id;
  if (id) return treks.find((t) => t.id === id) || null;
  return treks.find((t) => t.row != null && String(t.row) === String(row.id)) || null;
}

/** The numbers a trek block prints, from the trek record alone: published
 *  stages, kilometres, metres up, days, and the stage numbers missing. A
 *  stage with no distance is counted as a stage and not as kilometres, and
 *  the line says how many were left out rather than rounding them in. */
export function trekTotals(trek) {
  const stages = Array.isArray(trek?.stages) ? trek.stages : [];
  const km = Number.isFinite(trek?.km) ? trek.km
    : stages.reduce((a, s) => a + (Number.isFinite(s.km) ? s.km : 0), 0);
  const up = Number.isFinite(trek?.up) ? trek.up
    : stages.reduce((a, s) => a + (Number.isFinite(s.up) ? s.up : 0), 0);
  return {
    n: stages.length,
    km: Math.round(km),
    up: Math.round(up),
    days: Number.isFinite(trek?.days) && trek.days >= stages.length ? trek.days : stages.length,
    noKm: stages.filter((s) => !Number.isFinite(s.km)).length,
    missing: Array.isArray(trek?.missing) ? trek.missing : [],
  };
}
