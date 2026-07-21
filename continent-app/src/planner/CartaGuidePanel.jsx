import { useState, useMemo } from 'react';
import { SparkIcon, CheckIcon, StarIcon, CastleIcon, TreeIcon, HomeIcon, MountainIcon } from '../components/Icons.jsx';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { isMustSee, poiKind, dwellMinutes } from './dayDraft.js';
import { fmtDur } from './dayFormat.js';
import { cityInsight } from '../lib/tripGuide.js';

// "Let Carta guide you" questionnaire options (labelKey/subKey -> t()).
const GUIDE_MOODS = [
  { key: 'sight', labelKey: 'day.moodSights', label: 'Sights', Icon: CastleIcon },
  { key: 'beach', labelKey: 'day.moodBeaches', label: 'Beaches & nature', Icon: TreeIcon },
  { key: 'town', labelKey: 'day.moodTowns', label: 'Towns', Icon: HomeIcon },
  { key: 'active', labelKey: 'day.moodActive', label: 'Active', Icon: MountainIcon },
];
const GUIDE_RANGES = [
  { key: 'near', label: 'Close by', sub: 'A short hop from your stay', km: 25 },
  { key: 'far', label: 'Within reach', sub: 'Day trips are fine too', km: 1e9 },
];
// Section headings shown in the "Let Carta guide you" recommendation list. This
// panel is not internationalized (its prompts are hardcoded English), so the
// labels are plain strings rather than i18n keys.
const GUIDE_GROUP_LABEL = { town: 'Towns', sight: 'Sights', beach: 'Beaches & nature', active: 'Active' };

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
        .map((t) => ({ type: 'town', key: `t:${t.id}`, town: t }));
      if (list.length) g.push({ cat: 'town', label: GUIDE_GROUP_LABEL.town, items: list });
    }
    for (const cat of ['sight', 'beach', 'active']) {
      if (!moods.has(cat)) continue;
      const list = pois
        .filter((p) => p.cat === cat && p.km <= cap)
        .filter((p) => !topOnly || isMustSee(p.item) || (p.item.rate ?? 0) >= 2 || p.item.heritage)
        .slice(0, 5)
        .map((p) => ({ type: 'poi', key: p.key, poi: p }));
      if (list.length) g.push({ cat, label: GUIDE_GROUP_LABEL[cat], items: list });
    }
    return g;
  }, [moods, cap, topOnly, towns, pois, stayTownId]);

  const total = groups.reduce((n, grp) => n + grp.items.length, 0);

  return (
    <div className="day-guide-panel">
      <div className="day-guide-panel-head">
        <span className="day-guide-panel-title"><SparkIcon size={13} /> Let Carta guide you</span>
        <button className="day-guide-panel-close" onClick={onClose} aria-label="Close">×</button>
      </div>

      {phase === 'ask' ? (
        <div className="day-guide-ask">
          <span className="day-guide-q">What are you in the mood for?</span>
          <div className="day-guide-moods">
            {GUIDE_MOODS.map((m) => (
              <button
                key={m.key}
                className={`day-guide-mood ${moods.has(m.key) ? 'on' : ''}`}
                onClick={() => toggleMood(m.key)}
                aria-pressed={moods.has(m.key)}
              >
                <m.Icon size={17} />
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          <span className="day-guide-q">How far will you roam?</span>
          <div className="day-guide-range">
            {GUIDE_RANGES.map((r) => (
              <button
                key={r.key}
                className={`day-guide-range-opt ${range === r.key ? 'on' : ''}`}
                onClick={() => setRange(r.key)}
                aria-pressed={range === r.key}
              >
                <b>{r.label}</b>
                <small>{r.sub}</small>
              </button>
            ))}
          </div>

          <button
            className={`day-guide-toponly ${topOnly ? 'on' : ''}`}
            onClick={() => setTopOnly((v) => !v)}
            aria-pressed={topOnly}
          >
            {topOnly && <CheckIcon size={11} />} Only show the highly rated
          </button>

          <button
            className="day-guide-go"
            onClick={() => setPhase('results')}
            disabled={moods.size === 0}
          >
            <SparkIcon size={12} /> Show me what Carta recommends
          </button>
        </div>
      ) : (
        <div className="day-guide-results">
          <button className="day-guide-back" onClick={() => setPhase('ask')}>← Change answers</button>
          {total === 0 ? (
            <p className="trip-note">Nothing around your stay fits that yet. Try widening the range, or turning off "highly rated only".</p>
          ) : (
            groups.map((grp) => (
              <div className="day-guide-group" key={grp.cat}>
                <div className="day-guide-group-title">
                  <span className={`day-explore-search-dot cat-${grp.cat}`} /> {grp.label}
                </div>
                {grp.items.map((rec) => {
                  if (rec.type === 'town') {
                    const t = rec.town;
                    const picked = pickedTownIds.has(t.id);
                    return (
                      <div className={`day-guide-rec ${picked ? 'picked' : ''}`} key={rec.key}>
                        <button
                          className="day-guide-rec-main"
                          onClick={() => onPreview('town', t.lat, t.lon, `t:${t.id}`)}
                          title="Show on the map"
                        >
                          {t.dest.image?.url
                            ? <span className="day-guide-rec-photo" style={{ backgroundImage: `url(${t.dest.image.url})` }} />
                            : <span className="day-guide-rec-photo day-guide-rec-photo-empty">{t.dest.city.slice(0, 1)}</span>}
                          <span className="day-guide-rec-body">
                            <span className="day-guide-rec-name">
                              {t.dest.city}
                              {t.dest.rating?.score != null && <ScoreChip rating={t.dest.rating} size="xs" />}
                              {t.dest.rating?.hidden_gem && <HiddenGemTag />}
                            </span>
                            <span className="day-guide-rec-meta">{t.km} km from your stay</span>
                            <span className="day-guide-rec-desc">{cityInsight(t.dest)}</span>
                          </span>
                        </button>
                        <button className={`day-guide-rec-add ${picked ? 'on' : ''}`} onClick={() => onToggleTown(t)}>
                          {picked ? <><CheckIcon size={11} /> Added</> : '+ Add'}
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
                        title="Show on the map"
                      >
                        {item.img
                          ? <span className="day-guide-rec-photo" style={{ backgroundImage: `url(${item.img})` }} />
                          : <span className="day-guide-rec-photo day-guide-rec-photo-empty">{(item.kind || '·').slice(0, 1)}</span>}
                        <span className="day-guide-rec-body">
                          <span className="day-guide-rec-name">
                            {item.name}
                            {must && <span className="day-guide-badge must"><StarIcon size={9} /> Must see</span>}
                            {!must && (item.rate ?? 0) >= 2 && <span className="day-guide-badge rated">Highly rated</span>}
                            {item.heritage && <span className="day-guide-badge heritage">Heritage</span>}
                          </span>
                          <span className="day-guide-rec-meta">
                            {poiKind(item) ? `${poiKind(item)}, ` : ''}{p.km} km away · ~{fmtDur(dwellMinutes(poiKind(item)))} visit
                          </span>
                          {item.desc && <span className="day-guide-rec-desc">{item.desc}</span>}
                        </span>
                      </button>
                      <button className={`day-guide-rec-add ${picked ? 'on' : ''}`} onClick={() => onTogglePoi(p)}>
                        {picked ? <><CheckIcon size={11} /> Added</> : '+ Add'}
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
