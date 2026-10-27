import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { tabHref } from '../../lib/urlState.js';
import { loadJourneyIndex, loadJourneyType, loadJourney, splitAround } from '../../lib/journeys.js';
import { cardPerDay } from '../../lib/tripFilters.js';
import { WEEK } from '../../lib/tripLength.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { Button, IconButton } from '../../components/ui/index.js';
import { ArrowRightIcon, CalendarIcon, ChevronRightIcon, PauseIcon, PlayIcon, ReplayIcon, RouteIcon } from '../../components/Icons.jsx';

/** A plain click stays in the app; a modified click opens the address. */
function door(go) {
  return (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go();
  };
}

// The styles to look in first, by month: what a week in Europe is for then.
// The first with a week in season gives the day that plays; the tail fills a
// thin month.
const SEASON = {
  1: ['winter-sports', 'city', 'culinary'], 2: ['winter-sports', 'city', 'culinary'],
  3: ['city', 'winter-sports', 'cozy-towns'], 4: ['hiking', 'city', 'cycling'],
  5: ['hiking', 'cycling', 'water-sports'], 6: ['hiking', 'water-sports', 'city'],
  7: ['water-sports', 'hiking', 'city'], 8: ['water-sports', 'hiking', 'city'],
  9: ['hiking', 'cycling', 'city'], 10: ['hiking', 'city', 'cycling'],
  11: ['city', 'culinary', 'cozy-towns'], 12: ['winter-sports', 'city', 'culinary'],
};
const FALLBACK = ['city', 'cozy-towns', 'culinary', 'cycling', 'hiking', 'nature-escape'];

// The photograph covers a column taller than itself, so it is asked for at
// the width its height needs.
const SIZES = '(max-width: 768px) 150vw, 60vw';

// How long one part of the day stays before the next, while it plays.
const STEP_MS = 3600;

const cheapest = (rows) => rows.reduce((a, b) => (a && cardPerDay(a, WEEK) <= cardPerDay(b, WEEK) ? a : b), null);

/**
 * The week whose day plays: the month's first style that has a week in
 * season with a photograph, its cheapest a person a day, then that week in
 * full. Styles are read one at a time and only until one answers, so the
 * page fetches the index, usually one style file and one week. Resolves
 * null on a failure, so the page stands without it.
 */
async function loadWeek(month) {
  try {
    const ix = await loadJourneyIndex();
    if (!ix) return null;
    const known = new Set(ix.types.map((tp) => tp.slug));
    for (const slug of [...new Set([...(SEASON[month] || []), ...FALLBACK])].filter((x) => known.has(x))) {
      const rows = (await loadJourneyType(slug).catch(() => null)) || [];
      const week = cheapest(rows.filter((r) => r.hero?.url && Number.isFinite(cardPerDay(r, WEEK))
        && (r.months || []).includes(month)));
      if (!week) continue;
      const journey = await loadJourney(week.id).catch(() => null);
      if (journey) return { slug, week, journey };
    }
    return null;
  } catch {
    return null;
  }
}

/** The first sentence of a written slot, without the library's bold marks. */
function firstSentence(text) {
  const plain = String(text || '').replace(/\*\*/g, '').trim();
  const m = plain.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : plain).trim();
}

/** One day of a written week, as the four parts the player steps through. */
function dayParts(journey, t) {
  const days = journey?.itinerary || [];
  const day = days[Math.min(2, days.length - 1)];
  if (!day) return null;
  const parts = [
    ['morning', t('day.phaseMorning'), firstSentence(day.morning)],
    ['afternoon', t('day.phaseAfternoon'), firstSentence(day.afternoon)],
    ['evening', t('day.phaseEvening'), firstSentence(day.evening)],
    ['sleep', t('dest.nav.sleep'), String(day.sleep || '').replace(/\*\*/g, '').trim()],
  ].filter(([, , text]) => text);
  return parts.length >= 2 ? { n: day.day, total: days.length, title: day.title, parts } : null;
}

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Play a day (T746): one day of a planned week, morning to bed, stepped
 * through once on its own when the page opens and again on Play. Each part's
 * bar fills while it shows. Under reduced motion it waits for Play and the
 * bars do not run. Its link opens the planned trips of the week's style.
 */
