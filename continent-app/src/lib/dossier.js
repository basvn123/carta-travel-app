/**
 * dossier.js, the loader for the per-destination dossier contract.
 *
 * public/dossier/{base}.json is built by pipeline/dossier/build_dossier.py and
 * is the single source both renderers read: the full-screen destination page
 * and the PDF export. When a section is wrong it is wrong in one place.
 *
 * File naming mirrors the pipeline exactly: "gem:bruges" -> "gem-bruges"
 * (a colon is illegal in NTFS names), and DOS device names get the fareFile
 * trailing underscore (PRN -> PRN_), see src/lib/fareFile.js for the story.
 *
 * A missing file under public/ is served as the SPA index at status 200, so
 * the loader checks content-type before parsing, same as every other layer.
 */

import { useEffect, useState } from 'react';

const RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  ...Array.from({ length: 10 }, (_, i) => `COM${i}`),
  ...Array.from({ length: 10 }, (_, i) => `LPT${i}`),
]);

export function dossierFileBase(destId) {
  const id = String(destId || '');
  if (id.startsWith('gem:')) return `gem-${id.slice(4)}`;
  const code = id.toUpperCase();
  return RESERVED.has(code) ? `${code}_` : code;
}

export function dossierUrl(destId) {
  return `/dossier/${dossierFileBase(destId)}.json`;
}

function isJson(res) {
  return res.ok && (res.headers.get('content-type') || '').includes('json');
}

const cache = new Map();

/** Resolves to the dossier object, or null when none is built. */
export function loadDossier(destId) {
  if (!destId) return Promise.resolve(null);
  if (!cache.has(destId)) {
    cache.set(destId, fetch(dossierUrl(destId))
      .then((res) => (isJson(res) ? res.json() : null))
      .catch(() => null));
  }
  return cache.get(destId);
}

/** undefined while loading, null when missing, the dossier once loaded. */
export function useDossier(destId) {
  const [dossier, setDossier] = useState(undefined);
  useEffect(() => {
    let live = true;
    setDossier(undefined);
    if (!destId) return undefined;
    loadDossier(destId).then((d) => { if (live) setDossier(d); });
    return () => { live = false; };
  }, [destId]);
  return destId ? dossier : null;
}

/** Shareable URL for a destination, same convention as trailShareUrl. */
export function destShareUrl(destId) {
  if (typeof window === 'undefined' || !destId) return '';
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#dest=${encodeURIComponent(destId)}`;
}

/**
 * The #dest= boot hash: read once, synchronously, then stripped, exactly like
 * lib/trails.js does it. Only our own param is touched, because Supabase auth
 * links land in the hash too.
 */
let destReadResult;
const DEST_ID_RE = /^(gem:[a-z0-9-]{1,60}|[A-Z]{3})$/;

export function readDestFromUrl() {
  if (destReadResult !== undefined) return destReadResult;
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  if (!hash.startsWith('#') || !hash.includes('dest=')) return (destReadResult = null);
  const params = new URLSearchParams(hash.slice(1));
  const id = String(params.get('dest') || '').slice(0, 70);
  if (!DEST_ID_RE.test(id)) return (destReadResult = null);
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch { /* the destination still opens; only the address bar stays busy */ }
  return (destReadResult = id);
}
