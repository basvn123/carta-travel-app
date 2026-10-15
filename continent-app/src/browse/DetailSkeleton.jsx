import React, {
  Suspense, lazy, useCallback, useEffect, useId, useMemo, useRef, useState,
} from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { Button, IconButton } from '../components/ui/index.js';
import {
  ArrowLeftIcon, ShareIcon, ChevronDownIcon, ChevronRightIcon, CheckIcon, DownloadIcon,
} from '../components/Icons.jsx';
import { scrollBehavior } from '../lib/motion.js';
import { clampIndex, trackIndex, trackKey, trackLeft } from '../lib/dayTrack.js';
import { KeyFacts } from './KeyFacts.jsx';
import { SectionRail } from './SectionRail.jsx';
import { Track } from './Track.jsx';
import { SaveButton } from './ExploreCards.jsx';
import { BeforeYouGo, HighlightCard, AlternativeCard, SourcesLine } from './ItemParts.jsx';
import { capFirst } from '../lib/detailSkeleton.js';

const PointMap = lazy(() => import('./PointMap.jsx'));

/**
 * The shared detail-page skeleton (T180, destinations spec 5.4).
 *
 * One component draws the trail, cycling, beach, lake and mountain pages, so
 * the five read as one family rather than five products. Each page computes
 * its own content and hands it over in named slots; this file owns the shell,
 * the order and the layout, and nothing about any one section.
 *
 * The order is decision first, then hand-off, then depth (T386, design wave
 * V3; carta-design "Detail page grammar"). Top to bottom, which is also the
 * phone's order and the keyboard's:
 *
 *   1  hero          the view image, the three-cell strip flush under it
 *                    (difficulty, type, headline number), the photo credit.
 *                    The strip is solid paper; no text sits on the picture.
 *   2  head          title, ref chip, place, rating (the page's own markup)
 *      hook          one sentence with a verb or a number
 *   3  keyFacts      the key facts band (KeyFacts.jsx): four to six measured
 *                    facts, open, label over value, from keyFactCells
 *   4  Before you go the hazard lines (`alert`), safety first, then who this
 *                    is not for (`notFor`, T159) under one heading, never
 *                    folded. A not-for line that restates a hazard listed
 *                    here is dropped by lib/notFor.js (shownHazards).
 *   5  hand-off      the page's one primary (`primary`: the file on a route
 *                    page, the priced trip to the base on a place page), then
 *                    Getting there (`gettingThere`, a town before any
 *                    coordinate; `false` leaves it out, for the honest stub)
 *                    and Take it with you (`takeAway`, the secondaries) side
 *                    by side from 900 px. The page bar's share icon is the
 *                    one share door; Report a problem sits in the sources.
 *   6  map           sticky in the right-hand column on a desktop, after the
 *                    hand-off on a phone
 *   7  signature     the section's own figure (T181), measured tracks only
 *   8  rows          at most five folded rows (DetailRow below), each an icon,
 *                    a label and a preview that never repeats the hook
 *   9  exits         three computed ways out, then NearbyOutdoors as `nearby`
 *  10  sources       collapsed: sources, licences, the figure split, the
 *                    report and upload doors, inside the shared CreditFold;
 *                    `false` leaves the fold out
 *
 * Desktop is a 60/40 grid: every slot in the left column, the map alone in
 * the right one, sticky. The grid is one DOM order for both widths, so the
 * keyboard walks the page in the order a phone shows it (T190).
 *
 * V4 (T396) added what moves and what is drawn: the sticky section rail
 * above the hero (Facts, Getting there, Map, Details, Nearby), the map's ink
 * sketch while maplibre loads (MapSketch, markMapLive), and the photo track
 * the pages put in their Photographs row (PhotoTrack). The motion rules are
 * in 65-v6-outdoor.css, every one from the tokens with a reduced-motion
 * branch.
 */

/* ── Pieces shared with the journey page ───────────────────────────────── */

/**
 * The three-cell strip (T360, DESIGN.md "Suitability strip"). Cells come from
 * lib/detailSkeleton.js stripCells, or the journey page's own builder.
 */
