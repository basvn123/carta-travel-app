import React, { useMemo } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { count } from '../lib/format.js';
import {
  monthCells, altitudeParts, lakeWedge, compassPoint, ALT_SCALE_M,
} from '../lib/signature.js';

/**
 * The signature visuals, one instrument family (T181, destinations spec 5.5).
 *
 * Each detail page puts one figure in slot 5 of the skeleton and each card
 * one 6 px strip along the bottom of its photograph. They differ in what
 * they measure and not in how they look: every one is a twelve-cell month
 * row or a 100%-wide bar, on --paper-dim, with its figures in mono and one
 * hairline axis under the last row. No section has a colour of its own; the
 * fills are the ink ramp the surface bar already uses (RouteFigures.jsx), so
 * a darker cell always means more of the thing measured.
 *
 *   Instrument      the frame: heading, the --paper-dim panel, a note
 *   Row             one labelled track inside it, caption over track
 *   MonthBars       twelve cells, a bar in each on a fixed scale
 *   MonthAxis       the month initials under the hairline
 *   SpanAxis        the end figures under the hairline of a 100% bar
 *   EmptyTrack      a track with nothing measured in it, said in words
 *   AltitudeBar     a mountain's height with its prominence solid
 *   DepthWedge      a lake's area and greatest depth as one wedge
 *   CompassRosette  which way a beach faces, laid over its map
 *
 * The cards' 6 px strips are the same family in CardStrip.jsx, a file of
 * their own so the list (which ships in the main chunk) does not carry the
 * page figures.
 *
 * Where the data does not hold a reading, the row stays and says so (an
 * EmptyTrack), so the beach's three rows keep their places on the month
 * axis until the sea record exists, and a reader can see what is missing
 * rather than wonder whether it was forgotten.
 */

/** The twelve month initials and names in the reader's language. */
function useMonths() {
  const { lang } = useI18n();
  return useMemo(() => {
    let initial;
    let full;
    try {
      initial = new Intl.DateTimeFormat(lang, { month: 'narrow' });
      full = new Intl.DateTimeFormat(lang, { month: 'long' });
    } catch {
      initial = new Intl.DateTimeFormat('en', { month: 'narrow' });
      full = new Intl.DateTimeFormat('en', { month: 'long' });
    }
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(2026, i, 15));
      return { initial: initial.format(d).toLocaleUpperCase(lang), name: full.format(d) };
    });
  }, [lang]);
}

export function Instrument({ title, kind, note = null, children, className = '' }) {
  return (
    <section className={`sig sig-${kind} ${className}`.trim()} data-testid={`sig-${kind}`}>
      {title && <h2>{title}</h2>}
      <div className="sig-panel">{children}</div>
      {note}
    </section>
  );
}

/** One labelled track: the caption in the sans, its figure in mono. */
export function Row({ label, figure = null, children, className = '' }) {
  return (
    <div className={`sig-row ${className}`.trim()}>
      <div className="sig-cap">
        <span>{label}</span>
        {figure != null && figure !== '' && <span className="mono">{figure}</span>}
      </div>
      {children}
    </div>
  );
}

export function EmptyTrack({ text, tall = false }) {
  return <div className={`sig-empty ${tall ? 'is-tall' : ''}`.trim()}>{text}</div>;
}

export function MonthAxis() {
  const months = useMonths();
  return (
    <ol className="sig-axis sig-axis-months" aria-hidden="true">
      {months.map((m) => <li key={m.name}>{m.initial}</li>)}
    </ol>
  );
}

/**
 * The figures of a 100% bar under its hairline, evenly spaced from 0 to 1
 * of the ruler. Each sits at its share and slides inside its own width by
 * the same share, so the first is flush left, the last flush right and a
 * middle one centred on its point.
 */
export function SpanAxis({ marks }) {
  const n = marks.length;
  return (
    <div className="sig-axis sig-axis-span" aria-hidden="true">
      {marks.map((m, i) => {
        const at = n > 1 ? (i / (n - 1)) * 100 : 0;
        return <span key={m} style={{ left: `${at}%`, transform: `translateX(-${at}%)` }}>{m}</span>;
      })}
    </div>
  );
}

/**
 * Twelve bars on the shared temperature scale. Cells at or above the
 * threshold are filled, the rest are outlines, and the warmest month carries
 * its figure at the crest. `cellsClass` lets a page keep a class a harness
 * reads (the lake's .lpage-months).
 */
