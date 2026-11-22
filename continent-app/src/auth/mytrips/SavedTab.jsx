import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip, ChipGroup, Field, ScorePlate } from '../../components/ui/index.js';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import { PriceControl, ExampleBar } from './TripParts.jsx';
import { WatchRail, WatchSheet, useWatched } from './Watch.jsx';
import { SectHead, MoveInk, NoPrice, Silhouette } from './atlas/Ink.jsx';
import { NAME_OF } from './atlas/plateData.js';
import { countryName } from '../../lib/countryName.js';
import { inUnit, moveInUnit, basisOf, sameBasis, priceUnit } from '../../lib/price/priceView.js';
import {
  PlusIcon, ArrowDownIcon, RouteIcon, EyeIcon, CloseIcon, PencilIcon, ArrowLeftIcon, ArrowRightIcon, BookmarkIcon, CheckIcon, FriendsIcon, ShareIcon,
  MapIcon, ListIcon,
} from '../../components/Icons.jsx';
import { FAV_KIND_LABEL } from '../../lib/favorites.js';
import { formatMoney } from '../../lib/money.js';
import { activeLocale } from '../../lib/localeState.js';
import { cheapestStayMonths } from '../../lib/costIndex.js';
import {
  priceChange, createList, renameList, deleteList, restoreList, moveList, toggleInList, setNote, MAX_NOTE,
} from '../../lib/savedLists.js';
import { byVotes, canRemoveItem, friendsToAdd } from '../../lib/sharedListModel.js';
import { planFromSaves, cheapestStopDay } from '../../lib/savedPlan.js';
import { CardMenu, Faces } from './parts.jsx';
import { Empty } from './MyTripsTabs.jsx';
import { scrollBehavior } from '../../lib/motion.js';
import { SharedItem, PeoplePicker, facesOf } from './SharedList.jsx';

import { SavedPlate } from './atlas/SavedPlate.jsx';
// The top holds the folded credit button (24 px) clear of the northern pins.
const WIDE = '(min-width: 1024px)';

/** Whether the map stands beside the list (1024 px and up). */
function useWide() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(WIDE);
    if (!mq) return undefined;
    const on = () => setWide(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return !!wide;
}

/** The record key a saved row's list membership and save price live under. */
const metaKey = (row) => (row.kind === 'dest' ? `dest:${row.id}` : row.key);

/** A shared list's item as a saved row: the row resolved from its key where
 *  the app has one, else what the adder's app stored with it (T941). */
function sharedRow(it, resolved) {
  const r = resolved?.get?.(it.key);
  const [kind, ...rest] = it.key.split(':');
  const tail = rest.join(':');
  const base = r || { kind, id: kind === 'dest' ? tail : tail.split('/').pop(), cc: it.cc, name: it.name, img: it.img, missing: false };
  return { ...base, key: it.key, shared: it };
}

