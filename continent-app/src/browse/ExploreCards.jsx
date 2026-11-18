import React from 'react';
import { openShared } from '../lib/sharedElement.js';
import { HeroImage } from '../components/HeroImage.jsx';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { MatchLine } from './WhyItMatches.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { BusIcon, CarIcon, TrainIcon } from '../components/Icons.jsx';
import { HouseIcon } from '../components/HouseIcons.jsx';
import { haptic } from '../lib/haptics.js';
import { formatEst } from '../lib/money.js';
import { Card, IconButton } from '../components/ui/index.js';
import { PriceParts } from '../components/PriceParts.jsx';
import { FriendCardLine } from '../together/signals.jsx';
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

// G12 (explore polish, point 4): the first save in a session shows where
// saved places go, once: the My trips mark in the nav bumps. Module state,
// because "once a session" outlives any one button.
let tripsBumped = false;
function bumpTripsOnce() {
  if (tripsBumped || typeof document === 'undefined') return;
  tripsBumped = true;
  const marks = document.querySelectorAll('[data-nav="trips"] .hs-icon');
  marks.forEach((el) => el.classList.add('hs-nav-bump'));
  // A timer, not animationend: the nav copy hidden at this width never
  // animates, so it would keep the class.
  setTimeout(() => marks.forEach((el) => el.classList.remove('hs-nav-bump')), 400);
}

/** The save control, the same on a tile and a row: the bookmark (G12). The
 *  ticket stays the My trips mark only, so one glyph means one thing. */
export function SaveButton({ fav, onToggle, t, tone = 'plain', className = '', name = '', word = false }) {
  // The place's name is in the label (T444): a screen reader walking a rail
  // heard "Add to shortlist" twenty times with no place. The name stays the
  // same whether saved or not (decision change 7): aria-pressed says which,
  // so the control does not rename itself under the reader.
  const label = name ? t('explore.saveNamed', { place: name }) : t('results.addShortlist');
  // The tick and its ring play only on the traveller's own save, never when
  // a saved place first paints, and not on an unsave.
  const [ticked, setTicked] = React.useState(false);
  return (
    <IconButton
      tone={tone}
      className={`xsave${word ? ' has-word' : ''}${ticked && fav ? ' is-ticking' : ''}${className ? ` ${className}` : ''}`}
      pressed={fav}
      label={label}
      // The commit's haptic (house style 2026-11): confirm on a save, a tick
      // on an unsave; haptic() itself plays only after a touch, behind the
      // traveller's setting and never under reduced motion.
      onClick={() => { setTicked(true); onToggle(); haptic(fav ? 'tick' : 'confirm'); if (!fav) bumpTripsOnce(); }}
      onAnimationEnd={() => setTicked(false)}
    >
      <HouseIcon.bookmark size={20} />
      {/* copy.md explore.save: a visible word from 1100 px (CSS shows it),
          for readers who do not know the bookmark yet. The fixed name
          above stays the accessible name; the word is decoration. */}
      {word && <span className="xsave-word">{fav ? t('detail.saved') : t('explore.save')}</span>}
    </IconButton>
  );
}

export function PlaceTile({ p, onSelect, fav, onToggleFav, t }) {
  return (
    <Card
      layout="tile"
      className="xtile"
      media={(
        <HeroImage url={p.image} image={p.photo} city={p.city} iso2={p.iso2}
          className="xtile-img" maxWidth={960}
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
        <>
          <span className="xtile-meta">
            <CountryFlag country={p.iso2} size={12} />
            <span>{countryName(p.iso2, p.country)}</span>
            {p.rating?.hidden_gem && <HiddenGemTag />}
          </span>
          {/* T765: "86% match: hiking, quiet", from 55% up, beside the Score. */}
          <MatchLine place={p} />
        </>
      )}
      // G12, D10 (owner, 2026-11-17): no note line under the price on an
      // Explore card; what the price leaves out opens from the figure.
      price={<><DayPrice cost={p.cost} t={t} /><FriendCardLine destId={p.id} /></>}
      rating={<ScoreChip rating={p.rating} size="sm" />}
      actions={onToggleFav ? (
        <SaveButton fav={fav} onToggle={() => onToggleFav(p.id)} t={t} tone="photo" name={p.city} />
      ) : null}
    />
  );
}
