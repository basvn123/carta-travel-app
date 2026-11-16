import React from 'react';
import { WaterQualityBadge, swimRelevant } from '../../components/WaterQualityBadge.jsx';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { regionLine, tripDates } from '../../lib/placeOverview.js';
import { useSettings } from '../../components/SettingsLine.jsx';
import { useDayView } from '../../hooks/useDayView.js';
import { useI18n } from '../../i18n/index.jsx';
import { useSettledFigure } from '../../lib/figureChange.js';
import { MatchLine } from '../WhyItMatches.jsx';
import { WhyChips } from '../WhyChips.jsx';
import { SaveButton } from '../ExploreCards.jsx';
import { PlaceScore, BandWord, RowFormation } from './HouseParts.jsx';

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
 *   a 1024 px list), the taste lines where a taste is set (T765, T1208), the
 *   formation and the day figure, loudest; the save control outside the link.
 *
 * The layout is one grid per list width (container queries in
 * 62-v6-explore.css), so a narrow map column reads like a phone. The markup
 * keeps the .xrow, .xrow-hit, .xrow-name, .xrow-country, .xrow-why, .xprice
 * and .xrow-save names the harnesses read.
 */

/**
 * The list's column head: the traveller's dates (only when set) and the unit
 * every figure below is in, said once (DESIGN.md: "the unit is said once in
 * the column head"). Each row still carries the unit for a screen reader, so
 * the head itself is hidden from it.
 */
export function ListHead({ t }) {
  const settings = useSettings();
  const view = useDayView();
  const { lang, languages } = useI18n();
  const bcp47 = languages?.find((l) => l.code === lang)?.bcp47 || 'en-GB';
  const dates = tripDates(settings, t, bcp47);
  return (
    <div className="xlist-head" aria-hidden="true">
      <span className="xlist-dates">{dates || ''}</span>
      <span className="xlist-unit">{view.total ? view.unit : t('explore.colUnit')}</span>
    </div>
  );
}

const ROW_SIZES = '56px';
const ROW_MAX = 250;

export const PlaceRow = React.memo(function PlaceRow({
  p, region = null, reason = null, rating = null, fav = false, onToggleFav = null,
  onOpen, t, selected = false, linked = false, className = '',
  rootRef = null, rootProps = null, hitProps = null, children = null,
}) {
  const where = regionLine(p, region, t);
  const score = rating || p.rating;
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
          <span className="xrow-name">{p.city}</span>
          <PlaceScore rating={score} />
          <BandWord rating={score} className="xrow-band" />
        </span>
        <span className="xrow-line2">
          <CountryFlag country={p.iso2} size={12} />
          <span className="xrow-country">{where}</span>
          {p.rating?.hidden_gem && <span className="hs-gem xrow-gem">{t('common.hiddenGem')}</span>}
          {swimRelevant(p) && <WaterQualityBadge bathing={p.bathing_water} t={t} showLabel={false} />}
        </span>
        {reason && <span className="xrow-why">{reason}</span>}
        <span className="xrow-fit">
          <MatchLine place={p} />
          <WhyChips place={p} className="xrow-whychips" />
        </span>
        <RowFormation cost={p.cost} t={t} figRef={figRef} />
      </a>
      {onToggleFav && (
        <SaveButton fav={fav} onToggle={() => onToggleFav(p.id)} t={t} name={p.city} className="xrow-save" />
      )}
      {children}
    </div>
  );
});
