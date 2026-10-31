import React from 'react';
import { Face } from '../auth/FriendFaces.jsx';

/**
 * Small shared pieces of the Together page and its signals (T928 to T932).
 * Styles: src/styles/90-together.css (class prefix .tg-), imported by styles.css.
 */

/** Four quiet tones for faces, picked from the person's id so one friend
 *  always wears the same one. You are always the brown. */
const TONES = 4;
export function toneOf(id, me) {
  if (id && me && id === me) return 'tg-tone-you';
  let h = 0;
  for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `tg-tone-${h % TONES}`;
}

export function ToneFace({ id, me, name, emoji = '', size = 'md' }) {
  return <Face name={name} emoji={emoji} size={size} className={toneOf(id, me)} />;
}

/** A row of overlapping faces. */
export function ToneFaces({ people = [], me, size = 'sm', max = 4 }) {
  if (!people.length) return null;
  return (
    <span className="frn-stack tg-faces" aria-hidden="true">
      {people.slice(0, max).map((p) => <ToneFace key={p.id} id={p.id} me={me} name={p.name} emoji={p.emoji} size={size} />)}
    </span>
  );
}

/** "22 to 24 Nov", "28 Nov to 2 Dec": short months, the word for the joiner
 *  from the catalogue (no en dash, PRODUCT.md). */
export function fmtShort(startIso, endIso, lang, joiner = 'to') {
  if (!startIso) return '';
  const s = new Date(`${startIso}T12:00:00Z`);
  if (Number.isNaN(s.getTime())) return '';
  const fmt = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const e = endIso ? new Date(`${endIso}T12:00:00Z`) : null;
  if (!e || Number.isNaN(e.getTime()) || +e === +s) return fmt.format(s);
  return fmt.formatRange(s, e).replace(/\s*[\u2013\u2014]\s*/g, ` ${joiner} `);
}

/** A block of the page: its heading, an optional quiet action, the body. */
export function Block({ id, title, action = null, children, className = '' }) {
  return (
    <section className={`tg-block ${className}`.trim()} aria-labelledby={id}>
      <div className="tg-block-head">
        <h2 className="tg-h2" id={id}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** The person's name as Carta shows it: what they chose, else the handle. */
export function nameOf(p) {
  if (!p) return '';
  return (p.displayName || p.name || '').trim() || (p.handle ? `@${p.handle}` : '');
}

/** The first word of a name, for "Sam went" on a card. */
export function firstName(name) {
  const n = String(name || '').replace(/^@/, '').trim();
  return n.split(/\s+/)[0] || n;
}
