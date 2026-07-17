import React, { useMemo, useState } from 'react';
import {
  DAY_STYLES, DAY_LENGTHS, WALK_LEVELS, pickerDeck, isMustSee,
  poiCategory, poiMapCat, poiRating, poiKind,
} from './dayDraft.js';
import { DayExploreMap } from '../map/DayExploreMap.jsx';
import {
  SparkIcon, StarIcon, CheckIcon, MapPinIcon, MuseumIcon, TreeIcon, DiningIcon,
  CameraIcon, CastleIcon, InfoIcon, BeachIcon, BallIcon,
} from '../components/Icons.jsx';

const STYLE_ICONS = {
  classic: CastleIcon,
  culture: MuseumIcon,
  active: TreeIcon,
  foodie: DiningIcon,
  mix: CameraIcon,
};

// The picks-step filter chips: plain-language categories a traveller sorts by,
// each matching poiCategory(). "All" is always shown; the rest appear only when
// the town actually has places in them (with a live count).
const PICK_CATS = [
  { key: 'all', label: 'All', Icon: SparkIcon },
  { key: 'sight', label: 'Sights & towns', Icon: CastleIcon },
  { key: 'nature', label: 'Nature & beaches', Icon: BeachIcon },
  { key: 'active', label: 'Active', Icon: BallIcon },
  { key: 'food', label: 'Food & local', Icon: DiningIcon },
];

// One "pace" answer instead of two separate questions (how much to do + how
// long per stop): each choice sets both underlying knobs so travellers make
// one intuitive decision, not two overlapping ones.
const PACE_CHOICES = [
  { key: 'relaxed', label: 'Take it easy', desc: 'A few highlights, with proper time at each', fill: 'light', visit: 'deep' },
  { key: 'balanced', label: 'A good balance', desc: 'The essentials at a comfortable rhythm', fill: 'balanced', visit: 'standard' },
  { key: 'packed', label: 'See as much as I can', desc: 'Quick looks, lots of stops', fill: 'packed', visit: 'quick' },
];
const paceFromPrefs = (initial) => {
  if (initial?.fill === 'light') return 'relaxed';
  if (initial?.fill === 'packed') return 'packed';
  return 'balanced';
};

/**
 * "Shape your day" - the guided planner shown when a day plan opens with
 * nothing planned yet.
 *
 * One question per screen, with an explicit Next (nothing pre-selected, so
 * every answer is a deliberate tap):
 *   Step 0  the honest fork: explore on your own, or let Carta guide you
 *   Step 1  what kind of day (mood)
 *   Step 2  how long the day runs
 *   Step 3  how much walking is okay
 *   Step 4  the pace (how much / how deep)
 *   Step 5  the picks: an overview list beside a live map. Tap a place to add
 *           it; it lights up on the map so you watch the day take shape.
 * "Let Carta pick everything" stays one tap away on every step.
 *
 * Hands back { style, interests, mode: 'auto' | 'picks', pickIdx? } - the
 * planner drafts the days (auto) or clusters the accepted picks (picks).
 *
 *   items    the CURRENT city's activity list (original indices are the
 *            contract with the planner's assignments)
 *   city     city name, numDays  day count - copy only
 *   onSkip() close without drafting; onDraft(prefs) as above
 */
