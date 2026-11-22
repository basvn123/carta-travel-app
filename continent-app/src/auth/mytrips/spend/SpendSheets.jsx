/*
 * The Uitgaven page's sheets (G15), one shell and nine bodies: add,
 * confirm (Klopt dit?), detail, all, nudge (Por), listen, which, scan and
 * receipt. The shell rises once on the house sheet curve and stays mounted
 * while its body changes (add to confirm, all to detail), so only the part
 * that changed moves. It closes on the scrim, Escape or a swipe down from
 * its top, after the same curve back down.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable } from '../../../components/ui/Pressable.jsx';
import { useI18n } from '../../../i18n/index.jsx';
import { useFocusTrap } from '../../../hooks/useFocusTrap.js';
import { prefersReducedMotion } from '../../../lib/motion.js';
import { CURRENCIES, EUR_RATES } from '../../../lib/currency.js';
import { DAY_CATS, ME, splitEqual, splitFromAmounts, makeSpend } from '../../../lib/spend/model.js';
import { Face, SpendRow, eur, formatIn, personName } from './parts.jsx';
import {
  CAT_GLYPH, CamGlyph, CheckGlyph, ChatGlyph, CopyGlyph, DelGlyph, LinkGlyph, LockGlyph, MicGlyph,
  PhotoGlyph, ShareGlyph, SmsGlyph,
} from './icons.jsx';

const SHEET_MS = 420;

/**
 * The sheet shell. `kind` may change while it is open; the shell itself does
 * not re-mount, so the rise plays once. `onClose` runs after the way down.
 */
