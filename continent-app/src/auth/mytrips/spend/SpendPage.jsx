/*
 * Uitgaven (G15, decision .work/2026-11-21-spend-capture/decision.md, the
 * owner-approved prototype in that folder): one page for spending on a
 * trip and the Reiskas, opened from the quiet "Uitgaven" row on Today.
 *
 *   top      back, the trip's photo, "Uitgaven", the trip and its crew
 *            names, the crew's faces; the tabs Vandaag and Reiskas
 *   middle   Vandaag: today and yesterday, each with your share, the food
 *            plan tick on today; Reiskas: payments made, Rond maken (the
 *            fewest transfers, Por and Betaald), Tussen anderen, Iedereen
 *            (balance bars and the wink tags), Alle uitgaven
 *   bottom   one fixed add bar: the mic, "+ Uitgave" and the camera
 *
 * The page writes only the trip's extras (expenses rows and the kas key)
 * through saveExtras, so it syncs as Today always has. Every save, delete,
 * paid and nudge is applied at once and offers Undo. Receipt photos and
 * faces stay on this device (receiptStore.js, device.js).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pressable } from '../../../components/ui/Pressable.jsx';
import { useI18n } from '../../../i18n/index.jsx';
import { useFocusTrap } from '../../../hooks/useFocusTrap.js';
import { prefersReducedMotion } from '../../../lib/motion.js';
import { haptic } from '../../../lib/haptics.js';
import { toEur } from '../../../lib/currency.js';
import { formatMoney } from '../../../lib/money.js';
import { daysUntil, expenseDay } from '../../../lib/myTrips.js';
import { parseSpeech, parseReceipt } from '../../../lib/spend/parse.js';
import {
  ME, kasPeople, readLedger, mineOnDay, kasBalances, kasTransfers, kasExtremes,
} from '../../../lib/spend/model.js';
import { HeroImage } from '../../../components/HeroImage.jsx';
import { UNDO_MS } from '../parts.jsx';
import { Face, SpendRow, eur, personName } from './parts.jsx';
import {
  Sheet, AddSheet, ConfirmSheet, DetailSheet, AllSheet, NudgeSheet, ListenSheet, WhichSheet, ScanSheet, ReceiptSheet,
  draftRow, asText,
} from './SpendSheets.jsx';
import { BackGlyph, CamGlyph, CheckGlyph, ChevGlyph, MicGlyph, PlusGlyph, ArrowGlyph } from './icons.jsx';
import { fetchMyPayLink } from '../../groupExpenses.js';
import { putReceipt, getReceipt, deleteReceipt, reencode } from './receiptStore.js';
import { readFaces, saveFace, speechNoticeSeen, markSpeechNoticeSeen, speechRecognition, listen } from './device.js';
import '../../../styles/72-spend.css';

const NUDGE_COOLDOWN_MS = 48 * 3600 * 1000;
const PAGE_MS = 380;

const shiftIso = (iso, days) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const newDraft = (o = {}) => ({
  amount: '', currency: 'EUR', cat: 'food', payer: ME, mode: 'all', shares: {}, desc: '', noteOpen: false,
  src: 'hand', photoId: null, editId: null, ...o,
});

/** A row as a draft, for Aanpassen. */
function draftOf(row, people, lang) {
  const rate = row.amount > 0 ? row.cents / 100 / row.amount : 1;
  const equal = !row.legacy && people.every((p) => row.split[p.id] > 0)
    && Math.max(...Object.values(row.split)) - Math.min(...Object.values(row.split)) <= 1;
  const mode = row.priv ? 'me' : equal || row.legacy ? 'all' : 'each';
  const shares = {};
  if (mode === 'each') people.forEach((p) => { shares[p.id] = asText((row.split[p.id] || 0) / 100 / rate, lang); });
  return newDraft({
    amount: String(row.amount), currency: row.currency, cat: row.cat, payer: row.payer || ME, mode, shares,
    // Aanpassen keeps the rate the spend was logged at while its currency stays.
    rate, rateCur: row.currency,
    desc: row.desc, noteOpen: !!row.desc, src: row.src, photoId: row.photoId, editId: row.id, date: row.date,
  });
}

