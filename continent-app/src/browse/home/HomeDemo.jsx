import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, IconButton, Money, Tabs } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { ScoreChip } from '../../components/RatingBadge.jsx';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import {
  ChevronRightIcon, DownloadIcon, FriendsIcon, LinkIcon, PlusIcon, SearchIcon, SunIcon,
} from '../../components/Icons.jsx';
import { countryName } from '../../lib/countryName.js';
import { activeLocale } from '../../lib/localeState.js';
import { formatEst, formatMoney } from '../../lib/money.js';
import { prefersReducedMotion } from '../../lib/motion.js';
import { SCENES, isEstimate } from '../../lib/homeDemo.js';
import { useDemoClock, useIdle } from './useDemoClock.js';

/**
 * The home page's live demo (T462, owner decision 2026-10-17): the product
 * telling its own story in four scenes, built from the app's real parts and
 * the catalogue's real figures, never a recording and never a mock-up.
 *
 *   Search  a question typed word by word, three towns answering it
 *   Place   the first town as Explore's tile shows it: photo, Score, the
 *           day price, its best months, "Add to trip"
 *   Trip    three towns joined on a drawn route, priced line by line in
 *           cents, the lines adding up to the total
 *   Share   one link copied, friends invited, the PDF
 *
 * It is the one surface allowed to move on its own (DESIGN.md "Home page
 * exception"): it loops, and it stops off screen, in a hidden tab, under a
 * page, while the pointer or focus is inside it, when the visitor presses
 * pause or picks a scene (WAI-ARIA carousel), and always under reduced
 * motion, where it shows the Trip scene's finished frame. The pictures are
 * hidden from assistive tech, which reads one sentence with the same
 * figures instead.
 *
 * Props
 *   demo      buildDemo() output, state 'story' or 'fallback'
 *   pageOver  a page or panel stands over the home page
 */

const DURATIONS = SCENES.map((s) => s.ms);
const SCENE_LABEL = {
  search: 'home.sceneSearch', place: 'home.scenePlace', trip: 'home.sceneTrip', share: 'home.sceneShare',
};
const STILL_FRAME = SCENES.findIndex((s) => s.id === 'trip');

function useReducedMotion() {
  const [reduced, setReduced] = React.useState(() => prefersReducedMotion());
  React.useEffect(() => {
    let mq;
    try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch { return undefined; }
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/** True while at least `ratio` of the element is on screen. */
function useOnScreen(ref, ratio = 0.35) {
  const [on, setOn] = React.useState(true);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => setOn(e.intersectionRatio >= ratio), { threshold: [0, ratio, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, ratio]);
  return on;
}

function usePageVisible() {
  const [visible, setVisible] = React.useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  React.useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

const listOf = (items) => {
  try { return new Intl.ListFormat(activeLocale(), { type: 'conjunction' }).format(items); } catch { return items.join(', '); }
};

/** "Jun, Jul, Aug and Sep" in the reader's language. */
function monthList(months) {
  if (!months?.length) return '';
  let fmt;
  try { fmt = new Intl.DateTimeFormat(activeLocale(), { month: 'short', timeZone: 'UTC' }); } catch { return ''; }
  return listOf(months.map((m) => fmt.format(new Date(Date.UTC(2026, m - 1, 15)))));
}

function PauseGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M9 6v12M15 6v12" />
    </svg>
  );
}
function PlayGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />
    </svg>
  );
}

function DayFigure({ cost, t }) {
  return (
    <span className="home-dayfig">
      <Money value={cost.dayEur} est={isEstimate(cost)} />
      <span className="home-dayfig-unit"> {t('cost.perDay')}</span>
    </span>
  );
}