export function Sheet({ kind, dark = false, label, onClose, closeRef, children }) {
  const panelRef = useRef(null);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef(0);
  const drag = useRef({ id: null, y0: 0, dy: 0 });
  const close = React.useCallback(() => {
    if (leaving) return;
    if (prefersReducedMotion()) { onClose(); return; }
    setLeaving(true);
    timer.current = setTimeout(onClose, SHEET_MS);
  }, [leaving, onClose]);
  if (closeRef) closeRef.current = close;
  useEffect(() => () => clearTimeout(timer.current), []);
  useFocusTrap(panelRef, close);
  // A new body starts at its top.
  useEffect(() => { if (panelRef.current) panelRef.current.scrollTop = 0; }, [kind]);

  // Swipe down from the top of the sheet (the grip or when scrolled to the top).
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse') return;
    if (panelRef.current && panelRef.current.scrollTop > 0 && !e.target.closest('.sp-grip')) return;
    if (e.target.closest('input, textarea, .sp-keys, .sp-chips')) return;
    drag.current = { id: e.pointerId, y0: e.clientY, dy: 0 };
  };
  const onPointerMove = (e) => {
    if (drag.current.id !== e.pointerId || !panelRef.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y0);
    drag.current.dy = dy;
    if (dy > 4) {
      panelRef.current.style.transition = 'none';
      panelRef.current.style.transform = `translateY(${dy}px)`;
    }
  };
  const onPointerUp = (e) => {
    if (drag.current.id !== e.pointerId || !panelRef.current) return;
    const { dy } = drag.current;
    drag.current.id = null;
    const el = panelRef.current;
    el.style.transition = '';
    el.style.transform = '';
    if (dy > Math.min(140, el.offsetHeight * 0.3)) close();
  };

  return (
    <div className={`sp-scrim${leaving ? ' is-leaving' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={panelRef} className={`sp-sheet${dark ? ' is-dark' : ''}${leaving ? ' is-leaving' : ''}`} role="dialog" aria-modal="true"
        aria-label={label} data-kind={kind}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <span className="sp-grip" aria-hidden="true" />
        <div className="sp-sheet-body" key={kind}>{children}</div>
      </div>
    </div>
  );
}

/* ───────────── Add ───────────── */

const decimalSep = (lang) => (lang === 'en' ? '.' : ',');
export const draftAmount = (d) => {
  const n = Number(String(d?.amount || '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
// The stored rate of a spend being edited while its currency is unchanged;
// else today's static rate for the chosen currency.
const draftRate = (d) => (d?.rate > 0 && d.rateCur === d.currency ? d.rate : EUR_RATES[d?.currency] ?? 1);

/** The split the draft would save, in euro cents ({} when it does not add up). */
export function draftSplit(d, people) {
  const amount = draftAmount(d);
  const cents = Math.round(amount * draftRate(d) * 100);
  if (cents <= 0) return {};
  if (d.mode === 'me' || people.length < 2) return { [ME]: cents };
  if (d.mode === 'each') {
    const typed = Object.fromEntries(Object.entries(d.shares || {}).map(([k, v]) => [k, Number(String(v).replace(',', '.'))]));
    return splitFromAmounts(typed, draftRate(d), cents, d.payer);
  }
  return splitEqual(cents, people.map((p) => p.id), d.payer);
}

/** What is left to share out in Per persoon, in the spend's currency. */
function leftToShare(d) {
  const sum = Object.values(d.shares || {}).reduce((s, v) => s + (Number(String(v).replace(',', '.')) || 0), 0);
  return Math.round((draftAmount(d) - sum) * 100) / 100;
}

export function draftReady(d, people) {
  if (!(draftAmount(d) > 0)) return false;
  if (d.mode === 'each' && people.length > 1) return Math.abs(leftToShare(d)) < 0.005;
  return true;
}

/** The draft as a ledger row, or null. */
export function draftRow(d, people, { id, date }) {
  const shares = {};
  Object.entries(d.shares || {}).forEach(([k, v]) => { shares[k] = Number(String(v).replace(',', '.')) || 0; });
  return makeSpend({
    amount: draftAmount(d), currency: d.currency, rate: draftRate(d), cat: d.cat, desc: d.desc,
    payer: d.payer, mode: d.mode, shares, src: d.src, photoId: d.photoId,
  }, people, { id, date });
}

/** Per persoon amounts as typed text in the reader's notation. */
export const asText = (n, lang) => (Number.isFinite(n) && n > 0 ? String(Math.round(n * 100) / 100).replace('.', decimalSep(lang)) : '');

export function AddSheet({ draft, setDraft, people, faces, last, onAgain, onNext }) {
  const { t, lang } = useI18n();
  const [curOpen, setCurOpen] = useState(false);
  const amount = draftAmount(draft);
  const ready = draftReady(draft, people);
  const shared = people.length > 1;
  const sep = decimalSep(lang);
  const press = (k) => setDraft((d) => {
    let s = String(d.amount || '');
    if (k === 'del') s = s.slice(0, -1);
    else if (k === 'dec') { if (!s.includes('.')) s = `${s || '0'}.`; } else {
      if (s.includes('.') && s.split('.')[1].length >= 2) return d;
      if (s.replace('.', '').length >= 7) return d;
      s = (s === '0' ? '' : s) + k;
    }
    return { ...d, amount: s };
  });
  // A keyboard types into the amount too (desktop), unless a field has focus.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) { press(e.key); e.preventDefault(); } else if (e.key === ',' || e.key === '.') { press('dec'); e.preventDefault(); } else if (e.key === 'Backspace') { press('del'); e.preventDefault(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- press only calls setDraft, which is stable
  const keyProps = (k) => ({
    // The key answers on pointerdown, like a real keypad; a keyboard press
    // (click with detail 0) still works. preventDefault keeps focus put.
    onPointerDown: (e) => { e.preventDefault(); press(k); },
    onClick: (e) => { if (e.detail === 0) press(k); },
  });
  const setMode = (mode) => setDraft((d) => {
    if (mode !== 'each' || Object.keys(d.shares || {}).length) return { ...d, mode };
    const even = splitEqual(Math.round(draftAmount(d) * 100), people.map((p) => p.id), d.payer);
    const shares = {};
    people.forEach((p) => { shares[p.id] = asText((even[p.id] || 0) / 100, lang); });
    return { ...d, mode, shares };
  });
  const shareEvenly = () => setDraft((d) => {
    const even = splitEqual(Math.round(draftAmount(d) * 100), people.map((p) => p.id), d.payer);
    const shares = {};
    people.forEach((p) => { shares[p.id] = asText((even[p.id] || 0) / 100, lang); });
    return { ...d, shares };
  });
  const left = leftToShare(draft);
  const shown = draft.amount ? String(draft.amount).replace('.', sep) : '0';

  return (
    <>
      <div className="sp-amt">
        <output className={`sp-amt-fig${amount ? '' : ' is-zero'}`} aria-live="polite" aria-label={t('sp.amount')}>
          {shown}<span className="sp-caret" aria-hidden="true" />
        </output>
        <Pressable type="button" className="sp-cur" aria-expanded={curOpen} aria-label={t('sp.currency', { c: draft.currency })}
          onClick={() => setCurOpen((v) => !v)}>{draft.currency}</Pressable>
      </div>
      {curOpen && (
        <div className="sp-chips" role="group" aria-label={t('sp.currency', { c: '' }).trim()}>
          {CURRENCIES.map((c) => (
            <Pressable key={c} type="button" aria-pressed={draft.currency === c}
              onClick={() => { setDraft((d) => ({ ...d, currency: c })); setCurOpen(false); }}>{c}</Pressable>
          ))}
        </div>
      )}
      <div className="sp-chips sp-cats" role="group" aria-label={t('sp.kind')}>
        {DAY_CATS.map((c) => {
          const G = CAT_GLYPH[c];
          return (
            <Pressable key={c} type="button" aria-pressed={draft.cat === c} onClick={() => setDraft((d) => ({ ...d, cat: c }))}>
              <G size={18} />{t(`sp.cat_${c}`)}
            </Pressable>
          );
        })}
      </div>
      {shared && (
        <>
          {/* Alleen ik is always paid by you, so the payer row steps aside. */}
          {draft.mode !== 'me' && (
            <>
              <p className="sp-lbl" id="sp-payer-l">{t('sp.paidBy')}</p>
              <div className="sp-chips" role="group" aria-labelledby="sp-payer-l">
                {people.map((p) => (
                  <Pressable key={p.id} type="button" aria-pressed={draft.payer === p.id} onClick={() => setDraft((d) => ({ ...d, payer: p.id }))}>
                    <Face person={p} people={people} faces={faces} size="xs" />{personName(t, p, people)}
                  </Pressable>
                ))}
              </div>
            </>
          )}
          <p className="sp-lbl" id="sp-for-l">{t('sp.forWho')}</p>
          <div className="sp-chips sp-voor" role="group" aria-labelledby="sp-for-l">
            <Pressable type="button" aria-pressed={draft.mode === 'all'} onClick={() => setMode('all')}>{t('sp.everyone')}</Pressable>
            <Pressable type="button" aria-pressed={draft.mode === 'each'} onClick={() => setMode('each')}>{t('sp.forEach')}</Pressable>
            <Pressable type="button" aria-pressed={draft.mode === 'me'} onClick={() => setMode('me')}><LockGlyph size={14} />{t('sp.forMe')}</Pressable>
          </div>
          {draft.mode === 'each' && (
            <>
              <div className="sp-per">
                {people.map((p) => (
                  <label key={p.id} className="sp-prow">
                    <Face person={p} people={people} faces={faces} size="xs" />
                    <span>{personName(t, p, people)}</span>
                    <input inputMode="decimal" placeholder="0" value={draft.shares?.[p.id] ?? ''} aria-label={t('sp.shareFor', { name: personName(t, p, people) })}
                      onChange={(e) => { const v = e.target.value.replace(/[^\d.,]/g, ''); setDraft((d) => ({ ...d, shares: { ...d.shares, [p.id]: v } })); }} />
                  </label>
                ))}
              </div>
              <div className={`sp-left${Math.abs(left) < 0.005 ? ' is-done' : ''}`} aria-live="polite">
                {Math.abs(left) < 0.005
                  ? <><CheckGlyph size={16} /><span>{t('sp.allShared')}</span></>
                  : <span>{t(left > 0 ? 'sp.left' : 'sp.over', { amount: formatIn(Math.abs(left), draft.currency) })}</span>}
                <Pressable type="button" className="sp-link" onClick={shareEvenly}>{t('sp.even')}</Pressable>
              </div>
            </>
          )}
        </>
      )}
      {draft.noteOpen ? (
        <input className="sp-what" autoFocus placeholder={t('sp.what')} aria-label={t('sp.what')} value={draft.desc} maxLength={80}
          onChange={(e) => setDraft((d) => ({ ...d, desc: e.target.value }))} />
      ) : (
        <Pressable type="button" className="sp-link sp-note" onClick={() => setDraft((d) => ({ ...d, noteOpen: true }))}>{t('sp.note')}</Pressable>
      )}
      {draft.mode !== 'each' && (
        <div className="sp-keys">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'dec', '0', 'del'].map((k) => (
            <Pressable key={k} type="button" {...keyProps(k)}
              aria-label={k === 'del' ? t('sp.delKey') : k === 'dec' ? t('sp.decimal') : k}>
              {k === 'del' ? <DelGlyph size={22} /> : k === 'dec' ? sep : k}
            </Pressable>
          ))}
        </div>
      )}
      {last && !amount && (
        <Pressable type="button" className="sp-pill sp-again" onClick={onAgain}>
          {t('sp.again', { what: last.desc || t(`sp.cat_${last.cat}`), amount: formatIn(last.amount, last.currency) })}
        </Pressable>
      )}
      <Pressable type="button" className="sp-go" disabled={!ready} onClick={onNext}>
        {!amount ? t('sp.typeAmount') : !ready ? t('sp.splitIt') : t('sp.next')}
      </Pressable>
    </>
  );
}

/* ───────────── Klopt dit? and the detail ───────────── */

function Summary({ cat, name, sub, amount }) {
  const G = CAT_GLYPH[cat] || CAT_GLYPH.other;
  return (
    <div className="sp-csum">
      <span className="sp-csum-cat"><G size={22} /></span>
      <div className="sp-csum-t"><b>{name}</b><span>{sub}</span></div>
      <b className="sp-csum-big">{amount}</b>
    </div>
  );
}

function SplitLines({ split, people, faces }) {
  const { t } = useI18n();
  return (
    <div className="sp-cl">
      {people.filter((p) => split[p.id] > 0).map((p) => (
        <div key={p.id} className="sp-cline">
          <Face person={p} people={people} faces={faces} size="xs" />
          <span>{personName(t, p, people)}</span>
          <b>{eur(split[p.id])}</b>
        </div>
      ))}
    </div>
  );
}

function ReceiptThumb({ url, label }) {
  const [big, setBig] = useState(false);
  if (!url) return null;
  return (
    <Pressable type="button" className={`sp-cph${big ? ' is-big' : ''}`} aria-expanded={big} onClick={() => setBig((v) => !v)}>
      <img src={url} alt="" />
      <span>{label}</span>
    </Pressable>
  );
}

export function ConfirmSheet({ draft, people, faces, photoUrl, onEdit, onSave }) {
  const { t } = useI18n();
  const split = draftSplit(draft, people);
  const payer = people.find((p) => p.id === (draft.mode === 'me' ? ME : draft.payer)) || people[0];
  const cents = Math.round(draftAmount(draft) * draftRate(draft) * 100);
  const SrcG = draft.src === 'mic' ? MicGlyph : draft.src === 'scan' ? CamGlyph : null;
  const sub = (
    <>{SrcG && <SrcG size={13} />}{t(draft.src === 'mic' ? 'sp.srcMic' : draft.src === 'scan' ? 'sp.srcScan' : 'sp.srcHand')}</>
  );
  return (
    <>
      <h2 className="sp-ctitle">{t('sp.check')}</h2>
      <Summary cat={draft.cat} name={draft.desc || t(`sp.cat_${draft.cat}`)} sub={sub} amount={formatIn(draftAmount(draft), draft.currency)} />
      {draft.currency !== 'EUR' && <p className="sp-hint">{eur(cents)}</p>}
      <ReceiptThumb url={photoUrl} label={t('sp.receiptWith')} />
      {people.length > 1 && (
        <>
          <p className="sp-lbl">{t('sp.paidBy')}</p>
          <div className="sp-cline">
            <Face person={payer} people={people} faces={faces} size="xs" />
            <span>{personName(t, payer, people)}</span>
            <b>{eur(cents)}</b>
          </div>
          <p className="sp-lbl">{t('sp.split')}</p>
          <SplitLines split={split} people={people} faces={faces} />
        </>
      )}
      {draft.mode === 'me' && people.length > 1 && <p className="sp-privnote"><LockGlyph size={13} />{t('sp.privNote')}</p>}
      <div className="sp-two">
        <Pressable type="button" className="sp-pill is-big" onClick={onEdit}>{t('sp.edit')}</Pressable>
        <Pressable type="button" className="sp-go" onClick={onSave}><CheckGlyph size={18} />{t('sp.confirm')}</Pressable>
      </div>
    </>
  );
}

export function DetailSheet({ row, people, faces, photoUrl, dayLabel, onDelete, onEdit }) {
  const { t } = useI18n();
  if (!row) return null;
  const payer = people.find((p) => p.id === row.payer);
  return (
    <>
      <Summary cat={row.cat} name={row.desc || t(`sp.cat_${row.cat}`)} sub={dayLabel} amount={formatIn(row.amount, row.currency)} />
      <ReceiptThumb url={photoUrl} label={t('sp.receipt')} />
      {payer && people.length > 1 && !row.priv && (
        <>
          <p className="sp-lbl">{t('sp.paidBy')}</p>
          <div className="sp-cline">
            <Face person={payer} people={people} faces={faces} size="xs" />
            <span>{personName(t, payer, people)}</span>
            <b>{eur(row.cents)}</b>
          </div>
        </>
      )}
      {row.priv ? <p className="sp-privnote"><LockGlyph size={13} />{t('sp.privNote')}</p> : (
        <>
          <p className="sp-lbl">{t('sp.whoWhat')}</p>
          <SplitLines split={row.split} people={people} faces={faces} />
        </>
      )}
      <div className="sp-two">
        <Pressable type="button" className="sp-pill is-big" onClick={onDelete}>{t('sp.delete')}</Pressable>
        <Pressable type="button" className="sp-go" onClick={onEdit}>{t('sp.edit')}</Pressable>
      </div>
    </>
  );
}

/* ───────────── All spending ───────────── */

export function AllSheet({ rows, people, faces, dayLabel, onOpen }) {
  const { t } = useI18n();
  const days = useMemo(() => {
    const by = new Map();
    rows.filter((r) => !r.priv).forEach((r) => {
      const k = r.day || '';
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(r);
    });
    return [...by.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);
  return (
    <>
      <h2 className="sp-ctitle">{t('sp.allSpends')}</h2>
      {days.map(([day, list]) => (
        <section key={day || 'none'} className="sp-allday">
          <h3 className="sp-dayh"><span>{dayLabel(day)}</span><span>{eur(list.reduce((s, r) => s + r.cents, 0))}</span></h3>
          <div className="sp-list">
            {list.map((r) => <SpendRow key={r.id} row={r} people={people} faces={faces} onOpen={onOpen} />)}
          </div>
        </section>
      ))}
    </>
  );
}

/* ───────────── Por ───────────── */

export function NudgeSheet({ list, people, faces, trip, payLink, onDone }) {
  const { t } = useI18n();
  const all = list.length > 1;
  const byId = (id) => people.find((p) => p.id === id);
  const first = list[0];
  const firstName = first ? personName(t, byId(first.from), people) : '';
  const base = all
    ? [t('sp.msgAll', { trip }), ...list.map((x) => `${personName(t, byId(x.from), people)}: ${eur(x.cents)}`)].join('\n')
    : t('sp.msgOne', { name: firstName, amount: eur(first?.cents), trip });
  const [msg, setMsg] = useState(payLink ? `${base}\n${t('sp.msgLink', { url: payLink })}` : base);
  const [remind, setRemind] = useState(true);
  const enc = encodeURIComponent(msg);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const done = (way) => onDone({ way, remind });
  const copy = async () => {
    try { await navigator.clipboard.writeText(msg); } catch { /* the toast still says what to do */ }
    done('copy');
  };
  const share = async () => {
    try { await navigator.share({ text: msg }); done('share'); } catch { /* cancelled */ }
  };
  if (!first) return null;
  return (
    <>
      <h2 className="sp-ctitle">{all ? t('sp.remindAll') : t('sp.nudgeAria', { name: firstName })}</h2>
      {all ? (
        <div className="sp-cl">
          {list.map((x) => (
            <div key={x.from} className="sp-cline">
              <Face person={byId(x.from)} people={people} faces={faces} size="xs" />
              <span>{personName(t, byId(x.from), people)}</span>
              <b>{eur(x.cents)}</b>
            </div>
          ))}
        </div>
      ) : (
        <div className="sp-pbig"><Face person={byId(first.from)} people={people} faces={faces} size="lg" /><b>{eur(first.cents)}</b></div>
      )}
      <textarea className="sp-msg" rows={all ? 4 : 3} aria-label={t('sp.message')} value={msg} onChange={(e) => setMsg(e.target.value)} />
      {payLink && <p className="sp-plink"><LinkGlyph size={15} /><span>{payLink.replace(/^https:\/\//, '')}</span><em>{t('sp.payLink')}</em></p>}
      <div className={`sp-ways${canShare ? ' has-four' : ''}`}>
        <a className="sp-way is-main" href={`https://wa.me/?text=${enc}`} target="_blank" rel="noopener noreferrer" onClick={() => done('WhatsApp')}>
          <ChatGlyph size={18} />WhatsApp
        </a>
        <a className="sp-way" href={`sms:?&body=${enc}`} onClick={() => done(t('sp.waySms'))}><SmsGlyph size={18} />{t('sp.waySms')}</a>
        <Pressable type="button" className="sp-way" onClick={copy}><CopyGlyph size={18} />{t('sp.wayCopy')}</Pressable>
        {canShare && <Pressable type="button" className="sp-way" onClick={share}><ShareGlyph size={18} />{t('sp.wayShare')}</Pressable>}
      </div>
      <label className="sp-auto">
        <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
        <span>{t('sp.remindMe')}</span>
      </label>
    </>
  );
}

