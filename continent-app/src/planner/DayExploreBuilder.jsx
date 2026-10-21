import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { SheetShell } from '../browse/SheetShell.jsx';
import { Button, IconButton, Chip, Segmented, Card } from '../components/ui/index.js';
import { PlannerSection } from './PlannerSection.jsx';
import { TripMap } from '../map/TripMap.jsx';
import { DayWizardShell } from './DayWizardShell.jsx';
import { DayRail } from './DayRail.jsx';
import { CreditChip } from '../components/CreditChip.jsx';
import { haversineKm } from '../lib/runtime_pricing.js';
import { loadBeaches } from '../lib/beaches.js';
import { loadLakes } from '../lib/lakes.js';
import { loadTrails } from '../lib/trails.js';
import { loadDossier } from '../lib/dossier.js';
import { tripCentre } from '../lib/trailCards.js';
import { bandChip } from '../lib/regions.js';
import {
  RAIL_KM, poiRow, waterRow, trailRow, townRow, doRow, eventRow,
  eventOnDate, LOCAL_KM, townReach, reachLine,
} from './dayExploreRails.js';
import { CloseIcon, PlusIcon, CheckIcon, SearchIcon } from '../components/Icons.jsx';
import { cityLabel } from '../lib/placeName.js';

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

// In the order the rails read (T459): what a place is famous for, then the
// outdoors, then food, then the rest.
const CHIPS = ['all', 'sight', 'nature', 'food', 'active', 'water'];
const CHIP_KEY = {
  all: 'dayex.chipAll',
  sight: 'dayex.chipSights',
  water: 'dayex.chipWater',
  nature: 'dayex.chipNature',
  active: 'dayex.railDo',
  food: 'dayex.chipFood',
};

// "Where" (T459): the places a day can be spent, each a circle around its
// centre. The start's own circle is a little wider, since the stay is rarely
// at the heart of its town. A town is offered while it is a day out (the
// builder's own horizon, EXPLORE_POI_KM in DayPlannerTab) and has places to
// show; the strongest six, so Bruges from Ghent beats the nearest suburb.
const HOME_KM = 10;
const AREA_KM = 8;
const AREA_TOWNS = 6;
const AREA_REACH_KM = 60;
const AREA_MIN_PLACES = 3;

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

/** The add button a card and a row share: the card's labelled action (T501,
 *  roadmap 1.3d), under the text and never on the photograph. Picked, it
 *  reads "In your day" with a tick on the light selected tint. */
function AddButton({ row, picked, onToggle, t }) {
  if (!row.add) return null;
  return (
    <button
      type="button"
      className={`dayex-add${picked ? ' on' : ''}`}
      onClick={() => onToggle(row)}
      aria-pressed={picked}
      aria-label={picked
        ? t('dayex.removeFromDay', { name: row.name })
        : t('dayex.addToDay', { name: row.name })}
    >
      {picked ? <CheckIcon size={18} /> : <PlusIcon size={18} />}
      <span className="dayex-add-label">{picked ? t('dayex.inYourDay') : t('dayex.addToDayShort')}</span>
    </button>
  );
}

/** What a place is and how far, under its name: one line of facts. No score
 *  (owner, T459: the places stay, their ratings go). */
function PlaceMeta({ row, t }) {
  const dist = reachLine(row, t);
  return (
    <>
      <span className="dayex-card-name"><b>{row.name}</b></span>
      <span className="dayex-card-meta">
        {dist && <span className="dayex-card-dist">{dist}</span>}
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
    </>
  );
}

/** One place with a photograph: the photo, then its name and facts. */
function PlaceCard({ row, picked, onToggle, onOpen, t }) {
  return (
    <div
      className={`dayex-card${picked ? ' is-picked' : ''}`}
      data-key={row.key}
    >
      <button className="dayex-card-body" onClick={() => onOpen(row)}>
        <span className="dayex-card-photo">
          <HeroImage url={row.photo} city={row.name} iso2={row.iso2} maxWidth={500} sizes="(max-width: 700px) 62vw, 300px" />
        </span>
        <span className="dayex-card-text"><PlaceMeta row={row} t={t} /></span>
      </button>
      <AddButton row={row} picked={picked} onToggle={onToggle} t={t} />
    </div>
  );
}

/** A place with no photograph: a compact row (the kit's Card), never a fake
 *  image. */
