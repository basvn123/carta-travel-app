import React, { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Button, IconButton } from '../../components/ui/index.js';
import { ChevronRightIcon, CloseIcon, RouteIcon } from '../../components/Icons.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { SectHead } from '../../auth/mytrips/atlas/Ink.jsx';
import { FriendTripPanel } from '../../auth/FriendTripPanel.jsx';
import { friendFacts, fmtWhere } from '../../auth/friendFacts.js';
import { useSharedLists } from '../../auth/sharedLists.js';
import { formatMoney } from '../../lib/money.js';
import { rankProposals } from '../../lib/circles/rank.js';
import { togetherActions, circleWaits, unvotedIn } from '../useTogether.js';
import { groupWaits } from '../GroupTrips.jsx';
import { laneGeometry } from '../overlaps.js';
import { settleUp } from '../settle.js';
import { AskJoin } from '../AskJoin.jsx';
import { IS_FRIENDS_MOCK } from '../friendsMock.js';
import { InviteButton, InviteQr } from '../Invite.jsx';
import { Ring } from '../circle/Ring.jsx';
import { ToneFace, ToneFaces, fmtShort, firstName, nameOf } from '../parts.jsx';
import { placeOf, daysUntil, leadFill, placeName } from '../vrienden.js';

/**
 * The Vrienden home (G16, decision 0017, build-spec block 2): people first,
 * one graphic idea a section, in ink and photo.
 *
 * Phone order: the head (Vrienden, Uitnodigen, your face for Jij); Wie gaat
 * waarheen (a rail of friends' next trips); Te doen (a deck, one card at a
 * time); Samen onderweg (the soonest overlap, the one saffron mark);
 * Vrienden (photo cards); Kringen (and the 055 group trips under them);
 * Gedeeld; Rekeningen. From 1100 px the head and the rail run full width,
 * then two columns: Te doen, Samen onderweg and Rekeningen on the left,
 * Vrienden, Kringen, Gedeeld and the guides on the right.
 *
 * Every section is drawn only with content; the invite never doubles (two
 * or more friends: the head button; one: a dashed tile beside the card;
 * none: the hero, which names the three things the page does).
 */

const today = () => new Date().toISOString().slice(0, 10);

/* ---------------------------------------------------------- the rail */

function GoCard({ trip, destinations, me, mine, open, onToggle }) {
  const { t } = useI18n();
  const { dest, photo } = placeOf(destinations, trip.destinationIds);
  const place = dest?.city || (trip.cities || [])[0] || trip.label || '';
  const days = daysUntil(trip.startDate);
  const who = trip.ownerName || `@${trip.ownerHandle}`;
  return (
    <article className={`vr-go${mine ? ' is-mine' : ''}${open ? ' is-open' : ''}`}>
      <Pressable type="button" className="vr-go-tap" aria-expanded={open} onClick={onToggle}>
        <span className="vr-go-ph">
          <HeroImage url={photo?.image?.url || null} image={photo?.image} className="vr-go-img" maxWidth={1280}
            sizes="(min-width: 1100px) 24vw, (min-width: 768px) 30vw, 62vw" ratio={[4, 5]} />
        </span>
        {days != null && (
          <span className="vr-go-cd">
            <b className="num">{days}</b><span>{t(days === 1 ? 'vr.dayTo' : 'vr.daysTo', { place })}</span>
          </span>
        )}
        <span className="vr-go-bar" aria-hidden="true"><i style={{ '--fill': leadFill(days) }} /></span>
        <span className="vr-go-who">
          <ToneFace id={trip.ownerId} me={me} name={who} emoji={trip.ownerEmoji} size="sm" />
          <b>{firstName(who)}</b>{mine && <em>{t('vr.andYou')}</em>}
        </span>
      </Pressable>
      <AskJoin trip={trip} className="vr-go-ask" />
    </article>
  );
}

