/**
 * RegionPage: one region's record, full screen. The browsing unit between
 * "beach" and "country": a coastal stretch, a mountain range, or a NUTS2
 * region, composed from /region/{ID}.json exactly as the export wrote it.
 *
 *   editorial   seed picks a person vouched for, pinned first (empty until
 *               the layer briefs land, the slot ships now)
 *   rated       published rows, ranked; each carries its own score
 *   listed      rows that exist but are not scored. A DIFFERENT card, not a
 *               dimmer one: dashed border, a "not scored yet" chip where the
 *               score would sit, and one honest line about why it is shown.
 *   neighbours  "nothing here? try next door", straight from the wire
 *
 * Opening a card hands over to the layer's own page through the same
 * onOpenFeature callback DestinationPage uses, so a beach opened from the
 * Costa de la Luz page is the same beach page as everywhere else.
 *
 * Escape closes. Bound in the capture phase with stopPropagation, per the
 * escape-stack lesson: this page can sit over other overlays and the
 * topmost layer must eat the key.
 */
import React, { useEffect, useState } from 'react';
import { loadRegion, loadRegionIndex, regionShareUrl } from '../lib/regions.js';
import { useI18n } from '../i18n/index.jsx';

const KIND_KEY = {
  coast: 'region.kind.coast',
  range: 'region.kind.range',
  nuts2: 'region.kind.nuts2',
};

const LAYER_TO_FEATURE = {
  beach: 'beaches',
  lake: 'lakes',
  mountain: 'mountains',
  trail: 'trails',
};

function cardImage(card) {
  const img = (card.images && card.images[0] && card.images[0].u) || card.img;
  return typeof img === 'string' && img.startsWith('https://') ? img : null;
}

function Card({ card, listed, t, onOpen }) {
  const img = cardImage(card);
  const score = typeof card.score === 'number' ? card.score
    : typeof card.rating === 'number' ? card.rating : null;
  return (
    <button
      className={`rgnp-card${listed ? ' rgnp-listed' : ''}`}
      onClick={() => onOpen(card)}
    >
      {img
        ? <img src={img} alt="" loading="lazy" />
        : <span className="rgnp-card-noimg" aria-hidden="true" />}
      <span>
        <span className="rgnp-card-name">{card.name}</span>
        <br />
        {listed
          ? <span className="rgnp-listed-chip">{t('region.listedChip')}</span>
          : (
            <span className="rgnp-card-sub">
              {score != null ? score.toFixed(1) : ''}
              {card.region ? `  ${card.region}` : ''}
            </span>
          )}
      </span>
    </button>
  );
}

export function RegionPage({ id, onClose, onOpenFeature, onOpenRegion }) {
  const { t } = useI18n();
  const [data, setData] = useState(undefined);
  const [names, setNames] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let on = true;
    setData(undefined);
    loadRegion(id).then((d) => { if (on) setData(d); });
    loadRegionIndex().then((ix) => { if (on && ix) setNames(ix.byId); });
    return () => { on = false; };
  }, [id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const open = (card) => {
    const feature = LAYER_TO_FEATURE[card.layer];
    if (feature && onOpenFeature) {
      onOpenFeature(feature, { id: card.id, cc: card.cc || card.country });
    }
  };

  const share = () => {
    try {
      navigator.clipboard.writeText(regionShareUrl(id));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard refused; the button just stays */ }
  };

  if (data === null) {
    // The id resolves to nothing published. Close rather than show a shell.
    return (
      <div className="rgnp">
        <div className="rgnp-inner">
          <button className="rgnp-back" onClick={onClose}>{'←'} {t('places.clearNear')}</button>
        </div>
      </div>
    );
  }

  const region = data?.region;
  return (
    <div className="rgnp" role="dialog" aria-modal="true">
      <div className="rgnp-inner">
        <button className="rgnp-back" onClick={onClose} aria-label="close">
          {'←'}
        </button>
        {region && (
          <>
            <div className="rgnp-kind">
              {t(KIND_KEY[region.kind] || 'region.kind.nuts2')}
              {region.country ? `, ${region.country}` : ''}
            </div>
            <h1>{region.name}</h1>
            <button className="rgnp-back" onClick={share}>
              {copied ? t('region.shareDone') : t('region.share')}
            </button>

            {data.editorial?.length > 0 && (
              <div className="rgnp-list">
                {data.editorial.map((card) => (
                  <Card key={`e-${card.layer}-${card.id}`} card={card}
                        listed={false} t={t} onOpen={open} />
                ))}
              </div>
            )}

            {data.rated?.length > 0 && (
              <>
                <p className="rgnp-sect">{t('region.ratedHead')}</p>
                <div className="rgnp-list">
                  {data.rated.map((card) => (
                    <Card key={`r-${card.layer}-${card.id}`} card={card}
                          listed={false} t={t} onOpen={open} />
                  ))}
                </div>
              </>
            )}

            {data.listed?.length > 0 && (
              <>
                <p className="rgnp-sect">{t('region.listedHead')}</p>
                <p className="rgnp-card-sub">{t('region.listedNote')}</p>
                <div className="rgnp-list">
                  {data.listed.map((card) => (
                    <Card key={`l-${card.layer}-${card.id}`} card={card}
                          listed t={t} onOpen={open} />
                  ))}
                </div>
              </>
            )}

            {data.neighbours?.length > 0 && (
              <>
                <p className="rgnp-sect">{t('region.neighboursHead')}</p>
                <div className="rgnp-neigh">
                  {data.neighbours.map((nid) => (
                    <button key={nid} onClick={() => onOpenRegion?.(nid)}>
                      {names?.get(nid)?.name || nid}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
