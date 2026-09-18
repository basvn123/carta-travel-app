import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { searchFold } from '../lib/textSearch.js';
import { cityLabel } from '../lib/placeName.js';
import { geocodeAddress } from '../lib/geocode.js';
import { haversineKm } from '../lib/runtime_pricing.js';
import { PoiThumb } from './DayActivityRows.jsx';
import {
  SparkIcon, SearchIcon, CloseIcon, CheckIcon, MapPinIcon, HomeIcon,
  BeachIcon, CastleIcon, MountainIcon, HeartIcon, GlobeIcon, SunIcon,
  PartSunIcon, MoonIcon, DotIcon,
} from '../components/Icons.jsx';
import { distanceAway } from '../lib/steps.js';

/**
 * The day flow's third question: "Anything you already want to do?"
 *
 * The step exists because both planning modes were starting from nothing. A
 * traveller who already knows they want the Alhambra had to either describe it
 * to the bot in prose or hunt for it on the manual map AFTER the flow had
 * finished asking. Either way the one fact they arrived with was the last
 * thing the planner learned.
 *
 * It opens as a choice, not a search box: most days genuinely have no fixed
 * point, and a blank field asking "what do you want to do?" is the hardest
 * question in the flow to answer. "No, surprise me" is a complete answer and
 * leaves immediately.
 *
 * Candidates come from three pools, searched together and shown grouped:
 *   - near the start point: the same explorePois/exploreTowns pipeline the
 *     manual map draws from, so an idea picked here IS a catalogue row with an
 *     index, and the manual tray can pre-add it;
 *   - the shortlist: places already starred, within reach of this stay;
 *   - anywhere: a geocoder fallback for the place the catalogue has never
 *     heard of, capped so it stays a day trip rather than a relocation.
 *
 * Ideas are { key, name, lat, lon, destId?, poiIdx?, kind, cat, timeOfDay }.
 * `destId`/`poiIdx` are present only for catalogue rows; a geocoded idea has
 * coordinates and a name and nothing else, which is all either mode needs.
 */

// A geocoded place further out than this is not a day trip from the stay, it
// is a different holiday. The catalogue pools have their own tighter caps
// (60 km for POIs, 110 for towns) applied upstream.
const GEO_MAX_KM = 80;
// The shortlist is a wish list, not a neighbourhood: a starred beach 400 km
// away should not be offered as an idea for today.
const SHORTLIST_MAX_KM = 60;
// Enough to choose from without becoming a directory.
const PER_GROUP = 6;

const TIME_OF_DAY = [
  { key: 'any', labelKey: 'ideas.timeAny', Icon: DotIcon },
  { key: 'morning', labelKey: 'ideas.timeMorning', Icon: SunIcon },
  { key: 'afternoon', labelKey: 'ideas.timeAfternoon', Icon: PartSunIcon },
  { key: 'evening', labelKey: 'ideas.timeEvening', Icon: MoonIcon },
];

const KIND_GLYPH = {
  town: HomeIcon, beach: BeachIcon, sight: CastleIcon, active: MountainIcon,
  trail: MountainIcon, lake: BeachIcon, mountain: MountainIcon, place: MapPinIcon,
};

/** Roughly how a distance reads to someone deciding whether to walk it. Under
 *  2 km is a walk and is quoted in minutes at a real strolling pace; beyond
 *  that the number of kilometres is the useful fact. */
function reach(km, t) {
  if (km == null || !Number.isFinite(km)) return '';
  if (km < 2) return t('ideas.minWalk', { n: Math.max(1, Math.round((km / 4.5) * 60)) });
  return distanceAway(km, t);
}

