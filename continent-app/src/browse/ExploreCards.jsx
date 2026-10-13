import React from 'react';
import { openShared } from '../lib/sharedElement.js';
import { HeroImage } from '../components/HeroImage.jsx';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { BookmarkIcon } from '../components/Icons.jsx';
import { Card, IconButton, Money } from '../components/ui/index.js';
import { isNational } from '../components/CostSummary.jsx';
import { useSettledFigure } from '../lib/figureChange.js';

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
 *   DayPrice   the one price line: the day cost per person at the
 *              traveller's Lifestyle (costIndex.js), whole euros, with the
 *              estimate mark only when the figure is a stand-in. No source
 *              words, no gauge (owner, 2026-10-13).
 */

export function DayPrice({ cost, t }) {
  const ref = React.useRef(null);
  useSettledFigure(ref, cost?.dayEur ?? null);
  if (!cost || cost.dayEur == null) return null;
  return (
    <span className="xprice" ref={ref}>
      <Money value={cost.dayEur} est={isNational(cost)} />
      <span className="xprice-unit"> {t('cost.perDay')}</span>
    </span>
  );
}

/** The save control, the same on a tile and a row: a bookmark, like My trips
 *  in the nav (a star would sit beside the rating's star and read as one). */
export function SaveButton({ fav, onToggle, t, tone = 'plain', className = '' }) {
  return (
    <IconButton
      tone={tone}
      className={className}
      pressed={fav}
      label={fav ? t('results.removeShortlist') : t('results.addShortlist')}
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
      onOpen={(e) => openShared(e.currentTarget.closest('.card'), p.id, () => onSelect(p.id))}
      meta={(
        <span className="xtile-meta">
          <CountryFlag country={p.iso2} size={12} />
          <span>{p.country}</span>
          {p.rating?.hidden_gem && <HiddenGemTag />}
        </span>
      )}
      price={<DayPrice cost={p.cost} t={t} />}
      rating={<ScoreChip rating={p.rating} size="sm" />}
      actions={onToggleFav ? (
        <SaveButton fav={fav} onToggle={() => onToggleFav(p.id)} t={t} tone="photo" />
      ) : null}
    />
  );
}
