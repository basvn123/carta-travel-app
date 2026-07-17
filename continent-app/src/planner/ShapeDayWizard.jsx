import React, { useMemo, useRef, useState } from 'react';
import { DAY_STYLES, DAY_LENGTHS, WALK_LEVELS, candidateDeck, nearbyCompanions, isMustSee } from './dayDraft.js';
import { SparkIcon, StarIcon, CheckIcon, MuseumIcon, TreeIcon, DiningIcon, CameraIcon, CastleIcon } from '../components/Icons.jsx';

const STYLE_ICONS = {
  classic: CastleIcon,
  culture: MuseumIcon,
  active: TreeIcon,
  foodie: DiningIcon,
  mix: CameraIcon,
};

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
 * One question per screen, one tap per question, no scrolling:
 *   Step 0  the honest fork: explore on your own, or let Carta guide you
 *   Step 1  what kind of day (mood)          - tap advances
 *   Step 2  how long the day runs            - tap advances
 *   Step 3  how much walking is okay         - tap advances
 *   Step 4  the pace (how much / how deep)   - tap advances
 *   Step 5  a swipeable card deck of Carta's picks for that mood: photo,
 *           what it is, why it's worth it. Add or skip, one card at a time.
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
  const [styleKey, setStyleKey] = useState(initial?.style || null);
  // Feasibility answers: how long the day runs and how much walking is okay.
  // These keep Carta's drafts realistic (no four-hour marches for a light
  // walker, no half-empty evenings for an early-start crowd).
  const [dayLen, setDayLen] = useState(initial?.dayLen || 'full');
  const [walk, setWalk] = useState(initial?.walk || 'moderate');
  const [pace, setPace] = useState(() => paceFromPrefs(initial));
  const style = DAY_STYLES.find((s) => s.key === styleKey) || null;
  const paceChoice = PACE_CHOICES.find((p) => p.key === pace) || PACE_CHOICES[1];

  // Deck state: position + accepted original-indices.
  const [deckPos, setDeckPos] = useState(0);
  const [accepted, setAccepted] = useState([]);
  // Swipe animation: 'add' | 'skip' | null while the top card flies out.
  const [flying, setFlying] = useState(null);
  const [drag, setDrag] = useState(null); // { dx } while dragging
  const dragRef = useRef(null);

  const deck = useMemo(() => {
    if (!style) return [];
    return candidateDeck(items, style.interests, Math.max(10, Math.min(16, numDays * 6)), eligibleIdx);
  }, [items, style, numDays, eligibleIdx]);

  const current = deck[deckPos] || null;
  const companions = useMemo(
    () => (current ? nearbyCompanions(current.item, items) : []),
    [current, items],
  );

  const feasibility = { dayLen, walk, fill: paceChoice.fill, visit: paceChoice.visit };
  const finishAuto = () => {
    onDraft({ mode: 'auto', style: styleKey, interests: style ? style.interests : [], ...feasibility });
  };
  const finishPicks = (picks) => {
    if (!picks.length) { finishAuto(); return; }
    onDraft({ mode: 'picks', style: styleKey, interests: style ? style.interests : [], pickIdx: picks, ...feasibility });
  };

  // Every question is a single tap: choose and move on.
  const pickStyle = (key) => { setStyleKey(key); setStep(2); };
  const pickDayLen = (key) => { setDayLen(key); setStep(3); };
  const pickWalk = (key) => { setWalk(key); setStep(4); };
  const pickPace = (key) => {
    setPace(key);
    setDeckPos(0);
    setAccepted([]);
    setStep(5);
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

  // A reusable one-question screen: title, short line, one tap per option.
  const question = (title, sub, options, activeKey, onPick, withIcons = false) => (
    <>
      <h2 className="guide-title">{title}</h2>
      <p className="guide-sub">{sub}</p>
      <div className="shape-style-list shape-question-list">
        {options.map((o) => {
          const Icon = withIcons ? (STYLE_ICONS[o.key] || SparkIcon) : null;
          return (
            <button
              key={o.key}
              className={`shape-style ${activeKey === o.key ? 'on' : ''}`}
              onClick={() => onPick(o.key)}
            >
              {Icon && <span className="shape-style-icon"><Icon size={18} /></span>}
              <span className="shape-style-text">
                <b>{o.label}</b>
                <small>{o.desc}</small>
              </span>
              <span className="shape-style-arrow">›</span>
            </button>
          );
        })}
      </div>
    </>
  );

  const questionStep = step >= 1 && step <= 4;

  return (
    <div className="guide-overlay" onClick={onSkip}>
      <div className="guide-modal shape-modal" onClick={(e) => e.stopPropagation()}>
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
            'Tap a mood; Carta only suggests places that fit it.',
            DAY_STYLES, styleKey, pickStyle, true,
          )}

          {step === 2 && question(
            'How long are you out?',
            'So a drafted day never runs longer than you want to be.',
            DAY_LENGTHS, dayLen, pickDayLen,
          )}

          {step === 3 && question(
            'How much walking is okay?',
            'Carta keeps every stop within comfortable reach of the next.',
            WALK_LEVELS, walk, pickWalk,
          )}

          {step === 4 && question(
            'What pace suits you?',
            'One last tap: how full should each day be?',
            PACE_CHOICES, pace, pickPace,
          )}

          {step === 5 && (
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
                    {isMustSee(current.item) && (
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
            {step >= 1 && <button className="shape-skip" onClick={onSkip}>Skip and plan manually</button>}
          </div>
          <div className="guide-foot-actions">
            {step > 0 && <button className="guide-back" onClick={() => setStep(step - 1)}>Back</button>}
            {step === 5 && accepted.length > 0 && (
              <button className="guide-next" onClick={() => finishPicks(accepted)}>
                Build my {numDays > 1 ? 'days' : 'day'} ({accepted.length})
              </button>
            )}
            {(questionStep || (step === 5 && accepted.length === 0)) && (
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
