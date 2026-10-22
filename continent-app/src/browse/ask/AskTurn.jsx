import React from 'react';
import { Button } from '../../components/ui/index.js';
import { CheckIcon, ExternalIcon } from '../../components/Icons.jsx';
import { parseIntent } from '../../lib/ask/intent.js';
import { answerFacts } from '../../lib/ask/rank.js';
import { composeAnswer, unknownNote } from '../../lib/ask/compose.js';
import { buildPack } from '../../lib/ask/context.js';
import { writeAnswer } from '../../lib/ask/generate.js';
import { outsidePlace } from '../../lib/ask/outside.js';
import { bindFollowUp, pointsBack } from '../../lib/ask/followup.js';
import {
  SHOWN_PLACES, MIN_TYPING_MS, SLOW_MS, trimSentences, replyText, shortLine, revealPace, placeChips,
} from '../../lib/ask/reply.js';
import { prefersReducedMotion } from '../../lib/motion.js';
import { googleFlightsLink } from '../../lib/flights/flights.js';
import { AskAnswer } from '../AskSearchFull.jsx';
import { PlaceOverview } from '../PlaceOverview.jsx';
import { AskTripCard } from './AskTripCard.jsx';
import { CornerArrow } from './marks.jsx';

/**
 * One question and its answer in an Ask Carta chat (T571; T583 "short
 * answer, then ask"). The stages are useAsk's (T558), run for this turn
 * alone: the Intent, the hybrid search, the facts, the facts in words, the
 * written answer checked sentence by sentence. While they run, Carta shows
 * a typing bubble (the real steps once the wait passes SLOW_MS); then the
 * answer arrives word by word.
 *
 * A list answer (find, near, budget) is two or three sentences, the first
 * three places as compact rows with one "More places", and a question,
 * "Got one in mind?", with the places as quick replies and "Not yet". The
 * trip card waits for the traveller's pick: a quick reply or a row starts a
 * pick turn (`turn.pick`), "Not yet" a turn that asks what matters most
 * (`turn.notYet`).
 *
 *   turn      { id, q, at, written?, ref?, subject?, pick?, notYet? }
 *   ctx       { t, lang, rows, byId, guided, price, labels, retrieve, trip,
 *               onOpen, onPlan, onAsk, onPick, onNotYet, onWritten }
 *   latest    the newest turn: it carries the questions and the primary
 */
const IDLE = { state: 'idle', sentences: [], backend: null };
const LIMIT = 6;
const LIST_TYPES = new Set(['find', 'near', 'budget']);
// A trip card opens by itself only when the question named its place.
const TRIP_TYPES = new Set(['plan', 'about', 'when']);

