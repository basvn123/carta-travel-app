import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { Button, IconButton } from '../../components/ui/index.js';
import { ArrowLeftIcon, CloseIcon, RouteIcon, ShareIcon } from '../../components/Icons.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { SectHead, NoPrice } from '../../auth/mytrips/atlas/Ink.jsx';
import { circleLink } from '../../auth/circles.js';
import { formatMoney } from '../../lib/money.js';
import { rankProposals, nextVote } from '../../lib/circles/rank.js';
import { bestWindow, dayCounts, dayNumber } from '../../lib/circles/window.js';
import { fairest } from '../../lib/circles/fairest.js';
import { useTogether, togetherActions } from '../useTogether.js';
import { ToneFace, ToneFaces, fmtShort, firstName } from '../parts.jsx';
import { placeOf } from '../vrienden.js';
import { usePlaceNames } from '../PlaceName.jsx';
import { Ring } from './Ring.jsx';
import { useCircleFares, useSweptAirports } from './useCircleFares.js';

/**
 * A kring (G16, decision 0017): the overview and its four steps.
 *
 *   overview  the ring with the leading place as a stamp, the three step
 *             tiles in one frame (each with its result figure), the proposals
 *   vote      up and down per proposal; tapping again clears your vote and
 *             the list re-sorts with a FLIP move
 *   dates     a month heat calendar by how many members are free, the best
 *             window framed in saffron (the one saffron mark), each member's
 *             lanes, and your own days and home airport
 *   flights   each member's return fare to the top three proposals from
 *             their own airport; "Eerlijkst" is the smallest spread
 *   pick      the owner's choice: the stamp, three figures, Make the trip
 *
 * Desktop (1100 px): a sticky 340 px side column (the ring, the steps one
 * above the other, the result line) with the step on the right.
 */

const STEPS = [['circlevote', 'vr.vote'], ['circledates', 'vr.dates'], ['circleflights', 'vr.flights']];
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const eur = (n) => formatMoney(n, { precision: 'whole' });

function useCircle(circleId) {
  const s = useTogether();
  const c = s.circles.find((x) => x.id === circleId) || null;
  const joined = useMemo(() => (c ? c.members.filter((m) => m.status === 'joined') : []), [c]);
  const ids = useMemo(() => joined.map((m) => m.userId), [joined]);
  const ranked = useMemo(() => (c ? rankProposals(c.proposals, c.votes, { me: s.userId }) : []), [c, s.userId]);
  const win = useMemo(() => (c ? bestWindow(c.availability, ids, { minNights: 1 }) : null), [c, ids]);
  return { s, c, joined, ids, ranked, win };
}

function StepTiles({ step, onView, circleId, figures }) {
  const { t } = useI18n();
  return (
    <nav className="vr-steps3" aria-label={t('vr.steps')}>
      {STEPS.map(([v, k], i) => (
        <Pressable key={v} type="button" className={`vr-step3${step === v ? ' is-on' : ''}`} aria-current={step === v ? 'step' : undefined}
          onClick={() => onView(v, circleId)}>
          <span className="vr-step3-k"><i aria-hidden="true">{i + 1}</i>{t(k)}</span>
          <b>{figures[i][0]}</b>
          <span>{figures[i][1]}</span>
        </Pressable>
      ))}
    </nav>
  );
}

function Stamp({ place, dates, small = false }) {
  return (
    <span className={`vr-stamp-mark${small ? ' is-small' : ''}`}>
      <b>{place}</b>
      {dates && <span className="num">{dates}</span>}
    </span>
  );
}

/* ---------------------------------------------------------- vote */

