import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminSetOverride } from '../auth/admin.js';
import { useI18n } from '../i18n/index.jsx';
import { SearchIcon } from '../components/Icons.jsx';
import { dataUrl } from '../lib/dataHost.js';
import {
  OVERRIDE_STATUSES, MIN_REASON_CHARS, BACKFILL_REASON, defaultReviewDate, fromDateInput, reviewDateBounds,
  reviewProblem, reviewState, rowsNeedingReview, toDateInput, daysOverdue,
} from '../lib/overrides.js';
import { fmtDate } from '../components/admin/format.js';

// Reviewing the catalogue, and correcting it.
//
// The four nature layers are static per-country JSON written by the pipeline,
// so this reads the very same files the app reads rather than a copy: what
// you see here is what a traveller sees. Corrections go to
// public.content_overrides and are merged back over the wire data on the next
// load, which means the pipeline can re-run all it likes without losing them,
// and clearing an override restores the pipeline's own answer.
//
// The layers differ in two small ways that are handled here so the rest of
// the screen can stay uniform: where the array lives in the file, and whether
// the photograph is an `images` array or a single `img` string.
//
// Every override also carries a status, a review date and a reason (migration
// 043). A patch is usually a symptom of a pipeline bug, and without a date on
// it nobody remembers to fix the cause. So the editor will not save without
// all three, the grid marks a card whose override is overdue or stale, and a
// list above the grid names every such override in every layer and country,
// because the grid only ever shows one country of one layer at a time.
const LAYERS = [
  { key: 'beach', dir: 'beaches', arr: 'beaches', imageKey: 'images' },
  { key: 'lake', dir: 'lakes', arr: 'lakes', imageKey: 'images' },
  { key: 'mountain', dir: 'mountains', arr: 'mountains', imageKey: 'images' },
  { key: 'trail', dir: 'trails', arr: 'trips', imageKey: 'img' },
];

function isJson(res) {
  return res.ok && (res.headers.get('content-type') || '').includes('json');
}

function fetchJson(url) {
  return fetch(dataUrl(url)).then((r) => (isJson(r) ? r.json() : null)).catch(() => null);
}

/** The lead photograph, whichever shape this layer stores it in. */
function leadImage(item, imageKey) {
  if (imageKey === 'img') return typeof item.img === 'string' ? item.img : '';
  const first = Array.isArray(item.images) ? item.images[0] : null;
  return (first && (first.u || first.big)) || '';
}

// The lifecycle error words from admin_set_override (043), and the same
// words from reviewProblem() before the round trip. Worded here rather than
// in the shared useErrText because only this screen can produce them.
const REVIEW_ERR = {
  bad_status: 'admin.errReviewStatus',
  bad_review_by: 'admin.errReviewBy',
  note_required: 'admin.errOverrideReason',
};

