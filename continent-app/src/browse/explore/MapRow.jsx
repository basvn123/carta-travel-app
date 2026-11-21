import React from 'react';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { localNameOf } from '../../lib/search/localNames.js';
import { useI18n } from '../../i18n/index.jsx';
import { useSettledFigure } from '../../lib/figureChange.js';
import { SaveButton } from '../ExploreCards.jsx';
import { PICKS } from '../filters/filterModel.js';
import { PlaceScore, PlaceFigure } from './HouseParts.jsx';
import { WhereLine } from './PlaceRow.jsx';
import { MatchMark } from './MatchMark.jsx';

/**
 * A place on the map's list (G12 map view round 2, proposal.md section 3):
 * the sheet's rows, the desktop column, the tap card. One layout at every
 * width, three lines beside a 112 x 96 photo (128 x 96 in the desktop
 * column), so nothing is ever cut:
 *
 *   1  the name, wrapping, with the Score plate inline after its last word
 *   2  the flag, the region and the country, the water (a house icon and
 *      "By the sea"), the hidden gem and the best value in view
 *   3  the figure with its short basis (the receipt's button; the head
 *      says the basis in full) and the match mark at the line's end, level
 *      with the figure: the basis wraps inside the button before the mark
 *      ever drops, so every row keeps one height (judgement-4)
 *
 * The name is the row's link, stretched over the row; the figure, the mark
 * and Save are buttons beside it, never inside it. The match sentence and
 * the best-months line of the list row are not drawn here (the mark
 * explains itself).
 */
export const MapRow = React.memo(function MapRow({
  p, region = null, rating = null, fav = false, onToggleFav = null, onOpen, t,
  selected = false, linked = false, best = false, className = '', rootProps = null, hitProps = null,
  photoW = 112,
}) {
  const { lang } = useI18n();
  const name = localNameOf(p.id, lang) || p.city;
  const score = rating || p.rating;
  const figRef = React.useRef(null);
  useSettledFigure(figRef, p.cost?.dayEur ?? null);
  const water = PICKS.sea.test(p) ? 'filters.sea' : PICKS.lake.test(p) ? 'filters.lake' : null;
  return (
    <div className={`xrow xmr${selected ? ' is-selected' : ''}${linked ? ' is-linked' : ''}${className ? ` ${className}` : ''}`}
      data-id={p.id} style={{ '--xmr-w': `${photoW}px` }} {...rootProps}>
      <span className="xmr-media" aria-hidden="true">
        <HeroImage url={p.image} image={p.photo} city={p.city} iso2={p.iso2} className="xmr-img"
          maxWidth={320} sizes={`${photoW}px`} ratio={[photoW, 96]} />
      </span>
      <div className="xmr-text">
        <p className="xmr-l1">
          <a className="xmr-hit xrow-name" href={`#dest=${encodeURIComponent(p.id)}`}
            aria-current={selected ? 'true' : undefined}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              onOpen?.(e);
            }} {...hitProps}>{name}</a>
          {' '}
          <PlaceScore rating={score} className="xmr-score" />
        </p>
        <p className="xmr-l2">
          <CountryFlag country={p.iso2} size={12} />
          <WhereLine p={p} region={region} t={t} />
          {water && (
            <span className="xmr-facet"><HouseIcon.water size={14} />{t(water)}</span>
          )}
          {p.rating?.hidden_gem && <span className="hs-gem xrow-gem">{t('common.hiddenGem')}</span>}
          {best && <span className="xmr-best"><span className="xmap-best-dot" aria-hidden="true" />{t('explore.map.bestValue')}</span>}
        </p>
        <div className="xmr-l3">
          <PlaceFigure place={p} t={t} figRef={figRef} className="xmr-fig" short />
          <MatchMark place={p} className="xmr-match" />
        </div>
      </div>
      {onToggleFav && (
        <SaveButton fav={fav} onToggle={() => onToggleFav(p.id)} t={t} name={name} className="xrow-save xmr-save" />
      )}
    </div>
  );
});
