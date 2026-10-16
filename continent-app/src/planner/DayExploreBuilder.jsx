import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { SheetShell } from '../browse/SheetShell.jsx';
import { Button, IconButton, Chip, Segmented, Card } from '../components/ui/index.js';
import { PlannerSection } from './PlannerSection.jsx';
import { TripMap } from '../map/TripMap.jsx';
import { DayWizardShell } from './DayWizardShell.jsx';
import { CreditChip } from '../components/CreditChip.jsx';
import { fmtClockLoose } from './daySchedule.js';
import { fmtKm } from './dayFormat.js';
import { haversineKm } from '../lib/runtime_pricing.js';
import { fmtDate } from '../lib/dates.js';
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
import { scrollBehavior } from '../lib/motion.js';
import { CloseIcon, StarIcon, PlusIcon, CheckIcon } from '../components/Icons.jsx';

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

/** The add button a card and a row share. */
function AddButton({ row, picked, onToggle, t }) {
  if (!row.add) return null;
  return (
    <button
      className={`dayex-add${picked ? ' on' : ''}`}
      onClick={() => onToggle(row)}
      aria-pressed={picked}
      aria-label={picked
        ? t('dayex.removeFromDay', { name: row.name })
        : t('dayex.addToDay', { name: row.name })}
      title={picked ? t('dayex.inYourDay') : t('dayex.addToDayShort')}
    >
      {picked ? <CheckIcon size={18} /> : <PlusIcon size={18} />}
    </button>
  );
}

/** What a place is and how far, under its name. "Must see" is said here, in
 *  words, never printed on the photograph (carta-design, never-do 4). */
function PlaceMeta({ row, t }) {
  const dist = reachLine(row, t);
  return (
    <>
      <span className="dayex-card-name">
        <b>{row.name}</b>
        {row.rating?.score != null && <ScoreChip rating={row.rating} size="xs" />}
        {row.gem && <HiddenGemTag />}
      </span>
      <span className="dayex-card-meta">
        {row.must && row.kind !== 'sight' && <span className="dayex-must"><StarIcon size={12} />{t('day.mustSee')}</span>}
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
function PlaceCard({ row, picked, onToggle, onOpen, highlighted, onHover, t }) {
  return (
    <div
      className={`dayex-card${highlighted ? ' is-hi' : ''}${picked ? ' is-picked' : ''}`}
      onMouseEnter={() => onHover?.(row.key)}
      onMouseLeave={() => onHover?.('')}
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
function PlaceRow({ row, picked, onToggle, onOpen, highlighted, onHover, t }) {
  const dist = reachLine(row, t);
  return (
    <Card
      as="li"
      layout="row"
      className={`dayex-row${highlighted ? ' is-hi' : ''}`}
      selected={picked}
      data-key={row.key}
      onMouseEnter={() => onHover?.(row.key)}
      onMouseLeave={() => onHover?.('')}
      title={row.name}
      onOpen={() => onOpen(row)}
      meta={(
        <>
          {row.must && <span className="dayex-must"><StarIcon size={12} />{t('day.mustSee')}</span>}
          {dist && <span>{dist}</span>}
          {row.sub && row.kind !== 'town' && <span>{row.sub}</span>}
        </>
      )}
      rating={row.rating?.score != null ? <ScoreChip rating={row.rating} size="xs" /> : null}
      actions={<AddButton row={row} picked={picked} onToggle={onToggle} t={t} />}
    />
  );
}

/** A rail: a heading and its cards, scroll-snapped on a phone, a grid on a
 *  desktop, with "Show more" once there are more than the grid shows. */
function Rail({ title, sub, rows, loading, isPicked, hi, ...card }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const SHOWN = 6;
  if (!loading && !rows.length) return null;
  const withPhoto = rows.filter((r) => r.photo);
  const without = rows.filter((r) => !r.photo);
  const shown = open ? withPhoto : withPhoto.slice(0, SHOWN);
  const rowsShown = open ? without : without.slice(0, 4);
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
              <PlaceCard key={r.key} row={r} picked={isPicked(r)} highlighted={hi === r.key} {...card} t={t} />
            ))}
        </div>
      ) : null}
      {rowsShown.length > 0 && (
        <ul className="dayex-rows">
          {rowsShown.map((r) => (
            <PlaceRow key={r.key} row={r} picked={isPicked(r)} highlighted={hi === r.key} {...card} t={t} />
          ))}
        </ul>
      )}
    </PlannerSection>
  );
}

