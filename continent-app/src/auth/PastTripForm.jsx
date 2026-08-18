import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DateField } from '../components/DateField.jsx';
import {
  SearchIcon, CloseIcon, MapPinIcon, PlusIcon, TrashIcon, CameraIcon, StarIcon,
  PersonIcon, ReceiptIcon, BedIcon, RouteIcon, ChevronDownIcon,
  TrainIcon, BusIcon, CarIcon, FerryIcon, BikeIcon, BootIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { searchFold } from '../lib/textSearch.js';
import { CURRENCIES, parseAmount } from '../lib/currency.js';
import { eur } from '../lib/format.js';
import { lookupPlace } from '../lib/cityResearch.js';
import { useI18n } from '../i18n/index.jsx';
import { nightsBetween, nightsFor, moveNight, defaultPastLabel } from './pastTrip.js';
import {
  SPEND_CATS, TRIP_MODES, STAY_KINDS, MAX_PHOTOS, emptyMemory, spendSummary, spendPerPerson,
} from './pastTripMemory.js';

/**
 * PastTripForm, everything a traveller can say about a trip they already took.
 *
 * The first section is the only one that has to be answered, where you went
 * and when, because that is what files the trip into the record. Everything
 * under it is optional and folded away until wanted: who came, how you
 * travelled, where you slept, what it cost, how it was, and the photographs.
 * Each folded section says in one line what is already in it, so the form
 * reads as a summary of the trip once it is filled.
 *
 * Cities come from the catalogue first, which is what gives a logged trip real
 * coordinates, a country and a photograph. A place Carta has never held is
 * geocoded on request and kept with its own coordinates, so a week in a
 * village still pins on the record's map.
 *
 * The last day cannot be today or later: a trip that has not finished yet is a
 * planned trip, and the Planned tab already owns those.
 */

const MAX_RESULTS = 7;
const MAX_STOPS = 12;

// The transport vocabulary the itinerary already uses, plus the two ways of
// travelling that only a past trip ever reports.
const MODE_ICONS = {
  fly: PlaneIcon, train: TrainIcon, bus: BusIcon, car: CarIcon,
  ferry: FerryIcon, bike: BikeIcon, walk: BootIcon,
};
const MODE_LABEL = {
  fly: 'trip.modeFly', train: 'trip.modeTrain', bus: 'trip.modeBus', car: 'trip.modeCar',
  ferry: 'trip.modeFerry', bike: 'saved.pastModeBike', walk: 'saved.pastModeWalk',
};
const MAX_PHOTO_EDGE = 1000;
const PHOTO_QUALITY = 0.72;
// localStorage holds the memory for guests and the account row carries it for
// everyone else, so the photographs are kept to a sane weight rather than a
// generous one.
const PHOTO_BUDGET_BYTES = 1_600_000;

/* ---------- photographs ---------- */

// Downscale in the browser: a phone photo is 4 MB of pixels nobody needs in a
// 320px card, and the memory has to survive being stored.
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode'));
      img.onload = () => {
        const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- one folded section ---------- */

function Fold({ icon, title, summary, open, onToggle, children }) {
  return (
    <div className={`pasttrip-fold${open ? ' is-open' : ''}`}>
      <button className="pasttrip-fold-head" onClick={onToggle} aria-expanded={open}>
        <span className="pasttrip-fold-mark">{icon}</span>
        <span className="pasttrip-fold-title">{title}</span>
        {!open && summary && <span className="pasttrip-fold-sum">{summary}</span>}
        <ChevronDownIcon size={15} className="pasttrip-fold-chev" />
      </button>
      {open && <div className="pasttrip-fold-body">{children}</div>}
    </div>
  );
}

/** The one row of transport glyphs, shared by every leg. */
function ModeRow({ value, onPick, t }) {
  return (
    <div className="pasttrip-modes">
      {TRIP_MODES.map((m) => {
        const Icon = MODE_ICONS[m];
        return (
          <button
            key={m}
            className={`pasttrip-mode${value === m ? ' on' : ''}`}
            onClick={() => onPick(value === m ? '' : m)}
            title={t(MODE_LABEL[m])}
            aria-label={t(MODE_LABEL[m])}
            aria-pressed={value === m}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}

function Stepper({ value, min = 0, max = 99, onChange, label }) {
  return (
    <span className="pasttrip-stepper" role="group" aria-label={label}>
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`${label} -1`}>-</button>
      <span className="pasttrip-stepper-val">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`${label} +1`}>+</button>
    </span>
  );
}

export function PastTripForm({ destinations, todayIso, busy, error, initial, onCancel, onSave }) {
  const { t } = useI18n();
  const [places, setPlaces] = useState(() => initial?.places || []);
  const [query, setQuery] = useState('');
  const [startDate, setStartDate] = useState(() => initial?.startDate || '');
  const [endDate, setEndDate] = useState(() => initial?.endDate || '');
  const [label, setLabel] = useState(() => initial?.label || '');
  const [mem, setMem] = useState(() => ({ ...emptyMemory(), ...(initial?.memory || {}) }));
  const [open, setOpen] = useState('where');
  const [geo, setGeo] = useState({ busy: false, hit: null, miss: false });
  const [photoNote, setPhotoNote] = useState('');
  const [highlight, setHighlight] = useState('');
  const searchRef = useRef(null);
  const fileRef = useRef(null);

  const patchMem = (patch) => setMem((m) => ({ ...m, ...patch }));
  const toggle = (key) => setOpen((cur) => (cur === key ? '' : key));

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
        const lat = d.city_lat != null ? d.city_lat : d.lat;
        const lon = d.city_lon != null ? d.city_lon : d.lon;
        byKey.set(key, { id, city: d.city, country: d.country || '', lat, lon, score });
      }
    }
    return [...byKey.values()];
  }, [destinations]);

  const results = useMemo(() => {
    const q = searchFold(query);
    if (q.length < 2) return [];
    const taken = new Set(places.map((p) => p.id).filter(Boolean));
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

  // A typed name with no catalogue match is not a dead end: it is geocoded on
  // request (never on every keystroke, the geocoder is somebody else's server)
  // and joins the trip with its own coordinates.
  useEffect(() => { setGeo({ busy: false, hit: null, miss: false }); }, [query]);
  const geocode = async () => {
    const name = query.trim();
    if (name.length < 2) return;
    setGeo({ busy: true, hit: null, miss: false });
    try {
      const hit = await lookupPlace(name);
      setGeo({ busy: false, hit, miss: !hit });
    } catch {
      setGeo({ busy: false, hit: null, miss: true });
    }
  };

  const addPlace = (p) => {
    setPlaces((prev) => (prev.length >= MAX_STOPS ? prev : [...prev, {
      id: p.id || null,
      city: p.city || p.name,
      country: p.country || '',
      lat: p.lat ?? null,
      lon: p.lon ?? null,
      nights: null,
      stay: { name: '', kind: '' },
    }]));
    setQuery('');
    setGeo({ busy: false, hit: null, miss: false });
    if (searchRef.current) searchRef.current.focus();
  };
  const dropPlace = (i) => setPlaces((prev) => prev.filter((_, j) => j !== i));
  const patchPlace = (i, patch) => setPlaces((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  // Yesterday is the latest day a finished trip can end on.
  const lastAllowed = useMemo(() => {
    const [y, m, d] = todayIso.split('-').map(Number);
    const back = new Date(Date.UTC(y, m - 1, d - 1));
    const pad = (n) => String(n).padStart(2, '0');
    return `${back.getUTCFullYear()}-${pad(back.getUTCMonth() + 1)}-${pad(back.getUTCDate())}`;
  }, [todayIso]);

  const datesOk = !!startDate && !!endDate && endDate >= startDate && endDate <= lastAllowed;
  const ready = places.length > 0 && datesOk;
  const nights = datesOk ? nightsBetween(startDate, endDate) : null;
  const perPlaceNights = ready ? nightsFor(places, startDate, endDate) : [];

  const setNights = (i, delta) => {
    const next = moveNight(perPlaceNights, i, delta);
    setPlaces((prev) => prev.map((p, j) => ({ ...p, nights: next[j] })));
  };

  /* ---------- legs: arriving at each place, and the journey home ---------- */
  const legs = mem.legs || [];
  const legAt = (i) => legs[i] || { mode: '', note: '' };
  const patchLeg = (i, patch) => {
    const next = Array.from({ length: places.length + 1 }, (_, j) => ({ ...legAt(j) }));
    next[i] = { ...next[i], ...patch };
    patchMem({ legs: next });
  };

  /* ---------- spend ---------- */
  const spend = mem.spend || { currency: 'EUR' };
  const setSpend = (cat, v) => patchMem({ spend: { ...spend, [cat]: v } });
  const summary = spendSummary({ ...mem, spend });
  const perHead = spendPerPerson({ ...mem, spend });

  /* ---------- photographs ---------- */
  const addPhotos = async (fileList) => {
    const files = [...(fileList || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setPhotoNote('');
    let bytes = (mem.photos || []).reduce((n, p) => n + (p.src?.length || 0), 0);
    const added = [];
    for (const file of files) {
      if ((mem.photos?.length || 0) + added.length >= MAX_PHOTOS) {
        setPhotoNote(t('saved.pastPhotoCap', { n: MAX_PHOTOS }));
        break;
      }
      try {
        const src = await readPhoto(file);
        if (bytes + src.length > PHOTO_BUDGET_BYTES) {
          setPhotoNote(t('saved.pastPhotoFull'));
          break;
        }
        bytes += src.length;
        added.push({ id: `ph${Date.now()}${added.length}`, src, caption: '' });
      } catch {
        setPhotoNote(t('saved.pastPhotoFailed'));
      }
    }
    if (added.length) {
      const photos = [...(mem.photos || []), ...added];
      patchMem({ photos, cover: mem.cover || photos[0].id });
    }
    if (fileRef.current) fileRef.current.value = '';
  };
  const dropPhoto = (id) => {
    const photos = (mem.photos || []).filter((p) => p.id !== id);
    patchMem({ photos, cover: mem.cover === id ? (photos[0]?.id || null) : mem.cover });
  };

  /* ---------- summaries for the folded heads ---------- */
  const heads = (Number(mem.travellers?.adults) || 0) + (Number(mem.travellers?.children) || 0);
  const whoSummary = [
    t(heads === 1 ? 'saved.pastTraveller1' : 'saved.pastTravellerN', { n: heads || 1 }),
    mem.companions?.filter(Boolean).length ? mem.companions.filter(Boolean).join(', ') : '',
  ].filter(Boolean).join(', ');
  const modeSummary = [...new Set(legs.map((l) => l?.mode).filter(Boolean))]
    .map((m) => t(MODE_LABEL[m])).join(', ');
  const staySummary = places.map((p) => p.stay?.name).filter(Boolean).join(', ');
  const spendSum = summary.any
    ? `${eur(summary.total)}${perHead && heads > 1 ? ` (${eur(perHead)} ${t('saved.pastEach')})` : ''}`
    : '';
  const feelSummary = [
    mem.rating != null ? `${mem.rating}/10` : '',
    mem.story?.trim() ? t('saved.pastStoryWritten') : '',
    mem.highlights?.filter(Boolean).length
      ? t('saved.pastHighlightsN', { n: mem.highlights.filter(Boolean).length }) : '',
  ].filter(Boolean).join(', ');
  const photoSummary = mem.photos?.length
    ? t(mem.photos.length === 1 ? 'saved.pastPhotos1' : 'saved.pastPhotosN', { n: mem.photos.length })
    : '';

  const submit = () => {
    const cleaned = {
      ...mem,
      companions: (mem.companions || []).map((c) => c.trim()).filter(Boolean),
      highlights: (mem.highlights || []).map((h) => h.trim()).filter(Boolean),
      legs: legs.slice(0, places.length + 1),
      places: places.map((p, i) => ({
        id: p.id || null,
        city: p.city,
        country: p.country || '',
        lat: p.lat ?? null,
        lon: p.lon ?? null,
        nights: perPlaceNights[i] ?? null,
        stay: p.stay?.name || p.stay?.kind ? p.stay : null,
      })),
      spend: Object.fromEntries(
        Object.entries(spend).map(([k, v]) => [k, k === 'currency' ? v : (parseAmount(v) ?? undefined)]),
      ),
    };
    onSave({
      label: label.trim() || defaultPastLabel(places),
      places: places.map((p, i) => ({ ...p, nights: perPlaceNights[i] ?? null })),
      startDate,
      endDate,
      memory: cleaned,
    });
  };

  return (
    <div className="pasttrip-form">
      {/* ── Where and when: the only answers the record needs ── */}
      <div className="pasttrip-field">
        <span className="pasttrip-label">{t('saved.pastWhere')}</span>
        {places.length > 0 && (
          <div className="pasttrip-places">
            {places.map((p, i) => (
              <div className="pasttrip-place" key={`${p.id || p.city}${i}`}>
                <span className="pasttrip-place-mark">
                  {p.country ? <CountryFlag country={p.country} size={13} /> : <MapPinIcon size={13} />}
                </span>
                <span className="pasttrip-place-name">
                  {p.city}
                  {!p.id && <span className="pasttrip-place-own">{t('saved.pastOwnPlace')}</span>}
                </span>
                {ready && places.length > 1 && (
                  <span className="pasttrip-place-nights">
                    <Stepper
                      value={perPlaceNights[i] ?? 0}
                      max={nights}
                      onChange={(v) => setNights(i, v - (perPlaceNights[i] ?? 0))}
                      label={t('saved.pastNightsHere', { city: p.city })}
                    />
                    <small>{t((perPlaceNights[i] ?? 0) === 1 ? 'saved.pastNights1' : 'saved.pastNightsN', { n: perPlaceNights[i] ?? 0 })}</small>
                  </span>
                )}
                <button
                  className="pasttrip-place-x"
                  onClick={() => dropPlace(i)}
                  aria-label={t('saved.pastDropCity', { name: p.city })}
                  title={t('saved.pastDropCity', { name: p.city })}
                >
                  <CloseIcon size={11} />
                </button>
              </div>
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
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (results.length) addPlace(results[0]);
              else geocode();
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
        {/* Anywhere else on the map, on request. */}
        {query.trim().length >= 2 && results.length === 0 && (
          <div className="pasttrip-geo">
            {geo.hit ? (
              <button className="pasttrip-result is-found" onClick={() => addPlace(geo.hit)}>
                <MapPinIcon size={14} />
                <span className="pasttrip-result-city">{geo.hit.name}</span>
                <span className="pasttrip-result-country">{geo.hit.country}</span>
              </button>
            ) : (
              <>
                <p className="pasttrip-note">{geo.miss ? t('saved.pastNoPlace') : t('saved.pastNoCity')}</p>
                <button className="pasttrip-ghost" onClick={geocode} disabled={geo.busy}>
                  {geo.busy ? t('saved.pastLooking') : t('saved.pastFindAnywhere', { name: query.trim() })}
                </button>
              </>
            )}
          </div>
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
          placeholder={places.length ? defaultPastLabel(places) : t('saved.pastNamePlaceholder')}
          maxLength={60}
          aria-label={t('saved.pastName')}
        />
      </div>

      {/* ── Everything else, folded until it is wanted ── */}
      <div className="pasttrip-folds">
        <Fold
          icon={<PersonIcon size={13} />}
          title={t('saved.pastWho')}
          summary={whoSummary}
          open={open === 'who'}
          onToggle={() => toggle('who')}
        >
          <div className="pasttrip-row">
            <span className="pasttrip-sublabel">{t('saved.pastAdults')}</span>
            <Stepper
              value={Number(mem.travellers?.adults) || 0}
              min={1}
              max={20}
              label={t('saved.pastAdults')}
              onChange={(v) => patchMem({ travellers: { ...mem.travellers, adults: v } })}
            />
            <span className="pasttrip-sublabel">{t('saved.pastChildren')}</span>
            <Stepper
              value={Number(mem.travellers?.children) || 0}
              max={20}
              label={t('saved.pastChildren')}
              onChange={(v) => patchMem({ travellers: { ...mem.travellers, children: v } })}
            />
          </div>
          <span className="pasttrip-sublabel">{t('saved.pastCompanions')}</span>
          {(mem.companions || []).map((name, i) => (
            <div className="pasttrip-listrow" key={`c${i}`}>
              <input
                className="pasttrip-input is-plain"
                value={name}
                placeholder={t('saved.pastCompanionPlaceholder')}
                onChange={(e) => patchMem({
                  companions: (mem.companions || []).map((c, j) => (j === i ? e.target.value : c)),
                })}
              />
              <button
                className="pasttrip-ghost is-icon"
                onClick={() => patchMem({ companions: (mem.companions || []).filter((_, j) => j !== i) })}
                aria-label={t('saved.pastRemoveLine')}
              >
                <TrashIcon size={13} />
              </button>
            </div>
          ))}
          <button className="pasttrip-ghost" onClick={() => patchMem({ companions: [...(mem.companions || []), ''] })}>
            <PlusIcon size={13} /> {t('saved.pastAddCompanion')}
          </button>
        </Fold>

        <Fold
          icon={<RouteIcon size={13} />}
          title={t('saved.pastHow')}
          summary={modeSummary}
          open={open === 'how'}
          onToggle={() => toggle('how')}
        >
          {places.length === 0 && <p className="pasttrip-note">{t('saved.pastAddPlacesFirst')}</p>}
          {places.map((p, i) => (
            <div className="pasttrip-leg" key={`l${i}`}>
              <span className="pasttrip-sublabel">
                {i === 0 ? t('saved.pastLegOut', { city: p.city }) : t('saved.pastLegOn', { city: p.city })}
              </span>
              <ModeRow value={legAt(i).mode} onPick={(mode) => patchLeg(i, { mode })} t={t} />
            </div>
          ))}
          {places.length > 0 && (
            <div className="pasttrip-leg">
              <span className="pasttrip-sublabel">{t('saved.pastLegHome')}</span>
              <ModeRow
                value={legAt(places.length).mode}
                onPick={(mode) => patchLeg(places.length, { mode })}
                t={t}
              />
            </div>
          )}
        </Fold>

        <Fold
          icon={<BedIcon size={13} />}
          title={t('saved.pastStay')}
          summary={staySummary}
          open={open === 'stay'}
          onToggle={() => toggle('stay')}
        >
          {places.length === 0 && <p className="pasttrip-note">{t('saved.pastAddPlacesFirst')}</p>}
          {places.map((p, i) => (
            <div className="pasttrip-stay" key={`s${i}`}>
              <span className="pasttrip-sublabel">{p.city}</span>
              <input
                className="pasttrip-input is-plain"
                value={p.stay?.name || ''}
                placeholder={t('saved.pastStayPlaceholder')}
                onChange={(e) => patchPlace(i, { stay: { ...p.stay, name: e.target.value } })}
                aria-label={t('saved.pastStayWhere', { city: p.city })}
              />
              <select
                className="pasttrip-select"
                value={p.stay?.kind || ''}
                onChange={(e) => patchPlace(i, { stay: { ...p.stay, kind: e.target.value } })}
                aria-label={t('saved.pastStayKind', { city: p.city })}
              >
                <option value="">{t('saved.pastStayKindAny')}</option>
                {STAY_KINDS.map((k) => <option key={k} value={k}>{t(`saved.pastStay_${k}`)}</option>)}
              </select>
            </div>
          ))}
        </Fold>

        <Fold
          icon={<ReceiptIcon size={13} />}
          title={t('saved.pastCost')}
          summary={spendSum}
          open={open === 'cost'}
          onToggle={() => toggle('cost')}
        >
          <div className="pasttrip-row">
            <span className="pasttrip-sublabel">{t('saved.pastCurrency')}</span>
            <select
              className="pasttrip-select is-narrow"
              value={spend.currency || 'EUR'}
              onChange={(e) => setSpend('currency', e.target.value)}
              aria-label={t('saved.pastCurrency')}
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="pasttrip-spend">
            {SPEND_CATS.map((cat) => (
              <label className="pasttrip-spendrow" key={cat}>
                <span className="pasttrip-sublabel">{t(`saved.pastSpend_${cat}`)}</span>
                <input
                  className="pasttrip-input is-amount"
                  inputMode="decimal"
                  value={spend[cat] ?? ''}
                  onChange={(e) => setSpend(cat, e.target.value)}
                  placeholder="0"
                />
              </label>
            ))}
          </div>
          {summary.any && (
            <div className="pasttrip-total">
              <span>{t('saved.pastTotal')}</span>
              <b>{eur(summary.total)}</b>
              {heads > 1 && perHead != null && (
                <small>{t('saved.pastPerPerson', { amount: eur(perHead) })}</small>
              )}
            </div>
          )}
          {summary.foreign && <p className="pasttrip-note">{t('saved.pastRateNote')}</p>}
        </Fold>

        <Fold
          icon={<StarIcon size={13} />}
          title={t('saved.pastFeel')}
          summary={feelSummary}
          open={open === 'feel'}
          onToggle={() => toggle('feel')}
        >
          <span className="pasttrip-sublabel">{t('saved.pastRating')}</span>
          <div className="pasttrip-rating">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                className={`pasttrip-rate${mem.rating === n ? ' on' : ''}`}
                onClick={() => patchMem({ rating: mem.rating === n ? null : n })}
                aria-pressed={mem.rating === n}
                aria-label={t('saved.pastRatingN', { n })}
              >
                {n}
              </button>
            ))}
          </div>
          <span className="pasttrip-sublabel">{t('saved.pastStory')}</span>
          <textarea
            className="pasttrip-textarea"
            value={mem.story || ''}
            rows={4}
            maxLength={4000}
            placeholder={t('saved.pastStoryPlaceholder')}
            onChange={(e) => patchMem({ story: e.target.value })}
            aria-label={t('saved.pastStory')}
          />
          <span className="pasttrip-sublabel">{t('saved.pastHighlights')}</span>
          {(mem.highlights || []).map((h, i) => (
            <div className="pasttrip-listrow" key={`h${i}`}>
              <input
                className="pasttrip-input is-plain"
                value={h}
                onChange={(e) => patchMem({
                  highlights: (mem.highlights || []).map((x, j) => (j === i ? e.target.value : x)),
                })}
              />
              <button
                className="pasttrip-ghost is-icon"
                onClick={() => patchMem({ highlights: (mem.highlights || []).filter((_, j) => j !== i) })}
                aria-label={t('saved.pastRemoveLine')}
              >
                <TrashIcon size={13} />
              </button>
            </div>
          ))}
          <div className="pasttrip-listrow">
            <input
              className="pasttrip-input is-plain"
              value={highlight}
              placeholder={t('saved.pastHighlightPlaceholder')}
              onChange={(e) => setHighlight(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && highlight.trim()) {
                  e.preventDefault();
                  patchMem({ highlights: [...(mem.highlights || []), highlight.trim()] });
                  setHighlight('');
                }
              }}
              aria-label={t('saved.pastHighlights')}
            />
            <button
              className="pasttrip-ghost is-icon"
              disabled={!highlight.trim()}
              onClick={() => {
                patchMem({ highlights: [...(mem.highlights || []), highlight.trim()] });
                setHighlight('');
              }}
              aria-label={t('saved.pastAddHighlight')}
            >
              <PlusIcon size={13} />
            </button>
          </div>
        </Fold>

        <Fold
          icon={<CameraIcon size={13} />}
          title={t('saved.pastPhotos')}
          summary={photoSummary}
          open={open === 'photos'}
          onToggle={() => toggle('photos')}
        >
          {(mem.photos || []).length > 0 && (
            <div className="pasttrip-photos">
              {mem.photos.map((p) => (
                <div className={`pasttrip-photo${mem.cover === p.id ? ' is-cover' : ''}`} key={p.id}>
                  <img src={p.src} alt={p.caption || ''} />
                  <div className="pasttrip-photo-acts">
                    <button
                      className="pasttrip-photo-btn"
                      onClick={() => patchMem({ cover: p.id })}
                      title={t('saved.pastMakeCover')}
                      aria-label={t('saved.pastMakeCover')}
                    >
                      <StarIcon size={12} />
                    </button>
                    <button
                      className="pasttrip-photo-btn"
                      onClick={() => dropPhoto(p.id)}
                      title={t('saved.pastDropPhoto')}
                      aria-label={t('saved.pastDropPhoto')}
                    >
                      <CloseIcon size={11} />
                    </button>
                  </div>
                  <input
                    className="pasttrip-photo-cap"
                    value={p.caption || ''}
                    placeholder={t('saved.pastCaption')}
                    onChange={(e) => patchMem({
                      photos: mem.photos.map((x) => (x.id === p.id ? { ...x, caption: e.target.value } : x)),
                    })}
                    aria-label={t('saved.pastCaption')}
                  />
                </div>
              ))}
            </div>
          )}
          <input
            ref={fileRef}
            className="pasttrip-file"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => addPhotos(e.target.files)}
          />
          <button className="pasttrip-ghost" onClick={() => fileRef.current?.click()}>
            <CameraIcon size={13} /> {t('saved.pastAddPhotos')}
          </button>
          <p className="pasttrip-note">{photoNote || t('saved.pastPhotoNote', { n: MAX_PHOTOS })}</p>
        </Fold>
      </div>

      {error && <p className="pasttrip-error">{error}</p>}

      <div className="pasttrip-actions">
        <button className="pasttrip-cancel" onClick={onCancel} disabled={busy}>
          {t('saved.pastCancel')}
        </button>
        <button className="pasttrip-save" disabled={!ready || busy} onClick={submit}>
          {busy ? t('saved.pastSaving') : (initial?.id ? t('saved.pastUpdate') : t('saved.pastSave'))}
        </button>
      </div>
    </div>
  );
}
