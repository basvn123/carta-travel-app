import { useState, useMemo } from 'react';
import { SparkIcon, CheckIcon, StarIcon, CastleIcon, TreeIcon, HomeIcon, MountainIcon } from '../components/Icons.jsx';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { isMustSee, poiKind, dwellMinutes } from './dayDraft.js';
import { fmtDur } from './dayFormat.js';
import { cityInsight } from '../lib/tripGuide.js';
import { useI18n } from '../i18n/index.jsx';

// "Let Carta guide you" questionnaire options (labelKey -> t()).
const GUIDE_MOODS = [
  { key: 'sight', labelKey: 'day.moodSights', Icon: CastleIcon },
  { key: 'beach', labelKey: 'day.moodBeaches', Icon: TreeIcon },
  { key: 'town', labelKey: 'day.moodTowns', Icon: HomeIcon },
  { key: 'active', labelKey: 'day.moodActive', Icon: MountainIcon },
];
const GUIDE_RANGES = [
  { key: 'near', labelKey: 'day.rangeNear', subKey: 'day.rangeNearSub', km: 25 },
  { key: 'far', labelKey: 'day.rangeFar', subKey: 'day.rangeFarSub', km: 1e9 },
];
// Section headings in the recommendation list reuse the mood labels.
const GROUP_LABEL_KEY = { town: 'day.moodTowns', sight: 'day.moodSights', beach: 'day.moodBeaches', active: 'day.moodActive' };

/**
 * "Let Carta guide you", the alternative to hunting on the map yourself.
 * Two quick questions (what are you in the mood for, and how far you'll roam),
 * then Carta recommends the best-rated towns, sights, beaches and activities
 * around the stay. Each recommendation shows its rating and a short note, can
 * be previewed on the map, and added to the day with one tap.
 *
 *   towns / pois     the same explore candidates the map is built from
 *   pickedTownIds    Set of destinationIds already in the plan
 *   pickedPoiKeys    Set of poi keys already picked
 *   onToggleTown(t)  add/remove a town   onTogglePoi(p) add/remove a place
 *   onPreview(cat, lat, lon, focusId)    glide the map to a recommendation
 */
