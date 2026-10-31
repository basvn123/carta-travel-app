import React, { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button, Chip } from '../components/ui/index.js';
import { CheckIcon, PlusIcon } from '../components/Icons.jsx';
import { formatMoney } from '../lib/money.js';
import { priceRequest, priceDay } from '../lib/price/index.js';
import { nightsBetween } from '../lib/tripDates.js';
import { tally, leader, fitsBand, barScale, owesVote, tripTotal } from './groupBand.js';
import { useTogether, togetherActions } from './useTogether.js';
import { Block, ToneFace, ToneFaces, fmtShort, nameOf } from './parts.jsx';

/**
 * Group trips (T931, migration 055): a few accepted friends decide one trip.
 * When and Where are two polls, one vote each, every option priced by
 * Carta's own price model (lib/price/, the traveller's settings) as a TRIP
 * TOTAL a person: the day price at the leading place or dates times that
 * window's nights (T938, the owner: "focus on the total trip budget"). It is
 * the bed and the food and drink; getting there is left out because every
 * member leaves from their own home, and the result says so. Each member may
 * set a private maximum for the whole trip; the band that fits everyone
 * comes back from the server as one number (group_trip_band), and the page
 * never sees another member's value.
 */

const money = (n) => formatMoney(n, { precision: 'whole' });

/** Day price a person at one place, for a window when there is one, from
 *  the price engine (lib/price/) with the traveller's own settings. The
 *  page multiplies it by the window's nights (tripTotal). */
function usePricer(destinations, choices) {
  return useMemo(() => {
    const reqs = new Map();
    const reqFor = (start, end) => {
      const key = start && end ? `${start}:${end}` : '-';
      if (!reqs.has(key)) {
        reqs.set(key, start && end
          ? priceRequest({ choices, departDate: start, returnDate: end, ownDates: true })
          : priceRequest({ choices }));
      }
      return reqs.get(key);
    };
    // Each figure is worked out once per place and window: the engine repairs
    // a place against the whole catalogue, which is not free.
    const memo = new Map();
    return (destId, start = null, end = null) => {
      const key = `${destId}|${start}|${end}`;
      if (memo.has(key)) return memo.get(key);
      const d = destinations?.[destId];
      let v = null;
      if (d) {
        try { v = priceDay(d, reqFor(start, end), destinations)?.dayEur; } catch { v = null; }
      }
      const out = Number.isFinite(v) ? v : null;
      memo.set(key, out);
      return out;
    };
  }, [destinations, choices]);
}

function peopleOf(g, ids) {
  return ids.map((id) => {
    const m = g.members.find((x) => x.userId === id);
    return { id, name: m?.name || '', emoji: m?.emoji || '' };
  });
}

/** What a group needs from you right now, for the hub's To answer. */
export function groupWaits(s) {
  return s.groups.filter((g) => g.myStatus === 'invited'
    || (g.myStatus === 'joined' && !g.bookedPlanId
      && (owesVote(g.options, g.votes, s.userId, 'when') || owesVote(g.options, g.votes, s.userId, 'where'))));
}

/** The hub's card for one group trip. */
export function GroupCard({ g, me, onOpen }) {
  const { t } = useI18n();
  const joined = g.members.filter((m) => m.status === 'joined');
  const voted = new Set(g.votes.map((v) => v.userId));
  return (
    <article className="tg-gp">
      <div className="tg-gp-hd">
        <div>
          <b>{g.title}</b>
          <span>{g.bookedPlanId ? t('tg.booked') : t('tg.votedOf', { n: joined.filter((m) => voted.has(m.userId)).length, m: joined.length })}</span>
        </div>
        <ToneFaces me={me} people={joined.map((m) => ({ id: m.userId, name: m.name, emoji: m.emoji }))} />
      </div>
      {g.band?.ready && (
        <div className="tg-fit">
          <div className="tg-fit-row"><span>{t('tg.fitsAll')}</span><b>{t('tg2.upToTrip', { price: money(g.band.top) })}</b></div>
        </div>
      )}
      <Button variant="secondary" onClick={onOpen}>{t('tg.open')}</Button>
    </article>
  );
}