function WhoGoes({ s, destinations, meets }) {
  const { t } = useI18n();
  const [open, setOpen] = useState('');
  const d0 = today();
  const trips = useMemo(() => {
    const byFriend = new Map();
    for (const tr of s.friendTrips) {
      if (!tr.startDate || tr.startDate < d0) continue;
      const cur = byFriend.get(tr.ownerId);
      if (!cur || tr.startDate < cur.startDate) byFriend.set(tr.ownerId, tr);
    }
    return [...byFriend.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [s.friendTrips, d0]);
  if (!trips.length) return null;
  const sharedTrip = new Set(meets.map((o) => o.theirs.tripPlanId));
  return (
    <section className="vr-sect vr-o-rail" aria-labelledby="vr-go-h">
      <SectHead id="vr-go-h" as="h2" title={t('vr.whoGoes')} />
      <div className="vr-rail">
        {trips.map((tr) => (
          <GoCard key={tr.tripPlanId} trip={tr} destinations={destinations} me={s.userId} mine={sharedTrip.has(tr.tripPlanId)}
            open={open === tr.tripPlanId} onToggle={() => setOpen((c) => (c === tr.tripPlanId ? '' : tr.tripPlanId))} />
        ))}
      </div>
      {open && <FriendTripPanel planId={open} destinations={destinations} />}
    </section>
  );
}

/* ---------------------------------------------------------- the deck */

function useTodo(s, onView) {
  const { t } = useI18n();
  const items = [];
  const myPlanName = (r) => {
    const p = s.myPlans.find((x) => x.id === r.tripPlanId);
    return r.label || p?.label || fmtWhere(p?.cities || []) || t('tg2.yourTrip');
  };
  for (const l of s.links.filter((x) => x.kind === 'incoming')) {
    items.push({ key: `f:${l.id}`, kind: t('vr.kFriend'), face: { id: l.userId, name: nameOf(l), emoji: l.avatarEmoji },
      title: nameOf(l), line: t('tg.friendRequest'),
      ok: [t('friends.accept'), () => togetherActions.accept(l.id)], no: () => togetherActions.remove(l.id) });
  }
  for (const r of s.joinToMe || []) {
    items.push({ key: `j:${r.id}`, kind: t('vr.kJoin'), face: { id: r.requesterId, name: r.name, emoji: r.emoji },
      title: r.name, line: t('tg2.asksToJoin', { trip: myPlanName(r) }),
      ok: [t('friends.accept'), () => togetherActions.answerJoin(r.id, true)], no: () => togetherActions.answerJoin(r.id, false) });
  }
  for (const iv of s.invites) {
    items.push({ key: `c:${iv.tripPlanId}`, kind: t('vr.kCoplan'), icon: true,
      title: iv.label || fmtWhere(iv.cities), line: t('tg.coplanFrom', { who: iv.ownerName || `@${iv.ownerHandle}` }),
      ok: [t('coplan.join'), () => togetherActions.takeInvite(iv.tripPlanId)], no: () => togetherActions.refuseInvite(iv.tripPlanId) });
  }
  for (const g of groupWaits(s)) {
    const owner = g.members.find((m) => m.userId === g.ownerId);
    items.push(g.myStatus === 'invited'
      ? { key: `g:${g.id}`, kind: t('vr.kGroup'), face: { id: g.ownerId, name: owner?.name || '', emoji: owner?.emoji },
        title: g.title, line: t('tg.groupFrom', { who: owner?.name || '' }),
        ok: [t('coplan.join'), () => togetherActions.respondGroup(g.id, true)], no: () => togetherActions.respondGroup(g.id, false) }
      : { key: `g:${g.id}`, kind: t('vr.kVote'), face: { id: g.ownerId, name: owner?.name || '', emoji: owner?.emoji },
        title: g.title, line: t('tg.voteWaiting'), ok: [t('tg.vote'), () => onView('group', g.id)] });
  }
  for (const c of circleWaits(s)) {
    const owner = c.members.find((m) => m.userId === c.ownerId);
    items.push(c.myStatus === 'invited'
      ? { key: `k:${c.id}`, kind: t('vr.kCircle'), face: { id: c.ownerId, name: owner?.name || '', emoji: owner?.emoji },
        title: c.name, line: t('vr.circleFrom', { who: firstName(owner?.name || '') }),
        ok: [t('coplan.join'), () => togetherActions.respondCircle(c.id, true)], no: () => togetherActions.respondCircle(c.id, false) }
      : { key: `k:${c.id}`, kind: t('vr.kCircle'), face: { id: c.ownerId, name: owner?.name || '', emoji: owner?.emoji },
        title: c.name, line: t('vr.votesWait', { n: unvotedIn(c, s.userId) }), ok: [t('vr.vote'), () => onView('circlevote', c.id)] });
  }
  return items;
}

function TodoFace({ it, me }) {
  if (it.icon) return <span className="frn-face frn-face-lg frn-face-trip" aria-hidden="true"><RouteIcon size={20} /></span>;
  return <ToneFace id={it.face.id} me={me} name={it.face.name} emoji={it.face.emoji} size="lg" />;
}

// The card's slide away: --dur-3 in the tokens; with reduced motion the
// next card is simply there.
const LEAVE_MS = 320;
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function TodoDeck({ s, onView, onError }) {
  const { t } = useI18n();
  const items = useTodo(s, onView);
  const [pos, setPos] = useState(0);
  const [all, setAll] = useState(false);
  const [leaving, setLeaving] = useState('');
  if (!items.length) return null;
  const n = items.length;
  const at = pos % n;
  const order = [...items.slice(at), ...items.slice(0, at)];
  const front = order[0];
  const run = (p) => Promise.resolve().then(p).catch(() => onError());
  const leave = (key, then) => {
    if (reduced()) { then(); return; }
    setLeaving(key);
    setTimeout(() => { setLeaving(''); then(); }, LEAVE_MS);
  };
  const count = t('vr.ofN', { i: at + 1, n });
  return (
    <section className="vr-sect vr-o-todo" aria-labelledby="vr-todo-h">
      <SectHead id="vr-todo-h" as="h2" title={t('vr.todo')} count={all ? n : count}
        action={n > 1 ? <Button variant="quiet" size="sm" className="vr-lnk" aria-expanded={all} onClick={() => setAll((v) => !v)}>{all ? t('vr.fewer') : t('vr.all')}</Button> : null} />
      {all ? (
        <div className="vr-rows">
          {items.map((it) => (
            <div key={it.key} className="vr-row">
              <TodoFace it={it} me={s.userId} />
              <span className="vr-row-tx"><span className="vr-k">{it.kind}</span><b>{it.title}</b><span>{it.line}</span></span>
              <span className="vr-row-acts">
                <Button variant="secondary" size="sm" onClick={() => run(it.ok[1])}>{it.ok[0]}</Button>
                {it.no && <IconButton label={`${t('friends.decline')}, ${it.title}`} onClick={() => run(it.no)}><CloseIcon size={16} /></IconButton>}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className={`vr-deck${n > 1 ? ' has-next' : ''}${n > 2 ? ' has-two' : ''}`}>
          <div key={front.key} className={`vr-card${leaving === front.key ? ' is-leaving' : ''}`}>
            <TodoFace it={front} me={s.userId} />
            <span className="vr-card-tx"><span className="vr-k">{front.kind}</span><b>{front.title}</b><span>{front.line}</span></span>
            {front.no && (
              <IconButton className="vr-card-x" label={`${t('friends.decline')}, ${front.title}`}
                onClick={() => leave(front.key, () => run(front.no))}><CloseIcon size={16} /></IconButton>
            )}
            <span className="vr-card-acts">
              <Button variant="primary" className="vr-card-go" onClick={() => leave(front.key, () => run(front.ok[1]))}>{front.ok[0]}</Button>
              {n > 1 && <Button variant="secondary" onClick={() => leave(front.key, () => setPos((p) => p + 1))}>{t('vr.later')}</Button>}
            </span>
          </div>
          {n > 1 && <span className="vr-deck-edge" aria-hidden="true" />}
          {n > 2 && <span className="vr-deck-edge is-two" aria-hidden="true" />}
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------- samen onderweg */

function Lanes({ o, me, meName }) {
  const { t, lang } = useI18n();
  const g = laneGeometry(o);
  const j = t('friends.dateJoin');
  const who = firstName(o.friendName);
  const inOver = (d) => d >= o.start && d <= o.end;
  const pos = (sp) => ({ '--l': sp.left / 100, '--w': sp.width / 100 });
  return (
    <div className="vr-lanes" role="img" aria-label={t('vr.lanesLabel', {
      a: fmtShort(o.mine.start, o.mine.end, lang, j), who, b: fmtShort(o.theirs.start, o.theirs.end, lang, j), c: fmtShort(o.start, o.end, lang, j),
    })}>
      <span className="vr-lanes-scale" aria-hidden="true" style={{ '--n': g.days.length }}>
        {g.days.map((d) => <span key={d} className={inOver(d) ? 'is-on' : undefined}>{Number(d.slice(8))}</span>)}
      </span>
      <span className="vr-lane" aria-hidden="true">
        <ToneFace id={me} me={me} name={meName || t('tg.you')} size="sm" />
        <span className="vr-track"><i className="vr-bar is-you" style={pos(g.you)} /></span>
      </span>
      <span className="vr-lane" aria-hidden="true">
        <ToneFace id={o.friendId} me={me} name={o.friendName} emoji={o.emoji} size="sm" />
        <span className="vr-track"><i className="vr-bar is-them" style={pos(g.them)} /></span>
      </span>
      <span className="vr-over" aria-hidden="true" style={pos(g.over)} />
    </div>
  );
}

function OnTheRoad({ s, meets, destinations, onPlanDay }) {
  const { t, lang } = useI18n();
  if (!meets.length) return null;
  const [o, ...rest] = meets;
  const { photo } = placeOf(destinations, [o.destId]);
  const who = firstName(o.friendName);
  const j = t('friends.dateJoin');
  return (
    <section className="vr-sect vr-o-meet" aria-labelledby="vr-meet-h">
      <SectHead id="vr-meet-h" as="h2" title={t('vr.onTheRoad')} />
      <div className="vr-meet">
        <span className="vr-meet-ph">
          <HeroImage url={photo?.image?.url || null} image={photo?.image} className="vr-meet-img" maxWidth={1280}
            sizes="(min-width: 1100px) 520px, 92vw" ratio={[16, 10]} />
        </span>
        <h3 className="vr-meet-t">{t('vr.youAndIn', { who, city: o.city })}</h3>
        <span className="vr-meet-d num">{fmtShort(o.start, o.end, lang, j)}</span>
        <Lanes o={o} me={s.userId} meName={nameOf(s.me)} />
        <span className="vr-meet-acts">
          {o.destId && <Button variant="secondary" size="sm" iconStart={<RouteIcon size={16} />} onClick={() => onPlanDay?.(o.destId, o.start)}>{t('tg.planDayTogether')}</Button>}
          <Button variant="quiet" size="sm" className="vr-lnk" onClick={() => togetherActions.hideMeet(o.key)}>{t('tg.hide')}</Button>
        </span>
      </div>
      {rest.length > 0 && (
        <div className="vr-rows">
          {rest.slice(0, 4).map((m) => (
            <div key={m.key} className="vr-row">
              <ToneFace id={m.friendId} me={s.userId} name={m.friendName} emoji={m.emoji} size="md" />
              <span className="vr-row-tx"><b>{t('vr.youAndIn', { who: firstName(m.friendName), city: m.city })}</b><span className="num">{fmtShort(m.start, m.end, lang, j)}</span></span>
              <Button variant="quiet" size="sm" className="vr-lnk" onClick={() => togetherActions.hideMeet(m.key)}>{t('tg.hide')}</Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------- friends */

function FriendCard({ link, s, destinations, meets, onOpen }) {
  const { t } = useI18n();
  const { next } = friendFacts(s.friendTrips, link.userId);
  const { dest, photo } = placeOf(destinations, next?.destinationIds);
  const place = dest?.city || (next?.cities || [])[0] || '';
  const days = next ? daysUntil(next.startDate) : null;
  const meet = meets.find((o) => o.friendId === link.userId);
  const name = nameOf(link);
  const fact = meet ? t('vr.withYouIn', { place: meet.city }) : next ? place : t('vr.nothingShared');
  return (
    <Pressable type="button" className="vr-fc" onClick={onOpen}>
      {photo?.image?.url ? (
        <span className="vr-fc-ph">
          <HeroImage url={photo.image.url} image={photo.image} className="vr-fc-img" maxWidth={1280}
            sizes="(min-width: 1100px) 17vw, (min-width: 768px) 30vw, 46vw" ratio={[4, 3]} />
        </span>
      ) : (
        <span className="vr-fc-ph is-none" aria-hidden="true"><ToneFace id={link.userId} me={s.userId} name={name} emoji={link.avatarEmoji} size="lg" /></span>
      )}
      <span className="vr-fc-nm">
        <ToneFace id={link.userId} me={s.userId} name={name} emoji={link.avatarEmoji} size="sm" />
        <b>{name}</b>
        {days != null && days >= 0 && <span className="vr-fc-d num" aria-hidden="true">{t('vr.dShort', { n: days })}</span>}
        {days != null && days >= 0 && <span className="sr-only">{t('vr.inDays', { n: days })}</span>}
      </span>
      <span className={`vr-fc-f${meet ? ' is-meet' : ''}`}>{fact}</span>
    </Pressable>
  );
}

function FriendsGrid({ s, destinations, meets, onView, inviteTile }) {
  const { t } = useI18n();
  const friends = s.links.filter((l) => l.kind === 'friend');
  const outgoing = s.links.filter((l) => l.kind === 'outgoing');
  if (!friends.length && !outgoing.length) return null;
  return (
    <section className="vr-sect vr-o-people" aria-labelledby="vr-people-h">
      <SectHead id="vr-people-h" as="h2" title={t('friends.title')} count={friends.length || null} />
      {friends.length > 0 && (
        <div className="vr-fgrid">
          {friends.map((l) => (
            <FriendCard key={l.id} link={l} s={s} destinations={destinations} meets={meets} onOpen={() => onView('friend', l.userId)} />
          ))}
          {inviteTile}
        </div>
      )}
      {outgoing.length > 0 && (
        <div className="vr-rows">
          {outgoing.map((l) => (
            <div key={l.id} className="vr-row">
              <ToneFace id={l.userId} name={nameOf(l)} emoji={l.avatarEmoji} />
              <span className="vr-row-tx"><b>{nameOf(l)}</b><span>{t('tg.requestSent')}</span></span>
              <Button variant="quiet" size="sm" className="vr-lnk" onClick={() => togetherActions.remove(l.id)}>{t('friends.cancel')}</Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------- kringen */

function CircleCard({ c, s, destinations, onOpen }) {
  const { t } = useI18n();
  const ranked = rankProposals(c.proposals, c.votes);
  const lead = ranked[0] || null;
  const { photo } = placeOf(destinations, lead ? [lead.destId] : []);
  const joined = c.members.filter((m) => m.status === 'joined');
  return (
    <Pressable type="button" className="vr-kr" onClick={onOpen}>
      <Ring photo={photo} members={joined} me={s.userId} />
      <span className="vr-kr-tx">
        <b className="vr-kr-t">{c.name}</b>
        <span>{[t('vr.members', { n: joined.length }), c.proposals.length ? t('vr.proposalsN', { n: c.proposals.length }) : ''].filter(Boolean).join(', ')}</span>
        {lead && (
          <span className="vr-kr-lead"><b>{placeName(destinations, lead.destId)}</b><span>{t('vr.leadsWith', { n: lead.score })}</span></span>
        )}
      </span>
    </Pressable>
  );
}

function Circles({ s, destinations, onView, hasFriends }) {
  const { t } = useI18n();
  const circles = (s.circles || []).filter((c) => c.myStatus === 'joined');
  const groups = (s.groups || []).filter((g) => g.myStatus === 'joined');
  const showCircles = !s.circlesMissing && (circles.length > 0 || hasFriends);
  const showGroups = !s.groupsMissing && (groups.length > 0 || hasFriends);
  if (!showCircles && !showGroups) return null;
  return (
    <section className="vr-sect vr-o-circles" aria-labelledby="vr-kr-h">
      {showCircles && (
        <>
          <SectHead id="vr-kr-h" as="h2" title={t('vr.circles')} count={circles.length || null}
            action={hasFriends ? (
              <Button variant="quiet" size="sm" className="vr-lnk" iconStart={<HouseIcon.plus size={16} />} onClick={() => onView('newcircle')}>{t('vr.newCircle')}</Button>
            ) : null} />
          {circles.length > 0 && (
            <div className="vr-krail">
              {circles.map((c) => <CircleCard key={c.id} c={c} s={s} destinations={destinations} onOpen={() => onView('circle', c.id)} />)}
            </div>
          )}
        </>
      )}
      {showGroups && (
        <div className="vr-groups">
          <SectHead id={showCircles ? 'vr-gt-h' : 'vr-kr-h'} as={showCircles ? 'h3' : 'h2'} title={t('vr.groupTrips')}
            action={hasFriends ? <Button variant="quiet" size="sm" className="vr-lnk" iconStart={<HouseIcon.plus size={16} />} onClick={() => onView('newgroup')}>{t('tg.newGroup')}</Button> : null} />
          {groups.length > 0 && (
            <div className="vr-rows">
              {groups.map((g) => (
                <Pressable key={g.id} type="button" className="vr-row is-link" onClick={() => onView('group', g.id)}>
                  <ToneFaces me={s.userId} size="sm" people={g.members.map((m) => ({ id: m.userId, name: m.name, emoji: m.emoji }))} />
                  <span className="vr-row-tx"><b>{g.title}</b><span>{t('vr.members', { n: g.members.length })}</span></span>
                  <ChevronRightIcon size={16} className="vr-chev" />
                </Pressable>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------- gedeeld */

function Shared({ s, onOpenSaved, onOpenTripPlan }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const lists = useSharedLists(user, { mock: IS_FRIENDS_MOCK });
  const rows = [];
  for (const l of lists.missing ? [] : lists.lists || []) {
    const people = (l.members || l.people || []).filter((p) => (p.id || p.userId) !== s.userId);
    rows.push(
      <Pressable key={`l:${l.id}`} type="button" className="vr-row is-link" onClick={() => onOpenSaved?.()}>
        <ToneFaces me={s.userId} size="sm" people={people.map((p) => ({ id: p.id || p.userId, name: p.name || p.displayName || '', emoji: p.emoji || '' }))} />
        <span className="vr-row-tx"><b>{l.name}</b><span>{t('vr.placesN', { n: (l.items || []).length })}</span></span>
        <ChevronRightIcon size={16} className="vr-chev" />
      </Pressable>,
    );
  }
  for (const p of s.myPlans) {
    const co = s.coplannersByPlan?.[p.id] || [];
    if (!co.length) continue;
    rows.push(
      <Pressable key={`p:${p.id}`} type="button" className="vr-row is-link" onClick={() => onOpenTripPlan?.(p.id)}>
        <ToneFaces me={s.userId} size="sm" people={co.map((c) => ({ id: c.userId, name: c.name, emoji: c.emoji }))} />
        <span className="vr-row-tx"><b>{p.label || fmtWhere(p.cities)}</b><span>{t('vr.plannedWith', { who: co.map((c) => firstName(c.name)).join(', ') })}</span></span>
        <ChevronRightIcon size={16} className="vr-chev" />
      </Pressable>,
    );
  }
  if (!rows.length) return null;
  return (
    <section className="vr-sect vr-o-shared" aria-labelledby="vr-sh-h">
      <SectHead id="vr-sh-h" as="h2" title={t('vr.shared')} />
      <div className="vr-rows">{rows}</div>
    </section>
  );
}

/* ---------------------------------------------------------- rekeningen */

function Bills({ s, onView }) {
  const { t } = useI18n();
  const by = new Map();
  let groupId = '';
  for (const [gid, l] of Object.entries(s.ledgers || {})) {
    if (!l || l.missing) continue;
    let transfers = [];
    try { transfers = settleUp(l.expenses, l.settlements).transfers; } catch { transfers = []; }
    for (const tr of transfers) {
      if (tr.to === s.userId) by.set(tr.from, (by.get(tr.from) || 0) + tr.amountCents);
      else if (tr.from === s.userId) by.set(tr.to, (by.get(tr.to) || 0) - tr.amountCents);
      else continue;
      groupId = groupId || gid;
    }
  }
  const rows = [...by.entries()].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return null;
  const nameFor = (id) => {
    const l = s.links.find((x) => x.userId === id);
    if (l) return nameOf(l);
    for (const g of s.groups) { const m = g.members.find((x) => x.userId === id); if (m) return m.name; }
    return '';
  };
  const max = Math.max(...rows.map(([, v]) => Math.abs(v)));
  const net = rows.reduce((sum, [, v]) => sum + v, 0);
  const eur = (c) => formatMoney(Math.abs(c) / 100, { precision: 'whole' });
  return (
    <section className="vr-sect vr-o-bills" aria-labelledby="vr-bill-h">
      <SectHead id="vr-bill-h" as="h2" title={t('vr.bills')}
        action={<Button variant="quiet" size="sm" className="vr-lnk" onClick={() => onView('settle', groupId)}>{t('tg2.settleUp')}</Button>} />
      <ul className="vr-bal">
        {rows.map(([id, v]) => {
          const who = firstName(nameFor(id));
          const w = { '--w': Math.abs(v) / max };
          return (
            <li key={id} className={`vr-bal-row${v < 0 ? ' is-owe' : ''}`}
              aria-label={v > 0 ? t('vr.owesYou', { who, amount: eur(v) }) : t('vr.youOwe', { who, amount: eur(v) })}>
              <ToneFace id={id} me={s.userId} name={nameFor(id)} size="sm" />
              <span className="vr-bal-nm" aria-hidden="true">{who}</span>
              <span className="vr-bal-l" aria-hidden="true">{v < 0 && <i style={w} />}</span>
              <span className="vr-bal-r" aria-hidden="true">{v > 0 && <i style={w} />}</span>
              <span className="vr-bal-amt num" aria-hidden="true">{eur(v)}</span>
            </li>
          );
        })}
      </ul>
      <p className="vr-bal-net"><span>{net >= 0 ? t('vr.netGet') : t('vr.netOwe')}</span><b className="num">{eur(net)}</b></p>
    </section>
  );
}

/* ---------------------------------------------------------- the empty hero */

function ValueArt({ kind }) {
  // Three drawn images, one per thing the page does; geometry, not pictures.
  if (kind === 'choose') {
    return (
      <svg viewBox="0 0 60 60" aria-hidden="true">
        <circle cx="30" cy="30" r="13" className="vr-art-fill" />
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          return <circle key={i} cx={30 + Math.cos(a) * 22} cy={30 + Math.sin(a) * 22} r="5" className="vr-art-dot" />;
        })}
      </svg>
    );
  }
  if (kind === 'days') {
    const lv = [0, 1, 2, 1, 1, 2, 3, 3, 0, 2, 3, 2, 1, 0, 1, 2];
    return (
      <svg viewBox="0 0 60 60" aria-hidden="true">
        {lv.map((l, i) => <rect key={i} x={6 + (i % 4) * 12.5} y={6 + Math.floor(i / 4) * 12.5} width="10" height="10" rx="2" className={`vr-art-l${l}`} />)}
        <rect x="29.5" y="16.5" width="27" height="14" rx="3" className="vr-art-best" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 60 60" aria-hidden="true">
      <path d="M8 50V12" className="vr-art-axis" />
      <path d="M8 22h30M8 33h20M8 44h12" className="vr-art-bars" />
    </svg>
  );
}

function ZeroHero({ invite, onFind }) {
  const { t } = useI18n();
  return (
    <section className="vr-sect vr-zero" aria-labelledby="vr-zero-h">
      <div className="vr-zero-main">
        <span className="vr-zero-plate" aria-hidden="true"><HouseIcon.invite size={30} /></span>
        <h2 className="vr-zero-t" id="vr-zero-h">{t('vr.zeroTitle')}</h2>
        <ul className="vr-val3">
          <li><span className="vr-val3-g"><ValueArt kind="choose" /></span>{t('vr.v1')}</li>
          <li><span className="vr-val3-g"><ValueArt kind="days" /></span>{t('vr.v2')}</li>
          <li><span className="vr-val3-g"><ValueArt kind="costs" /></span>{t('vr.v3')}</li>
        </ul>
        <span className="vr-zero-acts">
          {invite}
          <Button variant="quiet" className="vr-lnk" onClick={onFind}>{t('vr.byHandle')}</Button>
        </span>
      </div>
      <span className="vr-zero-qr"><InviteQr /></span>
    </section>
  );
}

/* ---------------------------------------------------------- the page */

export function VriendenHome({
  s, meets, destinations, onView, onPlanDay, onOpenSaved, onOpenTripPlan, headRef, inviteOpen, setInviteOpen, error, setError, extra = null,
}) {
  const { t } = useI18n();
  const friends = s.links.filter((l) => l.kind === 'friend');
  const onError = () => setError(t('friends.unavailable'));
  const onFind = () => { setInviteOpen(false); onView('add'); };
  const invite = (variant, block) => (
    <InviteButton open={inviteOpen} onOpen={() => setInviteOpen(true)} onClose={() => setInviteOpen(false)} onFind={onFind}
      variant={variant} block={block} />
  );
  const meName = nameOf(s.me) || t('vr.you');
  const tile = friends.length === 1 ? (
    <span className="vr-fc is-add">
      <span className="vr-fc-ph is-add">{invite('secondary', true)}</span>
    </span>
  ) : null;
  return (
    <div className="tg-page vr-page vr-home">
      <div className="vr-head">
        <h1 className="vr-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{t('tg.title')}</h1>
        {friends.length >= 2 && invite('umber', false)}
        <Pressable type="button" className="vr-me-door" aria-label={t('vr.you')} onClick={() => onView('me')}>
          <ToneFace id={s.userId} me={s.userId} name={meName} emoji={s.me?.avatarEmoji} size="md" />
        </Pressable>
      </div>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {friends.length === 0 && <ZeroHero invite={invite('primary', true)} onFind={onFind} />}
      <WhoGoes s={s} destinations={destinations} meets={meets} />
      <div className="vr-cols">
        <div className="vr-col is-left">
          <TodoDeck s={s} onView={onView} onError={onError} />
          <OnTheRoad s={s} meets={meets} destinations={destinations} onPlanDay={onPlanDay} />
          <Bills s={s} onView={onView} />
        </div>
        <div className="vr-col is-right">
          <FriendsGrid s={s} destinations={destinations} meets={meets} onView={onView} inviteTile={tile} />
          <Circles s={s} destinations={destinations} onView={onView} hasFriends={friends.length > 0} />
          <Shared s={s} onOpenSaved={onOpenSaved} onOpenTripPlan={onOpenTripPlan} />
          {extra}
        </div>
      </div>
    </div>
  );
}
