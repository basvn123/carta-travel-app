import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip, IconButton } from '../../components/ui/index.js';
import { ArrowRightIcon, CheckIcon, CloseIcon, CopyIcon, PlusIcon, RedoIcon, SparkIcon } from '../../components/Icons.jsx';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';

/**
 * The Carta bot as a chat (T899, the owner's plan days board 2026-10-30),
 * in place of the form it was (AiDayPlanModal). It sits beside the day it
 * plans: a column left of the day from 1280 px, over the map from 1024 px,
 * a full-screen sheet on a phone (Ask Carta's own pattern on Explore).
 *
 * Empty, it greets with the day's facts and three asks that fit this day;
 * they leave once anything is written (ChatGPT, Gemini and Claude keep
 * suggestions to the empty state). Each answer is one sentence and the day
 * as a card, every stop with its time, and one action: Add to Day N. Copy
 * and Try again sit under it, and quick changes only under the newest. No
 * avatar, no persona, no fake typing: the dots show while the planner
 * (Gemini, the plan-day Edge Function) works.
 *
 *   city, dayNumber, dateLabel, dateISO, stopsCount, groupSize
 *   signedIn, onSignIn          the bot needs a free account
 *   preset                      the trip's rhythm (tripSettings dayAiPreset)
 *   onRun(answers)              { ok, plan } | { ok:false, code }
 *   onApply(plan)               the plan onto the day
 *   onFallback(answers)         Carta's built-in planner
 *   onClose, onOpenPass, entitlement
 *   docked                      beside the day (no focus trap) or a sheet
 */
const RETRYABLE = new Set(['ai_busy', 'ai_timeout', 'ai_error', 'network', 'ai_bad_output']);
const FAIL_KEY = {
  auth: 'ai.signIn', no_auth_config: 'ai.signIn', user_cap: 'ai.quotaUser', global_cap: 'ai.quotaGlobal',
  no_ai: 'ai.unavailable', too_few: 'ai.tooFew',
};
const NUDGES = ['ai.nudgeMore', 'ai.nudgeFewerSteps', 'ai.nudgeFood', 'ai.nudgeIndoor'];

