import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { SheetShell } from '../browse/SheetShell.jsx';
import { PlannerSection } from './PlannerSection.jsx';
import { DayExploreMap } from '../map/DayExploreMap.jsx';
import { haversineKm } from '../lib/runtime_pricing.js';
import { cityLabel } from '../lib/placeName.js';
import { formatSteps, kmToSteps } from '../lib/steps.js';
import { loadBeaches } from '../lib/beaches.js';
import { loadLakes } from '../lib/lakes.js';
import { loadTrails } from '../lib/trails.js';
import { loadDossier } from '../lib/dossier.js';
import { tripCentre } from '../lib/trailCards.js';
import { bandChip } from '../lib/regions.js';
import {
  RAIL_KM, poiRow, waterRow, trailRow, townRow, doRow, eventRow,
  eventOnDate, distanceLine, stepsForRoute, orderFromStay,
} from './dayExploreRails.js';

/**
 * "Build it myself": the guided builder around a stay (D6).
 *
 * What this replaces was map-first: a search box, four chips, a big map and a
 * side panel that stayed empty until you tapped a pin. That layout asks the
 * traveller to know what they are looking for before it will show them
 * anything, which is exactly backwards for somebody who has just told the app
 * they do not want the bot to decide for them.
 *
 * So the builder leads with the places themselves, in rails that each answer
 * a different question ("what is the one thing here", "where can I swim",
 * "what is on today"), and the map becomes a view you can switch to rather
 * than the only thing on screen. Every card is addable in one tap, the tray
 * keeps a running count and a step estimate, and Carta is one button away at
 * every point, including with an empty tray.
 *
 * The rails load lazily as they scroll into view, because the beach, lake and
 * trail layers are per-country files and a landing that blocks on three of
 * them before drawing a single card is a landing that feels broken.
 */

const CHIPS = ['all', 'sight', 'water', 'nature', 'active', 'food', 'town'];
const CHIP_KEY = {
  all: 'dayex.chipAll',
  sight: 'dayex.chipSights',
  water: 'dayex.chipWater',
  nature: 'dayex.chipNature',
  active: 'dayex.chipActivities',
  food: 'dayex.chipFood',
  town: 'dayex.chipTowns',
};

/** Which chip a row answers to. A rail's rows may span chips (the "things to
 *  do" rail carries whatever the dossier listed), so this is per row. */
function chipOf(row) {
  if (row.kind === 'trail') return 'nature';
  if (row.kind === 'do' || row.kind === 'event') return 'active';
  return row.kind;
}

/**
 * Run `fn` once, when the element first scrolls near the viewport.
 *
 * Each rail owns one of these, so a stay in Andalusia does not fetch the
 * Spanish trail file until the traveller has actually scrolled past the
 * sights. The observer disconnects after it fires: a rail is loaded once.
 */
function useNearViewport(fn) {
  const ref = useRef(null);
  const fired = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || fired.current) return undefined;
    if (typeof IntersectionObserver !== 'function') { fired.current = true; fn(); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !fired.current) {
        fired.current = true;
        io.disconnect();
        fn();
      }
    }, { rootMargin: '400px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [fn]);
  return ref;
}