function DayPlayer({ slug, journey, onOpenStyle }) {
  const { t } = useI18n();
  const day = useMemo(() => dayParts(journey, t), [journey, t]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!day || started.current || reduceMotion()) return;
    started.current = true;
    setPlaying(true);
  }, [day]);

  useEffect(() => {
    if (!playing || !day) return undefined;
    const id = window.setTimeout(() => {
      if (step + 1 < day.parts.length) setStep(step + 1);
      else setPlaying(false);
    }, STEP_MS);
    return () => window.clearTimeout(id);
  }, [playing, step, day]);

  if (!day) return <div className="pf-day is-wait" aria-hidden="true" />;
  const last = step === day.parts.length - 1;
  const done = last && !playing;
  const [key, label, text] = day.parts[step];

  const press = () => {
    if (playing) { setPlaying(false); return; }
    if (done) setStep(0);
    setPlaying(true);
  };

  return (
    <section className={`pf-day${playing ? ' is-playing' : ''}`} aria-label={t('pf.day.label')}>
      <div className="pf-day-head">
        <div className="pf-day-meta">
          <span className="pf-day-over">{t('pf.day.over', { n: day.n, total: day.total })}</span>
          <span className="pf-day-title">{day.title}</span>
        </div>
        <IconButton tone="surface" className="pf-day-play" onClick={press}
          label={playing ? t('pf.day.pause') : done ? t('pf.day.replay') : t('pf.day.play')}>
          {playing ? <PauseIcon size={16} /> : done ? <ReplayIcon size={18} /> : <PlayIcon size={16} />}
        </IconButton>
      </div>
      <div className="pf-day-bars" aria-hidden="true">
        {day.parts.map(([k], i) => (
          <span key={k} className={`pf-day-bar${i < step ? ' is-done' : ''}${i === step ? ' is-now' : ''}`}>
            <span className="pf-day-fill" style={{ '--step-ms': `${STEP_MS}ms` }} />
          </span>
        ))}
      </div>
      <div className="pf-day-now" key={key} aria-live="polite">
        <span className="pf-day-when">{label}</span>
        <span className="pf-day-text">{text}</span>
      </div>
      <a className="pf-day-week" href={tabHref('places')} onClick={door(() => onOpenStyle(slug))}>
        <span>{t('pf.day.more')}</span>
        <ArrowRightIcon size={14} />
      </a>
    </section>
  );
}

/**
 * PlanHome (T743 to T746), the Plan place with nothing open: one screen, no
 * scroll. The headline and the two actions that matter, Start planning and
 * Planned trips; under them (from 1024 px: beside them) one photograph of a
 * planned week in season with a day of it playing on a white card.
 *
 *   onStart()            the trip-kind sheet
 *   onContinue()         the trip in progress, in the trip planner
 *   onOpenStyle(slug)    the planned trips (null: every style)
 */
export function PlanHome({ titleTag = 'h1', hasTrip, tripName, onStart, onContinue, onOpenStyle }) {
  const { t } = useI18n();
  const Title = titleTag;
  const [pick, setPick] = useState(undefined);

  useEffect(() => {
    let live = true;
    loadWeek(new Date().getMonth() + 1).then((v) => { if (live) setPick(v); });
    return () => { live = false; };
  }, []);

  const accent = t('pf.home.titleAccent');
  const [lead, , tail] = splitAround(t, 'pf.home.title', { accent }, 'accent');

  return (
    <div className={`pf-open${pick === null ? ' is-bare' : ''}`}>
      <div className="pf-open-text">
        <Title className="pf-title pf-open-title" tabIndex={-1}>
          {lead}<span className="pf-open-accent">{accent}</span>{tail}
        </Title>
        <div className="pf-open-actions">
          <Button variant="primary" className="pf-open-start" iconEnd={<ArrowRightIcon size={20} />} onClick={onStart}>
            {t('pf.home.start')}
          </Button>
          <Button variant="secondary" className="pf-open-browse" iconStart={<CalendarIcon size={20} />}
            onClick={() => onOpenStyle(null)}>
            {t('pf.home.browse')}
          </Button>
        </div>
        {hasTrip && (
          <a className="pf-open-resume" href={tabHref('trip')} onClick={door(onContinue)}>
            <span className="pf-open-resume-icon" aria-hidden="true"><RouteIcon size={18} /></span>
            <span className="pf-open-resume-text">
              <span className="pf-open-resume-label">{t('pf.home.continuePlan')}</span>
              <span className="pf-open-resume-name">{tripName || t('pf.home.yourTrip')}</span>
            </span>
            <ChevronRightIcon size={18} />
          </a>
        )}
      </div>

      {pick !== null && (
        <div className="pf-open-stage" aria-busy={pick === undefined || undefined}>
          {pick && (
            <HeroImage url={pick.week.hero.url} city={pick.week.title} iso2={pick.week.cc} className="pf-open-img"
              maxWidth={1920} sizes={SIZES} ratio={[4, 3]} eager />
          )}
          {pick
            ? <DayPlayer slug={pick.slug} journey={pick.journey} onOpenStyle={onOpenStyle} />
            : <div className="pf-day is-wait" aria-hidden="true" />}
        </div>
      )}
    </div>
  );
}
