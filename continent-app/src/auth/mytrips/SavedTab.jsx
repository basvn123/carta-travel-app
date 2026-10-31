import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip, ChipGroup, Field } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import { DayPrice } from '../../browse/ExploreCards.jsx';
import {
  PlusIcon, RouteIcon, PencilIcon, ArrowLeftIcon, ArrowRightIcon, BookmarkIcon, CheckIcon,
} from '../../components/Icons.jsx';
import { FAV_KIND_LABEL } from '../../lib/favorites.js';
import { formatMoney } from '../../lib/money.js';
import { activeLocale } from '../../lib/localeState.js';
import { cheapestStayMonths } from '../../lib/costIndex.js';
import {
  priceChange, createList, renameList, deleteList, restoreList, moveList, toggleInList, setNote, MAX_NOTE,
} from '../../lib/savedLists.js';
import { CardMenu } from './parts.jsx';
import { Empty } from './MyTripsTabs.jsx';

const TripMap = lazy(() => import('../../map/TripMap.jsx').then((m) => ({ default: m.TripMap })));
const MAP_PAD = { top: 32, left: 32, right: 32, bottom: 32 };
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

const monthName = (m) => {
  try { return new Date(Date.UTC(2026, m - 1, 15)).toLocaleDateString(activeLocale(), { month: 'long', timeZone: 'UTC' }); } catch { return ''; }
};

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

/** One saved thing: select box, photo, kind, name, today's price and its
 *  move since the save, the cheapest month, the traveller's note, a menu. */
