/**
 * Live flights for the trip planner's exact days (T517), from /api/flights.
 *
 * useLiveFlights([{ o, d, date }, ...]) answers a Map keyed 'BRU-BCN-2026-11-18'
 * with the endpoint's answer ({ checked, link, flights }) once it arrives, or
 * no entry while it is on its way or when the search failed (the planner then
 * uses the swept price). Answers are shared by every screen for ten minutes.
 */
import { useEffect, useMemo, useState } from 'react';

const HOLD_MS = 10 * 60000;
const cache = new Map(); // key -> { at, answer } | { at, pending: Promise }

export const liveKey = (o, d, date) => `${o}-${d}-${date}`;

function fetchLive(o, d, date) {
  const key = liveKey(o, d, date);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < HOLD_MS) return hit.pending || Promise.resolve(hit.answer);
  const pending = fetch(`/api/flights?o=${o}&d=${d}&date=${date}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((answer) => {
      if (answer) cache.set(key, { at: Date.now(), answer });
      else cache.delete(key);
      return answer;
    });
  cache.set(key, { at: Date.now(), pending });
  return pending;
}

const VALID = /^[A-Z]{3}$/;

export function useLiveFlights(queries) {
  const wanted = useMemo(
    () => (queries || []).filter((q) => q && VALID.test(q.o) && VALID.test(q.d) && q.o !== q.d && q.date)
      .map((q) => liveKey(q.o, q.d, q.date)),
    [queries],
  );
  const signature = wanted.join('|');
  const [answers, setAnswers] = useState(() => new Map());

  useEffect(() => {
    let alive = true;
    for (const key of wanted) {
      const [o, d, ...rest] = key.split('-');
      fetchLive(o, d, rest.join('-')).then((answer) => {
        if (!alive || !answer) return;
        setAnswers((prev) => (prev.get(key) === answer ? prev : new Map(prev).set(key, answer)));
      });
    }
    return () => { alive = false; };
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the query list's content

  return answers;
}
