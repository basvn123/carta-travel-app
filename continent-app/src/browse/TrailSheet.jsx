import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { loadTrail } from '../lib/trails.js';
import { stopNameFromRef } from '../lib/trailCards.js';
import { eur } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';
import { CloseIcon } from '../components/Icons.jsx';
import { RatingBadge } from '../components/RatingBadge.jsx';
import { isNum } from '../map/coords.js';

/**
 * The trip detail sheet for the Destinations tab: the route on a real map,
 * the wire's own numbers, the elevation profile for a hike, the stop list for
 * a city day, and the reviewed description. Loaded lazily so maplibre stays
 * out of the main bundle; opened for both hikes and city days.
 *
 * The card's simplified line draws immediately; the full-resolution geometry
 * from /trails/trip/{id}.json replaces it as soon as it arrives.
 */

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

const hoursText = (min) => {
  const h = min / 60;
  return h >= 10 ? String(Math.round(h)) : h.toFixed(1);
};

/** MultiLineString coordinates with any non-finite point dropped. */
function cleanLines(geometry) {
  const coords = geometry?.coordinates;
  if (!Array.isArray(coords)) return [];
  const lines = geometry.type === 'LineString' ? [coords] : coords;
  return lines
    .map((line) => (Array.isArray(line)
      ? line.filter((pt) => Array.isArray(pt) && isNum(pt[0]) && isNum(pt[1]))
        .map((pt) => [pt[0], pt[1]])
      : []))
    .filter((line) => line.length > 1);
}

/** The elevation profile as a small instrument chart, numbers in mono. */
function ElevationChart({ elevation, t }) {
  const profile = elevation?.profile;
  if (!Array.isArray(profile) || profile.length < 2) return null;
  const W = 320, H = 76, PAD = 2;
  const dMax = profile[profile.length - 1][0] || 1;
  const eMin = elevation.ele_min_m ?? Math.min(...profile.map((p) => p[1]));
  const eMax = elevation.ele_max_m ?? Math.max(...profile.map((p) => p[1]));
  const span = Math.max(1, eMax - eMin);
  const pts = profile.map(([d, e]) => (
    `${(PAD + (d / dMax) * (W - 2 * PAD)).toFixed(1)},${(H - PAD - ((e - eMin) / span) * (H - 2 * PAD)).toFixed(1)}`
  ));
  return (
    <div className="tsheet-elev">
      <div className="tsheet-sec-title">{t('trails.elevTitle')}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="tsheet-elev-svg" role="img" aria-label={t('trails.elevTitle')}>
        <polyline
          points={`${PAD},${H - PAD} ${pts.join(' ')} ${W - PAD},${H - PAD}`}
          className="tsheet-elev-area"
        />
        <polyline points={pts.join(' ')} className="tsheet-elev-line" />
      </svg>
      <div className="tsheet-elev-axis">
        <span>{Math.round(eMin)} m</span>
        <span>{Math.round(eMax)} m {t('trails.elevMax')}</span>
      </div>
    </div>
  );
}

/** description_md is reviewed prose with light markdown; render it as plain
 *  paragraphs rather than shipping a markdown engine for bold marks. */
