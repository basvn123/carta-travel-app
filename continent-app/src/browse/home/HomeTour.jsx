import React from 'react';
import { m, useInView, AnimatePresence } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { clipSrc } from '../../lib/homeDemo.js';
import { MaskedText, Reveal, SPRING } from './motionKit.jsx';
import {
  BookmarkSimple, Clock, Coins, GlobeHemisphereWest, HandCoins, ICON, Lightbulb, MagnifyingGlass, MapTrifold,
  Mountains, Path, Scales, Sparkle, Ticket, Train, UsersThree,
} from './homeIcons.jsx';

/**
 * Everything in one place (T952, owner 2026-10-31: "the user needs to know
 * what they can do with my app by scrolling through this"). Five chapters,
 * each a recording of the app doing it: Ask, Explore, Plan, My trips and
 * Together. Each chapter says what it is in three short lines with an icon,
 * not a paragraph (owner: "present this in a more simple way").
 *
 * On a wider screen one clean screen stays beside the chapters and changes
 * to the chapter in the middle of the view; on a phone each chapter carries
 * its own screen. One clip plays at a time, only while it is on screen.
 *
 * Each chapter names its own recording first and an older one second: the
 * browser plays the first that exists, so the page needs no change when
 * scripts/record_home_clips.mjs records the new chapters (register T952-a).
 */
const FEATURES = [
  { id: 'ask', clip: ['ask', 'find'], icon: Sparkle, door: 'ask',
    rows: [[MagnifyingGlass, 'home.tAsk1'], [Coins, 'home.tAsk2'], [Path, 'home.tAsk3']] },
  { id: 'explore', clip: ['explore', 'place'], icon: Mountains, door: 'explore',
    rows: [[Coins, 'home.tExp1'], [Mountains, 'home.tExp2'], [Lightbulb, 'home.tExp3']] },
  { id: 'plan', clip: ['day', 'plan'], icon: Path, door: 'plan',
    rows: [[Train, 'home.tPlan1'], [Clock, 'home.tPlan2'], [MapTrifold, 'home.tPlan3']] },
  { id: 'trips', clip: ['trips', 'share'], icon: BookmarkSimple, door: 'trips',
    rows: [[BookmarkSimple, 'home.tTrips1'], [Ticket, 'home.tTrips2'], [GlobeHemisphereWest, 'home.tTrips3']] },
  { id: 'together', clip: ['together', 'share'], icon: UsersThree, door: 'together',
    rows: [[UsersThree, 'home.tTog1'], [Scales, 'home.tTog2'], [HandCoins, 'home.tTog3']] },
];

export function HomeTour({ lang, doors, wide }) {
  const { t } = useI18n();
  const [active, setActive] = React.useState(0);
  const seen = React.useCallback((i, on) => { if (on) setActive(i); }, []);
  const f = FEATURES[active];
  return (
    <section className="hm-tour" aria-labelledby="hm-tour-title">
      <div className="hm-in">
        <div className="hm-tour-head">
          <MaskedText as="p" className="hm-kick" parts={[t('home.tourKick')]} />
          <MaskedText id="hm-tour-title" className="hm-big" parts={[t('home.tourTitle')]} />
        </div>
        <div className="hm-tour-grid">
          <div>
            {FEATURES.map((x, i) => (
              <Feature key={x.id} i={i} f={x} t={t} lang={lang} door={doors[x.door]} wide={wide} onSeen={seen} on={i === active} />
            ))}
          </div>
          {wide && (
            <div className="hm-tour-stage" aria-hidden="true">
              <div className="hm-screen">
                <AnimatePresence mode="wait" initial={false}>
                  <m.div key={f.id} className="hm-screen-in" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }} transition={SPRING.surface}>
                    <Clip lang={lang} ids={f.clip} playing />
                  </m.div>
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
        <Reveal className="hm-also">
          <b>{t('home.alsoTitle')}</b>
          {['home.also1', 'home.also2', 'home.also3', 'home.also4', 'home.also5'].map((k) => <span key={k}>{t(k)}</span>)}
        </Reveal>
      </div>
    </section>
  );
}

function Feature({ i, f, t, lang, door, wide, onSeen, on }) {
  const ref = React.useRef(null);
  const mid = useInView(ref, { margin: '-45% 0px -45% 0px' });
  const near = useInView(ref, { margin: '0px 0px -20% 0px' });
  React.useEffect(() => { onSeen(i, mid); }, [i, mid, onSeen]);
  const Icon = f.icon;
  return (
    <Reveal as="article" className={`hm-feature${on ? ' is-on' : ''}`} ref={ref}>
      <span className="hm-feature-tag"><span className="hm-feature-dot"><Icon {...ICON} /></span>{t(`home.t_${f.id}`)}</span>
      <h3 className="hm-feature-title">{t(`home.t_${f.id}Title`)}</h3>
      <ul className="hm-feature-rows">
        {f.rows.map(([RowIcon, key]) => <li key={key}><RowIcon {...ICON} size={20} />{t(key)}</li>)}
      </ul>
      {door && (
        <a className="hm-feature-door" href={door.href} onClick={door.go}>{door.label}</a>
      )}
      {!wide && <div className="hm-screen hm-screen-inline"><Clip lang={lang} ids={f.clip} playing={near} /></div>}
    </Reveal>
  );
}

/** A recording: the first source that exists plays; it plays only while
 *  asked to, and stands on its poster under reduced motion. */
function Clip({ lang, ids, playing }) {
  const ref = React.useRef(null);
  const [fallback] = ids.slice(-1);
  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (playing && !reduce) v.play().catch(() => {}); else v.pause();
  }, [playing]);
  return (
    <video ref={ref} className="hm-clip" muted playsInline loop preload={playing ? 'auto' : 'none'}
      poster={clipSrc(lang, fallback, 'poster')}>
      {ids.map((id) => <source key={id} src={clipSrc(lang, id)} type="video/mp4" />)}
    </video>
  );
}