export function DetailStrip({ cells, label }) {
  const { t } = useI18n();
  return (
    <div className="jstrip" role="group" aria-label={label}>
      {cells.map((c) => (
        <div key={c.key} className="jstrip-cell">
          {c.key === 'diff' && (
            <span
              className="jstrip-squares"
              role={c.level > 0 ? 'img' : undefined}
              aria-label={c.level > 0 ? t('journey.diffMeter', { n: c.level }) : undefined}
              aria-hidden={c.level > 0 ? undefined : true}
            >
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={`jstrip-sq${i <= c.level ? ' is-on' : ''}`} />
              ))}
            </span>
          )}
          <span className={`jstrip-word${c.mono ? ' mono' : ''}`}>{c.word}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * One closed row: icon, label and a six-word summary, the body one tap down.
 * Each row opens on its own. T164 wrote this for Good to know; the class
 * names stay theirs so the journey page and the five detail pages share one
 * set of rules.
 */
export function DetailRow({ id, icon: Icon, label, summary, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`jpage-lrow ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="jpage-lrow-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`${id}-body`}
      >
        {Icon && <Icon size={20} className="jpage-lrow-icon" />}
        <span className="jpage-lrow-label">{label}</span>
        {!open && summary && <span className="jpage-lrow-sum">{summary}</span>}
        <ChevronDownIcon size={13} className="jpage-lrow-chev" />
      </button>
      {/* The body stays in the document while closed, hidden: the button's
          aria-controls always points at something, and a figure inside (a
          profile, a bar) keeps its state between taps. */}
      <div className="jpage-lrow-body" id={`${id}-body`} hidden={!open}>
        {children}
      </div>
    </div>
  );
}

/**
 * Three ways out (T171's list, generalised). Each exit is
 * { key, kindLabel, title, meta, mono, onOpen }. The meta line is mono when
 * it is a row of figures (the journey's days, price and grade) and the sans
 * when it is a sentence (mono = false), the house mono rule.
 */
export function DetailExits({ head, headId, exits, className = '' }) {
  if (!exits?.length) return null;
  return (
    <section className={`jpage-exits ${className}`} aria-labelledby={headId}>
      <h2 id={headId}>{head}</h2>
      <ul>
        {exits.map((e) => (
          <li key={e.key}>
            <button type="button" className="jpage-exit" onClick={e.onOpen}>
              <span className="jpage-exit-kind">{e.kindLabel}</span>
              <span className="jpage-exit-title">{e.title}</span>
              {e.meta && <span className={`jpage-exit-meta${e.mono === false ? '' : ' mono'}`}>{e.meta}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── The page ──────────────────────────────────────────────────────────── */

/**
 * The map while it loads (T396, carta-design "Map and list in sync", rule
 * N8): the item's own line or point drawn in ink from geometry the page
 * already holds, with the place's name, so the box is never blank, on one
 * bar of signal at a trailhead least of all. It sits under the map's canvas;
 * the canvas is transparent until maplibre reports `load` (the map element
 * then carries `is-live`) and crossfades in over --dur-3, which is the
 * 65-v6-outdoor.css rule. If the tiles never come, the drawing stays.
 *
 * `lines` is a list of [lon, lat] runs, `point` a { lat, lon }. Projected
 * with the cosine of the middle latitude, so a north-south walk is not
 * squashed; the stroke does not scale with the box. Decorative to a screen
 * reader, which hears "Loading the map" until the map is live.
 */
const SKETCH_MAX_POINTS = 600;
export function MapSketch({ lines = null, point = null, label = '' }) {
  const { t } = useI18n();
  const geo = useMemo(() => {
    const runs = (Array.isArray(lines) ? lines : [])
      .map((run) => (Array.isArray(run) ? run.filter((p) => Array.isArray(p)
        && Number.isFinite(p[0]) && Number.isFinite(p[1])) : []))
      .filter((run) => run.length > 1);
    const all = runs.flat();
    const pt = point && Number.isFinite(point.lat) && Number.isFinite(point.lon) ? point : null;
    if (!all.length && !pt) return null;
    const lats = all.length ? all.map((p) => p[1]) : [pt.lat];
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const k = Math.cos((midLat * Math.PI) / 180) || 1;
    if (!all.length) return { point: true };
    let w = Infinity; let e = -Infinity; let s = Infinity; let n = -Infinity;
    for (const [x, y] of all) {
      if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
    }
    const spanX = Math.max((e - w) * k, 1e-6);
    const spanY = Math.max(n - s, 1e-6);
    const scale = 100 / Math.max(spanX, spanY);
    const width = spanX * scale;
    const height = spanY * scale;
    const pad = 12;
    const step = Math.max(1, Math.ceil(all.length / SKETCH_MAX_POINTS));
    const paths = runs.map((run) => run
      .filter((_, i) => i % step === 0 || i === run.length - 1)
      .map(([x, y]) => `${((x - w) * k * scale).toFixed(2)},${((n - y) * scale).toFixed(2)}`)
      .join(' '));
    const first = runs[0][0];
    return {
      viewBox: `${-pad} ${-pad} ${(width + 2 * pad).toFixed(2)} ${(height + 2 * pad).toFixed(2)}`,
      paths,
      start: [((first[0] - w) * k * scale), ((n - first[1]) * scale)],
    };
  }, [lines, point]);
  if (!geo) return null;
  return (
    <div className="dsk-sketch">
      <span className="sr-only">{t('detail.mapLoading')}</span>
      <svg
        className="dsk-sketch-svg"
        viewBox={geo.point ? '0 0 100 100' : geo.viewBox}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
      >
        {geo.point ? (
          <>
            <circle cx="50" cy="50" r="9" className="dsk-sketch-ring" vectorEffect="non-scaling-stroke" />
            <circle cx="50" cy="50" r="2.6" className="dsk-sketch-dot" />
          </>
        ) : (
          <>
            {geo.paths.map((d, i) => (
              <polyline key={i} points={d} className="dsk-sketch-line" vectorEffect="non-scaling-stroke" />
            ))}
            <circle cx={geo.start[0]} cy={geo.start[1]} r="2.4" className="dsk-sketch-dot" />
          </>
        )}
      </svg>
      {label && <span className="dsk-sketch-name" aria-hidden="true">{label}</span>}
    </div>
  );
}

/**
 * The photo track (T396, carta-design "Photo track", rule N7): two or more
 * photographs on a detail page as one horizontal row on the day track's
 * mechanics. Previous and Next above it with the position in mono, the row
 * snapping to a frame, arrow keys, Home and End while the row has focus, no
 * autoplay and no looping, no tab roles. Each frame keeps its own credit in
 * a solid band under the photograph, never on it, and the trail's km marker
 * sits in the same band. The index maths is the day track's
 * (lib/dayTrack.js), so the two tracks move the same way.
 *
 * `frames` is [{ key, media, at, credit }]: `media` the image element, `at`
 * an optional mono marker ("at 3.2 km"), `credit` the author and licence.
 */
export function PhotoTrack({ frames, label, testId }) {
  const { t } = useI18n();
  const n = Array.isArray(frames) ? frames.length : 0;
  const trackId = useId();
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const targetRef = useRef(null);
  const frameRef = useRef(0);
  const settleRef = useRef(0);

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el || !el.children.length) return null;
    const first = el.children[0].offsetLeft;
    return { el, offsets: [...el.children].map((c) => c.offsetLeft - first), max: el.scrollWidth - el.clientWidth };
  }, []);
  const select = useCallback((i) => { indexRef.current = i; setIndex(i); }, []);
  const go = useCallback((i) => {
    const m = measure();
    if (!m) return;
    const next = clampIndex(i, m.offsets.length);
    select(next);
    const left = trackLeft(m.offsets, next, m.max);
    if (Math.abs(left - m.el.scrollLeft) < 2) return;
    targetRef.current = left;
    window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => { targetRef.current = null; }, 900);
    m.el.scrollTo({ left, behavior: scrollBehavior() });
  }, [measure, select]);
  const onScroll = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      const m = measure();
      if (!m) return;
      if (targetRef.current != null) {
        if (Math.abs(m.el.scrollLeft - targetRef.current) < 2) targetRef.current = null;
        return;
      }
      const i = trackIndex(m.offsets, m.el.scrollLeft, m.max, indexRef.current);
      if (i !== indexRef.current) select(i);
    });
  }, [measure, select]);
  useEffect(() => () => {
    window.clearTimeout(settleRef.current);
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
  }, []);
  const onKeyDown = (e) => {
    if (e.target !== trackRef.current || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const next = trackKey(e.key, indexRef.current, n);
    if (next == null) return;
    e.preventDefault();
    go(next);
  };

  if (n < 1) return null;
  return (
    <div className="dsk-ptrack-wrap" data-testid={testId}>
      {n > 1 && (
        <div className="dsk-ptrack-bar">
          <span className="dsk-ptrack-pos mono" aria-live="polite">
            {t('detail.photoPos', { n: index + 1, total: n })}
          </span>
          <Button className="dsk-ptrack-btn" onClick={() => go(indexRef.current - 1)} disabled={index === 0} aria-controls={trackId}>
            <ChevronRightIcon size={14} className="dsk-ptrack-prev" />
            <span>{t('detail.trackPrev')}</span>
          </Button>
          <Button className="dsk-ptrack-btn" onClick={() => go(indexRef.current + 1)} disabled={index >= n - 1} aria-controls={trackId}>
            <span>{t('detail.trackNext')}</span>
            <ChevronRightIcon size={14} />
          </Button>
        </div>
      )}
      <div
        id={trackId}
        ref={trackRef}
        className="dsk-ptrack"
        role="region"
        aria-label={label || t('detail.photosAria')}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
      >
        {frames.map((f) => (
          <figure key={f.key} className="dsk-ptrack-frame">
            <div className="dsk-ptrack-media">{f.media}</div>
            {(f.at || f.credit) && (
              <figcaption className="dsk-ptrack-cap">
                {f.at && <span className="dsk-ptrack-at mono">{f.at}</span>}
                {f.credit && <div className="dsk-ptrack-credit">{f.credit}</div>}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </div>
  );
}

/**
 * The map slot for a place with a point and no line. Lazy; while maplibre
 * and the tiles arrive the box shows the point in ink (MapSketch).
 */
export function PlaceMap({ lat, lon, label, name = '', relief = false, zoom }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const sketch = <MapSketch point={{ lat, lon }} label={name} />;
  return (
    <Suspense fallback={<div className="dsk-map-frame dsk-map-wait">{sketch}</div>}>
      <PointMap lat={lat} lon={lon} label={label} relief={relief} zoom={zoom}>{sketch}</PointMap>
    </Suspense>
  );
}

export function DetailPage({
  name,
  className = '',
  testId,
  backLabel,
  onClose,
  onEscape,
  fav = false,
  onFav = null,
  onShare = null,
  shareLabel,
  copied = false,
  barTitleOn = false,
  resetKey,
  toast = null,
  gallery = null,
  head = null,
  hook = null,
  keyFacts = null,
  keyFactsLead = null,
  keyFactsFoot = null,
  whyGo = [],
  whyGoTitle = null,
  before = [],
  map = null,
  signature = null,
  primary = null,
  actions = [],
  costLine = null,
  onPdf = null,
  pdfBusy = false,
  pdf = null,
  gettingThere = null,
  rows = [],
  alternatives: altsIn = [],
  exits = [],
  nearby = null,
  sources = [],
  sourcesExtra = null,
}) {
  const { t } = useI18n();
  const pageRef = useRef(null);
  const backRef = useRef(null);
  const scrollEl = useRef(null);
  const headEl = useRef(null);
  const galleryEl = useRef(null);
  const [titleGone, setTitleGone] = useState(false);

  // The rail's sections, in page order (T396, T430). SectionRail drops any
  // the page did not render; `railReady` makes it look again when they come.
  const railItems = useMemo(() => [
    { id: 'dsk-sec-facts', key: 'facts', label: t('detail.railFacts') },
    { id: 'dsk-sec-map', key: 'map', label: t('detail.railMap') },
    { id: 'dsk-sec-getting', key: 'getting', label: t('detail.gettingThere') },
    { id: 'dsk-sec-details', key: 'details', label: t('detail.railDetails') },
    { id: 'dsk-sec-nearby', key: 'nearby', label: t('item.railMore') },
  ], [t]);
  const railReady = [resetKey, Boolean(keyFacts?.length || keyFactsLead), Boolean(gettingThere),
    Boolean(map), rows.length, altsIn.length + exits.length, Boolean(nearby)].join('|');

  // Focus management for the dialog: initial focus, a Tab cycle and focus
  // restoration (hooks/useFocusTrap.js). A page with a mode of its own (the
  // trail page's live follow) passes onEscape to leave the mode first.
  useFocusTrap(pageRef, onEscape || onClose, { initialFocusRef: backRef });

  useEffect(() => { scrollEl.current?.scrollTo?.(0, 0); }, [resetKey]);

  // The bar takes over the name only once the heading has scrolled away.
  useEffect(() => {
    const el = headEl.current;
    const root = scrollEl.current;
    if (!el || !root) return undefined;
    const io = new IntersectionObserver(([entry]) => setTitleGone(!entry.isIntersecting),
      { root, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [resetKey]);

  // The computed ways out (usePlaceExits) as photo cards, after any the
  // page built itself.
  const alternatives = [
    ...altsIn,
    ...exits.map((e) => ({
      key: e.key, kind: e.kindLabel, title: e.title, photoUrl: e.photoUrl || null,
      fact: e.meta, rating: e.rating || null, iso2: e.iso2 || null, onOpen: e.onOpen,
    })),
  ];
  const secondaries = [...(Array.isArray(actions) ? actions : [actions]).filter(Boolean)];
  // The PDF prints what this page shows (T430): the name, the hook, the
  // fact band, the reasons, the before-you-go rows, plus what the page adds
  // through `pdf` (its photographs, where it is, its line and its climb).
  const pdfModel = () => ({
    name,
    hook: typeof hook === 'string' ? hook : null,
    facts: (keyFacts || []).map((c) => ({ label: c.label, value: c.value })),
    why: whyGo.map((h) => ({ title: h.title || '', line: h.line || '' })),
    before: (before || []).map((it) => {
      const p = { ...it.params };
      if (p.word) p.word = capFirst(p.word);
      return { title: t(it.titleKey, p), line: t(it.subKey, p), safety: Boolean(it.safety) };
    }),
    sources: (Array.isArray(sources) ? sources : []).filter((x) => x && x.label),
    ...(pdf || {}),
  });
  if (onPdf) {
    secondaries.push(
      <Button key="pdf" variant="secondary" className="ipage-pdf" onClick={() => onPdf(pdfModel())} loading={pdfBusy}
        iconStart={<DownloadIcon size={20} />}>
        {t('item.pdf')}
      </Button>,
    );
  }
  // A side column only where there is a map: a page with a figure and no
  // map (the stub) keeps one column.
  const hasSide = Boolean(map);

  return (
    <div
      className={`tpage dsk-page ipage ${className}`}
      role="dialog"
      aria-modal="true"
      aria-label={name}
      ref={pageRef}
      data-testid={testId}
    >
      <div className="tpage-bar ipage-bar">
        <Button variant="quiet" className="tpage-back ipage-back" onClick={onClose} ref={backRef}
          iconStart={<ArrowLeftIcon size={20} />}>
          {backLabel}
        </Button>
        <span className={`tpage-bar-title ipage-bar-title ${titleGone || barTitleOn ? 'on' : ''}`}>{name}</span>
        <div className="ipage-bar-acts">
          {onFav && <SaveButton fav={fav} onToggle={onFav} t={t} name={name} />}
          {onShare && (
            <IconButton className="tpage-bar-act" onClick={onShare}
              label={copied ? t('dest.linkCopied') : (shareLabel || t('trails.shareLink'))}>
              {copied ? <CheckIcon size={18} /> : <ShareIcon size={18} />}
            </IconButton>
          )}
        </div>
      </div>

      <div className="tpage-scroll" ref={scrollEl}>
        <SectionRail
          items={railItems}
          scrollRef={scrollEl}
          heroRef={gallery ? galleryEl : headEl}
          ready={railReady}
          ariaLabel={t('detail.railAria')}
        />
        <div className="dsk ipage-wrap">
          {gallery && (
            <div className="ipage-gallery" data-slot="hero" ref={galleryEl}>
              {gallery}
            </div>
          )}

          <div className={`dsk-grid ipage-grid${hasSide ? ' has-side' : ''}`}>
            <header className="dsk-head ipage-head" data-slot="head" ref={headEl}>
              {head}
              {hook && <p className="dsk-hook ipage-hook" data-slot="hook">{hook}</p>}
            </header>

            <KeyFacts cells={keyFacts} lead={keyFactsLead} foot={keyFactsFoot} />

            {whyGo.length > 0 && (
              <section className="ipage-why" data-slot="why" aria-labelledby="ipage-why-h">
                {/* With photographs (a walk's sights, a trip's days) the
                    reasons are a photo track; a place whose photographs are
                    already the gallery gets them as a short list, so the same
                    picture never shows twice. */}
                {whyGo.some((h) => h.photo) ? (
                  <Track title={whyGoTitle || t('item.whyGo')} headingId="ipage-why-h" size="third">
                    {whyGo.map((h) => (
                      <HighlightCard key={h.key} photo={h.photo} title={h.title} line={h.line} meta={h.meta} />
                    ))}
                  </Track>
                ) : (
                  <>
                    <h2 id="ipage-why-h">{whyGoTitle || t('item.whyGo')}</h2>
                    <ul className="iwhy">
                      {whyGo.map((h) => (
                        <li key={h.key} className="iwhy-row">
                          {h.title && <span className="iwhy-t">{h.title}</span>}
                          <span className="iwhy-s">{h.line}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}

            {hasSide ? (
              <div className="ipage-side" data-slot="side">
                <div className="dsk-map" id="dsk-sec-map" data-slot="map">{map}</div>
                {signature && <section className="dsk-signature" data-slot="signature">{signature}</section>}
              </div>
            ) : signature && <section className="dsk-signature" data-slot="signature">{signature}</section>}

            <BeforeYouGo items={before} headingId="ipage-before-h" />

            {(primary || secondaries.length > 0 || costLine) && (
              <div className="dsk-handoff ipage-handoff" data-slot="handoff">
                {primary && <div className="dsk-primary-row">{primary}</div>}
                {costLine && <p className="ipage-cost">{costLine}</p>}
                {secondaries.length > 0 && <div className="dsk-acts ipage-acts">{secondaries}</div>}
              </div>
            )}

            {gettingThere && (
              <section className="dsk-sec dsk-getting" id="dsk-sec-getting" data-slot="getting-there" aria-labelledby="dsk-getting-h">
                <h2 id="dsk-getting-h">{t('detail.gettingThere')}</h2>
                {gettingThere}
              </section>
            )}

            {rows.length > 0 && (
              <div className="dsk-rows jpage-lrows" id="dsk-sec-details" data-slot="rows">
                {rows.slice(0, 3).map((r) => (
                  <DetailRow key={r.key} id={`dsk-${r.key}`} icon={r.icon} label={r.label} summary={r.summary}>
                    {r.body}
                  </DetailRow>
                ))}
              </div>
            )}

            {(alternatives.length > 0 || nearby) && (
              <div className="dsk-exits ipage-more" id="dsk-sec-nearby" data-slot="exits">
                {alternatives.length > 0 && (
                  <section className="ipage-alts" aria-labelledby="ipage-alts-h">
                    <Track title={t('item.notQuite')} headingId="ipage-alts-h" size="third">
                      {alternatives.map((a) => <AlternativeCard key={a.key} {...a} />)}
                    </Track>
                  </section>
                )}
                {nearby}
              </div>
            )}

            <SourcesLine items={Array.isArray(sources) ? sources : []}>{sourcesExtra}</SourcesLine>
          </div>
        </div>
      </div>

      {toast && <p className="tpage-toast" role="status">{toast}</p>}
    </div>
  );
}
