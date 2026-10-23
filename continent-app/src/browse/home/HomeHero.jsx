import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, IconButton, Money } from '../../components/ui/index.js';
import { SearchIcon } from '../../components/Icons.jsx';
import { srcSetFor, thumbAt } from '../../lib/heroImage.js';
import { loadGuidedData } from '../../lib/guidedData.js';
import { tabHref } from '../../lib/urlState.js';
import { FILM, exploreHref, isEstimate, placeDay } from '../../lib/homeDemo.js';
import { useAutoAdvance, useInView, usePageVisible, useReducedMotion } from './useHome.js';

/**
 * The hero (T606, owner decisions D1, D2, D4 and D7 of 2026-10-23).
 *
 * A film on a rounded stage, then the slogan on paper under it, never on the
 * picture (D2). The film is one traveller's place after another; on each, a
 * solid pill names the place and its own day price, and a second gives the
 * cheapest return flight there from the traveller's home airport, Google
 * Flights' price: the cheap part beside what a day costs. The pills drift a
 * few pixels on loops of different length; a pill is a link to that
 * traveller's search.
 *
 * The film moves only while it is on screen, the tab is visible and nobody
 * paused it, and never under reduced motion (the first shot then stands
 * still). Pause is a real button (WCAG 2.2.2). Until licensed clips arrive
 * (register T605-b) a shot is its photograph with a slow push in; a shot with
 * `clip` plays it.
 *
 * Under the stage: the slogan, one line of what Carta does, Ask Carta's
 * field (the question goes to Explore, where the chat answers it, T566),
 * "Plan a trip", the page's one primary, and "Log in" beside it for a
 * visitor who is not signed in (D7).
 *
 * Props
 *   rows       catalogue rows with day costs (homeDemo searchRows)
 *   flightFor  (placeId) => { perSeat, airline } | null, from the sweep
 *   signedIn   hides "Log in"
 *   door       the page's click handler factory
 *   onSearch, onNavigate, onLogin
 */
