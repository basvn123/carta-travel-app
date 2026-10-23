import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { SearchIcon, SparkIcon } from '../../components/Icons.jsx';
import { srcSetFor, thumbAt } from '../../lib/heroImage.js';
import { loadGuidedData } from '../../lib/guidedData.js';
import { FILM } from '../../lib/homeDemo.js';
import { useAutoAdvance, useInView, usePageVisible, useReducedMotion } from './useHome.js';

/**
 * The hero (T620 and T621, owner 2026-10-23, after Mindtrip and Komoot): the
 * film fills the first screen from edge to edge, the app header lies on it
 * (HomePage tells the shell), and the words stand on it.
 *
 * The film is the five licensed clips of real places (T618), cut together as
 * one continuous film: each clip crossfades into the next, with no bars, no
 * pills and no control on it, so it reads as footage, not as slides. One even
 * tint over the whole film (--home-film-tint, no gradient) keeps white words
 * readable on every clip (T620 measured them). The owner chose no pause
 * control; the film still stops off screen, in a hidden tab and under reduced
 * motion, where the first shot's poster stands still (register T620-a).
 *
 * On the film: the slogan, one line of what Carta does, and Ask Carta's
 * field alone (T621), its "Ask Carta" the page's one primary. What is asked
 * opens Carta's chat on Explore at once, already asking (T566); the chat's
 * code is fetched the moment the field is pointed at, so it opens without a
 * wait. The clips' credits stay in homeDemo.js (the Pexels License asks for
 * none on the page; owner, T621).
 *
 * Props
 *   onSearch   ({ question } | { open: true }) hands the question to Explore
 */
export function HomeHero({ onSearch, titleAs = 'h1', children }) {
  const { t } = useI18n();
  const Title = titleAs;
  return (
    <section className="hv-hero" aria-labelledby="hv-title">
      <div className="hv-hero-stage">
        <HomeFilm />
        {children}
        <div className="hv-hero-copy">
          <Title id="hv-title" className="hv-slogan">{t('home.title')}</Title>
          <p className="hv-sub">{t('home.sub')}</p>
          <div className="hv-acts">
            <AskField t={t} onSearch={onSearch} id="hv-ask" primary />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Ask Carta's field: what is typed goes to Explore as the question; Ask
 *  with nothing typed opens the chat there. Explore's vocabulary and the
 *  chat's own code are fetched the moment the field is pointed at or
 *  touched. `primary` makes its button the page's one primary, "Ask Carta"
 *  with the spark (the hero); otherwise it is a quiet "Ask". The glyph and
 *  the field share a box (T623): on a phone the hero puts the primary under
 *  it at full width, so the whole placeholder shows in every language. */
const warmChat = () => import('../ask/AskChat.jsx').catch(() => {});
export function AskField({ t, onSearch, id, primary = false }) {
  const [text, setText] = React.useState('');
  const warm = () => { loadGuidedData(); warmChat(); };
  const ask = (e) => {
    e.preventDefault();
    const q = text.trim();
    onSearch(q ? { question: q } : { open: true });
  };
  return (
    <form className="hv-ask" role="search" onSubmit={ask} onPointerEnter={warm} onPointerDown={warm} onFocus={warm}>
      <span className="hv-ask-box">
        <span className="hv-ask-glyph" aria-hidden="true"><SearchIcon size={20} /></span>
        <input id={id} className="hv-ask-input" type="text" value={text} maxLength={200}
          onChange={(e) => setText(e.target.value)} aria-label={t('ask.inputLabel')}
          placeholder={t('home.askPlaceholder')} autoComplete="off" spellCheck={false} enterKeyHint="search" />
      </span>
      {primary ? (
        <Button type="submit" variant="primary" className="hv-ask-go hv-ask-go-main" iconStart={<SparkIcon size={18} />}>
          {t('askChat.open')}
        </Button>
      ) : (
        <Button type="submit" variant="secondary" size="sm" className="hv-ask-go">{t('ask.go')}</Button>
      )}
    </form>
  );
}

/** The film: every shot stacked, the current one shown; the next shot's
 *  clip is fetched while the current one plays, nothing further. Pure
 *  decoration for assistive tech: the words on it carry the message. */
function HomeFilm() {
  const ref = React.useRef(null);
  const onScreen = useInView(ref, { threshold: 0.2 });
  const visible = usePageVisible();
  const reduced = useReducedMotion();
  const running = onScreen && visible && !reduced;
  const film = useAutoAdvance(FILM.length, { ms: 9000, running });
  const at = film.index;
  const [loaded, setLoaded] = React.useState(() => new Set([0, 1]));
  React.useEffect(() => {
    setLoaded((s) => (s.has(at + 1) || at + 1 >= FILM.length ? s : new Set([...s, at + 1])));
  }, [at]);

  return (
    <div className={`hv-film${running ? ' is-running' : ''}`} ref={ref} aria-hidden="true">
      {FILM.map((shot, i) => {
        const on = i === at;
        return (
          <div key={shot.id} className={`hv-shot${on ? ' is-on' : ''}`}>
            {loaded.has(i) && (shot.clip ? (
              <FilmClip clip={shot.clip} on={on} playing={on && running} first={i === 0} />
            ) : (
              <img className="hv-shot-media" src={thumbAt(shot.photo.url, 1280)} srcSet={srcSetFor(shot.photo.url, 1920)}
                sizes="100vw" alt="" style={{ objectPosition: shot.photo.focus }}
                loading={i === 0 ? 'eager' : 'lazy'} fetchpriority={i === 0 ? 'high' : undefined} decoding="async" />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** One shot's clip: its poster shows at once (the first shot's poster is the
 *  page's first picture), the clip plays from its start each time its shot
 *  comes on and stops when the film stops; a shot off screen loads nothing
 *  past its metadata. */
function FilmClip({ clip, on, playing, first }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (on && v.currentTime > 0 && v.paused) v.currentTime = 0;
  }, [on]);
  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (playing) v.play().catch(() => {}); else v.pause();
  }, [playing]);
  return (
    <video ref={ref} className="hv-shot-media" muted playsInline loop
      preload={on ? 'auto' : 'metadata'} poster={clip.poster}
      fetchpriority={first ? 'high' : undefined}>
      <source src={clip.mp4} type="video/mp4" />
    </video>
  );
}
