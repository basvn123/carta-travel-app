import React, { useState } from 'react';
import { ChipGroup, Chip } from '../components/ui/index.js';
import NotYet from '../components/NotYet.jsx';
import { SlopeProfile } from './RouteFigures.jsx';
import { Row } from './Signature.jsx';
import {
  PACES, DEFAULT_PACE, BREAK_MIN_PER_HOUR, paceTime, clock, clockRange,
  sacLabel, trailSacRaw, hasSacSegments, averageGradePct, cycleShapeKey,
  transitModes,
} from '../lib/routeEffort.js';

/**
 * The route facts a walker or a rider sizes a day by (T630), in the one block
 * the trail page and the cycling page share. Every field keeps its slot: a
 * value the wire has is printed, one it does not has the shared placeholder
 * (components/NotYet.jsx) in its place, never a blank.
 *
 *   TrailRouteFacts  SAC grade, low point, average and steepest grade, shape,
 *                    road share, technique, exposure, public transport, the
 *                    underfoot split in percent, the time at four paces and
 *                    the SAC grade along the profile
 *   CycleRouteFacts  riding time, descent, low and high point, average and
 *                    steepest grade, shape, paved, unpaved and traffic-free
 *                    shares
 *
 * The cells reuse the trail page's `.tpage-facts` / `.tpage-fact` classes.
 */

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const pct = (share) => `${Math.round(share * 100)}%`;
const nf = (lang, n, d = 0) => {
  try { return n.toLocaleString(lang, { maximumFractionDigits: d }); } catch { return String(n); }
};

/** One cell: a value, or the placeholder in its place. */
export function RouteCell({ label, value, title, word = false, testId }) {
  const has = value != null && value !== '';
  return (
    <div className="tpage-fact" title={title} data-testid={testId}>
      <span className={`tpage-fact-val ${word ? 'is-word' : ''}`}>{has ? value : <NotYet />}</span>
      <span className="tpage-fact-label">{label}</span>
    </div>
  );
}

const SHAPE_KEY = {
  loop: 'trails.shapeLoop', out_back: 'trails.shapeOutBack',
  point: 'trails.shapePoint', figure8: 'trails.shapeFigure8',
};

const SURFACE_PARTS = [
  ['paved', 'route.surfPaved'], ['gravel', 'route.surfGravel'], ['path', 'route.surfPath'],
  ['other', 'route.surfOther'], ['unknown', 'route.surfUnknown'],
];

/** "Paved 15%, gravel 25%, path 23%" from the five shares, zero parts left
 *  out; null when the wire has no split. */
function surfaceSplitLine(sf, t) {
  if (!sf) return null;
  const parts = SURFACE_PARTS
    .map(([k, key]) => ({ label: t(key), share: Number(sf[k]) || 0 }))
    .filter((p) => p.share >= 0.005);
  if (!parts.length) return null;
  return parts.map((p) => `${p.label} ${pct(p.share)}`).join(', ');
}

/** Technique and exposure carry an OSM word; the page says it in the reader's
 *  language, and keeps an unknown word as it is rather than hiding it. */
function graded(kind, block, t) {
  const worst = block?.worst;
  if (!worst) return null;
  const key = `route.${kind}_${worst}`;
  const word = t(key);
  return word && word !== key ? word : worst;
}

/**
 * The walking time at a chosen pace. The base time is the stored DIN 33466
 * time; the pace is a fixed multiplier and the breaks 10 to 15 minutes per
 * hour of walking (lib/routeEffort.js). The app never recomputes DIN.
 */
