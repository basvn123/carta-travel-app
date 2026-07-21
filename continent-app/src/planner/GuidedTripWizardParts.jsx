import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { StarIcon, DiamondIcon, DotIcon, InfoIcon } from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { cityImage, flagUrl, isoToFlag, cityTier, cityInsight } from '../lib/tripGuide.js';
import { knownForFacts } from '../lib/knownFor.js';
import { haversineKm } from '../lib/runtime_pricing.js';

// Presentational pieces of the guided trip wizard (a nights helper + the city
// row and its bits), lifted out of GuidedTripWizard. Prop-driven, no closure.

export function suggestedNights(dest) {
  const score = dest?.rating?.score ?? dest?.beauty?.score ?? 0;
  const pois = dest?.activities?.items?.length || 0;
  if (score >= 8.8 && pois >= 10) return { n: 3, textKey: 'wizard.stay3Nights' };
  if (score >= 7.8 || pois >= 8) return { n: 2, textKey: 'wizard.stay2Nights' };
  if (dest?.tier === 'gem') return { n: 1, textKey: 'wizard.stay1NightGem' };
  return { n: 1, textKey: 'wizard.stay1Night' };
}

// Real flag artwork (falls back to the emoji/letters if the image can't load).
export function Flag({ iso2, className }) {
  const url = flagUrl(iso2, 40);
  if (!url) return <span className={className}>{isoToFlag(iso2)}</span>;
  return (
    <img
      className={className}
      src={url}
      srcSet={`${flagUrl(iso2, 80)} 2x`}
      alt=""
      loading="lazy"
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

// A city's Wikipedia photo as a rounded thumbnail, with a lettered fallback
// when there's no image (mirrors the suggestion/nearby cards elsewhere).
export function CityThumb({ dest, className }) {
  const url = cityImage(dest);
  return (
    <div className={className} style={url ? { backgroundImage: `url(${url})` } : undefined}>
      {!url && <span className="guide-thumb-fallback">{dest?.city?.slice(0, 1) || '?'}</span>}
    </div>
  );
}

/** The worth-a-visit chip: colour-tiered so the genuinely special stops leap
 *  out of a long city list. */
export function TierChip({ dest }) {
  const t = cityTier(dest);
  if (t.key === 'ok') return null;
  return (
    <span className={`guide-tier guide-tier-${t.key}`}>
      {t.key === 'top' && <StarIcon size={9} />}
      {t.key === 'great' && <DiamondIcon size={9} />}
      {t.key === 'good' && <DotIcon size={8} />}
      {t.label}
    </span>
  );
}

/** One stay-city row: photo, name + tier + what it's known for, an info
 *  toggle with structured facts, and the nights stepper. */
export function StayRow({ id, dest, nights, onNights, anchorDest, isAnchor, companions }) {
  const { t } = useI18n();
  const [infoOpen, setInfoOpen] = useState(false);
  const km = anchorDest && anchorDest.lat != null && dest.lat != null && !isAnchor
    ? Math.round(haversineKm(anchorDest.lat, anchorDest.lon, dest.lat, dest.lon))
    : null;
  const n = nights || 0;
  return (
    <div className={`guide-city ${n > 0 ? 'on' : ''}`}>
      <CityThumb dest={dest} className="guide-city-thumb" />
      <div className="guide-city-info">
        <div className="guide-city-name">
          {dest.city}
          {isAnchor && <span className="guide-anchor-badge"><PlaneIcon size={9} /> {t('wizard.youLandHere')}</span>}
          <TierChip dest={dest} />
          {dest.rating?.score != null && <ScoreChip rating={dest.rating} size="xs" />}
          {dest.rating?.hidden_gem && <HiddenGemTag />}
          <button
            className={`guide-city-info-btn ${infoOpen ? 'open' : ''}`}
            onClick={() => setInfoOpen(!infoOpen)}
            aria-expanded={infoOpen}
            title={t('wizard.aboutCity', { city: dest.city })}
          ><InfoIcon size={12} /></button>
        </div>
        <div className="guide-city-insight">
          {km != null ? `${t('wizard.kmFromArrival', { km })} ` : ''}{cityInsight(dest)}
        </div>
        {infoOpen && (
          <div className="guide-city-facts">
            {knownForFacts(dest).map(([label, value]) => (
              <div className={`guide-city-fact ${label === 'Known for' ? 'guide-city-fact-known' : ''}`} key={label}>
                <span className="guide-city-fact-label">{label}</span>
                <span className="guide-city-fact-value">{value}</span>
              </div>
            ))}
          </div>
        )}
        {n > 0 && companions && companions.length > 0 && (
          <div className="guide-city-combo">
            {t('wizard.pairsWellWith')} {companions.map((c, i) => (
              <span key={c.id}>{i > 0 && ' & '}<b>{c.dest.city}</b> ({c.km} km)</span>
            ))}
          </div>
        )}
      </div>
      <div className="guide-nights">
        <button onClick={() => onNights(id, n - 1)} disabled={n <= 0} aria-label={t('wizard.fewerNights')}>-</button>
        <span className="guide-nights-val">
          {n === 0 ? <span className="guide-nights-zero">{t('wizard.addNights')}</span> : <><b>{n}</b> {n === 1 ? t('wizard.night') : t('wizard.nights')}</>}
        </span>
        <button onClick={() => onNights(id, n + 1)} aria-label={t('wizard.moreNights')}>+</button>
      </div>
    </div>
  );
}
