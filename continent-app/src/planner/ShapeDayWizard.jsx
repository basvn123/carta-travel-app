import React, { useMemo, useRef, useState } from 'react';
import { DAY_STYLES, DAY_LENGTHS, WALK_LEVELS, candidateDeck, nearbyCompanions } from './dayDraft.js';
import { SparkIcon, StarIcon, CheckIcon, MuseumIcon, TreeIcon, DiningIcon, CameraIcon, CastleIcon } from '../components/Icons.jsx';

const STYLE_ICONS = {
  classic: CastleIcon,
  culture: MuseumIcon,
  active: TreeIcon,
  foodie: DiningIcon,
  mix: CameraIcon,
};

/**
 * "Shape your day" - the guided planner shown when a day plan opens with
 * nothing planned yet.
 *
 * Step 1  What kind of day? Aggregated day styles (sightseeing / museums /
 *         active / foodie / mix) with plain-language descriptions, because
 *         tourists know their mood, not a city's POI taxonomy.
 * Step 2  A swipeable card deck of Carta's validated recommendations for that
 *         style, best first: photo, what it is, why it's worth it, and what
 *         it pairs well with nearby. Swipe right / Add to keep it, swipe
 *         left / Skip to pass. "Let Carta pick everything" stays one tap away.
 *
 * Hands back { style, interests, mode: 'auto' | 'picks', pickIdx? } - the
 * planner drafts the days (auto) or clusters the accepted picks (picks).
 *
 *   items    the CURRENT city's activity list (original indices are the
 *            contract with the planner's assignments)
 *   city     city name, numDays  day count - copy only
 *   onSkip() close without drafting; onDraft(prefs) as above
 */
