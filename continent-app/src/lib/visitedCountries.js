/**
 * visitedCountries.js, the countries a traveller marks as visited by hand
 * (T434, Polarsteps' "scratch map"): a trip taken before Carta, or one not
 * worth writing up, still belongs on the record.
 *
 * Local first, in this browser's storage, and carried to the account inside
 * user_settings by useAccountSync (no migration): the pull unions the
 * account's list into this one, the push writes this one back. Country names
 * are the catalogue's English names, the keys COUNTRY_ISO2 reads.
 */
import { useEffect, useState } from 'react';

const KEY = 'carta.visitedCountries.v1';
const listeners = new Set();

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((c) => typeof c === 'string' && c) : [];
  } catch { return []; }
}

function write(list) {
  const clean = [...new Set(list)].sort((a, b) => a.localeCompare(b));
  try { localStorage.setItem(KEY, JSON.stringify(clean)); } catch { /* private mode */ }
  listeners.forEach((fn) => fn(clean));
  return clean;
}

export function loadVisitedCountries() { return read(); }

export function setVisitedCountries(list) { return write(list || []); }

export function toggleVisitedCountry(country) {
  const cur = read();
  return write(cur.includes(country) ? cur.filter((c) => c !== country) : [...cur, country]);
}

/** The account's copy joins this device's; nothing marked here is lost. */
export function mergeVisitedCountries(incoming) {
  if (!Array.isArray(incoming) || !incoming.length) return read();
  return write([...read(), ...incoming.filter((c) => typeof c === 'string' && c)]);
}

export function subscribeVisitedCountries(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The list, kept current across every component that shows it. */
export function useVisitedCountries() {
  const [list, setList] = useState(read);
  useEffect(() => subscribeVisitedCountries(setList), []);
  return list;
}
