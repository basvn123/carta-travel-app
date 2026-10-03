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
 *
 * In the 'viewport' catalogue mode (T059, lib/catalogue.js) the caller also
 * passes `pins`, the whole of Europe from the boot index (id, position,
 * rating band, gem flag), and `all` holds only the countries loaded so far.
 * Every pin draws from the start, so the clusters count the real catalogue;
 * a pin whose record has not arrived (`ld` 0) draws at the default size,
 * ignores the filters it cannot be judged on yet, and asks for its country
 * through onNeedDetail when hovered. onViewport(bounds, zoom) is how the
 * caller learns what to fetch next.
 *
 * Keyboard (T190). The pins are pixels in a WebGL canvas, so nothing in them
 * can take focus. The canvas itself can (maplibre gives it tabindex 0, arrow
 * keys pan, + and - zoom), and over it sits a layer of real buttons, one per
 * pin or cluster the map is drawing right now: transparent, pointer-events
 * none (the mouse still talks to the canvas), each centred on its pin and
 * sized to it, so the focus ring lands on the dot the reader is looking at.
 * Focus shows the same tip or card a hover shows, Escape dismisses it, Enter
 * opens the place, and Enter on a cluster zooms into it and hands focus to
 * the canvas so the next Tab walks the pins it split into. The layer is
 * rebuilt when the map goes idle and repositioned on every move frame. It
 * holds at most KPIN_CAP stops, the best-rated in view, in reading order:
 * a keyboard walk through 300 dots helps nobody, and zooming in (or the list
 * beside the map on a desktop) reaches the rest.
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

