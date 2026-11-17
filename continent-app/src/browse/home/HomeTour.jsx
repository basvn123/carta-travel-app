import React from 'react';
import { m, useInView, useIsPresent, useReducedMotion, AnimatePresence } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { clipSrc } from '../../lib/homeDemo.js';
import { MaskedText, Reveal, SPRING } from './motionKit.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { Blaze } from '../../components/ui/index.js';

/** Ask carries the boxed AI tag, never a sparkle (DESIGN.md "Icons"). */
function AskTag() { return <span className="ai-tag" aria-hidden="true">AI</span>; }

/**
 * Everything in one place (T952; house style 2026-11: the paint bar, house icons; one stage since T956, owner 2026-10-31:
 * "it needs to really stand out what you can do, make it dynamic, but also
 * compact, the user doesn't want to scroll too much").
 *
 * One stage, five chapters as tabs: Ask, Explore, Plan, My trips and
 * Together. The stage holds one large recording of the app on a ground
 * tinted per chapter. The tour plays itself through once while it is in
 * view: each tab's bar fills with its clip, and the chapter's three lines
 * light up in turn as the clip reaches them, the newest one shown beside the
 * screen as well. The tabs are the control (owner: no pause or play button):
 * a tap on one takes over for good and its clip loops, and the tour holds its
 * chapter while the pointer or focus is on the tabs. After one round it rests
 * on the first chapter. Reduced motion: nothing plays by itself, every line
 * is lit, the stage shows each clip's poster.
 *
 * Each chapter names its own recording first and an older one second: the
 * browser plays the first that exists (scripts/record_home_clips.mjs).
 */
const H = HouseIcon;
const FEATURES = [
  { id: 'ask', clip: ['ask', 'find'], icon: AskTag, door: 'ask',
    rows: [[H.search, 'home.tAsk1'], [H.food, 'home.tAsk2'], [H.route, 'home.tAsk3']] },
  { id: 'explore', clip: ['explore', 'place'], icon: H.places, door: 'explore',
    rows: [[H.signpost, 'home.tExp1'], [H.trails, 'home.tExp2'], [H.bulb, 'home.tExp3']] },
  { id: 'plan', clip: ['day', 'plan'], icon: H.route, door: 'plan',
    rows: [[H.train, 'home.tPlan1'], [H.clock, 'home.tPlan2'], [H.map, 'home.tPlan3']] },
  { id: 'trips', clip: ['trips', 'share'], icon: H.pack, door: 'trips',
    rows: [[H.pack, 'home.tTrips1'], [H.note, 'home.tTrips2'], [H.borders, 'home.tTrips3']] },
  { id: 'together', clip: ['together', 'share'], icon: H.rings, door: 'together',
    rows: [[H.people, 'home.tTog1'], [H.gauge, 'home.tTog2'], [H.rings, 'home.tTog3']] },
];

/** No chapter holds the stage longer than this, whatever its clip. */
const CAP_S = 12;

