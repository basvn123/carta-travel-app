import React from 'react';
import { SheetShell } from './SheetShell.jsx';
import { PlaceOverview } from './PlaceOverview.jsx';
import { GuidedSlots } from './GuidedSearch.jsx';
import { useAsk, EXAMPLE_KEYS } from './useAsk.js';
import { Button, Field, IconButton, Segmented } from '../components/ui/index.js';
import { Stepper } from '../components/FilterControls.jsx';
import { CloseIcon, SearchIcon, SparkIcon, ChevronDownIcon } from '../components/Icons.jsx';
import { parseBudget, DAYS_MIN, DAYS_MAX, MODES } from '../lib/budgetSearch.js';
import { MAX_PARTY } from '../lib/tripTotal.js';
import { formatMoney } from '../lib/money.js';
import { makeRetriever } from '../lib/ask/retrieve.js';
import '../styles/75-ask.css';

// One hybrid retriever for the app (T554): BM25 in the browser, /api/ask dense.
const RETRIEVE = makeRetriever();
// Answer on this device (T557) is off for travellers since T564: on a
// laptop's integrated GPU Qwen 2.5 1.5B took 44 s and its answer failed the
// check, while the server model answers in about 1.3 s. VITE_ASK_ON_DEVICE=1
// turns the offer back on for a build or a dev server.
const ON_DEVICE = import.meta.env?.VITE_ASK_ON_DEVICE === '1';

/**
 * Ask Carta, the whole panel (T558; loaded on first use by AskSearch.jsx): one box where a traveller types any question ("1,500 for
 * two, 5 days in November, by train, somewhere with good food") and gets a
 * full answer. It replaces the guided search trigger and the budget card on
 * Explore and keeps both inside it: the five slots and the trip's party,
 * days, money and mode are the answer's Refine, so nothing the two did is
 * lost.
 *
 * The answer, top to bottom: the question read back with its count, the
 * written answer (an open model, checked sentence by sentence against
 * Carta's own figures; its absence is said in one line), the places as
 * Explore's own rows, the month or comparison table, the honesty lines,
 * Refine, and one primary that hands the question to Explore (or to Plan).
 *
 * props
 *   mode         'explore' (default) or 'plan' (the Plan start page)
 *   rows         Explore's catalogue rows, priced at the traveller's Lifestyle
 *   facets       Explore's facets now (for the empty state's slots)
 *   onApply      (delta, replace) Explore's applyGuided
 *   onOpenPlace  (id) open a place
 *   onPlanTrip   ({stops: [{dest, nights}]}) hand a route to the trip planner
 *   price        { lifestyle, stayTier, flights } for total-budget answers
 */