/* ───────────── Speech ───────────── */

export function ListenSheet({ notice, heard, state, exampleName, onStart, onStop, onRetry, onType }) {
  const { t } = useI18n();
  if (notice) {
    return (
      <div className="sp-listen">
        <span className="sp-listen-mic"><MicGlyph size={28} /></span>
        <p className="sp-notice">{t('sp.speechNotice')}</p>
        <Pressable type="button" className="sp-go" onClick={onStart}>{t('sp.speechOk')}</Pressable>
      </div>
    );
  }
  return (
    <div className="sp-listen">
      {state === 'listening' && (
        <span className="sp-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>
      )}
      <p className="sp-heard" aria-live="polite">{state === 'empty' ? t('sp.heardNothing') : heard || t('sp.sayIt')}</p>
      {state === 'listening' && (
        <>
          <p className="sp-hint">{exampleName ? t('sp.sayHint', { name: exampleName }) : t('sp.sayHintSolo')}</p>
          <Pressable type="button" className="sp-pill" onClick={onStop}>{t('sp.stop')}</Pressable>
        </>
      )}
      {state === 'empty' && (
        <div className="sp-two">
          <Pressable type="button" className="sp-pill is-big" onClick={onType}>{t('sp.typeIt')}</Pressable>
          <Pressable type="button" className="sp-go" onClick={onRetry}><MicGlyph size={18} />{t('sp.tryAgain')}</Pressable>
        </div>
      )}
    </div>
  );
}

