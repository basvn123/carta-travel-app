import React, { useEffect, useLayoutEffect, useState } from 'react';
import { ladderOf, placeholderStyle } from '../lib/imageLadder.js';
import { pictureOn } from '../lib/pictureFlag.js';

/**
 * One photograph on a beach, lake or mountain page (T052).
 *
 * Flag off for the layer (lib/pictureFlag.js), or no copy of this file on
 * our CDN yet: exactly the <img> the page rendered before, attribute for
 * attribute, from the props it passes. Nothing changes until a layer is
 * switched on.
 *
 * Flag on and a copy exists (the wire record carries `ih` and `d`):
 *
 *   <picture>
 *     <source type="image/avif" srcset="320, 640, 1280 rungs">
 *     <source type="image/webp" srcset="320, 640 rungs">
 *     <img src="today's JPEG" width height ...>
 *   </picture>
 *
 * width and height are the photograph's real shape, so the browser reserves
 * the box before a byte arrives. The hero (`hero`) loads eagerly with
 * fetchpriority=high and paints the wire's six colour placeholder behind
 * itself until the photograph lands; everything else is loading=lazy.
 *
 * If the copy fails to load (a manifest that ran ahead of the bucket, a
 * CDN outage), the component falls back to the plain <img> for that
 * photograph, so the worst case of a bad rollout is one flash, not a broken
 * image.
 *
 * The credit is never read from here. The pages print it from the wire
 * record's by, lic, licUrl and page, which the export leaves untouched
 * (T051-b).
 */

/** The hero's rendered width on a layer page: full width on a phone, the
 *  860 px column above 768 px. Shared by the <source>s and the preload so
 *  both pick the same candidate and the preloaded bytes are reused. */
export const HERO_SIZES = '(min-width: 769px) 860px, 100vw';

/** A thumbnail in the strip under the hero: up to four across the column. */
export const THUMB_SIZES = '(min-width: 769px) 215px, 25vw';

export function LayerPhoto({
  layer, image, hero = false, className, alt, sizes,
  src, srcSet, width, height, loading, decoding,
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const key = image?.ih;
  useEffect(() => { setFailed(false); setLoaded(false); }, [key]);

  const on = pictureOn(layer);
  const ladder = on && !failed ? ladderOf(image) : null;

  if (!ladder) {
    // With the flag on, a photograph with no copy still gets its real shape
    // when the wire knows it (every lake and mountain record, and all but
    // the Geograph beach records, carry w and h).
    const real = on && image?.w > 0 && image?.h > 0;
    return (
      <img
        className={className}
        src={src}
        srcSet={srcSet}
        sizes={srcSet ? sizes : undefined}
        alt={alt}
        width={real ? image.w : width}
        height={real ? image.h : height}
        loading={on ? (hero ? 'eager' : 'lazy') : loading}
        fetchpriority={on && hero ? 'high' : undefined}
        decoding={decoding}
      />
    );
  }

  const [w, h] = ladder.size;
  return (
    <picture>
      <source type="image/avif" srcSet={ladder.avif} sizes={sizes} />
      <source type="image/webp" srcSet={ladder.webp} sizes={sizes} />
      <img
        className={className}
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        width={w}
        height={h}
        loading={hero ? 'eager' : 'lazy'}
        fetchpriority={hero ? 'high' : undefined}
        decoding={decoding || 'async'}
        style={hero && !loaded ? placeholderStyle(image.ph) : undefined}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </picture>
  );
}

/**
 * <link rel="preload" as="image"> for the one above-the-fold hero of a layer
 * page, and nothing else. Mounted by the parent BEFORE the page's lazy chunk
 * has arrived (browse/DestinationsTab.jsx), which is the only moment a
 * preload is worth anything in a single page app: it starts the hero's
 * download in parallel with the JavaScript that will render it, instead of
 * after. type=image/avif means a browser that cannot decode AVIF skips the
 * preload rather than fetching bytes it will not use; imagesrcset and
 * imagesizes are the same as the page's <source>, so the browser picks the
 * same candidate and the page reuses the preloaded response.
 */
export function HeroPreload({ layer, image }) {
  const ladder = pictureOn(layer) ? ladderOf(image) : null;
  const srcset = ladder?.avif || '';
  useLayoutEffect(() => {
    if (!srcset || typeof document === 'undefined') return undefined;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.type = 'image/avif';
    link.setAttribute('imagesrcset', srcset);
    link.setAttribute('imagesizes', HERO_SIZES);
    link.setAttribute('fetchpriority', 'high');
    document.head.appendChild(link);
    return () => { link.remove(); };
  }, [srcset]);
  return null;
}
