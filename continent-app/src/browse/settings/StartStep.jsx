import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { CrosshairIcon } from '../../components/Icons.jsx';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { countryName } from '../../lib/countryName.js';
import { orderedCountries, townRows, searchStart } from './startModel.js';

/** The reader's own country from the browser's language ("nl-BE" is BE),
 *  for the top of the list before they have picked one. */
function browserCountry() {
  const tags = typeof navigator !== 'undefined' ? [...(navigator.languages || []), navigator.language] : [];
  for (const tag of tags) {
    const m = /-([A-Z]{2})$/i.exec(tag || '');
    if (m) return m[1].toUpperCase();
  }
  return '';
}

/** The ISO2 of the home airport's country, read off the catalogue (airports
 *  carry the country's name only). */
function originIso(data, code) {
  const name = data?.meta?.origins?.[code]?.country;
  if (!name) return '';
  for (const d of Object.values(data?.destinations || {})) if (d?.country === name && d.iso2) return d.iso2;
  return '';
}

// The countries drawn with the step; the rest follow a frame later (a phone
// sheet shows about eleven).
const FIRST_COUNTRIES = 16;

/**
 * Start (G12 Settings, APPROVED): "Use my current location" first, then a
 * search over the countries and the towns in Carta's data, then every
 * country A to Z with its flag, the traveller's own on top. No airports
 * anywhere: the engine picks the airport that suits a flight, quietly.
 */
export function StartStep({ model, onChange }) {
  const { t, lang } = useI18n();
  const { start, data } = model;
  const [query, setQuery] = React.useState('');
  const [locating, setLocating] = React.useState(false);
  const [locNote, setLocNote] = React.useState('');

  // The start's own country on top (flow-B M3): a country start, a town's
  // country, the home airport's country, and only then the browser's.
  const home = start.country || start.place?.iso2 || originIso(data, model.m?.origin) || browserCountry();
  // The list keeps the order it opened with, so a pick never moves the row
  // under the finger.
  const [homeAtOpen] = React.useState(home);
  const countries = React.useMemo(
    () => orderedCountries((iso) => countryName(iso), homeAtOpen, lang),
    [homeAtOpen, lang],
  );
  const typing = query.trim().length > 0;
  // G12, D10 (round 7): the towns are read only once the traveller types
  // (every place of the catalogue, 0.1 s at 4x CPU in the tap that opened
  // the step), and the country list draws its first rows with the step and
  // the rest a frame later, below the fold.
  const towns = React.useMemo(() => (typing ? townRows(data?.destinations) : []), [typing, data?.destinations]);
  const hits = React.useMemo(() => (typing ? searchStart(query, countries, towns) : null), [typing, query, countries, towns]);
  const [allCountries, setAllCountries] = React.useState(false);
  React.useEffect(() => {
    if (allCountries) return undefined;
    let timer = 0;
    const frame = requestAnimationFrame(() => { timer = setTimeout(() => setAllCountries(true), 0); });
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [allCountries]);

  const pickCountry = (iso2) => {
    setLocNote('');
    // A country with no town Carta can start from says so, and the list stays.
    if (start.setCountry(iso2)) onChange();
    else setLocNote(t('settings.sheet.countryNone', { country: countryName(iso2) }));
  };
  const pickTown = (town) => { start.setPlace(town); setLocNote(''); onChange(); };

  const locate = () => {
    if (!navigator.geolocation) { setLocNote(t('settings.sheet.hereFailed')); return; }
    setLocating(true);
    setLocNote('');
    navigator.geolocation.getCurrentPosition((pos) => {
      const pt = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      setLocating(false);
      if (start.setHere(pt)) onChange();
      else setLocNote(t('settings.sheet.hereFar'));
    }, () => {
      setLocating(false);
      setLocNote(t('settings.sheet.hereFailed'));
    }, { timeout: 10000, maximumAge: 600000 });
  };

  const isCountryOn = (iso2) => start.kind === 'country' && start.country === iso2;
  const isTownOn = (town) => start.kind !== 'country' && start.place?.name === town.name
    && Math.abs((start.place?.lat ?? 99) - town.lat) < 0.3;

  const countryRow = (c) => {
    const on = isCountryOn(c.iso2);
    return (
      <li key={c.iso2}>
        <Pressable className={`set-pick${on ? ' is-on' : ''}`} aria-current={on ? 'true' : undefined}
          haptic={on ? null : 'tick'} onClick={() => pickCountry(c.iso2)}>
          <span className="set-pick-flag" aria-hidden="true"><CountryFlag country={c.iso2} size={16} /></span>
          <span className="set-pick-name">{c.name}</span>
          {on && <span className="set-pick-tick" aria-hidden="true"><HouseIcon.check size={12} /></span>}
        </Pressable>
      </li>
    );
  };
  const townRow = (town) => {
    const on = isTownOn(town);
    return (
      <li key={town.id}>
        <Pressable className={`set-pick${on ? ' is-on' : ''}`} aria-current={on ? 'true' : undefined}
          haptic={on ? null : 'tick'} onClick={() => pickTown(town)}>
          <span className="set-pick-pin" aria-hidden="true"><HouseIcon.pin size={18} /></span>
          <span className="set-pick-name">
            {town.name}
            <span className="set-pick-sub">{town.iso2 ? countryName(town.iso2, town.country) : town.country}</span>
          </span>
          {on && <span className="set-pick-tick" aria-hidden="true"><HouseIcon.check size={12} /></span>}
        </Pressable>
      </li>
    );
  };

  const hereOn = start.kind === 'here';
  return (
    <div className="set-step set-start">
      <Pressable className={`set-here${hereOn ? ' is-on' : ''}`} aria-busy={locating || undefined}
        aria-current={hereOn ? 'true' : undefined} onClick={locate} disabled={locating}>
        <span className="set-here-ic" aria-hidden="true">
          {locating ? <span className="set-spin" /> : <CrosshairIcon size={20} />}
        </span>
        <span className="set-here-text">
          {locating ? t('settings.sheet.locating') : t('settings.sheet.here')}
          {hereOn && start.place?.name && <span className="set-pick-sub">{start.place.name}</span>}
        </span>
        {hereOn && <span className="set-pick-tick" aria-hidden="true"><HouseIcon.check size={12} /></span>}
      </Pressable>
      {/* Denied or failed: one plain line, and the list stays. */}
      <p className="set-note" role="status">{locNote}</p>

      <div className="set-search">
        <HouseIcon.search size={18} className="set-search-ic" />
        <input
          className="set-search-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('settings.sheet.searchStart')}
          aria-label={t('settings.sheet.searchStart')}
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>

      {typing ? (
        <div className="set-results" aria-live="polite">
          {hits.countries.length > 0 && <ul className="set-picks">{hits.countries.map(countryRow)}</ul>}
          {hits.towns.length > 0 && <ul className="set-picks">{hits.towns.map(townRow)}</ul>}
          {!hits.countries.length && !hits.towns.length && (
            <p className="set-note">{t('settings.sheet.noMatch', { query: query.trim() })}</p>
          )}
        </div>
      ) : (
        <section aria-labelledby="set-countries">
          <h3 className="set-label" id="set-countries">{t('settings.sheet.countries')}</h3>
          <ul className="set-picks">{(allCountries ? countries : countries.slice(0, FIRST_COUNTRIES)).map(countryRow)}</ul>
        </section>
      )}
    </div>
  );
}