// The keyboard layer: at most this many pin stops, ordered in bands of this
// many pixels top to bottom, left to right within a band.
const KPIN_CAP = 30;
const KPIN_ROW = 64;
const CLUSTER_R = (n) => (n >= 100 ? 24 : n >= 25 ? 18 : 14);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function ExploreMap({ rows, all, pins = null, onSelect, onViewport, onNeedDetail, t }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const popupRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onViewportRef = useRef(onViewport);
  onViewportRef.current = onViewport;
  const onNeedDetailRef = useRef(onNeedDetail);
  onNeedDetailRef.current = onNeedDetail;

  // The whole catalogue, serialised once. `all` is the unfiltered set; when
  // a caller does not pass one, the current rows stand in and the map
  // behaves exactly as it did before.
  const source = all || rows;
  const geojson = React.useMemo(() => {
    const loaded = (p) => ({
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
        ld: 1,
      },
    });
    const drawable = (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon);
    if (!pins) return { type: 'FeatureCollection', features: source.filter(drawable).map(loaded) };
    // Boot pins, upgraded to the full feature wherever the record is in.
    const byId = new Map(source.map((p) => [p.id, p]));
    return {
      type: 'FeatureCollection',
      features: pins.filter(drawable).map((b) => {
        const p = byId.get(b.id);
        if (p) return drawable(p) ? loaded(p) : loaded({ ...p, lat: b.lat, lon: b.lon });
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
          properties: {
            id: b.id, city: '', country: '', tier: b.band, score: null,
            gem: b.hiddenGem ? 1 : 0, r: 5.5, img: '', lead: '', ld: 0,
          },
        };
      }),
    };
  }, [source, pins]);
  // The map's load handler seeds its source from the payload current at load
  // time, not the one current when the map was created: the catalogue can
  // grow in between, and the setData effect below skips until the map is ready.
  const geojsonRef = useRef(geojson);
  geojsonRef.current = geojson;

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
      const { city, country, score, tier, ld } = f.properties;
      // No record yet: ask for its country; the tip shows once it lands.
      if (ld === 0) { onNeedDetailRef.current?.(f.properties.id); return; }
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

  // The keyboard layer. `kpins` is what React renders; the move handler
  // repositions the same buttons through kpinElsRef without a render.
  const [kpins, setKpins] = React.useState([]);
  const kpinsRef = useRef(kpins);
  kpinsRef.current = kpins;
  const kpinElsRef = useRef(new Map());
  // The pin that last held focus, so a rebuild that drops it (the map moved
  // it out of view, or a cluster split) can hand focus to the canvas instead
  // of losing it to the page body.
  const lastKpinRef = useRef(null);

  const collectKpins = React.useCallback((map) => {
    const canvas = map.getCanvas();
    const W = canvas.clientWidth; const H = canvas.clientHeight;
    const layers = ['clusters', 'dest-dots'].filter((l) => map.getLayer(l));
    if (!layers.length) return [];
    const seen = new Set();
    const out = [];
    for (const f of map.queryRenderedFeatures({ layers })) {
      const pr = f.properties || {};
      const cluster = pr.cluster_id != null;
      const key = cluster ? `c${pr.cluster_id}` : `d${pr.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // A pin whose record has not arrived has no name to read out yet; it
      // joins the layer on the idle after its country lands.
      if (!cluster && pr.ld === 0) continue;
      const lngLat = f.geometry.coordinates;
      const pt = map.project(lngLat);
      if (pt.x < 0 || pt.y < 0 || pt.x > W || pt.y > H) continue;
      out.push({
        key, cluster, lngLat, x: pt.x, y: pt.y,
        id: pr.id, clusterId: pr.cluster_id, n: pr.point_count || 0,
        city: pr.city, country: pr.country, score: pr.score, tier: pr.tier ?? 0,
        r: cluster ? CLUSTER_R(pr.point_count || 0) : (pr.r || 5.5),
        feature: { geometry: { coordinates: lngLat }, properties: pr },
      });
    }
    out.sort((a, b) => (Number(b.cluster) - Number(a.cluster))
      || (a.cluster ? b.n - a.n : (b.tier - a.tier) || ((b.score ?? -1) - (a.score ?? -1))));
    return out.slice(0, KPIN_CAP).sort((a, b) => (
      Math.floor(a.y / KPIN_ROW) - Math.floor(b.y / KPIN_ROW)) || (a.x - b.x));
  }, []);

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
        data: geojsonRef.current,
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
        if (map.getZoom() >= CARD_FROM && f.properties.ld !== 0 && cardRef.current !== id) { showCard(map, f); return; }
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
        if (map.getZoom() >= CARD_FROM && f.properties.ld !== 0) {
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
        onViewportRef.current?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], map.getZoom());
      });
      // Keyboard layer: follow the pins every frame, rebuild when settled.
      map.on('move', () => {
        for (const k of kpinsRef.current) {
          const el = kpinElsRef.current.get(k.key);
          if (!el) continue;
          const pt = map.project(k.lngLat);
          el.style.left = `${pt.x}px`;
          el.style.top = `${pt.y}px`;
        }
      });
      map.on('idle', () => setKpins(collectKpins(map)));
      readyRef.current = true;
    });
    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // The map is built once: the popup helpers and collectKpins are memos
    // with no dependencies, so listing them never rebuilds it.
  }, [closePop, showTip, showCard, collectKpins]);

  // A rebuild that dropped the focused pin hands focus to the canvas, so the
  // keyboard stays on the map instead of falling to the top of the page.
  useEffect(() => {
    const last = lastKpinRef.current;
    if (!last || kpins.some((k) => k.key === last)) return;
    lastKpinRef.current = null;
    const a = document.activeElement;
    if (!a || a === document.body) mapRef.current?.getCanvas().focus({ preventScroll: true });
  }, [kpins]);

  const kpinLabel = (k) => {
    if (k.cluster) return t('explore.clusterAria', { n: k.n });
    if (k.score == null) return [k.city, k.country].filter(Boolean).join(', ');
    return t('explore.pinAria', { city: k.city, country: k.country, score: Number(k.score).toFixed(1) });
  };
  const kpinFocus = (k) => {
    lastKpinRef.current = k.key;
    const map = mapRef.current;
    if (!map || k.cluster) return;
    if (map.getZoom() >= CARD_FROM) showCard(map, k.feature);
    else showTip(map, k.feature);
  };
  const kpinBlur = (e) => {
    // Focus moving to a real element clears the memory; a blur with no
    // target is the button being removed under focus (see the effect above).
    if (e.relatedTarget) lastKpinRef.current = null;
    closePop();
  };
  const kpinActivate = async (k) => {
    const map = mapRef.current;
    if (!map) return;
    if (!k.cluster) { onSelectRef.current?.(k.id); return; }
    // The cluster button is about to vanish with the cluster: park focus on
    // the canvas first, then zoom to where it splits.
    lastKpinRef.current = null;
    map.getCanvas().focus({ preventScroll: true });
    try {
      const zoom = await map.getSource('dests').getClusterExpansionZoom(k.clusterId);
      map.easeTo({ center: k.lngLat, zoom });
    } catch { /* the cluster dissolved while we asked */ }
  };

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
    // A boot pin without its record cannot be judged by a filter yet, so it
    // stays until its country arrives and the real answer replaces it.
    const kept = ['in', ['get', 'id'], ['literal', keepIds || []]];
    map.setFilter('dest-dots', keepIds
      ? ['all', notCluster, pins ? ['any', ['==', ['get', 'ld'], 0], kept] : kept]
      : notCluster);

    if (map.getZoom() >= CLUSTER_TO) {
      clusterDirtyRef.current = true;   // rebuilt when the map returns
      return;
    }
    const keep = keepIds && new Set(keepIds);
    map.getSource('dests')?.setData(keep
      ? { type: 'FeatureCollection', features: geojson.features.filter((f) => f.properties.ld === 0 || keep.has(f.properties.id)) }
      : geojson);
    clusterDirtyRef.current = false;
  }, [keepIds, geojson, pins]);

  applyFilterRef.current = applyFilter;
  useEffect(() => { applyFilter(); }, [applyFilter]);

  return (
    <div className="xmap" role="region" aria-label={t('explore.mapAria')}>
      <div ref={containerRef} className="xmap-canvas" />
      {kpins.length > 0 && (
        <div className="xmap-kpins" role="group" aria-label={t('explore.mapPinsAria')}>
          {kpins.map((k) => (
            <button
              key={k.key}
              type="button"
              ref={(el) => { if (el) kpinElsRef.current.set(k.key, el); else kpinElsRef.current.delete(k.key); }}
              className={`xmap-kpin${k.cluster ? ' is-cluster' : ''}`}
              style={{ left: k.x, top: k.y, '--kpin-d': `${Math.round(k.r * 2 + 4)}px` }}
              aria-label={kpinLabel(k)}
              onFocus={() => kpinFocus(k)}
              onBlur={kpinBlur}
              onKeyDown={(e) => { if (e.key === 'Escape' && popupRef.current) { e.stopPropagation(); closePop(); } }}
              onClick={() => kpinActivate(k)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