export function HomeHero({ rows, flightFor, signedIn, door, onSearch, onNavigate, onLogin, titleAs = 'h1' }) {
  const { t } = useI18n();
  const Title = titleAs;
  return (
    <section className="hv-hero" aria-labelledby="hv-title">
      <HomeFilm rows={rows} flightFor={flightFor} door={door} onSearch={onSearch} />
      <div className="hv-hero-copy">
        <Title id="hv-title" className="hv-slogan">{t('home.title')}</Title>
        <div className="hv-hero-side">
          <p className="hv-sub">{t('home.sub')}</p>
          <AskField t={t} onSearch={onSearch} id="hv-ask" />
          <div className="hv-acts">
            <a className="btn btn-primary hv-cta" href={tabHref('trip')} onClick={door(() => onNavigate('trip'))}>
              <span className="btn-label">{t('home.ctaPlan')}</span>
            </a>
            {!signedIn && (
              <Button variant="quiet" className="hv-login" onClick={onLogin}>{t('home.login')}</Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Ask Carta's field: what is typed goes to Explore as the question; Ask
 *  with nothing typed opens the chat there. Explore's vocabulary is fetched
 *  the moment the field is pointed at or touched. */
export function AskField({ t, onSearch, id }) {
  const [text, setText] = React.useState('');
  const warm = () => { loadGuidedData(); };
  const ask = (e) => {
    e.preventDefault();
    const q = text.trim();
    onSearch(q ? { question: q } : { open: true });
  };
  return (
    <form className="hv-ask" role="search" onSubmit={ask} onPointerEnter={warm} onPointerDown={warm} onFocus={warm}>
      <span className="hv-ask-glyph" aria-hidden="true"><SearchIcon size={20} /></span>
      <input id={id} className="hv-ask-input" type="text" value={text} maxLength={200}
        onChange={(e) => setText(e.target.value)} aria-label={t('ask.inputLabel')}
        placeholder={t('home.askPlaceholder')} autoComplete="off" spellCheck={false} enterKeyHint="search" />
      <Button type="submit" variant="secondary" size="sm" className="hv-ask-go">{t('ask.go')}</Button>
    </form>
  );
}

const PauseGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="3" width="3" height="10" rx="1" fill="currentColor" /><rect x="9" y="3" width="3" height="10" rx="1" fill="currentColor" /></svg>
);
const PlayGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5Z" fill="currentColor" /></svg>
);

/** The stage: every shot stacked, the current one shown; the next shot's
 *  picture is fetched while the current one plays, nothing further. */
function HomeFilm({ rows, flightFor, door, onSearch }) {
  const { t } = useI18n();
  const stageRef = React.useRef(null);
  const onScreen = useInView(stageRef, { threshold: 0.3 });
  const visible = usePageVisible();
  const reduced = useReducedMotion();
  const [paused, setPaused] = React.useState(false);
  const running = onScreen && visible && !reduced && !paused;
  const film = useAutoAdvance(FILM.length, { ms: 9000, running });
  const at = film.index;
  const [loaded, setLoaded] = React.useState(() => new Set([0, 1]));
  React.useEffect(() => {
    setLoaded((s) => (s.has(at + 1) || at + 1 >= FILM.length ? s : new Set([...s, at + 1])));
  }, [at]);

  return (
    <div className="hv-film">
    <div className={`hv-stage${running ? ' is-running' : ''}`} ref={stageRef}
      role="region" aria-roledescription={t('home.filmRole')} aria-label={t('home.filmLabel')}>
      {FILM.map((shot, i) => {
        const on = i === at;
        const cost = placeDay(rows, shot.place);
        const fly = flightFor ? flightFor(shot.place) : null;
        return (
          <div key={shot.id} className={`hv-shot${on ? ' is-on' : ''}`} aria-hidden={on ? undefined : 'true'}>
            {loaded.has(i) && (shot.clip ? (
              <video className="hv-shot-media" muted playsInline loop preload="none"
                poster={thumbAt(shot.photo.url, 1600)} ref={(v) => { if (v) { if (on && running) v.play().catch(() => {}); else v.pause(); } }}>
                <source src={shot.clip.mp4} type="video/mp4" />
              </video>
            ) : (
              <img className="hv-shot-media" src={thumbAt(shot.photo.url, 1280)} srcSet={srcSetFor(shot.photo.url, 1600)}
                sizes="(min-width: 1240px) 1240px, 100vw" alt="" style={{ objectPosition: shot.photo.focus }}
                loading={i === 0 ? 'eager' : 'lazy'} fetchpriority={i === 0 ? 'high' : undefined} decoding="async" />
            ))}
            <div className="hv-pills">
              <a className="hv-pill hv-pill-a" href={exploreHref(shot.facets)} tabIndex={on ? 0 : -1}
                onClick={door(() => onSearch({ facets: shot.facets }))}>
                <span className="hv-pill-name">{shot.label}</span>
                {cost && (
                  <span className="hv-pill-fig">
                    <Money value={cost.dayEur} est={isEstimate(cost)} />
                    <span className="hv-pill-unit">{t('home.aDayUnit')}</span>
                  </span>
                )}
              </a>
              {fly && (
                <span className="hv-pill hv-pill-b">
                  <span className="hv-pill-name">{t('home.returnFlight')}</span>
                  <span className="hv-pill-fig"><Money value={fly.perSeat} /></span>
                </span>
              )}
            </div>
          </div>
        );
      })}
      <ol className="hv-film-steps" aria-hidden="true">
        {FILM.map((shot, i) => <li key={shot.id} className={i === at ? 'is-on' : i < at ? 'is-done' : ''} />)}
      </ol>
      {!reduced && (
        <IconButton className="hv-film-pause" tone="photo" label={t('home.filmPause')}
          pressed={paused} onClick={() => setPaused((p) => !p)}>
          {paused ? <PlayGlyph /> : <PauseGlyph />}
        </IconButton>
      )}
    </div>
    <FilmCredit at={at} />
    </div>
  );
}

/** The shown photograph's credit, on its caption line under the stage
 *  (a credit is text, never on the picture). */
function FilmCredit({ at }) {
  const { t } = useI18n();
  const p = FILM[at]?.photo;
  if (!p) return null;
  return (
    <p key={at} className="hv-film-credit">
      <a href={p.page} target="_blank" rel="noopener noreferrer">{p.credit}</a>
      {t('home.photoBy', { who: p.author, licence: p.licence })}
    </p>
  );
}
