import React from 'react';
import { openShared } from '../lib/sharedElement.js';
import { HeroImage } from '../components/HeroImage.jsx';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { BookmarkIcon, BusIcon, CarIcon, TrainIcon } from '../components/Icons.jsx';
import { formatEst } from '../lib/money.js';
import { Card, IconButton } from '../components/ui/index.js';
import { PriceParts } from '../components/PriceParts.jsx';
import { useSettledFigure } from '../lib/figureChange.js';
import { countryName } from '../lib/countryName.js';
import { FlightChip } from '../components/flights/Flights.jsx';

/**
 * Explore's two card shapes (T427), built on the kit's parts: the Score,
 * <Money>, the photo IconButton and the row and tile proportions of the kit
 * Card. They stay their own components because Explore's card also carries
 * the shared-element open, the desktop hover preview and the map-list ring,
 * which the generic Card has no slot for.
 *
 *   PlaceTile  a rail tile: the kit Card (layout tile), a 4:3 photograph
 *              with only the save control over it, then the name, the
 *              country, and the price beside the Score.
 *   DayPrice   the one price line (T590, owner decision 5): PriceParts
 *              inline, the day cost a person at the traveller's Lifestyle
 *              (costIndex.js) as the strong figure, then the way there
 *              (the cheapest return flight for the travel month, T518, or
 *              the train, bus or car the settings line asks for, T582,
 *              `cost.way`, set by ExploreTab), the bed and the food and
 *              drink, each an icon and a whole-euro figure. An estimate
 *              carries the tilde alone (owner decision 4). No source words,
 *              no gauge (owner, 2026-10-13).
 */

export function DayPrice({ cost, t }) {
  const ref = React.useRef(null);
  useSettledFigure(ref, cost?.dayEur ?? null);
  // .xprice stays on the root: the harnesses and the tile's price slot read it.
  return <PriceParts cost={cost} t={t} className="xprice" figRef={ref} />;
}

const WAY_ICONS = { train: TrainIcon, bus: BusIcon, car: CarIcon };

/** How a card gets there (T582): the flight with its airline's mark, or a
 *  train, bus or car journey as an estimate, return a person. */
export function WayChip({ way, t }) {
  if (!way || !(way.perPerson > 0)) return null;
  if (way.mode === 'plane') return <FlightChip perSeat={way.perPerson} airline={way.airline} />;
  const Icon = WAY_ICONS[way.mode];
  return (
    <span className="flt-chip way-chip">
      {Icon && <Icon size={16} className="way-chip-icon" />}
      <span className="flt-chip-text money">
        {t(`way.${way.mode}From`, { price: formatEst(way.perPerson, t('money.est')) })}
      </span>
    </span>
  );
}

/** The save control, the same on a tile and a row: a bookmark, like My trips
 *  in the nav (a star would sit beside the rating's star and read as one). */
export function SaveButton({ fav, onToggle, t, tone = 'plain', className = '', name = '' }) {
  // The place's name is in the label (T444): a screen reader walking a rail
  // heard "Add to shortlist" twenty times with no place.
  const label = name
    ? t(fav ? 'explore.unsaveNamed' : 'explore.saveNamed', { place: name })
    : (fav ? t('results.removeShortlist') : t('results.addShortlist'));
  return (
    <IconButton
      tone={tone}
      className={className}
      pressed={fav}
      label={label}
      onClick={onToggle}
    >
      <BookmarkIcon size={18} />
    </IconButton>
  );
}

export function PlaceTile({ p, onSelect, fav, onToggleFav, t }) {
  return (
    <Card
      layout="tile"
      className="xtile"
      media={(
        <HeroImage url={p.image} city={p.city} iso2={p.iso2}
          className="xtile-img" maxWidth={640}
          sizes="(max-width: 768px) 78vw, 280px" ratio={[4, 3]} />
      )}
      title={p.city}
      href={`#dest=${encodeURIComponent(p.id)}`}
      onOpen={(e) => {
        // A real link (T444): a plain click opens the place here, a
        // modifier click lets the browser open it in a new tab.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        openShared(e.currentTarget.closest('.card'), p.id, () => onSelect(p.id));
      }}
      meta={(
        <span className="xtile-meta">
          <CountryFlag country={p.iso2} size={12} />
          <span>{countryName(p.iso2, p.country)}</span>
          {p.rating?.hidden_gem && <HiddenGemTag />}
        </span>
      )}
      price={<DayPrice cost={p.cost} t={t} />}
      rating={<ScoreChip rating={p.rating} size="sm" />}
      actions={onToggleFav ? (
        <SaveButton fav={fav} onToggle={() => onToggleFav(p.id)} t={t} tone="photo" name={p.city} />
      ) : null}
    />
  );
}