function useTurn(turn, vocab, ctx) {
  const { t, lang, byId, guided, price, labels, retrieve } = ctx;
  // T573: a question asked with Explore's filters kept answers within them.
  const rows = turn.within && ctx.filteredRows?.length ? ctx.filteredRows : ctx.rows;
  const raw = React.useMemo(
    () => (vocab ? parseIntent(turn.q, { vocab, lang, now: new Date(turn.at) }) : null),
    [vocab, turn.q, turn.at, lang],
  );
  // T572: a follow-up that names no place is about the last answer's place;
  // one that points back ("there") is never a place outside Europe.
  const refId = turn.ref?.id || null;
  const outside = React.useMemo(
    () => (raw && !(refId && pointsBack(turn.q)) ? outsidePlace(turn.q, raw) : null),
    [raw, turn.q, refId],
  );
  const parsed = React.useMemo(
    () => (raw && !outside && refId ? bindFollowUp(turn.q, raw, turn.ref) : raw),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- turn.ref is read by its id
    [raw, outside, refId, turn.q],
  );

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

  const today = React.useMemo(() => new Date(turn.at), [turn.at]);
  const facts = React.useMemo(
    () => (intent && found !== undefined && !outside
      ? answerFacts(intent, { rows, byId, guided, today, price, limit: LIMIT, retrieved: found?.retrieved || null })
      : null),
    [intent, found, outside, rows, byId, guided, today, price],
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

  // What this answer is about, for the next question to point back to.
  const subjectId = facts?.picks?.[0]?.id || null;
  React.useEffect(() => {
    if (!facts) return;
    const p = facts.picks?.[0];
    const next = p ? { id: p.id, city: p.dest.city } : null;
    if ((turn.subject?.id || null) !== (next?.id || null)) ctx.onSubject?.(turn.id, next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per answer's first place
  }, [subjectId, facts == null]);

  // The written answer is still to come while the model writes (and for the
  // one render before its effect starts it).
  const writing = !hasWritten && !!facts?.picks?.length && (written.state === 'idle' || written.state === 'writing');
  const stage = !parsed ? 'read'
    : found === undefined ? 'search'
      : writing ? 'write' : 'done';
  return { intent, outside, facts, answer, written, stage };
}

/**
 * When the reply may show. A fresh turn shows a typing bubble for the real
 * wait, at least MIN_TYPING_MS, and its steps once the wait passes SLOW_MS;
 * a turn reopened from the chat list, or under reduced motion, shows at once.
 */
function useArrival(turn, pending) {
  const [animate] = React.useState(() => Date.now() - (turn.at || 0) < 5000 && !prefersReducedMotion());
  const [minOk, setMinOk] = React.useState(!animate);
  const [slow, setSlow] = React.useState(false);
  React.useEffect(() => {
    const a = animate ? setTimeout(() => setMinOk(true), MIN_TYPING_MS) : null;
    const b = setTimeout(() => setSlow(true), SLOW_MS);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [animate]);
  const phase = !pending && minOk ? 'ready' : pending && slow ? 'steps' : 'typing';
  return { phase, animate };
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

/** Three dots while Carta writes; the words for a screen reader. */
function Typing({ t }) {
  return (
    <div className="ac-typing" role="status">
      <span className="sr-only">{t('askChat.typing')}</span>
      <span className="ac-dots" aria-hidden="true"><i /><i /><i /></span>
    </div>
  );
}

/**
 * A reply's words, revealed one by one (about 30 ms each, the whole under
 * 1.5 s). The text is all there from the start: the words still to come
 * hold their place unseen, so the bubble never grows, and a screen reader
 * reads the whole sentence once.
 */
function Reveal({ text, animate, onDone, className = 'ac-text' }) {
  const words = React.useMemo(() => String(text || '').split(/(\s+)/), [text]);
  const [n, setN] = React.useState(animate ? 0 : words.length);
  const done = React.useRef(onDone);
  done.current = onDone;
  React.useEffect(() => {
    if (!animate) { setN(words.length); done.current?.(); return undefined; }
    const pace = revealPace(words.filter((w) => w.trim()).length);
    let i = 0;
    setN(0);
    const id = setInterval(() => {
      i += 2;
      setN(i);
      if (i >= words.length) { clearInterval(id); done.current?.(); }
    }, pace);
    return () => clearInterval(id);
  }, [words, animate]);
  return (
    <p className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.slice(0, n).join('')}
        <span className="ac-rest">{words.slice(n).join('')}</span>
      </span>
    </p>
  );
}

/** Quick replies: short answers the traveller can tap instead of typing. */
function Replies({ label, items }) {
  return (
    <ul className="ac-replies" aria-label={label}>
      {items.map((x) => (
        <li key={x.key}>
          <Button variant="secondary" size="sm" className="ac-reply" onClick={x.run}>{x.label}</Button>
        </li>
      ))}
    </ul>
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

function FollowUps({ t, items, onAsk }) {
  if (!items.length) return null;
  return (
    <ul className="ac-fu" aria-label={t('ask.tryOne')}>
      {items.map((q) => (
        <li key={q}>
          <Button variant="quiet" size="sm" className="ac-fu-item" iconStart={<CornerArrow />} onClick={() => onAsk(q)}>
            {q}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function Question({ t, turn, about = null }) {
  return (
    <div className="ac-q">
      <span className="sr-only">{t('askChat.you')}</span>
      <p>{turn.q}</p>
      {about && <span className="ac-about">{t('askChat.about', { place: about })}</span>}
    </div>
  );
}

/** A list answer: a few sentences, three places, then "Got one in mind?". */
function ListReply({ t, lang, ctx, turn, s, latest, animate }) {
  const { facts, answer, intent, written } = s;
  const [shown, setShown] = React.useState(SHOWN_PLACES);
  const [revealed, setRevealed] = React.useState(!animate);
  const picks = facts.picks;
  const chips = placeChips(picks);
  const fromModel = written.state === 'done' ? replyText(written.sentences) : '';
  const text = picks.length
    ? (fromModel || shortLine(chips.map((c) => c.city), { t, lang }))
    : [answer.lead, answer.notes[0]].filter(Boolean).join(' ');
  const month = intent.facets?.month || null;
  const totals = new Map((answer.picks || []).filter((p) => p.price).map((p) => [p.id, p.price.total]));
  const pickPlace = (c) => ctx.onPick?.(c, month);

  return (
    <>
      <div className="ac-bubble">
        <Reveal text={text} animate={animate} onDone={() => setRevealed(true)} />
        {revealed && picks.length > 0 && (
          <ol className="ask-picks explore-shell ac-places" aria-label={t('askChat.placesLabel')}>
            {picks.slice(0, shown).map((p) => (
              <li key={p.id} className="ac-place">
                <PlaceOverview p={p.dest} t={t}
                  reason={totals.has(p.id) ? t('askChat.groupTotal', { total: totals.get(p.id) }) : null}
                  onOpen={() => pickPlace({ id: p.id, city: p.dest.city })}
                  hitProps={{ 'aria-label': t('askChat.pickAria', { place: p.dest.city }) }}
                  fav={!!ctx.favorites?.has?.(p.id)} onToggleFav={ctx.onToggleFav} />
              </li>
            ))}
          </ol>
        )}
        {revealed && shown < picks.length && (
          <Button variant="quiet" size="sm" className="ac-more-places" onClick={() => setShown((n) => n + SHOWN_PLACES)}>
            {t('askChat.morePlaces')}
          </Button>
        )}
        {turn.within && <p className="ac-within">{t('askChat.within', { filters: turn.within })}</p>}
      </div>
      {revealed && latest && chips.length > 0 && (
        <div className="ac-bubble ac-ask">
          <p className="ac-text">{t('askChat.gotOne')}</p>
          <Replies label={t('askChat.gotOne')} items={[
            ...chips.map((c) => ({ key: c.id, label: c.city, run: () => pickPlace(c) })),
            { key: 'not-yet', label: t('askChat.notYet'), run: () => ctx.onNotYet?.(month) },
          ]} />
        </div>
      )}
      {revealed && latest && !picks.length && (
        <FollowUps t={t} items={followUps(t, ctx.labels, intent, facts, null)} onAsk={ctx.onAsk} />
      )}
    </>
  );
}

function AnswerTurn({ turn, vocab, ctx, latest }) {
  const { t, lang, labels, trip } = ctx;
  const s = useTurn(turn, vocab, ctx);
  const { intent, outside, facts, answer, written, stage } = s;
  const { phase, animate } = useArrival(turn, stage !== 'done');
  const listy = !!answer && LIST_TYPES.has(intent.type);
  const pick = facts?.picks?.[0];
  const showTrip = pick && intent && TRIP_TYPES.has(intent.type);
  const planAll = facts?.plan
    ? () => ctx.onPlan({ stops: facts.plan.order.map((id) => ({ dest: id, nights: facts.plan.nights[id] })).filter((x) => x.nights > 0) })
    : ctx.onPlan;
  const fus = latest && phase === 'ready' && !listy ? followUps(t, labels, intent, facts, outside) : [];
  const short = React.useMemo(() => ({ ...written, sentences: trimSentences(written.sentences) }), [written]);

  return (
    <li className="ac-turn">
      <Question t={t} turn={turn} about={intent?.followOf ? turn.ref?.city : null} />
      <div className="ac-a">
        <span className="sr-only">{t('askChat.carta')}</span>
        {phase === 'typing' && <Typing t={t} />}
        {phase === 'steps' && <Steps t={t} stage={stage} origin={trip.originName} />}
        {phase === 'ready' && outside && (
          <div className="ac-bubble">
            <p className="ac-text">{t('askChat.outside.lead', { place: outside })} {t('askChat.outside.note')}</p>
            {trip.origin && (
              <a className="ac-out-link" target="_blank" rel="noopener noreferrer"
                href={googleFlightsLink(trip.origin, outside, trip.depart || new Date().toISOString().slice(0, 10), { back: trip.back, lang })}>
                <span>{t('askChat.outside.flights', { place: outside })}</span>
                <ExternalIcon size={14} />
              </a>
            )}
          </div>
        )}
        {phase === 'ready' && listy && (
          <ListReply t={t} lang={lang} ctx={ctx} turn={turn} s={s} latest={latest} animate={animate} />
        )}
        {phase === 'ready' && answer && !listy && (
          <div className="ac-bubble">
            <AskAnswer t={t} answer={answer} facts={facts} intent={intent} written={short}
              onOpen={ctx.onOpen} favorites={ctx.favorites} onToggleFav={ctx.onToggleFav}
              afterWritten={showTrip ? (
                <AskTripCard t={t} lang={lang} pick={pick} month={intent.facets?.month || null} trip={trip}
                  primary={latest} onOpen={ctx.onOpen} onPlan={ctx.onPlan ? planAll : null} />
              ) : null} />
            {turn.within && <p className="ac-within">{t('askChat.within', { filters: turn.within })}</p>}
          </div>
        )}
        <FollowUps t={t} items={fus} onAsk={ctx.onAsk} />
      </div>
    </li>
  );
}

/** The traveller picked a place: a line, then the trip around it. */
function PickTurn({ turn, ctx, latest }) {
  const { t, lang, labels, trip, byId } = ctx;
  const dest = byId.get(turn.pick.id);
  const { phase, animate } = useArrival(turn, false);
  const [revealed, setRevealed] = React.useState(!animate);
  const month = turn.pick.month || null;
  const pick = dest ? { id: dest.id, dest } : null;
  const fus = latest && revealed && pick
    ? followUps(t, labels, { type: 'about', facets: { month }, budget: null }, { picks: [pick] }, null) : [];
  return (
    <li className="ac-turn">
      <Question t={t} turn={turn} />
      <div className="ac-a">
        <span className="sr-only">{t('askChat.carta')}</span>
        {phase !== 'ready' && <Typing t={t} />}
        {phase === 'ready' && (
          <div className="ac-bubble">
            <Reveal text={pick ? t('askChat.picked', { place: dest.city }) : t('ask.lead.noPlace')}
              animate={animate} onDone={() => setRevealed(true)} />
          </div>
        )}
        {phase === 'ready' && revealed && pick && (
          <AskTripCard t={t} lang={lang} pick={pick} month={month} trip={trip}
            primary={latest} onOpen={ctx.onOpen} onPlan={ctx.onPlan} />
        )}
        <FollowUps t={t} items={fus} onAsk={ctx.onAsk} />
      </div>
    </li>
  );
}

/** "Not yet": no rush, and what matters most, as quick replies. */
function NotYetTurn({ turn, ctx, latest }) {
  const { t, labels } = ctx;
  const { phase, animate } = useArrival(turn, false);
  const [revealed, setRevealed] = React.useState(!animate);
  const m = turn.notYet.month || ((new Date(turn.at).getMonth() + 1) % 12) + 1;
  const month = labels.month(m);
  const items = [
    { key: 'warm', label: t('askChat.chip.warm'), run: () => ctx.onAsk(t('askChat.ask.warm', { month })) },
    { key: 'cheap', label: t('askChat.chip.cheap'), run: () => ctx.onAsk(t('askChat.start.cheap', { month })) },
    { key: 'quiet', label: t('askChat.chip.quiet'), run: () => ctx.onAsk(t('askChat.ask.quiet', { month })) },
  ];
  return (
    <li className="ac-turn">
      <Question t={t} turn={turn} />
      <div className="ac-a">
        <span className="sr-only">{t('askChat.carta')}</span>
        {phase !== 'ready' && <Typing t={t} />}
        {phase === 'ready' && (
          <div className="ac-bubble ac-ask">
            <Reveal text={t('askChat.notYetReply')} animate={animate} onDone={() => setRevealed(true)} />
            {revealed && latest && <Replies label={t('askChat.notYetReply')} items={items} />}
          </div>
        )}
      </div>
    </li>
  );
}

export function AskTurn({ turn, vocab, ctx, latest }) {
  if (turn.pick) return <PickTurn turn={turn} ctx={ctx} latest={latest} />;
  if (turn.notYet) return <NotYetTurn turn={turn} ctx={ctx} latest={latest} />;
  return <AnswerTurn turn={turn} vocab={vocab} ctx={ctx} latest={latest} />;
}
