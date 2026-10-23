import React from 'react';
import { createPortal } from 'react-dom';
import { Button, IconButton, Segmented } from '../../components/ui/index.js';
import { ClockIcon, CloseIcon, PencilIcon, SparkIcon, TrashIcon, ArrowLeftIcon } from '../../components/Icons.jsx';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { fetchAskChats, upsertAskChat, deleteAskChat, missingTable } from '../../auth/askChatCloud.js';
import { loadSearchIndex } from '../../lib/searchIndex.js';
import { loadAskLexicon } from '../../lib/ask/data.js';
import { buildAskVocab } from '../../lib/ask/intent.js';
import { makeRetriever } from '../../lib/ask/retrieve.js';
import { scrollBehavior } from '../../lib/motion.js';
import {
  loadChats, saveChats, upsertChat, removeChat, groupChats, newId, titleOf, mergeChats,
} from '../../lib/ask/sessions.js';
import { AskTurn } from './AskTurn.jsx';
import { CornerArrow, SendIcon } from './marks.jsx';
import { useTypedHint } from './useTypedHint.js';
import '../../styles/75-ask.css';
import '../../styles/76-ask-chat.css';

/**
 * Ask Carta as a chat (T570): one panel that opens from the Ask Carta button
 * and closes again, holding conversations kept on this device. Desktop: a
 * column docked on the right under the header, beside the list it answers
 * about (not modal; Escape closes it). Phone: a full-screen sheet with its
 * own focus trap. Empty, it greets with where the traveller flies from and
 * a few questions to ask; asked, it shows each question and its answer
 * (AskTurn), the newest last, with the field held at the foot.
 *
 *   t, lang, guided, rows, countries, labels, price   as AskSearchFull
 *   trip      { origin, originName, flights, depart, back, party, destinations }
 *   seed      { text, n } a question handed over (Home, the button) or null
 *   onClose, onOpenPlace(id), onPlanTrip({stops}), favorites, onToggleFav
 */
const RETRIEVE = makeRetriever();
const START = ['ask.ex.warm', 'ask.ex.budget', 'ask.ex.hike', 'ask.ex.compare', 'ask.ex.when', 'ask.ex.nocar', 'ask.ex.lake'];
const SHOWN = 3;