/** One place, as a card: photo, name, rating, how far, and one tap to add. */
function PlaceCard({ row, picked, onToggle, onOpen, highlighted, onHover, t }) {
  const dist = distanceLine(row.km, t);
  return (
    <div
      className={`dayex-card${highlighted ? ' is-hi' : ''}`}
      onMouseEnter={() => onHover?.(row.key)}
      onMouseLeave={() => onHover?.('')}
      data-key={row.key}
    >
      <button className="dayex-card-body" onClick={() => onOpen(row)}>
        <span className="dayex-card-photo">
          <HeroImage url={row.photo} city={row.name} iso2={row.iso2} maxWidth={500} sizes="(max-width: 700px) 62vw, 300px" />
          {row.must && <span className="dayex-card-flag">{t('day.mustSee')}</span>}
        </span>
        <span className="dayex-card-text">
          <span className="dayex-card-name">
            <b>{row.name}</b>
            {row.rating?.score != null && <ScoreChip rating={row.rating} size="xs" />}
            {row.gem && <HiddenGemTag />}
          </span>
          {dist && <span className="dayex-card-dist">{dist}</span>}
          <span className="dayex-card-meta">
            {row.kind === 'trail' && row.lenKm != null && (
              <span className="dayex-card-fact">{t('dayex.trailFact', { km: row.lenKm, m: row.ascentM ?? 0 })}</span>
            )}
            {row.waterClass && (
              <span className={`dayex-water bw-${String(row.waterClass).toLowerCase()}`}>
                {t(`water.${String(row.waterClass).toLowerCase()}`)}
              </span>
            )}
            {row.kind === 'town' && row.km != null && (
              <span className="dayex-card-fact">{bandChip(row.km, t)}</span>
            )}
            {row.sub && row.kind !== 'town' && <span className="dayex-card-sub">{row.sub}</span>}
          </span>
        </span>
      </button>
      {row.add && (
        <button
          className={`dayex-add${picked ? ' on' : ''}`}
          onClick={() => onToggle(row)}
          aria-pressed={picked}
          aria-label={picked
            ? t('dayex.removeFromDay', { name: row.name })
            : t('dayex.addToDay', { name: row.name })}
          title={picked ? t('dayex.inYourDay') : t('dayex.addToDayShort')}
        >
          {picked ? (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}

/** A rail: a heading and its cards, scroll-snapped on a phone, a grid on a
 *  desktop, with "Show more" once there are more than the grid shows. */
function Rail({ title, sub, rows, loading, isPicked, hi, ...card }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const SHOWN = 6;
  if (!loading && !rows.length) return null;
  const shown = open ? rows : rows.slice(0, SHOWN);
  return (
    <PlannerSection
      title={title}
      sub={sub}
      className="dayex-rail"
      aside={rows.length > SHOWN ? (
        <button className="dayex-more" onClick={() => setOpen((v) => !v)}>
          {open ? t('dayex.showLess') : t('dayex.showMore', { n: rows.length - SHOWN })}
        </button>
      ) : null}
    >
      <div className="dayex-cards">
        {loading && !rows.length
          ? [0, 1, 2].map((i) => <div className="dayex-card dayex-card-skel" key={i} aria-hidden="true" />)
          : shown.map((r) => (
            <PlaceCard key={r.key} row={r} picked={isPicked(r)} highlighted={hi === r.key} {...card} t={t} />
          ))}
      </div>
    </PlannerSection>
  );
}

export function DayExploreBuilder({
  stay, dateISO, explorePois, exploreTowns, destinations, stayTownId,
  ideas = [], shortlistPoints = [],
  picks, onTogglePick, onMovePick, townPicks, onToggleTown,
  onStartPlanning, onLetCartaPlan, onChangeStay, onOpenDest, onOpenFeature,
  editing = false,
}) {
  const { t } = useI18n();
  const [chip, setChip] = useState('all');
  const [view, setView] = useState('list');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [hi, setHi] = useState('');
  /**
   * Is the two-column desktop layout live?
   *
   * The map has to be MOUNTED only when it has a box to measure. On a phone
   * the map column is display:none until the Map view is chosen, and a
   * MapLibre canvas created inside a display:none parent comes up 0x0 and
   * stays that way: it never sees a resize, so it never draws its pins. So
   * the query drives mounting rather than only styling.
   */
  const [wide, setWide] = useState(
    () => (typeof window !== 'undefined'
      ? !!window.matchMedia?.('(min-width: 1100px)').matches
      : false),
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(min-width: 1100px)');
    if (!mq) return undefined;
    const on = (e) => setWide(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Lazily loaded layers, each filled by its own rail coming into view.
  const [water, setWater] = useState(null);
  const [trails, setTrails] = useState(null);
  const [dossier, setDossier] = useState(null);
  const [loading, setLoading] = useState({});

  const cc = useMemo(() => {
    const d = stayTownId ? destinations[stayTownId] : exploreTowns[0]?.dest;
    return (d?.iso2 || d?.country_code || d?.cc || '').toUpperCase();
  }, [stayTownId, destinations, exploreTowns]);

  // The town the stay belongs to: what the header names, and whose dossier
  // answers "things to do" and "on this day".
  const homeTown = useMemo(
    () => (stayTownId ? exploreTowns.find((x) => x.id === stayTownId) : null) || exploreTowns[0] || null,
    [stayTownId, exploreTowns],
  );

  const loadWater = useCallback(() => {
    if (!cc || !stay) return;
    setLoading((l) => ({ ...l, water: true }));
    Promise.all([loadBeaches(cc).catch(() => null), loadLakes(cc).catch(() => null)])
      .then(([bs, ls]) => {
        const rows = [];
        (bs || []).forEach((b) => {
          const r = waterRow(b, 'beach', stay);
          if (r.km != null && r.km <= RAIL_KM.water) rows.push(r);
        });
        (ls || []).forEach((l) => {
          const r = waterRow(l, 'lake', stay);
          if (r.km != null && r.km <= RAIL_KM.water) rows.push(r);
        });
        rows.sort((a, b) => (b.score - a.score) || (a.km - b.km));
        setWater(rows.slice(0, 18));
      })
      .finally(() => setLoading((l) => ({ ...l, water: false })));
  }, [cc, stay]);

  const loadTrailRows = useCallback(() => {
    if (!cc || !stay) return;
    setLoading((l) => ({ ...l, trail: true }));
    loadTrails(cc).catch(() => null)
      .then((trs) => {
        const rows = [];
        (trs || []).forEach((tr) => {
          const r = trailRow(tr, tripCentre(tr), stay);
          if (r && r.km != null && r.km <= RAIL_KM.trail) rows.push(r);
        });
        rows.sort((a, b) => (b.score - a.score) || (a.km - b.km));
        setTrails(rows.slice(0, 18));
      })
      .finally(() => setLoading((l) => ({ ...l, trail: false })));
  }, [cc, stay]);

  const loadDoss = useCallback(() => {
    if (!homeTown) return;
    setLoading((l) => ({ ...l, doss: true }));
    loadDossier(homeTown.id).catch(() => null)
      .then((d) => setDossier(d || null))
      .finally(() => setLoading((l) => ({ ...l, doss: false })));
  }, [homeTown]);

  const waterRef = useNearViewport(loadWater);
  const trailRef = useNearViewport(loadTrailRows);
  const dossRef = useNearViewport(loadDoss);

  // ---- the rows each rail draws -----------------------------------------

  const poiRows = useMemo(
    () => explorePois.map((p) => poiRow(p, destinations)),
    [explorePois, destinations],
  );
  const byKey = useMemo(() => new Map(poiRows.map((r) => [r.key, r])), [poiRows]);

  const pickedKeys = useMemo(() => new Set(picks.map((p) => p.key)), [picks]);
  const pickedTowns = useMemo(() => new Set(townPicks.map((s) => s.destinationId)), [townPicks]);

  const townRows = useMemo(() => exploreTowns
    .filter((tn) => tn.id !== stayTownId)
    .map(townRow)
    .sort((a, b) => (b.score - a.score) || (a.km - b.km))
    .slice(0, 18), [exploreTowns, stayTownId]);

  /**
   * The ideas from step 3, as cards.
   *
   * An idea arrives in one of three shapes and all three have to appear here,
   * because this rail's whole promise is "what you told us you wanted". A
   * catalogue POI resolves to its own row. A whole town resolves to its town
   * row. A geocoded place has no catalogue record at all, so it is drawn from
   * what the traveller gave us: a name and a coordinate, with no rating and
   * no [+] button, since there is no POI for the day to hold.
   */
  const ideaRows = useMemo(() => {
    const townByKey = new Map(townRows.map((r) => [r.key, r]));
    const out = [];
    for (const i of ideas) {
      const hit = (i.key && byKey.get(i.key)) || (i.key && townByKey.get(i.key));
      if (hit) { out.push(hit); continue; }
      if (i.lat == null || i.lon == null) continue;
      const km = stay ? haversineKm(stay.lat, stay.lon, i.lat, i.lon) : null;
      out.push({
        key: i.key || `idea:${i.lat},${i.lon}`,
        kind: 'sight',
        name: i.name || '',
        lat: i.lat,
        lon: i.lon,
        km: km == null ? null : Math.round(km),
        photo: '',
        rating: null,
        sub: i.sub || '',
        desc: '',
        score: 0,
        add: null,
        open: null,
      });
    }
    return out;
  }, [ideas, byKey, townRows, stay]);

  const sightRows = useMemo(() => poiRows
    .filter((r) => r.kind === 'sight')
    .sort((a, b) => (Number(b.must) - Number(a.must)) || (b.score - a.score) || (a.km - b.km))
    .slice(0, 18), [poiRows]);

  const natureRows = useMemo(() => {
    const pois = poiRows.filter((r) => r.kind === 'nature')
      .sort((a, b) => (b.score - a.score) || (a.km - b.km));
    return [...(trails || []), ...pois].slice(0, 18);
  }, [trails, poiRows]);

  const doRows = useMemo(() => {
    const out = [];
    const items = dossier?.do || dossier?.things || [];
    if (homeTown) items.forEach((it, i) => out.push(doRow(it, homeTown, i)));
    const active = poiRows.filter((r) => r.kind === 'active')
      .sort((a, b) => (b.score - a.score) || (a.km - b.km));
    return [...out, ...active].slice(0, 18);
  }, [dossier, homeTown, poiRows]);

  const foodRows = useMemo(() => poiRows
    .filter((r) => r.kind === 'food')
    .sort((a, b) => (b.score - a.score) || (a.km - b.km))
    .slice(0, 18), [poiRows]);

  /**
   * The shortlist, snapped to what is actually around this stay.
   *
   * A favourite is a PLACE with its own coordinates; a card here has to be
   * something the day can hold. So a shortlisted point within reach is
   * matched to the nearest harvested POI, the same coordinate join the day
   * workspace uses, and anything with no POI near it is left out rather than
   * listed as an un-addable tease.
   */
  const shortRows = useMemo(() => {
    if (!shortlistPoints.length || !stay) return [];
    const out = [];
    const taken = new Set();
    for (const pt of shortlistPoints) {
      const fromStay = haversineKm(stay.lat, stay.lon, pt.lat, pt.lon);
      if (fromStay == null || fromStay > RAIL_KM.shortlist) continue;
      let best = null;
      let bestKm = 1.2;
      for (const r of poiRows) {
        if (taken.has(r.key)) continue;
        const d = haversineKm(pt.lat, pt.lon, r.lat, r.lon);
        if (d != null && d < bestKm) { bestKm = d; best = r; }
      }
      if (best) { taken.add(best.key); out.push(best); }
    }
    return out;
  }, [shortlistPoints, poiRows, stay]);

  const eventRows = useMemo(() => {
    const evs = dossier?.festivals || dossier?.events || [];
    if (!homeTown || !dateISO) return [];
    return evs.filter((e) => eventOnDate(e, dateISO)).map((e, i) => eventRow(e, homeTown, i));
  }, [dossier, homeTown, dateISO]);

  // ---- what the screen actually draws ------------------------------------

  const allRows = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const r of [...ideaRows, ...sightRows, ...(water || []), ...natureRows,
      ...doRows, ...foodRows, ...shortRows, ...townRows, ...eventRows]) {
      if (seen.has(r.key)) continue;
      seen.add(r.key);
      out.push(r);
    }
    return out;
  }, [ideaRows, sightRows, water, natureRows, doRows, foodRows, shortRows, townRows, eventRows]);

  const q = query.trim().toLowerCase();
  const matches = useCallback(
    (r) => (chip === 'all' || chipOf(r) === chip)
      && (!q || r.name.toLowerCase().includes(q)),
    [chip, q],
  );

  // A chip (or a search) collapses the rails into one list for that category:
  // the reading order the rails give is only useful while everything is shown.
  const flat = useMemo(() => {
    if (chip === 'all' && !q) return null;
    return allRows.filter(matches).sort((a, b) => (b.score - a.score) || ((a.km ?? 0) - (b.km ?? 0)));
  }, [chip, q, allRows, matches]);

  // ---- the tray ----------------------------------------------------------

  const trayRows = useMemo(() => {
    const out = [];
    for (const p of picks) {
      const r = byKey.get(p.key);
      if (r) out.push(r);
    }
    return out;
  }, [picks, byKey]);

  const steps = useMemo(
    () => (stay ? stepsForRoute(stay, orderFromStay(stay, trayRows), kmToSteps) : 0),
    [stay, trayRows],
  );

  const toggle = useCallback((row) => {
    if (row.add?.town) onToggleTown(row.add.town);
    else if (row.add) onTogglePick(row.add);
  }, [onToggleTown, onTogglePick]);

  const isPicked = useCallback(
    (row) => (row.add?.town ? pickedTowns.has(row.add.town) : pickedKeys.has(row.key)),
    [pickedTowns, pickedKeys],
  );

  const openDetail = useCallback((row) => setDetail(row), []);

  const cardProps = {
    onToggle: toggle,
    onOpen: openDetail,
    onHover: setHi,
    isPicked,
    hi,
  };

  // The map view draws the same rows the list does, so a filter means the
  // same thing in both and switching view never changes what is on offer.
  const markers = useMemo(() => (flat || allRows).filter(matches).map((r) => ({
    id: r.key,
    label: r.name,
    lat: r.lat,
    lon: r.lon,
    cat: r.kind === 'water' ? 'beach' : r.kind === 'trail' || r.kind === 'nature' ? 'beach'
      : r.kind === 'town' ? 'town' : r.kind === 'active' ? 'active' : 'sight',
    must: !!r.must,
    selected: isPicked(r),
    focused: hi === r.key,
  })), [flat, allRows, matches, isPicked, hi]);

  // Tapping a pin scrolls its card into view, which is what keeps the two
  // halves of the desktop layout one surface rather than two lists.
  const listRef = useRef(null);
  const focusCard = useCallback((key) => {
    setHi(key);
    const el = listRef.current?.querySelector(`[data-key="${CSS.escape(key)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, []);

  const count = picks.length + townPicks.length;
  const trayLabel = count === 0
    ? t('dayex.trayEmpty')
    : t(count === 1 ? 'dayex.trayOne' : 'dayex.trayMany', { n: count, steps: formatSteps(steps) });

  return (
    <div className={`dayex${view === 'map' ? ' dayex-mapview' : ''}`}>
      {/* The banner answers "where am I planning from", with the one control
          that changes it. It is a photo because the stay is a place, and a
          line of grey text is what the old landing used to say instead. */}
      <header className="dayex-head">
        <span className="dayex-head-photo">
          <HeroImage url={homeTown?.dest?.image?.url || ''} city={homeTown?.dest?.city || ''} maxWidth={500} sizes="76px" />
        </span>
        <span className="dayex-head-text">
          <b>{homeTown?.dest?.city ? cityLabel(homeTown.dest.city) : (stay?.shortLabel || stay?.label || '')}</b>
          <small>{dateISO ? t('dayex.headDate', { date: dateISO }) : t('dayex.headNoDate')}</small>
        </span>
        <span className="dayex-head-acts">
          <button
            className="dayex-search-btn"
            onClick={() => { setSearchOpen((v) => !v); setQuery(''); }}
            aria-expanded={searchOpen}
            aria-label={t('day.exploreSearchAria')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
          </button>
          <button className="dayex-change" onClick={onChangeStay}>{t('dayex.change')}</button>
        </span>
      </header>

      {searchOpen && (
        <div className="dayex-searchrow">
          <input
            className="dayex-search-input"
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('day.exploreSearchPlaceholder')}
            aria-label={t('day.exploreSearchAria')}
          />
          {query && (
            <button className="dayex-search-clear" onClick={() => setQuery('')} aria-label={t('day.clearSearch')}>×</button>
          )}
        </div>
      )}

      <div className="dayex-bar">
        <div className="dayex-chips" role="tablist" aria-label={t('dayex.filterAria')}>
          {CHIPS.map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={chip === c}
              className={`guide-chip${chip === c ? ' on' : ''}`}
              onClick={() => setChip(c)}
            >{t(CHIP_KEY[c])}</button>
          ))}
        </div>
        <div className="dayex-view">
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} aria-pressed={view === 'list'}>
            {t('dayex.viewList')}
          </button>
          <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')} aria-pressed={view === 'map'}>
            {t('dayex.viewMap')}
          </button>
        </div>
      </div>

      <div className="dayex-body">
        <div className="dayex-list" ref={listRef}>
          {flat ? (
            <PlannerSection
              title={t(CHIP_KEY[chip])}
              className="dayex-rail"
              aside={<span className="dayex-count">{t('dayex.nPlaces', { n: flat.length })}</span>}
            >
              <div className="dayex-cards dayex-cards-full">
                {flat.length
                  ? flat.map((r) => (
                    <PlaceCard key={r.key} row={r} picked={isPicked(r)} highlighted={hi === r.key} {...cardProps} t={t} />
                  ))
                  : <p className="trip-note">{t('dayex.noneHere')}</p>}
              </div>
            </PlannerSection>
          ) : (
            <>
              {ideaRows.length > 0 && (
                <Rail title={t('dayex.railIdeas')} sub={t('dayex.railIdeasSub')} rows={ideaRows} {...cardProps} />
              )}
              <Rail title={t('dayex.railSights')} rows={sightRows} {...cardProps} />
              <div ref={waterRef}>
                <Rail title={t('dayex.railWater')} rows={water || []} loading={!!loading.water} {...cardProps} />
              </div>
              <div ref={trailRef}>
                <Rail title={t('dayex.railNature')} rows={natureRows} loading={!!loading.trail} {...cardProps} />
              </div>
              <div ref={dossRef}>
                <Rail title={t('dayex.railDo')} rows={doRows} loading={!!loading.doss} {...cardProps} />
              </div>
              <Rail title={t('dayex.railFood')} rows={foodRows} {...cardProps} />
              {shortRows.length > 0 && (
                <Rail title={t('dayex.railShortlist')} rows={shortRows} {...cardProps} />
              )}
              <Rail title={t('dayex.railTowns')} rows={townRows} {...cardProps} />
              {eventRows.length > 0 && (
                <Rail title={t('dayex.railOnThisDay')} rows={eventRows} {...cardProps} />
              )}
            </>
          )}
        </div>

        <div className="dayex-mapcol">
          {(wide || view === 'map') && (
            <DayExploreMap
              stay={{ lat: stay?.lat, lon: stay?.lon, label: stay?.shortLabel || t('day.yourStay') }}
              markers={markers}
              onFocus={focusCard}
            />
          )}
        </div>
      </div>

      {/* The tray: what the day holds so far, how far it walks, and the two
          ways out of this screen. Carta's button is here whether or not
          anything is picked, because "I have had enough of choosing" is a
          normal thing to feel halfway down a list of beaches. */}
      <div className="dayex-tray">
        <button className="dayex-tray-summary" onClick={() => setTrayOpen((v) => !v)} aria-expanded={trayOpen}>
          {trayLabel}
        </button>
        <div className="dayex-tray-acts">
          <button className="dayex-tray-carta" onClick={() => onLetCartaPlan(trayRows)}>
            {count ? t('dayex.cartaRest') : t('dayex.cartaAll')}
          </button>
          <button className="dayex-tray-open" onClick={onStartPlanning} disabled={!count}>
            {editing ? t('day.updatePlan') : t('dayex.openMyDay')}
          </button>
        </div>
      </div>

      {trayOpen && (
        <SheetShell title={t('dayex.trayTitle')} onClose={() => setTrayOpen(false)} width={460}>
          {count === 0 ? (
            <p className="trip-note">{t('dayex.trayNone')}</p>
          ) : (
            <ul className="dayex-tray-list">
              {trayRows.map((r, i) => (
                <li key={r.key}>
                  <span className="dayex-tray-name">{r.name}</span>
                  <span className="dayex-tray-moves">
                    <button onClick={() => onMovePick(r.key, -1)} disabled={i === 0} aria-label={t('dayex.moveUp')}>↑</button>
                    <button onClick={() => onMovePick(r.key, 1)} disabled={i === trayRows.length - 1} aria-label={t('dayex.moveDown')}>↓</button>
                    <button onClick={() => toggle(r)} aria-label={t('dayex.removeFromDay', { name: r.name })}>×</button>
                  </span>
                </li>
              ))}
              {townPicks.map((s) => (
                <li key={s.destinationId}>
                  <span className="dayex-tray-name">{destinations[s.destinationId]?.city || ''}</span>
                  <span className="dayex-tray-moves">
                    <button onClick={() => onToggleTown(s.destinationId)} aria-label={t('day.remove')}>×</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SheetShell>
      )}

      {detail && (
        <SheetShell title={detail.name} onClose={() => setDetail(null)} width={520} className="dayex-detail">
          {detail.photo && (
            <span className="dayex-detail-photo">
              <HeroImage url={detail.photo} city={detail.name} maxWidth={960} sizes="(max-width: 700px) 92vw, 500px" />
            </span>
          )}
          <div className="dayex-detail-head">
            {detail.rating?.score != null && <ScoreChip rating={detail.rating} size="sm" />}
            {distanceLine(detail.km, t) && <span className="dayex-detail-dist">{distanceLine(detail.km, t)}</span>}
          </div>
          {detail.desc && <p className="dayex-detail-desc">{detail.desc}</p>}
          <div className="dayex-detail-acts">
            {detail.open?.type === 'dest' && onOpenDest && (
              <button className="guide-back" onClick={() => { setDetail(null); onOpenDest(detail.open.id); }}>
                {t('dayex.openPage')}
              </button>
            )}
            {detail.open?.type === 'feature' && onOpenFeature && (
              <button className="guide-back" onClick={() => { setDetail(null); onOpenFeature(detail.open.layer, detail.open.ref); }}>
                {t('dayex.openPage')}
              </button>
            )}
            {detail.add && (
              <button className="guide-next" onClick={() => { toggle(detail); setDetail(null); }}>
                {isPicked(detail) ? t('day.removeFromMyDays') : t('dayex.addToDayShort')}
              </button>
            )}
          </div>
        </SheetShell>
      )}
    </div>
  );
}