function PlaceRow({ row, picked, onToggle, onOpen, t }) {
  const dist = reachLine(row, t);
  return (
    <Card
      as="li"
      layout="row"
      className="dayex-row"
      selected={picked}
      data-key={row.key}
      title={row.name}
      onOpen={() => onOpen(row)}
      meta={(
        <>
          {dist && <span>{dist}</span>}
          {row.sub && row.kind !== 'town' && <span>{row.sub}</span>}
        </>
      )}
      actions={<AddButton row={row} picked={picked} onToggle={onToggle} t={t} />}
    />
  );
}

/** A rail: a heading and one row of three photographs (scroll-snapped on a
 *  phone), with "Show more" for the rest. Places without a photograph come in
 *  only once the rail is opened, so the first look is three pictures a theme
 *  (owner, T459: the builder was an overload of pictures and things to do). */
function Rail({ title, sub, rows, loading, isPicked, ...card }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const SHOWN = 3;
  if (!loading && !rows.length) return null;
  const withPhoto = rows.filter((r) => r.photo);
  const without = rows.filter((r) => !r.photo);
  // A theme with no photographs at all still shows its first few places.
  const shown = open ? withPhoto : withPhoto.slice(0, SHOWN);
  const rowsShown = open ? without : withPhoto.length ? [] : without.slice(0, SHOWN);
  const more = (withPhoto.length - shown.length) + (without.length - rowsShown.length);
  return (
    <PlannerSection
      title={title}
      sub={sub}
      className="dayex-rail"
      aside={more > 0 || open ? (
        <Button variant="quiet" size="sm" className="dayex-more" onClick={() => setOpen((v) => !v)}>
          {open ? t('dayex.showLess') : t('dayex.showMore', { n: more })}
        </Button>
      ) : null}
    >
      {(loading && !rows.length) || shown.length > 0 ? (
        <div className="dayex-cards">
          {loading && !rows.length
            ? [0, 1, 2].map((i) => <div className="dayex-card dayex-card-skel" key={i} aria-hidden="true" />)
            : shown.map((r) => (
              <PlaceCard key={r.key} row={r} picked={isPicked(r)} {...card} t={t} />
            ))}
        </div>
      ) : null}
      {rowsShown.length > 0 && (
        <ul className="dayex-rows">
          {rowsShown.map((r) => (
            <PlaceRow key={r.key} row={r} picked={isPicked(r)} {...card} t={t} />
          ))}
        </ul>
      )}
    </PlannerSection>
  );
}