export function WhichSheet({ heard, which, currency, onPick, onType }) {
  const { t } = useI18n();
  return (
    <>
      <h2 className="sp-ctitle">{t('sp.which')}</h2>
      <p className="sp-heardq">&ldquo;{heard}&rdquo;</p>
      <div className="sp-which">
        {which.map((a) => <Pressable key={a} type="button" onClick={() => onPick(a)}>{formatIn(a, currency)}</Pressable>)}
      </div>
      <Pressable type="button" className="sp-link sp-center" onClick={onType}>{t('sp.typeIt')}</Pressable>
    </>
  );
}

/* ───────────── The receipt ───────────── */

export function ScanSheet({ onShot, onFile }) {
  const { t } = useI18n();
  const videoRef = useRef(null);
  const [live, setLive] = useState(null); // null starting, true streaming, false none
  useEffect(() => {
    let stream = null;
    let gone = false;
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
    if (!md?.getUserMedia) { setLive(false); return undefined; }
    md.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then((s) => {
      if (gone) { s.getTracks().forEach((x) => x.stop()); return; }
      stream = s;
      if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
      setLive(true);
    }).catch(() => setLive(false));
    return () => { gone = true; if (stream) stream.getTracks().forEach((x) => x.stop()); };
  }, []);
  const shoot = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) onShot(b); }, 'image/jpeg', 0.9);
  };
  return (
    <>
      <div className="sp-vf" role="img" aria-label={t('sp.camera')}>
        <video ref={videoRef} muted playsInline className={live ? 'is-on' : ''} />
        {!live && <span className="sp-vf-paper" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span>}
        <span className="sp-corner is-tl" /><span className="sp-corner is-tr" /><span className="sp-corner is-bl" /><span className="sp-corner is-br" />
        <span className="sp-scanline" aria-hidden="true" />
      </div>
      <p className="sp-vfhint">{live === false ? t('sp.camOff') : t('sp.scanHint')}</p>
      <div className="sp-two">
        <label className="sp-pill is-big sp-upl">
          <PhotoGlyph size={18} />{t('sp.fromPhotos')}
          <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
        </label>
        {live ? (
          <Pressable type="button" className="sp-go" onClick={shoot}><CamGlyph size={18} />{t('sp.scan')}</Pressable>
        ) : (
          <label className="sp-go sp-upl">
            <CamGlyph size={18} />{t('sp.scan')}
            <input type="file" accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
          </label>
        )}
      </div>
    </>
  );
}

