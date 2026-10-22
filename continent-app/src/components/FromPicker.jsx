import React, { useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { geocodeAddress, reverseGeocode } from '../lib/geocode.js';
import { CountryFlag } from './CountryFlag.jsx';
import { Button } from './ui/index.js';
import { ArrowLeftIcon, CheckIcon, ChevronRightIcon, CrosshairIcon, MapPinIcon, SearchIcon } from './Icons.jsx';

/**
 * Where the trip starts (T577, the owner 2026-10-22): a town, not an airport.
 * Carta prices a plane, a train, a bus and a car from here, so the picker
 * speaks of places only: no airport codes and no "airport" in a label.
 *
 *   - one search field (no placeholder; it is named for screen readers)
 *   - "Use my location", the device's own position
 *   - with nothing typed, the countries; a country opens its towns
 *   - typed, the countries and towns that match, then one row that looks
 *     the words up anywhere in Europe (OpenStreetMap, on that press only)
 *
 * Every pick calls `onPick({ name, lat, lon, country, iso2 })`; App turns it
 * into the start of every road and rail way and picks the nearest priced
 * airport for the flight (lib/origins.js nearestOrigin).
 */

/** The towns Carta has fares from, grouped by country, with flags. */
function townsByCountry(data) {
  const origins = data?.meta?.origins || {};
  const isoOf = new Map();
  for (const d of Object.values(data?.destinations || {})) {
    if (d?.country && d.iso2 && !isoOf.has(d.country)) isoOf.set(d.country, d.iso2);
  }
  const byCountry = new Map();
  const seen = new Set();
  for (const o of Object.values(origins)) {
    if (o.lat == null || o.lon == null || !o.country) continue;
    const name = o.city || o.name;
    // One row a town: Paris has two airports and is one place to start from.
    const key = `${o.country}|${name}`;
    if (!name || seen.has(key)) continue;
    seen.add(key);
    if (!byCountry.has(o.country)) byCountry.set(o.country, { country: o.country, iso2: isoOf.get(o.country) || null, towns: [] });
    byCountry.get(o.country).towns.push({ name, lat: o.lat, lon: o.lon, country: o.country, iso2: isoOf.get(o.country) || null });
  }
  return byCountry;
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function FromPanel({ data, current, onPick, autoFocus = true }) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState(null);
  const [hits, setHits] = useState(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState(false);
  const inputRef = useRef(null);

  const groups = useMemo(() => townsByCountry(data), [data]);
  const countries = useMemo(
    () => [...groups.values()].sort((a, b) => a.country.localeCompare(b.country, lang)),
    [groups, lang],
  );
  const q = norm(query.trim());
  const matches = useMemo(() => {
    if (!q) return null;
    const cs = countries.filter((c) => norm(c.country).includes(q));
    const ts = [];
    for (const c of countries) for (const town of c.towns) if (norm(town.name).startsWith(q)) ts.push(town);
    ts.sort((a, b) => a.name.localeCompare(b.name, lang));
    return { countries: cs.slice(0, 4), towns: ts.slice(0, 8) };
  }, [q, countries, lang]);

  const isCurrent = (p) => current && p.name === current.name
    && Math.abs(p.lat - current.lat) < 0.05 && Math.abs(p.lon - current.lon) < 0.05;

  const searchEurope = async () => {
    const words = query.trim();
    if (words.length < 3 || busy) return;
    setBusy(true);
    const found = await geocodeAddress(words, { limit: 6 });
    setHits(found.map((r) => ({
      name: r.locality || r.name, lat: r.lat, lon: r.lon, country: r.country, iso2: r.iso2, sub: r.label,
    })));
    setBusy(false);
  };

  const useLocation = () => {
    if (!navigator.geolocation) { setLocError(true); return; }
    setLocating(true);
    setLocError(false);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const named = await reverseGeocode(lat, lon, { zoom: 10 });
      setLocating(false);
      onPick({
        name: named?.locality || named?.name || t('from.myLocation'),
        lat, lon, country: named?.country || '', iso2: named?.iso2 || null,
      });
    }, () => { setLocating(false); setLocError(true); }, { timeout: 10000, maximumAge: 600000 });
  };

  const row = (p, { sub = null, key } = {}) => (
    <li key={key || `${p.name}|${p.lat}|${p.lon}`}>
      <button type="button" className={`from-row${isCurrent(p) ? ' is-on' : ''}`}
        aria-current={isCurrent(p) ? 'true' : undefined} onClick={() => onPick(p)}>
        <MapPinIcon size={16} className="from-row-icon" />
        <span className="from-row-main">
          <span className="from-row-name">{p.name}</span>
          {sub && <span className="from-row-sub">{sub}</span>}
        </span>
        {isCurrent(p) && <CheckIcon size={16} className="from-row-tick" />}
      </button>
    </li>
  );
  const countryRow = (c) => (
    <li key={c.country}>
      <button type="button" className="from-row" onClick={() => { setCountry(c.country); setQuery(''); setHits(null); }}>
        <span className="from-row-flag" aria-hidden="true">{c.iso2 && <CountryFlag country={c.iso2} size={14} />}</span>
        <span className="from-row-main"><span className="from-row-name">{c.country}</span></span>
        <ChevronRightIcon size={16} className="from-row-chev" />
      </button>
    </li>
  );

  const open = country ? groups.get(country) : null;

  return (
    <div className="from-panel">
      <div className="from-field">
        <SearchIcon size={18} className="from-field-icon" />
        <input
          ref={inputRef}
          className="from-input"
          type="search"
          value={query}
          // The panel opens on the traveller's own press, to type in.
          autoFocus={autoFocus}
          onChange={(e) => { setQuery(e.target.value); setHits(null); if (e.target.value) setCountry(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchEurope(); } }}
          aria-label={t('from.searchAria')}
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>
      <Button variant="quiet" size="sm" className="from-locate" iconStart={<CrosshairIcon size={16} />}
        onClick={useLocation} loading={locating}>
        {locating ? t('from.locating') : t('from.useLocation')}
      </Button>
      {locError && <p className="from-note" role="status">{t('from.locationFailed')}</p>}

      <div className="from-list">
        {matches ? (
          <>
            {matches.countries.length > 0 && <ul className="from-ul">{matches.countries.map(countryRow)}</ul>}
            {matches.towns.length > 0 && (
              <ul className="from-ul">{matches.towns.map((p) => row(p, { sub: p.country }))}</ul>
            )}
            {hits && hits.length > 0 && (
              <ul className="from-ul">{hits.map((p, i) => row(p, { sub: p.country, key: `hit${i}` }))}</ul>
            )}
            {hits && hits.length === 0 && (
              <p className="from-note" role="status">{t('from.noMatch', { query: query.trim() })}</p>
            )}
            {!hits && query.trim().length >= 3 && (
              <button type="button" className="from-row from-europe" onClick={searchEurope} disabled={busy}>
                <SearchIcon size={16} className="from-row-icon" />
                <span className="from-row-main">
                  <span className="from-row-name">{busy ? t('from.searching') : t('from.anywhere', { query: query.trim() })}</span>
                </span>
              </button>
            )}
          </>
        ) : open ? (
          <>
            <button type="button" className="from-row from-back" onClick={() => setCountry(null)}>
              <ArrowLeftIcon size={16} className="from-row-icon" />
              <span className="from-row-main"><span className="from-row-name">{t('from.allCountries')}</span></span>
            </button>
            <h3 className="from-h">
              {open.iso2 && <CountryFlag country={open.iso2} size={14} />}
              {open.country}
            </h3>
            <ul className="from-ul">
              {[...open.towns].sort((a, b) => a.name.localeCompare(b.name, lang)).map((p) => row(p))}
            </ul>
          </>
        ) : (
          <ul className="from-ul">{countries.map(countryRow)}</ul>
        )}
      </div>
    </div>
  );
}

/** The From value as a traveller reads it: the town, never a code. */
export function fromName(s) {
  if (s?.fromPlace?.name) return s.fromPlace.name;
  const o = s?.data?.meta?.origins?.[s?.origin];
  return o ? (o.city || o.name || '') : '';
}

/** The current From as a point, for the panel's tick. */
export function fromPoint(s) {
  if (s?.fromPlace && Number.isFinite(s.fromPlace.lat)) return s.fromPlace;
  const o = s?.data?.meta?.origins?.[s?.origin];
  return o && o.lat != null ? { name: o.city || o.name, lat: o.lat, lon: o.lon } : null;
}
