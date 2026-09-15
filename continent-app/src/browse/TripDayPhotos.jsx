import React from 'react';
import { srcSetFor, fallbackSrc } from '../lib/heroImage.js';
import { MAX_PER_DAY } from './dayShots.js';

/**
 * A day's photographs: three or four views of the places that day actually
 * goes to, drawn from images already attached to its stop and its sights.
 *
 * Every caption names what the reader is looking at, taken from the POI's own
 * name. A generic caption ("Day 3") tells them nothing they could not see from
 * the heading, and an uncaptioned photograph on a travel page is a decoration
 * pretending to be information.
 *
 * Sized through lib/heroImage.js like every other card photograph on the site:
 * srcSet over the widths Wikimedia will actually render, `sizes` describing the
 * strip rather than the viewport, and intrinsic width/height so the row does
 * not reflow as each picture lands. A bare <img src> here would re-introduce
 * exactly the overdraw CardPhoto exists to have fixed.
 */

// The strip is a scrolling row of ~132px tiles on a phone and ~160 on desktop.
const STRIP_SIZES = '(min-width: 769px) 160px, 132px';

export function TripDayPhotos({ shots }) {
  if (!shots?.length) return null;
  return (
    <ul className="tday-shots">
      {shots.slice(0, MAX_PER_DAY).map((shot) => (
        <li key={shot.url} className="tday-shot">
          <img
            className="tday-shot-img"
            src={fallbackSrc(shot.url, 330)}
            srcSet={srcSetFor(shot.url, 500)}
            sizes={STRIP_SIZES}
            alt=""
            width={4}
            height={3}
            loading="lazy"
            decoding="async"
          />
          <span className="tday-shot-cap">{shot.name}</span>
        </li>
      ))}
    </ul>
  );
}
