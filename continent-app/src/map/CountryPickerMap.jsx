import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { keepFitted } from './coords.js';
import { useI18n } from '../i18n/index.jsx';

// Label-light and desaturated: this map is a picker, so the countries are the
// content and the basemap is background. Positron with no labels leaves the
// country names to the pins, which are the things you can actually click.
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json';

// Europe, as the picker opens on it.
const EUROPE_BOUNDS = [[-10.5, 35], [30, 63]];

// The same shapes TripMap paints, fetched once per session and shared. The
// basemap's vector tiles carry boundary LINES but no admin polygons, so a
// country cannot be painted from the tiles (pipeline/oneoff/build_country_shapes.py).
let countryShapesPromise = null;
const loadCountryShapes = () => {
  if (!countryShapesPromise) {
    countryShapesPromise = fetch('/country_shapes.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .catch(() => ({ type: 'FeatureCollection', features: [] }));
  }
  return countryShapesPromise;
};

/** The design tokens this map paints with, read from the document so the map
 *  cannot drift from the rest of the app's palette. */
function token(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * The map of Europe you pick countries on.
 *
 * Countries are FILLED polygons, not pins. A pin at a centroid asks you to
 * know where a country is before you can click it, puts Montenegro and Kosovo
 * on top of each other, and gives a 20px target for a country the size of
 * France. The shapes are already in the app for the travel record's map, so
 * this is the same data drawn for a different purpose: hover to see which
 * country you are about to pick, click to toggle it.
 *
 * @param countries    [{ country, iso2, centroid }] from countriesFromData
 * @param selected     Set of picked country names
 * @param onToggle     (countryName) => void
 * @param recommended  Set of country names the quiz recommended, outlined
 * @param onBrief      (countryName) => void, opens "what's there"
 * @param covers       Map(countryName -> photo url) for the mobile card
 */
export function CountryPickerMap({
  countries = [], selected, onToggle, recommended = null, onBrief = null, covers = null,
}) {
  const { t } = useI18n();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  // The country under the cursor, as an ISO2, kept in a ref for the paint
  // expressions and in state only for the mobile card.
  const hoverRef = useRef('');
  const [tapped, setTapped] = useState(null); // { country, iso2 } on touch

  // ISO2 -> country name, so a click on a polygon knows what it picked. The
  // shapes carry only the code; the catalogue carries the name.
  const nameByIso = useMemo(() => {
    const m = new Map();
    for (const c of countries) if (c.iso2) m.set(String(c.iso2).toUpperCase(), c.country);
    return m;
  }, [countries]);
  const nameByIsoRef = useRef(nameByIso);
  nameByIsoRef.current = nameByIso;

  // Where each country's label sits: the catalogue's own centroid, which is
  // the mean of its city coordinates and so lands where the places are rather
  // than in the middle of a country's bounding box.
  const centroidByIso = useMemo(() => {
    const m = new Map();
    for (const c of countries) {
      if (c.iso2 && c.centroid) m.set(String(c.iso2).toUpperCase(), c.centroid);
    }
    return m;
  }, [countries]);
  const centroidByIsoRef = useRef(centroidByIso);
  centroidByIsoRef.current = centroidByIso;

  const onBriefRef = useRef(onBrief);
  onBriefRef.current = onBrief;

  // ---- init once ----------------------------------------------------------
  useEffect(() => {
    if (mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      bounds: EUROPE_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', async () => {
      const data = await loadCountryShapes();
      if (mapRef.current !== map) return;
      // Only the countries the catalogue actually holds are pickable, so the
      // map cannot offer a country the rest of the wizard has nothing for.
      const known = new Set([...nameByIsoRef.current.keys()]);
      // The shapes carry only an ISO2. The label wants the name a traveller
      // reads, so the catalogue's name is copied onto each feature here.
      const feats = (data.features || [])
        .filter((f) => known.has(String(f.properties?.iso2 || '').toUpperCase()))
        .map((f) => {
          const iso2 = String(f.properties.iso2).toUpperCase();
          return { ...f, properties: { ...f.properties, iso2, name: nameByIsoRef.current.get(iso2) || iso2 } };
        });
      map.addSource('cpm-countries', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: feats },
        promoteId: 'iso2',
      });

      const accent = token('--accent', '#c8501e');
      const accentBg = token('--accent-bg', '#fdeee7');
      const rule = token('--rule', '#e2e0dc');

      map.addLayer({
        id: 'cpm-fill',
        type: 'fill',
        source: 'cpm-countries',
        paint: {
          'fill-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], accent,
            ['boolean', ['feature-state', 'hover'], false], accentBg,
            '#ffffff',
          ],
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 0.35,
            ['boolean', ['feature-state', 'hover'], false], 0.9,
            0.55,
          ],
        },
      });
      map.addLayer({
        id: 'cpm-line',
        type: 'line',
        source: 'cpm-countries',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], accent,
            ['boolean', ['feature-state', 'recommended'], false], accent,
            rule,
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 1.5,
            ['boolean', ['feature-state', 'recommended'], false], 1.4,
            0.6,
          ],
          // A recommendation is a suggestion, so it is dotted: visibly
          // different from the solid line that means "you picked this".
          'line-dasharray': [
            'case',
            ['boolean', ['feature-state', 'recommended'], false], ['literal', [2, 1.6]],
            ['literal', [1, 0]],
          ],
        },
      });
      // One label per country. Drawn from a separate point source rather than
      // from the polygons, because MapLibre labels every PART of a
      // MultiPolygon: off the shapes, the United Kingdom printed its name four
      // times (mainland, Northern Ireland, the Hebrides, Shetland) and Denmark
      // and Sweden twice each.
      map.addSource('cpm-labels', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [...nameByIsoRef.current.entries()]
            .map(([iso2, name]) => {
              const c = centroidByIsoRef.current.get(iso2);
              return c ? {
                type: 'Feature',
                id: iso2,
                properties: { iso2, name },
                geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
              } : null;
            })
            .filter(Boolean),
        },
        promoteId: 'iso2',
      });
      map.addLayer({
        id: 'cpm-label',
        type: 'symbol',
        source: 'cpm-labels',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 9, 6, 13],
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': ['case', ['boolean', ['feature-state', 'selected'], false], token('--ink', '#26231f'), token('--ink-mute', '#8a8681')],
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.2,
        },
      });

      // The container is often still collapsing into its tab panel when the
      // map initialises, so the constructor's `bounds` framed the wrong box
      // and Greenland and western Russia filled the screen. Re-fit once, now
      // that the shapes are in and the element has its real size.
      map.resize();
      map.fitBounds(EUROPE_BOUNDS, { padding: 24, maxZoom: 6, duration: 0 });

      readyRef.current = true;
      map._sync?.();

      const setHover = (iso2) => {
        if (hoverRef.current === iso2) return;
        if (hoverRef.current) {
          map.setFeatureState({ source: 'cpm-countries', id: hoverRef.current }, { hover: false });
        }
        hoverRef.current = iso2;
        if (iso2) map.setFeatureState({ source: 'cpm-countries', id: iso2 }, { hover: true });
      };

      map.on('mousemove', 'cpm-fill', (e) => {
        const iso2 = e.features?.[0]?.properties?.iso2;
        map.getCanvas().style.cursor = iso2 ? 'pointer' : '';
        setHover(iso2 || '');
      });
      map.on('mouseleave', 'cpm-fill', () => {
        map.getCanvas().style.cursor = '';
        setHover('');
      });
      map.on('click', 'cpm-fill', (e) => {
        const iso2 = String(e.features?.[0]?.properties?.iso2 || '').toUpperCase();
        const name = nameByIsoRef.current.get(iso2);
        if (!name) return;
        // On a touch screen a tap opens a card instead of toggling blind: a
        // country you cannot hover is a country you cannot identify first.
        if (window.matchMedia?.('(hover: none)').matches) setTapped({ country: name, iso2 });
        else onToggleRef.current?.(name);
      });
    });

    const unfit = keepFitted(map, containerRef.current, () => (
      { bounds: EUROPE_BOUNDS, padding: 24, maxZoom: 6 }
    ));
    mapRef.current = map;
    return () => {
      unfit();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []);

  // ---- selection and recommendations, as feature state --------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const sync = () => {
      if (!map.getSource('cpm-countries')) return;
      for (const [iso2, name] of nameByIso) {
        const st = {
          selected: Boolean(selected?.has(name)),
          recommended: Boolean(recommended?.has(name)),
        };
        map.setFeatureState({ source: 'cpm-countries', id: iso2 }, st);
        if (map.getSource('cpm-labels')) map.setFeatureState({ source: 'cpm-labels', id: iso2 }, st);
      }
    };
    map._sync = sync;
    if (readyRef.current) sync();
  }, [selected, recommended, nameByIso]);

  // A tapped country whose selection changed elsewhere should show the change.
  const tappedPicked = tapped ? Boolean(selected?.has(tapped.country)) : false;

  return (
    <div className="cpm-wrap">
      <div className="cpm" ref={containerRef} />

      <div className="cpm-legend" aria-hidden="true">
        <span className="cpm-legend-item"><i className="cpm-key-sel" /> {t('wizard.legendSelected')}</span>
        {recommended?.size > 0 && (
          <span className="cpm-legend-item"><i className="cpm-key-rec" /> {t('wizard.legendRecommended')}</span>
        )}
      </div>

      {/* Touch: the country you tapped, with its photo and the two things you
          can do with it. A hover tooltip would never be reachable here. */}
      {tapped && (
        <div className="cpm-card" role="dialog" aria-label={tapped.country}>
          {covers?.get(tapped.country) && (
            <img className="cpm-card-img" src={covers.get(tapped.country)} alt="" />
          )}
          <div className="cpm-card-text">
            <b>{tapped.country}</b>
            <div className="cpm-card-acts">
              <button
                type="button"
                className={`cpm-card-add ${tappedPicked ? 'on' : ''}`}
                onClick={() => onToggleRef.current?.(tapped.country)}
              >
                {tappedPicked ? t('quiz.added') : t('quiz.add')}
              </button>
              {onBrief && (
                <button type="button" className="cpm-card-info" onClick={() => onBriefRef.current?.(tapped.country)}>
                  {t('brief.whatsThere')}
                </button>
              )}
            </div>
          </div>
          <button className="cpm-card-close" onClick={() => setTapped(null)} aria-label={t('wizard.close')}>×</button>
        </div>
      )}
    </div>
  );
}