export function PaceTime({ baseMin, t }) {
  const [pace, setPace] = useState(DEFAULT_PACE);
  const time = paceTime(baseMin, pace);
  return (
    <div className="tpage-pace" data-testid="route-pace">
      <h3 className="dsk-sub">{t('route.paceTitle')}</h3>
      <ChipGroup label={t('route.paceTitle')}>
        {PACES.map((p) => (
          <Chip key={p.key} kind="choice" selected={pace === p.key} onClick={() => setPace(p.key)}>
            {t(p.labelKey)}
          </Chip>
        ))}
      </ChipGroup>
      <p className="tpage-pace-line" data-testid="route-pace-line" aria-live="polite">
        {time
          ? t('route.paceLine', { walk: clock(time.walk), total: clockRange(time.lo, time.hi, (a, b) => t('route.rangeJoin', { a, b })) })
          : <NotYet />}
      </p>
      <p className="tpage-pace-note">
        {t('route.paceNote', { lo: BREAK_MIN_PER_HOUR[0], hi: BREAK_MIN_PER_HOUR[1] })}
      </p>
    </div>
  );
}

/** The SAC grade along the profile: drawn when the wire has `sac_segments`,
 *  the placeholder until then. */
export function SacProfile({ detail, t }) {
  const segments = detail?.sac_segments;
  const profile = detail?.elevation?.profile;
  const drawn = hasSacSegments(segments) && Array.isArray(profile) && profile.length > 1;
  return (
    <div className="tpage-sacprofile" data-testid="route-sac-profile">
      <h3 className="dsk-sub">{t('route.sacProfile')}</h3>
      {drawn ? (
        <SlopeProfile
          elevation={detail.elevation}
          sacSegments={segments}
          testId="trail-sac"
          labels={{
            row: t('route.sacProfile'),
            aria: t('sig.scrubAria'),
            at: (v) => t('sig.eleAt', v),
            range: (v) => t('sig.eleRange', v),
          }}
        />
      ) : (
        <Row label={t('route.sacGrade')}><NotYet line /></Row>
      )}
    </div>
  );
}

export function TrailRouteFacts({ row, detail, t, lang, isCityDay = false }) {
  const sac = sacLabel(trailSacRaw(row, detail));
  const elev = detail?.elevation;
  const distanceM = detail?.distance_m ?? row?.distance_m;
  const ascentM = detail?.ascent_m ?? row?.ascent_m;
  const avg = averageGradePct({
    distanceM, ascentM, descentM: detail?.descent_m ?? row?.descent_m,
    ascentPerKm: detail?.grade_parts?.ascent_per_km,
  });
  const maxGrade = isNum(elev?.max_grade_pct) ? Math.round(elev.max_grade_pct) : null;
  const shape = row?.f?.rt || detail?.f?.rt || null;
  const roadShare = isNum(detail?.surface?.road_share) ? detail.surface.road_share
    : isNum(row?.f?.road) ? row.f.road : null;
  const technique = graded('tech', detail?.technique, t);
  const exposure = graded('expo', detail?.exposure, t);
  const modes = transitModes(row?.transit || detail?.transit);
  const transitKnown = row?.transit != null || detail?.transit != null;
  const baseMin = detail?.duration_min ?? row?.duration_min;
  const split = surfaceSplitLine(detail?.sf || row?.sf, t);
  // A drawn city day is a walk through a town, not a hike: it keeps its shape
  // cell (as before T630) and none of the mountain fields.
  if (isCityDay) {
    return (
      <div className="tpage-routefacts" data-testid="trail-route-facts">
        <div className="tpage-facts">
          <RouteCell testId="rf-shape" label={t('trails.shapeLabel')}
            value={SHAPE_KEY[shape] ? t(SHAPE_KEY[shape]) : null} word />
        </div>
      </div>
    );
  }
  return (
    <div className="tpage-routefacts" data-testid="trail-route-facts">
      <div className="tpage-facts">
        <RouteCell testId="rf-sac" label={t('route.sacGrade')} value={sac} />
        <RouteCell testId="rf-low" label={t('route.lowPoint')}
          value={isNum(elev?.ele_min_m) ? `${nf(lang, Math.round(elev.ele_min_m))} m` : null} />
        <RouteCell testId="rf-avg" label={t('route.avgGrade')} title={t('route.avgGradeHint')}
          value={avg != null ? `${nf(lang, avg, 1)}%` : null} />
        <RouteCell testId="rf-max" label={t('route.maxGrade')}
          value={maxGrade != null ? `${maxGrade}%` : null} />
        <RouteCell testId="rf-shape" label={t('trails.shapeLabel')}
          value={SHAPE_KEY[shape] ? t(SHAPE_KEY[shape]) : null} word />
        <RouteCell testId="rf-road" label={t('route.wayRoad')}
          value={roadShare != null ? pct(roadShare) : null} />
        <RouteCell testId="rf-technique" label={t('route.technique')} value={technique} word />
        <RouteCell testId="rf-exposure" label={t('route.exposure')} value={exposure} word />
        <RouteCell testId="rf-transit" label={t('route.transit')}
          value={modes.length ? modes.map((m) => t(`route.transit_${m}`)).join(', ')
            : transitKnown ? t('route.transitNone') : null} word />
      </div>
      <p className="tpage-underfoot" data-testid="rf-underfoot">
        <span className="tpage-underfoot-label">{t('route.surfaceTitle')}</span>{' '}
        {split || <NotYet />}
      </p>
      <PaceTime baseMin={baseMin} t={t} />
      <SacProfile detail={detail} t={t} />
    </div>
  );
}

