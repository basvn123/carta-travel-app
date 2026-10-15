import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { IconButton, Segmented } from '../components/ui/index.js';
import { ExpandIcon, ShrinkIcon } from '../components/Icons.jsx';
import { enableTerrain, disableTerrain, terrainAvailable } from '../lib/terrain3d.js';

/**
 * The frame every item-page map sits in (T430): the map, then one toolbar row
 * under it (carta-design "3D terrain map": the control sits under the map,
 * never over it). The row holds the 2D / 3D choice where the place has
 * relief worth seeing and the build can draw it, and Expand, which opens the
 * map full screen inside the page. On a phone the map in the page flow is
 * still (lib/mapGestures.js), so Expand is how a thumb gets to move it; a tap
 * on the still map does the same.
 *
 * `getMap` returns the live maplibre map (or null while it loads); the map's
 * owner installs the gestures and keeps the controller on `map._gestures`.
 * `beneath` names the route layers the hillshade goes under.
 */
export function MapShell({ getMap, relief = false, beneath = [], className = '', children, onExpand }) {
  const { t } = useI18n();
  const [mode, setMode] = useState('2d');
  const [expanded, setExpanded] = useState(false);
  const [can3d, setCan3d] = useState(() => relief && terrainAvailable());
  const shellRef = useRef(null);
  const closeRef = useRef(null);
  const openerRef = useRef(null);

  const resizeSoon = useCallback(() => {
    const map = getMap?.();
    if (!map) return;
    window.requestAnimationFrame(() => map.resize());
  }, [getMap]);

  const setExpand = useCallback((on) => {
    setExpanded(on);
    const map = getMap?.();
    map?._gestures?.setInteractive(on || !map._gestures?.coarse);
    onExpand?.(on);
    resizeSoon();
    if (on) window.requestAnimationFrame(() => closeRef.current?.focus());
    else window.requestAnimationFrame(() => openerRef.current?.focus());
  }, [getMap, onExpand, resizeSoon]);

  // Escape closes the full-screen map before it reaches the page's own
  // Escape (which would close the page).
  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setExpand(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [expanded, setExpand]);

  const pick = (value) => {
    const map = getMap?.();
    if (!map) return;
    setMode(value);
    const run = () => {
      if (value === '3d') {
        enableTerrain(map, {
          beneath,
          onFail: () => { disableTerrain(map); setMode('2d'); setCan3d(false); },
        });
      } else {
        disableTerrain(map);
      }
    };
    // A tap before the style has loaded waits for it rather than failing.
    if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) map.once('load', run);
    else run();
  };

  // A tap on the still map (phone) opens it.
  const onShellClick = (e) => {
    if (expanded) return;
    const map = getMap?.();
    if (!map?._gestures || map._gestures.interactive) return;
    if (e.target.closest('.map-tools, .maplibregl-ctrl')) return;
    openerRef.current = e.target.closest('button') || shellRef.current?.querySelector('.map-expand');
    setExpand(true);
  };

  return (
    <div
      ref={shellRef}
      className={`map-shell ${expanded ? 'is-expanded' : ''} ${className}`}
      onClick={onShellClick}
    >
      <div className="map-shell-frame">{children}</div>
      <div className="map-tools" role="group" aria-label={t('map.toolsAria')}>
        {can3d && (
          <Segmented
            size="sm"
            label={t('map.viewAria')}
            value={mode}
            onChange={pick}
            options={[{ value: '2d', label: t('map.flat') }, { value: '3d', label: t('map.relief') }]}
          />
        )}
        {expanded ? (
          <IconButton ref={closeRef} label={t('map.shrink')} tone="surface" className="map-expand" onClick={() => setExpand(false)}>
            <ShrinkIcon size={20} />
          </IconButton>
        ) : (
          <IconButton
            label={t('map.expand')}
            tone="surface"
            className="map-expand"
            onClick={(e) => { openerRef.current = e.currentTarget; setExpand(true); }}
          >
            <ExpandIcon size={20} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