export function ContentSection({ overrides, onOverridesChanged, errText }) {
  const { t } = useI18n();
  const [layerKey, setLayerKey] = useState('beach');
  const [countries, setCountries] = useState([]);
  const [country, setCountry] = useState('');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  // The item being edited, and the layer it belongs to. The layer is kept
  // with it because the review list opens overrides from any layer without
  // switching the grid.
  const [editing, setEditing] = useState(null);
  const [editLayerKey, setEditLayerKey] = useState('beach');
  const [form, setForm] = useState({
    name: '', image: '', blurb: '', hidden: false, featured: false,
    note: '', status: 'temporary', reviewBy: '',
  });
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  const layer = LAYERS.find((l) => l.key === layerKey) || LAYERS[0];

  // The per-layer index says which countries have anything published, which
  // is exactly the list worth offering: a country with no beaches should not
  // be a choice that leads to an empty screen.
  useEffect(() => {
    let live = true;
    setCountries([]); setCountry(''); setItems([]); setEditing(null);
    fetchJson(`/${layer.dir}/index.json`).then((raw) => {
      if (!live || !raw) return;
      const list = (raw.countries || [])
        .filter((c) => c && c.cc && (c.n === undefined || c.n > 0))
        .map((c) => ({ cc: c.cc, n: c.n || 0 }));
      setCountries(list);
      if (list.length) setCountry(list[0].cc);
    });
    return () => { live = false; };
  }, [layer.dir]);

  useEffect(() => {
    if (!country) return undefined;
    let live = true;
    setBusy(true); setEditing(null);
    fetchJson(`/${layer.dir}/${country}.json`).then((raw) => {
      if (!live) return;
      const arr = raw && Array.isArray(raw[layer.arr]) ? raw[layer.arr] : [];
      setItems(arr.filter((it) => it && it.id !== undefined));
      setBusy(false);
    });
    return () => { live = false; };
  }, [layer.dir, layer.arr, country]);

  const rowFor = useCallback(
    (lk, id) => (overrides || []).find((o) => o.layer === lk && o.itemId === String(id)) || null,
    [overrides],
  );

  // Read the clock once per list change, so every row in one render agrees.
  const now = useMemo(() => Date.now(), [overrides]); // eslint-disable-line react-hooks/exhaustive-deps
  const dueRows = useMemo(() => rowsNeedingReview(overrides, now), [overrides, now]);
  const overdueCount = dueRows.filter((r) => reviewState(r, now) === 'overdue').length;
  const bounds = useMemo(() => reviewDateBounds(now), [now]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => String(it.name || '').toLowerCase().includes(q)
      || String(it.id).toLowerCase().includes(q));
  }, [items, search]);

  // The editor opens prefilled with the stored patch AND the stored
  // lifecycle, so confirming an overdue override is "change the date, save",
  // and the reason carries over unless the admin rewrites it.
  const openEditor = (item, lk = layerKey) => {
    const row = rowFor(lk, item.id);
    const p = row?.patch || {};
    setEditing(item);
    setEditLayerKey(lk);
    setSaveErr('');
    setForm({
      name: p.name || '',
      image: p.image || '',
      blurb: p.blurb || '',
      hidden: p.hidden === true,
      featured: p.featured === true,
      note: row?.authorNote && row.authorNote !== BACKFILL_REASON ? row.authorNote : '',
      status: OVERRIDE_STATUSES.includes(row?.status) ? row.status : 'temporary',
      // An overdue date is not offered back: the date input refuses it and
      // the server would too, so the admin must choose a new one.
      reviewBy: row?.reviewBy && reviewState(row) !== 'overdue'
        ? toDateInput(row.reviewBy)
        : defaultReviewDate(),
    });
  };

  // An override from the review list: the grid may be on another layer or
  // country, so the item is rebuilt from the override row. Its pipeline
  // photograph is not loaded; the editor says "no photo" for the original.
  const openFromReview = (row) => {
    openEditor({ id: row.itemId, name: row.patch?.name || row.itemId }, row.layer);
  };

  const editRow = editing ? rowFor(editLayerKey, editing.id) : null;
  const editLayer = LAYERS.find((l) => l.key === editLayerKey) || layer;

  const wordErr = (e) => {
    const key = REVIEW_ERR[e?.code];
    if (key) return t(key, { n: MIN_REASON_CHARS });
    return errText ? errText(e) : String(e?.message || e);
  };

  const save = async (clear = false) => {
    if (!editing) return;
    setSaveErr('');
    // Only fields the person actually filled in travel to the server. An
    // empty patch is the documented way to clear the override, so "revert"
    // and "save nothing" are deliberately the same call, and a clear needs
    // no status, date or reason.
    const patch = {};
    if (!clear) {
      if (form.name.trim()) patch.name = form.name.trim();
      if (form.image.trim()) patch.image = form.image.trim();
      if (form.blurb.trim()) patch.blurb = form.blurb.trim();
      if (form.hidden) patch.hidden = true;
      if (form.featured) patch.featured = true;
    }
    const empty = Object.keys(patch).length === 0;
    const reviewBy = fromDateInput(form.reviewBy);
    if (!empty) {
      const problem = reviewProblem({
        status: form.status, reviewBy, reason: form.note, stored: editRow?.authorNote,
      });
      if (problem) { setSaveErr(wordErr({ code: problem })); return; }
    }
    setSaveBusy(true);
    try {
      await adminSetOverride(
        editLayerKey, editing.id, patch,
        empty ? null : (form.note.trim() || null),
        empty ? null : form.status,
        empty ? null : reviewBy,
      );
      await onOverridesChanged?.();
      setEditing(null);
    } catch (e) {
      setSaveErr(wordErr(e));
    }
    setSaveBusy(false);
  };

  const editedCount = (overrides || []).filter((o) => o.layer === layerKey).length;

  return (
    <>
      <h1 className="adminpage-h1">{t('admin.nav.content')}</h1>
      <p className="adminpage-muted">{t('admin.contentHint')}</p>

      <section className="adminpage-review" aria-labelledby="ov-review-title">
        <h2 id="ov-review-title" className="adminpage-h2">
          {dueRows.length === 0 && t('admin.reviewTitleNone')}
          {dueRows.length === 1 && t('admin.reviewTitleOne')}
          {dueRows.length > 1 && t('admin.reviewTitle', { n: dueRows.length })}
        </h2>
        <p className="adminpage-muted">{t('admin.reviewHint')}</p>
        {dueRows.length > 0 && (
          <ul className="adminpage-reviewlist">
            {dueRows.map((r) => {
              const state = reviewState(r, now);
              const late = daysOverdue(r, now);
              return (
                <li key={`${r.layer}:${r.itemId}`}>
                  <button
                    type="button"
                    className={`adminpage-reviewrow ${state}`}
                    onClick={() => openFromReview(r)}
                  >
                    <span className="adminpage-reviewwhat">
                      <b>{r.patch?.name || r.itemId}</b>
                      <span className="adminpage-reviewnote">{r.authorNote}</span>
                    </span>
                    <span className="adminpage-reviewfacts">
                      <span className={`adminpage-chip status-${r.status}`}>{t(`admin.status.${r.status}`)}</span>
                      <span className="adminpage-reviewlayer">{t(`admin.layer.${r.layer}`)}</span>
                      <code>{r.itemId}</code>
                      <span className={`adminpage-reviewdate ${state}`}>
                        {state !== 'overdue' && t('admin.reviewDue', { date: fmtDate(r.reviewBy) })}
                        {state === 'overdue' && late === 0 && t('admin.reviewLateToday', { date: fmtDate(r.reviewBy) })}
                        {state === 'overdue' && late === 1 && t('admin.reviewLateOne', { date: fmtDate(r.reviewBy) })}
                        {state === 'overdue' && late > 1 && t('admin.reviewLate', { date: fmtDate(r.reviewBy), n: late })}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="adminpage-segment" role="radiogroup" aria-label={t('admin.nav.content')}>
        {LAYERS.map((l) => (
          <button
            key={l.key}
            type="button"
            role="radio"
            aria-checked={layerKey === l.key}
            className={`adminpage-seg ${layerKey === l.key ? 'on' : ''}`}
            onClick={() => { setLayerKey(l.key); setSearch(''); }}
          >
            {t(`admin.layer.${l.key}`)}
          </button>
        ))}
      </div>

      <div className="adminpage-contentbar">
        <label className="adminpage-inline">
          <span>{t('admin.country')}</span>
          <select
            className="adminpage-select"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            {countries.map((c) => (
              <option key={c.cc} value={c.cc}>{c.cc} ({c.n})</option>
            ))}
          </select>
        </label>
        <div className="adminpage-search">
          <SearchIcon size={16} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.contentSearch')}
            aria-label={t('admin.contentSearch')}
          />
        </div>
        <span className="adminpage-count">
          {t('admin.contentEdited', { n: editedCount })}
        </span>
        {overdueCount > 0 && (
          <span className="adminpage-count overdue">
            {t('admin.reviewOverdueCount', { n: overdueCount })}
          </span>
        )}
      </div>

      {busy && <p className="adminpage-muted">{t('account.pleaseWait')}</p>}
      {!busy && shown.length === 0 && <p className="adminpage-muted">{t('admin.contentNone')}</p>}

      <div className="adminpage-grid">
        {shown.slice(0, 120).map((item) => {
          const row = rowFor(layerKey, item.id);
          const p = row?.patch || null;
          const state = reviewState(row, now);
          const due = state === 'overdue' || state === 'stale';
          const img = (p && p.image) || leadImage(item, layer.imageKey);
          const name = (p && p.name) || item.name;
          return (
            <button
              key={item.id}
              type="button"
              className={`adminpage-card2 ${p ? 'edited' : ''} ${due ? 'overdue' : ''} ${p && p.hidden ? 'hiddenitem' : ''}`}
              onClick={() => openEditor(item)}
            >
              <span className="adminpage-thumb">
                {img
                  ? <img src={img} alt="" loading="lazy" />
                  : <span className="adminpage-nothumb">{t('admin.noImage')}</span>}
                {p && (
                  <span className={`adminpage-editedflag ${due ? 'overdue' : ''}`}>
                    {due ? t(`admin.flag.${state}`) : t('admin.edited')}
                  </span>
                )}
              </span>
              <span className="adminpage-cardname">{name}</span>
              <span className="adminpage-cardmeta">
                {item.score !== undefined && <b>{Number(item.score).toFixed(1)}</b>}
                {/* The whole id, never a slice: this is the string you
                    copy into a ticket, and CSS already ellipsises the
                    overflow without lying about what it holds. */}
                <code>{String(item.id)}</code>
              </span>
            </button>
          );
        })}
      </div>
      {shown.length > 120 && (
        <p className="adminpage-count">{t('admin.contentCapped', { n: shown.length })}</p>
      )}

      {editing && (
        <div className="adminpage-editor" role="dialog" aria-label={t('admin.editTitle')}>
          <div className="adminpage-editorbox">
            <h3 className="adminpage-h3">{t('admin.editTitle')}</h3>
            <p className="adminpage-editorname">
              {editing.name}
              <code>{String(editing.id)}</code>
            </p>

            <div className="adminpage-editorpreview">
              <figure>
                <figcaption>{t('admin.imageNow')}</figcaption>
                {leadImage(editing, editLayer.imageKey)
                  ? <img src={leadImage(editing, editLayer.imageKey)} alt="" />
                  : <span className="adminpage-nothumb">{t('admin.noImage')}</span>}
              </figure>
              <figure>
                <figcaption>{t('admin.imageNew')}</figcaption>
                {form.image.trim().startsWith('https://')
                  ? <img src={form.image.trim()} alt="" />
                  : <span className="adminpage-nothumb">{t('admin.imageNewNone')}</span>}
              </figure>
            </div>

            <label className="adminpage-lock-label" htmlFor="ov-image">{t('admin.imageUrl')}</label>
            <input
              id="ov-image"
              className="adminpage-lock-input mono"
              value={form.image}
              placeholder="https://upload.wikimedia.org/..."
              onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
            />
            <p className="adminpage-muted adminpage-fine">{t('admin.imageHint')}</p>

            <label className="adminpage-lock-label" htmlFor="ov-name">{t('admin.overrideName')}</label>
            <input
              id="ov-name"
              className="adminpage-lock-input"
              value={form.name}
              placeholder={editing.name}
              maxLength={120}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />

            <label className="adminpage-lock-label" htmlFor="ov-blurb">{t('admin.overrideBlurb')}</label>
            <input
              id="ov-blurb"
              className="adminpage-lock-input"
              value={form.blurb}
              maxLength={300}
              onChange={(e) => setForm((f) => ({ ...f, blurb: e.target.value }))}
            />

            <label className="adminpage-check">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
              />
              <span>{t('admin.overrideFeatured')}</span>
            </label>
            <label className="adminpage-check">
              <input
                type="checkbox"
                checked={form.hidden}
                onChange={(e) => setForm((f) => ({ ...f, hidden: e.target.checked }))}
              />
              <span>{t('admin.overrideHidden')}</span>
            </label>

            <fieldset className="adminpage-reviewset">
              <legend className="adminpage-lock-label">{t('admin.statusLabel')}</legend>
              {editRow && reviewState(editRow, now) === 'overdue' && (
                <p className="adminpage-reviewwas">
                  {t('admin.reviewWasDue', { date: fmtDate(editRow.reviewBy) })}
                </p>
              )}
              <div className="adminpage-segment" role="radiogroup" aria-label={t('admin.statusLabel')}>
                {OVERRIDE_STATUSES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    role="radio"
                    aria-checked={form.status === st}
                    className={`adminpage-seg ${form.status === st ? 'on' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, status: st }))}
                  >
                    {t(`admin.status.${st}`)}
                  </button>
                ))}
              </div>
              <p className="adminpage-muted adminpage-fine">{t(`admin.statusHint.${form.status}`)}</p>

              <label className="adminpage-lock-label" htmlFor="ov-review">{t('admin.reviewBy')}</label>
              <input
                id="ov-review"
                type="date"
                className="adminpage-lock-input mono"
                value={form.reviewBy}
                min={bounds.min}
                max={bounds.max}
                onChange={(e) => setForm((f) => ({ ...f, reviewBy: e.target.value }))}
              />
              <p className="adminpage-muted adminpage-fine">{t('admin.reviewByHint')}</p>

              <label className="adminpage-lock-label" htmlFor="ov-note">{t('admin.overrideNote')}</label>
              <textarea
                id="ov-note"
                className="adminpage-textarea"
                rows={2}
                value={form.note}
                maxLength={500}
                placeholder={t('admin.overrideNotePlaceholder')}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </fieldset>

            {saveErr && <p className="adminpage-err">{saveErr}</p>}

            <div className="adminpage-row adminpage-editoractions">
              <button type="button" className="adminpage-btn" onClick={() => setEditing(null)}>
                {t('admin.editCancel')}
              </button>
              {editRow && (
                <button type="button" className="adminpage-btn danger" disabled={saveBusy} onClick={() => save(true)}>
                  {t('admin.editRevert')}
                </button>
              )}
              <button type="button" className="adminpage-btn primary" disabled={saveBusy} onClick={() => save(false)}>
                {saveBusy ? t('account.pleaseWait') : t('admin.editSave')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
