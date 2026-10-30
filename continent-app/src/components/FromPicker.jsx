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

/** Each country's capital, [lat, lon], by ISO2: the point a country stands
 *  for when the traveller gives no town. */
const CAPITALS = {
  AD: [42.51, 1.52], AL: [41.33, 19.82], AM: [40.18, 44.51], AT: [48.21, 16.37], BA: [43.86, 18.41],
  BE: [50.85, 4.35], BG: [42.70, 23.32], BY: [53.90, 27.56], CH: [46.95, 7.45], CY: [35.17, 33.36],
  CZ: [50.08, 14.44], DE: [52.52, 13.40], DK: [55.68, 12.57], EE: [59.44, 24.75], ES: [40.42, -3.70],
  FI: [60.17, 24.94], FR: [48.86, 2.35], GB: [51.51, -0.13], GE: [41.72, 44.79], GR: [37.98, 23.73],
  HR: [45.81, 15.98], HU: [47.50, 19.04], IE: [53.35, -6.26], IS: [64.15, -21.94], IT: [41.90, 12.50],
  LT: [54.69, 25.28], LU: [49.61, 6.13], LV: [56.95, 24.11], MC: [43.74, 7.42], MD: [47.01, 28.86],
  ME: [42.44, 19.26], MK: [41.99, 21.43], MT: [35.90, 14.51], NL: [52.37, 4.90], NO: [59.91, 10.75],
  PL: [52.23, 21.01], PT: [38.72, -9.14], RO: [44.43, 26.10], RS: [44.79, 20.45], SE: [59.33, 18.07],
  SI: [46.06, 14.51], SK: [48.15, 17.11], TR: [39.93, 32.86], UA: [50.45, 30.52], XK: [42.66, 21.17],
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** The point a country stands for when no town is given: its town with
 *  airports nearest the capital (Spain lands on Madrid). A country without a
 *  capital here takes the town nearest the median of its towns, which island
 *  groups cannot drag the way a mean is dragged. */
function countryAnchor(group) {
  const towns = group.towns;
  if (!towns.length) return null;
  const cap = CAPITALS[group.iso2];
  const at = cap ? { lat: cap[0], lon: cap[1] } : { lat: median(towns.map((tw) => tw.lat)), lon: median(towns.map((tw) => tw.lon)) };
  const off = (tw) => (tw.lat - at.lat) ** 2 + ((tw.lon - at.lon) * Math.cos((at.lat * Math.PI) / 180)) ** 2;
  return [...towns].sort((a, b) => off(a) - off(b))[0];
}

/**
 * Where the trip starts, country first (owner, plan flow walk 2026-10-30):
 * the planner lists countries only, no towns inside them. A tap picks the
 * country (its point is countryAnchor's town, by the capital); the traveller can then give
 * a town or address in that country, looked up on that press only, or use
 * the device's own position. Same onPick({ name, lat, lon, country, iso2 })
 * as FromPanel; a country pick is named after the country.
 */
export function FromCountryPanel({ data, current, onPick, resume = false }) {
  const { t, lang } = useI18n();
  const groups = useMemo(() => townsByCountry(data), [data]);
  const countries = useMemo(
    () => [...groups.values()].sort((a, b) => a.country.localeCompare(b.country, lang)),
    [groups, lang],
  );
  // The country the current From sits in, by its iso2 or its own name.
  const startCountry = useMemo(() => {
    if (!current) return null;
    return countries.find((c) => (current.iso2 && c.iso2 === current.iso2) || c.country === current.name
      || c.country === current.country || c.towns.some((tw) => tw.name === current.name))?.country || null;
  }, [current, countries]);
  // The list first unless the trip already answered (`resume`): the app's
  // own From is a guess, ticked in the list but not picked for them.
  const [country, setCountry] = useState(resume ? startCountry : null);
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState(false);
  const open = country ? groups.get(country) : null;

  const pickCountry = (c) => {
    const at = countryAnchor(c);
    setCountry(c.country);
    setFilter('');
    setQuery('');
    setHits(null);
    if (at) onPick({ name: c.country, lat: at.lat, lon: at.lon, country: c.country, iso2: c.iso2 });
  };

  const search = async () => {
    const words = query.trim();
    if (words.length < 3 || busy) return;
    setBusy(true);
    const found = await geocodeAddress(words, { limit: 6, countryCode: open?.iso2 });
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
      const home = countries.find((c) => named?.iso2 && c.iso2 === named.iso2);
      if (home) setCountry(home.country);
      setQuery('');
      setHits(null);
      onPick({
        name: named?.locality || named?.name || t('from.myLocation'),
        lat, lon, country: named?.country || '', iso2: named?.iso2 || null,
      });
    }, () => { setLocating(false); setLocError(true); }, { timeout: 10000, maximumAge: 600000 });
  };

  const exact = current && open && current.name !== open.country ? current : null;
  const f = norm(filter.trim());
  const shown = f ? countries.filter((c) => norm(c.country).includes(f)) : countries;

  const locate = (
    <>
      <Button variant="quiet" size="sm" className="from-locate" iconStart={<CrosshairIcon size={16} />}
        onClick={useLocation} loading={locating}>
        {locating ? t('from.locating') : t('from.useLocation')}
      </Button>
      {locError && <p className="from-note" role="status">{t('from.locationFailed')}</p>}
    </>
  );

  if (!open) {
    return (
      <div className="from-panel">
        <div className="from-field">
          <SearchIcon size={18} className="from-field-icon" />
          <input className="from-input" type="search" value={filter} onChange={(e) => setFilter(e.target.value)}
            aria-label={t('from.searchCountryAria')} autoComplete="off" enterKeyHint="search" />
        </div>
        {locate}
        <div className="from-list">
          <ul className="from-ul">
            {shown.map((c) => {
              const on = c.country === startCountry;
              return (
                <li key={c.country}>
                  <button type="button" className={`from-row${on ? ' is-on' : ''}`} aria-current={on ? 'true' : undefined} onClick={() => pickCountry(c)}>
                    <span className="from-row-flag" aria-hidden="true">{c.iso2 && <CountryFlag country={c.iso2} size={14} />}</span>
                    <span className="from-row-main"><span className="from-row-name">{c.country}</span></span>
                    {on && <CheckIcon size={16} className="from-row-tick" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="from-panel">
      <div className="from-picked">
        <button type="button" className="from-row is-on" aria-current="true" onClick={() => pickCountry(open)}>
          <span className="from-row-flag" aria-hidden="true">{open.iso2 && <CountryFlag country={open.iso2} size={14} />}</span>
          <span className="from-row-main">
            <span className="from-row-name">{open.country}</span>
            {exact && <span className="from-row-sub">{exact.name}</span>}
          </span>
          <CheckIcon size={16} className="from-row-tick" />
        </button>
        <Button variant="quiet" size="sm" className="from-change" onClick={() => { setCountry(null); setHits(null); setQuery(''); }}>
          {t('from.change')}
        </Button>
      </div>
      <label className="from-exact-label" htmlFor="from-exact">{t('from.exactLabel')}</label>
      <div className="from-field">
        <MapPinIcon size={18} className="from-field-icon" />
        <input id="from-exact" className="from-input" type="search" value={query}
          onChange={(e) => { setQuery(e.target.value); setHits(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
          autoComplete="off" enterKeyHint="search" />
      </div>
      {locate}
      <div className="from-list">
        {hits && hits.length > 0 && (
          <ul className="from-ul">
            {hits.map((p, i) => (
              <li key={`hit${i}`}>
                <button type="button" className="from-row" onClick={() => { onPick(p); setHits(null); setQuery(''); }}>
                  <MapPinIcon size={16} className="from-row-icon" />
                  <span className="from-row-main">
                    <span className="from-row-name">{p.name}</span>
                    <span className="from-row-sub">{p.sub}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {hits && hits.length === 0 && <p className="from-note" role="status">{t('from.noMatch', { query: query.trim() })}</p>}
        {!hits && query.trim().length >= 3 && (
          <button type="button" className="from-row from-europe" onClick={search} disabled={busy}>
            <SearchIcon size={16} className="from-row-icon" />
            <span className="from-row-main">
              <span className="from-row-name">{busy ? t('from.searching') : t('from.inCountry', { query: query.trim(), country: open.country })}</span>
            </span>
          </button>
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
