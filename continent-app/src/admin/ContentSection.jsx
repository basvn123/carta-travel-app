import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminSetOverride } from '../auth/admin.js';
import { useI18n } from '../i18n/index.jsx';
import { SearchIcon } from '../components/Icons.jsx';

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
  return fetch(url).then((r) => (isJson(r) ? r.json() : null)).catch(() => null);
}

/** The lead photograph, whichever shape this layer stores it in. */
function leadImage(item, imageKey) {
  if (imageKey === 'img') return typeof item.img === 'string' ? item.img : '';
  const first = Array.isArray(item.images) ? item.images[0] : null;
  return (first && (first.u || first.big)) || '';
}

export function ContentSection({ overrides, onOverridesChanged, errText }) {
  const { t } = useI18n();
  const [layerKey, setLayerKey] = useState('beach');
  const [countries, setCountries] = useState([]);
  const [country, setCountry] = useState('');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', image: '', blurb: '', hidden: false, featured: false, note: '' });
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

  const patchFor = useCallback(
    (id) => (overrides || []).find((o) => o.layer === layerKey && o.itemId === String(id))?.patch || null,
    [overrides, layerKey],
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => String(it.name || '').toLowerCase().includes(q)
      || String(it.id).toLowerCase().includes(q));
  }, [items, search]);

  const openEditor = (item) => {
    const p = patchFor(item.id) || {};
    setEditing(item);
    setSaveErr('');
    setForm({
      name: p.name || '',
      image: p.image || '',
      blurb: p.blurb || '',
      hidden: p.hidden === true,
      featured: p.featured === true,
      note: '',
    });
  };

  const save = async (clear = false) => {
    if (!editing) return;
    setSaveBusy(true); setSaveErr('');
    try {
      // Only fields the person actually filled in travel to the server. An
      // empty patch is the documented way to clear the override, so "revert"
      // and "save nothing" are deliberately the same call.
      const patch = {};
      if (!clear) {
        if (form.name.trim()) patch.name = form.name.trim();
        if (form.image.trim()) patch.image = form.image.trim();
        if (form.blurb.trim()) patch.blurb = form.blurb.trim();
        if (form.hidden) patch.hidden = true;
        if (form.featured) patch.featured = true;
      }
      await adminSetOverride(layerKey, editing.id, patch, form.note.trim() || null);
      await onOverridesChanged?.();
      setEditing(null);
    } catch (e) {
      setSaveErr(errText ? errText(e) : String(e?.message || e));
    }
    setSaveBusy(false);
  };

  const editedCount = (overrides || []).filter((o) => o.layer === layerKey).length;

  return (
    <>
      <h1 className="adminpage-h1">{t('admin.nav.content')}</h1>
      <p className="adminpage-muted">{t('admin.contentHint')}</p>

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
      </div>

      {busy && <p className="adminpage-muted">{t('account.pleaseWait')}</p>}
      {!busy && shown.length === 0 && <p className="adminpage-muted">{t('admin.contentNone')}</p>}

      <div className="adminpage-grid">
        {shown.slice(0, 120).map((item) => {
          const p = patchFor(item.id);
          const img = (p && p.image) || leadImage(item, layer.imageKey);
          const name = (p && p.name) || item.name;
          return (
            <button
              key={item.id}
              type="button"
              className={`adminpage-card2 ${p ? 'edited' : ''} ${p && p.hidden ? 'hiddenitem' : ''}`}
              onClick={() => openEditor(item)}
            >
              <span className="adminpage-thumb">
                {img
                  ? <img src={img} alt="" loading="lazy" />
                  : <span className="adminpage-nothumb">{t('admin.noImage')}</span>}
                {p && <span className="adminpage-editedflag">{t('admin.edited')}</span>}
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
                {leadImage(editing, layer.imageKey)
                  ? <img src={leadImage(editing, layer.imageKey)} alt="" />
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

            <label className="adminpage-lock-label" htmlFor="ov-note">{t('admin.overrideNote')}</label>
            <input
              id="ov-note"
              className="adminpage-lock-input"
              value={form.note}
              maxLength={500}
              placeholder={t('admin.overrideNotePlaceholder')}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />

            {saveErr && <p className="adminpage-err">{saveErr}</p>}

            <div className="adminpage-row adminpage-editoractions">
              <button type="button" className="adminpage-btn" onClick={() => setEditing(null)}>
                {t('admin.editCancel')}
              </button>
              {patchFor(editing.id) && (
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
