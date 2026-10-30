import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button, IconButton } from '../components/ui/index.js';
import { ChevronRightIcon, CloseIcon } from '../components/Icons.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { HeroImage } from '../components/HeroImage.jsx';
import { claimShared } from '../lib/sharedElement.js';
import { scrollBehavior } from '../lib/motion.js';

/**
 * The photo gallery every page opens on (T430): the destination page's strip
 * (T429, T446), lifted out so the item pages, the trip page and the
 * destination page share one gallery instead of four.
 *
 * Each photograph is named under it, in full, with its credit on a small
 * second line (carta-design "Photography": the credit sits under its photo,
 * owner 2026-10-15). The next photograph peeks in on a phone, the arrows
 * stay (a swipe is never the only way), the arrow keys move it when it has
 * focus, and each frame takes its width before the file arrives, so the
 * strip never slides sideways while it loads.
 *
 * A photo is { url, srcSet?, w?, h?, caption?, author?, licence?, page? }.
 * `claimKey` names the first photograph for the card-to-page transition.
 * The class names are the destination page's (destp-*), so that page keeps
 * its look; 70-item-pages.css gives the same rules to `.pgal`.
 */
const safeHref = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);

export function PhotoGallery({
  photos = [], label = '', claimKey = null, final = true, fallback = null, sizes = '(max-width: 720px) 86vw, 50vw',
  className = '', layout = 'strip',
}) {
  if (layout === 'mosaic') {
    return <PhotoMosaic photos={photos} label={label} claimKey={claimKey} fallback={fallback} className={className} />;
  }
  return <PhotoStrip photos={photos} label={label} claimKey={claimKey} final={final} fallback={fallback} sizes={sizes} className={className} />;
}

function PhotoStrip({ photos, label, claimKey, final, fallback, sizes, className }) {
  const { t } = useI18n();
  const scroller = useRef(null);
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(() => new Set());
  const claimRef = useCallback((el) => { if (claimKey != null) claimShared(el, claimKey); }, [claimKey]);
  const imgs = photos.filter((g) => g && g.url && !failed.has(g.url));

  useEffect(() => { setIdx(0); scroller.current?.scrollTo?.({ left: 0 }); }, [photos]);

  const step = () => {
    const slide = scroller.current?.querySelector('.destp-slide');
    return slide ? slide.offsetWidth + 6 : 0;
  };
  const onScroll = (e) => {
    const w = step();
    if (!w) return;
    const next = Math.round(e.currentTarget.scrollLeft / w);
    setIdx((cur) => (cur === next ? cur : Math.min(next, imgs.length - 1)));
  };
  const nudge = (dir) => {
    const w = step();
    if (w) scroller.current.scrollBy({ left: dir * w, behavior: scrollBehavior() });
  };

  if (!imgs.length) {
    return (
      <div className={`pgal destp-gallery is-blank ${className}`.trim()}>
        <HeroImage url={null} city={fallback?.city || label} iso2={fallback?.iso2} className="destp-slide-img" />
      </div>
    );
  }
  const many = imgs.length > 1;
  return (
    <div className={`pgal destp-gallery${final ? ' is-final' : ''} ${className}`.trim()}>
      <div
        className="destp-gallery-track"
        ref={scroller}
        onScroll={onScroll}
        tabIndex={many ? 0 : undefined}
        aria-label={many ? label : undefined}
        role={many ? 'group' : undefined}
        onKeyDown={many ? (e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); nudge(1); }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-1); }
        } : undefined}
      >
        {imgs.map((g, i) => {
          const credit = [g.author, g.licence].filter(Boolean).join(', ');
          const href = safeHref(g.page);
          return (
            <figure className="destp-slide" key={g.url}>
              <img
                ref={i === 0 ? claimRef : undefined}
                src={g.url}
                srcSet={g.srcSet || undefined}
                sizes={g.srcSet ? sizes : undefined}
                width={g.w || undefined}
                height={g.h || undefined}
                style={g.w && g.h ? undefined : { aspectRatio: '4 / 3' }}
                alt={g.caption || label}
                loading={i === 0 ? 'eager' : 'lazy'}
                fetchpriority={i === 0 ? 'high' : undefined}
                decoding="async"
                onError={() => setFailed((s) => new Set([...s, g.url]))}
              />
              <figcaption className="destp-slide-band">
                <span className="destp-slide-cap">{g.caption || label}</span>
                {credit && (href ? (
                  <a className="destp-slide-credit" href={href} title={credit} target="_blank" rel="noreferrer">
                    {credit}
                  </a>
                ) : (
                  <span className="destp-slide-credit" title={credit}>{credit}</span>
                ))}
              </figcaption>
            </figure>
          );
        })}
      </div>
      {many && (
        <>
          <IconButton tone="photo" className="destp-gallery-arrow is-prev" onClick={() => nudge(-1)}
            label={t('dest.photoPrev')} disabled={idx === 0}>
            <ChevronRightIcon size={16} />
          </IconButton>
          <IconButton tone="photo" className="destp-gallery-arrow is-next" onClick={() => nudge(1)}
            label={t('dest.photoNext')} disabled={idx >= imgs.length - 1}>
            <ChevronRightIcon size={16} />
          </IconButton>
        </>
      )}
    </div>
  );
}

