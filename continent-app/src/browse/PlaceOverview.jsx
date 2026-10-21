import React from 'react';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { WaterQualityBadge, swimRelevant } from '../components/WaterQualityBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { regionLine } from '../lib/placeOverview.js';
import { DayPrice, SaveButton } from './ExploreCards.jsx';

/**
 * PlaceOverview (T504, roadmap 1.5): the ONE overview of a place in Explore.
 * The list row, the selected place on the map (desktop) and the rows of the
 * phone's map drawer all draw through this, so switching between List and
 * Map never changes what a place says.
 *
 * A compact row (the owner's row decision of 2026-10-13): a 72 px photograph,
 * then the name with the Score, the flag with the region and country, the
 * one reason, the price a person a day in whole euros, and the save control
 * outside the link. What it says comes from lib/placeOverview.js, worded
 * in the reader's language by `reasonText()` and `regionLine()`.
 *
 * The markup keeps the .xrow classes the Explore stylesheet and harnesses
 * read; the outer element adds .xov.
 */

// A row's photograph is a 72 px square: Wikimedia's 250 px thumbnail covers
// it at twice the pixel density.
const ROW_SIZES = '72px';
const ROW_MAX = 250;

export const PlaceOverview = React.memo(function PlaceOverview({
  p, region = null, reason = null, rating = null, fav = false, onToggleFav = null,
  onOpen, t, selected = false, linked = false, className = '',
  rootRef = null, rootProps = null, hitProps = null, children = null,
}) {
  const where = regionLine(p, region, t);
  return (
    <div
      ref={rootRef}
      className={`xrow xov${selected ? ' is-selected' : ''}${linked ? ' is-linked' : ''}${className ? ` ${className}` : ''}`}
      data-id={p.id}
      {...rootProps}
    >
      <a
        className="xrow-hit"
        href={`#dest=${encodeURIComponent(p.id)}`}
        onClick={(e) => {
          // A plain click opens the place here (T444); with a modifier the
          // browser opens the link, and a new tab reads #dest= at boot.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          onOpen?.(e);
        }}
        aria-label={t('explore.openDest', { city: p.city })}
        aria-current={selected ? 'true' : undefined}
        {...hitProps}
      >
        <span className="xrow-media">
          <HeroImage url={p.image} city={p.city} iso2={p.iso2} className="xrow-img"
            maxWidth={ROW_MAX} sizes={ROW_SIZES} ratio={[1, 1]} />
        </span>
        <span className="xrow-body">
          <span className="xrow-line1">
            <span className="xrow-name">{p.city}</span>
            <ScoreChip rating={rating || p.rating} size="sm" />
          </span>
          <span className="xrow-line2">
            <CountryFlag country={p.iso2} size={12} />
            <span className="xrow-country">{where}</span>
            {p.rating?.hidden_gem && <HiddenGemTag />}
            {swimRelevant(p) && (
              <WaterQualityBadge bathing={p.bathing_water} t={t} showLabel={false} />
            )}
          </span>
          {reason && <span className="xrow-why">{reason}</span>}
          <DayPrice cost={p.cost} t={t} />
        </span>
      </a>
      {onToggleFav && (
        <SaveButton fav={fav} onToggle={() => onToggleFav(p.id)} t={t} name={p.city} className="xrow-save" />
      )}
      {children}
    </div>
  );
});
