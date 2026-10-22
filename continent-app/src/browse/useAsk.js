/*
 * Ask Carta's state for one panel (T558): the vocabulary, the question, its
 * Intent, the facts and the facts-only answer, and the written answer as it
 * streams. The stages are the pure modules in lib/ask/; this hook only
 * loads their data, holds the question and keeps the written answer to the
 * question on screen (a new question aborts the last one's writing).
 */
import React from 'react';
import { loadSearchIndex } from '../lib/searchIndex.js';
import { loadAskLexicon } from '../lib/ask/data.js';
import { buildAskVocab, parseIntent } from '../lib/ask/intent.js';
import { answerFacts } from '../lib/ask/rank.js';
import { composeAnswer, unknownNote } from '../lib/ask/compose.js';
import { buildPack } from '../lib/ask/context.js';
import { writeAnswer } from '../lib/ask/generate.js';

/** The suggested questions, each a question type Carta answers well. */
export const EXAMPLE_KEYS = ['ask.ex.hike', 'ask.ex.budget', 'ask.ex.warm', 'ask.ex.nocar',
  'ask.ex.lake', 'ask.ex.compare', 'ask.ex.when', 'ask.ex.plan'];

const NO_PRICE = {};
const IDLE = { state: 'idle', sentences: [], backend: null };

/**
 *   open       the panel is open (nothing loads before)
 *   rows       Explore's catalogue rows (with .cost, at the traveller's Lifestyle)
 *   price      { lifestyle, stayTier, flights } for total-budget answers
 *   retrieve   optional async (intent, text) -> { retrieved: Map, passages: [] } (T554)
 *   onDevice   optional on-device writer (T557)
 */
export function useAsk({ open, t, lang, guided, rows, countries, labels, price = NO_PRICE, retrieve = null, onDevice = null, deviceTick = 0, written: writeOn = true }) {
  const [index, setIndex] = React.useState(null);
  const [lexicon, setLexicon] = React.useState(undefined);
  React.useEffect(() => {
    if (!open) return;
    if (!index) loadSearchIndex().then((ix) => setIndex(ix || {}));
    if (lexicon === undefined) loadAskLexicon().then((l) => setLexicon(l || null));
  }, [open, index, lexicon]);

  const vocab = React.useMemo(
    () => (open && guided && rows?.length && index && lexicon !== undefined
      ? buildAskVocab({ t, lang, guided, rows, countries, index, lexicon })
      : null),
    [open, guided, rows, countries, index, lexicon, t, lang],
  );
  const byId = React.useMemo(() => new Map((rows || []).map((p) => [p.id, p])), [rows]);

  const [question, setQuestion] = React.useState('');
  const [intent, setIntent] = React.useState(null);
  const [found, setFound] = React.useState(null);
  // How many places the answer lists; "Show more places" adds a page.
  const [limit, setLimit] = React.useState(6);
  const more = React.useCallback(() => setLimit((n) => n + 12), []);

  const ask = React.useCallback((text) => {
    const q = String(text || '').trim();
    if (!q || !vocab) return null;
    const it = parseIntent(q, { vocab, lang, now: new Date() });
    setQuestion(q);
    setIntent(it);
    setFound(null);
    setLimit(6);
    return it;
  }, [vocab, lang]);

  /** Refine: a facet delta from the slots (null clears a facet). */
  const refine = React.useCallback((delta) => {
    setIntent((it) => {
      if (!it) return it;
      const facets = { ...it.facets, ...delta };
      for (const k of Object.keys(facets)) {
        if (facets[k] == null || facets[k] === false || (Array.isArray(facets[k]) && !facets[k].length)) delete facets[k];
      }
      let type = it.type;
      if ((type === 'find' || type === 'near')) type = facets.near ? 'near' : 'find';
      return { ...it, type, facets };
    });
  }, []);
  /** Refine the trip around it: party, days, money, mode. */
  const setBudget = React.useCallback((patch) => {
    setIntent((it) => (it ? { ...it, budget: { ...it.budget, ...patch } } : it));
  }, []);
  const clear = React.useCallback(() => { setQuestion(''); setIntent(null); setFound(null); }, []);

  // Stage 2, when the hybrid search is on: the passages and their places.
  React.useEffect(() => {
    if (!intent || !retrieve) return undefined;
    let live = true;
    retrieve(intent, question).then((r) => {
      if (!live) return;
      setFound(r || null);
      // Words the rules could not place but the lexicon's vectors could
      // ("chilled" is quiet): they fill empty facets once, then the answer
      // is asked again with them.
      if (r?.slots && Object.keys(r.slots).length && !intent.semantic) {
        setIntent((it) => (it === intent ? { ...it, facets: { ...r.slots, ...it.facets }, semantic: true, unknown: [] } : it));
      }
    }).catch(() => {});
    return () => { live = false; };
  }, [intent, question, retrieve]);

  const today = React.useMemo(() => new Date(), []);
  const facts = React.useMemo(
    () => (intent ? answerFacts(intent, { rows, byId, guided, today, price, limit, retrieved: found?.retrieved || null }) : null),
    [intent, rows, byId, guided, today, price, found, limit],
  );
  const answer = React.useMemo(() => {
    if (!facts) return null;
    const a = composeAnswer(facts, intent, { t, lang, labels: { ...labels, place: (id) => byId.get(id)?.city || id } });
    const cant = unknownNote(intent, t);
    if (cant) a.notes.unshift(cant);
    return a;
  }, [facts, intent, t, lang, labels, byId]);

  // Stage 5: the written answer, checked sentence by sentence as it streams.
  const [written, setWritten] = React.useState(IDLE);
  const knownPlaces = React.useMemo(() => (rows || []).map((p) => p.city), [rows]);
  React.useEffect(() => {
    if (!writeOn || !answer || !facts?.picks?.length) { setWritten(IDLE); return undefined; }
    const ctl = new AbortController();
    const monthsText = (d) => (d.climate?.best || []).map((m) => labels.month(m)).join(', ');
    const pack = buildPack({ question, lang, facts, answer, passages: found?.passages || [], labels: { monthsText } });
    setWritten({ state: 'writing', sentences: [], backend: null });
    const shown = [];
    writeAnswer(pack, {
      knownPlaces,
      signal: ctl.signal,
      onDevice,
      onSentence: (s) => { shown.push(s); setWritten({ state: 'writing', sentences: [...shown], backend: null }); },
    }).then((r) => {
      if (ctl.signal.aborted) return;
      setWritten({ state: r.state, sentences: r.state === 'done' ? r.sentences : [], backend: r.backend, notes: pack.notes });
    });
    return () => ctl.abort();
    // The written answer follows the answer itself, not every label object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer, writeOn, found, deviceTick]);

  // Dev only: the end check and the on-device bake-off (T557) read these.
  if (import.meta.env?.DEV && typeof window !== 'undefined') {
    window.__askDebug = { rows, intent, facts, answer, written, found };
  }
  return { ready: !!vocab, question, intent, facts, answer, written, ask, refine, setBudget, clear, more, vocab };
}