const creditOf = (g) => [g?.author, g?.licence].filter(Boolean).join(', ');

/**
 * Every photograph with its caption and full credit, over the page (T912):
 * what "Show all N photos" opens. A dialog of the family (one scrim, one
 * close, a focus trap, Escape), a column of photographs, each named and
 * credited under it.
 */
function AllPhotos({ imgs, label, onClose }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const closeRef = useRef(null);
  useFocusTrap(ref, onClose, { initialFocusRef: closeRef });
  return (
    <div className="pgal-all-scrim" onClick={onClose}>
      <div className="pgal-all" role="dialog" aria-modal="true" aria-label={t('destx.photosTitle', { name: label })}
        ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="pgal-all-bar">
          <h2 className="pgal-all-title">{t('destx.photosTitle', { name: label })}</h2>
          <IconButton ref={closeRef} label={t('detail.close')} onClick={onClose}><CloseIcon size={16} /></IconButton>
        </div>
        <div className="pgal-all-list">
          {imgs.map((g, i) => {
            const credit = creditOf(g);
            const href = safeHref(g.page);
            return (
              <figure className="pgal-all-item" key={g.url}>
                <img src={g.url} srcSet={g.srcSet || undefined} sizes={g.srcSet ? '(max-width: 960px) 100vw, 960px' : undefined}
                  alt={g.caption || label} loading={i < 2 ? 'eager' : 'lazy'} decoding="async" />
                <figcaption>
                  <span className="pgal-all-cap">{g.caption || label}</span>
                  {credit && (href
                    ? <a className="pgal-all-credit" href={href} target="_blank" rel="noreferrer">{credit}</a>
                    : <span className="pgal-all-credit">{credit}</span>)}
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The place and trip pages' photographs (T912, the owner's approved spec):
 * on a phone a swipe carousel, one photograph a frame, with "1 / N" and the
 * photograph's credit as small solid pills on it; from 700 px a mosaic of
 * one large photograph (two rows high) and four small ones, with "Show all N
 * photos" opening every photograph with its caption and full credit. The
 * credit chip names the photograph on screen; the full list is also in the
 * page's sources fold. A missing photograph is the flag-and-name placeholder.
 */
function PhotoMosaic({ photos, label, claimKey, fallback, className }) {
  const { t } = useI18n();
  const track = useRef(null);
  const [idx, setIdx] = useState(0);
  const [all, setAll] = useState(false);
  const [failed, setFailed] = useState(() => new Set());
  const claimRef = useCallback((el) => { if (claimKey != null) claimShared(el, claimKey); }, [claimKey]);
  const imgs = photos.filter((g) => g && g.url && !failed.has(g.url));
  useEffect(() => { setIdx(0); track.current?.scrollTo?.({ left: 0 }); }, [photos]);
  if (!imgs.length) {
    return (
      <div className={`pgal pmos is-blank ${className}`.trim()}>
        <HeroImage url={null} city={fallback?.city || label} iso2={fallback?.iso2} className="pmos-blank" />
      </div>
    );
  }
  const fail = (u) => setFailed((s) => new Set([...s, u]));
  const nudge = (dir) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: scrollBehavior() });
  };
  const n = imgs.length;
  const credit = creditOf(imgs[Math.min(idx, n - 1)]);
  const mainCredit = creditOf(imgs[0]);
  const tiles = imgs.slice(0, 5);
  return (
    <div className={`pgal pmos pmos-n${tiles.length} ${className}`.trim()}>
      <div
        className="pmos-track"
        ref={track}
        tabIndex={n > 1 ? 0 : undefined}
        role={n > 1 ? 'group' : undefined}
        aria-label={n > 1 ? label : undefined}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          setIdx((cur) => (cur === i ? cur : Math.min(i, n - 1)));
        }}
        onKeyDown={n > 1 ? (e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); nudge(1); }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-1); }
        } : undefined}
      >
        {imgs.map((g, i) => (
          <img key={g.url} className="pmos-slide" src={g.url} srcSet={g.srcSet || undefined}
            sizes={g.srcSet ? '100vw' : undefined} alt={g.caption || label}
            ref={i === 0 ? claimRef : undefined}
            loading={i === 0 ? 'eager' : 'lazy'} fetchpriority={i === 0 ? 'high' : undefined}
            decoding="async" onError={() => fail(g.url)} />
        ))}
      </div>
      {n > 1 && (
        <span className="pmos-pill pmos-count" aria-live="polite">
          <span aria-hidden="true">{`${idx + 1} / ${n}`}</span>
          <span className="sr-only">{t('destx.photoOf', { i: idx + 1, n })}</span>
        </span>
      )}
      <div className="pmos-grid">
        {tiles.map((g, i) => (
          <img key={g.url} className={`pmos-tile${i === 0 ? ' is-main' : ''}`} src={g.url} srcSet={g.srcSet || undefined}
            sizes={g.srcSet ? (i === 0 ? '(max-width: 1240px) 60vw, 740px' : '(max-width: 1240px) 20vw, 250px') : undefined}
            alt={g.caption || label} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" onError={() => fail(g.url)} />
        ))}
      </div>
      {credit && <span className="pmos-pill pmos-credit is-phone" title={credit}>{credit}</span>}
      {mainCredit && <span className="pmos-pill pmos-credit is-wide" title={mainCredit}>{mainCredit}</span>}
      <Button variant="secondary" size="sm" className="pmos-all" onClick={() => setAll(true)}>
        {t('destx.photosAll', { n })}
      </Button>
      {all && <AllPhotos imgs={imgs} label={label} onClose={() => setAll(false)} />}
    </div>
  );
}

