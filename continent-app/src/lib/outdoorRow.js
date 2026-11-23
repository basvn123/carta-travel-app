/**
 * outdoorRow.js, the one reader of an outdoor row's facts (REQ-data-4, D7, D24).
 *
 * The pipeline stamps every Around and nearby row with `o`
 * = {v5:{score,band,rank}, g, d, up_m, km, min, rt} (pipeline/outdoor_row.py;
 * HANDBOOK "Outdoor row and grade vocabulary", docs/SCHEMA.md Around row). A
 * key is absent when the kind has no such fact, never 0 and never null, so
 * absent here means unknown. The legacy keys (`v5`, `score`, `difficulty`,
 * `f`, `km_len`, `ascent_m`, `descent_m`, `duration_min`, `dur`) ride along one
 * release, and a dossier built before the stamp has only those, so each fact
 * reads `o` first and falls back to them. NearPage, destOverview and
 * AroundHere read through here and nowhere else.
 */
import { natureRating } from './rating.js';
import { trailClimb, gradeLabelKey } from './trailStory.js';

const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const first = (...xs) => xs.find((x) => x != null) ?? null;

/** The facts of a row, `null` where unknown. `km` is the route's length, not
 *  the distance from the place (that is the row's own `km`). */
export function outdoorRow(row) {
  const o = row?.o || {};
  const v5 = o.v5 || {};
  const old = row?.v5 || {};
  const climb = trailClimb({ ascent_m: first(num(o.up_m), num(row?.ascent_m)), descent_m: num(row?.descent_m) });
  return {
    score: first(num(v5.score), num(old.score), num(row?.score)),
    band: first(v5.band, old.band),
    rank: first(v5.rank, old.rank),
    grade: first(o.g, row?.f?.g, row?.difficulty),
    days: first(num(o.d), num(row?.f?.d), num(row?.days)),
    // Read uphill: a line drawn summit to valley stores its descent as the climb.
    upM: climb.up,
    km: first(num(o.km), num(row?.km_len)),
    minutes: first(num(o.min), num(row?.duration_min), num(row?.dur?.min)),
    shape: first(o.rt, row?.f?.rt, row?.is_loop === true || row?.loop === true ? 'loop' : null),
  };
}

/** The score a list sorts on, or -1 for an unscored row. */
export function outdoorScore(row) {
  return outdoorRow(row).score ?? -1;
}

/** The rating the score chip draws: `o` wins on score, band and rank, the
 *  legacy v5 block still supplies confidence and facts. */
export function outdoorRating(row) {
  const o = row?.o?.v5;
  if (!o || row?.v5?.confidence === 'unscored') return natureRating(row);
  return natureRating({ ...row, v5: { ...row?.v5, ...o } });
}

/** The label key for a walk's grade, or `trails.gradeLong` for a multi-day
 *  walk on easy ground: trailStory's rule, fed the grade and days read here. */
export function outdoorGradeKey(row) {
  const { grade, days } = outdoorRow(row);
  return gradeLabelKey({ f: { g: grade, d: days } });
}