export function AskSearchFull({
  t, lang, guided, rows, countries, labels, facets = {}, nearRow = null, budgetSteps = [40, 60, 80, 100, 130],
  onApply = null, onOpenPlace, onPlanTrip = null, price, mode = 'explore', inHeader = false,
  requestOpen = false, onOpenRequested = null, askSeed = null, retrieve = RETRIEVE, onDevice: deviceProp = undefined, favorites = null, onToggleFav = null,
}) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (!requestOpen) return;
    setOpen(true);
    onOpenRequested?.();
  }, [requestOpen, onOpenRequested]);
  const [text, setText] = React.useState('');
  const triggerRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const answerRef = React.useRef(null);
  // The on-device writer (T557): a new state of it asks for the written
  // answer again, so switching it on rewrites the answer on screen.
  const [deviceTick, setDeviceTick] = React.useState(0);
  // Imported only once the panel opens (2 KB, row T557-c): WebLLM itself
  // loads later still, and only after the traveller asks for it.
  const [deviceMod, setDeviceMod] = React.useState(null);
  React.useEffect(() => {
    if (!ON_DEVICE || !open || deviceMod || deviceProp !== undefined) return;
    import('../lib/ask/onDevice.js').then((m) => setDeviceMod(m)).catch(() => {});
  }, [open, deviceMod, deviceProp]);
  const onDevice = deviceProp !== undefined ? deviceProp : deviceMod;
  const askState = useAsk({ open, t, lang, guided, rows, countries, labels, price, retrieve, onDevice, deviceTick });
  const { ready, intent, answer, facts, written } = askState;

  // A question asked before the vocabulary is in waits for it.
  const [pending, setPending] = React.useState(null);
  const submit = (e, q = text) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setText(q);
    if (!ready) { setPending(q); return; }
    if (askState.ask(q)) requestAnimationFrame(() => answerRef.current?.focus({ preventScroll: false }));
  };
  // A question handed over from Home (T566): asked once per hand-over; it
  // waits for the vocabulary like any question asked too early.
  React.useEffect(() => {
    if (!askSeed?.text) return;
    setOpen(true);
    setText(askSeed.text);
    setPending(askSeed.text);
  }, [askSeed]);
  React.useEffect(() => {
    if (!ready || !pending) return;
    const q = pending;
    setPending(null);
    if (askState.ask(q)) requestAnimationFrame(() => answerRef.current?.focus({ preventScroll: false }));
  }, [ready, pending, askState]);
  const clearAll = () => { setText(''); askState.clear(); inputRef.current?.focus(); };

  // Explore's facets hold everything but `warm`, which only Ask reads.
  const exploreFacets = () => {
    const f = { ...intent.facets };
    delete f.warm;
    return f;
  };
  const showAll = () => { onApply?.(exploreFacets(), true); setOpen(false); };
  const planIt = () => {
    const stops = (facts.plan ? facts.plan.order.map((id) => ({ dest: id, nights: facts.plan.nights[id] }))
      : facts.picks.slice(0, 1).map((p) => ({ dest: p.id, nights: Math.max(1, (intent.budget.days || 5) - 1) })))
      .filter((s) => s.nights > 0);
    if (!stops.length) return;
    setOpen(false);
    onPlanTrip?.({ stops, transport: intent.budget.mode === 'car' ? 'car' : 'public' });
  };
  const open1 = (id) => { setOpen(false); onOpenPlace(id); };

  const placeholder = mode === 'plan' ? t('ask.placeholderPlan') : t('ask.placeholder');
  const summary = intent ? askState.question : '';

  // What the one primary does, by the kind of question.
  let primary = null;
  if (answer && facts?.picks?.length) {
    if (mode === 'plan' || intent.type === 'plan') primary = { label: t('ask.planThis'), run: planIt };
    else if (intent.type === 'when' || intent.type === 'about') {
      const p = facts.picks[0];
      primary = { label: t('ask.openPlace', { place: p.dest.city }), run: () => open1(p.id) };
    } else if (onApply && (intent.type === 'find' || intent.type === 'near')) primary = { label: t('ask.showAll', { count: facts.count }), run: showAll };
    else primary = { label: t('ask.planThis'), run: planIt };
  }
  const secondaryPlan = onPlanTrip && primary && primary.run !== planIt && intent?.type !== 'when' && intent?.type !== 'about';

  return (
    <div className={`gsearch ask${inHeader ? ' is-header' : ''}${summary ? ' has-value' : ''}${mode === 'plan' ? ' is-plan' : ''}`}>
      <Button ref={triggerRef} variant="secondary" className="gsearch-trigger"
        iconStart={<SparkIcon size={18} />}
        onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <span className={summary ? 'gsearch-summary' : 'gsearch-placeholder'}>{summary || placeholder}</span>
      </Button>
      {summary && (
        <IconButton label={t('ask.clearAria')} className="gsearch-clear" onClick={() => { clearAll(); onApply?.({}, true); }}>
          <CloseIcon size={16} />
        </IconButton>
      )}
      {open && (
        <SheetShell title={t('ask.title')} onClose={() => setOpen(false)} anchorRef={triggerRef}
          width={760} className="gsearch-sheet ask-sheet" labelId="ask-title" initialFocusRef={inputRef}
          closeLabel={t('gs.close')}>
          <div className="gs ask-body">
            <form className="gs-field ask-field" role="search" onSubmit={submit}>
              <SearchIcon size={20} className="gs-field-icon" />
              <input
                ref={inputRef}
                className="gs-input"
                type="text"
                aria-label={t('ask.inputLabel')}
                placeholder={placeholder}
                value={text}
                maxLength={200}
                onChange={(e) => setText(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
              />
              {text && (
                <IconButton label={t('gs.clearText')} className="gs-field-clear" onClick={clearAll}>
                  <CloseIcon size={16} />
                </IconButton>
              )}
              <Button type="submit" variant="secondary" size="sm" className="ask-go" disabled={!text.trim()} loading={!!pending}>
                {t('ask.go')}
              </Button>
            </form>
            {!ready && <p className="gs-hint" role="status">{t('gs.loading')}</p>}

            {!answer ? (
              <AskStart t={t} lang={lang} guided={guided} countries={countries} labels={labels} facets={facets}
                budgetSteps={budgetSteps} onApply={onApply} nearRow={nearRow} rows={rows} mode={mode}
                onExample={(q) => submit(null, q)} />
            ) : (
              <AskAnswer t={t} lang={lang} answer={answer} facts={facts} intent={intent} written={written}
                answerRef={answerRef} onOpen={open1} favorites={favorites} onToggleFav={onToggleFav} onMore={askState.more}
                device={onDevice ? <DeviceSwitch t={t} lang={lang} device={onDevice} onChange={() => setDeviceTick((n) => n + 1)} /> : null}>
                <AskRefine t={t} lang={lang} guided={guided} countries={countries} labels={labels} intent={intent}
                  budgetSteps={budgetSteps} rows={rows} onRefine={askState.refine} onBudget={askState.setBudget} />
              </AskAnswer>
            )}

            <div className="gs-foot">
              <div className={`gs-foot-actions${secondaryPlan && primary ? ' has-three' : ''}`}>
                <Button variant="quiet" className="ask-clear" disabled={!answer && !text} onClick={clearAll}>{t('gs.clear')}</Button>
                {secondaryPlan && <Button variant="secondary" onClick={planIt}>{t('ask.planThis')}</Button>}
                {primary
                  ? <Button variant="primary" onClick={primary.run}>{primary.label}</Button>
                  : mode !== 'plan' && <Button variant="primary" onClick={() => setOpen(false)}>{t('filter.showPlaces')}</Button>}
              </div>
            </div>
          </div>
        </SheetShell>
      )}
    </div>
  );
}

/** Before a question: the suggested questions, then the five slots as before. */
function AskStart({ t, lang, guided, countries, labels, facets, budgetSteps, onApply, nearRow, rows, mode, onExample }) {
  const nearName = (id) => (nearRow?.id === id ? nearRow.city : rows?.find((p) => p.id === id)?.city || id);
  return (
    <>
      <section className="gs-try ask-try" aria-labelledby="ask-h-try">
        <h3 className="gs-h" id="ask-h-try">{t('ask.tryOne')}</h3>
        <div className="ask-try-list">
          {EXAMPLE_KEYS.filter((k) => mode !== 'plan' || k === 'ask.ex.plan' || k === 'ask.ex.budget' || k === 'ask.ex.compare').map((k) => (
            <Button key={k} variant="secondary" className="ask-try-item"
              iconStart={<SparkIcon size={16} />} onClick={() => onExample(t(k))}>
              {t(k)}
            </Button>
          ))}
        </div>
      </section>
      {onApply && mode !== 'plan' && (
        <section className="ask-build" aria-labelledby="ask-h-build">
          <h3 className="gs-h" id="ask-h-build">{t('ask.orBuild')}</h3>
          <GuidedSlots t={t} lang={lang} guided={guided} countries={countries} facets={facets}
            labels={labels} budgetSteps={budgetSteps} onApply={onApply} nearName={nearName} idPrefix="ask-start" />
        </section>
      )}
    </>
  );
}

/**
 * Answer on this device (T557): offered only where WebGPU can run the model,
 * never downloaded without this click; once installed it loads from the
 * cache on the next visit and can be removed again.
 */
function DeviceSwitch({ t, lang, device, onChange }) {
  const [st, setSt] = React.useState({ kind: 'checking' });
  React.useEffect(() => {
    let live = true;
    (async () => {
      if (!(await device.isSupported())) { if (live) setSt({ kind: 'none' }); return; }
      if (device.isReady()) { if (live) setSt({ kind: 'on' }); return; }
      if (device.isOptedIn() && (await device.isInstalled())) {
        if (live) setSt({ kind: 'loading' });
        const ok = await device.ensureLoaded().catch(() => false);
        if (!live) return;
        setSt({ kind: ok ? 'on' : 'off' });
        if (ok) onChange();
        return;
      }
      if (live) setSt({ kind: 'off' });
    })().catch(() => { if (live) setSt({ kind: 'none' }); });
    return () => { live = false; };
    // Checked once per panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pct = (v) => new Intl.NumberFormat(lang, { style: 'percent' }).format(v);
  const install = async () => {
    setSt({ kind: 'installing', p: 0 });
    try {
      device.setOptIn(true);
      await device.install({ onProgress: ({ progress }) => setSt({ kind: 'installing', p: progress || 0 }) });
      setSt({ kind: 'on' });
      onChange();
    } catch {
      setSt({ kind: 'failed' });
    }
  };
  const remove = async () => { await device.remove().catch(() => {}); setSt({ kind: 'off' }); onChange(); };
  if (st.kind === 'none' || st.kind === 'checking') return null;
  return (
    <div className="ask-device">
      {st.kind === 'off' && (
        <>
          <Button variant="quiet" size="sm" onClick={install}>{t('ask.device.use')}</Button>
          <p className="ask-device-meta">{t('ask.device.size', { mb: device.ON_DEVICE_MODEL.sizeMb })}</p>
        </>
      )}
      {(st.kind === 'installing' || st.kind === 'loading') && (
        <p className="ask-device-meta" role="status">{t('ask.device.progress', { pct: pct(st.p || 0) })}</p>
      )}
      {st.kind === 'on' && <Button variant="quiet" size="sm" onClick={remove}>{t('ask.device.remove')}</Button>}
      {st.kind === 'failed' && <p className="ask-device-meta">{t('ask.device.failed')}</p>}
    </div>
  );
}

/** The notes a sentence rests on, as one small figure after it ("2, 3, 7"). */
function Cite({ n }) {
  return <sup className="ask-cite">{n}</sup>;
}

function WrittenAnswer({ t, written, device }) {
  const { state, sentences } = written;
  // One per answer, and a chat (T570) shows many answers on one page.
  const hId = React.useId();
  if (state === 'idle') return null;
  const line = {
    off: 'ask.written.off', cap: 'ask.written.cap', error: 'ask.written.error', withdrawn: 'ask.written.withdrawn',
  }[state];
  const quiet = !!line && !sentences.length;
  return (
    <section className={`ask-written${quiet ? ' is-quiet' : ''}`} aria-labelledby={hId} aria-busy={state === 'writing'}>
      <h3 className="ask-written-h" id={hId}>
        <SparkIcon size={16} className="ask-written-mark" />
        {t('ask.written.title')}
      </h3>
      {sentences.length > 0 && (
        <p className="ask-written-text">
          {sentences.map((s, i) => (
            <span key={i} className="ask-sentence">
              {s.text}{s.cites.length > 0 && <Cite n={s.cites.join(', ')} />}{' '}
            </span>
          ))}
        </p>
      )}
      {state === 'writing' && !sentences.length && <span className="ask-written-wait" role="status">{t('ask.written.writing')}</span>}
      {quiet && <p className="ask-written-off"><SparkIcon size={16} className="ask-written-mark" />{t(line)}</p>}
      {(state === 'done' || sentences.length > 0) && (
        <p className="ask-written-meta">{t(written.backend === 'device' ? 'ask.device.meta' : 'ask.written.meta')}</p>
      )}
      {device}
    </section>
  );
}

/** The answer to one question; also each turn of the chat (T570), which
 *  puts its trip card under the written answer through `afterWritten`. */
export function AskAnswer({ t, answer, facts, intent, written, answerRef, onOpen, favorites, onToggleFav, onMore, device, afterWritten = null, children }) {
  return (
    <div className="ask-answer">
      <h3 className="ask-lead" tabIndex={-1} ref={answerRef}>{answer.lead}</h3>
      {answer.note && <p className="ask-note">{answer.note}</p>}
      <WrittenAnswer t={t} written={written} device={device} />
      {afterWritten}
      {answer.picks.length > 0 && (
        <ol className="ask-picks explore-shell" aria-label={t('ask.picksLabel')}>
          {answer.picks.map((p) => {
            const pick = facts.picks.find((x) => x.id === p.id);
            if (!pick) return null;
            return (
              <li key={p.id} className="ask-pick">
                <PlaceOverview p={pick.dest} t={t} reason={p.why.join(', ')} onOpen={() => onOpen(p.id)}
                  fav={!!favorites?.has?.(p.id)} onToggleFav={onToggleFav} />
                {p.nights != null && <p className="ask-pick-meta">{t(p.nights === 1 ? 'ask.night' : 'ask.nights', { n: p.nights })}</p>}
                {p.price && <Receipt t={t} price={p.price} />}
              </li>
            );
          })}
        </ol>
      )}
      {facts.count > answer.picks.length && (intent.type === 'budget' || intent.type === 'find' || intent.type === 'near') && (
        <Button variant="quiet" className="ask-more" onClick={onMore}>{t('ask.more')}</Button>
      )}
      {answer.table && <AskTable t={t} table={answer.table} type={intent.type} />}
      {answer.notes.length > 0 && (
        <ul className="ask-notes">{answer.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      )}
      {children}
    </div>
  );
}

function Receipt({ t, price }) {
  return (
    <details className="ask-receipt">
      <summary className="ask-receipt-sum">
        <span>{t('ask.totalFor')}</span>
        <span className="ask-receipt-total">{price.total}</span>
        <ChevronDownIcon size={16} className="ask-receipt-chev" />
      </summary>
      <dl className="ask-receipt-lines">
        {price.lines.map((l) => (
          <div key={l.label} className="ask-receipt-line"><dt>{l.label}</dt><dd>{l.eur}</dd></div>
        ))}
        <div className="ask-receipt-line is-sum"><dt>{t('ask.total')}</dt><dd>{price.total}</dd></div>
      </dl>
      {price.unpriced.length > 0 && (
        <div className="ask-receipt-out">
          <p className="ask-receipt-out-h">{t('ask.notInTotal')}</p>
          <ul>{price.unpriced.map((u) => <li key={u}>{u}<span>{t('ask.notPriced')}</span></li>)}</ul>
        </div>
      )}
    </details>
  );
}

function AskTable({ t, table, type }) {
  return (
    <div className={`ask-table-wrap is-${type}`}>
      <table className="ask-table">
        {table.head && (
          <thead><tr>{table.head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
        )}
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              <th scope="row">{r[0]}</th>
              {r.slice(1).map((c, j) => <td key={j}>{c || (type === 'when' ? '' : t('ask.none'))}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Refine: the five slots on the question's facets, and the trip around it. */
function AskRefine({ t, lang, guided, countries, labels, intent, budgetSteps, rows, onRefine, onBudget }) {
  const nearName = (id) => rows?.find((p) => p.id === id)?.city || id;
  const tripish = intent.type === 'budget' || intent.type === 'plan' || intent.type === 'compare';
  const b = intent.budget;
  const [amount, setAmount] = React.useState(b.total ? String(b.total) : '');
  React.useEffect(() => { setAmount(b.total ? String(b.total) : ''); }, [b.total]);
  const slotFacets = { ...intent.facets };
  return (
    <details className="ask-refine">
      <summary className="ask-refine-sum">
        <span>{t('ask.refine')}</span>
        <ChevronDownIcon size={16} className="ask-receipt-chev" />
      </summary>
      {tripish && (
        <div className="ask-trip">
          {intent.type === 'budget' && (
            <Field className="ask-amount" label={t('budget.amount')} inputMode="numeric" autoComplete="off"
              placeholder={formatMoney(1500)} value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => { const v = parseBudget(amount); if (v) onBudget({ total: v }); }} />
          )}
          <div className="ask-steps">
            <div className="bgs-step">
              <span className="bgs-step-name">{t('budget.adults')}</span>
              <Stepper value={b.adults || 2} min={1} max={MAX_PARTY - (b.children || 0)}
                onChange={(n) => onBudget({ adults: n })} ariaLabel={t('budget.adults')}
                decLabel={t('budget.adultsLess')} incLabel={t('budget.adultsMore')} />
            </div>
            <div className="bgs-step">
              <span className="bgs-step-name">{t('budget.children')}</span>
              <Stepper value={b.children || 0} min={0} max={MAX_PARTY - (b.adults || 2)}
                onChange={(n) => onBudget({ children: n })} ariaLabel={t('budget.children')}
                decLabel={t('budget.childrenLess')} incLabel={t('budget.childrenMore')} />
            </div>
            <div className="bgs-step">
              <span className="bgs-step-name">{t('budget.daysN', { n: b.days || 5 })}</span>
              <Stepper value={b.days || 5} min={DAYS_MIN} max={DAYS_MAX}
                onChange={(n) => onBudget({ days: n })} ariaLabel={t('budget.howLong')}
                decLabel={t('budget.daysLess')} incLabel={t('budget.daysMore')} />
            </div>
          </div>
          {intent.type === 'budget' && (
            <Segmented label={t('budget.fromHow')} value={b.mode || 'public'} block
              onChange={(v) => onBudget({ mode: v })}
              options={MODES.map((m) => ({ value: m, label: t(`budget.mode.${m}`) }))} />
          )}
        </div>
      )}
      <GuidedSlots t={t} lang={lang} guided={guided} countries={countries} facets={slotFacets}
        labels={labels} budgetSteps={budgetSteps} onApply={onRefine} nearName={nearName} idPrefix="ask-refine" />
    </details>
  );
}

export default AskSearchFull;
