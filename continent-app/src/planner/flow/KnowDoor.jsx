import React, { useId, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useFirstRun } from '../../lib/firstRunContext.js';
import { Button, Chip } from '../../components/ui/index.js';
import { CloseIcon, GlobeIcon, MapPinIcon, SearchIcon } from '../../components/Icons.jsx';
import { foldName, nameRank, rankPlaces } from '../../lib/placeSearch.js';
import { cityLabel } from '../../lib/placeName.js';
import { isGateway } from '../../lib/rating.js';
import { SheetHead } from './PlanStage.jsx';

/** How many suggestions show under the field. */
const SUGGEST = 6;

/** The catalogue's towns (no airport rows) and its countries, once per catalogue. */
const catalogues = new WeakMap();
function placeRows(destinations) {
  if (!destinations) return { towns: [], countries: [] };
  let rows = catalogues.get(destinations);
  if (!rows) {
    const towns = [];
    const countries = new Map();
    const seen = new Set();
    for (const [id, d] of Object.entries(destinations)) {
      if (!d || d.lat == null || isGateway(d)) continue;
      const city = cityLabel(d.city || '');
      const key = `${d.iso2}|${foldName(city)}`;
      if (city && !seen.has(key)) { seen.add(key); towns.push({ id, city, iso2: d.iso2 || '', country: d.country || '', score: d.rating?.score || 0 }); }
      if (d.iso2 && d.country && !countries.has(d.iso2)) countries.set(d.iso2, { id: d.iso2, city: d.country, iso2: d.iso2, country: d.country });
    }
    // The better rated town of a name first, so "Valencia" is the Spanish city.
    towns.sort((a, b) => b.score - a.score);
    rows = { towns, countries: [...countries.values()] };
    catalogues.set(destinations, rows);
  }
  return rows;
}

/**
 * A search over the catalogue's towns (and its countries with `countries`),
 * suggestions as buttons under the field. Picking one calls onPick with a
 * named place ({ kind, id, name, iso2, country }) and clears the field.
 */
export function PlaceSearch({ label, onPick, countries = true, exclude = [] }) {
  const { t } = useI18n();
  const ctx = useFirstRun();
  const uid = useId();
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  const rows = placeRows(ctx?.data?.destinations);
  const term = foldName(q.trim());
  const hits = useMemo(() => {
    if (term.length < 2) return [];
    const skip = new Set(exclude);
    const cs = countries
      ? rows.countries.filter((c) => !skip.has(`country:${c.id}`) && nameRank(c.city, term) >= 0 && nameRank(c.city, term) <= 1)
        .slice(0, 2).map((c) => ({ kind: 'country', id: c.id, name: c.country, iso2: c.iso2, country: c.country }))
      : [];
    const ts = rankPlaces(rows.towns.filter((r) => !skip.has(`place:${r.id}`)), term, SUGGEST)
      .map((r) => ({ kind: 'place', id: r.id, name: r.city, iso2: r.iso2, country: r.country }));
    return [...cs, ...ts].slice(0, SUGGEST);
  }, [term, rows, countries, exclude]);
  const pick = (p) => { onPick(p); setQ(''); inputRef.current?.focus(); };
  return (
    <div className="pf-place-search">
      <label className="pf-label" htmlFor={`${uid}-q`}>{label}</label>
      <div className="pf-place-field">
        <SearchIcon size={16} aria-hidden="true" />
        <input
          ref={inputRef}
          id={`${uid}-q`}
          className="pf-place-input"
          type="search"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) { e.preventDefault(); pick(hits[0]); } }}
          aria-describedby={`${uid}-status`}
        />
      </div>
      {hits.length > 0 && (
        <ul className="pf-place-hits" aria-label={label}>
          {hits.map((p) => (
            <li key={`${p.kind}:${p.id}`}>
              <Button variant="quiet" block className="pf-place-hit" onClick={() => pick(p)}
                iconStart={p.kind === 'country' ? <GlobeIcon size={16} /> : <MapPinIcon size={16} />}>
                <span className="pf-place-hit-name">{p.name}</span>
                {p.kind === 'place' && <span className="pf-place-hit-sub">{p.country}</span>}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="sr-only" id={`${uid}-status`} aria-live="polite">
        {term.length >= 2 && !hits.length ? t('kw.noMatch') : ''}
      </p>
      {term.length >= 2 && !hits.length && <p className="pf-note" aria-hidden="true">{t('kw.noMatch')}</p>}
    </div>
  );
}

/**
 * I know where I'm going (T865), the places: the towns and countries the
 * words named, preselected (row T859-b), as chips that take one away, and a
 * search to add more. "Draft my route" goes on to the priced route.
 *
 *   onGo(places)   the places to build the route through
 */
export function KnowDoor({ settings, onBack, onGo }) {
  const { t } = useI18n();
  const [places, setPlaces] = useState(() => settings.places || []);
  const keyOf = (p) => `${p.kind}:${p.id}`;
  const add = (p) => setPlaces((cur) => (cur.some((x) => keyOf(x) === keyOf(p)) ? cur : [...cur, p].slice(0, 6)));
  const remove = (p) => setPlaces((cur) => cur.filter((x) => keyOf(x) !== keyOf(p)));
  return (
    <div className="pf-step">
      <SheetHead onBack={onBack} backLabel={t('pf.back')} />
      <h2 className="pf-title" tabIndex={-1}>{t('kw.title')}</h2>
      {places.length > 0 ? (
        <div className="pf-know-picked">
          <p className="pf-label" id="pf-know-picked">{t('kw.picked')}</p>
          <ul className="pf-read-chips" aria-labelledby="pf-know-picked">
            {places.map((p) => (
              <li key={keyOf(p)}>
                <Chip kind="filter" selected aria-pressed={undefined} className="pf-know-chip"
                  aria-label={t('kw.remove', { place: p.name })} onClick={() => remove(p)}>
                  {p.name}
                  <CloseIcon size={14} aria-hidden="true" />
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="pf-help">{t('kw.none')}</p>
      )}
      <PlaceSearch label={t('kw.add')} onPick={add} exclude={places.map(keyOf)} />
      <div className="pf-foot">
        <Button variant="primary" block disabled={!places.length} onClick={() => onGo(places)}>{t('kw.go')}</Button>
      </div>
    </div>
  );
}
