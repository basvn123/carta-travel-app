import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { FavStar } from '../components/FavStar.jsx';
import { ArrowLeftIcon, ShareIcon, ChevronDownIcon } from '../components/Icons.jsx';
import { claimShared } from '../lib/sharedElement.js';
import CreditFold from './CreditFold.jsx';

const PointMap = lazy(() => import('./PointMap.jsx'));

/**
 * The shared detail-page skeleton (T180, destinations spec 5.4).
 *
 * One component draws the trail, cycling, beach, lake and mountain pages, so
 * the five read as one family rather than five products. Each page computes
 * its own content and hands it over in named slots; this file owns the shell,
 * the order and the layout, and nothing about any one section.
 *
 * The order, top to bottom, which is also the phone's order:
 *
 *   1  hero          the view image full bleed at 56vh, the three-cell strip
 *                    flush under it (difficulty, type, headline number), the
 *                    photo credit. carta-design's strip rule wins over the
 *                    spec's "semi-transparent strip over the photo": the
 *                    strip is solid paper and no text sits on the picture.
 *                    The title, ref chip and breadcrumb follow in `head`.
 *   2  hook          one sentence with a verb or a number
 *   3  notFor        who this is not for (T159), plain dim paper
 *      alert         the one exception to "everything else folds": a safety
 *                    note that must not be one tap away (the lake's swim
 *                    verdict, a hazard list). Empty on most pages.
 *   4  map           sticky in the right-hand column on a desktop, under the
 *                    hook on a phone. The 3D toggle (top right) and "Fly the
 *                    route" come with the terrain and flyover work and are not
 *                    drawn yet; the map's own zoom control holds that corner.
 *   5  signature     the section's own figure, full width of the left column.
 *                    T181 fills this slot with the five signature visuals;
 *                    until then each page passes the nearest figure it has.
 *   6  rows          collapsed rows, an icon at 20px with no tile, a label
 *                    and a six-word summary, all closed on arrival. T164's
 *                    Good to know rows, generalised (DetailRow below). This is
 *                    where T182's derived modules plug in: one more entry in
 *                    the page's rows array each, { key, icon, label, summary,
 *                    body }. The bento grid that replaces the list belongs to
 *                    T179, which waits on a carta-design rule.
 *   7  gettingThere  always present, never collapsed; `false` leaves it out,
 *                    for a page with no place to get to (the honest stub,
 *                    T367 closing T124-f)
 *   8  takeAway      GPX, a file for another app, a link to send to a phone
 *   9  exits         three computed ways out (easier, cheaper, nearby), then
 *                    the cross-layer neighbours (NearbyOutdoors) as `nearby`
 *  10  sources       collapsed: sources, licences, the figure split and the
 *                    last-checked month, inside the shared CreditFold;
 *                    `false` leaves the fold out (the stub says its one
 *                    credit line in the open instead)
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
  notFor = null,
  alert = null,
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

            {notFor && <div className="dsk-notfor" data-slot="notfor">{notFor}</div>}

            {alert && <div className="dsk-alert" data-slot="alert">{alert}</div>}

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
