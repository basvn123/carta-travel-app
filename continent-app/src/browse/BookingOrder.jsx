import React, { useCallback, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { bookingOrder, leadShort } from '../lib/bookingOrder.js';
import { boldSegments } from '../lib/journeys.js';
import { Fold } from './Fold.jsx';
import { CheckIcon, ClockIcon } from '../components/Icons.jsx';

/**
 * The booking order (T169): the trip's booking-windows paragraph as steps in
 * the order to act, furthest lead time first, each with its lead time in mono
 * and a tick. Ticks are kept on this device only (localStorage, one key per
 * trip); a trip with no step to tick renders nothing.
 */

const KEY = (tripId) => `carta.booked.${tripId}`;

function readTicks(tripId) {
  try {
    const raw = window.localStorage.getItem(KEY(tripId));
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch { return new Set(); }
}

function writeTicks(tripId, set) {
  try { window.localStorage.setItem(KEY(tripId), JSON.stringify([...set])); } catch { /* private mode */ }
}

function Text({ text }) {
  return boldSegments(text).map((seg, i) => (seg.bold
    ? <b key={i}>{seg.text}</b>
    : <React.Fragment key={i}>{seg.text}</React.Fragment>));
}

export function BookingOrder({ tripId, source, open, onToggle }) {
  const { t } = useI18n();
  const order = useMemo(() => bookingOrder(source), [source]);
  const [ticked, setTicked] = useState(() => readTicks(tripId));
  const [forTrip, setForTrip] = useState(tripId);
  if (forTrip !== tripId) { setForTrip(tripId); setTicked(readTicks(tripId)); }

  const flip = useCallback((id) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      writeTicks(tripId, next);
      return next;
    });
  }, [tripId]);

  const { steps, notes } = order;
  if (!steps.length) return null;

  const units = {
    d: t('journey.leadD'), w: t('journey.leadW'), m: t('journey.leadM'),
    same: t('journey.leadSame'), soon: t('journey.leadSoon'), months: t('journey.leadMonths'),
    weeks: t('journey.leadWeeks'), days: t('journey.leadDays'),
  };
  const done = steps.filter((s) => ticked.has(s.id)).length;
  const progress = t('journey.bookProgress', { n: done, m: steps.length });

  return (
    <Fold
      id="sec-book"
      icon={ClockIcon}
      title={t('journey.bookHead')}
      summary={progress}
      open={open}
      onToggle={onToggle}
      className="jpage-book"
    >
      <p className="jpage-book-hint">{t('journey.bookHint')}</p>
      <ol className="jpage-book-list">
        {steps.map((s) => {
          const on = ticked.has(s.id);
          return (
            <li key={s.id} className={on ? 'is-done' : ''}>
              <label>
                <input type="checkbox" checked={on} onChange={() => flip(s.id)} />
                <span className="jpage-book-box" aria-hidden="true"><CheckIcon size={12} /></span>
                <span className="jpage-book-lead mono">{leadShort(s.lead, units)}</span>
                <span className="jpage-book-text"><Text text={s.text} /></span>
              </label>
            </li>
          );
        })}
      </ol>
      <p className="jpage-book-count mono" aria-live="polite">{progress}</p>
      {notes.length > 0 && (
        <>
          <h3 className="jpage-book-sub">{t('journey.bookNotes')}</h3>
          <ul className="jpage-book-notes">
            {notes.map((n) => <li key={n.id}><Text text={n.text} /></li>)}
          </ul>
        </>
      )}
    </Fold>
  );
}