function SearchScene({ demo, query, t }) {
  const words = query.split(' ');
  return (
    <div className="home-sc home-sc-search">
      <div className="home-field">
        <SearchIcon size={18} />
        <span className="home-query">
          {words.map((w, i) => (
            <span key={i} className="home-word" style={{ '--i': i }}>{w}{i < words.length - 1 ? ' ' : ''}</span>
          ))}
        </span>
      </div>
      <ul className="home-results">
        {demo.results.map((r, i) => (
          <li key={r.id} className={`home-result${i === 0 ? ' is-picked' : ''}`} style={{ '--i': i }}>
            <HeroImage url={r.image} city={r.city} iso2={r.iso2} className="home-result-img"
              maxWidth={250} sizes="64px" ratio={[1, 1]} />
            <span className="home-result-text">
              <span className="home-result-name">{r.city}</span>
              <span className="home-result-meta">
                <CountryFlag country={r.iso2} size={12} />
                {countryName(r.iso2, r.country)}
              </span>
            </span>
            <span className="home-result-figs">
              <DayFigure cost={r.cost} t={t} />
              <ScoreChip rating={r.rating} size="sm" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlaceScene({ demo, t, warm }) {
  const p = demo.place;
  const months = monthList(p.best);
  return (
    <div className="home-sc home-sc-place">
      <div className="home-place">
        {/* The photo loads once the page is idle (the catalogue comes first),
            and stays smaller than the headline, so the scene arriving later
            never becomes the page's largest paint. */}
        <div className="home-place-photo">
          {warm && (
            <HeroImage url={p.image} city={p.city} iso2={p.iso2} className="home-place-img"
              maxWidth={500} sizes="(max-width: 768px) 40vw, 240px" ratio={[4, 3]} />
          )}
        </div>
        <div className="home-place-body">
          <div className="home-place-head">
            <span className="home-place-name">{p.city}</span>
            <ScoreChip rating={p.rating} size="sm" />
          </div>
          <span className="home-place-price"><DayFigure cost={p.cost} t={t} /></span>
          <span className="home-place-meta">
            <CountryFlag country={p.iso2} size={13} />
            {countryName(p.iso2, p.country)}
          </span>
          {months && (
            <span className="home-place-best"><SunIcon size={16} />{t('home.best', { months })}</span>
          )}
          <span className="btn btn-secondary btn-sm home-add" aria-hidden="true">
            <span className="btn-icon"><PlusIcon size={16} /></span>
            <span className="btn-label">{t('home.addToTrip')}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function TripScene({ demo, t }) {
  const { trip, route } = demo;
  return (
    <div className="home-sc home-sc-trip">
      <svg className="home-route" viewBox="0 0 320 150" role="presentation">
        {route.legs.map((l, i) => (
          <path key={i} className="home-leg" style={{ '--i': i }} pathLength="1"
            d={`M${l.from.x} ${l.from.y} Q${l.ctrl.x} ${l.ctrl.y} ${l.to.x} ${l.to.y}`} />
        ))}
        {route.points.map((pt, i) => (
          <g key={trip.stops[i].id} className="home-stop" style={{ '--i': i }}>
            <circle cx={pt.x} cy={pt.y} r="11" />
            <text className="home-stop-n" x={pt.x} y={pt.y} dy="0.35em" textAnchor="middle">{i + 1}</text>
            <text className="home-stop-name" x={route.labels[i].x} y={route.labels[i].y}
              textAnchor={route.labels[i].anchor}>{trip.stops[i].city}</text>
          </g>
        ))}
      </svg>
      <div className="home-receipt">
        <span className="home-receipt-head">{t('home.tripHead')}</span>
        <ul className="home-lines">
          {trip.lines.map((l, i) => (
            <li key={l.id} className="home-line" style={{ '--i': i }}>
              <span className="home-line-name">
                {l.city}
                <span className="home-line-nights">
                  {l.nights === 1 ? t('receipt.oneNight') : t('receipt.nNights', { n: l.nights })}
                </span>
              </span>
              <Money value={l.cents / 100} precision="cents" est={l.est} />
            </li>
          ))}
        </ul>
        <div className="home-sum">
          <span>{t('home.tripSum')}</span>
          <Money value={trip.totalCents / 100} precision="cents" est={trip.est} />
        </div>
      </div>
    </div>
  );
}

function ShareScene({ demo, t }) {
  const cities = listOf(demo.trip.stops.map((s) => s.city));
  return (
    <div className="home-sc home-sc-share">
      <div className="home-share">
        <span className="home-share-head">{t('home.shareHead')}</span>
        <span className="home-share-trip">{cities}</span>
        <div className="home-share-link">
          <span className="home-share-url"><LinkIcon size={16} />carta-europetravel.com/#trip=</span>
          <span className="home-copy">
            <span className="home-copy-a">{t('home.copyLink')}</span>
            <span className="home-copy-b"><span className="home-dot" />{t('home.copied')}</span>
          </span>
        </div>
        <ul className="home-share-rows">
          <li className="home-share-row" style={{ '--i': 0 }}>
            <FriendsIcon size={20} /><span>{t('home.invite')}</span>
          </li>
          <li className="home-share-row" style={{ '--i': 1 }}>
            <DownloadIcon size={20} /><span>{t('home.pdf')}</span>
            <span className="home-pass">{t('pass.tripName')}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

export function HomeDemo({ demo, pageOver = false, acts = null, door = null }) {
  const { t } = useI18n();
  const stageRef = React.useRef(null);
  const reduced = useReducedMotion();
  const onScreen = useOnScreen(stageRef);
  const pageVisible = usePageVisible();
  // Two kinds of stop. The pause button, the page leaving the screen, a
  // hidden tab or a page over the home page FREEZE the motion where it is.
  // Pointer or focus inside the stage, or a scene picked from the tabs, only
  // stop the turning to the next scene, so the scene in view still finishes
  // drawing itself (WAI-ARIA carousel: picking a slide stops the rotation).
  const [userPaused, setUserPaused] = React.useState(false);
  const [picked, setPicked] = React.useState(false);
  const [hovering, setHovering] = React.useState(false);
  const [focusIn, setFocusIn] = React.useState(false);
  // After Play the pointer is still over the control (and its glyph swaps
  // under it): hold hover off until the pointer has left the demo once.
  const [hoverHold, setHoverHold] = React.useState(false);
  const frozen = reduced || userPaused || !onScreen || !pageVisible || pageOver;
  const turning = !frozen && !picked && !hovering && !focusIn;
  const stopped = userPaused || picked;
  const { index, go } = useDemoClock(DURATIONS, turning);
  const warm = useIdle();

  // Reduced motion holds the finished trip, the frame that says the most.
  const startedStill = React.useRef(false);
  React.useEffect(() => {
    if (reduced && !startedStill.current) { startedStill.current = true; go(STILL_FRAME); }
  }, [reduced, go]);

  const scene = SCENES[index].id;
  const query = demo.query.key === 'home.queryCountry'
    ? t('home.queryCountry', { country: countryName(demo.query.country, demo.query.countryName) })
    : t(demo.query.key);
  const summary = t('home.demoSummary', {
    query,
    city: demo.place.city,
    price: isEstimate(demo.place.cost)
      ? formatEst(demo.place.cost.dayEur, t('money.est'))
      : formatMoney(demo.place.cost.dayEur),
    stops: listOf(demo.trip.stops.map((s) => s.city)),
    total: demo.trip.est
      ? formatEst(demo.trip.totalCents / 100, t('money.est'), { precision: 'cents' })
      : formatMoney(demo.trip.totalCents / 100, { precision: 'cents' }),
  });

  const tabs = SCENES.map((s) => ({ id: s.id, label: t(SCENE_LABEL[s.id]) }));
  // One real door under the scene on show (the critique of T462: a demo
  // drawn as controls must lead somewhere).
  const act = acts?.[scene] || null;

  return (
    <section
      className="home-demo"
      aria-roledescription="carousel"
      aria-label={t('home.demoLabel')}
      data-paused={frozen ? 'true' : 'false'}
      data-turning={turning ? 'true' : 'false'}
      data-reduced={reduced ? 'true' : 'false'}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse' && !hoverHold) setHovering(true); }}
      onPointerLeave={() => { setHovering(false); setHoverHold(false); }}
      onFocus={() => setFocusIn(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocusIn(false); }}
    >
      <div className="home-demo-bar">
        {!reduced && (
          <IconButton
            className="home-demo-pause"
            label={stopped ? t('home.play') : t('home.pause')}
            onClick={() => {
              // Play is an explicit ask: the pointer and the focus that pressed
              // it stay on the control, and must not hold the demo still.
              if (stopped) {
                setUserPaused(false); setPicked(false); setHovering(false); setHoverHold(true); setFocusIn(false);
              } else setUserPaused(true);
            }}
          >
            {stopped ? <PlayGlyph /> : <PauseGlyph />}
          </IconButton>
        )}
        <Tabs
          label={t('home.demoLabel')}
          tabs={tabs}
          value={scene}
          panelId="home-demo-stage"
          className="home-demo-tabs"
          onChange={(id) => {
            go(SCENES.findIndex((s) => s.id === id));
            setPicked(true);
          }}
        />
      </div>
      <div
        id="home-demo-stage"
        ref={stageRef}
        className="home-stage"
        role="tabpanel"
        aria-roledescription="slide"
        aria-label={t(SCENE_LABEL[scene])}
      >
        <p className="sr-only">{summary}</p>
        <div className="home-scenes" aria-hidden="true">
          {SCENES.map((s, i) => (
            <div key={s.id} className={`home-scene${i === index ? ' is-on' : ''}`} data-scene={s.id}>
              {s.id === 'search' && <SearchScene demo={demo} query={query} t={t} />}
              {s.id === 'place' && <PlaceScene demo={demo} t={t} warm={warm} />}
              {s.id === 'trip' && <TripScene demo={demo} t={t} />}
              {s.id === 'share' && <ShareScene demo={demo} t={t} />}
            </div>
          ))}
        </div>
      </div>
      {act && (
        <div className="home-demo-foot">
          {act.href ? (
            <a className="btn btn-quiet btn-sm home-demo-act" href={act.href} onClick={door ? door(act.go) : undefined}>
              <span className="btn-label">{act.label}</span>
              <span className="btn-icon" aria-hidden="true"><ChevronRightIcon size={16} /></span>
            </a>
          ) : (
            <Button variant="quiet" size="sm" className="home-demo-act" onClick={act.go}
              iconEnd={<ChevronRightIcon size={16} />}>
              {act.label}
            </Button>
          )}
        </div>
      )}
      {/* The scene's time, along the panel's foot: away from the tab
          underline, so two brown lines never read as two selections. */}
      <div className="home-demo-progress" aria-hidden="true">
        {!reduced && (
          <span key={`${index}`} className="home-demo-progress-fill"
            style={{ '--home-scene-ms': `${DURATIONS[index]}ms` }} />
        )}
      </div>
    </section>
  );
}