export function DayExploreBuilder({
  // T433: the wizard frame, the start's own name, and the days the picks make.
  wizard, startName = '', daysLine = '', preview = [], homeTownId = null,
  stay, dateISO, explorePois, exploreTowns, destinations, stayTownId,
  ideas = [], shortlistPoints = [],
  picks, onTogglePick, townPicks, onToggleTown,
  onStartPlanning, onLetCartaPlan, onChangeStay, onOpenDest, onOpenFeature,
}) {

  const { t, lang } = useI18n();
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
    () => exploreTowns.find((x) => x.id === (homeTownId || stayTownId)) || exploreTowns[0] || null,
    [homeTownId, stayTownId, exploreTowns],
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
    .slice(0, 18)
    .map((r) => {
      const tn = exploreTowns.find((x) => x.id === r.add.town);
      return (r.km ?? 0) >= LOCAL_KM ? { ...r, reach: townReach(homeTown?.dest, tn?.dest) } : r;
    }), [exploreTowns, stayTownId, homeTown]);

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
  const markers = useMemo(() => (flat || allRows).filter(matches)
    .filter((r) => !isPicked(r) && Number.isFinite(r.lat) && Number.isFinite(r.lon))
    // The map frames the day's own surroundings: a town an hour away is in
    // the list, not a reason to zoom the map out to half a country.
    .filter((r) => r.km == null || r.km <= 15)
    .slice(0, 60)
    .map((r) => ({
      id: r.key,
      label: r.name,
      lat: r.lat,
      lon: r.lon,
      cat: r.kind === 'water' ? 'beach' : r.kind === 'trail' || r.kind === 'nature' ? 'beach'
        : r.kind === 'town' ? 'town' : r.kind === 'active' ? 'active' : 'sight',
      must: !!r.must,
    })), [flat, allRows, matches, isPicked]);
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
  const rowByKey = useMemo(() => new Map(allRows.map((r) => [r.key, r])), [allRows]);

  // Tapping a pin scrolls its card into view, which is what keeps the two
  // halves of the desktop layout one surface rather than two lists.
  const listRef = useRef(null);
  const focusCard = useCallback((key) => {
    setHi(key);
    const el = listRef.current?.querySelector(`[data-key="${CSS.escape(key)}"]`);
    el?.scrollIntoView({ behavior: scrollBehavior(), block: 'center', inline: 'center' });
  }, []);

  const count = picks.length + townPicks.length;
  // ---- T433: the days the picks make, said as a schedule -----------------
  const nDays = preview.length;
  const lateDay = preview.find((d) => d.clock?.rows?.length && d.clock.endMin > 19 * 60);
  const summaryText = count === 0
    ? t('dayex.trayEmpty')
    : t(nDays > 1 ? 'dayex.trayDays' : 'dayex.trayDay', { n: count, d: nDays });

  const daysPreview = (
    <ol className="dayex-days">
      {preview.map((d) => (
        <li className="dayex-day" key={`${d.si}:${d.di}`}>
          <div className="dayex-day-head">
            <b>{t('itin.dayN', { n: d.no })}</b>
            <span>{[d.date ? fmtDate(d.date, true) : '', d.town].filter(Boolean).join(', ')}</span>
          </div>
          {d.clock.rows.length ? (
            <>
              <ul className="dayex-day-rows">
                {d.clock.rows.map((r) => (
                  <li key={r.key || `${r.destId}:${r.idx}`}>
                    <span className="dayex-day-time">~{fmtClockLoose(r.arriveMin)}</span>
                    <span className="dayex-day-name">{r.name}</span>
                    {rowByKey.get(r.key) && (
                      <IconButton
                        className="dayex-day-x"
                        onClick={() => toggle(rowByKey.get(r.key))}
                        label={t('dayex.removeFromDay', { name: r.name })}
                      ><CloseIcon size={14} /></IconButton>
                    )}
                  </li>
                ))}
              </ul>
              <p className="dayex-day-foot">
                {t('dayex.dayDone', { time: fmtClockLoose(d.clock.endMin), km: fmtKm(d.clock.km, lang) })}
              </p>
            </>
          ) : (
            <p className="dayex-day-foot">{t('dayex.dayFree')}</p>
          )}
        </li>
      ))}
    </ol>
  );

  const foot = {
    back: () => wizard.onGo(wizard.at - 1),
    summary: (
      <button
        type="button"
        className="dayex-tray-summary"
        onClick={() => setTrayOpen(true)}
        aria-haspopup="dialog"
        disabled={!count}
      >
        <span>{summaryText}</span>
        {lateDay && <small className="dayex-tray-fit">{t('dayex.dayLate', { n: lateDay.no })}</small>}
      </button>
    ),
    secondary: wide ? { label: count ? t('dayex.cartaRest') : t('dayex.cartaAll'), onClick: () => onLetCartaPlan(trayRows) } : null,
    next: {
      label: t(nDays > 1 ? 'dayex.openMyDays' : 'dayex.openMyDay'),
      onClick: onStartPlanning,
      disabled: !count,
    },
  };

  return (
    <DayWizardShell {...wizard} layout="wide" canvasKey="manual" foot={foot} className="dayw-manual">
      <div className={`dayex${view === 'map' ? ' dayex-mapview' : ''}`}>
        <header className="dayex-head">
          <span className="dayex-head-text">
            <h1 className="guide-title">{t('dayex.title', { town: startName || homeTown?.dest?.city || '' })}</h1>
            {daysLine && <small>{daysLine}</small>}
          </span>
          <span className="dayex-head-acts">
            <IconButton
              tone="surface"
              className="dayex-search-btn"
              onClick={() => { setSearchOpen((v) => !v); setQuery(''); }}
              aria-expanded={searchOpen}
              label={t('day.exploreSearchAria')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
              </svg>
            </IconButton>
            <Button size="sm" className="dayex-change" onClick={onChangeStay}>{t('dayex.change')}</Button>
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
              <button className="dayex-search-clear" onClick={() => setQuery('')} aria-label={t('day.clearSearch')}><CloseIcon size={16} /></button>
            )}
          </div>
        )}

        <div className="dayex-bar">
          <div className="dayex-chips" role="group" aria-label={t('dayex.filterAria')}>
            {CHIPS.map((c) => (
              <Chip key={c} selected={chip === c} onClick={() => setChip(c)}>{t(CHIP_KEY[c])}</Chip>
            ))}
          </div>
          {!wide && (
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
          )}
        </div>

        <div className="dayex-body">
          <div className="dayex-list" ref={listRef}>
            {flat ? (
              <PlannerSection
                title={t(CHIP_KEY[chip])}
                className="dayex-rail"
                aside={<span className="dayex-count">{t('dayex.nPlaces', { n: flat.length })}</span>}
              >
                {flat.length ? (
                  <>
                    <div className="dayex-cards dayex-cards-full">
                      {flat.filter((r) => r.photo).map((r) => (
                        <PlaceCard key={r.key} row={r} picked={isPicked(r)} highlighted={hi === r.key} {...cardProps} t={t} />
                      ))}
                    </div>
                    <ul className="dayex-rows">
                      {flat.filter((r) => !r.photo).map((r) => (
                        <PlaceRow key={r.key} row={r} picked={isPicked(r)} highlighted={hi === r.key} {...cardProps} t={t} />
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
                <div ref={dossRef}>
                  <Rail title={t('dayex.railDo')} rows={doRows} loading={!!loading.doss} {...cardProps} />
                </div>
                <Rail title={t('dayex.railFood')} rows={foodRows} {...cardProps} />
                {shortRows.length > 0 && (
                  <Rail title={t('dayex.railShortlist')} rows={shortRows} {...cardProps} />
                )}
                <div ref={waterRef}>
                  <Rail title={t('dayex.railWater')} rows={water || []} loading={!!loading.water} {...cardProps} />
                </div>
                <Rail title={t('dayex.railTowns')} rows={townRows} {...cardProps} />
              </>
            )}
          </div>

          <div className="dayex-mapcol">
            {wide && (
              <section className="dayex-preview" aria-labelledby="dayex-preview-h">
                <div className="dayex-preview-head">
                  <h2 id="dayex-preview-h">{t('dayex.trayTitle')}</h2>
                  {count > 0 && <span>{summaryText}</span>}
                </div>
                {count ? daysPreview : <p className="dayex-day-foot">{t('dayex.trayNone')}</p>}
                <div className="dayex-preview-carta">
                  <CreditChip />
                </div>
              </section>
            )}
            {(wide || view === 'map') && (
              <div className="dayex-map">
                <TripMap
                  stops={mapStops}
                  pois={markers}
                  onPoiClick={(id) => { const r = rowByKey.get(id); if (r?.add) toggle(r); else focusCard(id); }}
                  focus={stay ? { lat: stay.lat, lon: stay.lon, zoom: 12 } : null}
                  padBottom={40}
                  fitMaxZoom={14}
                  showRoute={false}
                  zoomControls
                  cooperativeGestures={!wide}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {trayOpen && (
        <SheetShell title={t('dayex.trayTitle')} onClose={() => setTrayOpen(false)} width={480} className="dayex-tray-sheet">
          {count === 0 ? <p className="trip-note">{t('dayex.trayNone')}</p> : daysPreview}
          <div className="dayex-sheet-acts">
            <Button onClick={() => { setTrayOpen(false); onLetCartaPlan(trayRows); }}>
              {count ? t('dayex.cartaRest') : t('dayex.cartaAll')}
            </Button>
            <CreditChip />
          </div>
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
            {reachLine(detail, t) && <span className="dayex-detail-dist">{reachLine(detail, t)}</span>}
          </div>
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