export function ShapeDayWizard({ city, numDays, items, eligibleIdx, initial, onSkip, onDraft }) {
  const [step, setStep] = useState(0);
  // Nothing is pre-selected on a fresh start: each answer is a deliberate tap.
  // (When editing an existing plan, `initial` seeds the prior answers.)
  const [styleKey, setStyleKey] = useState(initial?.style || null);
  const [dayLen, setDayLen] = useState(initial?.dayLen || null);
  const [walk, setWalk] = useState(initial?.walk || null);
  const [pace, setPace] = useState(() => (initial ? paceFromPrefs(initial) : null));
  const style = DAY_STYLES.find((s) => s.key === styleKey) || null;
  const paceChoice = PACE_CHOICES.find((p) => p.key === pace) || PACE_CHOICES[1];

  // Which picks the traveller has toggled on (original activity indices).
  const [selected, setSelected] = useState(() => new Set());
  // Which category chip is active, and which row's info panel is open.
  const [cat, setCat] = useState('all');
  const [openInfo, setOpenInfo] = useState(null);

  // The full picks deck: broad, all categories, mood-sorted. Chips filter it.
  const deck = useMemo(() => {
    if (!style) return [];
    return pickerDeck(items, style.interests, Math.max(18, Math.min(32, numDays * 12)), eligibleIdx);
  }, [items, style, numDays, eligibleIdx]);

  // How many places sit behind each chip, so a chip never reads as empty and
  // the traveller can see at a glance that yes, there are beaches here too.
  const catCounts = useMemo(() => {
    const c = { all: deck.length, sight: 0, nature: 0, active: 0, food: 0 };
    deck.forEach(({ item }) => { c[poiCategory(item)] += 1; });
    return c;
  }, [deck]);

  const visibleDeck = useMemo(
    () => (cat === 'all' ? deck : deck.filter(({ item }) => poiCategory(item) === cat)),
    [deck, cat],
  );

  // A stable centre for the map: the average of the picks around town.
  const center = useMemo(() => {
    if (!deck.length) return null;
    const la = deck.reduce((s, { item }) => s + item.lat, 0) / deck.length;
    const lo = deck.reduce((s, { item }) => s + item.lon, 0) / deck.length;
    return { lat: la, lon: lo, label: city };
  }, [deck, city]);

  // Map mirrors the filtered list, but keeps any already-picked place pinned so
  // a chosen beach doesn't vanish when you switch to the Sights chip.
  const markers = useMemo(() => {
    const shown = new Map(visibleDeck.map((e) => [e.idx, e]));
    deck.forEach((e) => { if (selected.has(e.idx)) shown.set(e.idx, e); });
    return [...shown.values()].map(({ item, idx }) => {
      const r = poiRating(item);
      return {
        id: String(idx),
        label: item.name,
        lat: item.lat,
        lon: item.lon,
        cat: poiMapCat(item),
        selected: selected.has(idx),
        must: isMustSee(item),
        score: r.score,
        tier: r.tier,
      };
    });
  }, [deck, visibleDeck, selected]);

  const toggle = (idx) => setSelected((prev) => {
    const n = new Set(prev);
    n.has(idx) ? n.delete(idx) : n.add(idx);
    return n;
  });

  const feasibility = { dayLen: dayLen || 'full', walk: walk || 'moderate', fill: paceChoice.fill, visit: paceChoice.visit };
  const finishAuto = () => {
    onDraft({ mode: 'auto', style: styleKey, interests: style ? style.interests : [], ...feasibility });
  };
  const finishPicks = (picks) => {
    if (!picks.length) { finishAuto(); return; }
    onDraft({ mode: 'picks', style: styleKey, interests: style ? style.interests : [], pickIdx: picks, ...feasibility });
  };

  // Selecting a mood resets the picks (a different mood = a different shortlist).
  const pickStyle = (key) => { setStyleKey(key); setSelected(new Set()); setCat('all'); setOpenInfo(null); };

  const questionStep = step >= 1 && step <= 4;
  const stepValue = step === 1 ? styleKey : step === 2 ? dayLen : step === 3 ? walk : step === 4 ? pace : null;
  const goNext = () => setStep(step + 1);

  // A reusable one-question screen: title, short line, tap to choose (it stays
  // highlighted), then Next in the footer moves on.
  const question = (title, sub, options, activeKey, onPick, withIcons = false) => (
    <>
      <h2 className="guide-title">{title}</h2>
      <p className="guide-sub">{sub}</p>
      <div className="shape-style-list shape-question-list">
        {options.map((o) => {
          const Icon = withIcons ? (STYLE_ICONS[o.key] || SparkIcon) : null;
          const on = activeKey === o.key;
          return (
            <button
              key={o.key}
              className={`shape-style ${on ? 'on' : ''}`}
              onClick={() => onPick(o.key)}
              aria-pressed={on}
            >
              {Icon && <span className="shape-style-icon"><Icon size={18} /></span>}
              <span className="shape-style-text">
                <b>{o.label}</b>
                <small>{o.desc}</small>
              </span>
              <span className={`shape-style-arrow ${on ? 'on' : ''}`}>
                {on ? <CheckIcon size={16} /> : '›'}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );

  return (
    <div className="guide-overlay" onClick={onSkip}>
      <div className={`guide-modal shape-modal ${step === 5 ? 'shape-modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="guide-head">
          <button className="guide-close" onClick={onSkip} aria-label="Close">×</button>
          <div className="shape-head-title">
            Shape your {numDays > 1 ? `${numDays} days` : 'day'} in {city}
            {questionStep && <span className="shape-head-step">question {step} of 4</span>}
            {step === 5 && <span className="shape-head-step">your picks</span>}
          </div>
          {questionStep && (
            <div className="shape-progress" aria-hidden="true">
              {[1, 2, 3, 4].map((n) => (
                <span key={n} className={`shape-progress-dot ${n < step ? 'done' : ''} ${n === step ? 'now' : ''}`} />
              ))}
            </div>
          )}
        </div>

        <div className="guide-body">
          {step === 0 && (
            <>
              <h2 className="guide-title">How do you want to do {city}?</h2>
              <p className="guide-sub">Wander it on your own terms, or have Carta line the days up with you.</p>
              <div className="guide-path-list">
                <button className="guide-path" onClick={() => setStep(1)}>
                  <span className="guide-path-icon"><SparkIcon size={18} /></span>
                  <span className="guide-path-text">
                    <b>Let Carta guide us</b>
                    <small>Four quick taps, then a hand-picked plan for {numDays > 1 ? 'each day' : 'the day'}</small>
                  </span>
                  <span className="guide-arrow">→</span>
                </button>
                <button className="guide-path" onClick={onSkip}>
                  <span className="guide-path-icon"><CameraIcon size={18} /></span>
                  <span className="guide-path-text">
                    <b>I'll explore it myself</b>
                    <small>Browse every sight below and build your own days, at your pace</small>
                  </span>
                  <span className="guide-arrow">→</span>
                </button>
              </div>
            </>
          )}

          {step === 1 && question(
            'What kind of day do you feel like?',
            'Tap a mood; Carta leads with places that fit it.',
            DAY_STYLES, styleKey, pickStyle, true,
          )}

          {step === 2 && question(
            'How long are you out?',
            'So a drafted day never runs longer than you want to be.',
            DAY_LENGTHS, dayLen, setDayLen,
          )}

          {step === 3 && question(
            'How much walking is okay?',
            'Carta keeps every stop within comfortable reach of the next.',
            WALK_LEVELS, walk, setWalk,
          )}

          {step === 4 && question(
            'What pace suits you?',
            'One last answer: how full should each day be?',
            PACE_CHOICES, pace, setPace,
          )}

          {step === 5 && (
            deck.length === 0 ? (
              <>
                <h2 className="guide-title">Not much catalogued here yet</h2>
                <p className="guide-sub">Let Carta build a general best-of instead, or go back and pick another style.</p>
              </>
            ) : (
              <div className="shape-pick">
                <div className="shape-pick-list">
                  <div className="shape-pick-list-head">
                    <span>Tap a place to add it, watch it drop onto the map</span>
                    <span className="shape-deck-added">{selected.size} added</span>
                  </div>

                  {/* What kind of place do you feel like? */}
                  <div className="shape-cat-filter" role="tablist" aria-label="Filter places">
                    {PICK_CATS.filter((c) => c.key === 'all' || catCounts[c.key] > 0).map((c) => {
                      const on = cat === c.key;
                      return (
                        <button
                          key={c.key}
                          role="tab"
                          aria-selected={on}
                          className={`shape-cat-chip ${on ? 'on' : ''}`}
                          onClick={() => { setCat(c.key); setOpenInfo(null); }}
                        >
                          <c.Icon size={13} />
                          <span>{c.label}</span>
                          <span className="shape-cat-count">{catCounts[c.key]}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* How to read a row: what the star and the number mean. */}
                  <p className="shape-pick-legend">
                    <span className="shape-pick-legend-must"><StarIcon size={9} /> a genuine must-see</span>
                    <span className="shape-pick-legend-score">the number rates each place out of 10</span>
                    <span className="shape-pick-legend-info"><InfoIcon size={10} /> tap for more</span>
                  </p>

                  {visibleDeck.map(({ item, idx }) => {
                    const on = selected.has(idx);
                    const must = isMustSee(item);
                    const r = poiRating(item);
                    const open = openInfo === idx;
                    const kind = poiKind(item) || 'Place';
                    return (
                      <div key={idx} className={`shape-pick-item ${open ? 'open' : ''}`}>
                        <div className={`shape-pick-row ${on ? 'on' : ''}`}>
                          <button
                            className="shape-pick-body"
                            onClick={() => toggle(idx)}
                            aria-pressed={on}
                          >
                            <span
                              className="shape-pick-thumb"
                              style={item.img ? { backgroundImage: `url(${item.img})` } : undefined}
                            >
                              {!item.img && <MapPinIcon size={14} />}
                            </span>
                            <span className="shape-pick-text">
                              <b>{item.name}</b>
                              <span className="shape-pick-meta">
                                <span className={`score-chip xs rt-${r.tier}`} title={`${r.label} - Carta's quality read`}>
                                  {r.score.toFixed(1)}
                                </span>
                                {must
                                  ? <span className="shape-pick-tag must"><StarIcon size={9} /> Must-see</span>
                                  : <span className="shape-pick-tag">{r.label}</span>}
                                <small>{kind}{item.heritage ? ', heritage' : ''}</small>
                              </span>
                            </span>
                          </button>
                          <button
                            className={`shape-pick-info ${open ? 'on' : ''}`}
                            onClick={() => setOpenInfo(open ? null : idx)}
                            aria-label={open ? `Hide details for ${item.name}` : `More about ${item.name}`}
                            aria-expanded={open}
                          >
                            <InfoIcon size={15} />
                          </button>
                          <button
                            className={`shape-pick-toggle ${on ? 'on' : ''}`}
                            onClick={() => toggle(idx)}
                            aria-label={on ? `Remove ${item.name}` : `Add ${item.name}`}
                          >
                            {on ? <CheckIcon size={14} /> : '+'}
                          </button>
                        </div>
                        {open && (
                          <div className="shape-pick-desc">
                            <p>
                              {item.desc
                                || (must
                                  ? 'One of the essential places here - among the highest-rated sights in town.'
                                  : `${kind}${item.heritage ? ', a heritage-listed site' : ''} worth a look while you’re nearby.`)}
                            </p>
                            <p className="shape-pick-desc-why">
                              <b>{r.score.toFixed(1)}/10 - {r.label}.</b>{' '}
                              {must
                                ? 'Top importance rating, backed by heritage listing or real-world fame.'
                                : r.tier === 2
                                  ? 'A well-rated, corroborated place - solid, if not a headline sight.'
                                  : 'Catalogued and worth a look, without the strong evidence of a top sight.'}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="shape-pick-map">
                  <DayExploreMap
                    stay={center}
                    markers={markers}
                    onFocus={(id) => toggle(Number(id))}
                  />
                </div>
              </div>
            )
          )}
        </div>

        <div className="guide-foot">
          <div className="guide-foot-summary">
            {step >= 1 && <button className="shape-skip" onClick={onSkip}>Skip and plan manually</button>}
          </div>
          <div className="guide-foot-actions">
            {step > 0 && <button className="guide-back" onClick={() => setStep(step - 1)}>Back</button>}
            {questionStep && (
              <button className="guide-next" onClick={goNext} disabled={!stepValue}>Next</button>
            )}
            {step === 5 && selected.size > 0 && (
              <button className="guide-next" onClick={() => finishPicks([...selected])}>
                Build my {numDays > 1 ? 'days' : 'day'} ({selected.size})
              </button>
            )}
            {(questionStep || (step === 5 && selected.size === 0)) && (
              <button className="guide-back" onClick={finishAuto}>
                <SparkIcon size={12} /> Let Carta pick everything
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