/** An object URL for a stored receipt, revoked when it changes. */
function useReceiptUrl(id) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    let made = null;
    setUrl(null);
    if (id) {
      getReceipt(id).then((b) => {
        if (!live || !b) return;
        made = URL.createObjectURL(b);
        setUrl(made);
      });
    }
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [id]);
  return url;
}

export function SpendPage({
  planId, extras, saveExtras, todayIso, startIso, title, img, groupSize = 1, plannedFood = null,
  userId = null, onClose, onCrew,
}) {
  const { t, lang } = useI18n();
  const people = useMemo(() => kasPeople(extras, { groupSize }), [extras, groupSize]);
  const others = people.filter((p) => !p.me);
  const rows = useMemo(() => readLedger(extras.expenses, people, toEur, expenseDay), [extras.expenses, people]);
  const kas = extras.kas || { settled: [], nudged: {}, remind: {} };
  const [faces, setFaces] = useState(() => readFaces(planId));
  const [tab, setTab] = useState('today');
  const [leaving, setLeaving] = useState(false);
  const [sheet, setSheet] = useState(null); // { kind, ... }
  const [draft, setDraft] = useState(newDraft);
  const [toast, setToast] = useState(null); // { id, text, undo, expire }
  const [fresh, setFresh] = useState(null);
  const [heard, setHeard] = useState({ text: '', state: 'idle', which: null, currency: 'EUR' });
  const [scan, setScan] = useState(null);
  const pageRef = useRef(null);
  const backRef = useRef(null);
  const faceInput = useRef(null);
  const faceFor = useRef(null);
  const speech = useRef(null);
  const toastTimer = useRef(0);
  const sheetClose = useRef(null);
  const hasMic = !!speechRecognition();
  // Your own pay link (migration 058), for the Por message; none for a guest.
  const [payLink, setPayLink] = useState('');
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    fetchMyPayLink(userId).then((r) => { if (live) setPayLink(r.url || ''); }).catch(() => {});
    return () => { live = false; };
  }, [userId]);

  // The latest extras, so an Undo set up before a later save restores the
  // right list (a closure would hold the extras of its own render).
  const extrasRef = useRef(extras);
  extrasRef.current = extras;
  const save = useCallback((next) => saveExtras({ ...extrasRef.current, ...next }), [saveExtras]);

  const close = useCallback(() => {
    if (leaving) return;
    if (prefersReducedMotion()) { onClose(); return; }
    setLeaving(true);
    setTimeout(onClose, PAGE_MS);
  }, [leaving, onClose]);
  // One trap for the page; a sheet's own trap wins while it is open, and
  // the page is inert under it, so Tab never walks out of the sheet.
  useFocusTrap(pageRef, close, { initialFocusRef: backRef });

  // Toast: one at a time, six seconds, Undo. Its timer only clears it.
  // The toast in hand lives in a ref too, so its expiry (deleting a receipt
  // for good) runs once, outside any state updater (StrictMode runs those
  // twice).
  const toastRef = useRef(null);
  const endToast = useCallback((runExpire) => {
    clearTimeout(toastTimer.current);
    const cur = toastRef.current;
    toastRef.current = null;
    if (runExpire && cur?.expire) cur.expire();
    return cur;
  }, []);
  const showToast = useCallback((text, undo = null, expire = null) => {
    endToast(true);
    const next = { id: Date.now(), text, undo, expire };
    toastRef.current = next;
    setToast(next);
    toastTimer.current = setTimeout(() => { endToast(true); setToast(null); }, UNDO_MS);
  }, [endToast]);
  useEffect(() => () => endToast(true), [endToast]);
  const undoToast = () => {
    const cur = endToast(false);
    setToast(null);
    cur?.undo?.();
  };

  const closeSheet = useCallback(() => {
    setSheet(null);
    if (speech.current) { speech.current.stop(); speech.current = null; }
  }, []);

  /* ── Days ── */
  const yesterdayIso = shiftIso(todayIso, -1);
  const dayLabel = useCallback((iso) => {
    if (iso === todayIso) return t('sp.tabToday');
    if (iso === yesterdayIso) return t('sp.yesterday');
    if (startIso && iso) return t('sp.dayN', { n: daysUntil(iso, startIso) + 1 });
    return iso || '';
  }, [t, todayIso, yesterdayIso, startIso]);
  const todayRows = rows.filter((r) => r.day === todayIso);
  const yRows = rows.filter((r) => r.day === yesterdayIso);
  const mineToday = mineOnDay(rows, todayIso);
  const foodToday = (mineToday.byCat.food || 0) / 100;

  /* ── The kas ── */
  const net = useMemo(() => kasBalances(rows, kas.settled, people), [rows, kas.settled, people]);
  const transfers = useMemo(() => kasTransfers(net), [net]);
  const sharedRows = rows.filter((r) => !r.priv && !r.legacy);
  const doneCount = (kas.settled || []).length;
  const totalCount = doneCount + transfers.length;
  const now = Date.now();
  const nudgedRecently = (id) => now - (kas.nudged?.[id] || 0) < NUDGE_COOLDOWN_MS;
  const remindDue = (id) => (kas.remind?.[id] || Infinity) <= now;
  const inbound = transfers.filter((x) => x.to === ME);
  const outbound = transfers.filter((x) => x.from === ME);
  const between = transfers.filter((x) => x.to !== ME && x.from !== ME);
  const { top, low } = kasExtremes(net);
  const maxAbs = Math.max(1, ...Object.values(net).map(Math.abs));
  const byId = (id) => people.find((p) => p.id === id);

  /* ── Saving ── */
  const lastRow = useMemo(() => rows.filter((r) => !r.legacy).sort((a, b) => Number(b.id) - Number(a.id))[0] || null, [rows]);
  const confirmSave = () => {
    const d = draft;
    const id = d.editId || `${Date.now()}`;
    const row = draftRow(d, people, { id, date: d.editId ? (d.date || todayIso) : todayIso });
    if (!row) return;
    const before = extrasRef.current.expenses || [];
    const list = d.editId ? before.map((x) => (String(x.id) === String(d.editId) ? row : x)) : [...before, row];
    save({ expenses: list });
    haptic('confirm');
    setFresh(id);
    closeSheet();
    setDraft(newDraft());
    showToast(t(d.editId ? 'sp.saved' : 'sp.added', { amount: eur(row.cents) }), () => {
      save({ expenses: before });
      if (!d.editId && row.photoId) deleteReceipt(row.photoId);
    });
  };
  const deleteRow = (id) => {
    const before = extrasRef.current.expenses || [];
    const gone = before.find((x) => String(x.id) === String(id));
    save({ expenses: before.filter((x) => String(x.id) !== String(id)) });
    closeSheet();
    showToast(t('sp.deleted'), () => save({ expenses: before }), () => { if (gone?.photoId) deleteReceipt(gone.photoId); });
  };
  const markPaid = (tr) => {
    const before = extrasRef.current.kas || kas;
    const entry = { id: `s${Date.now()}`, from: tr.from, to: tr.to, cents: tr.cents, at: Date.now() };
    save({ kas: { ...before, settled: [...(before.settled || []), entry] } });
    haptic('confirm');
    showToast(t('sp.paidToast'), () => save({ kas: before }));
  };
  const nudgeDone = (list) => ({ way, remind }) => {
    const before = extrasRef.current.kas || kas;
    const at = Date.now();
    const nudged = { ...(before.nudged || {}) };
    const rem = { ...(before.remind || {}) };
    list.forEach((x) => { nudged[x.from] = at; if (remind) rem[x.from] = at + NUDGE_COOLDOWN_MS; else delete rem[x.from]; });
    save({ kas: { ...before, nudged, remind: rem } });
    haptic('tick');
    closeSheet();
    showToast(way === 'copy' ? t('sp.copied') : way === 'share' ? t('sp.nudged') : t('sp.nudgedVia', { way }), () => save({ kas: before }));
  };

  /* ── Opening sheets ── */
  const openAdd = () => { setDraft(newDraft()); setSheet({ kind: 'add' }); };
  const openRow = (id) => setSheet({ kind: 'detail', id });
  const startListening = () => {
    setHeard({ text: '', state: 'listening', which: null, currency: 'EUR' });
    speech.current = listen(lang, {
      onText: (text) => setHeard((h) => ({ ...h, text })),
      onEnd: (text) => {
        speech.current = null;
        const p = parseSpeech(text, lang, people);
        if (!text || p.amount == null) { setHeard((h) => ({ ...h, text, state: 'empty' })); return; }
        const shares = {};
        if (p.mode === 'each') {
          const ids = p.sharers.filter((id) => byId(id));
          const cents = Math.round(p.amount * 100);
          const base = Math.floor(cents / ids.length);
          ids.forEach((id, i) => { shares[id] = asText((base + (i === 0 ? cents - base * ids.length : 0)) / 100, lang); });
        }
        const d = newDraft({
          amount: String(p.amount), currency: p.currency || 'EUR', cat: p.cat || 'other', payer: p.payer || ME,
          mode: others.length ? (p.mode || 'all') : 'me', shares, desc: p.desc, noteOpen: !!p.desc, src: 'mic',
        });
        setDraft(d);
        if (p.which) { setHeard({ text, state: 'done', which: p.which, currency: d.currency }); setSheet({ kind: 'which' }); } else setSheet({ kind: 'confirm' });
      },
    });
  };
  const openMic = () => {
    if (!speechNoticeSeen()) { setSheet({ kind: 'listen', notice: true }); return; }
    // Speech starts inside the tap (Safari needs the gesture).
    setSheet({ kind: 'listen' });
    startListening();
  };
  const acceptNotice = () => {
    markSpeechNoticeSeen();
    setSheet({ kind: 'listen' });
    startListening();
  };
  const pickWhich = (a) => setDraft((d) => {
    const next = { ...d, amount: String(a) };
    if (d.mode === 'each') {
      const ids = Object.keys(d.shares).filter((k) => d.shares[k]);
      const cents = Math.round(a * 100);
      const base = Math.floor(cents / Math.max(1, ids.length));
      const shares = {};
      ids.forEach((id, i) => { shares[id] = asText((base + (i === 0 ? cents - base * ids.length : 0)) / 100, lang); });
      next.shares = shares;
    }
    return next;
  });
  const pickWhichAndGo = (a) => { pickWhich(a); setSheet({ kind: 'confirm' }); };

  const openCam = () => { setDraft(newDraft({ src: 'scan', cat: 'food' })); setScan(null); setSheet({ kind: 'scan' }); };
  const gotPhoto = async (fileOrBlob) => {
    setScan({ state: 'reading', progress: 0 });
    setSheet({ kind: 'receipt' });
    let blob = fileOrBlob;
    try { blob = await reencode(fileOrBlob); } catch { /* keep the original for reading */ }
    const photoId = await putReceipt(blob);
    setDraft((d) => ({ ...d, photoId }));
    try {
      const { readReceiptText } = await import('./ocr.js');
      const text = await readReceiptText(blob, (status, progress) => setScan((s) => (s?.state === 'reading' ? { ...s, progress } : s)));
      const r = parseReceipt(text);
      const dateLabel = r.date === todayIso ? t('sp.today') : r.date ? dayLabel(r.date) : '';
      setScan({ state: r.lines.length ? 'done' : 'failed', ...r, pick: r.total, dateLabel });
    } catch {
      setScan({ state: 'failed', lines: [] });
    }
  };
  const receiptNext = (line) => {
    setDraft((d) => {
      const place = scan?.place || '';
      const cat = parseSpeech(place, lang, []).cat || d.cat;
      return {
        ...d,
        amount: line ? String(line.cents / 100) : '',
        currency: scan?.currency || d.currency,
        desc: place || d.desc,
        noteOpen: !!place,
        cat,
      };
    });
    setSheet({ kind: 'add' });
  };

  /* ── Faces ── */
  const pickFace = (id) => { faceFor.current = id; faceInput.current?.click(); };
  const faceChosen = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !faceFor.current) return;
    try {
      const url = await saveFace(planId, faceFor.current, f);
      setFaces((m) => ({ ...m, [faceFor.current]: url }));
    } catch { /* a photo that does not decode is left out */ }
  };

  const detailRow = sheet?.kind === 'detail' ? rows.find((r) => r.id === sheet.id) : null;
  const photoId = sheet?.kind === 'detail' ? detailRow?.photoId : draft.photoId;
  const photoUrl = useReceiptUrl(sheet ? photoId : null);
  const crewLine = others.filter((p) => p.name).map((p) => p.name);
  const namesLine = crewLine.length ? new Intl.ListFormat(lang === 'en' ? 'en-GB' : lang, { type: 'conjunction' }).format(crewLine) : '';

  /* ── Sheet body ── */
  let body = null;
  let sheetLabel = '';
  if (sheet?.kind === 'add') {
    sheetLabel = t('sp.add');
    body = <AddSheet draft={draft} setDraft={setDraft} people={people} faces={faces} last={draft.editId ? null : lastRow}
      onAgain={() => { setDraft(draftOf(lastRow, people, lang)); setDraft((d) => ({ ...d, editId: null, photoId: null, src: 'hand' })); setSheet({ kind: 'confirm' }); }}
      onNext={() => setSheet({ kind: 'confirm' })} />;
  } else if (sheet?.kind === 'confirm') {
    sheetLabel = t('sp.check');
    body = <ConfirmSheet draft={draft} people={people} faces={faces} photoUrl={photoUrl} onEdit={() => setSheet({ kind: 'add' })} onSave={confirmSave} />;
  } else if (sheet?.kind === 'detail') {
    sheetLabel = detailRow ? (detailRow.desc || t(`sp.cat_${detailRow.cat}`)) : '';
    body = <DetailSheet row={detailRow} people={people} faces={faces} photoUrl={photoUrl} dayLabel={detailRow ? dayLabel(detailRow.day) : ''}
      onDelete={() => deleteRow(detailRow.id)} onEdit={() => { setDraft(draftOf(detailRow, people, lang)); setSheet({ kind: 'add' }); }} />;
  } else if (sheet?.kind === 'all') {
    sheetLabel = t('sp.allSpends');
    body = <AllSheet rows={rows} people={people} faces={faces} dayLabel={dayLabel} onOpen={openRow} />;
  } else if (sheet?.kind === 'nudge') {
    const list = sheet.all ? inbound.filter((x) => !nudgedRecently(x.from)) : inbound.filter((x) => x.from === sheet.from);
    sheetLabel = t('sp.nudge');
    body = <NudgeSheet list={list} people={people} faces={faces} trip={title} payLink={payLink} onDone={nudgeDone(list)} />;
  } else if (sheet?.kind === 'listen') {
    sheetLabel = t('sp.sayIt');
    body = <ListenSheet notice={!!sheet.notice} heard={heard.text} state={heard.state} exampleName={others.find((p) => p.name)?.name || ''}
      onStart={acceptNotice} onStop={() => speech.current?.stop()} onRetry={startListening}
      onType={() => { setDraft(newDraft()); setSheet({ kind: 'add' }); }} />;
  } else if (sheet?.kind === 'which') {
    sheetLabel = t('sp.which');
    body = <WhichSheet heard={heard.text} which={heard.which || []} currency={heard.currency} onPick={pickWhichAndGo}
      onType={() => { setDraft((d) => ({ ...d, amount: '' })); setSheet({ kind: 'add' }); }} />;
  } else if (sheet?.kind === 'scan') {
    sheetLabel = t('sp.cam');
    body = <ScanSheet onShot={gotPhoto} onFile={gotPhoto} />;
  } else if (sheet?.kind === 'receipt' && scan) {
    sheetLabel = t('sp.onReceipt');
    body = <ReceiptSheet scan={scan} photoUrl={photoUrl} onPick={(i) => setScan((s) => ({ ...s, pick: i }))} onNext={receiptNext} />;
  }

  const trow = (x) => {
    const isIn = x.to === ME;
    const who = byId(isIn ? x.from : x.to);
    const name = personName(t, who, people);
    const recently = isIn && nudgedRecently(x.from);
    return (
      <div key={`${x.from}-${x.to}`} className="sp-tr">
        <span className="sp-who">
          <Face person={who} people={people} faces={faces} size="md" />
          <span><b>{name}</b><small>{t(isIn ? 'sp.paysYou' : 'sp.getsFromYou')}</small></span>
        </span>
        <b className="sp-tr-amt">{eur(x.cents)}</b>
        {isIn && (recently ? (
          <span className="sp-nudged"><CheckGlyph size={14} />{t('sp.nudged')}</span>
        ) : (
          <Pressable type="button" className={`sp-act${remindDue(x.from) ? ' is-due' : ''}`} onClick={() => setSheet({ kind: 'nudge', from: x.from })}
            aria-label={remindDue(x.from) ? t('sp.remindDue', { name }) : t('sp.nudgeAria', { name })}>{t('sp.nudge')}</Pressable>
        ))}
        {/* Betaal opens the payee's own pay link; a local kas knows none yet (join by link is phase 2). */}
        {!isIn && who?.payLink && (
          <a className="sp-act is-dark" href={who.payLink} target="_blank" rel="noopener noreferrer" aria-label={t('sp.payAria', { name, amount: eur(x.cents) })}>{t('sp.pay')}</a>
        )}
        <Pressable type="button" className="sp-ok" onClick={() => markPaid(x)}
          aria-label={t('sp.markPaid', { from: personName(t, byId(x.from), people), to: personName(t, byId(x.to), people), amount: eur(x.cents) })}>
          <CheckGlyph size={16} />
        </Pressable>
      </div>
    );
  };

  const page = (
    <div className={`sp-root${leaving ? ' is-leaving' : ''}`}>
      <div className="sp-panel">
        <div ref={pageRef} className="sp-page" role="dialog" aria-modal="true" aria-labelledby="sp-title" inert={sheet ? '' : undefined}>
          <header className="sp-bar">
            <Pressable ref={backRef} type="button" className="sp-ib" onClick={close} aria-label={t('sp.back')}><BackGlyph size={20} /></Pressable>
            <span className="sp-thumb"><HeroImage url={img} className="sp-thumb-img" maxWidth={120} ratio={[1, 1]} sizes="36px" /></span>
            <span className="sp-ttl">
              <h1 id="sp-title">{t('sp.title')}</h1>
              <span>{namesLine ? t('sp.with', { trip: title, names: namesLine }) : title}</span>
            </span>
            {others.length > 0 && (
              <span className="sp-crew" aria-hidden="true">
                {people.slice(0, 5).map((p) => <Face key={p.id} person={p} people={people} faces={faces} size="xs" />)}
              </span>
            )}
          </header>
          <div className="sp-tabs" role="tablist" aria-label={t('sp.title')}>
            {[['today', 'sp.tabToday'], ['kas', 'sp.tabKas']].map(([k, key]) => (
              <Pressable key={k} type="button" role="tab" id={`sp-tab-${k}`} aria-selected={tab === k} aria-controls="sp-tabpanel"
                className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{t(key)}</Pressable>
            ))}
          </div>
          <div className="sp-scroll" id="sp-tabpanel" role="tabpanel" aria-labelledby={`sp-tab-${tab}`} key={tab}>
            {tab === 'today' ? (
              <>
                <section className="sp-sec" aria-label={t('sp.dayAria', { day: t('sp.tabToday'), amount: eur(mineToday.cents) })}>
                  <div className="sp-sech"><h2>{t('sp.tabToday')}</h2><span>{eur(mineToday.cents)}</span></div>
                  {plannedFood > 0 && (
                    <div className="sp-plan" role="img" aria-label={t('mt.foodVsPlan', { spent: formatMoney(foodToday), plan: formatMoney(plannedFood) })}>
                      {(() => {
                        const scale = Math.max(foodToday, plannedFood) * 1.15;
                        return (
                          <>
                            <i className="sp-plan-fill" style={{ transform: `scaleX(${Math.min(1, foodToday / scale)})` }} />
                            <u style={{ left: `${(plannedFood / scale) * 100}%` }} />
                            <em style={{ left: `${(plannedFood / scale) * 100}%` }}>{t('sp.plan')}</em>
                          </>
                        );
                      })()}
                    </div>
                  )}
                  {todayRows.length ? (
                    <div className="sp-list">
                      {todayRows.map((r) => <SpendRow key={r.id} row={r} people={people} faces={faces} onOpen={openRow} fresh={fresh === r.id} />)}
                    </div>
                  ) : <p className="sp-empty">{t('sp.empty')}</p>}
                </section>
                {yRows.length > 0 && (
                  <section className="sp-sec" aria-label={t('sp.dayAria', { day: t('sp.yesterday'), amount: eur(mineOnDay(rows, yesterdayIso).cents) })}>
                    <div className="sp-sech"><h2>{t('sp.yesterday')}</h2><span>{eur(mineOnDay(rows, yesterdayIso).cents)}</span></div>
                    <div className="sp-list">
                      {yRows.map((r) => <SpendRow key={r.id} row={r} people={people} faces={faces} onOpen={openRow} fresh={fresh === r.id} />)}
                    </div>
                  </section>
                )}
                {rows.length > todayRows.length + yRows.length && (
                  <Pressable type="button" className="sp-seeall" onClick={() => setSheet({ kind: 'all' })}>
                    <span>{t('sp.allSpends')}</span><span className="sp-cnt">{rows.filter((r) => !r.priv).length}</span><ChevGlyph size={18} />
                  </Pressable>
                )}
              </>
            ) : others.length === 0 ? (
              <div className="sp-nobody">
                <p>{t('sp.nobody')}</p>
                {onCrew && <Pressable type="button" className="sp-pill" onClick={() => { onCrew(); close(); }}>{t('sp.addPeople')}</Pressable>}
              </div>
            ) : (
              <>
                {transfers.length > 0 ? (
                  <section className="sp-sec">
                    <div className="sp-prog">
                      <span className="sp-pbar" aria-hidden="true">
                        {Array.from({ length: totalCount }, (_, i) => <i key={i} className={i < doneCount ? 'is-on' : ''} />)}
                      </span>
                      <span className="sp-ptxt"><b>{t('sp.progressOf', { done: doneCount, n: totalCount })}</b> {t('sp.progressRest')}</span>
                    </div>
                    <div className="sp-sech">
                      <h2>{t('sp.settle')}</h2>
                      {inbound.filter((x) => !nudgedRecently(x.from)).length > 1 && (
                        <Pressable type="button" className="sp-link" onClick={() => setSheet({ kind: 'nudge', all: true })}>{t('sp.nudgeAll')}</Pressable>
                      )}
                    </div>
                    <div className="sp-list">{[...inbound, ...outbound].map(trow)}</div>
                    {between.length > 0 && (
                      <>
                        <h3 className="sp-otherh">{t('sp.between')}</h3>
                        {between.map((x) => (
                          <div key={`${x.from}-${x.to}`} className="sp-orow">
                            <Face person={byId(x.from)} people={people} faces={faces} size="xs" />
                            <ArrowGlyph size={13} />
                            <Face person={byId(x.to)} people={people} faces={faces} size="xs" />
                            <span>{t('sp.toWho', { from: personName(t, byId(x.from), people), to: personName(t, byId(x.to), people) })}</span>
                            <b>{eur(x.cents)}</b>
                            <Pressable type="button" className="sp-ok is-sm" onClick={() => markPaid(x)}
                              aria-label={t('sp.markPaid', { from: personName(t, byId(x.from), people), to: personName(t, byId(x.to), people), amount: eur(x.cents) })}>
                              <CheckGlyph size={14} />
                            </Pressable>
                          </div>
                        ))}
                      </>
                    )}
                  </section>
                ) : sharedRows.length > 0 ? (
                  <p className="sp-rond"><CheckGlyph size={18} />{t('sp.allSquare')}</p>
                ) : null}
                <section className="sp-sec">
                  <div className="sp-sech"><h2>{t('sp.everyone')}</h2></div>
                  <div className="sp-list">
                    {people.map((p) => {
                      const v = net[p.id] || 0;
                      const zero = v === 0;
                      const cls = zero ? '' : v > 0 ? ' is-pos' : ' is-neg';
                      const name = personName(t, p, people);
                      const tag = zero ? '' : p.id === low ? t(p.me ? 'sp.winkLowYou' : 'sp.winkLow') : p.id === top ? t('sp.winkTop') : '';
                      return (
                        <div key={p.id} className={`sp-brow${cls}`}>
                          <Pressable type="button" className="sp-facebtn" onClick={() => pickFace(p.id)} aria-label={t('sp.facePhoto', { name })}>
                            <Face person={p} people={people} faces={faces} size="md" />
                          </Pressable>
                          <span className="sp-bn"><span>{name}</span>{tag && <small>{tag}</small>}</span>
                          <span className="sp-bal" aria-hidden="true"><i style={{ width: `max(4px, ${(Math.abs(v) / maxAbs) * 50}%)`, opacity: zero ? 0 : 1 }} /></span>
                          <b className="sp-bv">
                            <span className="sp-sr">{t(zero ? 'sp.even0' : v > 0 ? 'sp.gets' : 'sp.owes', { name, amount: eur(Math.abs(v)) })}</span>
                            <span aria-hidden="true">{zero ? eur(0) : `${v > 0 ? '+' : '-'} ${eur(Math.abs(v))}`}</span>
                          </b>
                        </div>
                      );
                    })}
                  </div>
                </section>
                {rows.some((r) => !r.priv) && (
                  <Pressable type="button" className="sp-seeall" onClick={() => setSheet({ kind: 'all' })}>
                    <span>{t('sp.allSpends')}</span><span className="sp-cnt">{rows.filter((r) => !r.priv).length}</span><ChevGlyph size={18} />
                  </Pressable>
                )}
              </>
            )}
          </div>
          <div className="sp-dock">
            {hasMic && <Pressable type="button" className="sp-side" onClick={openMic} aria-label={t('sp.mic')}><MicGlyph size={22} /></Pressable>}
            <Pressable type="button" className="sp-addbtn" onClick={openAdd} aria-label={t('mt.addSpend')}><PlusGlyph size={22} />{t('sp.add')}</Pressable>
            <Pressable type="button" className="sp-side" onClick={openCam} aria-label={t('sp.cam')}><CamGlyph size={22} /></Pressable>
          </div>
          <input ref={faceInput} type="file" accept="image/*" hidden onChange={faceChosen} />
        </div>
        {sheet && body && (
          <Sheet kind={sheet.kind} dark={sheet.kind === 'scan'} label={sheetLabel} onClose={closeSheet} closeRef={sheetClose}>{body}</Sheet>
        )}
        {toast && (
          <div className="sp-toast" role="status" key={toast.id}>
            <span>{toast.text}</span>
            {toast.undo && <Pressable type="button" onClick={undoToast}>{t('saved.undo')}</Pressable>}
          </div>
        )}
      </div>
    </div>
  );
  return createPortal(page, document.body);
}

export default SpendPage;
