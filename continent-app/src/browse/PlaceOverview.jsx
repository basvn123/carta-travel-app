import React from 'react';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { WaterQualityBadge, swimRelevant } from '../components/WaterQualityBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { regionLine, tripDates } from '../lib/placeOverview.js';
import { DayPrice, SaveButton } from './ExploreCards.jsx';
import { CalendarIcon } from '../components/Icons.jsx';
import { useSettings } from '../components/SettingsLine.jsx';
import { useI18n } from '../i18n/index.jsx';
import { ratingWords } from '../lib/rating.js';
import { MatchLine } from './WhyItMatches.jsx';
import '../styles/79-place-card.css';

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
 *
 * T590 (owner decisions 2, 3 and 5 of 2026-10-22): layout="card" is the
 * Explore list from 769 px, the Komoot and Airbnb structure: the photograph
 * on top (3:2) with the Score in a solid pill top left and the save control
 * top right, then on the page ground with no box: the name, the region line,
 * the reason, the traveller's dates when they set them, and the price parts
 * (plane, bed, food and drink, the day total). Under 769 px the same card
 * lies on its side (photo left, text right), five to a phone screen. The map
 * dock and the phone drawer keep layout="row". Styles: 79-place-card.css.
 */

// A row's photograph is a 72 px square: Wikimedia's 250 px thumbnail covers
// it at twice the pixel density.
const ROW_SIZES = '72px';
const ROW_MAX = 250;
// A card's photograph: 112 px on its side on a phone, a column of the
// auto-fill grid (240 px and up) from 769 px.
const CARD_SIZES = '(max-width: 768px) 112px, (max-width: 1280px) 33vw, 360px';
const CARD_MAX = 640;

export const PlaceOverview = React.memo(function PlaceOverview({
  p, region = null, reason = null, rating = null, fav = false, onToggleFav = null,
  onOpen, t, selected = false, linked = false, className = '',
  rootRef = null, rootProps = null, hitProps = null, children = null, layout = 'row',
}) {
  const where = regionLine(p, region, t);
  if (layout === 'card') {
    return (
      <PlaceCard p={p} where={where} reason={reason} rating={rating} fav={fav} onToggleFav={onToggleFav}
        onOpen={onOpen} t={t} selected={selected} linked={linked} className={className}
        rootRef={rootRef} rootProps={rootProps} hitProps={hitProps}>
        {children}
      </PlaceCard>
    );
  }
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

/** A plain click opens the place here (T444); with a modifier the browser
 *  opens the link, and a new tab reads #dest= at boot. */
function openHere(e, onOpen) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  onOpen?.(e);
}

function PlaceCard({
  p, where, reason, rating, fav, onToggleFav, onOpen, t, selected, linked, className,
  rootRef, rootProps, hitProps, children,
}) {
  const settings = useSettings();
  const { lang, languages } = useI18n();
  const bcp47 = languages?.find((l) => l.code === lang)?.bcp47 || 'en-GB';
  const dates = tripDates(settings, t, bcp47);
  return (
    <div
      ref={rootRef}
      className={`xrow xov xov--card${selected ? ' is-selected' : ''}${linked ? ' is-linked' : ''}${className ? ` ${className}` : ''}`}
      data-id={p.id}
      {...rootProps}
    >
      <a
        className="xrow-hit xpc-hit"
        href={`#dest=${encodeURIComponent(p.id)}`}
        onClick={(e) => openHere(e, onOpen)}
        aria-label={t('explore.openDest', { city: p.city })}
        aria-current={selected ? 'true' : undefined}
        {...hitProps}
      >
        <span className="xpc-media">
          <HeroImage url={p.image} city={p.city} iso2={p.iso2} className="xpc-img"
            maxWidth={CARD_MAX} sizes={CARD_SIZES} ratio={[3, 2]} />
          {(rating || p.rating)?.score != null && (
            <span className="xpc-score"><ScoreChip rating={rating || p.rating} size="sm" /></span>
          )}
        </span>
        <span className="xpc-body">
          <span className="xrow-name xpc-name">{p.city}</span>
          <span className="xrow-line2 xpc-where">
            <CountryFlag country={p.iso2} size={12} />
            <span className="xrow-country">{where}</span>
            {p.rating?.hidden_gem && <HiddenGemTag />}
            {swimRelevant(p) && (
              <WaterQualityBadge bathing={p.bathing_water} t={t} showLabel={false} />
            )}
          </span>
          {/* T765: the match under the place, from 55% up. On a phone the
              photo is too narrow for "10.0 Exceptional", so the pill keeps
              the figure and the band word sits here (79-place-card.css). */}
          <span className="xpc-rateline">
            {ratingWords(rating || p.rating, t)?.word && (
              <span className="xpc-band">{ratingWords(rating || p.rating, t).word}</span>
            )}
            <MatchLine place={p} />
          </span>
          {reason && <span className="xrow-why xpc-why">{reason}</span>}
          {dates && (
            <span className="xpc-dates">
              <CalendarIcon size={16} className="pparts-icon" />
              <span>{dates}</span>
            </span>
          )}
          <DayPrice cost={p.cost} t={t} />
        </span>
      </a>
      {onToggleFav && (
        <SaveButton fav={fav} onToggle={() => onToggleFav(p.id)} t={t} tone="photo" name={p.city}
          className="xrow-save xpc-save" />
      )}
      {children}
    </div>
  );
}