export function CycleRouteFacts({ route, t, lang }) {
  const carta = route?.carta || {};
  const elev = carta.elevation;
  const sf = carta.surface;
  const known = sf && isNum(sf.surface_known_share) ? sf.surface_known_share : null;
  const pavedOk = sf && isNum(sf.paved_share) && (known == null || known >= 0.25);
  const avg = averageGradePct({ distanceM: isNum(route?.km) ? route.km * 1000 : null, ascentM: route?.asc, descentM: route?.desc });
  const shape = cycleShapeKey(route);
  const ride = route?.dur?.min;
  const free = sf && isNum(sf.traffic_free_share) ? sf.traffic_free_share : null;
  return (
    <div className="tpage-routefacts" data-testid="cycle-route-facts-block">
      <div className="tpage-facts">
        <RouteCell testId="rf-ride" label={t('route.rideTime')} title={t('route.rideRule')}
          value={isNum(ride) ? clock(ride) : null} />
        <RouteCell testId="rf-asc" label={t('trails.factAscent')}
          value={isNum(route?.asc) ? `${nf(lang, Math.round(route.asc))} m` : null} />
        <RouteCell testId="rf-desc" label={t('trails.factDescent')}
          value={isNum(route?.desc) ? `${nf(lang, Math.round(route.desc))} m` : null} />
        <RouteCell testId="rf-low" label={t('route.lowPoint')}
          value={isNum(elev?.ele_min_m) ? `${nf(lang, Math.round(elev.ele_min_m))} m` : null} />
        <RouteCell testId="rf-high" label={t('trails.factHigh')}
          value={isNum(elev?.ele_max_m) ? `${nf(lang, Math.round(elev.ele_max_m))} m` : null} />
        <RouteCell testId="rf-avg" label={t('route.avgGrade')} title={t('route.avgGradeHint')}
          value={avg != null ? `${nf(lang, avg, 1)}%` : null} />
        <RouteCell testId="rf-max" label={t('route.maxGrade')}
          value={isNum(elev?.max_grade_pct) ? `${Math.round(elev.max_grade_pct)}%` : null} />
        <RouteCell testId="rf-shape" label={t('trails.shapeLabel')}
          value={SHAPE_KEY[shape] ? t(SHAPE_KEY[shape]) : null} word />
        <RouteCell testId="rf-paved" label={t('route.surfPaved')}
          value={pavedOk ? pct(sf.paved_share) : null} />
        <RouteCell testId="rf-unpaved" label={t('route.surfUnpaved')}
          value={pavedOk ? pct(1 - sf.paved_share) : null} />
        <RouteCell testId="rf-free" label={t('card.vCarFree')}
          value={free != null ? pct(free) : null} />
      </div>
      <p className="tpage-pace-note" data-testid="rf-ride-rule">{t('route.rideRule')}</p>
    </div>
  );
}