function useIsPhone() {
  const q = '(max-width: 768px)';
  const [m, setM] = React.useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  React.useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

/** "You're in {place}" with the place in bold, in any word order. */
function YoureIn({ t, place }) {
  const [a, b = ''] = t('askChat.youreIn', { place: '\u0000' }).split('\u0000');
  return <p className="ac-where">{a}<strong>{place}</strong>{b}</p>;
}

export default function AskChat(props) {
  const { t, lang, guided, rows, countries, labels, price, trip, seed, onClose, onOpenPlace, onPlanTrip, onApply, favorites, onToggleFav, filters = null } = props;
  const isPhone = useIsPhone();
  const panelRef = React.useRef(null);
  const listRef = React.useRef(null);
  const fieldRef = React.useRef(null);
  const boxRef = React.useRef(null);
  const titleRef = React.useRef(null);

  // T584: the head and the foot stand on the panel's own ground; a hairline
  // shows only where the conversation runs on under them.
  const markEdges = React.useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    el.classList.toggle('is-scrolled', el.scrollTop > 2);
    el.classList.toggle('has-more', el.scrollHeight - el.scrollTop - el.clientHeight > 2);
  }, []);
  React.useEffect(() => { markEdges(); });

  // The vocabulary, built once per panel (useAsk's stage 1 data).
  const [index, setIndex] = React.useState(null);
  const [lexicon, setLexicon] = React.useState(undefined);
  React.useEffect(() => {
    loadSearchIndex().then((ix) => setIndex(ix || {}));
    loadAskLexicon().then((l) => setLexicon(l || null));
  }, []);
  const vocab = React.useMemo(
    () => (guided && rows?.length && index && lexicon !== undefined
      ? buildAskVocab({ t, lang, guided, rows, countries, index, lexicon })
      : null),
    [guided, rows, countries, index, lexicon, t, lang],
  );
  const byId = React.useMemo(() => new Map((rows || []).map((p) => [p.id, p])), [rows]);

  // Chats on this device; the open one is `chat` (null: a new, empty chat).
  const [chats, setChats] = React.useState(() => loadChats());
  const [chat, setChatState] = React.useState(null);
  const chatRef = React.useRef(null);
  const [view, setView] = React.useState('chat');
  const setChat = React.useCallback((next) => { chatRef.current = next; setChatState(next); }, []);
  // T575: signed in, chats are kept in the account too. On open the
  // device's and the account's merge (the first sign-in sends the device's
  // up); a change goes up a moment after the turn settles; a missing table
  // (054 not pasted) turns the cloud off for this visit, quietly.
  const { user } = useAuth();
  const userId = user?.id || null;
  const cloud = React.useRef({ on: false, timers: new Map() });
  const cloudFail = React.useCallback((err) => { if (missingTable(err)) cloud.current.on = false; }, []);
  const sendUp = React.useCallback((c) => {
    if (!cloud.current.on || !userId) return;
    const timers = cloud.current.timers;
    clearTimeout(timers.get(c.id)?.timer);
    timers.set(c.id, {
      chat: c,
      timer: setTimeout(() => {
        timers.delete(c.id);
        if (cloud.current.on) upsertAskChat(userId, c).catch(cloudFail);
      }, 1500),
    });
  }, [userId, cloudFail]);
  React.useEffect(() => {
    cloud.current.on = !!userId;
    if (!userId) return undefined;
    let live = true;
    fetchAskChats(userId).then((rows) => {
      if (!live) return;
      const { list, upload } = mergeChats(loadChats(), rows);
      saveChats(list);
      setChats(list);
      for (const c of upload) upsertAskChat(userId, c).catch(cloudFail);
    }).catch(cloudFail);
    const state = cloud.current;
    // Closing the chat sends what is still waiting, rather than dropping it.
    return () => {
      live = false;
      state.timers.forEach(({ chat: c, timer }) => {
        clearTimeout(timer);
        if (state.on) upsertAskChat(userId, c).catch(() => {});
      });
      state.timers.clear();
    };
  }, [userId, cloudFail]);

  // Show a chat and keep it in the list on this device (and the account).
  const keep = React.useCallback((next) => {
    setChat(next);
    const out = upsertChat(loadChats(), next);
    saveChats(out);
    setChats(out);
    sendUp(next);
  }, [setChat, sendUp]);

  const [text, setText] = React.useState('');
  // T573: Explore's filters are offered, never assumed: a question asked
  // with "Keep" answers within them and says so; "Ignore" (the default)
  // asks all of Carta. The turn keeps which it was.
  const filterLabels = filters?.labels || [];
  const filterText = filterLabels.length
    ? new Intl.ListFormat(lang, { type: 'conjunction' }).format(filterLabels) : '';
  const [scope, setScope] = React.useState('all');
  const scopeRef = React.useRef({ scope, filterText });
  scopeRef.current = { scope: filterLabels.length ? scope : 'all', filterText };
  // The typed hint keeps running in a focused empty field (desktop focuses
  // it on open); the browser's own caret stands in for the drawn one.
  const [focused, setFocused] = React.useState(false);
  // `extra` marks a quick reply (T583): { pick, subject } when the traveller
  // picked a place, { notYet } when not yet.
  const ask = React.useCallback((q, extra = null) => {
    const question = String(q || '').trim();
    if (!question) return;
    const now = Date.now();
    const cur = chatRef.current;
    // T572: the place the last answer was about, for a follow-up to use.
    const ref = cur?.turns[cur.turns.length - 1]?.subject || null;
    const sc = scopeRef.current;
    const turn = {
      id: newId(now), q: question, at: now, ...(ref ? { ref } : {}),
      ...(sc.scope === 'filters' && !extra ? { within: sc.filterText } : {}),
      ...(extra || {}),
    };
    keep(cur
      ? { ...cur, at: now, turns: [...cur.turns, turn] }
      : { id: newId(now), title: titleOf(question), at: now, turns: [turn] });
    setText('');
    if (fieldRef.current) fieldRef.current.style.height = '';
    setView('chat');
  }, [keep]);
  const onSubject = React.useCallback((turnId, subject) => {
    const cur = chatRef.current;
    if (!cur || !cur.turns.some((x) => x.id === turnId)) return;
    keep({ ...cur, turns: cur.turns.map((x) => (x.id === turnId ? { ...x, subject } : x)) });
  }, [keep]);
  const onWritten = React.useCallback((turnId, written) => {
    const cur = chatRef.current;
    if (!cur || !cur.turns.some((x) => x.id === turnId)) return;
    keep({ ...cur, turns: cur.turns.map((x) => (x.id === turnId ? { ...x, written } : x)) });
  }, [keep]);

  // A question handed over asks at once, once per hand-over.
  // A seed is asked once (T621): StrictMode runs this effect twice, and
  // `ask` takes a new identity as the catalogue arrives, which asked Home's
  // question two or three times.
  const askedSeed = React.useRef(null);
  React.useEffect(() => {
    if (!seed?.text || askedSeed.current === seed) return;
    askedSeed.current = seed;
    ask(seed.text);
  }, [seed, ask]);

  // The newest question scrolls to the top of the conversation.
  const turnCount = chat?.turns.length || 0;
  React.useEffect(() => {
    if (!turnCount) return;
    requestAnimationFrame(() => {
      const last = listRef.current?.lastElementChild;
      last?.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
    });
  }, [turnCount]);

  // Desktop: the column hangs from the header's foot and the page beside it
  // makes room (`ac-open` on the root, 76-ask-chat.css).
  React.useLayoutEffect(() => {
    // The top of the page it answers about (under the settings line), else
    // the foot of the header.
    const shell = document.querySelector('.explore-shell:not(.ask-picks)')?.getBoundingClientRect();
    const header = document.querySelector('.app-header')?.getBoundingClientRect();
    const top = Math.round(shell?.top > 0 ? shell.top : header?.bottom || 0);
    document.documentElement.style.setProperty('--chat-top', `${top}px`);
    document.documentElement.classList.add('ac-open');
    return () => document.documentElement.classList.remove('ac-open');
  }, []);
  React.useEffect(() => {
    if (isPhone) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && panelRef.current?.contains(document.activeElement)) { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isPhone, onClose]);
  // A phone lands on the heading, so the keyboard does not cover the
  // questions to ask (carta-design: a page opened by pointer focuses its
  // heading); desktop puts the caret in the field.
  useFocusTrap(panelRef, onClose, { initialFocusRef: titleRef, enabled: isPhone });
  React.useEffect(() => { if (!isPhone) fieldRef.current?.focus(); }, [isPhone]);

  const ctx = React.useMemo(() => ({
    t, lang, rows, byId, guided, price, labels, retrieve: RETRIEVE, trip, filteredRows: filters?.rows || null,
    favorites, onToggleFav, onWritten, onSubject, onAsk: (q) => ask(q),
    onPick: (place, month) => ask(place.city, { pick: { id: place.id, month: month || null }, subject: { id: place.id, city: place.city } }),
    onNotYet: (month) => ask(t('askChat.notYet'), { notYet: { month: month || null } }),
    onOpen: (id) => { if (isPhone) onClose(); onOpenPlace(id); },
    onApply: onApply ? (facets, keep) => { if (isPhone) onClose(); onApply(facets, keep); } : null,
    onPlan: onPlanTrip ? (route) => { onClose(); onPlanTrip({ transport: 'public', ...route }); } : null,
  }), [t, lang, rows, byId, guided, price, labels, trip, filters, favorites, onToggleFav, onWritten, onSubject, ask, isPhone, onClose, onOpenPlace, onPlanTrip, onApply]);

  const [moreShown, setMoreShown] = React.useState(false);
  const starts = START.map((k) => t(k));
  const next = new Date();
  next.setMonth(next.getMonth() + 1, 1);
  starts.unshift(t('askChat.start.cheap', { month: labels.month(next.getMonth() + 1) }));
  const hint = useTypedHint(starts.slice(0, 4), !text && !chat, boxRef);

  const submit = (e) => { e.preventDefault(); ask(text); };
  const grow = (el) => { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; };
  const groups = groupChats(chats);
  const remove = (id) => {
    const out = removeChat(loadChats(), id);
    saveChats(out);
    setChats(out);
    if (chat?.id === id) setChat(null);
    clearTimeout(cloud.current.timers.get(id)?.timer);
    cloud.current.timers.delete(id);
    if (cloud.current.on && userId) deleteAskChat(userId, id).catch(cloudFail);
  };

  const panel = (
    <section ref={panelRef} className={`ac${isPhone ? ' is-phone' : ''}`}
      role={isPhone ? 'dialog' : 'complementary'} aria-modal={isPhone || undefined} aria-labelledby="ac-title">
      <header className="ac-head">
        {view === 'history'
          ? <IconButton label={t('askChat.back')} onClick={() => setView('chat')}><ArrowLeftIcon size={20} /></IconButton>
          : <IconButton label={t('askChat.history')} onClick={() => setView('history')}><ClockIcon size={20} /></IconButton>}
        <h2 className="ac-title" id="ac-title" tabIndex={-1} ref={titleRef}>
          <SparkIcon size={18} />
          {view === 'history' ? t('askChat.history') : t('askChat.title')}
        </h2>
        <IconButton label={t('askChat.new')} onClick={() => { setChat(null); setView('chat'); setText(''); fieldRef.current?.focus(); }} disabled={!chat && view === 'chat'}>
          <PencilIcon size={20} />
        </IconButton>
        <IconButton label={t('gs.close')} onClick={onClose}><CloseIcon size={16} /></IconButton>
      </header>

      {view === 'history' ? (
        <div className="ac-body ac-history">
          {!chats.length && <p className="ac-empty-line">{t('askChat.historyEmpty')}</p>}
          {['today', 'week', 'older'].map((g) => groups[g].length > 0 && (
            <section key={g} className="ac-group" aria-labelledby={`ac-g-${g}`}>
              <h3 className="ac-group-h" id={`ac-g-${g}`}>{t(`askChat.${g}`)}</h3>
              <ul>
                {groups[g].map((c) => (
                  <li key={c.id} className={`ac-row${chat?.id === c.id ? ' is-on' : ''}`}>
                    <Button variant="quiet" className="ac-row-open" aria-current={chat?.id === c.id || undefined}
                      onClick={() => { setChat(c); setView('chat'); }}>
                      {c.title}
                    </Button>
                    <IconButton label={t('askChat.delete', { title: c.title })} className="ac-row-del" onClick={() => remove(c.id)}>
                      <TrashIcon size={16} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="ac-body" ref={boxRef} onScroll={markEdges}>
          {!chat ? (
            <div className="ac-hello">
              <h3 className="ac-hello-h">{t('askChat.hello')}</h3>
              {trip.originName && <YoureIn t={t} place={trip.originName} />}
              <ul className="ac-starts">
                {starts.slice(0, moreShown ? starts.length : SHOWN).map((q) => (
                  <li key={q}>
                    <Button variant="quiet" className="ac-start" iconStart={<CornerArrow />} onClick={() => ask(q)}>
                      {q}
                    </Button>
                  </li>
                ))}
              </ul>
              {starts.length > SHOWN && (
                <Button variant="quiet" size="sm" className="ac-more" onClick={() => setMoreShown((v) => !v)}>
                  {moreShown ? t('askChat.less') : t('askChat.more')}
                </Button>
              )}
            </div>
          ) : (
            <ol className="ac-turns" ref={listRef}>
              {chat.turns.map((turn, i) => (
                <AskTurn key={turn.id} turn={turn} vocab={vocab} ctx={ctx} latest={i === chat.turns.length - 1} />
              ))}
            </ol>
          )}
        </div>
      )}

      <form className="ac-compose" onSubmit={submit}>
        {filterLabels.length > 0 && view === 'chat' && (
          <div className="ac-scope">
            <p className="ac-scope-label" id="ac-scope-label">{t('askChat.scope.label', { filters: filterText })}</p>
            <Segmented size="sm" label={t('askChat.scope.aria')} value={scope} onChange={setScope}
              options={[{ value: 'all', label: t('askChat.scope.all') }, { value: 'filters', label: t('askChat.scope.keep') }]} />
          </div>
        )}
        <div className="ac-field">
          <span className="ac-field-box">
            {hint && <span className="ac-hint" aria-hidden="true">{hint}{!focused && <span className="ac-caret" />}</span>}
            <textarea
              ref={fieldRef}
              className="ac-input"
              rows={1}
              value={text}
              aria-label={t('askChat.inputLabel')}
              onChange={(e) => { setText(e.target.value); grow(e.target); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e); }}
              enterKeyHint="send"
              maxLength={300}
            />
          </span>
          <Button type="submit" variant={text.trim() ? 'primary' : 'secondary'} className="ac-send"
            disabled={!text.trim()} aria-label={t('askChat.send')} iconStart={<SendIcon />} />
        </div>
        <p className="ac-disclaimer">{t('askChat.disclaimer')}</p>
      </form>
    </section>
  );
  return createPortal(panel, document.body);
}