export function ReceiptSheet({ scan, photoUrl, onPick, onNext }) {
  const { t } = useI18n();
  const cur = scan.currency || 'EUR';
  if (scan.state === 'reading') {
    return (
      <div className="sp-listen">
        {photoUrl && <img className="sp-rthumb" src={photoUrl} alt="" />}
        <p className="sp-heard" aria-live="polite">{t('sp.reading')}</p>
        <span className="sp-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((scan.progress || 0) * 100)} aria-label={t('sp.reading')}>
          <i style={{ transform: `scaleX(${scan.progress || 0})` }} />
        </span>
      </div>
    );
  }
  if (scan.state === 'failed' || !scan.lines?.length) {
    return (
      <>
        {photoUrl && <img className="sp-rthumb" src={photoUrl} alt="" />}
        <p className="sp-heard">{t('sp.readFailed')}</p>
        <Pressable type="button" className="sp-go" onClick={() => onNext(null)}>{t('sp.next')}</Pressable>
      </>
    );
  }
  const picked = scan.lines[scan.pick];
  return (
    <>
      <h2 className="sp-ctitle">{t('sp.onReceipt')}</h2>
      <div className="sp-paper">
        {(scan.place || scan.dateLabel) && (
          <div className="sp-phead">{scan.place && <b>{scan.place}</b>}{scan.dateLabel && <span>{scan.dateLabel}</span>}</div>
        )}
        <div className="sp-lines">
          {scan.lines.map((l, i) => (
            <Pressable key={`${i}-${l.cents}`} type="button" className={`sp-ln${i === scan.total ? ' is-tot' : ''}${i === scan.pick ? ' is-on' : ''}`}
              aria-pressed={i === scan.pick}
              onClick={() => onPick(i)}>
              <span>{l.label}</span>
              <b className="sp-amtc">{i === scan.pick && <CheckGlyph size={14} />}{formatIn(l.cents / 100, cur)}</b>
            </Pressable>
          ))}
        </div>
      </div>
      <Pressable type="button" className="sp-go" disabled={!picked} onClick={() => onNext(picked)}>
        {t('sp.nextWith', { amount: picked ? formatIn(picked.cents / 100, cur) : '' })}
      </Pressable>
    </>
  );
}
