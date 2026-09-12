import React from 'react';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { tileUrl } from '../lib/mapTile.js';
import {
  BootIcon, BikeIcon, MountainIcon, LakeIcon, BeachIcon, TreeIcon, StarIcon,
} from '../components/Icons.jsx';

/**
 * Around here: the outdoors inventory of one destination.
 *
 * Two data blocks feed it, both built by pipeline/dossier/build_dossier.py:
 *   nearby  the shortlist (a radius by place class, tier first, a photograph
 *           ranked above a bare name) - the "top picks" tab
 *   around  everything published within 20 km per layer, best first, with the
 *           full count so the tab can say "34 trails" while listing 24
 *
 * One section instead of two because the same trail would otherwise appear
 * in "nature close by" and again in "within 20 km". Every row is a button
 * that opens the layer's own page (trail, cycling route, peak, lake, beach),
 * and every row carries a picture: the Commons photograph where the wire has
 * one, a basemap tile centred on the feature where it does not.
 */

export const LAYER_ICON = {
  trails: BootIcon, cycling: BikeIcon, mountains: MountainIcon,
  lakes: LakeIcon, beaches: BeachIcon,
};
const LAYER_ORDER = ['trails', 'cycling', 'mountains', 'lakes', 'beaches'];
const PAGE = 6;

const fmtKm = (km) => (km < 0.95 ? `${Math.round((km * 1000) / 10) * 10} m` : `${Math.round(km)} km`);

/** A photograph that falls back to a map tile, never to a broken image. */
export function FeaturePhoto({ src, lat, lon, alt = '', className = '' }) {
  const [failed, setFailed] = React.useState(false);
  const tile = tileUrl(lat, lon, 12);
  const url = !failed && src ? src : tile;
  if (!url) return <span className={`${className} is-blank`}><TreeIcon size={14} /></span>;
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={`${className} ${!failed && src ? '' : 'is-tile'}`}
      onError={() => { if (!failed && src) setFailed(true); }}
    />
  );
}

function rowMeta(row, layer, t) {
  const bits = [];
  if (layer === 'trails' || layer === 'cycling') {
    if (row.km_len != null) bits.push(`${Math.round(row.km_len)} km`);
    if (row.ascent_m != null) bits.push(`${Math.round(row.ascent_m)} m up`);
    if (row.difficulty) bits.push(t(`dest.diff.${row.difficulty}`));
  } else if (layer === 'mountains') {
    if (row.elev_m != null) bits.push(`${Math.round(row.elev_m)} m`);
  } else if (layer === 'lakes' || layer === 'beaches') {
    if (row.water) bits.push(row.water);
  }
  return bits;
}

export function summaryOf(around, t) {
  if (!around?.counts) return '';
  return LAYER_ORDER
    .filter((l) => around.counts[l])
    .map((l) => t(`dest.layerN.${l}`, { n: around.counts[l] }))
    .join(', ');
}

export function AroundHere({ city, nearby, around, t, onOpenFeature, onShowMap }) {
  const picks = React.useMemo(() => LAYER_ORDER
    .flatMap((layer) => ((nearby || {})[layer] || []).slice(0, 3).map((f) => ({ ...f, layer })))
    .sort((a, b) => (b.tier || 0) - (a.tier || 0) || (b.score || 0) - (a.score || 0)), [nearby]);
  const layers = LAYER_ORDER.filter((l) => (around?.[l] || []).length > 0);
  const tabs = [
    ...(picks.length ? [{ key: 'picks', label: t('dest.aroundPicks'), n: picks.length }] : []),
    ...layers.map((l) => ({ key: l, label: t(`dest.layerKind.${l}`), n: around.counts?.[l] || around[l].length })),
  ];
  const [tab, setTab] = React.useState(tabs[0]?.key || null);
  const [all, setAll] = React.useState(false);
  React.useEffect(() => { setTab(tabs[0]?.key || null); setAll(false); }, [city]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!tabs.length) return null;

  const rows = tab === 'picks' ? picks : (around?.[tab] || []).map((r) => ({ ...r, layer: tab }));
  const shown = all ? rows : rows.slice(0, PAGE);
  const radius = around?.radius_km || 20;

  return (
    <div className="dar">
      <div className="dar-tabs" role="tablist" aria-label={t('dest.aroundTitle', { city })}>
        {tabs.map((tb) => {
          const Icon = tb.key === 'picks' ? StarIcon : LAYER_ICON[tb.key];
          return (
            <button
              key={tb.key}
              type="button"
              role="tab"
              aria-selected={tab === tb.key}
              className={`dar-tab ${tab === tb.key ? 'on' : ''}`}
              onClick={() => { setTab(tb.key); setAll(false); }}
            >
              {Icon && <Icon size={13} />}
              <span>{tb.label}</span>
              <span className="mono">{tb.n}</span>
            </button>
          );
        })}
      </div>
      <p className="dar-note">
        {tab === 'picks'
          ? t('dest.aroundPicksNote')
          : t('dest.aroundRadius', { km: radius, n: around.counts?.[tab] || rows.length })}
        {onShowMap && (
          <button type="button" className="dar-map" onClick={() => onShowMap(tab === 'picks' ? 'nearby' : 'around')}>
            {t('dest.tripsOnMap')}
          </button>
        )}
      </p>
      <ul className="dar-list">
        {shown.map((row) => {
          const Icon = LAYER_ICON[row.layer];
          const rating = row.score != null ? { score: row.score, tier: row.tier ?? 0 } : null;
          const meta = rowMeta(row, row.layer, t);
          return (
            <li key={`${row.layer}|${row.id}`}>
              <button
                type="button"
                className="dar-row"
                onClick={() => onOpenFeature?.(row.layer, row)}
                disabled={!onOpenFeature}
              >
                <FeaturePhoto src={row.thumb} lat={row.lat} lon={row.lon} className="dar-photo" />
                <span className="dar-main">
                  <span className="dar-name">{row.name}</span>
                  <span className="dar-sub">
                    {Icon && <Icon size={11} />}
                    <span>{t(`dest.layerKind.${row.layer}`)}</span>
                    {meta.map((m) => <span key={m} className="mono">{m}</span>)}
                  </span>
                </span>
                <span className="dar-right">
                  {rating && <ScoreChip rating={rating} size="sm" />}
                  <span className="dar-km mono">{fmtKm(row.km)} {row.bearing || ''}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {rows.length > PAGE && (
        <button type="button" className="dsec-more" onClick={() => setAll((v) => !v)}>
          {all ? t('dest.showLess') : t('dest.showAll', { n: rows.length })}
        </button>
      )}
    </div>
  );
}
