import React, { useEffect, useState } from 'react';
import {
  srcSetFor, fallbackSrc, initials, heroLadder,
} from '../lib/heroImage.js';
import { CountryFlag } from './CountryFlag.jsx';

/**
 * One photograph at the size the layout draws it, from our own copy when
 * there is one (H12, T1105) and from Wikimedia otherwise.
 *
 * `image` is the wire image record ({url, w, h}, or {ih, d} once joined):
 * when lib/heroImage.js heroLadder() finds a live ladder_v1 copy of it, the
 * element is
 *
 *   <picture>
 *     <source type="image/avif" srcset="320, 640, 1280 rungs up to maxWidth">
 *     <source type="image/webp" srcset="320, 640 rungs">
 *     <img src="the Wikimedia JPEG" ...>
 *   </picture>
 *
 * and a copy that fails to load (a manifest ahead of the bucket, a CDN
 * outage) drops this one photograph back to the plain Wikimedia <img>.
 * Without a live copy it is exactly the <img> it always was. The credit is
 * never read from here: every caller prints it from the record, which keeps
 * the Commons URL as its identity.
 *
 * width/height are set on the element even though CSS sizes it, because that
 * is what stops 48 cards reflowing as their photos land.
 */
export function LadderImg({
  image, url, maxWidth = 960, sizes, eager = false, width, height, className, alt = '',
  style, onError, imgRef, fetchPriority,
}) {
  const src = url || image?.url || null;
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  const rec = image && typeof image === 'object' && (!image.url || image.url === src) ? image : null;
  const ladder = !failed && rec ? heroLadder(rec, maxWidth) : null;
  const priority = fetchPriority || (eager ? 'high' : undefined);
  const plain = (
    <img
      ref={imgRef}
      className={className}
      src={fallbackSrc(src, Math.min(maxWidth, 500))}
      srcSet={srcSetFor(src, maxWidth)}
      sizes={sizes}
      alt={alt}
      width={width}
      height={height}
      style={style}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchpriority={priority}
      onError={ladder ? () => setFailed(true) : onError}
    />
  );
  if (!ladder) return plain;
  return (
    <picture className="ladder-pic">
      <source type="image/avif" srcSet={ladder.avif} sizes={sizes} />
      <source type="image/webp" srcSet={ladder.webp} sizes={sizes} />
      {plain}
    </picture>
  );
}

export function HeroImage({
  url,
  image = null,
  city,
  iso2,
  className = '',
  maxWidth = 960,
  sizes,
  eager = false,
  ratio = [4, 3],
}) {
  const src = url || image?.url || null;
  if (!src) {
    return (
      <span className={`hero-blank ${className}`} aria-hidden="true">
        <span className="hero-blank-mark">{initials(city)}</span>
        {iso2 && <CountryFlag country={iso2} size={13} />}
      </span>
    );
  }
  return (
    <LadderImg
      image={image}
      url={src}
      className={className}
      maxWidth={maxWidth}
      sizes={sizes}
      eager={eager}
      width={ratio[0]}
      height={ratio[1]}
    />
  );
}
