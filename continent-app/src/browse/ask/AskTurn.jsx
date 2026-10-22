import React from 'react';
import { Button } from '../../components/ui/index.js';
import { CheckIcon, ExternalIcon } from '../../components/Icons.jsx';
import { parseIntent } from '../../lib/ask/intent.js';
import { answerFacts } from '../../lib/ask/rank.js';
import { composeAnswer, unknownNote } from '../../lib/ask/compose.js';
import { buildPack } from '../../lib/ask/context.js';
import { writeAnswer } from '../../lib/ask/generate.js';
import { outsidePlace } from '../../lib/ask/outside.js';
import { googleFlightsLink } from '../../lib/flights/flights.js';
import { AskAnswer } from '../AskSearchFull.jsx';
import { AskTripCard } from './AskTripCard.jsx';
import { CornerArrow } from './marks.jsx';

/**
 * One question and its answer in an Ask Carta chat (T571). The stages are
 * useAsk's (T558), run for this turn alone: the Intent, the hybrid search,
 * the facts, the facts in words, the written answer checked sentence by
 * sentence. While they run, the turn shows them as steps, so the wait reads
 * as work. A turn reopened from the chat list draws its facts again from
 * the catalogue and shows the written answer it kept, without asking the
 * model again.
 *
 *   turn      { id, q, at, written? }
 *   ctx       { t, lang, rows, byId, guided, price, labels, retrieve, trip,
 *               onOpen, onPlan, onAsk, onWritten }
 *   latest    the newest turn: it carries the follow-ups and the primary
 */
const IDLE = { state: 'idle', sentences: [], backend: null };
const TRIP_TYPES = new Set(['find', 'near', 'budget', 'plan', 'about', 'when']);

