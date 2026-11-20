/**
 * Live flights for one route and day (T517), from /api/flights.
 *
 * useLiveFlights([{ o, d, date }, ...]) answers a Map keyed 'BRU-BCN-2026-11-18'
 * with the endpoint's answer ({ checked, link, flights }) once it arrives, or
 * no entry while it is on its way or when the search failed (the planner then
 * uses the swept price). Answers are shared by every screen for ten minutes.
 *
 * useLiveDay({ o, d, date }) is the flights screen's one day (G12, D10): it
 * says what is happening ('loading', 'ready', 'error') so the screen answers a
 * failure at once instead of waiting out a timer, and `retry` asks again.
 *
 * loadDay reads the reply's status: a 502 (Google refused, a timeout, an
 * airport fli does not know), a reply that is not JSON (a server with no
 * Function, which hands back index.html) or no network is tried once more
 * after RETRY_MS; a 429 is tried once more only when its retry-after is
 * short, so the per-address search limit is never spent twice.
 */
import { useEffect, useMemo, useState } from 'react';

const HOLD_MS = 10 * 60000;
export const RETRY_MS = 1500;
const RATE_WAIT_MAX_S = 5;
const cache = new Map(); // key -> { at, answer } | { at, pending: Promise }

export const liveKey = (o, d, date) => `${o}-${d}-${date}`;
const VALID = /^[A-Z]{3}$/;
const valid = (q) => Boolean(q && VALID.test(q.o) && VALID.test(q.d) && q.o !== q.d && q.date);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** One request: { status: 'ok' | 'rate' | 'upstream' | 'broken' | 'offline', answer, retryAfter }. */
export async function requestDay(o, d, date, fetchImpl = (u) => fetch(u)) {
  let r;
  try {
    r = await fetchImpl(`/api/flights?o=${o}&d=${d}&date=${date}`);
  } catch {
    return { status: 'offline', answer: null };
  }
  if (r.status === 429) {
    const s = Number(r.headers?.get?.('retry-after'));
    return { status: 'rate', answer: null, retryAfter: Number.isFinite(s) ? s : null };
  }
  if (!r.ok) return { status: 'upstream', answer: null };
  try {
    const answer = await r.json();
    return Array.isArray(answer?.flights) ? { status: 'ok', answer } : { status: 'broken', answer: null };
  } catch {
    return { status: 'broken', answer: null };
  }
}

/**
 * One day with one automatic retry: { status, answer, tries }. `wait` is
 * injectable so the tests do not sleep.
 */
export async function loadDay({ o, d, date }, { fetchImpl, wait = sleep, retryMs = RETRY_MS } = {}) {
  const first = await requestDay(o, d, date, fetchImpl);
  if (first.status === 'ok') return { ...first, tries: 1 };
  let pause = null;
  if (first.status === 'rate') {
    if (first.retryAfter != null && first.retryAfter <= RATE_WAIT_MAX_S) pause = first.retryAfter * 1000;
  } else {
    pause = retryMs;
  }
  if (pause == null) return { ...first, tries: 1 };
  await wait(pause);
  return { ...(await requestDay(o, d, date, fetchImpl)), tries: 2 };
}

function cachedAnswer(key) {
  const hit = cache.get(key);
  return hit && hit.answer && Date.now() - hit.at < HOLD_MS ? hit.answer : null;
}

/** The shared load: one request per key at a time, a good answer held ten minutes. */
function loadShared(o, d, date) {
  const key = liveKey(o, d, date);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < HOLD_MS) return hit.pending || Promise.resolve({ status: 'ok', answer: hit.answer });
  const pending = loadDay({ o, d, date }).then((res) => {
    if (res.answer) cache.set(key, { at: Date.now(), answer: res.answer });
    else cache.delete(key);
    return res;
  });
  cache.set(key, { at: Date.now(), pending });
  return pending;
}

export function useLiveFlights(queries) {
  const wanted = useMemo(
    () => (queries || []).filter(valid).map((q) => liveKey(q.o, q.d, q.date)),
    [queries],
  );
  const signature = wanted.join('|');
  const [answers, setAnswers] = useState(() => new Map());

  useEffect(() => {
    let alive = true;
    for (const key of wanted) {
      const [o, d, ...rest] = key.split('-');
      loadShared(o, d, rest.join('-')).then(({ answer }) => {
        if (!alive || !answer) return;
        setAnswers((prev) => (prev.get(key) === answer ? prev : new Map(prev).set(key, answer)));
      });
    }
    return () => { alive = false; };
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the query list's content

  return answers;
}

/**
 * One day for the flights screen: { id, status, answer, reason, retry }.
 * `status` is 'idle' without a query, 'loading' until the answer (or the one
 * retry) is in, then 'ready' or 'error'; a new key is 'loading' at once, so
 * the old day's list or failure never stands under the new day's title.
 */
export function useLiveDay(query) {
  const key = valid(query) ? liveKey(query.o, query.d, query.date) : null;
  const [state, setState] = useState({ key: null, status: 'idle', answer: null, reason: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!key) return undefined;
    const ready = cachedAnswer(key);
    if (ready) { setState({ key, status: 'ready', answer: ready, reason: null }); return undefined; }
    let alive = true;
    setState({ key, status: 'loading', answer: null, reason: null });
    const [o, d, ...rest] = key.split('-');
    loadShared(o, d, rest.join('-')).then((res) => {
      if (!alive) return;
      setState({ key, status: res.answer ? 'ready' : 'error', answer: res.answer || null, reason: res.answer ? null : res.status });
    });
    return () => { alive = false; };
  }, [key, nonce]);

  const shown = state.key === key ? state : { key, status: key ? 'loading' : 'idle', answer: null, reason: null };
  return { id: shown.key, status: shown.status, answer: shown.answer, reason: shown.reason, retry: () => setNonce((n) => n + 1) };
}
