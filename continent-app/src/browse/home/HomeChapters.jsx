import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, IconButton, Tabs } from '../../components/ui/index.js';
import { ChevronRightIcon } from '../../components/Icons.jsx';
import { CHAPTERS, CLIP_SIZE, clipSrc } from '../../lib/homeDemo.js';
import { useAutoAdvance, useInView, usePageVisible, useReducedMotion, useReveal } from './useHome.js';

/**
 * The story (T606, the owner's Mindtrip reference, "every section has nice
 * colours and is super dynamic", and the Linear note: "the dynamic videos
 * show how something is used"). One trip in five panels: find, price, plan,
 * the days, share. Each panel lies on its own home ground and plays a screen
 * recording of the running app doing that step (scripts/record_home_clips.mjs,
 * the real app through real links, so every price in a clip is one the app
 * showed). Recorded, not animated live, so it never stutters.
 *
 * A clip plays only while the panel is on screen and the tab visible; when
 * it ends the next chapter comes, and the line under the tab row fills with
 * the clip's time. A tab picked by hand stops the moving on. Under reduced
 * motion the clip shows its first frame with a play control.
 *
 * Props
 *   lang   the UI language, which picks the clips
 *   acts   { [door]: { label, href?, go } }, one real door per chapter
 *   door   the page's click handler factory
 */
export function HomeChapters({ lang, acts, door }) {
  const { t } = useI18n();
  const reveal = useReveal();
  const panelRef = React.useRef(null);
  const onScreen = useInView(panelRef, { threshold: 0.35 });
  const visible = usePageVisible();
  const reduced = useReducedMotion();
  const live = onScreen && visible && !reduced;
  // The clip's end moves the story on (ms null): no timer races the video.
  const run = useAutoAdvance(CHAPTERS.length, { ms: null, running: live });
  const c = CHAPTERS[run.index];
  const act = acts?.[c.door];
  const [progress, setProgress] = React.useState(0);

  return (
    <section className="hv-section hv-story" aria-labelledby="hv-story-title" {...reveal}>
      <h2 id="hv-story-title" className="hv-h2">{t('home.storyTitle')}</h2>
      <div className="hv-story-tabs">
        <Tabs label={t('home.storyBar')} panelId="hv-story-panel" value={c.id}
          tabs={CHAPTERS.map((x) => ({ id: x.id, label: t(x.tab) }))}
          onChange={(id) => run.pick(CHAPTERS.findIndex((x) => x.id === id))} />
        {run.live && <span className="hv-advance is-clip" aria-hidden="true" style={{ '--p': progress }} />}
      </div>
      <div id="hv-story-panel" role="tabpanel" ref={panelRef} className={`hv-panel hv-chapter is-${c.ground}`}
        aria-labelledby="hv-chapter-title" onFocusCapture={run.hold}>
        <div key={c.id} className="hv-chapter-text">
          <h3 id="hv-chapter-title" className="hv-h3">{t(c.title)}</h3>
          <p className="hv-chapter-body">{t(c.body)}</p>
          {act && (act.href ? (
            <a className="btn btn-secondary hv-chapter-door" href={act.href} onClick={door(act.go)}>
              <span className="btn-label">{act.label}</span>
              <span className="btn-icon" aria-hidden="true"><ChevronRightIcon size={16} /></span>
            </a>
          ) : (
            <Button variant="secondary" className="hv-chapter-door" onClick={act.go}
              iconEnd={<ChevronRightIcon size={16} />}>
              {act.label}
            </Button>
          ))}
        </div>
        <ClipPhone key={`${c.id}-${lang}`} lang={lang} id={c.id} alt={t(c.alt)} playing={live} reduced={reduced}
          onTime={setProgress} onEnded={() => { setProgress(0); if (!run.held) run.step(); }}
          playLabel={t('home.clipPlay')} />
      </div>
    </section>
  );
}

/** A phone frame holding one chapter's clip. The poster is the clip's first
 *  frame, so the box never shows empty; the clip loads only when its panel
 *  is on screen. Under reduced motion it waits for a play press. */
function ClipPhone({ lang, id, alt, playing, reduced, onTime, onEnded, playLabel }) {
  const ref = React.useRef(null);
  const [asked, setAsked] = React.useState(false);
  const [ended, setEnded] = React.useState(false);
  const go = (playing && !ended) || asked;
  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (go) v.play().catch(() => {}); else v.pause();
  }, [go]);
  return (
    <div className="hv-phone">
      <div className="hv-phone-bezel">
        <video ref={ref} className="hv-phone-screen" muted playsInline preload={go ? 'auto' : 'metadata'}
          width={CLIP_SIZE[0]} height={CLIP_SIZE[1]} poster={clipSrc(lang, id, 'poster')} aria-label={alt}
          onTimeUpdate={(e) => onTime?.(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
          onEnded={() => { setAsked(false); setEnded(true); onEnded?.(); }}>
          <source src={clipSrc(lang, id, 'mp4')} type="video/mp4" />
        </video>
      </div>
      {!go && (reduced || ended) && (
        <IconButton tone="surface" className="hv-phone-play" label={playLabel}
          onClick={() => { const v = ref.current; if (v && ended) v.currentTime = 0; setEnded(false); setAsked(true); }}>
          <svg width="22" height="22" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5Z" fill="currentColor" /></svg>
        </IconButton>
      )}
    </div>
  );
}
