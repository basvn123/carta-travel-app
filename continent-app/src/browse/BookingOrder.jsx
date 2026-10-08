import React, { useCallback, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { bookingOrder, leadShort, travelStart, dueBy } from '../lib/bookingOrder.js';
import { boldSegments } from '../lib/journeys.js';
import { CheckIcon } from '../components/Icons.jsx';

/**
 * The booking order (T169): the trip's booking-windows paragraph as steps in
 * the order to act, furthest lead time first, each with its lead time in mono
 * and a tick. Ticks are kept on this device only (localStorage, one key per
 * trip); a trip with no step to tick renders nothing.
 *
 * T387 (v6 trips brief, V3.6 and V3.12): no longer a fold of its own but the
 * first block of the page's Prepare group, under an h3; each step that has a
 * measured lead also says the month to book by, counted back from the
 * first of the trip's best months still ahead ("for a July week"), so a
 * "6-12 mo" hut window reads "Book by January". The whole row is the tick's
 * label and at least --tap high.
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

const monthYear = (date, lang) => {
  try {
    return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(date);
  } catch { return date.toISOString().slice(0, 7); }
};
const monthOnly = (date, lang) => {
  try {
    return new Intl.DateTimeFormat(lang, { month: 'long' }).format(date);
  } catch { return String(date.getMonth() + 1); }
};

/** The steps as a list under an h3, or null when there is no step. */
export function BookingOrder({ tripId, source, bestMonths = null }) {
  const { t, lang } = useI18n();
  const order = useMemo(() => bookingOrder(source), [source]);
  const [ticked, setTicked] = useState(() => readTicks(tripId));
  const [forTrip, setForTrip] = useState(tripId);
  if (forTrip !== tripId) { setForTrip(tripId); setTicked(readTicks(tripId)); }
  const start = useMemo(() => travelStart(bestMonths), [bestMonths]);

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

  return (
    <div className="jblock jpage-book" id="jb-book">
      <h3 className="jblock-h">{t('journey.bookHead')}</h3>
      <p className="jpage-book-hint">
        {start
          ? t('journey.bookHintFor', { month: monthOnly(start, lang) })
          : t('journey.bookHint')}
      </p>
      <ol className="jpage-book-list">
        {steps.map((s) => {
          const on = ticked.has(s.id);
          const due = dueBy(s.lead, start);
          return (
            <li key={s.id} className={on ? 'is-done' : ''}>
              <label>
                <input type="checkbox" checked={on} onChange={() => flip(s.id)} />
                <span className="jpage-book-box" aria-hidden="true"><CheckIcon size={12} /></span>
                <span className="jpage-book-lead mono">{leadShort(s.lead, units)}</span>
                <span className="jpage-book-text">
                  <Text text={s.text} />
                  {due && (
                    <span className="jpage-book-due">
                      {due.late
                        ? t('journey.bookNow')
                        : t('journey.bookByMonth', { month: monthYear(due.date, lang) })}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ol>
      <p className="jpage-book-count" aria-live="polite">
        {t('journey.bookProgress', { n: done, m: steps.length })}
      </p>
      {notes.length > 0 && (
        <>
          <h4 className="jpage-book-sub">{t('journey.bookNotes')}</h4>
          <ul className="jpage-book-notes">
            {notes.map((n) => <li key={n.id}><Text text={n.text} /></li>)}
          </ul>
        </>
      )}
    </div>
  );
}