export function CartaGuidePanel({ towns, pois, stayTownId, pickedTownIds, pickedPoiKeys, onToggleTown, onTogglePoi, onPreview, onClose }) {
  const { t } = useI18n();
  const [moods, setMoods] = useState(() => new Set(['sight', 'beach', 'town', 'active']));
  const [range, setRange] = useState('far');
  const [topOnly, setTopOnly] = useState(false); // only the genuinely highly-rated
  const [phase, setPhase] = useState('ask');      // 'ask' | 'results'

  const toggleMood = (k) => setMoods((prev) => {
    const n = new Set(prev);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });

  const cap = (GUIDE_RANGES.find((r) => r.key === range) || GUIDE_RANGES[1]).km;

  // Build the recommendation groups from the chosen moods, distance and quality
  // bar. Towns rank by their 0-10 rating; places by Carta's POI score (already
  // the order they arrive in), keeping the strongest of each kind on top.
  const groups = useMemo(() => {
    const g = [];
    if (moods.has('town')) {
      const list = towns
        .filter((t) => t.id !== stayTownId && t.km <= cap)
        .filter((t) => !topOnly || (t.dest.rating?.score || 0) >= 7.5 || t.dest.rating?.hidden_gem)
        .sort((a, b) => (b.dest.rating?.score || 0) - (a.dest.rating?.score || 0))
        .slice(0, 5)
        .map((tw) => ({ type: 'town', key: `t:${tw.id}`, town: tw }));
      if (list.length) g.push({ cat: 'town', items: list });
    }
    for (const cat of ['sight', 'beach', 'active']) {
      if (!moods.has(cat)) continue;
      const list = pois
        .filter((p) => p.cat === cat && p.km <= cap)
        .filter((p) => !topOnly || isMustSee(p.item) || (p.item.rate ?? 0) >= 2 || p.item.heritage)
        .slice(0, 5)
        .map((p) => ({ type: 'poi', key: p.key, poi: p }));
      if (list.length) g.push({ cat, items: list });
    }
    return g;
  }, [moods, cap, topOnly, towns, pois, stayTownId]);

  const total = groups.reduce((n, grp) => n + grp.items.length, 0);

  return (
    <div className="day-guide-panel">
      <div className="day-guide-panel-head">
        <span className="day-guide-panel-title"><SparkIcon size={13} /> {t('day.guideBtn')}</span>
        <button className="day-guide-panel-close" onClick={onClose} aria-label={t('detail.close')}>×</button>
      </div>

      {phase === 'ask' ? (
        <div className="day-guide-ask">
          <span className="day-guide-q">{t('day.guideMoodQ')}</span>
          <div className="day-guide-moods">
            {GUIDE_MOODS.map((m) => (
              <button
                key={m.key}
                className={`day-guide-mood ${moods.has(m.key) ? 'on' : ''}`}
                onClick={() => toggleMood(m.key)}
                aria-pressed={moods.has(m.key)}
              >
                <m.Icon size={17} />
                <span>{t(m.labelKey)}</span>
              </button>
            ))}
          </div>

          <span className="day-guide-q">{t('day.guideRangeQ')}</span>
          <div className="day-guide-range">
            {GUIDE_RANGES.map((r) => (
              <button
                key={r.key}
                className={`day-guide-range-opt ${range === r.key ? 'on' : ''}`}
                onClick={() => setRange(r.key)}
                aria-pressed={range === r.key}
              >
                <b>{t(r.labelKey)}</b>
                <small>{t(r.subKey)}</small>
              </button>
            ))}
          </div>

          <button
            className={`day-guide-toponly ${topOnly ? 'on' : ''}`}
            onClick={() => setTopOnly((v) => !v)}
            aria-pressed={topOnly}
          >
            {topOnly && <CheckIcon size={11} />} {t('day.guideTopOnly')}
          </button>

          <button
            className="day-guide-go"
            onClick={() => setPhase('results')}
            disabled={moods.size === 0}
          >
            <SparkIcon size={12} /> {t('day.guideGo')}
          </button>
        </div>
      ) : (
        <div className="day-guide-results">
          <button className="day-guide-back" onClick={() => setPhase('ask')}>← {t('day.guideBack')}</button>
          {total === 0 ? (
            <p className="trip-note">{t('day.guideEmpty')}</p>
          ) : (
            groups.map((grp) => (
              <div className="day-guide-group" key={grp.cat}>
                <div className="day-guide-group-title">
                  <span className={`day-explore-search-dot cat-${grp.cat}`} /> {t(GROUP_LABEL_KEY[grp.cat])}
                </div>
                {grp.items.map((rec) => {
                  if (rec.type === 'town') {
                    const tw = rec.town;
                    const picked = pickedTownIds.has(tw.id);
                    return (
                      <div className={`day-guide-rec ${picked ? 'picked' : ''}`} key={rec.key}>
                        <button
                          className="day-guide-rec-main"
                          onClick={() => onPreview('town', tw.lat, tw.lon, `t:${tw.id}`)}
                          title={t('day.showOnMap')}
                        >
                          {tw.dest.image?.url
                            ? <span className="day-guide-rec-photo" style={{ backgroundImage: `url(${tw.dest.image.url})` }} />
                            : <span className="day-guide-rec-photo day-guide-rec-photo-empty">{tw.dest.city.slice(0, 1)}</span>}
                          <span className="day-guide-rec-body">
                            <span className="day-guide-rec-name">
                              {tw.dest.city}
                              {tw.dest.rating?.score != null && <ScoreChip rating={tw.dest.rating} size="xs" />}
                              {tw.dest.rating?.hidden_gem && <HiddenGemTag />}
                            </span>
                            <span className="day-guide-rec-meta">{t('day.kmFromStay', { km: tw.km })}</span>
                            <span className="day-guide-rec-desc">{cityInsight(tw.dest)}</span>
                          </span>
                        </button>
                        <button className={`day-guide-rec-add ${picked ? 'on' : ''}`} onClick={() => onToggleTown(tw)}>
                          {picked ? <><CheckIcon size={11} /> {t('day.added')}</> : t('day.addShort')}
                        </button>
                      </div>
                    );
                  }
                  const p = rec.poi;
                  const item = p.item;
                  const picked = pickedPoiKeys.has(p.key);
                  const must = isMustSee(item);
                  return (
                    <div className={`day-guide-rec ${picked ? 'picked' : ''}`} key={rec.key}>
                      <button
                        className="day-guide-rec-main"
                        onClick={() => onPreview(p.cat, p.lat, p.lon, p.key)}
                        title={t('day.showOnMap')}
                      >
                        {item.img
                          ? <span className="day-guide-rec-photo" style={{ backgroundImage: `url(${item.img})` }} />
                          : <span className="day-guide-rec-photo day-guide-rec-photo-empty">{(item.kind || '').slice(0, 1)}</span>}
                        <span className="day-guide-rec-body">
                          <span className="day-guide-rec-name">
                            {item.name}
                            {must && <span className="day-guide-badge must"><StarIcon size={9} /> {t('day.mustSee')}</span>}
                            {!must && (item.rate ?? 0) >= 2 && <span className="day-guide-badge rated">{t('day.highlyRated')}</span>}
                            {item.heritage && <span className="day-guide-badge heritage">{t('day.heritage')}</span>}
                          </span>
                          <span className="day-guide-rec-meta">
                            {poiKind(item) ? `${poiKind(item)}, ` : ''}{t('day.kmAwayVisit', { km: p.km, dur: fmtDur(dwellMinutes(poiKind(item))) })}
                          </span>
                          {item.desc && <span className="day-guide-rec-desc">{item.desc}</span>}
                        </span>
                      </button>
                      <button className={`day-guide-rec-add ${picked ? 'on' : ''}`} onClick={() => onTogglePoi(p)}>
                        {picked ? <><CheckIcon size={11} /> {t('day.added')}</> : t('day.addShort')}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
