import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, IconButton, Tabs } from '../../components/ui/index.js';
import { ChevronRightIcon } from '../../components/Icons.jsx';
import { CHAPTERS, screenSrc } from '../../lib/homeDemo.js';
import { PhoneFrame, PhoneScreen } from './Devices.jsx';
import { useMedia, useReducedMotion } from './useHome.js';

/**
 * The story (T463): the trip in five chapters, each shown on a real capture
 * of the app (lib/homeDemo.js CHAPTERS, public/home/<lang>/).
 *
 * From 1024 px one phone stays pinned beside the chapters and shows the
 * chapter in view: its screen crossfades when the next chapter reaches the
 * middle of the page, and the chapter bar under it follows (the owner chose
 * this form on 2026-10-17, DESIGN.md "Home page exception"). The bar's tabs
 * scroll to their chapter. Nothing scrubs, slides or scales with the scroll.
 *
 * Below 1024 px the chapters are a snap track, one chapter a slide with its
 * own phone, about 85 percent wide so the next shows (carta-design "Tracks"):
 * the chapter bar, Previous and Next, the position, arrow keys and the swipe
 * all move it; nothing moves on its own.
 *
 * Props
 *   lang   the UI language, which picks the captures
 *   acts   { [door]: { label, href?, go } }, one real door per chapter
 *   door   the page's click handler factory (a plain click runs the app's
 *          own door, a modifier click is the browser's)
 */

const DESK = '(min-width: 1024px)';

export function HomeStory({ lang, acts, door }) {
  const { t } = useI18n();
  const wide = useMedia(DESK);
  const reduced = useReducedMotion();
  const [active, setActive] = React.useState(0);
  const trackRef = React.useRef(null);
  const itemRefs = React.useRef([]);

  // Wide: the chapter crossing the middle of the page is the one in view.
  React.useEffect(() => {
    if (!wide || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) setActive(Number(e.target.dataset.i));
      }
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    for (const el of itemRefs.current) if (el) io.observe(el);
    return () => io.disconnect();
  }, [wide]);

  // Narrow: the slide nearest the track's start is the one in view.
  React.useEffect(() => {
    const track = trackRef.current;
    if (wide || !track) return undefined;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const items = itemRefs.current.filter(Boolean);
        const left = track.scrollLeft;
        let best = 0;
        let bestD = Infinity;
        items.forEach((el, i) => {
          const d = Math.abs(el.offsetLeft - left - items[0].offsetLeft);
          if (d < bestD) { bestD = d; best = i; }
        });
        setActive(best);
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => { track.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [wide]);

  const goTo = (i) => {
    const n = Math.max(0, Math.min(CHAPTERS.length - 1, i));
    const el = itemRefs.current[n];
    if (!el) return;
    const behavior = reduced ? 'auto' : 'smooth';
    setActive(n);
    if (wide) {
      el.scrollIntoView({ block: 'center', behavior });
    } else {
      const track = trackRef.current;
      const first = itemRefs.current[0];
      track?.scrollTo({ left: el.offsetLeft - (first?.offsetLeft || 0), behavior });
    }
  };

  const onTrackKey = (e) => {
    if (wide) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(active + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(active - 1); }
  };

  const tabs = CHAPTERS.map((c) => ({ id: c.id, label: t(c.tab) }));
  const bar = (cls) => (
    <Tabs
      label={t('home.storyBar')}
      tabs={tabs}
      value={CHAPTERS[active].id}
      panelId="home-chapters"
      className={`home-story-bar ${cls}`}
      onChange={(id) => goTo(CHAPTERS.findIndex((c) => c.id === id))}
    />
  );

  return (
    <section className="home-section home-story" aria-labelledby="home-story-title">
      <h2 id="home-story-title" className="home-h2 home-story-title">{t('home.storyTitle')}</h2>
      <div className="home-story-grid">
        <div className="home-story-stage">
          <div className="home-story-pin">
            <PhoneFrame className="home-story-phone">
              {CHAPTERS.map((c, i) => (
                <PhoneScreen
                  key={c.id}
                  src={screenSrc(lang, c.id)}
                  alt={i === active ? t(c.alt) : ''}
                  className={i === active ? 'is-on' : ''}
                  hidden={i !== active}
                />
              ))}
            </PhoneFrame>
            {bar('is-wide')}
          </div>
        </div>

        <div className="home-story-col">
          {bar('is-narrow')}
          <ol
            id="home-chapters"
            ref={trackRef}
            className="home-chapters"
            aria-label={t('home.storyTitle')}
            tabIndex={wide ? undefined : 0}
            onKeyDown={onTrackKey}
          >
            {CHAPTERS.map((c, i) => {
              const act = acts?.[c.door];
              return (
                <li
                  key={c.id}
                  ref={(el) => { itemRefs.current[i] = el; }}
                  data-i={i}
                  className={`home-chapter${i === active ? ' is-on' : ''}`}
                  aria-current={i === active ? 'step' : undefined}
                >
                  <PhoneFrame className="home-chapter-phone" src={screenSrc(lang, c.id)} alt={t(c.alt)} />
                  <div className="home-chapter-text">
                    <h3 className="home-h3 home-chapter-title">{t(c.title)}</h3>
                    <p className="home-chapter-body">{t(c.body)}</p>
                    {act && (act.href ? (
                      <a className="btn btn-quiet btn-sm home-door" href={act.href} onClick={door(act.go)}>
                        <span className="btn-label">{act.label}</span>
                        <span className="btn-icon" aria-hidden="true"><ChevronRightIcon size={16} /></span>
                      </a>
                    ) : (
                      <Button variant="quiet" size="sm" className="home-door" onClick={act.go}
                        iconEnd={<ChevronRightIcon size={16} />}>
                        {act.label}
                      </Button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="home-track-nav">
            <IconButton label={t('home.prev')} className="home-track-prev" disabled={active === 0} onClick={() => goTo(active - 1)}>
              <ChevronRightIcon size={20} className="home-flip" />
            </IconButton>
            <span className="home-track-pos" aria-live="polite">
              {t('home.chapterPos', { n: active + 1, total: CHAPTERS.length })}
            </span>
            <IconButton label={t('home.next')} className="home-track-next" disabled={active === CHAPTERS.length - 1} onClick={() => goTo(active + 1)}>
              <ChevronRightIcon size={20} />
            </IconButton>
          </div>
        </div>
      </div>
    </section>
  );
}
