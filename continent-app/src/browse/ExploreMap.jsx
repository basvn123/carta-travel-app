import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { kindOf } from '../lib/taxonomy.js';
import { thumbAt } from '../lib/heroImage.js';
import { knownFor } from '../lib/knownFor.js';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

/**
 * The Explore map (PLAN.md C7): the same list, spatially.
 *
 * One GeoJSON source and circle layers, not 3,038 DOM markers - that is the
 * difference between 60 fps and a slideshow. The encoding is the one the
 * cards already taught: SIZE is kind (a metro draws bigger than a village),
 * FILL is verdict (the rating's ochre, filled for the top tier, pale for a
 * visit, grey for no label). Clusters below zoom 6, per the spec.
 *
 * Colours are literals mirroring the :root tokens (--rate, --rate-bg,
 * --gem-ink): a map style sheet cannot read CSS custom properties, the same
 * trade every other map in the app makes.
 *
 * Hovering previews the place in a popup; clicking opens it. Panning calls
 * onViewport(bounds) so ExploreTab can narrow the count to what is on
 * screen - the map IS the filter while it is the view.
 *
 * Two changes in P4.5. The source is built ONCE from the whole catalogue and
 * the filter is a maplibre expression over an id set, so narrowing the grid
 * no longer re-serialises up to 3,868 features through setData on every
 * keystroke - it sets a filter, which the GPU applies to tiles it already
 * has. And zoomed in past the clusters, a pin is worth more than a name: at
 * zoom >= 8 the popup becomes a small card with the photograph, the rating
 * and a line of what the place is known for.
 */

const KIND_RADIUS = { metro: 9, city: 7, area: 7, town: 5.5, village: 4.5 };
const TIER_FILL = ['match', ['get', 'tier'],
  3, '#8f5a0c', // --rate
  2, '#c08a2e',
  1, '#eddbb6',
  /* 0 */ '#b9b4a5'];

