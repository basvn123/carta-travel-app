import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { FavStar } from '../components/FavStar.jsx';
import { ArrowLeftIcon, ShareIcon, ChevronDownIcon } from '../components/Icons.jsx';
import { claimShared } from '../lib/sharedElement.js';
import CreditFold from './CreditFold.jsx';
import { KeyFacts } from './KeyFacts.jsx';

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
 * The map slot for a place with a point and no line. Lazy, with a
 * paper-dim box at the final size while maplibre arrives.
 */
export function PlaceMap({ lat, lon, label }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return (
    <Suspense fallback={<div className="dsk-map-frame dsk-map-wait" aria-hidden="true" />}>
      <PointMap lat={lat} lon={lon} label={label} />
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
  barTitleOn = false,
  resetKey,
  toast = null,
  hero = null,
  head = null,
  hook = null,
  keyFacts = null,
  keyFactsLead = null,
  notFor = null,
  alert = null,
  primary = null,
  map = null,
  signature = null,
  rows = [],
  gettingThere = null,
  takeAway = null,
  exits = [],
  nearby = null,
  sources = null,
  licenceKeys = [],
}) {
  const { t } = useI18n();
  const pageRef = useRef(null);
  const backRef = useRef(null);
  const scrollEl = useRef(null);
  const headEl = useRef(null);
  const heroEl = useRef(null);
  const [titleGone, setTitleGone] = useState(false);

  // Focus management for the dialog: initial focus, a Tab cycle and focus
  // restoration (hooks/useFocusTrap.js). A page with a mode of its own (the
  // trail page's live follow) passes onEscape to leave the mode first.
  useFocusTrap(pageRef, onEscape || onClose, { initialFocusRef: backRef });

  useEffect(() => { scrollEl.current?.scrollTo?.(0, 0); }, [resetKey]);

  // The bar takes over the name only once the heading has scrolled away, so
  // the two never sit on screen saying the same thing.
  useEffect(() => {
    const el = headEl.current;
    const root = scrollEl.current;
    if (!el || !root) return undefined;
    const io = new IntersectionObserver(([entry]) => setTitleGone(!entry.isIntersecting),
      { root, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [resetKey]);

  // The header photograph is the target of the card-to-page transition (T185).
  const sharedKey = hero?.sharedKey;
  useLayoutEffect(() => {
    if (sharedKey == null) return;
    claimShared(heroEl.current?.querySelector('img'), sharedKey);
  }, [sharedKey]);

  return (
    <div
      className={`tpage dsk-page ${className}`}
      role="dialog"
      aria-modal="true"
      aria-label={name}
      ref={pageRef}
      data-testid={testId}
    >
      <div className="tpage-bar">
        <button type="button" className="tpage-back" onClick={onClose} ref={backRef}>
          <ArrowLeftIcon size={15} />
          <span>{backLabel}</span>
        </button>
        <span className={`tpage-bar-title ${titleGone || barTitleOn ? 'on' : ''}`}>{name}</span>
        {onFav && <FavStar on={fav} onToggle={onFav} />}
        {onShare && (
          <button type="button" className="tpage-bar-act" onClick={onShare} aria-label={shareLabel || t('trails.shareLink')}>
            <ShareIcon size={15} />
          </button>
        )}
      </div>

      <div className="tpage-scroll" ref={scrollEl}>
        <div className="dsk">
          {hero && (
            <figure className={`dsk-hero ${hero.media ? '' : 'no-media'}`} data-slot="hero" ref={heroEl}>
              {hero.media && <div className="dsk-hero-media">{hero.media}</div>}
              <div className="dsk-strip-band">
                <DetailStrip cells={hero.cells} label={hero.label || t('detail.stripAria')} />
              </div>
              {hero.credit && <div className="dsk-hero-credit">{hero.credit}</div>}
            </figure>
          )}

          <div className="dsk-grid">
            <div className="dsk-head" data-slot="head" ref={headEl}>{head}</div>

            {hook && <p className="dsk-hook" data-slot="hook">{hook}</p>}

            <KeyFacts cells={keyFacts} lead={keyFactsLead} />

            {(alert || notFor) && (
              <section className="dsk-before" data-slot="beforego" aria-labelledby="dsk-before-h">
                <h2 id="dsk-before-h">{t('detail.beforeGo')}</h2>
                {alert && <div className="dsk-alert" data-slot="alert">{alert}</div>}
                {notFor && <div className="dsk-notfor" data-slot="notfor">{notFor}</div>}
              </section>
            )}

            {(primary || gettingThere !== false || takeAway) && (
              <div className="dsk-handoff" data-slot="handoff">
                {primary && <div className="dsk-primary-row">{primary}</div>}
                <div className="dsk-handoff-cols">
                  {gettingThere !== false && (
                    <section className="dsk-sec dsk-getting" data-slot="getting-there" aria-labelledby="dsk-getting-h">
                      <h2 id="dsk-getting-h">{t('detail.gettingThere')}</h2>
                      {gettingThere || <p className="dsk-note">{t('detail.gettingThereNone')}</p>}
                    </section>
                  )}
                  {takeAway && (
                    <section className="dsk-sec dsk-take" data-slot="take-away" aria-labelledby="dsk-take-h">
                      <h2 id="dsk-take-h">{t('detail.takeAway')}</h2>
                      <div className="dsk-acts">{takeAway}</div>
                    </section>
                  )}
                </div>
              </div>
            )}

            {map && <div className="dsk-map" data-slot="map">{map}</div>}

            {signature && <section className="dsk-signature" data-slot="signature">{signature}</section>}

            {rows.length > 0 && (
              <div className="dsk-rows jpage-lrows" data-slot="rows">
                {rows.map((r) => (
                  <DetailRow key={r.key} id={`dsk-${r.key}`} icon={r.icon} label={r.label} summary={r.summary}>
                    {r.body}
                  </DetailRow>
                ))}
              </div>
            )}

            {(exits.length > 0 || nearby) && (
              <div className="dsk-exits" data-slot="exits">
                <DetailExits head={t('detail.exitsHead')} headId="dsk-exits-h" exits={exits} />
                {nearby}
              </div>
            )}

            {sources !== false && (
              <div className="dsk-sources" data-slot="sources">
                <CreditFold t={t} licenceKeys={licenceKeys}>{sources}</CreditFold>
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && <p className="tpage-toast" role="status">{toast}</p>}
    </div>
  );
}