export function DayExploreBuilder({
  // T433: the wizard frame, the start's own name, and the days the picks make.
  wizard, startName = '', preview = [], homeTownId = null,
  // T459: the recap and the rail's answers come from the flow around it.
  recap = [], railRows = [], figure = null,
  stay, dateISO, explorePois, exploreTowns, destinations, stayTownId,
  ideas = [], shortlistPoints = [],
  picks, onTogglePick, townPicks, onToggleTown,
  onStartPlanning, onLetCartaPlan, onOpenDest, onOpenFeature,
}) {

  const { t } = useI18n();
  const [chip, setChip] = useState('all');
  const [view, setView] = useState('list');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState(null);
  const [area, setArea] = useState('home');

  // Lazily loaded layers, each filled by its own rail coming into view.
  const [water, setWater] = useState(null);
  const [trails, setTrails] = useState(null);
  const [dossiers, setDossiers] = useState({});
  const [dossWanted, setDossWanted] = useState(false);
  const [loading, setLoading] = useState({});

  const cc = useMemo(() => {
    const d = stayTownId ? destinations[stayTownId] : exploreTowns[0]?.dest;
    return (d?.iso2 || d?.country_code || d?.cc || '').toUpperCase();
  }, [stayTownId, destinations, exploreTowns]);

  // The town the stay belongs to.
  const homeTown = useMemo(
    () => exploreTowns.find((x) => x.id === (homeTownId || stayTownId)) || exploreTowns[0] || null,
    [homeTownId, stayTownId, exploreTowns],
  );

  /**
   * "Where" (T459). The owner's question was "I start from Ghent, but where do
   * I pick where I spend the day?". A day belongs to one town (dayBuild.js), so
   * the answer is a town: the start's own, or one of the nearest towns a day
   * out. Choosing one re-centres every rail on it; a place picked there gives
   * that town its day. A town the traveller already named (an idea from step
   * 3) is offered even when it is further out.
   */
  // Catalogue places within a circle, for whether a town has a day in it.
  const placesNear = useCallback((lat, lon, km) => {
    let n = 0;
    for (const p of explorePois) {
      const d = haversineKm(lat, lon, p.lat, p.lon);
      if (d != null && d <= km) n += 1;
    }
    return n;
  }, [explorePois]);
  const areas = useMemo(() => {
    const out = [{
      id: 'home', destId: homeTown?.id || null, label: startName || cityLabel(homeTown?.dest?.city || ''),
      lat: stay?.lat, lon: stay?.lon, radius: HOME_KM, town: homeTown,
    }];
    const named = new Set(townPicks.map((s) => s.destinationId));
    const homeName = (out[0].label || '').toLowerCase();
    const near = exploreTowns
      .filter((tn) => tn.id !== homeTown?.id && tn.id !== stayTownId && tn.km != null
        && tn.km >= 4 && (tn.km <= AREA_REACH_KM || named.has(tn.id))
        && cityLabel(tn.dest?.city || '').toLowerCase() !== homeName
        && (named.has(tn.id) || placesNear(tn.lat, tn.lon, AREA_KM) >= AREA_MIN_PLACES))
      .sort((a, b) => ((b.dest?.rating?.score || 0) - (a.dest?.rating?.score || 0)) || (a.km - b.km));
    const keep = [...near.filter((tn) => named.has(tn.id)), ...near.filter((tn) => !named.has(tn.id))]
      .slice(0, Math.max(AREA_TOWNS, named.size));
    keep.sort((a, b) => a.km - b.km).forEach((tn) => out.push({
      id: tn.id, destId: tn.id, label: cityLabel(tn.dest?.city || ''),
      lat: tn.lat, lon: tn.lon, radius: AREA_KM, town: tn, km: tn.km,
    }));
    return out;
  }, [homeTown, stayTownId, exploreTowns, startName, stay, townPicks, placesNear]);
  const here = areas.find((a) => a.id === area) || areas[0];
  const inArea = useCallback((r) => {
    if (!here || !Number.isFinite(here.lat) || !Number.isFinite(r.lat)) return true;
    const km = haversineKm(here.lat, here.lon, r.lat, r.lon);
    return km == null || km <= here.radius;
  }, [here]);
  // The outdoors is reached rather than walked to: a trail or a beach belongs
  // to the area it is a short ride from, not to its streets.
  const inReach = useCallback((r, km) => {
    if (!here || !Number.isFinite(here.lat) || !Number.isFinite(r.lat)) return true;
    const d = haversineKm(here.lat, here.lon, r.lat, r.lon);
    return d == null || d <= km;
  }, [here]);
  const areaTown = here?.town || homeTown;

  const loadWater = useCallback(() => {
    if (!cc || !stay) return;
    setLoading((l) => ({ ...l, water: true }));
    Promise.all([loadBeaches(cc).catch(() => null), loadLakes(cc).catch(() => null)])
      .then(([bs, ls]) => {
        const rows = [];
        (bs || []).forEach((b) => {
          const r = waterRow(b, 'beach', stay);
          if (r.km != null && r.km <= RAIL_KM.water + AREA_REACH_KM) rows.push(r);
        });
        (ls || []).forEach((l) => {
          const r = waterRow(l, 'lake', stay);
          if (r.km != null && r.km <= RAIL_KM.water + AREA_REACH_KM) rows.push(r);
        });
        rows.sort((a, b) => (b.score - a.score) || (a.km - b.km));
        setWater(rows.slice(0, 60));
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
          if (r && r.km != null && r.km <= RAIL_KM.trail + AREA_REACH_KM) rows.push(r);
        });
        rows.sort((a, b) => (b.score - a.score) || (a.km - b.km));
        setTrails(rows.slice(0, 60));
      })
      .finally(() => setLoading((l) => ({ ...l, trail: false })));
  }, [cc, stay]);

  // The dossier ("things to do", "on this day") is the chosen town's, fetched
  // once its rail is near the screen and then again for each town chosen.
  const wantDoss = useCallback(() => setDossWanted(true), []);
  useEffect(() => {
    const id = areaTown?.id;
    if (!dossWanted || !id || dossiers[id] !== undefined) return;
    setLoading((l) => ({ ...l, doss: true }));
    loadDossier(id).catch(() => null)
      .then((d) => setDossiers((m) => ({ ...m, [id]: d || null })))
      .finally(() => setLoading((l) => ({ ...l, doss: false })));
  }, [dossWanted, areaTown, dossiers]);
  const dossier = areaTown ? dossiers[areaTown.id] || null : null;

  const waterRef = useNearViewport(loadWater);
  const trailRef = useNearViewport(loadTrailRows);
  const dossRef = useNearViewport(wantDoss);

  // ---- the rows each rail draws -----------------------------------------

  const poiRows = useMemo(
    () => explorePois.map((p) => poiRow(p, destinations)),
    [explorePois, destinations],
  );
  const areaPoiRows = useMemo(() => poiRows.filter(inArea), [poiRows, inArea]);
  const byKey = useMemo(() => new Map(poiRows.map((r) => [r.key, r])), [poiRows]);

  const pickedKeys = useMemo(() => new Set(picks.map((p) => p.key)), [picks]);
  const pickedTowns = useMemo(() => new Set(townPicks.map((s) => s.destinationId)), [townPicks]);

  // Towns as rows survive only to resolve a whole-town idea from step 3.
  const townRows = useMemo(() => exploreTowns
    .filter((tn) => tn.id !== stayTownId)
    .map(townRow)
    .map((r) => {
      const tn = exploreTowns.find((x) => x.id === r.add.town);
      return (r.km ?? 0) >= LOCAL_KM ? { ...r, reach: townReach(homeTown?.dest, tn?.dest) } : r;
    }), [exploreTowns, stayTownId, homeTown]);

  /**
   * The ideas from step 3, as cards, wherever they are: "what you told us you
   * wanted" is not filtered by the town on screen. A catalogue POI resolves to
   * its own row, a whole town to its town row, and a geocoded place is drawn
   * from what the traveller gave us, with no [+] since the day cannot hold it.
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

  const byStrength = (a, b) => (b.score - a.score) || ((a.km ?? 0) - (b.km ?? 0));

  const sightRows = useMemo(() => areaPoiRows
    .filter((r) => r.kind === 'sight')
    .sort((a, b) => (Number(b.must) - Number(a.must)) || byStrength(a, b))
    .slice(0, 18), [areaPoiRows]);

  const natureRows = useMemo(() => {
    const pois = areaPoiRows.filter((r) => r.kind === 'nature').sort(byStrength);
    const near = (trails || []).filter((r) => inReach(r, RAIL_KM.trail));
    return [...near, ...pois].slice(0, 18);
  }, [trails, areaPoiRows, inReach]);

  const doRows = useMemo(() => {
    const out = [];
    const items = dossier?.do || dossier?.things || [];
    if (areaTown) items.forEach((it, i) => out.push(doRow(it, areaTown, i)));
    const active = areaPoiRows.filter((r) => r.kind === 'active').sort(byStrength);
    return [...out, ...active].slice(0, 18);
  }, [dossier, areaTown, areaPoiRows]);

  const foodRows = useMemo(() => areaPoiRows
    .filter((r) => r.kind === 'food')
    .sort(byStrength)
    .slice(0, 18), [areaPoiRows]);

  const waterRows = useMemo(
    () => (water || []).filter((r) => inReach(r, RAIL_KM.water)).slice(0, 18),
    [water, inReach],
  );

  /**
   * The shortlist, snapped to what is actually in the chosen area: a
   * favourite is matched to the nearest harvested POI (the coordinate join
   * the day workspace uses), and anything with no POI near it is left out.
   */
  const shortRows = useMemo(() => {
    if (!shortlistPoints.length || !here) return [];
    const out = [];
    const taken = new Set();
    for (const pt of shortlistPoints) {
      if (!inArea(pt)) continue;
      let best = null;
      let bestKm = 1.2;
      for (const r of areaPoiRows) {
        if (taken.has(r.key)) continue;
        const d = haversineKm(pt.lat, pt.lon, r.lat, r.lon);
        if (d != null && d < bestKm) { bestKm = d; best = r; }
      }
      if (best) { taken.add(best.key); out.push(best); }
    }
    return out;
  }, [shortlistPoints, areaPoiRows, inArea, here]);

  const eventRows = useMemo(() => {
    const evs = dossier?.festivals || dossier?.events || [];
    if (!areaTown || !dateISO) return [];
    return evs.filter((e) => eventOnDate(e, dateISO)).map((e, i) => eventRow(e, areaTown, i));
  }, [dossier, areaTown, dateISO]);

  // ---- what the screen actually draws ------------------------------------

  const allRows = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const r of [...ideaRows, ...sightRows, ...natureRows, ...foodRows,
      ...doRows, ...waterRows, ...shortRows, ...eventRows]) {
      if (seen.has(r.key)) continue;
      seen.add(r.key);
      out.push(r);
    }
    return out;
  }, [ideaRows, sightRows, natureRows, foodRows, doRows, waterRows, shortRows, eventRows]);

  const q = query.trim().toLowerCase();
  const matches = useCallback(
    (r) => (chip === 'all' || chipOf(r) === chip)
      && (!q || r.name.toLowerCase().includes(q)),
    [chip, q],
  );

  // A chip (or a search) collapses the rails into one list for that category.
  // A search looks across every area, so a place is findable by name wherever
  // it is.
  const flat = useMemo(() => {
    if (chip === 'all' && !q) return null;
    const pool = q
      ? [...allRows, ...poiRows.filter((r) => !allRows.some((x) => x.key === r.key))]
      : allRows;
    return pool.filter(matches).sort(byStrength);
  }, [chip, q, allRows, poiRows, matches]);

  const trayRows = useMemo(() => {
    const out = [];
    for (const p of picks) {
      const r = byKey.get(p.key);
      if (r) out.push(r);
    }
    return out;
  }, [picks, byKey]);

  const toggle = useCallback((row) => {
    if (row.add?.town) onToggleTown(row.add.town);
    else if (row.add) onTogglePick(row.add);
  }, [onToggleTown, onTogglePick]);

  const isPicked = useCallback(
    (row) => (row.add?.town ? pickedTowns.has(row.add.town) : pickedKeys.has(row.key)),
    [pickedTowns, pickedKeys],
  );

  const openDetail = useCallback((row) => setDetail(row), []);

  const cardProps = { onToggle: toggle, onOpen: openDetail, isPicked };

  // The map view draws the same rows the list does, so a filter means the
  // same thing in both and switching view never changes what is on offer.
  const shownRows = flat || allRows;
  // The map frames the chosen area: a row with no distance or one an hour
  // away is in the list, never a reason to zoom out to half a country (the
  // T459 critique found the T433 map framed on Italy).
  const markers = useMemo(() => shownRows.filter(matches)
    .filter((r) => !isPicked(r) && Number.isFinite(r.lat) && Number.isFinite(r.lon))
    .filter((r) => inReach(r, 25))
    .slice(0, 60)
    .map((r) => ({
      id: r.key,
      label: r.name,
      lat: r.lat,
      lon: r.lon,
      cat: r.kind === 'water' ? 'beach' : r.kind === 'trail' || r.kind === 'nature' ? 'beach'
        : r.kind === 'town' ? 'town' : r.kind === 'active' ? 'active' : 'sight',
      must: !!r.must,
    })), [shownRows, matches, isPicked, inReach]);
  // The picks, numbered in the order the days will walk them, the stay first.
  const mapStops = useMemo(() => {
    const out = stay ? [{ lat: stay.lat, lon: stay.lon, stay: true, city: startName }] : [];
    let no = 0;
    for (const d of preview) {
      for (const p of d.clock?.rows || []) {
        no += 1;
        if (Number.isFinite(p.lat)) out.push({ lat: p.lat, lon: p.lon, city: p.name, no });
      }
    }
    return out;
  }, [stay, preview, startName]);
  const mapFocus = useMemo(
    () => (here && Number.isFinite(here.lat) ? { lat: here.lat, lon: here.lon, zoom: 13 } : null),
    [here],
  );
  const rowByKey = useMemo(() => new Map(shownRows.map((r) => [r.key, r])), [shownRows]);

  // Picks per area, for the small count on each "Where" chip.
  const pickedIn = useMemo(() => {
    const m = new Map();
    for (const r of trayRows) {
      const a = areas.find((x) => x.id !== 'home' && x.destId === r.add?.destId)
        || areas.find((x) => {
          if (!Number.isFinite(x.lat)) return false;
          const d = haversineKm(x.lat, x.lon, r.lat, r.lon);
          return d != null && d <= x.radius;
        });
      if (a) m.set(a.id, (m.get(a.id) || 0) + 1);
    }
    return m;
  }, [trayRows, areas]);

  const count = picks.length + townPicks.length;
  const nDays = preview.length;
  const summaryText = count === 0
    ? t('dayex.trayEmpty')
    : t(nDays > 1 ? 'dayex.trayDays' : 'dayex.trayDay', { n: picks.length || count, d: nDays });

  const goArea = useCallback((destId) => {
    const a = areas.find((x) => x.destId === destId);
    setArea(a ? a.id : 'home');
    setChip('all');
    setQuery('');
  }, [areas]);

  const rail = (
    <DayRail
      figure={figure}
      rows={railRows}
      days={preview}
      onTownDay={goArea}
      footer={(
        <div className="dayr-carta">
          <Button block onClick={() => onLetCartaPlan(trayRows)}>
            {count ? t('dayex.cartaRest') : t(nDays > 1 ? 'dayex.cartaAllDays' : 'dayex.cartaAll')}
          </Button>
          <CreditChip />
        </div>
      )}
    />
  );

  const foot = {
    back: () => wizard.onGo(wizard.at - 1),
    next: {
      label: t(nDays > 1 ? 'dayex.openMyDays' : 'dayex.openMyDay'),
      onClick: onStartPlanning,
      disabled: !count,
    },
  };

  const reach = here?.id !== 'home' && here?.town ? townReach(homeTown?.dest, here.town.dest) : null;
  const reachText = reach?.min ? reachLine({ reach }, t) : null;

  return (
    <DayWizardShell
      {...wizard}
      layout="wide"
      canvasKey="manual"
      foot={foot}
      className="dayw-manual"
      recap={recap}
      title={t('dayex.pickTitle')}
      rail={rail}
      railSummary={summaryText}
      railTitle={t('dayr.title')}
    >
      <div className={`dayex${view === 'map' ? ' dayex-mapview' : ''}`}>
        {/* With no other town a day out there is nothing to choose: the
            recap already names the start. */}
        {areas.length > 1 && (
        <section className="dayw-q" aria-labelledby="dayex-where-h">
          <h2 className="wiz-q-h" id="dayex-where-h">{t('dayex.whereH')}</h2>
          <div className="dayex-chips dayex-where" role="group" aria-labelledby="dayex-where-h">
            {areas.map((a) => (
              <Chip key={a.id} kind="choice" selected={here?.id === a.id} onClick={() => { setArea(a.id); setChip('all'); }}>
                {a.label}
                {pickedIn.get(a.id) ? <span className="dayex-where-n">{pickedIn.get(a.id)}</span> : null}
              </Chip>
            ))}
          </div>
          {reachText && <p className="dayex-where-reach">{t('dayex.whereReach', { reach: reachText, from: areas[0].label })}</p>}
        </section>
        )}

        <section className="dayw-q" aria-labelledby="dayex-what-h">
          <div className="dayex-what-head">
            <h2 className="wiz-q-h" id="dayex-what-h">{t('dayex.whatH')}</h2>
            <span className="dayex-what-acts">
              <IconButton
                tone="surface"
                className="dayex-search-btn"
                onClick={() => { setSearchOpen((v) => !v); setQuery(''); }}
                aria-expanded={searchOpen}
                label={t('day.exploreSearchAria')}
              ><SearchIcon size={18} /></IconButton>
              <Segmented
                size="sm"
                className="dayex-view"
                label={t('dayex.viewAria')}
                value={view}
                onChange={setView}
                options={[
                  { value: 'list', label: t('dayex.viewList') },
                  { value: 'map', label: t('dayex.viewMap') },
                ]}
              />
            </span>
          </div>
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
                <button className="dayex-search-clear" onClick={() => setQuery('')} aria-label={t('day.clearSearch')}><CloseIcon size={16} /></button>
              )}
            </div>
          )}
          <div className="dayex-chips" role="group" aria-label={t('dayex.filterAria')}>
            {CHIPS.map((c) => (
              <Chip key={c} selected={chip === c} onClick={() => setChip(c)}>{t(CHIP_KEY[c])}</Chip>
            ))}
          </div>
        </section>

        {view === 'map' ? (
          <div className="dayex-map">
            <TripMap
              stops={mapStops}
              pois={markers}
              onPoiClick={(id) => { const r = rowByKey.get(id); if (r) setDetail(r); }}
              focus={mapFocus}
              padBottom={40}
              fitMaxZoom={14}
              showRoute={false}
              zoomControls
              cooperativeGestures
            />
          </div>
        ) : (
          <div className="dayex-list">
            {flat ? (
              <PlannerSection
                title={q ? t('dayex.searchTitle', { q: query.trim() }) : t(CHIP_KEY[chip])}
                className="dayex-rail"
                aside={<span className="dayex-count">{t('dayex.nPlaces', { n: flat.length })}</span>}
              >
                {flat.length ? (
                  <>
                    <div className="dayex-cards dayex-cards-full">
                      {flat.filter((r) => r.photo).map((r) => (
                        <PlaceCard key={r.key} row={r} picked={isPicked(r)} {...cardProps} t={t} />
                      ))}
                    </div>
                    <ul className="dayex-rows">
                      {flat.filter((r) => !r.photo).map((r) => (
                        <PlaceRow key={r.key} row={r} picked={isPicked(r)} {...cardProps} t={t} />
                      ))}
                    </ul>
                  </>
                ) : (
                  <div className="trip-note empty-act">
                    <p>{t('dayex.noneHere')}</p>
                    <Button size="sm" onClick={() => { setChip('all'); setQuery(''); }}>
                      {t('dayex.showAllKinds')}
                    </Button>
                  </div>
                )}
              </PlannerSection>
            ) : (
              <>
                {ideaRows.length > 0 && (
                  <Rail title={t('dayex.railIdeas')} rows={ideaRows} {...cardProps} />
                )}
                {eventRows.length > 0 && (
                  <Rail title={t('dayex.railOnThisDay')} rows={eventRows} {...cardProps} />
                )}
                <Rail title={t('dayex.railSights')} rows={sightRows} {...cardProps} />
                <div ref={trailRef}>
                  <Rail title={t('dayex.railNature')} rows={natureRows} loading={!!loading.trail} {...cardProps} />
                </div>
                <Rail title={t('dayex.railFood')} rows={foodRows} {...cardProps} />
                <div ref={dossRef}>
                  <Rail title={t('dayex.railDo')} rows={doRows} loading={!!loading.doss} {...cardProps} />
                </div>
                <div ref={waterRef}>
                  <Rail title={t('dayex.railWater')} rows={waterRows} loading={!!loading.water} {...cardProps} />
                </div>
                {shortRows.length > 0 && (
                  <Rail title={t('dayex.railShortlist')} rows={shortRows} {...cardProps} />
                )}
                {!sightRows.length && !natureRows.length && !foodRows.length && !doRows.length
                  && !waterRows.length && !loading.trail && !loading.water && !loading.doss && (
                  <p className="trip-note">{t('dayex.areaEmpty', { town: here?.label || '' })}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {detail && (
        <SheetShell title={detail.name} onClose={() => setDetail(null)} width={520} className="dayex-detail">
          {detail.photo && (
            <span className="dayex-detail-photo">
              <HeroImage url={detail.photo} city={detail.name} maxWidth={960} sizes="(max-width: 700px) 92vw, 500px" />
            </span>
          )}
          {reachLine(detail, t) && (
            <p className="dayex-detail-head">
              <span className="dayex-detail-dist">{reachLine(detail, t)}</span>
            </p>
          )}
          {detail.desc && <p className="dayex-detail-desc">{detail.desc}</p>}
          <div className="dayex-detail-acts">
            {detail.open?.type === 'dest' && onOpenDest && (
              <Button onClick={() => { setDetail(null); onOpenDest(detail.open.id); }}>
                {t('dayex.openPage')}
              </Button>
            )}
            {detail.open?.type === 'feature' && onOpenFeature && (
              <Button onClick={() => { setDetail(null); onOpenFeature(detail.open.layer, detail.open.ref); }}>
                {t('dayex.openPage')}
              </Button>
            )}
            {detail.add && (
              <Button variant="primary" onClick={() => { toggle(detail); setDetail(null); }}>
                {isPicked(detail) ? t('day.removeFromMyDays') : t('dayex.addToDayShort')}
              </Button>
            )}
          </div>
        </SheetShell>
      )}
    </DayWizardShell>
  );
}
