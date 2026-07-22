import React, { useState } from 'react';
import { eur, safeUrl } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';
import { LinkIcon } from '../components/Icons.jsx';

/**
 * TripExtras, the "life admin" block of a planned trip: per-element booking
 * records (confirmation code, booked price, link), free-form trip notes and
 * a packing checklist. Purely presentational: the parent owns the extras
 * object (see dayPlanStore.loadTripExtras) and persists every change; this
 * component only edits a copy and hands it back via onChange.
 *
 * rows: [{ key, label, estimate }] for the trip's real elements (flights,
 * stays, rental car). Anything else (dinner reservations, a museum slot)
 * goes in as a custom row with its own editable label.
 */

const BASICS_KEYS = ['extras.basic1', 'extras.basic2', 'extras.basic3', 'extras.basic4', 'extras.basic5', 'extras.basic6'];

function BookingRow({ row, booking, onPatch, onRemove, t }) {
  const b = booking || {};
  const price = Number(String(b.price ?? '').replace(',', '.'));
  const hasPrice = String(b.price ?? '').trim() !== '' && Number.isFinite(price);
  const delta = hasPrice && row.estimate != null ? price - row.estimate : null;
  const deltaText = delta == null ? ''
    : Math.abs(delta) < 1 ? t('extras.onEstimate')
      : delta < 0 ? t('extras.under', { amount: eur(Math.abs(delta)) })
        : t('extras.over', { amount: eur(delta) });
  const link = safeUrl(b.url);

  return (
    <div className={`extras-row ${b.done ? 'done' : ''}`}>
      <label className="extras-row-head">
        <input
          type="checkbox"
          checked={!!b.done}
          onChange={(e) => onPatch({ done: e.target.checked })}
          title={t('extras.bookedTitle')}
        />
        {row.custom ? (
          <input
            className="extras-label-input"
            value={b.label || ''}
            placeholder={t('extras.customPlaceholder')}
            onChange={(e) => onPatch({ label: e.target.value })}
          />
        ) : (
          <span className="extras-label">{row.label}</span>
        )}
        {row.estimate != null && (
          <span className="extras-est">{t('extras.est', { price: eur(row.estimate) })}</span>
        )}
        {onRemove && (
          <button className="extras-remove" onClick={onRemove} title={t('extras.removeTitle')}>×</button>
        )}
      </label>
      <div className="extras-fields">
        <input
          className="extras-input"
          value={b.ref || ''}
          placeholder={t('extras.refPlaceholder')}
          onChange={(e) => onPatch({ ref: e.target.value })}
        />
        <input
          className="extras-input extras-price"
          inputMode="decimal"
          value={b.price ?? ''}
          placeholder={t('extras.pricePlaceholder')}
          onChange={(e) => onPatch({ price: e.target.value })}
        />
        <input
          className="extras-input extras-url"
          value={b.url || ''}
          placeholder={t('extras.linkPlaceholder')}
          onChange={(e) => onPatch({ url: e.target.value })}
        />
        {link && (
          <a className="extras-open-link" href={link} target="_blank" rel="noreferrer" title={t('extras.openLink')}>
            <LinkIcon size={11} />
          </a>
        )}
      </div>
      {deltaText && <div className={`extras-delta ${delta < 0 ? 'under' : delta > 0 ? 'over' : ''}`}>{deltaText}</div>}
    </div>
  );
}

export function TripExtras({ rows, extras, onChange }) {
  const { t } = useI18n();
  const [newItem, setNewItem] = useState('');

  const patchBooking = (key, patch) => onChange({
    ...extras,
    bookings: { ...extras.bookings, [key]: { ...(extras.bookings[key] || {}), ...patch } },
  });
  const removeBooking = (key) => {
    const next = { ...extras.bookings };
    delete next[key];
    onChange({ ...extras, bookings: next });
  };
  const addCustom = () => patchBooking(`custom:${Date.now()}`, { label: '' });

  const customRows = Object.keys(extras.bookings)
    .filter((k) => k.startsWith('custom:'))
    .sort()
    .map((key) => ({ key, custom: true, estimate: null }));

  const setChecklist = (checklist) => onChange({ ...extras, checklist });
  const addItem = (text) => {
    const clean = text.trim();
    if (!clean) return;
    setChecklist([...extras.checklist, { id: `${Date.now()}-${extras.checklist.length}`, text: clean, done: false }]);
  };
  const addBasics = () => {
    const have = new Set(extras.checklist.map((c) => c.text.toLowerCase()));
    const fresh = BASICS_KEYS.map((k) => t(k)).filter((txt) => !have.has(txt.toLowerCase()))
      .map((text, i) => ({ id: `${Date.now()}-b${i}`, text, done: false }));
    if (fresh.length) setChecklist([...extras.checklist, ...fresh]);
  };
  const packedCount = extras.checklist.filter((c) => c.done).length;

  return (
    <div className="trip-extras">
      {/* Bookings: tick off each element as it gets booked for real. */}
      <div className="trip-block-title">{t('extras.bookingsTitle')}</div>
      {rows.map((row) => (
        <BookingRow
          key={row.key}
          row={row}
          booking={extras.bookings[row.key]}
          onPatch={(patch) => patchBooking(row.key, patch)}
          t={t}
        />
      ))}
      {customRows.map((row) => (
        <BookingRow
          key={row.key}
          row={row}
          booking={extras.bookings[row.key]}
          onPatch={(patch) => patchBooking(row.key, patch)}
          onRemove={() => removeBooking(row.key)}
          t={t}
        />
      ))}
      <button className="extras-add-btn" onClick={addCustom}>+ {t('extras.addBooking')}</button>

      {/* Notes: door codes, opening hours, promises made. */}
      <div className="trip-block-title">{t('extras.notesTitle')}</div>
      <textarea
        className="extras-notes"
        value={extras.notes}
        placeholder={t('extras.notesPlaceholder')}
        rows={3}
        onChange={(e) => onChange({ ...extras, notes: e.target.value })}
      />

      {/* Packing list. */}
      <div className="trip-block-title">
        {t('extras.checkTitle')}
        {extras.checklist.length > 0 && (
          <span className="extras-count">{packedCount}/{extras.checklist.length}</span>
        )}
      </div>
      {extras.checklist.map((item) => (
        <label className={`extras-check-row ${item.done ? 'done' : ''}`} key={item.id}>
          <input
            type="checkbox"
            checked={!!item.done}
            onChange={(e) => setChecklist(extras.checklist.map((c) => (c.id === item.id ? { ...c, done: e.target.checked } : c)))}
          />
          <span className="extras-check-text">{item.text}</span>
          <button
            className="extras-remove"
            onClick={(e) => { e.preventDefault(); setChecklist(extras.checklist.filter((c) => c.id !== item.id)); }}
            title={t('extras.removeTitle')}
          >
            ×
          </button>
        </label>
      ))}
      <form
        className="extras-check-add"
        onSubmit={(e) => { e.preventDefault(); addItem(newItem); setNewItem(''); }}
      >
        <input
          className="extras-input"
          value={newItem}
          placeholder={t('extras.checkPlaceholder')}
          onChange={(e) => setNewItem(e.target.value)}
        />
        <button type="submit" className="extras-add-btn" disabled={!newItem.trim()}>{t('extras.checkAdd')}</button>
        {extras.checklist.length === 0 && (
          <button type="button" className="extras-add-btn" onClick={addBasics}>{t('extras.checkBasics')}</button>
        )}
      </form>
    </div>
  );
}
