import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { IconButton } from '../components/ui/index.js';
import { ChevronRightIcon } from '../components/Icons.jsx';
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
  className = '',
}) {
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
