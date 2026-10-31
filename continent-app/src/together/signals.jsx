import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button } from '../components/ui/index.js';
import { formatMoney } from '../lib/money.js';
import { favKey } from '../lib/favorites.js';
import { listTripCoplanners } from '../auth/coplanners.js';
import { FriendTripPanel } from '../auth/FriendTripPanel.jsx';
import { computeOverlaps, friendStaysIn } from './overlaps.js';
import { useTogether, friendIdsOf, stopsByTripOf, shareOf } from './useTogether.js';
import { IS_FRIENDS_MOCK } from './friendsMock.js';
import { ToneFace, ToneFaces, fmtShort, firstName, Block } from './parts.jsx';

/**
 * Friends where decisions happen (T929): one line each, and only with data.
 * Every figure here is either Carta's own price model or a friend's own
 * figure that friend switched on (056, list_friend_shares); a friend who
 * keeps costs, tips or saves to themselves shows none of them, and a place
 * no friend touched shows nothing at all.
 */

/** Ask App to open the day planner for a city and a day. */
export function planDayTogether(destId, date) {
  window.dispatchEvent(new CustomEvent('carta:plan-day', { detail: { destId, date } }));
}

/** Plans that meet for the signed-in account, Hide applied. */
export function useOverlaps(s) {
  return useMemo(() => {
    if (!s.signedIn) return [];
    const ids = friendIdsOf(s);
    return computeOverlaps({
      myPlans: s.myPlans.filter((p) => !p.coplan),
      friendTrips: s.friendTrips,
      stopsByTrip: stopsByTripOf(s),
      meetOn: s.visibility.showMeet,
      friendMeet: (id) => shareOf(s, id).showMeet,
      friendIds: ids,
      hidden: s.hidden,
    });
  }, [s]);
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Who went to a place (a shown trip there that has ended), who goes, and
 *  who saved it, with what each shares. */
export function useFriendsAt(destId) {
  const s = useTogether();
  return useMemo(() => {
    if (!destId || !s.signedIn) return { went: [], going: [], saved: [] };
    const today = todayIso();
    const friends = friendIdsOf(s);
    const went = [];
    const going = [];
    const seenWent = new Set();
    for (const tr of s.friendTrips) {
      if (!friends.has(tr.ownerId) || !(tr.destinationIds || []).includes(destId)) continue;
      const sh = shareOf(s, tr.ownerId);
      const notes = sh.trips.get(tr.tripPlanId) || {};
      const row = {
        friendId: tr.ownerId, name: tr.ownerName || `@${tr.ownerHandle}`, emoji: tr.ownerEmoji || '', trip: tr,
        dayCost: sh.showCosts && Number.isFinite(notes.dayCost) ? notes.dayCost : null,
        tip: sh.showTips && notes.tip ? notes.tip : null,
      };
      if (tr.endDate && tr.endDate < today) {
        if (!seenWent.has(tr.ownerId)) { seenWent.add(tr.ownerId); went.push(row); }
      } else {
        going.push(row);
      }
    }
    const key = favKey('dest', destId);
    const saved = s.links
      .filter((l) => l.kind === 'friend')
      .filter((l) => { const sh = shareOf(s, l.userId); return sh.showSaves && key && sh.saves.includes(key); })
      .map((l) => ({ friendId: l.userId, name: l.displayName || `@${l.handle}`, emoji: l.avatarEmoji || '' }));
    return { went, going, saved };
  }, [s, destId]);
}

/** Explore card: "Sam went, €61 a day" (the cost only if Sam shares it). */
export function FriendCardLine({ destId }) {
  const { t } = useI18n();
  const { went } = useFriendsAt(destId);
  if (!went.length) return null;
  const first = went[0];
  const who = firstName(first.name);
  const text = went.length > 1
    ? t('tg.wentMany', { who, n: went.length - 1 })
    : Number.isFinite(first.dayCost)
      ? t('tg.wentCost', { who, price: formatMoney(first.dayCost, { precision: 'whole' }) })
      : t('tg.went', { who });
  return (
    <p className="tg-sig">
      <ToneFaces people={went.slice(0, 2).map((w) => ({ id: w.friendId, name: w.name, emoji: w.emoji }))} />
      <span>{text}</span>
    </p>
  );
}

/** The place page's "Friends here": who went (with their cost a day and tip
 *  where shared), who goes, who saved it. Each trip opens read-only in place. */
export function FriendsHere({ destId, destinations }) {
  const { t, lang } = useI18n();
  const { went, going, saved } = useFriendsAt(destId);
  const [openTrip, setOpenTrip] = useState('');
  if (!went.length && !going.length && !saved.length) return null;
  const tripRow = (r, line) => {
    const showing = openTrip === r.trip.tripPlanId;
    return (
      <div className="tg-here-row" key={`${r.trip.tripPlanId}`}>
        <ToneFace id={r.friendId} name={r.name} emoji={r.emoji} size="sm" />
        <span>
          <Button variant="quiet" size="sm" className="tg-here-trip" aria-expanded={showing}
            onClick={() => setOpenTrip(showing ? '' : r.trip.tripPlanId)}>
            {line}
          </Button>
          {r.tip && <q>{r.tip}</q>}
          {showing && <FriendTripPanel planId={r.trip.tripPlanId} destinations={destinations} />}
        </span>
      </div>
    );
  };
  return (
    <Block id={`tg-here-${destId}`} title={t('tg.friendsHere')} className="tg-here">
      <div>
        {went.map((r) => tripRow(r, Number.isFinite(r.dayCost)
          ? t('tg.wentCost', { who: firstName(r.name), price: formatMoney(r.dayCost, { precision: 'whole' }) })
          : t('tg.went', { who: firstName(r.name) })))}
        {going.map((r) => tripRow(r, t('tg.goes', { who: firstName(r.name), dates: fmtShort(r.trip.startDate, r.trip.endDate, lang, t('friends.dateJoin')) })))}
        {saved.map((r) => (
          <div className="tg-here-row" key={`s-${r.friendId}`}>
            <ToneFace id={r.friendId} name={r.name} emoji={r.emoji} size="sm" />
            <span><b>{t('tg.savedIt', { who: firstName(r.name) })}</b></span>
          </div>
        ))}
      </div>
    </Block>
  );
}

/** The Plan date step: "Sam is in Lisbon 21 to 24 Nov", with "Plan a day
 *  together". With dates picked, the friend stays that share a day with
 *  them; without, the soonest one. */
export function FriendsInWindow({ start = null, end = null }) {
  const { t, lang } = useI18n();
  const s = useTogether();
  const stays = useMemo(() => {
    if (!s.signedIn) return [];
    const friends = friendIdsOf(s);
    return friendStaysIn({
      friendTrips: s.friendTrips.filter((tr) => friends.has(tr.ownerId)),
      stopsByTrip: stopsByTripOf(s), start, end, max: 2,
    });
  }, [s, start, end]);
  if (!stays.length) return null;
  return stays.map((w) => (
    <div className="tg-planq" key={`${w.tripPlanId}:${w.start}:${w.destId || w.city}`}>
      <ToneFace id={w.friendId} name={w.friendName} emoji={w.emoji} size="sm" />
      <b>{t('tg.isIn', { who: firstName(w.friendName), city: w.city, dates: fmtShort(w.start, w.end, lang, t('friends.dateJoin')) })}</b>
      {w.destId && (
        <Button variant="secondary" size="sm" onClick={() => planDayTogether(w.destId, w.start)}>{t('tg.planDayTogether')}</Button>
      )}
    </div>
  ));
}

/** My trips, Coming up: "Sam joins" for the accepted co-planners on a trip. */
export function JoinsLine({ planId }) {
  const { t } = useI18n();
  const s = useTogether();
  const [people, setPeople] = useState(() => (IS_FRIENDS_MOCK ? (s.coplannersByPlan?.[planId] || []) : []));
  useEffect(() => {
    if (IS_FRIENDS_MOCK || !planId || !s.signedIn || String(planId).startsWith('local')) return undefined;
    let live = true;
    listTripCoplanners(planId).then((rows) => {
      if (!live) return;
      setPeople(rows.filter((r) => r.status === 'accepted' && r.userId !== s.userId)
        .map((r) => ({ userId: r.userId, name: r.displayName || `@${r.handle}`, emoji: r.avatarEmoji || '' })));
    }).catch(() => {});
    return () => { live = false; };
  }, [planId, s.signedIn, s.userId]);
  if (!people.length) return null;
  const who = firstName(people[0].name);
  return (
    <p className="tg-joins">
      <ToneFaces people={people.slice(0, 3).map((p) => ({ id: p.userId, name: p.name, emoji: p.emoji }))} />
      <span>{people.length > 1 ? t('tg.joinMany', { who, n: people.length - 1 }) : t('tg.joins', { who })}</span>
    </p>
  );
}