export function HomeTour({ lang, doors, wide }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const ref = React.useRef(null);
  const inView = useInView(ref, { amount: 0.45 });
  const [active, setActive] = React.useState(0);
  // auto: the tour moves on by itself; it ends after one round, or for good
  // once the visitor picks. hold: the pointer or focus is on the tabs, so the
  // chapter stays (its clip loops) until they leave.
  const [auto, setAuto] = React.useState(true);
  const [hold, setHold] = React.useState(false);
  const [lit, setLit] = React.useState(1);
  const bars = React.useRef([]);
  const hidden = useDocHidden();
  const playing = !reduce && inView && !hidden;
  const moving = auto && !hold;
  const f = FEATURES[active];

  const show = React.useCallback((i) => {
    bars.current.forEach((b, j) => b?.style.setProperty('--p', j < i ? 1 : 0));
    setActive(i);
    setLit(1);
  }, []);
  const pick = (i) => { setAuto(false); show(i); };
  const onProgress = React.useCallback((p) => {
    bars.current[active]?.style.setProperty('--p', p);
    setLit(Math.min(3, 1 + Math.floor(p * 3)));
  }, [active]);
  const onEnd = React.useCallback(() => {
    if (!moving) return;
    if (active + 1 < FEATURES.length) { show(active + 1); return; }
    // One round, then the tour rests on its first chapter.
    setAuto(false); show(0);
  }, [moving, active, show]);
  const onKey = (e) => {
    const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    let i = null;
    if (k) i = (active + k + FEATURES.length) % FEATURES.length;
    if (e.key === 'Home') i = 0;
    if (e.key === 'End') i = FEATURES.length - 1;
    if (i == null) return;
    e.preventDefault();
    pick(i);
    document.getElementById(`hm-tab-${FEATURES[i].id}`)?.focus();
  };
  const shown = reduce ? 3 : lit;
  const door = doors[f.door];

  return (
    <section className="hm-tour" aria-labelledby="hm-tour-title" ref={ref}>
      <div className="hm-in">
        <div className="hm-tour-head">
          <MaskedText id="hm-tour-title" className="hm-big" parts={[t('home.tourTitle')]} />
        </div>
        <Reveal className="hm-tour-grid" amount={0.1}>
          <div className="hm-tour-side" onPointerEnter={() => setHold(true)} onPointerLeave={() => setHold(false)}
            onFocus={() => setHold(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHold(false); }}>
            <div className="hm-tabs" role="tablist" aria-label={t('home.tourTitle')} aria-orientation={wide ? 'vertical' : 'horizontal'} onKeyDown={onKey}>
              {FEATURES.map((x, i) => (
                <button key={x.id} id={`hm-tab-${x.id}`} type="button" role="tab" aria-selected={i === active}
                  aria-controls="hm-tour-panel" tabIndex={i === active ? 0 : -1}
                  className={`hm-tab${i === active ? ' is-on' : ''}`} onClick={() => pick(i)}>
                  <span className="hm-tab-dot" aria-hidden="true"><x.icon size={20} /></span>
                  <span className="hm-tab-name">{t(`home.t_${x.id}`)}</span>
                  {/* The blaze marks the chosen chapter ("here"); painted on select. */}
                  {i === active && <Blaze size="sm" className="hm-tab-blaze hs-paint" />}
                  <span className="hm-tab-bar" aria-hidden="true"><i ref={(el) => { bars.current[i] = el; }} /></span>
                </button>
              ))}
            </div>
            <div id="hm-tour-panel" role="tabpanel" aria-labelledby={`hm-tab-${f.id}`} className="hm-panel">
              <AnimatePresence mode="wait" initial={false}>
                <m.div key={f.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  transition={SPRING.surface}>
                  <h3 className="hm-panel-title">{t(`home.t_${f.id}Title`)}</h3>
                  <ul className="hm-panel-rows">
                    {f.rows.map(([RowIcon, key], i) => (
                      <li key={key} className={i < shown ? 'is-lit' : undefined}>
                        <span className="hm-row-dot" aria-hidden="true"><RowIcon size={18} /></span>
                        {t(key)}
                      </li>
                    ))}
                  </ul>
                  {door && (
                    <a className="hm-panel-door" href={door.href} onClick={door.go}>
                      {door.label}<HouseIcon.next size={18} />
                    </a>
                  )}
                </m.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="hm-stage-panel">
            <div className="hm-stage-glow" aria-hidden="true" />
            <div className="hm-phone" aria-hidden="true">
              <AnimatePresence initial={false}>
                <m.div key={f.id} className="hm-phone-in" initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }} transition={SPRING.surface}>
                  <Clip lang={lang} ids={f.clip} playing={playing} loop={!moving} onProgress={onProgress} onEnd={onEnd} />
                </m.div>
              </AnimatePresence>
            </div>
            {wide && !reduce && (
              <div className="hm-notes" aria-hidden="true">
                <AnimatePresence>
                  {f.rows.slice(0, shown).map(([RowIcon, key], i) => (i === shown - 1 ? (
                    <m.span key={`${f.id}-${key}`} className={`hm-note at-${i}`}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: SPRING.settle }}
                      transition={SPRING.settle}>
                      <RowIcon size={18} />{t(key)}
                    </m.span>
                  ) : null))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </Reveal>
        <Reveal className="hm-also">
          <b>{t('home.alsoTitle')}</b>
          {['home.also1', 'home.also2', 'home.also3', 'home.also4', 'home.also5'].map((k) => <span key={k}>{t(k)}</span>)}
        </Reveal>
      </div>
    </section>
  );
}

/** Whether the browser tab is hidden: nothing plays behind another tab. */
function useDocHidden() {
  const [hidden, setHidden] = React.useState(typeof document !== 'undefined' && document.hidden);
  React.useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return hidden;
}

/** A recording: the first source that exists plays, only while asked to.
 *  It reports how far it has got (0 to 1, capped at CAP_S) every frame and
 *  says when it is over; looping, it starts again instead. A clip fading
 *  out after a change of chapter is silent, so it never lights the next
 *  chapter's lines. */
function Clip({ lang, ids, playing, loop, onProgress, onEnd }) {
  const ref = React.useRef(null);
  const present = useIsPresent();
  const cb = React.useRef({ onProgress, onEnd, loop });
  cb.current = { onProgress, onEnd, loop };
  React.useEffect(() => {
    const v = ref.current;
    if (!v) return undefined;
    if (playing && present) v.play().catch(() => {}); else v.pause();
    if (!playing || !present) return undefined;
    let raf = 0;
    let over = false;
    const tick = () => {
      const len = Math.min(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : CAP_S, CAP_S);
      const p = Math.min(1, v.currentTime / len);
      cb.current.onProgress(p);
      if (p >= 1 && !over) {
        if (cb.current.loop) v.currentTime = 0;
        else { over = true; cb.current.onEnd(); return; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, present]);
  return (
    <video ref={ref} className="hm-clip" muted playsInline preload="auto" poster={clipSrc(lang, ids[0], 'poster')}>
      {ids.map((id) => <source key={id} src={clipSrc(lang, id)} type="video/mp4" />)}
    </video>
  );
}