export function MonthBars({ values, threshold, unit = '°', label, cellsClass = '' }) {
  const months = useMonths();
  const cells = monthCells(values, { threshold });
  if (!cells) return null;
  return (
    <ol className={`sig-cells ${cellsClass}`.trim()} aria-label={label}>
      {cells.map((c) => (
        <li
          key={c.n}
          className={`sig-cell ${c.on ? 'is-on' : ''} ${c.peak ? 'is-peak' : ''}`.trim()}
          aria-label={`${months[c.n - 1].name}, ${Math.round(c.value)}${unit}`}
        >
          <span className="sig-bar" style={{ height: `${Math.max(4, c.h * 100)}%` }}>
            {c.peak && <span className="sig-crest mono" aria-hidden="true">{`${Math.round(c.value)}${unit}`}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ── Mountains ─────────────────────────────────────────────────────────── */

// Three marks, as on every other 100% bar: the ends and the middle.
const ALT_MARKS = [0, ALT_SCALE_M / 2, ALT_SCALE_M];

/** Height on the 0 to 5,000 m ruler, the prominence part solid. The card's
 *  6 px version is CardStrip.jsx, kept apart so the list does not load this
 *  file. */
export function AltitudeBar({ ele, prom, label }) {
  const parts = altitudeParts(ele, prom);
  if (!parts) return null;
  return (
    <>
      <span className="sig-span" role="img" aria-label={label}>
        <span className="sig-seg is-base" style={{ width: `${parts.base * 100}%` }} />
        <span className="sig-seg is-prom" style={{ width: `${parts.prom * 100}%` }} />
      </span>
      <SpanAxis marks={ALT_MARKS.map((m, i) => (i === ALT_MARKS.length - 1 ? `${count(m)} m` : count(m)))} />
    </>
  );
}

/* ── Lakes ─────────────────────────────────────────────────────────────── */

/**
 * The lake as a wedge hanging from its surface line: as wide as the square
 * root of its area and as deep as its greatest depth, on the two fixed log
 * scales of lib/signature.js. Drawn as a shape, not a measured bed: the note
 * under the instrument says the cross-section is not in the data.
 */
export function DepthWedge({ areaKm2, depthM, label }) {
  const g = lakeWedge(areaKm2, depthM);
  if (!g) return null;
  const W = 320;
  const H = 72;
  const w = g.w * W;
  const h = g.h * H;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sig-wedge" role="img" aria-label={label} preserveAspectRatio="none">
      <polygon points={`0,0 ${w.toFixed(1)},0 ${(w / 2).toFixed(1)},${h.toFixed(1)}`} className="sig-wedge-fill" />
      <line x1="0" y1="0.5" x2={W} y2="0.5" className="sig-wedge-surface" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ── Beaches ───────────────────────────────────────────────────────────── */

/**
 * Which way the beach faces (its `aspect`, the outward normal of the shore,
 * in degrees from north), laid over the map in the corner. A filled wedge
 * on a hairline circle, north marked: one glance, no legend.
 */
export function CompassRosette({ deg, label }) {
  if (compassPoint(deg) == null) return null;
  const r = 15;
  const c = 24;
  const half = 22.5;
  const rad = (a) => ((a - 90) * Math.PI) / 180;
  const p = (a, rr) => `${(c + rr * Math.cos(rad(a))).toFixed(1)},${(c + rr * Math.sin(rad(a))).toFixed(1)}`;
  return (
    <span className="sig-rosette" role="img" aria-label={label}>
      <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
        <circle cx={c} cy={c} r={r} className="sig-rosette-ring" />
        <line x1={c} y1={c - r} x2={c} y2={c - r + 4} className="sig-rosette-tick" />
        <polygon points={`${c},${c} ${p(deg - half, r)} ${p(deg + half, r)}`} className="sig-rosette-wedge" />
        <text x={c} y={c - r - 2.5} className="sig-rosette-n" textAnchor="middle">N</text>
      </svg>
    </span>
  );
}

/* ── The three place pages ─────────────────────────────────────────────── */

/**
 * The beach's three month rows on one axis (destinations spec D7): sea
 * temperature, wave height, crowds. Reading down one column answers "what
 * is August like here". None of the three is in the beach wire yet (no
 * Copernicus sea or wave record, and crowding is annual and per region),
 * so every row shows its empty track and the note says so plainly. When a
 * row's twelve values arrive, it takes a MonthBars like the lake's.
 */
export function BeachSignature({ beach }) {
  const { t } = useI18n();
  if (!beach) return null;
  const rows = [
    { key: 'sea', label: t('sig.rowSea') },
    { key: 'waves', label: t('sig.rowWaves') },
    { key: 'crowds', label: t('sig.rowCrowds') },
  ];
  return (
    <Instrument
      kind="beach"
      title={t('sig.beachHead')}
      note={<p className="sig-note">{t('sig.beachNote')}</p>}
    >
      {rows.map((r) => (
        <Row key={r.key} label={r.label}>
          <EmptyTrack text={t('sig.notMeasured')} />
        </Row>
      ))}
      <MonthAxis />
    </Instrument>
  );
}

/**
 * The lake: the estimated water temperature by month (cells at or above the
 * swim threshold filled, the warmest month's figure at its crest) over the
 * month axis, then the depth-versus-area wedge. The estimate label stays in
 * the note the lake harness reads (.lpage-season .bpage-note); the season in
 * words is already in the swim banner above, so it is not repeated here.
 */
export function LakeSignature({ lake, warmC = 18 }) {
  const { t } = useI18n();
  if (!lake) return null;
  const temps = lake.swim?.temps;
  const hasTemps = Array.isArray(temps) && temps.length === 12;
  const peak = lake.swim?.season?.peak;
  const area = lake.size?.areaKm2;
  const depth = lake.size?.depthM;
  const fmtArea = (a) => (a >= 10 ? count(a) : String(Math.round(a * 100) / 100));
  const hasWedge = lakeWedge(area, depth) != null;
  return (
    <Instrument
      kind="lake"
      className="lpage-season"
      title={t('sig.lakeHead')}
      note={(
        <>
          {hasTemps && (
            <p className="bpage-note sig-note">{t('lake.seasonNote')}</p>
          )}
          {hasWedge && <p className="sig-note">{t('sig.depthNote')}</p>}
        </>
      )}
    >
      <Row
        label={t('sig.rowWater')}
        figure={hasTemps && Number.isFinite(peak) ? `${Math.round(peak)} °C` : null}
      >
        {hasTemps
          ? <MonthBars values={temps} threshold={warmC} unit="°" label={t('sig.waterAria')} cellsClass="lpage-months" />
          : <EmptyTrack text={t('sig.notMeasured')} tall />}
      </Row>
      <MonthAxis />
      <Row
        label={t('sig.rowDepth')}
        figure={hasWedge ? t('sig.depthFig', { km2: fmtArea(area), m: count(depth) }) : null}
        className="sig-row-gap"
      >
        {hasWedge
          ? <DepthWedge areaKm2={area} depthM={depth} label={t('sig.depthAria', { km2: fmtArea(area), m: count(depth) })} />
          : <EmptyTrack text={t('sig.depthNone')} />}
      </Row>
    </Instrument>
  );
}

/**
 * The mountain: its height on the shared 0 to 5,000 m ruler with the
 * prominence solid (spec F6), the horizon row (spec F4, not computed yet,
 * so an empty track), and the existing season strip as the month row.
 */
export function MountainSignature({ mountain, season = null }) {
  const { t } = useI18n();
  if (!mountain) return null;
  const hasAlt = altitudeParts(mountain.ele, mountain.prom) != null;
  const ele = count(mountain.ele);
  const prom = count(Math.min(mountain.prom ?? 0, mountain.ele ?? 0));
  return (
    <Instrument
      kind="mountain"
      title={t('sig.mtnHead')}
      note={hasAlt ? <p className="sig-note">{t('sig.altNote')}</p> : null}
    >
      <Row label={t('sig.rowAlt')} figure={hasAlt ? t('sig.altFig', { ele, prom }) : null}>
        {hasAlt
          ? <AltitudeBar ele={mountain.ele} prom={mountain.prom} label={t('sig.altAria', { ele, prom })} />
          : <EmptyTrack text={t('sig.notMeasured')} />}
      </Row>
      <Row label={t('sig.rowHorizon')} className="sig-row-gap">
        <EmptyTrack text={t('sig.notComputed')} tall />
      </Row>
      {season && (
        <Row label={t('mtn.seasonHead')} className="sig-row-gap">
          {season}
        </Row>
      )}
    </Instrument>
  );
}
