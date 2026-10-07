/**
 * The number translation table (T158, destinations spec 4.2).
 *
 * A figure alone is a database cell. This table says, for every metric the
 * product surfaces, what the figure means in a sentence a person would say.
 * The figure stays in mono where it is shown; the sentence goes next to it
 * in sans. A new surfaced metric is added HERE, with its sentences in the
 * six catalogues, in the same commit that surfaces it: tests/numberSentences
 * fails if a metric lacks a say(), a sentence key or a translation.
 *
 * Each metric has:
 *   keys   every catalogue key its say() can return, so a test can check the
 *          six catalogues without guessing
 *   say    (value, ctx) -> { key, vars } or null. `ctx.fmt(n)` formats a
 *          number for the reader's locale. Null means "no sentence", never
 *          an invented one.
 *   source where the value comes from, so a maintainer finds the field
 *
 * `numberSentence(metric, value, ctx, t)` is the one door a screen uses.
 */

const band = (v, cuts) => cuts.findIndex((c) => v >= c);

const k = (metric, names) => names.map((n) => `num.${metric}.${n}`);
const fin = (v) => Number.isFinite(v);

export const NUMBER_SENTENCES = {
  // Mountain pages: lib/mountains.js rows, shown in MountainPage facts.
  height: {
    source: 'mountain.ele (m)',
    keys: k('height', ['low', 'mid', 'high']),
    say: (v, c) => {
      if (!fin(v)) return null;
      const name = v < 1000 ? 'low' : v < 2500 ? 'mid' : 'high';
      return { key: `num.height.${name}`, vars: { m: c.fmt(Math.round(v)) } };
    },
  },
  prominence: {
    source: 'mountain.prom (m)',
    keys: k('prominence', ['alone', 'clear', 'ridge']),
    say: (v, c) => {
      if (!fin(v)) return null;
      const name = v >= 600 ? 'alone' : v >= 150 ? 'clear' : 'ridge';
      return { key: `num.prominence.${name}`, vars: { m: c.fmt(Math.round(v)) } };
    },
  },
  isolation: {
    source: 'mountain.isoKm (km)',
    keys: k('isolation', ['far', 'mid', 'near']),
    say: (v, c) => {
      if (!fin(v)) return null;
      const name = v >= 30 ? 'far' : v >= 5 ? 'mid' : 'near';
      return { key: `num.isolation.${name}`, vars: { km: c.fmt(v) } };
    },
  },
  difficulty: {
    source: 'mountain.diff.k, the easiest way up',
    keys: k('difficulty', ['walkUp', 'hike', 'mountainHike', 'scramble', 'alpine', 'viaFerrata', 'technical']),
    say: (v) => (typeof v === 'string' && /^(walkUp|hike|mountainHike|scramble|alpine|viaFerrata|technical)$/.test(v)
      ? { key: `num.difficulty.${v}`, vars: {} } : null),
  },
  viewArea: {
    source: 'mountain.view.km2 (land in sight within 30 km)',
    keys: k('viewArea', ['all']),
    say: (v, c) => (fin(v) && v > 0 ? { key: 'num.viewArea.all', vars: { km2: c.fmt(Math.round(v)) } } : null),
  },
  // Route pages.
  pavedShare: {
    source: 'cycling surface.paved_share, as a percentage 0 to 100',
    keys: k('pavedShare', ['all', 'most', 'mixed', 'rough']),
    say: (v) => {
      if (!fin(v)) return null;
      const name = ['all', 'most', 'mixed', 'rough'][band(v, [95, 70, 35, -Infinity])];
      return { key: `num.pavedShare.${name}`, vars: {} };
    },
  },
  trafficFree: {
    source: 'cycling surface.traffic_free_share, as a percentage 0 to 100',
    keys: k('trafficFree', ['most', 'some', 'little']),
    say: (v) => {
      if (!fin(v)) return null;
      const name = ['most', 'some', 'little'][band(v, [80, 30, -Infinity])];
      return { key: `num.trafficFree.${name}`, vars: {} };
    },
  },
  maxGrade: {
    source: 'trail detail.elevation.max_grade_pct',
    keys: k('maxGrade', ['gentle', 'steady', 'steep', 'brutal']),
    say: (v) => {
      if (!fin(v)) return null;
      const name = ['brutal', 'steep', 'steady', 'gentle'][band(v, [25, 15, 8, -Infinity])];
      return { key: `num.maxGrade.${name}`, vars: {} };
    },
  },
  // The trail page already writes this one as a sentence (trailStory.js
  // SAC_KEY); the table points at those keys so the words live once.
  sacScale: {
    source: 'trail sac_scale, in trailStory.js SAC_KEY',
    keys: ['trails.sSacStrolling', 'trails.sSacHiking', 'trails.sSacMountain'],
    say: (v) => {
      const key = {
        strolling: 'trails.sSacStrolling',
        hiking: 'trails.sSacHiking',
        mountain_hiking: 'trails.sSacMountain',
        demanding_mountain_hiking: 'trails.sSacMountain',
      }[v];
      return key ? { key, vars: {} } : null;
    },
  },
  // Destination pages: the dossier's water section.
  bathingWater: {
    source: 'dossier water.excellent_pct, the share of measured sites rated excellent',
    keys: k('bathingWater', ['nearAll', 'most', 'few']),
    say: (v) => {
      if (!fin(v)) return null;
      const name = ['nearAll', 'most', 'few'][band(v, [90, 50, -Infinity])];
      return { key: `num.bathingWater.${name}`, vars: {} };
    },
  },
};

export const NUMBER_METRICS = Object.keys(NUMBER_SENTENCES);

/**
 * The sentence for one figure, or '' when the metric is unknown or the figure
 * cannot be read. `lang` is the locale tag used to format numbers.
 */
export function numberSentence(metric, value, { t, lang = 'en' }) {
  const m = NUMBER_SENTENCES[metric];
  if (!m || typeof t !== 'function') return '';
  const fmt = (n) => Number(n).toLocaleString(lang);
  const out = m.say(value, { fmt });
  return out ? t(out.key, out.vars) : '';
}
