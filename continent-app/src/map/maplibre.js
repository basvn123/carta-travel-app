/**
 * The one place the app imports maplibre-gl (T1066, ROADMAP C6).
 *
 * maplibre-gl 6 ships as ESM only, with no default export, and loads its
 * worker from a file beside its own module. Vite bundles the library into a
 * chunk of its own, so that sibling file is not there: the worker is emitted
 * as an asset here and its URL handed to maplibre before any map is made.
 * Every map component imports `maplibregl` from this file, never from
 * 'maplibre-gl' directly.
 */
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

maplibregl.setWorkerUrl(workerUrl);

export default maplibregl;