export function ShapeDayWizard({ city, numDays, items, initial, onSkip, onDraft }) {
  const [step, setStep] = useState(1);
  const [styleKey, setStyleKey] = useState(initial?.style || null);
  // Feasibility answers: how long the day runs and how much walking is okay.
  // These keep Carta's drafts realistic (no four-hour marches for a light
  // walker, no half-empty evenings for an early-start crowd).
  const [dayLen, setDayLen] = useState(initial?.dayLen || 'full');
  const [walk, setWalk] = useState(initial?.walk || 'moderate');
  const style = DAY_STYLES.find((s) => s.key === styleKey) || null;

  // Deck state: position + accepted original-indices.
  const [deckPos, setDeckPos] = useState(0);
  const [accepted, setAccepted] = useState([]);
  // Swipe animation: 'add' | 'skip' | null while the top card flies out.
  const [flying, setFlying] = useState(null);
  const [drag, setDrag] = useState(null); // { dx } while dragging
  const dragRef = useRef(null);

  const deck = useMemo(() => {
    if (!style) return [];
    return candidateDeck(items, style.interests, Math.max(10, Math.min(16, numDays * 6)));
  }, [items, style, numDays]);

  const current = deck[deckPos] || null;
  const companions = useMemo(
    () => (current ? nearbyCompanions(current.item, items) : []),
    [current, items],
  );

  const pickStyle = (key) => {
    setStyleKey(key);
    setDeckPos(0);
    setAccepted([]);
    setStep(2);
  };

  const feasibility = { dayLen, walk };
  const finishAuto = () => {
    onDraft({ mode: 'auto', style: styleKey, interests: style ? style.interests : [], ...feasibility });
  };
  const finishPicks = (picks) => {
    if (!picks.length) { finishAuto(); return; }
    onDraft({ mode: 'picks', style: styleKey, interests: style ? style.interests : [], pickIdx: picks, ...feasibility });
  };

  const advance = (dir) => {
    if (!current || flying) return;
    setFlying(dir);
    setTimeout(() => {
      const nextAccepted = dir === 'add' ? [...accepted, current.idx] : accepted;
      if (dir === 'add') setAccepted(nextAccepted);
      setFlying(null);
      setDrag(null);
      if (deckPos + 1 >= deck.length) {
        finishPicks(nextAccepted);
      } else {
        setDeckPos(deckPos + 1);
      }
    }, 240);
  };

  // Pointer swipe on the top card: drag past ±90px to add (right) or skip (left).
  const onCardDown = (e) => {
    if (flying) return;
    dragRef.current = { startX: e.clientX };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
  };
  const onCardMove = (e) => {
    if (!dragRef.current) return;
    setDrag({ dx: e.clientX - dragRef.current.startX });
  };
  const onCardUp = () => {
    const dx = drag?.dx || 0;
    dragRef.current = null;
    if (dx > 90) advance('add');
    else if (dx < -90) advance('skip');
    else setDrag(null);
  };

  const cardStyle = flying
    ? { transform: `translateX(${flying === 'add' ? 480 : -480}px) rotate(${flying === 'add' ? 14 : -14}deg)`, opacity: 0, transition: 'transform .24s ease-in, opacity .24s ease-in' }
    : drag
      ? { transform: `translateX(${drag.dx}px) rotate(${drag.dx / 24}deg)`, transition: 'none' }
      : undefined;

  return (
    <div className="guide-overlay" onClick={onSkip}>
      <div className="guide-modal shape-modal" onClick={(e) => e.stopPropagation()}>
        <div className="guide-head">
          <button className="guide-close" onClick={onSkip} aria-label="Close">×</button>
          <div className="shape-head-title">
            Shape your {numDays > 1 ? `${numDays} days` : 'day'} in {city}
            <span className="shape-head-step">step {step} of 3</span>
          </div>
        </div>

        <div className="guide-body">
          {step === 1 && (
            <>
              <h2 className="guide-title">What kind of day do you feel like?</h2>
              <p className="guide-sub">
                Pick a mood and Carta suggests the places that fit, one at a time,
                with what they are and what sits close together.
              </p>
              <div className="shape-style-list">
                {DAY_STYLES.map((s) => {
                  const Icon = STYLE_ICONS[s.key] || SparkIcon;
                  return (
                    <button
                      key={s.key}
                      className={`shape-style ${styleKey === s.key ? 'on' : ''}`}
                      onClick={() => pickStyle(s.key)}
                    >
                      <span className="shape-style-icon"><Icon size={18} /></span>
                      <span className="shape-style-text">
                        <b>{s.label}</b>
                        <small>{s.desc}</small>
                      </span>
                      <span className="shape-style-arrow">›</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="guide-title">How does the day itself look?</h2>
              <p className="guide-sub">
                So Carta only suggests what actually fits: nothing too far apart,
                nothing that keeps you out longer than you want.
              </p>
              <div className="shape-feas-group">
                <span className="trip-field-label">How long are you out?</span>
                <div className="shape-style-list">
                  {DAY_LENGTHS.map((d) => (
                    <button
                      key={d.key}
                      className={`shape-style ${dayLen === d.key ? 'on' : ''}`}
                      onClick={() => setDayLen(d.key)}
                    >
                      <span className="shape-style-text">
                        <b>{d.label}</b>
                        <small>{d.desc}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="shape-feas-group">
                <span className="trip-field-label">How much walking is okay?</span>
                <div className="shape-style-list">
                  {WALK_LEVELS.map((w) => (
                    <button
                      key={w.key}
                      className={`shape-style ${walk === w.key ? 'on' : ''}`}
                      onClick={() => setWalk(w.key)}
                    >
                      <span className="shape-style-text">
                        <b>{w.label}</b>
                        <small>{w.desc}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            deck.length === 0 ? (
              <>
                <h2 className="guide-title">Not much catalogued for that mood here</h2>
                <p className="guide-sub">Let Carta build a general best-of instead, or go back and pick another style.</p>
              </>
            ) : current ? (
              <>
                <div className="shape-deck-meta">
                  <span className="shape-deck-count">{deckPos + 1} of {deck.length}</span>
                  <span className="shape-deck-added">{accepted.length} added</span>
                </div>

                <div
                  className="shape-card"
                  style={cardStyle}
                  onPointerDown={onCardDown}
                  onPointerMove={onCardMove}
                  onPointerUp={onCardUp}
                  onPointerCancel={onCardUp}
                >
                  <div
                    className="shape-card-photo"
                    style={current.item.img ? { backgroundImage: `url(${current.item.img})` } : undefined}
                  >
                    {!current.item.img && <span className="shape-card-fallback">{(current.item.kind || '?').slice(0, 1)}</span>}
                    {(current.item.rate ?? 0) >= 3 && (
                      <span className="shape-card-must"><StarIcon size={10} /> Must see</span>
                    )}
                    {drag && drag.dx > 40 && <span className="shape-card-stamp add">Add</span>}
                    {drag && drag.dx < -40 && <span className="shape-card-stamp skip">Skip</span>}
                  </div>
                  <div className="shape-card-body">
                    <div className="shape-card-name">{current.item.name}</div>
                    <div className="shape-card-kind">
                      {current.item.kind}
                      {current.item.heritage ? ', heritage site' : ''}
                    </div>
                    {current.item.desc && <p className="shape-card-desc">{current.item.desc}</p>}
                    {companions.length > 0 && (
                      <p className="shape-card-pair">
                        <SparkIcon size={11} /> Pairs well with {companions.map((c, i) => (
                          <span key={c.name}>{i > 0 && ' and '}<b>{c.name}</b> ({c.walkMin} min walk)</span>
                        ))}
                      </p>
                    )}
                  </div>
                </div>

                <div className="shape-deck-actions">
                  <button className="shape-deck-btn skip" onClick={() => advance('skip')} aria-label="Skip this place">
                    × Skip
                  </button>
                  <button className="shape-deck-btn add" onClick={() => advance('add')} aria-label="Add this place">
                    <CheckIcon size={13} /> Add
                  </button>
                </div>
                <p className="shape-deck-hint">Swipe the card right to add it, left to pass.</p>
              </>
            ) : null
          )}
        </div>

        <div className="guide-foot">
          <div className="guide-foot-summary">
            <button className="shape-skip" onClick={onSkip}>Skip and plan manually</button>
          </div>
          <div className="guide-foot-actions">
            {step > 1 && <button className="guide-back" onClick={() => setStep(step - 1)}>Back</button>}
            {step === 2 && (
              <button className="guide-next" onClick={() => { setDeckPos(0); setAccepted([]); setStep(3); }}>
                Next
              </button>
            )}
            {step === 3 && accepted.length > 0 && (
              <button className="guide-next" onClick={() => finishPicks(accepted)}>
                Build my {numDays > 1 ? 'days' : 'day'} ({accepted.length})
              </button>
            )}
            {step !== 2 && (
              <button className={step === 1 ? 'guide-next' : 'guide-back'} onClick={finishAuto}>
                <SparkIcon size={12} /> Let Carta pick everything
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