export function DayIdeasStep({
  stayPoint, explorePois, exploreTowns, shortlistPoints, destinations,
  ideas, onChange, onSkip, onContinue,
}) {
  const { t } = useI18n();
  // null until the traveller answers the choice; 'yes' reveals the search.
  const [mode, setMode] = useState(ideas.length ? 'yes' : null);
  const [q, setQ] = useState('');
  const [geoRows, setGeoRows] = useState([]);
  const [geoBusy, setGeoBusy] = useState(false);
  const inputRef = useRef(null);

  // The field is the whole point of answering "yes", so it takes focus rather
  // than making the traveller find it after the reveal.
  useEffect(() => { if (mode === 'yes') inputRef.current?.focus(); }, [mode]);

  const fold = searchFold(q);
  const searching = fold.length >= 2;

  const km = (lat, lon) => (stayPoint && Number.isFinite(lat)
    ? haversineKm(stayPoint.lat, stayPoint.lon, lat, lon)
    : null);

  // ---- Pool 1: what is around the start point ----------------------------
  const nearRows = useMemo(() => {
    if (!searching) return [];
    const out = [];
    for (const p of explorePois || []) {
      if (!searchFold(p.item?.name).includes(fold)) continue;
      out.push({
        key: `p:${p.destId}:${p.idx}`,
        name: p.item.name,
        lat: p.lat,
        lon: p.lon,
        destId: p.destId,
        poiIdx: p.idx,
        kind: 'poi',
        cat: p.cat,
        km: p.km,
        img: p.item.image?.url || p.item.img || null,
        sub: cityLabel(destinations?.[p.destId]?.city || ''),
      });
    }
    for (const tn of exploreTowns || []) {
      // "Milan (Malpensa)" is how the fares speak; a day out is to Milan.
      const name = cityLabel(tn.dest?.city || '');
      if (!name || !searchFold(name).includes(fold)) continue;
      out.push({
        key: `t:${tn.id}`,
        name,
        lat: tn.lat,
        lon: tn.lon,
        destId: tn.id,
        poiIdx: null,
        kind: 'town',
        cat: 'town',
        km: tn.km,
        img: tn.dest?.image?.url || null,
        sub: tn.dest?.country || '',
      });
    }
    return out.sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9)).slice(0, PER_GROUP);
  }, [searching, fold, explorePois, exploreTowns, destinations]);

  // ---- Pool 2: the shortlist, but only what is in reach today -------------
  const shortRows = useMemo(() => {
    if (!searching || !stayPoint) return [];
    return (shortlistPoints || [])
      .map((s) => ({ ...s, km: km(s.lat, s.lon) }))
      .filter((s) => s.km != null && s.km <= SHORTLIST_MAX_KM)
      .filter((s) => searchFold(s.name).includes(fold))
      .sort((a, b) => a.km - b.km)
      .slice(0, PER_GROUP)
      .map((s) => ({
        key: `f:${s.kind}:${s.id}`,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        destId: null,
        poiIdx: null,
        kind: s.kind,
        cat: s.kind,
        km: Math.round(s.km),
        img: null,
        sub: t('ideas.fromShortlist'),
      }));
  }, [searching, fold, shortlistPoints, stayPoint, t]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Pool 3: anywhere, via the geocoder ---------------------------------
  // Debounced and aborted on every keystroke: Nominatim is a shared public
  // service and this box would otherwise fire a request per letter typed.
  useEffect(() => {
    if (!searching) { setGeoRows([]); setGeoBusy(false); return undefined; }
    const ctl = new AbortController();
    let live = true;
    setGeoBusy(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await geocodeAddress(q, { limit: 8, signal: ctl.signal });
        if (!live) return;
        setGeoRows(rows.map((r) => ({
          key: `g:${r.lat},${r.lon}`,
          name: r.name || r.shortLabel || r.label,
          lat: Number(r.lat),
          lon: Number(r.lon),
          destId: null,
          poiIdx: null,
          kind: 'place',
          cat: 'place',
          km: (() => { const d = km(Number(r.lat), Number(r.lon)); return d == null ? null : Math.round(d); })(),
          img: null,
          sub: r.shortLabel || r.label || '',
        })));
      } catch { if (live) setGeoRows([]); } finally { if (live) setGeoBusy(false); }
    }, 450);
    return () => { live = false; ctl.abort(); clearTimeout(timer); };
  }, [q, searching]); // eslint-disable-line react-hooks/exhaustive-deps

  const anywhereRows = useMemo(() => {
    const seen = new Set([...nearRows, ...shortRows].map((r) => searchFold(r.name)));
    return geoRows
      // Beyond the cap it is not today's outing. A hit with no coordinates we
      // can measure against (no stay point yet) is let through rather than
      // silently dropped.
      .filter((r) => r.km == null || r.km <= GEO_MAX_KM)
      // The catalogue pools name the same place better (photo, category, an
      // index the tray can use), so a geocoder echo of one is noise.
      .filter((r) => !seen.has(searchFold(r.name)))
      .slice(0, PER_GROUP);
  }, [geoRows, nearRows, shortRows]);

  const picked = (key) => ideas.some((i) => i.key === key);

  const add = (row) => {
    if (picked(row.key)) return;
    const { img, sub, ...rest } = row;
    onChange([...ideas, { ...rest, img: img || null, timeOfDay: 'any' }]);
    // The box clears so the next idea starts from a clean field; the chips
    // above it are the record of what has been taken.
    setQ('');
    inputRef.current?.focus();
  };
  const remove = (key) => onChange(ideas.filter((i) => i.key !== key));
  const setWhen = (key, timeOfDay) => onChange(ideas.map((i) => (i.key === key ? { ...i, timeOfDay } : i)));

  const groups = [
    { key: 'near', labelKey: 'ideas.groupNear', rows: nearRows, Icon: MapPinIcon },
    { key: 'short', labelKey: 'ideas.groupShortlist', rows: shortRows, Icon: HeartIcon },
    { key: 'any', labelKey: 'ideas.groupAnywhere', rows: anywhereRows, Icon: GlobeIcon },
  ].filter((g) => g.rows.length);

  const nothingFound = searching && !geoBusy && !groups.length;

  return (
    <div className="day-flow-step">
      <div className="day-flow-panel">
        <h2 className="day-flow-q">{t('ideas.question')}</h2>
        <p className="day-flow-qsub">{t('ideas.sub')}</p>

        {/* The choice comes first. Answering "no" is a real answer, not a
            skip link hiding under a form the traveller has to read past. */}
        <div className="day-ideas-choice">
          <button
            type="button"
            className={`day-ideas-choice-btn${mode === 'yes' ? ' on' : ''}`}
            onClick={() => setMode('yes')}
            aria-pressed={mode === 'yes'}
          >
            <span className="day-ideas-choice-ico"><CheckIcon size={20} /></span>
            <b>{t('ideas.yes')}</b>
            <small>{t('ideas.yesSub')}</small>
          </button>
          <button
            type="button"
            className="day-ideas-choice-btn"
            onClick={() => { setMode('no'); onSkip(); }}
          >
            <span className="day-ideas-choice-ico"><SparkIcon size={20} /></span>
            <b>{t('ideas.no')}</b>
            <small>{t('ideas.noSub')}</small>
          </button>
        </div>

        {mode === 'yes' && (
          <div className="day-ideas-body">
            {/* What has been taken, above the field: the chips are the answer
                being built, and each one carries the two things that matter
                after it is picked, how far away it is and when it is wanted. */}
            {ideas.length > 0 && (
              <ul className="day-ideas-chips">
                {ideas.map((i) => {
                  const Glyph = KIND_GLYPH[i.cat] || KIND_GLYPH[i.kind] || MapPinIcon;
                  return (
                    <li key={i.key} className="day-ideas-chip">
                      <PoiThumb img={i.img} name={i.name} Glyph={Glyph} />
                      <span className="day-ideas-chip-text">
                        <b>{i.name}</b>
                        <small>{reach(i.km, t)}</small>
                      </span>
                      <span className="day-ideas-when" role="group" aria-label={t('ideas.whenAria', { name: i.name })}>
                        {TIME_OF_DAY.map((o) => (
                          <button
                            key={o.key}
                            type="button"
                            className={`day-ideas-when-btn${i.timeOfDay === o.key ? ' on' : ''}`}
                            onClick={() => setWhen(i.key, o.key)}
                            aria-pressed={i.timeOfDay === o.key}
                            title={t(o.labelKey)}
                          >
                            <o.Icon size={12} />
                            <span>{t(o.labelKey)}</span>
                          </button>
                        ))}
                      </span>
                      <button
                        type="button"
                        className="day-ideas-chip-x"
                        onClick={() => remove(i.key)}
                        aria-label={t('ideas.remove', { name: i.name })}
                      >
                        <CloseIcon size={12} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="day-ideas-search">
              <SearchIcon size={14} className="day-ideas-search-ico" />
              <input
                ref={inputRef}
                className="day-ideas-input"
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('ideas.searchPlaceholder')}
                aria-label={t('ideas.searchPlaceholder')}
              />
              {q && (
                <button
                  type="button"
                  className="day-ideas-clear"
                  onClick={() => { setQ(''); inputRef.current?.focus(); }}
                  aria-label={t('ideas.clearSearch')}
                >
                  <CloseIcon size={12} />
                </button>
              )}
            </div>

            {groups.length > 0 && (
              <div className="day-ideas-results">
                {groups.map((g) => (
                  <div key={g.key} className="day-ideas-group">
                    <span className="day-flow-suggest-label">
                      <g.Icon size={12} /> {t(g.labelKey)}
                    </span>
                    <ul className="day-ideas-rows">
                      {g.rows.map((r) => {
                        const Glyph = KIND_GLYPH[r.cat] || KIND_GLYPH[r.kind] || MapPinIcon;
                        const on = picked(r.key);
                        return (
                          <li key={r.key}>
                            <button
                              type="button"
                              className={`day-ideas-row${on ? ' on' : ''}`}
                              onClick={() => add(r)}
                              aria-pressed={on}
                            >
                              <PoiThumb img={r.img} name={r.name} Glyph={Glyph} />
                              <span className="day-ideas-row-text">
                                <b>{r.name}</b>
                                <small>{[r.sub, reach(r.km, t)].filter(Boolean).join(' · ')}</small>
                              </span>
                              <span className="day-ideas-row-mark" aria-hidden="true">
                                {on ? <CheckIcon size={13} /> : '+'}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {geoBusy && !groups.length && <p className="day-ideas-note">{t('ideas.searching')}</p>}
            {nothingFound && <p className="day-ideas-note">{t('ideas.noHits', { q })}</p>}

            <button
              className="day-flow-next"
              onClick={onContinue}
              disabled={!ideas.length}
            >
              {ideas.length === 1 ? t('ideas.continue1') : t('ideas.continueN', { n: ideas.length })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
