/*
 * Ask Carta, stage 5: the written answer (T556). One door, two open-model
 * back ends, taken in this order:
 *
 *   1. on device   the traveller's own browser (WebGPU, lib/ask/onDevice.js,
 *                  T557), once they switched it on and the model is ready:
 *                  private, no quota, works offline
 *   2. Workers AI  /api/ask/answer, an open model on Carta's Cloudflare
 *                  account inside the free daily Neurons
 *
 * Either way the text streams through verify.js: a sentence shows only once
 * it is finished and passes the check, and the whole answer is withdrawn
 * when too much of it fails. When neither back end can write (off, capped,
 * offline) the facts answer simply stays; the reason is returned so the
 * panel can say it in one line.
 *
 *   writeAnswer(pack, { knownPlaces, onSentence, signal, onDevice })
 *     -> { state: 'done'|'withdrawn'|'cap'|'off'|'error'|'aborted',
 *          sentences, backend, cached }
 */
import { systemPrompt, userPrompt, wirePack } from './context.js';
import { splitSentences, makeChecker, verifyAnswer } from './verify.js';

const ENDPOINT = '/api/ask/answer';
/** Waiting longer than this for the first piece gives up on the server. */
export const FIRST_TOKEN_MS = 12000;

async function* serverStream(pack, signal) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FIRST_TOKEN_MS);
  const stop = () => ctl.abort();
  signal?.addEventListener('abort', stop);
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(wirePack(pack)),
      signal: ctl.signal,
    });
  } catch {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
    throw Object.assign(new Error('offline'), { reason: signal?.aborted ? 'aborted' : 'error' });
  }
  if (!res.ok || !res.body) {
    clearTimeout(timer);
    let reason = 'error';
    try { reason = JSON.parse((await res.text()).split('data:')[1] || '{}').reason || reason; } catch { /* plain error */ }
    throw Object.assign(new Error(reason), { reason: reason === 'nocap' ? 'off' : reason });
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let first = true;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (first) { clearTimeout(timer); first = false; }
      buf += dec.decode(value, { stream: true });
      const events = buf.split('\n\n');
      buf = events.pop();
      for (const ev of events) {
        const data = ev.split('\n').find((l) => l.startsWith('data:'));
        if (!data) continue;
        if (ev.startsWith('event: done')) { yield { done: true, meta: JSON.parse(data.slice(5)) }; continue; }
        if (ev.startsWith('event: error')) throw Object.assign(new Error('stream'), { reason: 'error' });
        try { yield { t: JSON.parse(data.slice(5)).t || '' }; } catch { /* a torn event */ }
      }
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

/** Write, check and stream one answer. Never throws. */
export async function writeAnswer(pack, { knownPlaces = [], onSentence = () => {}, signal, onDevice = null } = {}) {
  const check = makeChecker(pack, knownPlaces);
  let text = '';
  let shown = 0;
  const sentences = [];
  let backend = null;
  let cached = false;
  const feed = (piece, final = false) => {
    text += piece;
    const { sentences: done } = splitSentences(text, final);
    for (; shown < done.length; shown++) {
      const s = check(done[shown]);
      if (s.ok) { sentences.push(s); onSentence(s, sentences.length - 1); }
    }
  };
  try {
    if (onDevice?.isReady?.()) {
      backend = 'device';
      await onDevice.generate({ system: systemPrompt(pack.lang), user: userPrompt(pack), onToken: feed, signal });
    } else {
      backend = 'server';
      for await (const ev of serverStream(pack, signal)) {
        if (ev.done) { cached = !!ev.meta?.cached; break; }
        feed(ev.t);
      }
    }
  } catch (e) {
    if (signal?.aborted) return { state: 'aborted', sentences, backend, cached };
    if (!sentences.length) return { state: e.reason === 'cap' ? 'cap' : e.reason === 'off' ? 'off' : 'error', sentences, backend, cached };
  }
  // The last sentence may end without a mark; close it and check it too.
  feed(/[.!?]\s*(\[\d+\]\s*)*$/.test(text.trim()) ? '' : '.', true);
  const all = verifyAnswer(text, pack, knownPlaces);
  if (all.withdrawn) return { state: 'withdrawn', sentences: [], backend, cached, failed: all.failed };
  return { state: 'done', sentences, backend, cached };
}