function SavedItem({
  row, meta, cost, dest, lists, selected, onSelect, onOpen, onRemove, active, itemRef,
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState(meta?.note || '');
  const change = priceChange(meta, cost?.dayEur);
  const months = row.kind === 'dest' && dest ? cheapestStayMonths(dest) : null;
  const k = metaKey(row);
  const inLists = lists.filter((l) => l.keys.includes(k));
  const cbId = `mt-sel-${k.replace(/[^\w-]/g, '_')}`;
  return (
    <li className={`mt-item${selected ? ' is-selected' : ''}${active ? ' is-active' : ''}`} ref={itemRef}>
      <span className="mt-item-check">
        <input type="checkbox" id={cbId} checked={selected} onChange={() => onSelect(k)} disabled={row.missing} />
        <label htmlFor={cbId} className="sr-only">{t('mt.selectItem', { name: row.name || row.id })}</label>
      </span>
      {/* The photo opens the thing for a pointer; the keyboard has its name. */}
      <span className="mt-item-media" onClick={() => !row.missing && onOpen(row)} aria-hidden="true">
        <HeroImage url={row.img} city={row.name || row.id} iso2={row.cc} className="mt-item-img" maxWidth={330} ratio={[1, 1]} sizes="88px" />
      </span>
      <div className="mt-item-body">
        <span className="mt-item-kind">
          {row.cc && <CountryFlag country={row.cc} size={14} />}
          {[FAV_KIND_LABEL[row.kind] ? t(FAV_KIND_LABEL[row.kind]) : '', row.sub].filter(Boolean).join(', ')}
        </span>
        {row.missing ? (
          <span className="mt-item-name is-missing">{t('fav.missing')}</span>
        ) : (
          <Button variant="quiet" className="mt-item-name" onClick={() => onOpen(row)}>{row.name || row.id}</Button>
        )}
        {cost && (
          <span className="mt-item-price">
            <DayPrice cost={cost} t={t} />
            {change && (
              <Chip kind="status" tone={change.diff < 0 ? 'positive' : 'neutral'} className="mt-item-move">
                {t(change.diff < 0 ? 'mt.fellSince' : 'mt.roseSince', { price: formatMoney(Math.abs(change.diff)) })}
              </Chip>
            )}
          </span>
        )}
        {months?.length > 0 && <span className="mt-item-meta">{t('mt.cheapestIn', { month: monthName(months[0]) })}</span>}
        {inLists.length > 0 && <span className="mt-item-meta">{inLists.map((l) => l.name).join(', ')}</span>}
        {editing ? (
          <form className="mt-note-form" onSubmit={(e) => { e.preventDefault(); setNote(k, draft); setEditing(false); }}>
            <Field label={t('mt.note')} value={draft} maxLength={MAX_NOTE} onChange={(e) => setDraft(e.target.value)} autoFocus />
            <Button size="sm" type="submit">{t('saved.done')}</Button>
          </form>
        ) : meta?.note ? (
          <Button variant="quiet" size="sm" className="mt-item-note" iconStart={<PencilIcon size={14} />} onClick={() => { setDraft(meta.note); setEditing(true); }}>
            {meta.note}
          </Button>
        ) : null}
        {picking && (
          <div className="mt-pick-lists" role="group" aria-label={t('mt.inLists')}>
            {lists.map((l) => (
              <Chip key={l.id} kind="filter" selected={l.keys.includes(k)} onClick={() => toggleInList(l.id, k)}>{l.name}</Chip>
            ))}
            <Button size="sm" variant="quiet" onClick={() => setPicking(false)}>{t('saved.done')}</Button>
          </div>
        )}
      </div>
      <CardMenu
        label={t('mt.itemMenu', { name: row.name || row.id })}
        actions={[
          ...(lists.length ? [{ key: 'lists', label: t('mt.addToList'), icon: <PlusIcon size={16} />, onClick: () => setPicking(true) }] : []),
          { key: 'note', label: t(meta?.note ? 'mt.editNote' : 'mt.addNote'), icon: <PencilIcon size={16} />, onClick: () => { setDraft(meta?.note || ''); setEditing(true); } },
        ]}
        onRemove={() => onRemove(row)}
        removeLabel={t('saved.removeItem', { name: row.name || row.id })}
      />
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
 *   onPlan(ids) the picked places, to the trip planner
 *   onUndo      the panel's undo slot: ({ key, label, commit, restore })
 */
export function SavedTab({
  rows, saved, costs, destinations = {}, loading, onOpen, onRemove, onPlan, onBrowse, onUndo, top = null, mapLocale,
}) {
  const { t } = useI18n();
  const [list, setList] = useState('all');
  const [kind, setKind] = useState('all');
  const [fell, setFell] = useState(false);
  const [view, setView] = useState('list');
  const [sel, setSel] = useState([]);
  const [naming, setNaming] = useState(null); // null, 'new' or a list id
  const [name, setName] = useState('');
  const [active, setActive] = useState('');
  const itemRefs = useRef(new Map());
  // The map is drawn only where it shows: beside the list, or when asked for.
  const wide = useWide();

  const lists = saved.lists;
  const current = lists.find((l) => l.id === list) || null;
  const inList = useMemo(() => (current ? rows.filter((r) => current.keys.includes(metaKey(r))) : rows), [rows, current]);
  const costOf = (r) => (r.kind === 'dest' ? costs?.get?.(r.id) || null : null);
  const fellOf = (r) => { const c = priceChange(saved.meta[metaKey(r)], costOf(r)?.dayEur); return c && c.diff < 0; };
  const kinds = useMemo(() => {
    const by = new Map();
    inList.forEach((r) => by.set(r.kind, (by.get(r.kind) || 0) + 1));
    return [...by.entries()];
  }, [inList]);
  const kindNow = kinds.some(([k]) => k === kind) ? kind : 'all';
  const anyFell = inList.some(fellOf);
  const shown = inList.filter((r) => (kindNow === 'all' || r.kind === kindNow) && (!fell || fellOf(r)));

  const toggleSel = (k) => setSel((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const picked = rows.filter((r) => sel.includes(metaKey(r)));
  const pickedPlaces = picked.filter((r) => r.kind === 'dest' && destinations[r.id]);
  const fromEur = pickedPlaces.map((r) => costOf(r)?.dayEur).filter(Number.isFinite).sort((a, b) => a - b)[0];

  const coverRows = (l) => rows.filter((r) => l.keys.includes(metaKey(r)));
  const startName = (id) => { setNaming(id); setName(id === 'new' ? '' : (lists.find((l) => l.id === id)?.name || '')); };
  const submitName = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (naming === 'new') {
      const { id } = createList(name, sel);
      if (id) setList(id);
    } else renameList(naming, name);
    setNaming(null);
  };
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
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon, city: r.name || '', plain: true, img: r.img, key: metaKey(r) } : null;
  }).filter(Boolean), [shown, destinations]);
  const mapProps = useMemo(() => ({
    stops: points, showRoute: false, scrollZoom: true, zoomControls: true, mapLocale, photoZoom: 6,
    easeToSelected: false, padBottom: 0, fitMaxZoom: 8, fitPadding: MAP_PAD,
    onSelectStop: (i) => {
      const k = points[i]?.key;
      if (!k) return;
      setActive(k);
      setView('list');
      requestAnimationFrame(() => itemRefs.current.get(k)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    },
  }), [points, mapLocale]);

  if (!rows.length && !loading) {
    return (
      <>
        {top}
        <Empty title={t('saved.shortlistEmpty')} line={t('mt.savedEmptyLine')} action={<Button variant="primary" onClick={onBrowse}>{t('saved.browseDestinations')}</Button>} />
      </>
    );
  }

  return (
    <div className="mt-saved">
      <div className="mt-lists" role="group" aria-label={t('mt.lists')}>
        <Button className="mt-lcard" aria-pressed={list === 'all'} onClick={() => setList('all')}>
          <Mosaic rows={rows} />
          <span className="mt-lcard-name">{t('mt.allSaved')}</span>
          <span className="mt-lcard-n">{t(rows.length === 1 ? 'mt.saves1' : 'mt.savesN', { n: rows.length })}</span>
        </Button>
        {lists.map((l) => (
          <Button key={l.id} className="mt-lcard" aria-pressed={list === l.id} onClick={() => setList(l.id)}>
            <Mosaic rows={coverRows(l)} />
            <span className="mt-lcard-name">{l.name}</span>
            <span className="mt-lcard-n">{t(coverRows(l).length === 1 ? 'mt.saves1' : 'mt.savesN', { n: coverRows(l).length })}</span>
          </Button>
        ))}
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

      {current && (
        <div className="mt-list-bar">
          <h3 className="mt-list-title">{current.name}</h3>
          <CardMenu
            label={t('mt.listMenu', { name: current.name })}
            actions={[
              { key: 'rename', label: t('mt.renameList'), icon: <PencilIcon size={16} />, onClick: () => startName(current.id) },
              ...(lists[0]?.id !== current.id ? [{ key: 'up', label: t('mt.moveEarlier'), icon: <ArrowLeftIcon size={16} />, onClick: () => moveList(current.id, -1) }] : []),
              ...(lists[lists.length - 1]?.id !== current.id ? [{ key: 'down', label: t('mt.moveLater'), icon: <ArrowRightIcon size={16} />, onClick: () => moveList(current.id, 1) }] : []),
            ]}
            onRemove={() => removeList(current)}
            removeLabel={t('mt.deleteList', { name: current.name })}
          />
        </div>
      )}

      {list === 'all' && top}

      <div className="mt-saved-filters">
        {kinds.length > 1 && (
          <ChipGroup label={t('saved.kindLabel')} className="mt-chips">
            <Chip kind="choice" selected={kindNow === 'all'} onClick={() => setKind('all')}>{t('mt.kindAllN', { n: inList.length })}</Chip>
            {kinds.map(([k, n]) => (
              <Chip key={k} kind="choice" selected={kindNow === k} onClick={() => setKind(k)}>{t('mt.kindN', { kind: t(FAV_KIND_LABEL[k]), n })}</Chip>
            ))}
          </ChipGroup>
        )}
        {(anyFell || fell) && (
          <Chip kind="filter" selected={fell} onClick={() => setFell((v) => !v)}>{t('mt.priceFell')}</Chip>
        )}
        <span className="mt-spacer" />
        <Button size="sm" className="mt-view-toggle" onClick={() => setView((v) => (v === 'map' ? 'list' : 'map'))}>
          {t(view === 'map' ? 'mt.viewList' : 'mt.viewMap')}
        </Button>
      </div>

      <div className={`mt-split is-${view}`}>
        <div className="mt-split-list">
          {shown.length ? (
            <ul className="mt-items">
              {shown.map((r) => {
                const k = metaKey(r);
                return (
                  <SavedItem
                    key={r.key}
                    row={r}
                    meta={saved.meta[k]}
                    cost={costOf(r)}
                    dest={r.kind === 'dest' ? destinations[r.id] : null}
                    lists={lists}
                    selected={sel.includes(k)}
                    active={active === k}
                    onSelect={toggleSel}
                    onOpen={onOpen}
                    onRemove={onRemove}
                    itemRef={(el) => { if (el) itemRefs.current.set(k, el); else itemRefs.current.delete(k); }}
                  />
                );
              })}
            </ul>
          ) : (
            <p className="mt-muted">{t(current && !current.keys.length ? 'mt.listEmpty' : 'mt.nothingMatches')}</p>
          )}
        </div>
        <div className="mt-split-map">
          {!(wide || view === 'map') ? null : points.length > 0 ? (
            <div className="mt-map is-saved">
              <Suspense fallback={<div className="mt-map-wait" aria-hidden="true" />}>
                <TripMap {...mapProps} />
              </Suspense>
            </div>
          ) : (
            <p className="mt-muted">{t('mt.noMapPoints')}</p>
          )}
        </div>
      </div>

      {sel.length > 0 && (
        <div className="mt-selbar" role="region" aria-label={t('mt.selection')}>
          <span className="mt-selbar-text">
            <CheckIcon size={16} />
            {Number.isFinite(fromEur)
              ? t('mt.selectedFrom', { n: sel.length, price: formatMoney(fromEur) })
              : t('mt.selectedN', { n: sel.length })}
          </span>
          <Button variant="quiet" size="sm" onClick={() => setSel([])}>{t('mt.clearSelection')}</Button>
          <Button variant="primary" iconStart={<RouteIcon size={18} />} disabled={!pickedPlaces.length}
            onClick={() => onPlan(pickedPlaces.map((r) => r.id))}>
            {t('mt.planWithThese')}
          </Button>
        </div>
      )}
    </div>
  );
}
