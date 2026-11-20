import React from 'react';
import { WaterQualityBadge, swimRelevant } from '../../components/WaterQualityBadge.jsx';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { regionLine } from '../../lib/placeOverview.js';
import { localNameOf } from '../../lib/search/localNames.js';
import { useI18n } from '../../i18n/index.jsx';
import { countryName } from '../../lib/countryName.js';
import { useSettledFigure } from '../../lib/figureChange.js';
import { MatchLine } from '../WhyItMatches.jsx';
import { SaveButton } from '../ExploreCards.jsx';
import { PlaceScore, BandWord, PlaceFigure } from './HouseParts.jsx';

/**
 * PlaceRow (G1, house style 2026-11): a place as one row of the walker's
 * table, the house list row (DESIGN.md "List row"). Explore's list, the map's
 * docked column and the phone's map drawer all draw it, so a place says the
 * same thing in the list and on the map (T504): what it says comes from
 * lib/placeOverview.js, as PlaceOverview's does.
 *
 *   a photo (44 px on a phone, 56 px from a 600 px list), the name with the
 *   Score plate (the band word where the row has room), the flag with the
 *   region and country (the hidden gem and water marks), the one reason (from
 *   a 1024 px list), the taste lines where a taste is set (T765, T1208), and
 *   the figure over its basis, loudest (G12, D10, place-prices: one button
 *   to the receipt); the figure and the save control sit outside the link
 *   (they are buttons).
 *
 * The layout is one grid per list width (container queries in
 * 62-v6-explore.css), so a narrow map column reads like a phone. The row is
 * the grid; the link is a subgrid over every column but the save one, so its
 * parts and the formation beside it share the same tracks. The markup
 * keeps the .xrow, .xrow-hit, .xrow-name, .xrow-country, .xrow-why, .xprice
 * and .xrow-save names the harnesses read.
 */

/** The region and the country as two parts of one line, in the language's
 *  own order ("Alps, Italy"): the region gives way, the country never. */
function WhereLine({ p, region, t }) {
  const country = countryName(p.iso2, p.country);
  if (!region) return <span className="xrow-country"><span className="xrow-ctry">{country}</span></span>;
  // The language's own pattern, read with two markers, gives the order and
  // the separator; an order other than region first falls back to one span.
  const tpl = t('overview.regionCountry', { region: '@@R@@', country: '@@C@@' });
  const c = tpl.indexOf('@@C@@');
  if (!tpl.startsWith('@@R@@') || c < 0 || !tpl.endsWith('@@C@@')) {
    return <span className="xrow-country"><span className="xrow-region">{regionLine(p, region, t)}</span></span>;
  }
  const sep = tpl.slice(5, c).trimEnd();
  return (
    <span className="xrow-country">
      <span className="xrow-region">{region}{sep}</span>
      <span className="xrow-ctry">{country}</span>
    </span>
  );
}

const ROW_SIZES = '56px';
const ROW_MAX = 250;

export const PlaceRow = React.memo(function PlaceRow({
  p, region = null, reason = null, rating = null, fav = false, onToggleFav = null,
  onOpen, t, selected = false, linked = false, className = '',
  rootRef = null, rootProps = null, hitProps = null, children = null,
}) {
  const score = rating || p.rating;
  const { lang } = useI18n();
  // A row a search pick opened says the name picked (Florenz), G12.
  const name = localNameOf(p.id, lang) || p.city;
  const figRef = React.useRef(null);
  useSettledFigure(figRef, p.cost?.dayEur ?? null);
  return (
    <div
      ref={rootRef}
      className={`xrow xov xrow-hs${selected ? ' is-selected' : ''}${linked ? ' is-linked' : ''}${className ? ` ${className}` : ''}`}
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
        aria-current={selected ? 'true' : undefined}
        {...hitProps}
      >
        <span className="xrow-media">
          <HeroImage url={p.image} image={p.photo} city={p.city} iso2={p.iso2} className="xrow-img"
            maxWidth={ROW_MAX} sizes={ROW_SIZES} ratio={[1, 1]} />
        </span>
        <span className="xrow-line1">
          <span className="xrow-name">{name}</span>
          <PlaceScore rating={score} />
          <BandWord rating={score} className="xrow-band" />
          {/* The water mark rides with the name (as the judged prototype
              had it), so the country line keeps its room. */}
          {swimRelevant(p) && <WaterQualityBadge bathing={p.bathing_water} t={t} showLabel={false} />}
        </span>
        <span className="xrow-line2">
          <CountryFlag country={p.iso2} size={12} />
          <WhereLine p={p} region={region} t={t} />
          {p.rating?.hidden_gem && <span className="hs-gem xrow-gem">{t('common.hiddenGem')}</span>}
        </span>
        {reason && <span className="xrow-why">{reason}</span>}
        <span className="xrow-fit">
          <MatchLine place={p} />
        </span>
      </a>
      {/* G12, D10: the price sits outside the link, a direct child of the
          row grid (62-v6-explore.css), because it is a button (the
          receipt) and a button never nests in a link. */}
      <PlaceFigure place={p} t={t} figRef={figRef} />
      {onToggleFav && (
        <SaveButton fav={fav} onToggle={() => onToggleFav(p.id)} t={t} name={name} className="xrow-save" word />
      )}
      {children}
    </div>
  );
});