// Where a pin stops being a dot and starts being a card.
const CARD_FROM = 8;
// Above this the source draws individual pins, so a filter expression is
// the whole story; below it the clusters carry counts that must be true.
const CLUSTER_TO = 6;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function ExploreMap({ rows, all, onSelect, onViewport, t }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const popupRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onViewportRef = useRef(onViewport);
  onViewportRef.current = onViewport;

  // The whole catalogue, serialised once. `all` is the unfiltered set; when
  // a caller does not pass one, the current rows stand in and the map
  // behaves exactly as it did before.
  const source = all || rows;
  const geojson = React.useMemo(() => ({
    type: 'FeatureCollection',
    features: source
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.city_lon ?? p.lon, p.city_lat ?? p.lat] },
        properties: {
          id: p.id,
          city: p.city,
          country: p.country,
          tier: p.rating?.tier ?? 0,
          score: p.rating?.score ?? null,
          gem: p.rating?.hidden_gem ? 1 : 0,
          r: KIND_RADIUS[kindOf(p)] || 5.5,
          img: p.image?.url || p.image || '',
          lead: knownFor(p) || '',
        },
      })),
  }), [source]);

  // What survives the filters, as an expression rather than a new payload.
  // `null` means "everything", which is also what an absent `all` means.
  const keepIds = React.useMemo(() => {
    if (!all || rows === all) return null;
    return rows.map((p) => p.id);
  }, [rows, all]);

  // Which destination the open popup is a CARD for, or null when the popup
  // is the plain name tip (or closed). The distinction decides whether
  // leaving the pin dismisses it.
  const cardRef = useRef(null);
  // Set when a filter changed while the map was zoomed in past the
  // clusters, so the cluster counts are rebuilt when it comes back down.
  const clusterDirtyRef = useRef(false);
  const applyFilterRef = useRef(null);

  const popHelpers = React.useMemo(() => {
    const closePop = () => {
      popupRef.current?.remove();
      popupRef.current = null;
      cardRef.current = null;
    };
    const popup = (map) => {
      if (!popupRef.current) {
        popupRef.current = new maplibregl.Popup({
          closeButton: false, closeOnClick: false, offset: 14, maxWidth: 'none',
        });
        popupRef.current.on('close', () => { cardRef.current = null; });
      }
      return popupRef.current.addTo(map);
    };
    const showTip = (map, f) => {
      const { city, country, score, tier } = f.properties;
      const html = `<div class="xmap-pop"><strong>${esc(city)}</strong>`
        + (score != null ? `<span class="xmap-pop-score rt-${tier}">${Number(score).toFixed(1)}</span>` : '')
        + `<br><span class="xmap-pop-sub">${esc(country)}</span></div>`;
      cardRef.current = null;
      popup(map).setLngLat(f.geometry.coordinates).setHTML(html);
    };
    const showCard = (map, f) => {
      const { id, city, country, score, tier, img, lead } = f.properties;
      const thumb = img ? thumbAt(img, 250) : '';
      const html = `<button type="button" class="xmap-card-hit" data-id="${esc(id)}">`
        + '<div class="xmap-card">'
        + (thumb ? `<img class="xmap-card-img" src="${esc(thumb)}" alt="" loading="lazy">` : '')
        + '<div class="xmap-card-body"><div class="xmap-card-head">'
        + `<span class="xmap-card-name">${esc(city)}</span>`
        + (score != null ? `<span class="xmap-card-score rt-${tier}">${Number(score).toFixed(1)}</span>` : '')
        + '</div>'
        + `<p class="xmap-card-sub">${esc(country)}</p>`
        + (lead ? `<p class="xmap-card-lead">${esc(lead)}</p>` : '')
        + '</div></div></button>';
      cardRef.current = id;
      const p = popup(map).setLngLat(f.geometry.coordinates).setHTML(html);
      // The card is a button: clicking anywhere on it opens the place.
      p.getElement()?.querySelector('.xmap-card-hit')
        ?.addEventListener('click', () => onSelectRef.current?.(id));
    };
    return { closePop, showTip, showCard };
  }, []);
  const { closePop, showTip, showCard } = popHelpers;

  useEffect(() => {
    if (mapRef.current) return undefined;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [10, 49],
      zoom: 3.7,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('dests', {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterMaxZoom: 5,       // clusters below zoom 6
        clusterRadius: 44,
      });
      map.addLayer({
        id: 'clusters', type: 'circle', source: 'dests',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#efece2',
          'circle-stroke-color': '#8f5a0c',
          'circle-stroke-width': 1.5,
          'circle-radius': ['step', ['get', 'point_count'], 14, 25, 18, 100, 24],
        },
      });
      map.addLayer({
        id: 'cluster-count', type: 'symbol', source: 'dests',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 11,
          'text-font': ['Montserrat Medium', 'Open Sans Regular'],
        },
        paint: { 'text-color': '#0f172a' },
      });
      map.addLayer({
        id: 'dest-dots', type: 'circle', source: 'dests',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['get', 'r'],
          'circle-color': TIER_FILL,
          'circle-opacity': 0.92,
          'circle-stroke-width': ['case', ['==', ['get', 'gem'], 1], 2, 1],
          'circle-stroke-color': ['case', ['==', ['get', 'gem'], 1], '#2c6e63', '#ffffff'],
        },
      });

      map.on('click', 'clusters', async (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
        const zoom = await map.getSource('dests').getClusterExpansionZoom(f.properties.cluster_id);
        map.easeTo({ center: f.geometry.coordinates, zoom });
      });
      // A tap far in opens the card and waits (touch has no hover, and the
      // card is the thing worth reading); everywhere else, and on a second
      // tap of the same pin, the click opens the place.
      map.on('click', 'dest-dots', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = f.properties.id;
        if (map.getZoom() >= CARD_FROM && cardRef.current !== id) { showCard(map, f); return; }
        onSelectRef.current?.(id);
      });
      map.on('mouseenter', 'dest-dots', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'dest-dots', () => {
        map.getCanvas().style.cursor = '';
        // The card is hoverable (WCAG 1.4.13): travelling into it to read
        // the line or click it must not dismiss it, so only the plain name
        // tip closes on leaving the pin.
        if (!cardRef.current) closePop();
      });
      map.on('mousemove', 'dest-dots', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        if (map.getZoom() >= CARD_FROM) {
          if (cardRef.current !== f.properties.id) showCard(map, f);
        } else {
          showTip(map, f);
        }
      });
      map.on('zoomend', () => {
        // Zooming back out turns an open card back into the plain map.
        if (map.getZoom() < CARD_FROM && cardRef.current) closePop();
        // ...and, if the filters moved while we were in close, rebuilds the
        // cluster counts now that clusters are what the reader sees.
        if (map.getZoom() < CLUSTER_TO && clusterDirtyRef.current) applyFilterRef.current?.();
      });
      map.on('moveend', () => {
        const b = map.getBounds();
        onViewportRef.current?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      });
      readyRef.current = true;
    });
    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The payload is serialised once (the memo above depends on `all`, which
  // does not change while the user filters), so this fires on mount and
  // then only if the catalogue itself is replaced.
  useEffect(() => {
    if (readyRef.current) mapRef.current?.getSource('dests')?.setData(geojson);
  }, [geojson]);

  /**
   * Filters changed.
   *
   * The dots are a filter expression, not a new payload: maplibre keeps the
   * tiles it has and re-evaluates a match, instead of re-parsing up to 3,868
   * features on every keystroke. That is the whole cost saving, and it
   * covers every zoom the reader actually browses at.
   *
   * Clusters are the exception, because clustering happens when the source
   * ingests its data: a layer filter can hide a cluster circle but cannot
   * change the number printed inside it, and a cluster reading 40 over six
   * visible pins is a worse bug than a slow filter. Clusters exist only
   * below zoom 6, so the source is rebuilt only while the map is actually
   * down there; zooming back out rebuilds it once, on arrival.
   */
  const applyFilter = React.useCallback(() => {
    const map = mapRef.current;
    if (!readyRef.current || !map || !map.getLayer('dest-dots')) return;
    const notCluster = ['!', ['has', 'point_count']];
    map.setFilter('dest-dots', keepIds
      ? ['all', notCluster, ['in', ['get', 'id'], ['literal', keepIds]]]
      : notCluster);

    if (map.getZoom() >= CLUSTER_TO) {
      clusterDirtyRef.current = true;   // rebuilt when the map returns
      return;
    }
    const keep = keepIds && new Set(keepIds);
    map.getSource('dests')?.setData(keep
      ? { type: 'FeatureCollection', features: geojson.features.filter((f) => keep.has(f.properties.id)) }
      : geojson);
    clusterDirtyRef.current = false;
  }, [keepIds, geojson]);

  applyFilterRef.current = applyFilter;
  useEffect(() => { applyFilter(); }, [applyFilter]);

  return (
    <div className="xmap" role="region" aria-label={t('explore.mapAria')}>
      <div ref={containerRef} className="xmap-canvas" />
    </div>
  );
}
