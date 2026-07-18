import React, { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { DAY_STYLES, DAY_LENGTHS, WALK_LEVELS, cityAreaOptions } from './dayDraft.js';
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
 * "Let Carta plan", the inline replacement for the old Shape-your-day modal
 * wizard. One compact screen in the planner's own rail (no overlay, the big
 * map stays visible), every answer pre-selected to a sensible default, so a
 * single tap on Draft is already a good plan.
 *
 * It drafts the SELECTED day ("Shape day 3"), or every day of this city when
 * the traveller flips the scope chip, never other cities of the plan.
 *
 * For large cities it adds the one question that keeps a draft honest: WHERE
 * the day should focus. The options come from the data itself (city centre /
 * around the stay / anywhere in reach, see cityAreaOptions); when everything
 * already sits in the centre the question simply doesn't appear.
 *
 *   city        city name (copy only), cityDest  the destination record
 *   dayNumber   trip-wide day number of the selected day (copy only)
 *   numDays     how many days this city holds (scope chip appears when > 1)
 *   items       the city's activity list; walkable  Set of eligible indices
 *   stayPoint   { lat, lon } of the traveller's stay, when it's in this city
 *   initial     previously saved prefs, to seed the defaults
 *   onDraft(p)  p = { scope: 'day'|'stay', style, interests, dayLen, walk,
 *               fill, visit, areaKey, areaIdx: Set|null }
 *   onClose()   dismiss without drafting
 */
export function CartaPlanPanel({
  city, cityDest, dayNumber, numDays, items, walkable, stayPoint,
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

  const draft = () => {
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

      <button className="day-carta-btn carta-plan-go" onClick={draft}>
        <SparkIcon size={12} />
        {scope === 'stay' ? t('shape.draftAllDays', { n: numDays }) : t('shape.draftDay', { n: dayNumber })}
      </button>
    </div>
  );
}
