import React from 'react';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { localNameOf } from '../../lib/search/localNames.js';
import { useI18n } from '../../i18n/index.jsx';
import { SaveButton } from '../ExploreCards.jsx';
import { PlaceScore, PlaceFigure } from './HouseParts.jsx';
import { WhereLine } from './PlaceRow.jsx';
import { MatchMark } from './MatchMark.jsx';

/**
 * The picked place beside its pin on a tablet or desktop (G12 map view round
 * 2, proposal.md section 8): a 320 px card (288 at 1180) with a 16:9 photo,
 * Save and Close on it, the name with its Score, the flag and the region
 * with the match mark, the figure over its basis (the receipt's button).
 * The name opens the place; Close, Escape or a click on the open map put it
 * away. ExploreMap hangs it on the pin (a MapLibre marker), so it follows a
 * pan with the map, never with a re-render.
 */
export function MapAnchorCard({ p, overview, fav, onToggleFav, onOpen, onClose, t }) {
  const { lang } = useI18n();
  const name = localNameOf(p.id, lang) || p.city;
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="xmap-anchor-card" role="group" aria-label={name}
      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <span className="xac-media">
        <HeroImage url={p.image} image={p.photo} city={p.city} iso2={p.iso2} className="xac-img"
          maxWidth={640} sizes="320px" ratio={[16, 9]} />
        <Pressable className="xac-close" aria-label={t('explore.map.close')} onClick={onClose}>
          <HouseIcon.close size={16} />
        </Pressable>
        {onToggleFav && (
          <SaveButton fav={fav} onToggle={() => onToggleFav(p.id)} t={t} name={name} tone="photo" className="xac-save" />
        )}
      </span>
      <div className="xac-text">
        <p className="xtc-l1">
          <a className="xac-hit xrow-name" href={`#dest=${encodeURIComponent(p.id)}`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              onOpen(p.id);
            }}>{name}</a>
          {' '}
          <PlaceScore rating={overview?.rating || p.rating} />
        </p>
        <p className="xtc-l2">
          <CountryFlag country={p.iso2} size={12} />
          <WhereLine p={p} region={overview?.region || null} t={t} />
          <MatchMark place={p} />
        </p>
        <div className="xtc-l3">
          <PlaceFigure place={p} t={t} className="xtc-fig" />
        </div>
      </div>
    </div>
  );
}
