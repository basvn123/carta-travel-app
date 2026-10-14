import React, { useRef } from 'react';
import { HeroImage } from '../components/HeroImage.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { ChevronRightIcon } from '../components/Icons.jsx';
import { Card, IconButton } from '../components/ui/index.js';
import { scrollBehavior } from '../lib/motion.js';
import { countryPhotos, countryKnownKey } from '../lib/countryGallery.js';

/**
 * A country before anybody opens it (T428, owner 2026-10-14): three
 * photographs to swipe through, the view it is known for first, then its
 * name and one line of what it is known for. No count.
 *
 * The photographs come from lib/countryGallery.js (T449: chosen by eye,
 * fact-checked against their Commons pages). A country with none falls back
 * to the flag on --surface-sunken, never a grey box.
 *
 * The strip sits above the card's stretched link (z-index 1), because a
 * finger has to be able to swipe it; a tap on a photograph still opens the
 * country, and the title stays the card's one real control for a keyboard
 * and a screen reader. The arrows show on a fine pointer only; on touch the
 * next photograph peeks in at the edge, so the swipe is visible without a
 * position figure (carta-design "Rails").
 */
export function GalleryStrip({ cc, name, t, eager = false, sizes, onPhoto = null, href = null, className = '' }) {
  const ref = useRef(null);
  const photos = countryPhotos(cc);
  const page = (dir) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: scrollBehavior() });
  };
  if (!photos.length) {
    return (
      <span className={`dgal-blank ${className}`.trim()} aria-hidden="true">
        <CountryFlag country={cc} size={28} />
      </span>
    );
  }
  return (
    <div className={`dgal ${className}`.trim()}>
      <div className="dgal-strip" ref={ref}>
        {photos.map((p, i) => {
          const img = (
            <HeroImage url={p.u} city={p.place} className="dgal-img" maxWidth={960}
              sizes={sizes} ratio={[3, 2]} eager={eager && i === 0} />
          );
          // A photograph opens the country too, as a real link to the same
          // address the title opens (a modifier click gets a new tab). It is
          // out of the tab order and hidden from assistive technology: the
          // card's title is its one control there (T428, quality floor).
          return onPhoto ? (
            <a className="dgal-slide dgal-hit" key={p.u} href={href || '#'} tabIndex={-1} aria-hidden="true"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                onPhoto();
              }}>
              {img}
            </a>
          ) : (
            <div className="dgal-slide" key={p.u}>{img}</div>
          );
        })}
      </div>
      {photos.length > 1 && (
        <span className="dgal-nav">
          <IconButton tone="photo" className="dgal-arrow is-prev"
            label={t('dtab.photoPrev', { country: name })} onClick={() => page(-1)}>
            <ChevronRightIcon size={16} />
          </IconButton>
          <IconButton tone="photo" className="dgal-arrow"
            label={t('dtab.photoNext', { country: name })} onClick={() => page(1)}>
            <ChevronRightIcon size={16} />
          </IconButton>
        </span>
      )}
    </div>
  );
}

export const CountryGalleryCard = React.memo(function CountryGalleryCard({
  cc, name, onPick, t, eager = false, sizes = '(max-width: 768px) 88vw, 320px', href = null,
}) {
  const key = countryKnownKey(cc);
  const open = () => onPick(cc);
  return (
    <Card
      layout="tile"
      className="dgal-card"
      data-cc={cc}
      media={<GalleryStrip cc={cc} name={name} t={t} eager={eager} sizes={sizes} onPhoto={open} href={href} />}
      title={(
        <span className="dgal-title">
          <CountryFlag country={cc} size={14} className="dgal-flag" />
          <span className="places-card-name">{name}</span>
        </span>
      )}
      onOpen={open}
      meta={key ? <span className="dgal-line">{t(key)}</span> : null}
    />
  );
});
