import React, { useMemo, useRef, useState } from 'react';
import { DateField } from '../components/DateField.jsx';
import { SearchIcon, CloseIcon, MapPinIcon } from '../components/Icons.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { searchFold } from '../lib/textSearch.js';
import { useI18n } from '../i18n/index.jsx';
import { nightsBetween } from './pastTrip.js';

/**
 * PastTripForm, the short questionnaire behind "Add a past trip".
 *
 * Three questions, in the order anyone tells the story in: where you went,
 * when you were there, and what you call it. Cities come out of the catalogue
 * so the saved trip arrives with real coordinates, a real country and a real
 * photograph, which is what makes the card indistinguishable from a trip the
 * app planned itself.
 *
 * The last day cannot be today or later: a trip that has not finished yet is
 * a planned trip, and the Planned tab already owns those.
 */

const MAX_RESULTS = 7;
const MAX_STOPS = 8;

export function PastTripForm({ destinations, todayIso, busy, error, onCancel, onSave }) {
  const { t } = useI18n();
  const [places, setPlaces] = useState([]);
  const [query, setQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [label, setLabel] = useState('');
  const searchRef = useRef(null);

  // One entry per city name, the best-rated catalogue record winning the name,
  // the same rule the record's map and photo lookups already use.
  const cityIndex = useMemo(() => {
    const byKey = new Map();
    for (const [id, d] of Object.entries(destinations || {})) {
      if (!d?.city) continue;
      const key = `${searchFold(d.city)}|${d.country || ''}`;
      const score = d.rating?.score ?? d.beauty?.score ?? 0;
      const cur = byKey.get(key);
      if (!cur || score > cur.score) {
        byKey.set(key, { id, city: d.city, country: d.country || '', score });
      }
    }
    return [...byKey.values()];
  }, [destinations]);

  const results = useMemo(() => {
    const q = searchFold(query);
    if (q.length < 2) return [];
    const taken = new Set(places.map((p) => p.id));
    const hits = [];
    for (const c of cityIndex) {
      if (taken.has(c.id)) continue;
      const city = searchFold(c.city);
      let rank = -1;
      if (city.startsWith(q)) rank = 0;
      else if (city.includes(q)) rank = 1;
      else if (searchFold(c.country).startsWith(q)) rank = 2;
      if (rank < 0) continue;
      hits.push({ ...c, rank });
    }
    hits.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : b.score - a.score));
    return hits.slice(0, MAX_RESULTS);
  }, [query, cityIndex, places]);

  const addPlace = (c) => {
    setPlaces((prev) => (
      prev.length >= MAX_STOPS ? prev : [...prev, { id: c.id, city: c.city, country: c.country }]
    ));
    setQuery('');
    if (searchRef.current) searchRef.current.focus();
  };
  const dropPlace = (id) => setPlaces((prev) => prev.filter((p) => p.id !== id));

  // Yesterday is the latest day a finished trip can end on.
  const lastAllowed = useMemo(() => {
    const [y, m, d] = todayIso.split('-').map(Number);
    const back = new Date(Date.UTC(y, m - 1, d - 1));
    const pad = (n) => String(n).padStart(2, '0');
    return `${back.getUTCFullYear()}-${pad(back.getUTCMonth() + 1)}-${pad(back.getUTCDate())}`;
  }, [todayIso]);

  const ready = places.length > 0 && !!startDate && !!endDate
    && endDate >= startDate && endDate <= lastAllowed;
  const nights = startDate && endDate && endDate >= startDate
    ? nightsBetween(startDate, endDate) : null;

  return (
    <div className="pasttrip-form">
      <div className="pasttrip-field">
        <span className="pasttrip-label">{t('saved.pastWhere')}</span>
        {places.length > 0 && (
          <div className="pasttrip-chips">
            {places.map((p) => (
              <span key={p.id} className="pasttrip-chip">
                {p.country && <CountryFlag country={p.country} size={13} />}
                <span className="pasttrip-chip-city">{p.city}</span>
                <button
                  className="pasttrip-chip-x"
                  onClick={() => dropPlace(p.id)}
                  aria-label={t('saved.pastDropCity', { name: p.city })}
                  title={t('saved.pastDropCity', { name: p.city })}
                >
                  <CloseIcon size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="pasttrip-search">
          <SearchIcon size={14} className="pasttrip-search-icon" />
          <input
            ref={searchRef}
            className="pasttrip-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results.length) { e.preventDefault(); addPlace(results[0]); }
            }}
            placeholder={t('saved.pastCityPlaceholder')}
            aria-label={t('saved.pastWhere')}
          />
        </div>
        {results.length > 0 && (
          <div className="pasttrip-results">
            {results.map((c) => (
              <button key={c.id} className="pasttrip-result" onClick={() => addPlace(c)}>
                <MapPinIcon size={14} />
                <span className="pasttrip-result-city">{c.city}</span>
                <span className="pasttrip-result-country">{c.country}</span>
              </button>
            ))}
          </div>
        )}
        {query.trim().length >= 2 && results.length === 0 && (
          <p className="pasttrip-note">{t('saved.pastNoCity')}</p>
        )}
      </div>

      <div className="pasttrip-field">
        <span className="pasttrip-label">{t('saved.pastWhen')}</span>
        <div className="pasttrip-dates">
          <div className="pasttrip-datecell">
            <span className="pasttrip-sublabel">{t('saved.pastFirstDay')}</span>
            <DateField
              value={startDate}
              max={lastAllowed}
              onChange={(v) => { setStartDate(v); if (endDate && endDate < v) setEndDate(v); }}
              placeholder={t('saved.pastPickDate')}
            />
          </div>
          <div className="pasttrip-datecell">
            <span className="pasttrip-sublabel">{t('saved.pastLastDay')}</span>
            <DateField
              value={endDate}
              min={startDate || undefined}
              max={lastAllowed}
              onChange={setEndDate}
              placeholder={t('saved.pastPickDate')}
            />
          </div>
        </div>
        {nights != null && (
          <p className="pasttrip-note">
            {t(nights === 1 ? 'saved.pastNights1' : 'saved.pastNightsN', { n: nights })}
          </p>
        )}
      </div>

      <div className="pasttrip-field">
        <span className="pasttrip-label">{t('saved.pastName')}</span>
        <input
          className="pasttrip-input is-plain"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('saved.pastNamePlaceholder')}
          maxLength={60}
          aria-label={t('saved.pastName')}
        />
      </div>

      {error && <p className="pasttrip-error">{error}</p>}

      <div className="pasttrip-actions">
        <button className="pasttrip-cancel" onClick={onCancel} disabled={busy}>
          {t('saved.pastCancel')}
        </button>
        <button
          className="pasttrip-save"
          disabled={!ready || busy}
          onClick={() => onSave({ label: label.trim(), places, startDate, endDate })}
        >
          {busy ? t('saved.pastSaving') : t('saved.pastSave')}
        </button>
      </div>
    </div>
  );
}