function descParagraphs(md) {
  return String(md || '')
    .split(/\n{2,}/)
    .map((p) => p.replace(/^#+\s*/gm, '').replace(/\*\*?/g, '').trim())
    .filter(Boolean);
}

export function TrailSheet({ card, onClose, onSelectDest }) {
  const { t } = useI18n();
  const { tr, assoc, kindKey, price } = card;
  const isCityDay = tr.category === 'citytrip';
  const [detail, setDetail] = useState(null);
  const mapEl = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let live = true;
    loadTrail(tr.id).then((d) => { if (live) setDetail(d); });
    return () => { live = false; };
  }, [tr.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The route map: simplified line at once, full-resolution once loaded.
  const lines = useMemo(
    () => cleanLines((detail || tr).geometry),
    [detail, tr],
  );

  useEffect(() => {
    if (mapRef.current || !mapEl.current) return undefined;
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: MAP_STYLE,
      center: [12, 48],
      zoom: 4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      map.addSource('trail', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [] } } });
      map.addLayer({
        id: 'trail-casing', type: 'line', source: 'trail',
        paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: 'trail-line', type: 'line', source: 'trail',
        paint: { 'line-color': '#c8501e', 'line-width': 3 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.resize();
      map._trailReady = true;
      map._draw?.();
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const draw = () => {
      map.getSource('trail')?.setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'MultiLineString', coordinates: lines },
      });
      const [w, s, e, n] = tr.bbox || [];
      if ([w, s, e, n].every(isNum)) {
        map.fitBounds([[w, s], [e, n]], { padding: 36, duration: 0, maxZoom: 14 });
      }
      if (lines.length) {
        const start = lines[0][0];
        if (!map._startMarker) {
          const el = document.createElement('span');
          el.className = 'tsheet-start-pin';
          map._startMarker = new maplibregl.Marker({ element: el }).setLngLat(start).addTo(map);
        } else {
          map._startMarker.setLngLat(start);
        }
      }
    };
    if (map._trailReady) draw();
    else map._draw = draw;
  }, [lines, tr.bbox]);

  const diffKey = tr.difficulty === 'easy' ? 'places.diffEasy'
    : tr.difficulty === 'moderate' ? 'places.diffModerate'
      : tr.difficulty === 'hard' ? 'places.diffHard' : null;
  const desc = descParagraphs(detail?.description_md || tr.summary);
  const stops = detail?.stops;

  return (
    <div className="tsheet-scrim" onClick={onClose}>
      <div
        className="tsheet"
        role="dialog"
        aria-modal="true"
        aria-label={tr.name}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tsheet-head">
          <div className="tsheet-head-main">
            <span className={`places-card-kind ${isCityDay ? 'city' : ''}`}>{t(kindKey)}</span>
            <h2 className="tsheet-title">{tr.name}</h2>
            <div className="tsheet-sub">
              {assoc.dest && <span>{assoc.dest.city}, {assoc.dest.country}</span>}
              {isCityDay && assoc.dest?.rating && (
                <RatingBadge rating={assoc.dest.rating} size="xs" showGem={false} />
              )}
            </div>
          </div>
          <button className="tsheet-close" onClick={onClose} aria-label={t('shape.close')}>
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="tsheet-body">
          <div className="tsheet-map" ref={mapEl} />

          <div className="tsheet-facts">
            {tr.distance_m != null && (
              <span>{(tr.distance_m / 1000).toFixed(1).replace(/\.0$/, '')} km</span>
            )}
            {tr.duration_min != null && <span>{hoursText(tr.duration_min)} h</span>}
            {(detail?.ascent_m ?? tr.ascent_m) != null && (
              <span>↑{Math.round(detail?.ascent_m ?? tr.ascent_m)} m</span>
            )}
            {detail?.descent_m != null && <span>↓{Math.round(detail.descent_m)} m</span>}
            {isCityDay && tr.n_stops != null && <span>{t('trails.stops', { n: tr.n_stops })}</span>}
            {diffKey && <span>{t(diffKey)}</span>}
          </div>

          {!isCityDay && detail?.elevation && <ElevationChart elevation={detail.elevation} t={t} />}

          {desc.length > 0 && (
            <div className="tsheet-desc">
              {desc.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          )}

          {Array.isArray(stops) && stops.length > 0 && (
            <div className="tsheet-stops">
              <div className="tsheet-sec-title">{t('trails.stopsTitle')}</div>
              <ol>
                {stops.map((s) => (
                  <li key={s.seq}>
                    <span className="tsheet-stop-name">{stopNameFromRef(s.poi_ref)}</span>
                    <span className="tsheet-stop-facts">
                      {s.dwell_min != null && <span>{t('trails.dwell', { min: s.dwell_min })}</span>}
                      {s.leg_duration_min != null && s.seq > 1 && (
                        <span>{t(s.leg_mode === 'transit' ? 'trails.legTransit' : 'trails.legWalk', { min: s.leg_duration_min })}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {isCityDay && assoc.destId && (
            <button className="tsheet-cta" onClick={() => onSelectDest(assoc.destId)}>
              {t('trails.openDest', { city: assoc.dest?.city || '' })}
              {price?.pp != null && (
                <span className="tsheet-cta-price">{t('places.fromPrice', { price: eur(price.pp) })}/pp</span>
              )}
            </button>
          )}

          <p className="tsheet-credit">{detail?.attribution_text || tr.attribution_text}</p>
        </div>
      </div>
    </div>
  );
}
