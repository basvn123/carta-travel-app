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
 *
 * Inside the day track (T387) the strip is a two-column grid of 3:2 frames in
 * the day card rather than a sideways scroller: a scroller inside a card that
 * itself scrolls sideways fights the track for every swipe. So the list is no
 * longer a scroll region and takes no tab stop of its own.
 */

// Two frames across a day card: the card is about 85 percent of a phone's
// width, and a third of the page column from 1024 px.
const STRIP_SIZES = '(min-width: 1024px) 120px, 40vw';

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
            width={3}
            height={2}
            loading="lazy"
            decoding="async"
          />
          <span className="tday-shot-cap">{shot.name}</span>
        </li>
      ))}
    </ul>
  );
}