function useTurn(turn, vocab, ctx) {
  const { t, lang, rows, byId, guided, price, labels, retrieve } = ctx;
  const parsed = React.useMemo(
    () => (vocab ? parseIntent(turn.q, { vocab, lang, now: new Date(turn.at) }) : null),
    [vocab, turn.q, turn.at, lang],
  );
  const outside = React.useMemo(() => (parsed ? outsidePlace(turn.q, parsed) : null), [parsed, turn.q]);

  // undefined while the search runs, null when there is none.
  const [found, setFound] = React.useState(undefined);
  React.useEffect(() => {
    if (!parsed) return undefined;
    if (!retrieve || outside) { setFound(null); return undefined; }
    let live = true;
    retrieve(parsed, turn.q).then((r) => { if (live) setFound(r || null); }).catch(() => { if (live) setFound(null); });
    return () => { live = false; };
  }, [parsed, outside, retrieve, turn.q]);

  // Words the rules could not place but the vectors could fill empty facets.
  const intent = React.useMemo(() => {
    if (!parsed || !found?.slots || !Object.keys(found.slots).length) return parsed;
    return { ...parsed, facets: { ...found.slots, ...parsed.facets }, semantic: true, unknown: [] };
  }, [parsed, found]);

  const [limit, setLimit] = React.useState(6);
  const today = React.useMemo(() => new Date(turn.at), [turn.at]);
  const facts = React.useMemo(
    () => (intent && found !== undefined && !outside
      ? answerFacts(intent, { rows, byId, guided, today, price, limit, retrieved: found?.retrieved || null })
      : null),
    [intent, found, outside, rows, byId, guided, today, price, limit],
  );
  const answer = React.useMemo(() => {
    if (!facts) return null;
    const a = composeAnswer(facts, intent, { t, lang, labels: { ...labels, place: (id) => byId.get(id)?.city || id } });
    const cant = unknownNote(intent, t);
    if (cant) a.notes.unshift(cant);
    return a;
  }, [facts, intent, t, lang, labels, byId]);

  const [written, setWritten] = React.useState(turn.written || IDLE);
  const knownPlaces = React.useMemo(() => (rows || []).map((p) => p.city), [rows]);
  const hasWritten = !!turn.written;
  React.useEffect(() => {
    if (hasWritten || !answer || !facts?.picks?.length) return undefined;
    const ctl = new AbortController();
    const monthsText = (d) => (d.climate?.best || []).map((m) => labels.month(m)).join(', ');
    const pack = buildPack({ question: turn.q, lang, facts, answer, passages: found?.passages || [], labels: { monthsText, estWord: t('money.est') } });
    setWritten({ state: 'writing', sentences: [], backend: null });
    const shown = [];
    writeAnswer(pack, {
      knownPlaces,
      signal: ctl.signal,
      onSentence: (s) => { shown.push(s); setWritten({ state: 'writing', sentences: [...shown], backend: null }); },
    }).then((r) => {
      if (ctl.signal.aborted) return;
      const w = { state: r.state, sentences: r.state === 'done' ? r.sentences : [], backend: r.backend };
      setWritten(w);
      if (r.state === 'done') ctx.onWritten?.(turn.id, w);
    });
    return () => ctl.abort();
    // The written answer follows the answer itself, not every label object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer, hasWritten]);

  const stage = !parsed ? 'read'
    : found === undefined ? 'search'
      : written.state === 'writing' ? 'write' : 'done';
  return { intent, outside, facts, answer, written, stage, more: () => setLimit((n) => n + 12) };
}

const STEP_ORDER = ['read', 'search', 'price', 'write'];

function Steps({ t, stage, origin }) {
  const at = stage === 'done' ? STEP_ORDER.length : STEP_ORDER.indexOf(stage === 'write' ? 'write' : stage);
  const label = {
    read: t('askChat.step.read'),
    search: t('askChat.step.search'),
    price: origin ? t('askChat.step.flights', { origin }) : t('askChat.step.price'),
    write: t('askChat.step.write'),
  };
  return (
    <ol className="ac-steps" aria-live="polite">
      {STEP_ORDER.slice(0, at + 1).map((k, i) => (
        <li key={k} className={`ac-step${i < at ? ' is-done' : ' is-now'}`}>
          {i < at ? <CheckIcon size={16} className="ac-step-mark" /> : <span className="ac-step-dot" aria-hidden="true" />}
          <span>{label[k]}</span>
        </li>
      ))}
    </ol>
  );
}

function followUps(t, labels, intent, facts, outside) {
  const out = [];
  const month = intent?.facets?.month || new Date().getMonth() + 1;
  if (outside) {
    out.push(t('askChat.fu.warm', { month: labels.month(month) }));
    out.push(t('ask.ex.budget'));
    return out;
  }
  const [a, b] = (facts?.picks || []).map((p) => p.dest.city);
  if (!a) return [t('ask.ex.warm'), t('ask.ex.budget')];
  if (intent.type !== 'when') out.push(t('ask.sug.when', { place: a }));
  if (b && intent.type !== 'compare') out.push(t('ask.sug.compare', { a, b }));
  if (intent.type !== 'plan') out.push(t('askChat.fu.plan', { days: intent.budget?.days || 7, place: a }));
  return out.slice(0, 3);
}

export function AskTurn({ turn, vocab, ctx, latest }) {
  const { t, lang, labels, trip } = ctx;
  const s = useTurn(turn, vocab, ctx);
  const { intent, outside, facts, answer, written, stage } = s;
  const pick = facts?.picks?.[0];
  const showTrip = pick && intent && TRIP_TYPES.has(intent.type);
  const planAll = facts?.plan
    ? () => ctx.onPlan({ stops: facts.plan.order.map((id) => ({ dest: id, nights: facts.plan.nights[id] })).filter((x) => x.nights > 0) })
    : ctx.onPlan;
  const fus = latest && stage === 'done' ? followUps(t, labels, intent, facts, outside) : [];

  return (
    <li className="ac-turn">
      <div className="ac-q">
        <span className="sr-only">{t('askChat.you')}</span>
        <p>{turn.q}</p>
      </div>
      <div className="ac-a">
        <span className="sr-only">{t('askChat.carta')}</span>
        {stage !== 'done' && <Steps t={t} stage={stage} origin={trip.originName} />}
        {outside && (
          <div className="ask-answer">
            <p className="ask-lead">{t('askChat.outside.lead', { place: outside })}</p>
            <p className="ask-note">{t('askChat.outside.note')}</p>
            {trip.origin && (
              <a className="ac-out-link" target="_blank" rel="noopener noreferrer"
                href={googleFlightsLink(trip.origin, outside, trip.depart || new Date().toISOString().slice(0, 10), { back: trip.back, lang })}>
                <span>{t('askChat.outside.flights', { place: outside })}</span>
                <ExternalIcon size={14} />
              </a>
            )}
          </div>
        )}
        {answer && (
          <AskAnswer t={t} answer={answer} facts={facts} intent={intent} written={written}
            onOpen={ctx.onOpen} favorites={ctx.favorites} onToggleFav={ctx.onToggleFav} onMore={s.more}
            afterWritten={showTrip ? (
              <AskTripCard t={t} lang={lang} pick={pick} month={intent.facets?.month || null} trip={trip}
                primary={latest} onOpen={ctx.onOpen} onPlan={ctx.onPlan ? planAll : null} />
            ) : null} />
        )}
        {answer && ctx.onApply && facts.count > 1 && (intent.type === 'find' || intent.type === 'near') && (
          <Button variant="quiet" size="sm" className="ac-showall" onClick={() => {
            const f = { ...intent.facets };
            delete f.warm;
            ctx.onApply(f);
          }}>
            {t('ask.showAll', { count: facts.count })}
          </Button>
        )}
        {fus.length > 0 && (
          <ul className="ac-fu" aria-label={t('ask.tryOne')}>
            {fus.map((q) => (
              <li key={q}>
                <Button variant="quiet" size="sm" className="ac-fu-item" iconStart={<CornerArrow />} onClick={() => ctx.onAsk(q)}>
                  {q}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