/** One option of a poll: a pressed toggle with its votes and price. */
function Option({ o, title, sub, over, people, me, onVote }) {
  return (
    <Button className="tg-opt" aria-pressed={o.mine} onClick={onVote}>
      <span className="tg-opt-fill" style={{ transform: `scaleX(${o.share})` }} aria-hidden="true" />
      <span>
        <b>{title}</b>
        {sub && <small className={over ? 'is-over' : ''}>{sub}</small>}
      </span>
      <ToneFaces me={me} people={people} />
      <span className="tg-opt-ck" aria-hidden="true">{o.mine && <CheckIcon size={14} />}</span>
    </Button>
  );
}

export function GroupView({ back, headRef, groupId, destinations, choices, onOpenTripPlan }) {
  const { t, lang } = useI18n();
  const s = useTogether();
  const g = s.groups.find((x) => x.id === groupId);
  const price = usePricer(destinations, choices);
  const [error, setError] = useState('');
  const [budget, setBudget] = useState('');
  const [editBudget, setEditBudget] = useState(false);
  const [addWhen, setAddWhen] = useState({ start: '', end: '' });
  const [addWhere, setAddWhere] = useState('');
  const [busy, setBusy] = useState(false);

  const cityIndex = useMemo(() => {
    const m = new Map();
    for (const d of Object.values(destinations || {})) if (d?.city && !m.has(d.city)) m.set(d.city, d.id);
    return m;
  }, [destinations]);

  if (!g) {
    return (
      <div className="tg-page">
        <div className="tg-head is-sub">{back}<h1 className="tg-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{t('tg.groupTrips')}</h1></div>
        <p className="tg-muted">{t('tg.groupGone')}</p>
      </div>
    );
  }
  const me = s.userId;
  const fail = () => setError(t('friends.unavailable'));
  const whenOpts = g.options.filter((o) => o.kind === 'when');
  const whereOpts = g.options.filter((o) => o.kind === 'where');
  const whenT = tally(whenOpts, g.votes, me);
  const whereT = tally(whereOpts, g.votes, me);
  const lead = {
    where: leader(whereT, (o) => price(o.destId)),
    when: leader(whenT),
  };
  const placeId = lead.where?.destId || null;
  // Every figure is a trip total a person: the day price at those dates
  // times that window's nights. A place is priced over the leading dates; a
  // window at the leading place. Without the other half there is no total.
  const totalAt = (destId, w) => (destId && w ? tripTotal(price(destId, w.start, w.end), nightsBetween(w.start, w.end)) : null);
  const totalsWhere = whereT.map((o) => totalAt(o.destId, lead.when));
  const totalsWhen = whenT.map((o) => totalAt(placeId, o));
  const joined = g.members.filter((m) => m.status === 'joined');
  const isOwner = g.ownerId === me;
  const vote = (kind, o) => togetherActions.vote(g.id, kind, o.mine ? null : o.id).catch(fail);
  const leadTotal = totalAt(placeId, lead.when);
  const scale = barScale([...totalsWhere, ...totalsWhen, g.band?.top, g.myBudget].filter(Number.isFinite));
  const totalLine = (p) => {
    if (!Number.isFinite(p)) return null;
    return fitsBand(p, g.band) === false ? t('tg2.tripOver', { price: money(p) }) : t('tg2.forTrip', { price: money(p) });
  };

  const saveBudget = () => {
    const n = Math.round(Number(budget));
    if (!Number.isFinite(n) || n < 1 || n > 99999) return;
    togetherActions.setBudget(g.id, n).then(() => { setEditBudget(false); setBudget(''); }).catch(fail);
  };
  const book = async () => {
    const d = destinations?.[placeId];
    if (!d || !lead.when) return;
    setBusy(true);
    try {
      await togetherActions.book(g, { destId: placeId, city: d.city, country: d.country, start: lead.when.start, end: lead.when.end });
    } catch { fail(); } finally { setBusy(false); }
  };
  const addOption = (opt) => togetherActions.addOption(g.id, opt).catch(fail);

  if (g.myStatus === 'invited') {
    const owner = g.members.find((m) => m.userId === g.ownerId);
    return (
      <div className="tg-page">
        <div className="tg-head is-sub">{back}<h1 className="tg-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{g.title}</h1></div>
        <div className="tg-wr">
          <ToneFace id={g.ownerId} name={owner?.name || ''} emoji={owner?.emoji} />
          <span className="tg-wr-tx"><b>{g.title}</b><span>{t('tg.groupFrom', { who: owner?.name || '' })}</span></span>
          <span className="tg-wr-acts">
            <Button variant="primary" size="sm" onClick={() => togetherActions.respondGroup(g.id, true).catch(fail)}>{t('coplan.join')}</Button>
            <Button variant="secondary" size="sm" onClick={() => togetherActions.respondGroup(g.id, false).catch(fail)}>{t('friends.decline')}</Button>
          </span>
        </div>
        {error && <div className="auth-error" role="alert">{error}</div>}
      </div>
    );
  }

  return (
    <div className="tg-page">
      <div className="tg-head is-sub">
        {back}
        <h1 className="tg-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{g.title}</h1>
        <ToneFaces me={me} people={joined.map((m) => ({ id: m.userId, name: m.name, emoji: m.emoji }))} />
      </div>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <div className="tg-grid">
        <div className="tg-col">
          <article className="tg-gp tg-o-meet">
            <div className="tg-poll" role="group" aria-labelledby="tg-q-when">
              <span className="tg-poll-q" id="tg-q-when">{t('tg.when')}</span>
              {whenT.map((o, i) => {
                const p = totalsWhen[i];
                const sub = totalLine(p) || t('tg.nightsN', { n: nightsBetween(o.start, o.end) });
                return (
                  <Option key={o.id} o={o} me={me} title={fmtShort(o.start, o.end, lang, t('friends.dateJoin'))} sub={sub}
                    over={fitsBand(p, g.band) === false} people={peopleOf(g, o.voters)} onVote={() => vote('when', o)} />
                );
              })}
              {!g.bookedPlanId && (
                <form className="tg-addopt" onSubmit={(e) => { e.preventDefault(); if (addWhen.start && addWhen.end > addWhen.start) { addOption({ kind: 'when', start: addWhen.start, end: addWhen.end }); setAddWhen({ start: '', end: '' }); } }}>
                  <input type="date" aria-label={t('tg.from')} value={addWhen.start} onChange={(e) => setAddWhen((w) => ({ ...w, start: e.target.value }))} />
                  <input type="date" aria-label={t('tg.until')} value={addWhen.end} min={addWhen.start || undefined} onChange={(e) => setAddWhen((w) => ({ ...w, end: e.target.value }))} />
                  <Button type="submit" variant="quiet" size="sm" iconStart={<PlusIcon size={16} />} disabled={!addWhen.start || !(addWhen.end > addWhen.start)}>{t('tg.addDates')}</Button>
                </form>
              )}
            </div>
            <div className="tg-poll" role="group" aria-labelledby="tg-q-where">
              <span className="tg-poll-q" id="tg-q-where">{t('tg.where')}</span>
              {whereT.map((o, i) => {
                const d = destinations?.[o.destId];
                const p = totalsWhere[i];
                return (
                  <Option key={o.id} o={o} me={me} title={d?.city || o.destId} sub={totalLine(p)} over={fitsBand(p, g.band) === false}
                    people={peopleOf(g, o.voters)} onVote={() => vote('where', o)} />
                );
              })}
              {!g.bookedPlanId && (
                <form className="tg-addopt" onSubmit={(e) => { e.preventDefault(); const id = cityIndex.get(addWhere.trim()); if (id) { addOption({ kind: 'where', destId: id }); setAddWhere(''); } }}>
                  <input type="text" list="tg-cities" aria-label={t('tg.where')} value={addWhere} onChange={(e) => setAddWhere(e.target.value)} />
                  <datalist id="tg-cities">
                    {[...cityIndex.keys()].slice(0, 4000).map((c) => <option key={c} value={c} />)}
                  </datalist>
                  <Button type="submit" variant="quiet" size="sm" iconStart={<PlusIcon size={16} />} disabled={!cityIndex.has(addWhere.trim())}>{t('tg.addPlace')}</Button>
                </form>
              )}
            </div>
          </article>
        </div>
        <div className="tg-col">
          <div className="tg-fit tg-o-groups">
            <div className="tg-fit-row">
              <span>{t('tg.budget')}</span>
              <b>{g.band?.ready ? t('tg2.upToTrip', { price: money(g.band.top) }) : t('tg.budgetsSet', { n: g.band?.set || 0, m: 3 })}</b>
            </div>
            {g.band?.ready && (
              <div className="tg-fitbar" aria-hidden="true">
                <i className="tg-fitbar-ok" style={{ width: `calc(${scale.pct(g.band.top)}% - 4px)` }} />
                <span className="tg-fitbar-tick" style={{ left: `${scale.pct(g.band.top)}%` }} />
                <span className="tg-fitbar-lbl" style={{ left: `${scale.pct(g.band.top)}%` }}>{money(g.band.top)}</span>
                {Number.isFinite(g.myBudget) && g.myBudget !== g.band.top && (
                  <>
                    <span className="tg-fitbar-tick is-mine" style={{ left: `${scale.pct(g.myBudget)}%` }} />
                    <span className="tg-fitbar-lbl" style={{ left: `${scale.pct(g.myBudget)}%` }}>{money(g.myBudget)}</span>
                  </>
                )}
              </div>
            )}
            {editBudget || !Number.isFinite(g.myBudget) ? (
              <form className="tg-budget" onSubmit={(e) => { e.preventDefault(); saveBudget(); }}>
                <label className="tg-hand">
                  <span className="tg-label">{t('tg2.yourMaxTrip')}</span>
                  <input type="number" inputMode="numeric" min="1" max="99999" value={budget} onChange={(e) => setBudget(e.target.value)} />
                </label>
                <Button type="submit" variant="secondary" size="sm" disabled={!(Number(budget) >= 1 && Number(budget) <= 99999)}>{t('tg.save')}</Button>
              </form>
            ) : (
              <div className="tg-fit-row">
                <span>{t('tg.yoursPrivate', { price: money(g.myBudget) })}</span>
                <Button variant="quiet" size="sm" onClick={() => { setBudget(String(g.myBudget)); setEditBudget(true); }}>{t('tg.change')}</Button>
              </div>
            )}
          </div>

          {placeId && lead.when && (
            <article className="tg-gp tg-o-plans">
              <h2 className="tg-h2">{t('tg.resultTitle', { place: destinations?.[placeId]?.city || placeId, dates: fmtShort(lead.when.start, lead.when.end, lang, t('friends.dateJoin')) })}</h2>
              {Number.isFinite(leadTotal) && (
                <>
                  <div className="tg-money2"><b>{money(leadTotal)}</b><span>{t('tg2.aPersonTrip')}</span></div>
                  <p className="tg-muted">{t('tg2.bedAndFood')}</p>
                </>
              )}
              {g.bookedPlanId ? (
                <Button variant="secondary" onClick={() => onOpenTripPlan?.(g.bookedPlanId)}>{t('saved.openTrip')}</Button>
              ) : isOwner ? (
                <Button variant="primary" loading={busy} onClick={book}>{t('tg.bookFor', { n: joined.length })}</Button>
              ) : null}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}

/** A new group trip: a title and the friends to ask. */
export function NewGroup({ back, headRef, onCreated }) {
  const { t } = useI18n();
  const s = useTogether();
  const friends = s.links.filter((l) => l.kind === 'friend');
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (id) => setPicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const create = async (e) => {
    e.preventDefault();
    if (!title.trim() || !picked.size) return;
    setBusy(true);
    try { onCreated(await togetherActions.createGroup(title.trim(), [...picked])); } catch { setError(t('friends.unavailable')); } finally { setBusy(false); }
  };
  return (
    <div className="tg-page">
      <div className="tg-head is-sub">{back}<h1 className="tg-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{t('tg.newGroup')}</h1></div>
      <form className="tg-new" onSubmit={create}>
        <label className="tg-hand">
          <span className="tg-label">{t('tg.groupName')}</span>
          <input type="text" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="tg-pick" role="group" aria-label={t('friends.title')}>
          {friends.map((l) => (
            <Chip key={l.userId} selected={picked.has(l.userId)} onClick={() => toggle(l.userId)}>{nameOf(l)}</Chip>
          ))}
        </div>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <div><Button type="submit" variant="primary" loading={busy} disabled={!title.trim() || !picked.size}>{t('tg.create')}</Button></div>
      </form>
    </div>
  );
}

export function GroupBlock({ s, onView }) {
  const { t } = useI18n();
  if (s.groupsMissing) return null;
  const joined = s.groups.filter((g) => g.myStatus === 'joined');
  const hasFriends = s.links.some((l) => l.kind === 'friend');
  if (!joined.length && !hasFriends) return null;
  return (
    <Block
      id="tg-groups-h"
      title={t('tg.groupTrips')}
      className="tg-o-groups"
      action={hasFriends ? <Button variant="quiet" size="sm" iconStart={<PlusIcon size={16} />} onClick={() => onView('newgroup')}>{t('tg.new')}</Button> : null}
    >
      {joined.map((g) => <GroupCard key={g.id} g={g} me={s.userId} onOpen={() => onView('group', g.id)} />)}
    </Block>
  );
}