/**
 * A tile's photographs, swiped inside its media box (T430, carta-design
 * "Photography": a gallery may run on a list tile). Up to four. The first is
 * loaded at once, the rest on the first touch, hover or swipe, so a rail of
 * twenty tiles costs twenty photographs until somebody looks. A tap on the
 * photograph opens the tile (the stretched link sits under this layer so the
 * swipe reaches the photographs). The arrows are a pointer shortcut on hover
 * and the position dots sit on a band under the photograph, never on it;
 * both are hidden from screen readers, for whom the tile is one link and the
 * page's gallery holds every photograph.
 */
export function TilePhotos({ urls = [], city = '', iso2, onOpen, sizes, maxWidth = 960, ratio = [4, 3] }) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const [idx, setIdx] = useState(0);
  const track = useRef(null);
  const list = urls.filter(Boolean);
  if (list.length < 2) {
    return <HeroImage url={list[0] || null} city={city} iso2={iso2} className="dtab-tile-img" maxWidth={maxWidth} sizes={sizes} ratio={ratio} />;
  }
  const wake = () => { if (!all) setAll(true); };
  const onScroll = (e) => {
    wake();
    const el = e.currentTarget;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== idx) setIdx(i);
  };
  const nudge = (dir, e) => {
    e.stopPropagation();
    wake();
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: scrollBehavior() });
  };
  return (
    <div className="tphotos" onPointerEnter={wake} onTouchStart={wake} onFocus={wake}>
      {/* A tap on a photograph opens the tile; a swipe fires no click, so
          the two never clash. The card's own link stays its keyboard door. */}
      <div className="tphotos-track" ref={track} onScroll={onScroll} onClick={onOpen}>
        {list.map((u, i) => (
          <div className="tphotos-slide" key={u}>
            {i === 0 || all
              ? <HeroImage url={u} city={city} iso2={iso2} className="dtab-tile-img" maxWidth={maxWidth} sizes={sizes} ratio={ratio} />
              : <span className="tphotos-wait" />}
          </div>
        ))}
      </div>
      <IconButton tone="photo" className="tphotos-arrow is-prev" label={t('dest.photoPrev')} tabIndex={-1}
        aria-hidden="true" onClick={(e) => nudge(-1, e)} disabled={idx === 0}>
        <ChevronRightIcon size={16} />
      </IconButton>
      <IconButton tone="photo" className="tphotos-arrow is-next" label={t('dest.photoNext')} tabIndex={-1}
        aria-hidden="true" onClick={(e) => nudge(1, e)} disabled={idx >= list.length - 1}>
        <ChevronRightIcon size={16} />
      </IconButton>
      <span className="tphotos-dots" aria-hidden="true">
        {list.map((u, i) => <span key={u} className={i === idx ? 'is-on' : ''} />)}
      </span>
    </div>
  );
}