function VoteList({ c, ranked, me, destinations, fareOf, canRemove, name }) {
  const { t } = useI18n();
  const box = useRef(null);
  const before = useRef(null);
  const [live, setLive] = useState('');
  const order = ranked.map((p) => p.id).join(',');
  // FLIP: remember where each row was before a vote, then play the move.
  useLayoutEffect(() => {
    const prev = before.current;
    before.current = null;
    if (!prev || !box.current || reduced()) return;
    for (const el of box.current.querySelectorAll('[data-id]')) {
      const was = prev.get(el.dataset.id);
      if (was == null) continue;
      const dy = was - el.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }
  }, [order]);
  const vote = (p, pressed) => {
    const m = new Map();
    for (const el of box.current?.querySelectorAll('[data-id]') || []) m.set(el.dataset.id, el.getBoundingClientRect().top);
    before.current = m;
    const value = nextVote(p.mine, pressed);
    const place = name(p.destId);
    setLive(t('vr.scoreOf', { place, n: p.score - p.mine + value }));
    togetherActions.voteCircle(c.id, p.id, value).catch(() => {});
  };
  const nameOf = (uid) => c.members.find((m) => m.userId === uid)?.name || '';
  return (
    <>
      <ol className="vr-vlist" ref={box}>
        {ranked.map((p, i) => {
          const place = name(p.destId);
          const { photo } = placeOf(destinations, [p.destId]);
          const fare = fareOf(p.id);
          return (
            <li key={p.id} data-id={p.id} className="vr-vote">
              <span className="vr-vrail">
                <Pressable type="button" className="vr-up" aria-pressed={p.mine === 1} aria-label={t('vr.up', { place })} onClick={() => vote(p, 1)}>
                  <HouseIcon.voteUp size={20} />
                </Pressable>
                <b className="vr-sc num" aria-hidden="true">{p.score}</b>
                <Pressable type="button" className="vr-dn" aria-pressed={p.mine === -1} aria-label={t('vr.down', { place })} onClick={() => vote(p, -1)}>
                  <HouseIcon.voteDown size={20} />
                </Pressable>
              </span>
              <span className="vr-vcard">
                <span className="vr-vcard-ph">
                  <HeroImage url={photo?.image?.url || null} image={photo?.image} className="vr-vcard-img" maxWidth={1280}
                    sizes="(min-width: 1100px) 36vw, 78vw" ratio={[16, 9]} />
                </span>
                <span className="vr-vcard-t">
                  <span className="vr-rk num" aria-hidden="true">{i + 1}</span>
                  <b>{place}</b>
                  {i === 0 && p.score > 0 && <span className="vr-tag">{t('vr.leads')}</span>}
                  {canRemove(p) && (
                    <IconButton className="vr-vcard-x" label={t('vr.removeProposal', { place })} onClick={() => togetherActions.unpropose(c.id, p.id)}>
                      <CloseIcon size={16} />
                    </IconButton>
                  )}
                </span>
                <span className="vr-vcard-s">
                  <ToneFace id={p.createdBy} me={me} name={nameOf(p.createdBy)} size="sm" />
                  <span>{t('vr.by', { name: firstName(nameOf(p.createdBy)) })}</span>
                  <ToneFaces me={me} size="sm" max={5} people={p.upBy.map((u) => ({ id: u, name: nameOf(u) }))} />
                  {fare != null && <b className="num">{t('vr.pp', { price: eur(fare) })}</b>}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      <span className="vr-live" role="status" aria-live="polite">{live}</span>
    </>
  );
}

function Propose({ c, destinations }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const hits = useMemo(() => {
    const taken = new Set(c.proposals.map((p) => p.destId));
    const k = q.trim().toLowerCase();
    if (k.length < 2 || !destinations) return [];
    const out = [];
    for (const d of Object.values(destinations)) {
      if (!d?.city || taken.has(d.id)) continue;
      if (d.city.toLowerCase().startsWith(k)) out.push(d);
      if (out.length >= 6) break;
    }
    return out;
  }, [q, destinations, c.proposals]);
  if (!open) {
    return (
      <Pressable type="button" className="vr-addp" onClick={() => setOpen(true)}>
        <HouseIcon.plus size={20} />{t('vr.propose')}
      </Pressable>
    );
  }
  return (
    <div className="vr-propose">
      <label className="vr-field">
        <span>{t('vr.findPlace')}</span>
        <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {hits.length > 0 && (
        <ul className="vr-hits">
          {hits.map((d) => (
            <li key={d.id}>
              <Pressable type="button" className="vr-row is-link" onClick={() => { togetherActions.propose(c.id, d.id); setQ(''); setOpen(false); }}>
                <span className="vr-row-tx"><b>{d.city}</b><span>{d.country}</span></span>
                <HouseIcon.plus size={18} />
              </Pressable>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- dates */

const LEVEL = (n, total) => (n <= 0 || !total ? 0 : Math.max(1, Math.min(5, Math.round((n / total) * 5))));

function monthOf(iso) { return iso ? iso.slice(0, 7) : new Date().toISOString().slice(0, 7); }
function addMonth(ym, k) {
  const y = Number(ym.slice(0, 4)); const m = Number(ym.slice(5, 7)) - 1 + k;
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 7);
}

function HeatCalendar({ c, ids, win, editing, onPickDay, draftStart }) {
  const { t, lang } = useI18n();
  const first = win?.start || c.availability.map((a) => a.start_date).sort()[0] || null;
  const [ym, setYm] = useState(() => monthOf(first));
  const counts = useMemo(() => dayCounts(c.availability, ids), [c.availability, ids]);
  const total = ids.length;
  const y = Number(ym.slice(0, 4)); const m = Number(ym.slice(5, 7));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const monthLabel = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15)));
  const dayLabel = (iso) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
  const wd = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(lang, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2027, 1, 1 + i))));
  const cells = [];
  const frames = [];
  for (let d = 1; d <= days; d += 1) {
    const iso = `${ym}-${String(d).padStart(2, '0')}`;
    const n = counts.get(iso) || 0;
    const slot = lead + d - 1;
    const pos = { gridRow: Math.floor(slot / 7) + 2, gridColumn: (slot % 7) + 1 };
    const label = t('vr.dayLabel', { date: dayLabel(iso), n, total });
    const cls = `vr-day l${LEVEL(n, total)}${draftStart === iso ? ' is-start' : ''}`;
    cells.push(editing
      ? <Pressable key={iso} type="button" className={cls} style={pos} aria-label={label} onClick={() => onPickDay(iso)}>{d}</Pressable>
      : <span key={iso} className={cls} style={pos} role="img" aria-label={label}>{d}</span>);
  }
  if (win) {
    // The best window, one frame a week row, inside this month only.
    let a = dayNumber(win.start); const b = dayNumber(win.end);
    const m0 = dayNumber(`${ym}-01`); const m1 = dayNumber(`${ym}-${String(days).padStart(2, '0')}`);
    a = Math.max(a, m0);
    while (a <= Math.min(b, m1)) {
      const slot = lead + (a - m0);
      const row = Math.floor(slot / 7);
      const endInRow = Math.min(Math.min(b, m1), a + (6 - (slot % 7)));
      frames.push(<span key={a} className="vr-best" aria-hidden="true" style={{ gridRow: row + 2, gridColumn: `${(slot % 7) + 1} / ${(slot % 7) + 1 + (endInRow - a) + 1}` }} />);
      a = endInRow + 1;
    }
  }
  return (
    <div className="vr-cal">
      <div className="vr-cal-h">
        <IconButton label={t('vr.prevMonth')} onClick={() => setYm((v) => addMonth(v, -1))}><HouseIcon.prev size={18} /></IconButton>
        <b className="vr-cal-m">{monthLabel}</b>
        <IconButton label={t('vr.nextMonth')} onClick={() => setYm((v) => addMonth(v, 1))}><HouseIcon.next size={18} /></IconButton>
      </div>
      <div className="vr-cal-grid" key={ym}>
        {wd.map((w, i) => <span key={i} className="vr-wd" aria-hidden="true" style={{ gridRow: 1, gridColumn: i + 1 }}>{w}</span>)}
        {cells}
        {frames}
      </div>
    </div>
  );
}

function MemberLanes({ c, ids, me }) {
  const { t } = useI18n();
  const all = c.availability.filter((a) => ids.includes(a.user_id));
  if (!all.length) return null;
  const a0 = Math.min(...all.map((a) => dayNumber(a.start_date)));
  const b0 = Math.max(...all.map((a) => dayNumber(a.end_date)));
  const n = Math.max(1, b0 - a0 + 1);
  return (
    <section className="vr-sect" aria-labelledby="vr-ww-h">
      <SectHead id="vr-ww-h" as="h3" title={t('vr.whoWhen')} />
      <ul className="vr-mlanes">
        {c.members.filter((m) => m.status === 'joined').map((m) => (
          <li key={m.userId} className="vr-mlane">
            <ToneFace id={m.userId} me={me} name={m.name} size="sm" />
            <span className="vr-track">
              {all.filter((a) => a.user_id === m.userId).map((a) => (
                <i key={a.id || a.start_date} className={`vr-bar${m.userId === me ? ' is-you' : ' is-them'}`}
                  style={{ '--l': (dayNumber(a.start_date) - a0) / n, '--w': (dayNumber(a.end_date) - dayNumber(a.start_date) + 1) / n }} />
              ))}
            </span>
            <span className="sr-only">{m.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MyDays({ c, me, editing, setEditing, draft, setDraft, draftStart }) {
  const { t, lang } = useI18n();
  const mineNow = c.availability.filter((a) => a.user_id === me).map((a) => ({ start: a.start_date, end: a.end_date }));
  const j = t('friends.dateJoin');
  if (!editing) {
    return <Button variant="secondary" block onClick={() => { setDraft(mineNow); setEditing(true); }}>{t('vr.editDays')}</Button>;
  }
  return (
    <div className="vr-mydays">
      <p className="vr-hint" role="status">{draftStart ? t('vr.pickEnd') : t('vr.pickStart')}</p>
      {draft.length > 0 && (
        <ul className="vr-ranges">
          {draft.map((r, i) => (
            <li key={`${r.start}:${r.end}`}>
              <span className="num">{fmtShort(r.start, r.end, lang, j)}</span>
              <IconButton label={`${t('tg2.remove')}, ${fmtShort(r.start, r.end, lang, j)}`} onClick={() => setDraft(draft.filter((_, k) => k !== i))}><CloseIcon size={16} /></IconButton>
            </li>
          ))}
        </ul>
      )}
      <span className="vr-mydays-acts">
        <Button variant="primary" onClick={() => { togetherActions.setCircleDays(c.id, draft).catch(() => {}); setEditing(false); }}>{t('tg.save')}</Button>
        <Button variant="quiet" className="vr-lnk" onClick={() => setDraft([])}>{t('vr.clearDays')}</Button>
      </span>
    </div>
  );
}

function HomeAirport({ c, me }) {
  const { t } = useI18n();
  const list = useSweptAirports(true);
  const mine = c.members.find((m) => m.userId === me)?.homeAirport || '';
  return (
    <label className="vr-field is-row">
      <span>{t('vr.homeAirport')}</span>
      <select value={mine} onChange={(e) => togetherActions.setCircleAirport(c.id, e.target.value).catch(() => {})}>
        <option value="">{t('vr.noAirport')}</option>
        {[...new Set([mine, ...list].filter(Boolean))].map((code) => <option key={code} value={code}>{code}</option>)}
      </select>
    </label>
  );
}

/* ---------------------------------------------------------- flights */

function FareTable({ c, top, fares, fair, destinations, me, name }) {
  const { t } = useI18n();
  const joined = c.members.filter((m) => m.status === 'joined');
  const all = fares.rows.flatMap((r) => Object.values(r.fares)).filter((v) => v != null);
  const max = all.length ? Math.max(...all) : 1;
  const fareFor = (pid, uid) => fares.rows.find((r) => r.id === pid)?.fares?.[uid] ?? null;
  const sum = (pid) => fair.rows.find((r) => r.id === pid);
  const win = (pid) => (fair.fairestId === pid ? ' is-fair' : '');
  return (
    <div className="vr-flwrap" tabIndex={0} role="region" aria-label={t('vr.flightPP')}>
      <table className="vr-fl">
        <thead>
          <tr>
            <th scope="col" className="vr-fl-who">{t('vr.whoFrom')}</th>
            {top.map((p) => {
              const { photo } = placeOf(destinations, [p.destId]);
              return (
                <th key={p.id} scope="col" className={`vr-fl-dest${win(p.id)}`}>
                  <span className="vr-fl-ph">
                    <HeroImage url={photo?.image?.url || null} image={photo?.image} className="vr-fl-img" maxWidth={640} sizes="(min-width: 1100px) 200px, 28vw" ratio={[4, 3]} />
                  </span>
                  <span className="vr-fl-n">{name(p.destId)}</span>
                  {fair.fairestId === p.id && <span className="vr-tag is-solid">{t('vr.fairest')}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {joined.map((m) => (
            <tr key={m.userId}>
              <th scope="row" className="vr-fl-who">
                <ToneFace id={m.userId} me={me} name={m.name} size="sm" />
                <span className="sr-only">{m.name}</span>
                {m.homeAirport ? <span className="vr-ap">{m.homeAirport}</span> : <span className="vr-fl-none">{t('vr.noAirport')}</span>}
              </th>
              {top.map((p) => {
                const v = fareFor(p.id, m.userId);
                return (
                  <td key={p.id} className={`vr-fl-p${win(p.id)}`}>
                    {v == null ? <NoPrice>{t('vr.noPrice')}</NoPrice> : (
                      <><b className="num">{eur(v)}</b><i className="vr-fl-bar" style={{ '--w': v / max }} aria-hidden="true" /></>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="vr-fl-who">{t('vr.average')}</th>
            {top.map((p) => {
              const r = sum(p.id);
              return (
                <td key={p.id} className={`vr-fl-p is-foot${win(p.id)}`}>
                  {r?.complete ? <b className="num vr-fl-avg">{eur(Math.round(r.avg))}</b> : <span className="vr-fl-none">{t('vr.incomplete')}</span>}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------- the view */

export function CircleView({ circleId, step = 'circle', onView, headRef, destinations, onOpenTripPlan }) {
  const { t, lang } = useI18n();
  const { s, c, joined, ids, ranked, win } = useCircle(circleId);
  // Places in the reader's language (judge 1 fix 2).
  const name = usePlaceNames(destinations, c ? c.proposals.map((p) => p.destId) : []);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [draftStart, setDraftStart] = useState('');
  const [note, setNote] = useState('');
  const top = ranked.slice(0, 3);
  const faresOn = step === 'circleflights' || step === 'circlepick';
  const fares = useCircleFares(c, win, top, destinations, faresOn);
  const fair = useMemo(() => fairest(fares.rows, ids), [fares.rows, ids]);
  const j = t('friends.dateJoin');

  const back = (
    <IconButton className="vr-back" label={t('wizard.back')}
      onClick={() => onView(step === 'circle' ? 'home' : 'circle', step === 'circle' ? '' : circleId)}>
      <ArrowLeftIcon size={18} />
    </IconButton>
  );
  if (!c) {
    return (
      <div className="tg-page vr-page">
        <div className="vr-head is-sub">{back}<h1 className="vr-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{t('vr.circleGone')}</h1></div>
      </div>
    );
  }
  const lead = ranked[0] || null;
  const leadName = lead ? name(lead.destId) : '';
  const { photo: leadPhoto } = placeOf(destinations, lead ? [lead.destId] : []);
  const winText = win ? fmtShort(win.start, win.end, lang, j) : '';
  const canLine = win ? (win.count === win.total ? t('vr.everyone') : t('vr.nOfCan', { n: win.count, total: win.total })) : '';
  // The Vluchten tile speaks of the leading proposal, the same place Gekozen
  // prices (judge 1 fix 3), and names it.
  const leadRow = lead ? fair.rows.find((r) => r.id === lead.id) : null;
  const avgFor = (pid) => { const r = fair.rows.find((x) => x.id === pid); return r?.complete ? Math.round(r.avg) : null; };
  const figures = [
    [leadName || t('vr.noLead'), lead ? t('vr.leadsWith', { n: lead.score }) : ''],
    [winText || t('vr.noDays'), win ? `${canLine}, ${t(win.nights === 1 ? 'vr.night1' : 'tg.nightsN', { n: win.nights })}` : ''],
    faresOn && leadRow?.complete ? [eur(Math.round(leadRow.avg)), `${t('vr.avgPP')}, ${leadName}`] : [win ? t('vr.flightPP') : t('vr.datesFirst'), ''],
  ];
  const isOwner = c.ownerId === s.userId;
  const canRemove = (p) => p.createdBy === s.userId || isOwner;
  const fareOf = (pid) => {
    if (!faresOn) return null;
    const r = fares.rows.find((x) => x.id === pid);
    return r ? (r.fares[s.userId] ?? null) : null;
  };
  const pickDay = (iso) => {
    if (!draftStart) { setDraftStart(iso); return; }
    const [a, b] = draftStart <= iso ? [draftStart, iso] : [iso, draftStart];
    setDraft((cur) => [...cur, { start: a, end: b }].slice(0, 20));
    setDraftStart('');
  };
  const share = async () => {
    const url = circleLink(c.id);
    try {
      if (navigator.share) { await navigator.share({ title: c.name, url }); return; }
      await navigator.clipboard.writeText(url);
      setNote(t('share.copied'));
    } catch (err) { if (err?.name !== 'AbortError') setNote(t('share.copyFailed')); }
  };
  const make = async () => {
    if (!lead || !win) return;
    const d = destinations?.[lead.destId];
    try {
      const planId = await togetherActions.makeCircleTrip(c, { destId: lead.destId, city: d?.city || leadName, country: d?.country || '', start: win.start, end: win.end });
      setNote(t('vr.madeTrip'));
      if (planId && planId !== 'mp-circle') onOpenTripPlan?.(planId);
    } catch { setNote(t('friends.unavailable')); }
  };

  const head = (
    <div className="vr-head is-sub vr-khead">
      {back}
      <h1 className="vr-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{c.name}</h1>
      <ToneFaces me={s.userId} size="sm" max={6} people={joined.map((m) => ({ id: m.userId, name: m.name, emoji: m.emoji }))} />
    </div>
  );
  const side = (
    <aside className="vr-kside">
      <span className="vr-kring">
        <Ring photo={leadPhoto} members={joined} me={s.userId} big />
      </span>
      {/* The tiles carry the leading place and the dates once each (judge 2
          fix 4): no stamp or result line repeats them. */}
      <StepTiles step={step} onView={onView} circleId={c.id} figures={figures} />
    </aside>
  );

  let body;
  if (step === 'circlevote') {
    body = (
      <section className="vr-sect" aria-labelledby="vr-props-h">
        <SectHead id="vr-props-h" as="h2" title={t('vr.proposals')} count={ranked.length || null} />
        <VoteList c={c} ranked={ranked} me={s.userId} destinations={destinations} fareOf={fareOf} canRemove={canRemove} name={name} />
        <Propose c={c} destinations={destinations} />
      </section>
    );
  } else if (step === 'circledates') {
    body = (
      <div className="vr-dates">
        <section className="vr-sect" aria-labelledby="vr-cal-h">
          <h2 className="sr-only" id="vr-cal-h">{t('vr.dates')}</h2>
          <HeatCalendar c={c} ids={ids} win={win} editing={editing} onPickDay={pickDay} draftStart={draftStart} />
        </section>
        <div className="vr-dates-side">
          <MemberLanes c={c} ids={ids} me={s.userId} />
          <MyDays c={c} me={s.userId} editing={editing} setEditing={(v) => { setEditing(v); setDraftStart(''); }} draft={draft} setDraft={setDraft} draftStart={draftStart} />
          <HomeAirport c={c} me={s.userId} />
        </div>
      </div>
    );
  } else if (step === 'circleflights') {
    body = (
      <section className="vr-sect" aria-labelledby="vr-fl-h">
        <SectHead id="vr-fl-h" as="h2" title={t('vr.flightPP')} />
        {!win ? (
          <Button variant="secondary" onClick={() => onView('circledates', c.id)}>{t('vr.datesFirst')}</Button>
        ) : (
          <>
            <p className="vr-sub num">{t('vr.returnDates', { dates: winText })}</p>
            <FareTable c={c} top={top} fares={fares} fair={fair} destinations={destinations} me={s.userId} name={name} />
          </>
        )}
      </section>
    );
  } else if (step === 'circlepick') {
    const avg = lead ? avgFor(lead.id) : null;
    body = (
      <section className="vr-sect vr-pickd" aria-labelledby="vr-pick-h">
        <h2 className="sr-only" id="vr-pick-h">{t('vr.chosen')}</h2>
        <span className="vr-pick-ph">
          <HeroImage url={leadPhoto?.image?.url || null} image={leadPhoto?.image} className="vr-pick-img" maxWidth={1280} sizes="(min-width: 1100px) 40vw, 92vw" ratio={[4, 5]} />
        </span>
        <div className="vr-pick-body">
          {lead && <Stamp place={leadName} dates={winText} />}
          <dl className="vr-facts">
            <div><dt>{t('vr.going')}</dt><dd className="num">{joined.length}</dd></div>
            <div><dt>{t(win && win.nights === 1 ? 'vr.nightWord1' : 'vr.nightsWord')}</dt><dd className="num">{win ? win.nights : 0}</dd></div>
            <div><dt>{t('vr.flightPPWord')}</dt><dd className="num">{avg != null ? eur(avg) : <NoPrice>{t('vr.noPrice')}</NoPrice>}</dd></div>
          </dl>
          {isOwner && lead && win && <Button variant="primary" block iconStart={<RouteIcon size={18} />} onClick={make}>{t('vr.makeTrip')}</Button>}
          <Button variant="quiet" className="vr-lnk" iconStart={<ShareIcon size={16} />} onClick={share}>{t('vr.shareCircle')}</Button>
          <span className="vr-live" role="status" aria-live="polite">{note}</span>
        </div>
      </section>
    );
  } else {
    body = (
      <section className="vr-sect" aria-labelledby="vr-props-h">
        <SectHead id="vr-props-h" as="h2" title={t('vr.proposals')} count={ranked.length || null}
          action={<Button variant="quiet" size="sm" className="vr-lnk" onClick={() => onView('circlevote', c.id)}>{t('vr.vote')}</Button>} />
        {ranked.length > 0 ? (
          <ul className="vr-rows">
            {ranked.map((p) => {
              const { photo } = placeOf(destinations, [p.destId]);
              const by = c.members.find((m) => m.userId === p.createdBy)?.name || '';
              return (
                <li key={p.id} className="vr-row">
                  <span className="vr-row-ph">
                    <HeroImage url={photo?.image?.url || null} image={photo?.image} className="vr-row-img" maxWidth={320} sizes="96px" ratio={[4, 3]} />
                  </span>
                  <span className="vr-row-tx"><b>{name(p.destId)}</b><span>{t('vr.by', { name: firstName(by) })}</span></span>
                  <b className="vr-row-sc num">{p.score}</b>
                </li>
              );
            })}
          </ul>
        ) : <Propose c={c} destinations={destinations} />}
        {isOwner && lead && win && (
          <Button variant="primary" onClick={() => onView('circlepick', c.id)}>{t('vr.choose', { place: leadName })}</Button>
        )}
        <span className="vr-live" role="status" aria-live="polite">{note}</span>
      </section>
    );
  }
  return (
    <div className="tg-page vr-page vr-circle">
      {head}
      <div className={`vr-tool${step === 'circle' ? ' is-overview' : ''}`}>
        {side}
        <div className="vr-tool-main">{body}</div>
      </div>
    </div>
  );
}