export function DayBotChat({
  city, dayNumber, dateLabel = '', dateISO = '', stopsCount = 0, groupSize = 2,
  signedIn, onSignIn = null, preset = null, onRun, onApply, onFallback, onClose,
  onOpenPass = null, entitlement = null, docked = false,
}) {
  const { t } = useI18n();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(null);
  const [applied, setApplied] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  useFocusTrap(panelRef, onClose, { initialFocusRef: inputRef, enabled: !docked });

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);

  const base = {
    vibe: preset?.vibe || 'mix',
    pace: preset?.pace || 'balanced',
    avoidHills: !!preset?.avoidHills,
    date: dateISO,
    groupSize,
    wantEvents: !!preset?.wantEvents,
  };
  const send = async (ask) => {
    const said = ask.trim();
    if (!said || busy) return;
    setText('');
    setMsgs((m) => [...m, { role: 'user', text: said }]);
    setBusy(true);
    // The first ask plans the day; every later one changes the last plan.
    const answers = plan
      ? { ...base, freeText: preset?.freeText || '', refine: said, prevStops: plan.stops.map((s) => s.name), refineToken: plan.refineToken || null }
      : { ...base, freeText: [preset?.freeText, said].filter(Boolean).join(' ') };
    let res;
    try { res = await onRun(answers); } catch { res = { ok: false, code: 'network' }; }
    setBusy(false);
    entitlement?.refresh?.();
    if (res.ok) {
      setPlan(res.plan);
      setMsgs((m) => [...m, { role: 'bot', plan: res.plan, id: Date.now() }]);
    } else {
      setMsgs((m) => [...m, { role: 'bot', fail: res.code || 'ai_error', ask: said, answers }]);
    }
  };
  // "Fill this day" and Carta plans every day arrive as a whole ask: the
  // chat starts on it at once, said as the traveller's own first line.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !preset?.autoRun || !signedIn) return;
    autoRan.current = true;
    send(t('bot.s.plan'));
  }, [preset, signedIn]); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot, guarded by autoRan
  const add = (p, id) => { onApply(p); setApplied(id); };
  const copy = (p) => {
    const lines = [`${t('bot.sub', { n: dayNumber, city })}`, ...p.stops.map((s) => `${s.arrive || ''} ${s.name}`.trim())];
    navigator.clipboard?.writeText(lines.join('\n')).catch(() => {});
  };

  const asks = stopsCount
    ? ['bot.s.dinner', 'bot.s.slower', 'bot.s.rain']
    : ['bot.s.plan', 'bot.s.relaxed', 'bot.s.view'];
  const last = msgs.length - 1;

  return (
    <aside
      ref={panelRef}
      className={`dbot${docked ? ' is-docked' : ' is-sheet'}`}
      aria-label={t('bot.title')}
      role={docked ? 'complementary' : 'dialog'}
      aria-modal={docked ? undefined : 'true'}
    >
      <div className="dbot-head">
        <span className="dbot-mark" aria-hidden="true"><SparkIcon size={17} /></span>
        <span className="dbot-name">
          <b>{t('bot.title')}</b>
          <small>{t('bot.sub', { n: dayNumber, city })}</small>
        </span>
        <IconButton label={t('bot.close')} onClick={onClose}><CloseIcon size={16} /></IconButton>
      </div>

      <div className="dbot-msgs" ref={listRef} aria-live="polite">
        {!msgs.length && (
          <div className="dbot-hello">
            <h2 className="dbot-hello-h">{t('bot.hello', { n: dayNumber, city })}</h2>
            <p className="dbot-hello-p">
              {[dateLabel, stopsCount ? t('bot.factsPlanned', { n: stopsCount }) : t('bot.factsEmpty')].filter(Boolean).join('. ')}
            </p>
            {signedIn && (
              <div className="dbot-asks">
                {asks.map((k) => (
                  <Button key={k} variant="secondary" className="dbot-ask" iconEnd={<ArrowRightIcon size={15} />} onClick={() => send(t(k))}>
                    {t(k)}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
        {msgs.map((m, i) => {
          if (m.role === 'user') return <p key={i} className="dbot-user">{m.text}</p>;
          if (m.fail) {
            return (
              <div key={i} className="dbot-bot">
                <p>{t(FAIL_KEY[m.fail] || 'ai.error')}</p>
                <div className="dbot-acts">
                  {m.fail === 'user_cap' && onOpenPass && <Button size="sm" variant="primary" onClick={() => onOpenPass('plans')}>{t('pass.seePasses')}</Button>}
                  {RETRYABLE.has(m.fail) && <Button size="sm" variant="secondary" onClick={() => send(m.ask)}>{t('ai.retry')}</Button>}
                  <Button size="sm" variant="secondary" onClick={() => onFallback(m.answers)}>{t('ai.fallback')}</Button>
                </div>
              </div>
            );
          }
          const p = m.plan;
          const done = applied === m.id;
          return (
            <div key={i} className="dbot-bot">
              {p.summary && <p>{p.summary}</p>}
              <div className="dbot-card">
                <div className="dbot-card-h">
                  <b>{t('bot.card', { n: dayNumber })}</b>
                  <span>{t('bot.cardStops', { n: p.stops.length })}</span>
                </div>
                <ol className="dbot-rows">
                  {p.stops.map((s, k) => (
                    <li key={k} className="dbot-row">
                      <time>{s.arrive || ''}</time>
                      <span className="dbot-row-txt">
                        <b>{s.name}</b>
                        {s.why && <small>{s.why}</small>}
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="dbot-card-f">
                  {done ? (
                    <Chip kind="status" tone="positive" icon={<CheckIcon size={12} />}>{t('bot.added', { n: dayNumber })}</Chip>
                  ) : (
                    <>
                      <Button size="sm" variant="primary" iconStart={<PlusIcon size={15} />} onClick={() => add(p, m.id)}>{t('bot.add', { n: dayNumber })}</Button>
                      <Button size="sm" variant="secondary" onClick={() => inputRef.current?.focus()}>{t('bot.change')}</Button>
                    </>
                  )}
                </div>
              </div>
              <div className="dbot-tools">
                <IconButton label={t('bot.copy')} onClick={() => copy(p)}><CopyIcon size={15} /></IconButton>
                {i === last && <IconButton label={t('ai.retry')} onClick={() => send(msgs[i - 1]?.text || t('bot.s.plan'))}><RedoIcon size={15} /></IconButton>}
              </div>
              {i === last && !busy && (
                <div className="dbot-nudges">
                  {NUDGES.map((k) => <Button key={k} size="sm" variant="secondary" className="dbot-nudge" onClick={() => send(t(k))}>{t(k)}</Button>)}
                </div>
              )}
            </div>
          );
        })}
        {busy && (
          <div className="dbot-bot" role="status">
            <span className="dbot-dots" aria-hidden="true"><i /><i /><i /></span>
            <span className="sr-only">{t('bot.thinking', { n: dayNumber })}</span>
          </div>
        )}
      </div>

      <div className="dbot-comp">
        {signedIn ? (
          <>
            <form className="dbot-form" onSubmit={(e) => { e.preventDefault(); send(text); }}>
              <label className="sr-only" htmlFor="dbot-input">{t('bot.placeholder', { n: dayNumber })}</label>
              <textarea
                id="dbot-input"
                ref={inputRef}
                className="dbot-input"
                rows={1}
                maxLength={280}
                value={text}
                placeholder={t('bot.placeholder', { n: dayNumber })}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }}
              />
              <IconButton type="submit" tone="surface" className="dbot-send" label={t('bot.send')} disabled={!text.trim() || busy}>
                <ArrowRightIcon size={16} />
              </IconButton>
            </form>
            <p className="dbot-foot">{t('bot.foot')}</p>
          </>
        ) : (
          <div className="dbot-out">
            <p>{t('bot.signedOut')}</p>
            <div className="dbot-acts">
              {onSignIn && <Button size="sm" variant="primary" onClick={onSignIn}>{t('bot.signIn')}</Button>}
              <Button size="sm" variant="secondary" onClick={() => onFallback({ ...base, freeText: preset?.freeText || '' })}>{t('ai.fallback')}</Button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