const sinceDay = (ms) => {
  try { return new Date(ms).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' }); } catch { return ''; }
};

const monthName = (m, style = 'long') => {
  try { return new Date(Date.UTC(2026, m - 1, 15)).toLocaleDateString(activeLocale(), { month: style, timeZone: 'UTC' }); } catch { return ''; }
};

/** A row's kind in the singular ("Plek"); the filter chips keep the plural. */
const KIND_ONE = new Set(['dest', 'trip', 'journey', 'region', 'trail', 'beach', 'lake', 'mountain', 'cycle']);
const kindOne = (t, kind) => (KIND_ONE.has(kind) ? t(`mt.kindOne.${kind}`) : FAV_KIND_LABEL[kind] ? t(FAV_KIND_LABEL[kind]) : '');

/** A list's cover: its first four photos as a 2 x 2 mosaic. */
function Mosaic({ rows }) {
  const four = rows.slice(0, 4);
  return (
    <span className={`mt-mosaic is-${Math.max(1, four.length)}`} aria-hidden="true">
      {four.length ? four.map((r) => (
        <HeroImage key={r.key} url={r.img} city={r.name || r.id} iso2={r.cc} className="mt-mosaic-img" maxWidth={240} ratio={[1, 1]} sizes="64px" />
      )) : <span className="mt-mosaic-none"><BookmarkIcon size={22} /></span>}
    </span>
  );
}

/** One saved thing as a photo card (decision 0016): a 4:3 photo with the
 *  menu as a paper disc and, in Kiezen, the select disc; the name and flag
 *  (two lines at most), the Score and kind, today's figure with its unit or
 *  the empty cell, the move since the save in ink, and the traveller's note.
 *  The cheapest month, the lists and the note sit in the menu. */
function SavedItem({
  row, meta, cost, choices, basis, dest, lists, shared = [], me = null, onShared = null, choosing = false, selected, onSelect, onOpen, onRemove, active, itemRef,
  onHot = null,
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState(meta?.note || '');
  const change = priceChange(meta, cost?.dayEur);
  // The move in the chosen unit; hidden when the saved price stood on another month or stay style.
  const move = change ? moveInUnit(meta.eur, cost.dayEur, choices, { sameBasis: sameBasis(meta, basis) }) : null;
  const fig = cost ? inUnit(cost.dayEur, choices) : null;
  const months = row.kind === 'dest' && dest ? cheapestStayMonths(dest) : null;
  // The When month, as the basis reads it ('YYYY-MM|...'); none in the any-time view.
  const whenMonth = Number(String(basis || '').slice(5, 7)) || null;
  const cheapMonth = months?.length > 0 && months[0] !== whenMonth ? months[0] : null;
  const k = metaKey(row);
  const name = row.name || row.id;
  const inShared = (l) => l.items.find((it) => it.key === k) || null;
  const inLists = [...lists.filter((l) => l.keys.includes(k)), ...shared.filter(inShared)];
  // A place's sub is its country, which the flag already says.
  const kind = [kindOne(t, row.kind), row.kind === 'dest' ? '' : row.sub].filter(Boolean).join(', ');
  return (
    <li
      className={`mt-pcard${choosing ? ' is-choosing' : ''}${selected ? ' is-selected' : ''}${active ? ' is-active' : ''}`}
      ref={itemRef}
      // G12 atlas: pointing at a card raises its pin on the map as a small plate.
      onMouseEnter={onHot ? () => onHot(k) : undefined}
      onMouseLeave={onHot ? () => onHot('') : undefined}
      onFocus={onHot ? () => onHot(k) : undefined}
      onBlur={onHot ? (e) => { if (!e.currentTarget.contains(e.relatedTarget)) onHot(''); } : undefined}
    >
      <span className="mt-pcard-ph">
        {/* The photo opens the thing for a pointer; the keyboard has its name. */}
        <span className="mt-pcard-img" onClick={() => !row.missing && onOpen(row)} aria-hidden="true">
          <HeroImage url={row.img} city={name} iso2={row.cc} className="mt-pcard-imgel" maxWidth={480} ratio={[4, 3]} sizes="(min-width: 820px) 220px, 50vw" />
        </span>
        {/* Kiezen (G12 polish): a select disc on the photo, the same function behind one tap. */}
        {choosing && (
          <Pressable className="mt-pcard-sel" haptic="tick" aria-pressed={selected} disabled={row.missing}
            aria-label={t('mt.selectItem', { name })} onClick={() => onSelect(k)}>
            {selected && <CheckIcon size={16} />}
          </Pressable>
        )}
        <CardMenu
          label={t('mt.itemMenu', { name })}
          actions={[
            // The lists this place is in: the picker shows them chosen, the menu line counts them.
            ...(lists.length || shared.length ? [{ key: 'lists', label: inLists.length ? `${t('mt.addToList')} (${inLists.length})` : t('mt.addToList'), icon: <PlusIcon size={16} />, onClick: () => setPicking(true) }] : []),
            // The cheapest month is news only when it is not the month the figures
            // use; it sits in the menu so the card stays one figure and a name.
            ...(cheapMonth ? [{ key: 'cheap', label: t('mt.cheapestTag', { month: monthName(cheapMonth, 'long') }), icon: <ArrowDownIcon size={16} />, onClick: () => onOpen(row) }] : []),
            { key: 'note', label: t(meta?.note ? 'mt.editNote' : 'mt.addNote'), icon: <PencilIcon size={16} />, onClick: () => { setDraft(meta?.note || ''); setEditing(true); } },
          ]}
          onRemove={() => onRemove(row)}
          removeLabel={t('saved.removeItem', { name })}
        />
      </span>
      {row.missing ? (
        <span className="mt-pcard-name is-missing">{t('fav.missing')}</span>
      ) : (
        <Button variant="quiet" className="mt-pcard-name" onClick={() => onOpen(row)}>
          {name}{row.cc && <>{' '}<CountryFlag country={row.cc} size={14} /></>}
        </Button>
      )}
      {/* A place is said by its Score (and the chips); another kind says its word. */}
      {row.kind !== 'dest' && kind && <span className="mt-pcard-kind">{kind}</span>}
      {/* The Score and today's figure share one line, so 42 saves stay a short scroll on a phone. */}
      <span className="mt-pcard-fig">
        {dest?.rating && <ScorePlate rating={dest.rating} />}
        {Number.isFinite(fig) ? (
          <span className="mt-pcard-sum"><b className="num">{formatMoney(fig)}</b><small>{t(priceUnit(choices).span === 'trip' ? 'mt.unitWhole' : 'card.unitDay')}</small></span>
        ) : <NoPrice>{t('saved.factNoPrice')}</NoPrice>}
      </span>
      {move ? (
        <MoveInk delta={move}>
          {t(move < 0 ? 'mt.lowerSince' : 'mt.higherSince', { price: formatMoney(Math.abs(move)), date: sinceDay(change.at) })}
        </MoveInk>
      ) : null}
      {editing ? (
        <form className="mt-note-form" onSubmit={(e) => { e.preventDefault(); setNote(k, draft); setEditing(false); }}>
          <Field label={t('mt.note')} value={draft} maxLength={MAX_NOTE} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <Button size="sm" type="submit">{t('saved.done')}</Button>
        </form>
      ) : meta?.note ? (
        <Button variant="quiet" size="sm" className="mt-pcard-note" iconStart={<PencilIcon size={14} />} onClick={() => { setDraft(meta.note); setEditing(true); }}>
          {meta.note}
        </Button>
      ) : null}
      {picking && (
        <div className="mt-pick-lists" role="group" aria-label={t('mt.inLists')}>
          {lists.map((l) => (
            <Chip key={l.id} kind="filter" selected={l.keys.includes(k)} onClick={() => toggleInList(l.id, k)}>{l.name}</Chip>
          ))}
          {shared.map((l) => {
            const it = inShared(l);
            return (
              <Chip key={`sh:${l.id}`} kind="filter" selected={!!it} icon={<FriendsIcon size={16} />}
                disabled={!!it && !canRemoveItem(l, it, me)}
                onClick={() => onShared?.(l, it, { key: k, name: row.name, cc: row.cc, img: row.img })}>
                {l.name}
              </Chip>
            );
          })}
          <Button size="sm" variant="quiet" onClick={() => setPicking(false)}>{t('saved.done')}</Button>
        </div>
      )}
    </li>
  );
}

/**
 * Saved (T925): "All saved" and the traveller's own lists as cards with a
 * 2 x 2 photo cover; kind filters and Price fell; the saved things as rows
 * with today's price, the move since the save (only where a price was
 * recorded when it was saved), the cheapest month and a note; select boxes
 * and one bar, Plan a trip with these. A map beside the list from 1024 px, a
 * List or Map pill below that.
 *
 *   rows        every saved thing, resolved (useFavoriteItems + account saves)
 *   saved       lib/savedLists state { lists, meta }
 *   onPlan(stops) the picks as the planner's stops (lib/savedPlan.js, T942)
 *   onUndo      the panel's undo slot: ({ key, label, commit, restore })
 */
export function SavedTab({
  rows: ownRows, saved, costs, destinations = {}, loading, onOpen, onRemove, onPlan, onBrowse, onUndo, top = null, geo = null, europe = null,
  shared = null, friends = [], sharedRows = null, heldKey = '',
  choices = null, setChoices = null, example = false, onExample = null, onExampleClose = null, exampleRows = [], mapHost = null, initialCc = '', onCcUsed = null,
}) {
  const { t } = useI18n();
  // The rows' figures follow the traveller's price view, so their unit must too:
  // the house string in the day view, the view's own unit ("for 2 people, 7 nights") in a total view.
  const basis = basisOf(choices);
  const watched = useWatched({ sync: !example });
  const [watchOpen, setWatchOpen] = useState(null);
  const [cc, setCc] = useState(initialCc || '');
  // A country handed in once (the country sheet's Show saved) is taken, then let go.
  useEffect(() => { if (initialCc) { setCc(initialCc); onCcUsed?.(); } }, [initialCc]); // eslint-disable-line react-hooks/exhaustive-deps -- runs per hand-off
  const [list, setList] = useState('all');
  const [kind, setKind] = useState('all');
  const [fell, setFell] = useState(false);
  const [view, setView] = useState('list');
  const [sel, setSel] = useState([]);
  // Choose mode (G12 polish): Kiezen shows the select boxes, Klaar hides them and lets the picks go.
  const [choosing, setChoosing] = useState(false);
  const [naming, setNaming] = useState(null); // null, 'new' or a list id
  const [name, setName] = useState('');
  const [active, setActive] = useState('');
  const [people, setPeople] = useState(null); // null, or the list id whose people are open
  const [shareFailed, setShareFailed] = useState(false);
  const itemRefs = useRef(new Map());
  // The map is drawn only where it shows: beside the list, or when asked for.
  const wide = useWide();

  // Example mode: real catalogue places, never saved or counted.
  const rows = example ? exampleRows : ownRows;
  const lists = example ? [] : saved.lists;
  const current = lists.find((l) => l.id === list) || null;
  // T941: the lists shared with friends, from the server (none before 059).
  const me = shared?.me || null;
  const act = shared?.act || null;
  const sharedLists = useMemo(
    () => (shared && !shared.missing ? shared.lists.filter((l) => heldKey !== `sharedlist:${l.id}`) : []),
    [shared, heldKey],
  );
  const currentShared = sharedLists.find((l) => `sh:${l.id}` === list) || null;
  const canShare = !!act && !!shared && !shared.missing && friends.length > 0;
  const sharedRowsOf = (l) => (l ? l.items.filter((it) => heldKey !== `shared:${it.id}`).map((it) => sharedRow(it, sharedRows)) : []);
  const inList = useMemo(
    () => (currentShared
      ? byVotes(currentShared.items.filter((it) => heldKey !== `shared:${it.id}`)).map((it) => sharedRow(it, sharedRows))
      : current ? rows.filter((r) => current.keys.includes(metaKey(r))) : rows),
    [rows, current, currentShared, sharedRows, heldKey],
  );
  const costOf = (r) => (r.kind === 'dest' ? costs?.get?.(r.id) || null : null);
  const fellOf = (r) => { const c = priceChange(saved.meta[metaKey(r)], costOf(r)?.dayEur); return c && c.diff < 0; };
  const kinds = useMemo(() => {
    const by = new Map();
    inList.forEach((r) => by.set(r.kind, (by.get(r.kind) || 0) + 1));
    return [...by.entries()];
  }, [inList]);
  const kindNow = kinds.some(([k]) => k === kind) ? kind : 'all';
  const anyFell = inList.some(fellOf);
  const shown = inList.filter((r) => (kindNow === 'all' || r.kind === kindNow) && (!fell || fellOf(r)) && (!cc || r.cc === cc));
  const exWatch = useMemo(() => (example ? exampleRows.slice(0, 2).map((r) => {
    const eur = costs?.get?.(r.id)?.dayEur;
    return Number.isFinite(eur) ? { id: `day:${r.id}`, kind: 'day', ref: r.id, label: r.name, placeKey: `dest:${r.id}`, unitNote: 'day, each', source: t('watch.srcDay'), alert: false, pts: [{ at: new Date().toISOString(), eur: Math.round(eur) }] } : null;
  }).filter(Boolean) : []), [example, exampleRows, costs, t]);
  const watchItems = example ? exWatch : watched;

  const toggleSel = (k) => setSel((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const allRows = [...rows, ...(currentShared ? inList.filter((r) => !rows.some((x) => metaKey(x) === metaKey(r))) : [])];
  const picked = allRows.filter((r) => sel.includes(metaKey(r)));
  // T942: every kind goes to the planner, a place as a stop and a trail,
  // beach, lake, mountain or route as a day at its nearest town. The price
  // is only for what the planner prices: the stops.
  const plan = useMemo(() => planFromSaves(picked, destinations), [picked.map(metaKey).join('|'), destinations]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed by the picks
  const fromEur = cheapestStopDay(plan.stops, (id) => costs?.get?.(id)?.dayEur);

  const coverRows = (l) => rows.filter((r) => l.keys.includes(metaKey(r)));
  const startName = (id) => { setNaming(id); setName(id === 'new' ? '' : (lists.find((l) => l.id === id)?.name || '')); };
  const submitName = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (String(naming).startsWith('sh:')) act?.rename(naming.slice(3), name.trim()).catch(() => {});
    else if (naming === 'new') {
      const { id } = createList(name, sel);
      if (id) setList(id);
    } else renameList(naming, name);
    setNaming(null);
  };
  // Sharing a private list moves it to the server with its saves and notes;
  // the device copy goes once the server has it.
  const shareList = (l, friendIds) => {
    setShareFailed(false);
    const items = coverRows(l).map((r) => ({ key: metaKey(r), name: r.name, cc: r.cc, img: r.img, note: saved.meta[metaKey(r)]?.note }));
    act.create(l.name, friendIds, items).then((id) => {
      if (!id) { setShareFailed(true); return; }
      deleteList(l.id);
      setPeople(null);
      setList(`sh:${id}`);
    }).catch(() => setShareFailed(true));
  };
  const onShared = (l, it, item) => {
    if (it) act?.removeItem(l.id, it.id).catch(() => {});
    else act?.addItem(l.id, item).catch(() => {});
  };
  const removeShared = (it, label) => {
    const listId = currentShared?.id;
    onUndo({ key: `shared:${it.id}`, label, commit: () => act?.removeItem(listId, it.id).catch(() => {}) });
  };
  const removeSharedList = (l) => {
    setList('all');
    onUndo({ key: `sharedlist:${l.id}`, label: l.name, commit: () => act?.remove(l.id).catch(() => {}), restore: () => setList(`sh:${l.id}`) });
  };
  const leaveShared = (l) => { setList('all'); act?.removeMember(l.id, me).catch(() => {}); };
  const removeList = (l) => {
    const { removed, at } = deleteList(l.id);
    setList('all');
    if (removed) onUndo({ key: `list:${l.id}`, label: l.name, restore: () => { restoreList(removed, at); setList(l.id); } });
  };

  // The map: every shown thing with a point.
  const points = useMemo(() => shown.map((r) => {
    const d = r.kind === 'dest' ? destinations[r.id] : null;
    const lat = d ? (d.city_lat ?? d.lat) : r.lat;
    const lon = d ? (d.city_lon ?? d.lon) : r.lon;
    const c = costOf(r);
    const fig = c ? inUnit(c.dayEur, choices) : null;
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon, name: r.name || '', img: r.img, key: metaKey(r), cc: r.cc, fig } : null;
  }).filter(Boolean), [shown, destinations, costs, choices]); // eslint-disable-line react-hooks/exhaustive-deps -- costOf reads costs
  const [hot, setHot] = useState('');
  // A picked country names the list head: its silhouette from the plate, its name.
  const ccShape = cc ? geo?.countries?.find((c) => c.cc === cc)?.d || '' : '';
  const ccName = cc ? countryName(cc, NAME_OF[cc] || cc) : '';
  // A pin opens its row: the list filters to the pin's country (a removable
  // chip) and scrolls the row into view.
  const pickPin = (pin) => {
    setActive(pin.key);
    if (pin.cc) setCc(pin.cc);
    setView('list');
    requestAnimationFrame(() => itemRefs.current.get(pin.key)?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() }));
  };

  if (!rows.length && !loading) {
    return (
      <>
        {top}
        <div className="atlas-empty">
          <h2 className="atlas-empty-h">{t('mt.savedEmptyTitle')}</h2>
          <div className="atlas-empty-acts">
            <Button variant="primary" iconStart={<BookmarkIcon size={18} />} onClick={onBrowse}>{t('mt.discoverPlaces')}</Button>
            {onExample && <Button variant="secondary" className="mt-soft" iconStart={<EyeIcon size={18} />} onClick={onExample}>{t('mt.seeExample')}</Button>}
          </div>
        </div>
      </>
    );
  }
  // G12 round 4: the Your Europe plate with the saved places, not a street map.
  const liveMap = points.length > 0 && geo ? (
    <SavedPlate geo={geo} europe={europe} points={points} cc={cc} hot={hot} sweepKey={list} onCountry={setCc} onPin={pickPin} />
  ) : null;

  return (
    <div className="mt-saved">
      {example && <ExampleBar onClose={onExampleClose} />}
      {mapHost && liveMap && createPortal(liveMap, mapHost)}
      {/* The lead (followed prices, then the lists) spans the width above the
          rows and the map from 1100 px; the rows stand beside the map
          (owner review 2026-11-22, 72-atlas.css "flow"). */}
      <div className="atlas-lead mt-saved-lead">
      {watchItems.length > 0 && <div className="mt-saved-watch"><WatchRail items={watchItems} onOpen={setWatchOpen} /></div>}
      {watchOpen && (
        <WatchSheet item={watchOpen} example={example} dest={destinations[String(watchOpen.placeKey || '').replace(/^dest:/, '')] || null}
          onOpenPlace={(w) => { const id = String(w.placeKey || '').replace(/^dest:/, ''); const row = rows.find((x) => x.kind === 'dest' && x.id === id); if (row) onOpen(row); }}
          onClose={() => setWatchOpen(null)} />
      )}
      <div className="mt-saved-lists">
      <SectHead id="mt-lists-h" title={t('mt.lists')} />
      <div className="mt-lists atlas-rail" role="group" aria-labelledby="mt-lists-h">
        <Button className="mt-lcard" aria-pressed={list === 'all'} onClick={() => setList('all')}>
          <Mosaic rows={rows} />
          <span className="mt-lcard-name">{list === 'all' && <CheckIcon size={14} />}{t('mt.allSaved')}</span>
          <span className="mt-lcard-n">{t(rows.length === 1 ? 'mt.saves1' : 'mt.savesN', { n: rows.length })}</span>
        </Button>
        {lists.map((l) => (
          <Button key={l.id} className="mt-lcard" aria-pressed={list === l.id} onClick={() => setList(l.id)}>
            <Mosaic rows={coverRows(l)} />
            <span className="mt-lcard-name">{list === l.id && <CheckIcon size={14} />}{l.name}</span>
            <span className="mt-lcard-n">{t(coverRows(l).length === 1 ? 'mt.saves1' : 'mt.savesN', { n: coverRows(l).length })}</span>
          </Button>
        ))}
        {sharedLists.map((l) => {
          const cover = sharedRowsOf(l);
          return (
            <Button key={`sh:${l.id}`} className="mt-lcard" aria-pressed={list === `sh:${l.id}`} onClick={() => setList(`sh:${l.id}`)}>
              <Mosaic rows={cover} />
              <span className="mt-lcard-name">{list === `sh:${l.id}` && <CheckIcon size={14} />}{l.name}</span>
              {/* Who it is shared with, read after the visible name: an aria-label would hide the count the card shows
                  (axe label-content-name-mismatch). Every language's key starts with "{name}, ". */}
              <span className="sr-only">{t('mt2.sharedListLabel', { name: '', people: l.members.map((m) => m.name).join(', ') })}</span>
              <span className="mt-lcard-n mt-lcard-shared">
                <Faces people={facesOf(l.members)} max={3} />
                {t(cover.length === 1 ? 'mt.saves1' : 'mt.savesN', { n: cover.length })}
              </span>
            </Button>
          );
        })}
        <Button className="mt-lcard is-new" onClick={() => startName('new')} aria-expanded={naming === 'new'}>
          <span className="mt-mosaic is-new" aria-hidden="true"><PlusIcon size={24} /></span>
          <span className="mt-lcard-name">{t('mt.newList')}</span>
          <span className="mt-lcard-n">{sel.length ? t('mt.newListWith', { n: sel.length }) : t('mt.newListLine')}</span>
        </Button>
      </div>

      {naming && (
        <form className="mt-name-form" onSubmit={submitName}>
          <Field label={t(naming === 'new' ? 'mt.listName' : 'mt.renameList')} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
          <Button type="submit" disabled={!name.trim()}>{t(naming === 'new' ? 'mt.createList' : 'saved.done')}</Button>
          <Button variant="quiet" onClick={() => setNaming(null)}>{t('pf.cancel')}</Button>
        </form>
      )}
      </div>
      </div>
      <div className="atlas-main mt-saved-main">
      {list === 'all' && top}

      {/* One compact row (owner review): the price control; Kiezen at its end from 1100 px. */}
      <div className="mt-saved-tools">
        <PriceControl choices={choices} setChoices={setChoices} />
        {/* G12 atlas: from 1100 px Kiezen ends the tools row; a phone keeps it in the list head. */}
        {shown.length > 0 && (
          <Pressable className="mt-kies is-tools" aria-pressed={choosing}
            onClick={() => { if (choosing) setSel([]); setChoosing((v) => !v); }}>
            {t(choosing ? 'saved.done' : 'mt.choose')}
          </Pressable>
        )}
      </div>
      {(kinds.length > 1 || anyFell || fell) && <div className="mt-saved-filters atlas-chips-scroll">
        {kinds.length > 1 && (
          <ChipGroup label={t('saved.kindLabel')} className="mt-chips">
            <Chip kind="choice" selected={kindNow === 'all'} onClick={() => setKind('all')}>{t('mt.kindAll')}</Chip>
            {kinds.map(([k, n]) => (
              <Chip key={k} kind="choice" selected={kindNow === k} onClick={() => setKind(k)}>
                {t(FAV_KIND_LABEL[k])} <span className="ink-chip-n num">{n}</span>
              </Chip>
            ))}
          </ChipGroup>
        )}
        {(anyFell || fell) && (
          <Chip kind="filter" selected={fell} onClick={() => setFell((v) => !v)}>{t('mt.priceFell')}</Chip>
        )}
      </div>}

      {/* One head for the list (decision 0016): its name and count, Kiezen and the
          list's own controls; a picked country shows its silhouette and Toon alles. */}
      <SectHead
        id="mt-saved-h"
        className={`mt-saved-head${cc ? ' is-country' : ''}`}
        icon={cc ? <Silhouette d={ccShape} className="ink-sh-icon" /> : null}
        title={cc ? ccName : (current?.name || currentShared?.name || t('mt.allSaved'))}
        count={shown.length}
        action={(
          <>
            {cc && <Pressable className="mt-kies is-clear" onClick={() => setCc('')}>{t('mt.showAll')}</Pressable>}
            {/* Below 1024 px List or Map, as an icon frame at the head of the list it switches. */}
            <Pressable className="mt-view-toggle" aria-label={t(view === 'map' ? 'mt.viewList' : 'mt.viewMap')}
              onClick={() => setView((v) => (v === 'map' ? 'list' : 'map'))}>
              {view === 'map' ? <ListIcon size={20} /> : <MapIcon size={20} />}
            </Pressable>
            {shown.length > 0 && (
              <Pressable className="mt-kies is-head" aria-pressed={choosing}
                onClick={() => { if (choosing) setSel([]); setChoosing((v) => !v); }}>
                {t(choosing ? 'saved.done' : 'mt.choose')}
              </Pressable>
            )}
            {currentShared && (
              <Button size="sm" className="mt-people-btn" aria-expanded={people === currentShared.id}
                aria-label={t('mt2.peopleIn', { name: currentShared.name })}
                onClick={() => setPeople((p) => (p === currentShared.id ? null : currentShared.id))}>
                <Faces people={facesOf(currentShared.members)} max={4} />
              </Button>
            )}
            {current && (
              <CardMenu
                label={t('mt.listMenu', { name: current.name })}
                actions={[
                  { key: 'rename', label: t('mt.renameList'), icon: <PencilIcon size={16} />, onClick: () => startName(current.id) },
                  ...(canShare ? [{ key: 'share', label: t('mt2.share'), icon: <ShareIcon size={16} />, onClick: () => { setShareFailed(false); setPeople(current.id); } }] : []),
                  ...(lists[0]?.id !== current.id ? [{ key: 'up', label: t('mt.moveEarlier'), icon: <ArrowLeftIcon size={16} />, onClick: () => moveList(current.id, -1) }] : []),
                  ...(lists[lists.length - 1]?.id !== current.id ? [{ key: 'down', label: t('mt.moveLater'), icon: <ArrowRightIcon size={16} />, onClick: () => moveList(current.id, 1) }] : []),
                ]}
                onRemove={() => removeList(current)}
                removeLabel={t('mt.deleteList', { name: current.name })}
              />
            )}
            {currentShared && (
              <CardMenu
                label={t('mt.listMenu', { name: currentShared.name })}
                actions={currentShared.mine ? [
                  { key: 'rename', label: t('mt.renameList'), icon: <PencilIcon size={16} />, onClick: () => { setNaming(`sh:${currentShared.id}`); setName(currentShared.name); } },
                  { key: 'people', label: t('mt2.addPeople'), icon: <FriendsIcon size={16} />, onClick: () => setPeople(currentShared.id) },
                ] : [
                  { key: 'leave', label: t('mt2.leaveList'), icon: <ArrowLeftIcon size={16} />, onClick: () => leaveShared(currentShared) },
                ]}
                onRemove={currentShared.mine ? () => removeSharedList(currentShared) : undefined}
                removeLabel={t('mt.deleteList', { name: currentShared.name })}
              />
            )}
          </>
        )}
      />
      {current && people === current.id && (
        <PeoplePicker
          friends={friends}
          me={me}
          submitLabel={(n) => (n ? t('mt2.shareWithN', { n }) : t('mt2.share'))}
          onSubmit={(ids) => shareList(current, ids)}
          onClose={() => setPeople(null)}
        />
      )}
      {currentShared && people === currentShared.id && (
        <PeoplePicker
          friends={friendsToAdd(friends, currentShared)}
          members={currentShared.members}
          me={me}
          owner={currentShared.mine}
          submitLabel={(n) => (n ? t('mt2.addN', { n }) : t('mt2.addPeople'))}
          onSubmit={(ids) => ids.forEach((u) => act.addMember(currentShared.id, u).catch(() => {}))}
          onRemoveMember={(m) => act.removeMember(currentShared.id, m.userId).catch(() => {})}
          onClose={() => setPeople(null)}
        />
      )}
      {shareFailed && <p className="mt-muted" role="alert">{t('mt2.shareFailed')}</p>}
      <div className={`mt-split is-${view}${mapHost ? ' is-hosted' : ''}`}>
        <div className="mt-split-list">
          {shown.length ? (
            <ul className={`mt-items${currentShared ? ' is-shared-grid' : ' mt-pgrid'}`}>
              {shown.map((r) => {
                const k = metaKey(r);
                if (r.shared) {
                  return (
                    <SharedItem
                      key={r.shared.id}
                      list={currentShared}
                      item={r.shared}
                      row={r}
                      cost={costOf(r)}
                      choices={choices}
                      choosing={choosing}
                      me={me}
                      act={act}
                      selected={sel.includes(k)}
                      onSelect={toggleSel}
                      onOpen={onOpen}
                      onRemove={removeShared}
                    />
                  );
                }
                return (
                  <SavedItem
                    key={r.key}
                    row={r}
                    meta={saved.meta[k]}
                    cost={costOf(r)}
                    choices={choices}
                    basis={basis}
                    dest={r.kind === 'dest' ? destinations[r.id] : null}
                    lists={lists}
                    shared={act ? sharedLists : []}
                    me={me}
                    onShared={onShared}
                    choosing={choosing}
                    selected={sel.includes(k)}
                    active={active === k}
                    onHot={setHot}
                    onSelect={toggleSel}
                    onOpen={onOpen}
                    onRemove={onRemove}
                    itemRef={(el) => { if (el) itemRefs.current.set(k, el); else itemRefs.current.delete(k); }}
                  />
                );
              })}
            </ul>
          ) : (
            <p className="mt-muted">{t((current && !current.keys.length) || (currentShared && !currentShared.items.length) ? 'mt.listEmpty' : 'mt.nothingMatches')}</p>
          )}
        </div>
        <div className="mt-split-map">
          {mapHost || !(wide || view === 'map') ? null : liveMap || (
            <p className="mt-muted">{t('mt.noMapPoints')}</p>
          )}
        </div>
      </div>

      {choosing && sel.length > 0 && (
        <div className="mt-selbar" role="region" aria-label={t('mt.selection')}>
          <span className="mt-selbar-text">
            <CheckIcon size={16} />
            {Number.isFinite(fromEur)
              ? t('mt.selectedFrom', { n: sel.length, price: formatMoney(fromEur) })
              : t('mt.selectedN', { n: sel.length })}
          </span>
          {plan.unplaced.length > 0 && plan.stops.length > 0 && (
            <span className="mt-selbar-note">{t('mt2.notPlanned', { n: plan.unplaced.length })}</span>
          )}
          <Button variant="quiet" size="sm" onClick={() => setSel([])}>{t('mt.clearSelection')}</Button>
          <Button variant="primary" iconStart={<RouteIcon size={18} />} disabled={!plan.stops.length}
            onClick={() => onPlan(plan.stops)}>
            {t('mt.planWithThese')}
          </Button>
        </div>
      )}
      </div>
    </div>
  );
}
