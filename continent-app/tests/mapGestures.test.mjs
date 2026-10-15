// T430: the map gestures (lib/mapGestures.js) and the 3D view
// (lib/terrain3d.js), against a stand-in map, since the browser harnesses
// cannot load map tiles in every environment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMouseWheel, installMapGestures } from '../src/lib/mapGestures.js';
import { enableTerrain, disableTerrain, terrainAvailable } from '../src/lib/terrain3d.js';

function fakeMap() {
  const listeners = {};
  const calls = [];
  const handler = (name) => ({
    enabled: true,
    enable() { this.enabled = true; calls.push(`${name}.enable`); },
    disable() { this.enabled = false; calls.push(`${name}.disable`); },
  });
  const box = {
    classList: { set: new Set(), toggle(c, on) { if (on) this.set.add(c); else this.set.delete(c); } },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }),
  };
  const sources = {};
  const layers = [];
  const map = {
    calls,
    listeners,
    box,
    getContainer: () => box,
    dragPan: handler('dragPan'),
    touchZoomRotate: handler('touchZoomRotate'),
    doubleClickZoom: handler('doubleClickZoom'),
    scrollZoom: handler('scrollZoom'),
    dragRotate: handler('dragRotate'),
    touchPitch: handler('touchPitch'),
    panBy(d) { calls.push(['panBy', d]); },
    zoomTo(z) { calls.push(['zoomTo', z]); },
    getZoom: () => 10,
    unproject: (p) => p,
    getBearing: () => 0,
    getSource: (id) => sources[id],
    addSource(id, spec) { sources[id] = spec; },
    getLayer: (id) => layers.find((l) => l.id === id),
    addLayer(l, before) { layers.push({ ...l, before }); },
    removeLayer(id) { const i = layers.findIndex((l) => l.id === id); if (i >= 0) layers.splice(i, 1); },
    getStyle: () => ({ layers: [{ id: 'trail-casing', type: 'line' }, { id: 'label', type: 'symbol' }] }),
    setTerrain(t) { calls.push(['setTerrain', t]); },
    easeTo(o) { calls.push(['easeTo', o]); },
    on() {},
    off() {},
    layers,
    sources,
  };
  return map;
}

const wheel = (o) => {
  const e = { deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, ...o, prevented: false };
  e.preventDefault = () => { e.prevented = true; };
  e.stopPropagation = () => {};
  return e;
};

test('a mouse wheel is told from a trackpad', () => {
  assert.equal(isMouseWheel({ deltaMode: 1, deltaY: 3 }), true);
  assert.equal(isMouseWheel({ deltaMode: 0, deltaY: 100, wheelDeltaY: -120, deltaX: 0 }), true);
  assert.equal(isMouseWheel({ deltaMode: 0, deltaY: 7.5, wheelDeltaY: -18, deltaX: 2 }), false);
});

test('a two-finger trackpad swipe pans; a pinch and a mouse wheel are left to zoom', () => {
  const map = fakeMap();
  installMapGestures(map, { coarse: false });
  const onWheel = map.listeners.wheel[0];
  const swipe = wheel({ deltaX: 12, deltaY: 30 });
  onWheel(swipe);
  assert.equal(swipe.prevented, true);
  assert.deepEqual(map.calls.find((c) => c[0] === 'panBy'), ['panBy', [12, 30]]);
  const pinch = wheel({ deltaY: -4, ctrlKey: true });
  onWheel(pinch);
  assert.equal(pinch.prevented, false);
  const mouse = wheel({ deltaMode: 1, deltaY: 3 });
  onWheel(mouse);
  assert.equal(mouse.prevented, false);
});

test('on a coarse pointer the map in the page is still until expanded', () => {
  const map = fakeMap();
  const g = installMapGestures(map, { coarse: true });
  assert.equal(map.dragPan.enabled, false);
  assert.equal(map.box.classList.set.has('is-still'), true);
  const swipe = wheel({ deltaY: 20 });
  map.listeners.wheel[0](swipe);
  assert.equal(swipe.prevented, false, 'a still map lets the page scroll');
  g.setInteractive(true);
  assert.equal(map.dragPan.enabled, true);
  assert.equal(map.box.classList.set.has('is-still'), false);
});

test('3D adds the relief under the route and eases the camera; 2D takes it away', () => {
  assert.equal(terrainAvailable({}), true);
  const map = fakeMap();
  enableTerrain(map, { beneath: ['trail-casing'] });
  assert.ok(map.sources['carta-dem'], 'elevation source');
  assert.ok(map.sources['carta-dem-shade'], 'a second source for the shading');
  const shade = map.layers.find((l) => l.id === 'carta-hillshade');
  assert.equal(shade.before, 'trail-casing', 'the shading sits under the route');
  const terrain = map.calls.find((c) => c[0] === 'setTerrain');
  assert.equal(terrain[1].source, 'carta-dem');
  assert.ok(map.calls.some((c) => c[0] === 'easeTo' && c[1].pitch === 60));
  disableTerrain(map);
  assert.ok(map.calls.some((c) => c[0] === 'setTerrain' && c[1] === null));
  assert.equal(map.getLayer('carta-hillshade'), undefined);
  assert.ok(map.calls.some((c) => c[0] === 'easeTo' && c[1].pitch === 0 && c[1].bearing === 0));
});

test('the mirror build hides 3D until the PMTiles protocol lands (T233-d)', () => {
  assert.equal(terrainAvailable({ VITE_TERRAIN_PMTILES_URL: 'https://data.example.com/t.pmtiles' }), false);
});
