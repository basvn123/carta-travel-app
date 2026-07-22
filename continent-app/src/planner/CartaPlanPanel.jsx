import React, { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import {
  DAY_STYLES, DAY_LENGTHS, WALK_LEVELS, cityAreaOptions,
  feasibilityLimits, routeCandidates, poiRating,
} from './dayDraft.js';
import { fmtDur } from './dayFormat.js';
import {
  SparkIcon, CastleIcon, MuseumIcon, TreeIcon, DiningIcon, CameraIcon,
} from '../components/Icons.jsx';

const STYLE_ICONS = {
  classic: CastleIcon,
  culture: MuseumIcon,
  active: TreeIcon,
  foodie: DiningIcon,
  mix: CameraIcon,
};

// One "pace" answer instead of two separate knobs (how much to do + how long
// per stop): each choice sets both, so it stays a single intuitive decision.
const PACE_CHOICES = [
  { key: 'relaxed', labelKey: 'shape.paceRelaxed', label: 'Take it easy', fill: 'light', visit: 'deep' },
  { key: 'balanced', labelKey: 'shape.paceBalanced', label: 'A good balance', fill: 'balanced', visit: 'standard' },
  { key: 'packed', labelKey: 'shape.pacePacked', label: 'See a lot', fill: 'packed', visit: 'quick' },
];
const paceFromPrefs = (initial) => {
  if (initial?.fill === 'light') return 'relaxed';
  if (initial?.fill === 'packed') return 'packed';
  return 'balanced';
};

/**
 * The route picker, the replacement for the old "Let Carta plan your day"
 * one-shot draft. Same compact questions (kind of day, which part of town,
 * day length, walking, pace), but instead of one invisible draft the answers
 * RANK a handful of predefined, rating-researched routes (see ROUTE_THEMES in
 * dayDraft.js). The traveller reads what each route actually holds, picks
 * one, and can modify it afterwards like any hand-built day.
 *
 * It fills the SELECTED day ("Shape day 3"), or every day of this city when
 * the traveller flips the scope chip, never other cities of the plan.
 *
 *   city        city name (copy only), cityDest  the destination record
 *   dayNumber   trip-wide day number of the selected day (copy only)
 *   numDays     how many days this city holds (scope chip appears when > 1)
 *   items       the city's activity list; walkable  Set of eligible indices
 *   excludeIdx  Set of indices already used on the city's OTHER days, so a
 *               single-day route never re-plans what another day already holds
 *   stayPoint   { lat, lon } of the traveller's stay, when it's in this city
 *   initial     previously saved prefs, to seed the defaults
 *   onDraft(p)  p = { scope: 'day'|'stay', style, interests, dayLen, walk,
 *               fill, visit, areaKey, areaIdx: Set|null, lists: [[idx,..],..] }
 *   onClose()   dismiss without drafting
 */
export function CartaPlanPanel({
  city, cityDest, dayNumber, numDays, items, walkable, excludeIdx, stayPoint,
  initial, onDraft, onClose,
}) {
  const { t } = useI18n();
  const [scope, setScope] = useState('day');
  const [styleKey, setStyleKey] = useState(initial?.style || 'mix');
  const [dayLen, setDayLen] = useState(initial?.dayLen || 'full');
  const [walk, setWalk] = useState(initial?.walk || 'moderate');
  const [pace, setPace] = useState(() => paceFromPrefs(initial));

  const areaOptions = useMemo(
    () => cityAreaOptions(items, cityDest, stayPoint, walkable),
    [items, cityDest, stayPoint, walkable],
  );
  // Lead with the centre when the city is big enough to ask; 'all' otherwise.
  const [areaKey, setAreaKey] = useState(() => (
    (initial?.areaKey && areaOptions.some((o) => o.key === initial.areaKey))
      ? initial.areaKey
      : areaOptions[0].key
  ));
  const area = areaOptions.find((o) => o.key === areaKey) || areaOptions[areaOptions.length - 1];

  const style = DAY_STYLES.find((s) => s.key === styleKey) || DAY_STYLES[4];
  const paceChoice = PACE_CHOICES.find((p) => p.key === pace) || PACE_CHOICES[1];

  // The predefined routes, rebuilt live as the answers change: the feasibility
  // answers bound every candidate, the style answer decides which theme leads.
  const routes = useMemo(() => {
    if (!items || !items.length) return [];
    const limits = feasibilityLimits({ dayLen, walk, fill: paceChoice.fill, visit: paceChoice.visit });
    const base = area.key === 'all' ? walkable : area.idx;
    const eligible = (scope === 'day' && excludeIdx && excludeIdx.size)
      ? new Set([...(base || [])].filter((i) => !excludeIdx.has(i)))
      : base;
    return routeCandidates({
      items,
      numDays: scope === 'stay' ? Math.max(1, numDays || 1) : 1,
      eligibleIdx: eligible || null,
      limits: { stopsMax: limits.stopsMax, budgetMin: limits.budgetMin, maxKmFromCentroid: limits.maxKmFromCentroid },
      dwellFactor: limits.dwellFactor,
      styleKey,
    });
  }, [items, walkable, excludeIdx, scope, numDays, area, dayLen, walk, paceChoice, styleKey]);

  const pick = (route) => {
    onDraft({
      scope,
      style: styleKey,
      interests: style.interests,
      dayLen,
      walk,
      fill: paceChoice.fill,
      visit: paceChoice.visit,
      areaKey: area.key,
      areaIdx: area.key === 'all' ? null : area.idx,
      lists: route.lists,
    });
  };

  // A labelled row of small chips, every question reads the same way.
  const chipRow = (label, options, activeKey, onPick) => (
    <div className="carta-plan-row">
      <span className="carta-plan-q">{label}</span>
      <div className="carta-plan-chips">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`carta-plan-chip ${activeKey === o.key ? 'on' : ''}`}
            onClick={() => onPick(o.key)}
            aria-pressed={activeKey === o.key}
            title={o.desc || undefined}
          >
            {o.labelKey ? t(o.labelKey) : o.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="trip-block carta-plan-panel">
      <div className="carta-plan-head">
        <span className="carta-plan-title">
          <SparkIcon size={13} /> {t('shape.title', { n: dayNumber, city })}
        </span>
        <button className="carta-plan-close" onClick={onClose} aria-label={t('shape.close')} title={t('shape.close')}>×</button>
      </div>
      <p className="carta-plan-lead">
        {t('shape.lead')}
      </p>

      {numDays > 1 && chipRow(t('shape.plan'), [
        { key: 'day', label: t('shape.justDay', { n: dayNumber }) },
        { key: 'stay', label: t('shape.allDaysHere', { n: numDays }) },
      ], scope, setScope)}

      <div className="carta-plan-row">
        <span className="carta-plan-q">{t('shape.kindOfDay')}</span>
        <div className="day-guide-moods carta-plan-moods">
          {DAY_STYLES.map((s) => {
            const Icon = STYLE_ICONS[s.key] || SparkIcon;
            return (
              <button
                key={s.key}
                type="button"
                className={`day-guide-mood ${styleKey === s.key ? 'on' : ''}`}
                onClick={() => setStyleKey(s.key)}
                aria-pressed={styleKey === s.key}
                title={s.desc}
              >
                <Icon size={16} />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* The large-city question: where should the day focus? Only shows when
          the catalogue genuinely sprawls beyond the centre. */}
      {areaOptions.length > 1 && (
        <div className="carta-plan-row">
          <span className="carta-plan-q">{t('shape.whichPart', { city })}</span>
          <div className="carta-area-list">
            {areaOptions.map((o) => (
              <button
                key={o.key}
                type="button"
                className={`carta-area ${areaKey === o.key ? 'on' : ''}`}
                onClick={() => setAreaKey(o.key)}
                aria-pressed={areaKey === o.key}
              >
                <span className="carta-area-text">
                  <b>{o.label}</b>
                  <small>{o.sub}</small>
                </span>
                <span className="carta-area-count">{t('shape.nPlaces', { n: o.count })}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {chipRow(t('shape.howLong'), DAY_LENGTHS, dayLen, setDayLen)}
      {chipRow(t('shape.howMuchWalking'), WALK_LEVELS, walk, setWalk)}
      {chipRow(t('shape.pace'), PACE_CHOICES, pace, setPace)}

      {/* The predefined routes the answers recommend: pick one, then modify
          it on the map/list like any hand-built day. */}
      <div className="carta-plan-row">
        <span className="carta-plan-q">Pick a route (you can change it afterwards)</span>
        <div className="carta-route-list">
          {routes.length === 0 && (
            <p className="trip-note">Not enough catalogued places here for a ready-made route. Tap pins on the map to build the day by hand.</p>
          )}
          {routes.map((r) => (
            <div key={r.key} className={`carta-route ${r.recommended ? 'rec' : ''}`}>
              <div className="carta-route-head">
                <span className="carta-route-title">
                  <b>{r.title}</b>
                  {r.recommended && <span className="carta-route-rec"><SparkIcon size={10} /> Recommended for you</span>}
                </span>
                <span className={`score-chip rt-${r.avgScore >= 8.2 ? 3 : r.avgScore >= 7 ? 2 : 1} sm`} title={`Average place rating ${r.avgScore}/10`}>
                  {r.avgScore.toFixed(1)}
                </span>
              </div>
              <small className="carta-route-desc">{r.desc}</small>
              <small className="carta-route-stats">
                {r.stops.length} stops, ~{fmtDur(r.totalMin)} out, ~{r.km} km on foot
                {scope === 'stay' && numDays > 1 ? `, shaped over ${numDays} days` : ''}
              </small>
              <ol className="carta-route-stops">
                {r.stops.slice(0, 6).map(({ item, idx }) => (
                  <li key={idx}>
                    {item.name}
                    <span className="carta-route-stop-score">{poiRating(item).score.toFixed(1)}</span>
                  </li>
                ))}
                {r.stops.length > 6 && <li className="carta-route-more">+{r.stops.length - 6} more</li>}
              </ol>
              <button className="day-carta-btn carta-route-use" onClick={() => pick(r)}>
                <SparkIcon size={11} />
                {scope === 'stay' ? `Use this route for all ${numDays} days` : `Use this route for day ${dayNumber}`}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
