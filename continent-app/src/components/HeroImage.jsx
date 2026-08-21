import React from 'react';
import { srcSetFor, fallbackSrc, initials } from '../lib/heroImage.js';
import { CountryFlag } from './CountryFlag.jsx';

/**
 * One destination photograph, asked for at the size the layout draws it and
 * never at 960px "just in case" (see lib/heroImage.js for why the widths are
 * a fixed list), with a placeholder that says which place it is instead of
 * leaving a grey hole in the grid.
 *
 * width/height are set on the element even though CSS sizes it, because that
 * is what stops 48 cards reflowing as their photos land.
 */
export function HeroImage({
  url,
  city,
  iso2,
  className = '',
  maxWidth = 960,
  sizes,
  eager = false,
  ratio = [4, 3],
}) {
  if (!url) {
    return (
      <span className={`hero-blank ${className}`} aria-hidden="true">
        <span className="hero-blank-mark">{initials(city)}</span>
        {iso2 && <CountryFlag country={iso2} size={13} />}
      </span>
    );
  }
  return (
    <img
      className={className}
      src={fallbackSrc(url, Math.min(maxWidth, 500))}
      srcSet={srcSetFor(url, maxWidth)}
      sizes={sizes}
      alt=""
      width={ratio[0]}
      height={ratio[1]}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : undefined}
    />
  );
}
