/**
 * The trip page's head, in words (T885): how far the trip is, its name as
 * shown and how much of it is booked. Pure, so the node tests read them.
 */
import { cityLabel } from '../../lib/placeName.js';

const DAY_MS = 86400000;
const dayNum = (iso) => Math.floor(Date.parse(`${iso}T12:00:00Z`) / DAY_MS);

/**
 * How far the trip is (T885): "In 218 days", "Tomorrow", "Day 3 of 7" while
 * it runs, "Done" after; '' without dates. Calendar days in the traveller's
 * own day, so it turns at midnight.
 */
export function countdownText(t, tripStart, tripEnd, now = new Date()) {
  if (!tripStart) return '';
  const today = dayNum(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
  const start = dayNum(tripStart);
  const end = tripEnd ? dayNum(tripEnd) : start;
  if (today < start) return start - today === 1 ? t('tp.cd.tomorrow') : t('tp.cd.in', { n: start - today });
  if (today <= end) return t('tp.cd.day', { n: today - start + 1, of: end - start + 1 });
  return t('tp.cd.past');
}

/**
 * The trip's name as shown (T885): the traveller's own, else its places
 * ("Corfu", "Split and Hvar"). A name that is only the country a finder
 * trip landed with ("Greece" for a week in Corfu) reads as its places too.
 */
export function shownTripName(name, stopDetails, lang = 'en') {
  const places = [...new Set(stopDetails.map((s) => cityLabel(s.dest?.city || '')).filter(Boolean))];
  const countries = new Set(stopDetails.map((s) => (s.dest?.country || '').trim().toLowerCase()).filter(Boolean));
  const own = (name || '').trim();
  if (own && !countries.has(own.toLowerCase())) return own;
  if (!places.length) return own;
  try { return new Intl.ListFormat(lang, { type: 'conjunction' }).format(places); } catch { return places.join(', '); }
}

/**
 * What is booked of what can be (T885): the flight each way (one booking
 * covers both) and each stay; a drive or a stay the traveller put in as
 * their own counts as nothing to book.
 */
export function bookedCount({ flight, priced, ownFlight, stopDetails, stayCosts = [], booked }) {
  const flies = !flight?.driving && Boolean(priced?.cartaFlight?.out || priced?.cartaFlight?.back || flight?.combinable || ownFlight);
  const stays = stopDetails.map((s, i) => ({ s, i })).filter(({ s, i }) => s.dest && !stayCosts[i]?.ownAccom);
  const bookedStays = new Set(booked?.stays || []);
  const of = (flies ? 2 : 0) + stays.length;
  const n = (flies && booked?.flights ? 2 : 0) + stays.filter(({ s }) => bookedStays.has(s.destinationId)).length;
  return { n, of };
}
