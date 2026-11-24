import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Button, IconButton } from '../../components/ui/index.js';
import { CheckIcon, ChevronDownIcon, CloseIcon, EyeIcon, RouteIcon } from '../../components/Icons.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { FriendTripPanel } from '../../auth/FriendTripPanel.jsx';
import { fmtWhere } from '../../auth/friendFacts.js';
import { useSharedLists } from '../../auth/sharedLists.js';
import { ExampleBar } from '../../auth/mytrips/TripParts.jsx';
import { requestSavedList } from '../../auth/mytrips/openList.js';
import { formatMoney } from '../../lib/money.js';
import { openShared } from '../../lib/sharedElement.js';
import { haptic } from '../../lib/haptics.js';
import { togetherActions } from '../useTogether.js';
import { laneGeometry } from '../overlaps.js';
import { IS_FRIENDS_MOCK } from '../friendsMock.js';
import { InviteButton } from '../Invite.jsx';
import { ToneFace, fmtShort, firstName, nameOf } from '../parts.jsx';
import { placeOf, daysUntil, drawAllowed } from '../vrienden.js';
import { usePlaceNames, joinNames } from '../PlaceName.jsx';
import { buildTimeline, waitingOf, stripOf, exampleTimeline, NOW_CAP, STRIP_CAP } from './timeline.js';

/**
 * The Vrienden home, version 3 (G16, decision 0017): one timeline.
 *
 * The head (Vrienden, one Uitnodigen), the face strip (Jij first, friends by
 * their soonest trip, people you asked, kringen), the status line (the only
 * sticky thing on a phone), then one spine of time: Nu (what waits on you),
 * Deze maand, each month, Zonder datum. Every item is one card grammar;
 * timeline.js builds the bands, so each fact shows once.
 *
 * From 1100 px the status, Nu and the people roster stay in a sticky left
 * column; the months run on the right under a month ruler, three cards
 * across. With no friends the page offers "Bekijk een voorbeeld", the My
 * trips pattern: the same page filled by exampleTimeline under the example
 * bar, where every action is inert and nothing is saved or sent.
 */

// Every place in the reader's language (judge 1 fix 2), from one lookup.
const NamesCtx = React.createContext((id, fallback) => fallback || id);
const useName = () => React.useContext(NamesCtx);
// True inside the example: actions are inert, titles carry "Voorbeeld".
const ExCtx = React.createContext(false);

const todayIso = () => new Date().toISOString().slice(0, 10);
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// The row's leave (opacity, translate, height) is --dur-3.
const LEAVE_MS = 320;
// The once-per-visit entrance (an owner exception, decision 0017 v3): the
// timeline rises in the first time the traveller opens Vrienden through the
// door in this page load; never on a deep link, never with reduced motion.
let entered = false;

function monthName(month, lang, today, style = 'long') {
  const d = new Date(`${month}-15T12:00:00Z`);
  const same = month.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat(lang, { month: style, ...(same ? {} : { year: 'numeric' }), timeZone: 'UTC' }).format(d);
}
function monShort(iso, lang) {
  return new Intl.DateTimeFormat(lang, { month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)).replace('.', '');
}
const domId = (id) => `vr-m-${String(id).replace(/[^\w-]/g, '_')}`;

function useWho() {
  const { t, lang } = useI18n();
  return (people) => {
    const names = people.map((p) => firstName(p.name)).filter(Boolean);
    if (names.length <= 2) return joinNames(names, lang);
    return joinNames([names[0], names[1], t('vr.othersN', { n: names.length - 2 })], lang);
  };
}

/* ---------------------------------------------------------- faces */

function Faces({ people, me }) {
  if (!people.length) return null;
  return (
    <span className="vr-m-faces" aria-hidden="true">
      {people.slice(0, 3).map((p) => <ToneFace key={p.id} id={p.id} me={me} name={p.name} emoji={p.emoji} size="sm" />)}
      {people.length > 3 && <span className="vr-m-more num">+{people.length - 3}</span>}
    </span>
  );
}

/* ---------------------------------------------------------- the overlap lanes */

function Lanes({ o, me, meName, draw }) {
  const { t, lang } = useI18n();
  const g = laneGeometry(o);
  const j = t('friends.dateJoin');
  const who = firstName(o.friendName);
  const inOver = (d) => d >= o.start && d <= o.end;
  const pos = (sp) => ({ '--l': sp.left / 100, '--w': sp.width / 100 });
  return (
    <div key={draw} className={`vr-lanes${draw ? ' is-draw' : ''}`} role="img" aria-label={t('vr.lanesLabel', {
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

/* ---------------------------------------------------------- one card */

function Moment({ m, scale, me, meName, destinations, open, onOpen, onPlanDay }) {
  const { t, lang } = useI18n();
  const name = useName();
  const who = useWho();
  const ex = useContext(ExCtx);
  const ref = useRef(null);
  const [draw, setDraw] = useState(0);
  const lead = m.kind === 'circle' ? m.lead?.destId : null;
  const { photo } = placeOf(destinations, lead ? [lead] : m.placeIds);
  const places = joinNames(m.placeIds.slice(0, 2).map((id) => name(id)), lang) || m.city || fmtWhere(m.src?.cities || []);
  const place = m.placeIds[0] ? name(m.placeIds[0], m.city) : m.city;
  const dates = m.start ? fmtShort(m.start, m.end, lang, t('friends.dateJoin')) : '';
  let title = '';
  let fact = dates;
  if (m.kind === 'overlap') title = t('vr.youAndIn', { who: who(m.people), city: place });
  else if (m.kind === 'coplan' || m.kind === 'myTrip') {
    title = m.people.length ? t('vr.youAndIn', { who: who(m.people), city: places }) : t('vr.youIn', { place: places });
  } else if (m.kind === 'friendTrip') title = t('vr.inPlace', { who: who(m.people), place });
  else if (m.kind === 'circle') {
    title = m.src.name;
    fact = [m.lead ? t('vr.placeLeads', { place: name(m.lead.destId), n: m.lead.score }) : t('vr.noLead'), dates].filter(Boolean).join(', ');
  } else if (m.kind === 'group') {
    title = m.src.title;
    const n = m.src.members.length;
    fact = dates || t(n === 1 ? 'vr.member1' : 'vr.members', { n });
  } else if (m.kind === 'list') {
    title = m.src.name;
    const n = (m.src.items || []).length;
    fact = t(n === 1 ? 'vr.place1' : 'vr.placesN', { n });
  }
  const opens = m.kind === 'overlap' || m.kind === 'friendTrip';
  const tap = () => {
    // The lanes draw when the traveller opens the card, never on scroll.
    if (m.kind === 'overlap' && !open && !reduced()) setDraw((d) => d + 1);
    onOpen(m, ref.current);
  };
  const face = m.people[0];
  return (
    <article ref={ref} className={`vr-m is-${scale}${m.saffron ? ' is-saffron' : ''}`}>
      <span className="vr-m-ph">
        {photo?.image?.url ? (
          <HeroImage url={photo.image.url} image={photo.image} className="vr-m-img" maxWidth={1280} ratio={[3, 2]}
            sizes={m.saffron ? '(min-width: 1100px) 50vw, 92vw' : scale === 'row' ? '(min-width: 1100px) 30vw, 96px' : '(min-width: 1100px) 30vw, 92vw'} />
        ) : (
          <span className="vr-m-none" aria-hidden="true">
            <ToneFace id={face?.id || me} me={me} name={face?.name || meName} emoji={face?.emoji} />
          </span>
        )}
      </span>
      <span className="vr-m-tx">
        <Faces people={m.people} me={me} />
        <h3 className="vr-m-t">
          {ex ? (
            <span className="vr-m-go"><span className="sr-only">{t('mt.example')}: </span>{title}</span>
          ) : (
            <Pressable className="vr-m-go" aria-expanded={opens ? open : undefined} onClick={tap}>{title}</Pressable>
          )}
        </h3>
        {fact && <span className={`vr-m-f${m.withYou ? ' is-you' : ''}`}>{fact}</span>}
        {m.kind === 'overlap' && m.saffron && <Lanes o={m.src} me={me} meName={meName} draw={draw} />}
        {m.kind === 'overlap' && (
          <span className="vr-m-acts" inert={ex ? '' : undefined}>
            {m.src.destId && (
              <Button variant="secondary" size="sm" iconStart={<RouteIcon size={16} />} onClick={() => onPlanDay?.(m.src.destId, m.src.start)}>{t('tg.planDayTogether')}</Button>
            )}
            <Button variant="quiet" size="sm" className="vr-lnk" onClick={() => togetherActions.hideMeet(m.src.key)}>{t('tg.hide')}</Button>
          </span>
        )}
      </span>
    </article>
  );
}

/* ---------------------------------------------------------- Nu */

function NuRow({ w, me, onView, run, leaving, onLeave, onLater, laterOk }) {
  const { t, lang } = useI18n();
  const name = useName();
  const ex = useContext(ExCtx);
  const who = firstName(w.person.name) || w.person.name;
  const eur = (c) => formatMoney(Math.abs(c) / 100, { precision: 'whole' });
  const planName = (p, label) => label || p?.label || joinNames((p?.destination_ids || []).map((id) => name(id)), lang) || fmtWhere(p?.cities || []) || t('tg2.yourTrip');
  let title = '';
  let ok = null; // [label, action, an acceptance that ticks and leaves]
  let no = null;
  let secondary = null;
  switch (w.kind) {
    case 'request':
      title = t('vr.wantsFriend', { name: w.person.name });
      ok = [t('friends.accept'), () => togetherActions.accept(w.linkId), true]; no = () => togetherActions.remove(w.linkId); break;
    case 'join':
      title = t('vr.wantsJoin', { name: who, place: planName(w.plan, w.label) });
      ok = [t('friends.accept'), () => togetherActions.answerJoin(w.requestId, true), true]; no = () => togetherActions.answerJoin(w.requestId, false); break;
    case 'coplanInvite':
      title = t('vr.invitesYou', { name: who, place: w.invite.label || fmtWhere(w.invite.cities) });
      ok = [t('coplan.join'), () => togetherActions.takeInvite(w.invite.tripPlanId), true]; no = () => togetherActions.refuseInvite(w.invite.tripPlanId); break;
    case 'groupInvite':
      title = t('vr.invitesYou', { name: who, place: w.group.title });
      ok = [t('coplan.join'), () => togetherActions.respondGroup(w.group.id, true), true]; no = () => togetherActions.respondGroup(w.group.id, false); break;
    case 'groupVote':
      title = t('vr.waitsVote', { trip: w.group.title });
      ok = [t('vr.vote'), () => onView('group', w.group.id)]; break;
    case 'circleInvite':
      title = t('vr.invitesYou', { name: who, place: w.circle.name });
      ok = [t('coplan.join'), () => togetherActions.respondCircle(w.circle.id, true), true]; no = () => togetherActions.respondCircle(w.circle.id, false); break;
    case 'circleVote':
      title = t('vr.waitsVote', { trip: w.circle.name });
      ok = [t('vr.vote'), () => onView('circlevote', w.circle.id)]; break;
    case 'balance':
      title = w.cents > 0 ? t('vr.getsFrom', { amount: eur(w.cents), name: who }) : t('vr.youOweAmt', { amount: eur(w.cents), name: who });
      secondary = [t('tg2.settleUp'), () => onView('settle', w.groupId)]; break;
    default: break;
  }
  const fact = w.kind === 'circleVote' ? t(w.n === 1 ? 'vr.voteWait1' : 'vr.votesWait', { n: w.n }) : '';
  const gone = leaving === w.id;
  const press = () => {
    if (ok[2]) { haptic('confirm'); onLeave(w.id, ok[1]); } else run(ok[1]);
  };
  return (
    <article className={`vr-m is-row is-nu${gone ? ' is-leaving' : ''}`}>
      <span className="vr-m-ph">
        <span className="vr-m-none" aria-hidden="true">
          <ToneFace id={w.person.id} me={me} name={w.person.name} emoji={w.person.emoji} />
        </span>
      </span>
      <span className="vr-m-tx">
        <h3 className="vr-m-t">{ex && <span className="sr-only">{t('mt.example')}: </span>}{title}</h3>
        {fact && <span className="vr-m-f">{fact}</span>}
        <span className="vr-m-acts" inert={ex ? '' : undefined}>
          {ok && (
            <Button variant="primary" size="sm" onClick={press} disabled={gone}>
              {gone && <span className="vr-tick" aria-hidden="true"><CheckIcon size={14} /></span>}{ok[0]}
            </Button>
          )}
          {ok && laterOk && <Button variant="secondary" size="sm" onClick={() => onLater(w.id)}>{t('vr.later')}</Button>}
          {secondary && <Button variant="secondary" size="sm" onClick={() => run(secondary[1])}>{secondary[0]}</Button>}
          {no && <IconButton className="vr-m-x" label={`${t('friends.decline')}, ${w.person.name}`} onClick={() => run(no)}><CloseIcon size={16} /></IconButton>}
        </span>
      </span>
    </article>
  );
}

function NuBand({ items, me, onView, onError }) {
  const { t } = useI18n();
  const [later, setLater] = useState([]);
  const [all, setAll] = useState(false);
  const [leaving, setLeaving] = useState('');
  if (!items.length) return null;
  // "Later" moves a row to the end for this visit; nothing is stored.
  const order = [...items.filter((w) => !later.includes(w.id)), ...later.map((id) => items.find((w) => w.id === id)).filter(Boolean)];
  const shown = all ? order : order.slice(0, NOW_CAP);
  const run = (fn) => Promise.resolve().then(fn).catch(() => onError());
  const onLeave = (id, fn) => {
    if (reduced()) { run(fn); return; }
    setLeaving(id);
    setTimeout(() => { setLeaving(''); run(fn); }, LEAVE_MS);
  };
  return (
    <section className="vr-band is-nu" id="vr-b-now" aria-labelledby="vr-b-now-h">
      <div className="vr-band-head">
        <h2 className="vr-band-h" id="vr-b-now-h" tabIndex={-1}>{t('vr.now')}</h2>
        {items.length > NOW_CAP && (
          <Button variant="quiet" size="sm" className="vr-lnk" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? t('vr.fewer') : t('vr.allN', { n: items.length })}
          </Button>
        )}
      </div>
      <ul className="vr-band-l">
        {shown.map((w) => (
          <li key={w.id} className="vr-mo">
            <span className="vr-gut" aria-hidden="true"><span className="vr-dot is-now" /></span>
            <NuRow w={w} me={me} onView={onView} run={run} leaving={leaving} onLeave={onLeave}
              onLater={(id) => setLater((l) => [...l.filter((x) => x !== id), id])} laterOk={items.length > 1} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------- a time band */

function Band({ id, label, head = null, className = '', moments, hidden = [], moreLabel = '', scale, me, meName, destinations, openId, onOpen, onPlanDay, dated }) {
  const { lang } = useI18n();
  const [more, setMore] = useState(false);
  const list = more ? [...moments, ...hidden] : moments;
  return (
    <section className={`vr-band is-${scale}${className}`} id={id} aria-labelledby={`${id}-h`}>
      <div className="vr-band-head">
        <h2 className="vr-band-h" id={`${id}-h`} tabIndex={-1}>{label}</h2>
        {head}
      </div>
      <ul className="vr-band-l">
        {list.map((m, i) => {
          const panel = m.kind === 'overlap' ? m.src.theirs.tripPlanId : m.kind === 'friendTrip' ? m.src.tripPlanId : '';
          const open = Boolean(panel) && openId === panel;
          return (
            <li key={m.id} id={domId(m.id)} className={`vr-mo${m.saffron ? ' is-wide' : ''}`}>
              <span className="vr-gut" aria-hidden="true">
                {/* From 1100 px the month heads are inside the grid's flow: the
                    first card of a month carries its ruled month name. */}
                {dated && i === 0 && <span className="vr-mo-month">{label}</span>}
                {dated && m.at ? (
                  <span className="vr-plate"><b className="num">{Number(m.at.slice(8))}</b><span>{monShort(m.at, lang)}</span></span>
                ) : <span className="vr-dot" />}
              </span>
              <Moment m={m} scale={scale} me={me} meName={meName} destinations={destinations} open={open}
                onOpen={onOpen} onPlanDay={onPlanDay} />
              {open && <div className="vr-mo-panel"><FriendTripPanel planId={panel} destinations={destinations} /></div>}
            </li>
          );
        })}
        {/* "Nog n" is a cell of the grid, so a month never leaves holes. */}
        {hidden.length > 0 && !more && (
          <li className="vr-mo is-more">
            <span className="vr-gut" aria-hidden="true"><span className="vr-dot" /></span>
            <Button variant="quiet" size="sm" className="vr-lnk vr-more" aria-expanded={more} onClick={() => setMore(true)}
              iconEnd={<ChevronDownIcon size={16} />}>
              <b className="vr-more-n num" aria-hidden="true">+{hidden.length}</b><span>{moreLabel}</span>
            </Button>
          </li>
        )}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------- the strip, the status */

// The name a face is read by holds its visible word (WCAG 2.5.3): the
// visible first name or "Gevraagd", with the rest of the name for screen
// readers only.
function FaceButton({ person, me, line, before = '', after = '', onPress, kind = 'friend' }) {
  const ex = useContext(ExCtx);
  const ref = useRef(null);
  const inner = (
    <>
      <span className="vr-face-d" data-shared="">
        <ToneFace id={person.id} me={me} name={person.name} emoji={person.emoji} />
      </span>
      <span className="vr-face-n">
        {before && <span className="sr-only">{before}</span>}{line}{after && <span className="sr-only">{after}</span>}
      </span>
    </>
  );
  if (ex || !onPress) return <span className={`vr-face is-${kind}`}>{inner}</span>;
  return <Pressable ref={ref} className={`vr-face is-${kind}`} onClick={() => onPress(ref.current)}>{inner}</Pressable>;
}
const restOf = (full, first) => (full && full !== first && full.startsWith(first) ? full.slice(first.length) : '');

function Strip({ items, me, meName, meEmoji, onMe, onFriend, onCircle, onPending }) {
  const { t } = useI18n();
  const ex = useContext(ExCtx);
  const [all, setAll] = useState(false);
  const rest = items.length - STRIP_CAP;
  const shown = all || rest <= 0 ? items : items.slice(0, STRIP_CAP);
  // In the example nothing in the row is a control, so the row itself
  // takes focus to be scrolled by keyboard.
  return (
    <nav className="vr-strip" aria-label={t('vr.peopleNav')} tabIndex={ex ? 0 : undefined}>
      <ul>
        <li><FaceButton person={{ id: me, name: meName, emoji: meEmoji }} me={me} line={t('vr.you')} kind="me" onPress={onMe} /></li>
        {shown.map((p) => (
          <li key={`${p.kind}:${p.id}`}>
            {p.kind === 'friend' && <FaceButton person={p} me={me} line={firstName(p.name)} after={restOf(p.name, firstName(p.name))} onPress={(el) => onFriend(p.id, el)} />}
            {p.kind === 'pending' && <FaceButton person={p} me={me} kind="pending" before={`${p.name}, `} line={t('vr.asked')} onPress={() => onPending(p)} />}
            {p.kind === 'circle' && <FaceButton person={{ id: p.id, name: p.name }} me={me} kind="circle" line={p.name} onPress={() => onCircle(p.id)} />}
          </li>
        ))}
        {rest > 0 && !all && (
          <li>
            <Pressable className="vr-face is-all" aria-expanded={all} onClick={() => setAll(true)}>
              <span className="vr-face-d"><span className="frn-face num">+{rest}</span></span>
              <span className="vr-face-n">{t('vr.allN', { n: items.length })}</span>
            </Pressable>
          </li>
        )}
      </ul>
    </nav>
  );
}

function Status({ count, next, hasFriends, onGo, ex }) {
  const { t } = useI18n();
  const name = useName();
  const who = useWho();
  const prev = useRef(count);
  const [roll, setRoll] = useState(false);
  // The count rolls only when the traveller changed it (an Aanvaard).
  useEffect(() => {
    if (prev.current !== count) { prev.current = count; if (!reduced()) setRoll(true); }
  }, [count]);
  let body = null;
  let target = '';
  if (count > 0) {
    body = <span><b key={count} className={`vr-ct num${roll ? ' is-roll' : ''}`}>{count}</b> {t(count === 1 ? 'vr.waitsOnYou1' : 'vr.waitsOnYou')}</span>;
    target = 'vr-b-now';
  } else if (next) {
    const d = daysUntil(next.at);
    const place = next.kind === 'circle' ? next.src.name : next.kind === 'group' ? next.src.title : name(next.placeIds[0], next.city);
    body = (
      <>
        <span>{t('vr.nextUp', { who: who(next.people), place })}</span>
        <span className="vr-status-r">{d <= 0 ? t('vr.today') : t(d === 1 ? 'vr.inDay1' : 'vr.inDays', { n: d })}</span>
      </>
    );
    target = domId(next.id);
  } else body = <span>{hasFriends ? t('vr.nothingShared') : t('vr.noFriendsYet')}</span>;
  return (
    <div className="vr-status" role="status">
      {target && !ex ? (
        <Pressable className="vr-status-go" onClick={() => onGo(target)}>{body}<ChevronDownIcon size={16} className="vr-status-chev" /></Pressable>
      ) : <span className="vr-status-go">{body}</span>}
    </div>
  );
}

/* ---------------------------------------------------------- desktop: roster, ruler */

function RosterRow({ p, me, line, onPress }) {
  const ex = useContext(ExCtx);
  const ref = useRef(null);
  const body = (
    <>
      <span className="vr-face-d" data-shared=""><ToneFace id={p.id} me={me} name={p.name} emoji={p.emoji} /></span>
      <span className="vr-ro-tx"><b>{p.name}</b><span>{line}</span></span>
    </>
  );
  if (ex || !onPress) return <span className="vr-ro-row">{body}</span>;
  return <Pressable ref={ref} className="vr-ro-row" onClick={() => onPress(ref.current)}>{body}</Pressable>;
}

function Roster({ items, me, meets, onFriend, onCircle, onCancel }) {
  const { t, lang } = useI18n();
  const name = useName();
  const ex = useContext(ExCtx);
  const people = items.filter((p) => p.kind !== 'circle');
  const circles = items.filter((p) => p.kind === 'circle');
  if (!items.length) return null;
  const lineOf = (p) => {
    if (p.kind === 'pending') return t('tg.requestSent');
    const meet = meets.find((o) => o.friendId === p.id);
    if (meet) return t('vr.withYouIn', { place: name(meet.destId, meet.city) });
    if (p.next) {
      return t('vr.placeDate', {
        place: name((p.next.destinationIds || [])[0], (p.next.cities || [])[0] || ''),
        date: fmtShort(p.next.startDate, p.next.endDate, lang, t('friends.dateJoin')),
      });
    }
    return t('vr.nothingShared');
  };
  return (
    <section className="vr-roster" aria-labelledby="vr-ro-h">
      <h2 className="vr-band-h" id="vr-ro-h">{t('friends.title')}</h2>
      <ul>
        {people.map((p) => (
          <li key={`${p.kind}:${p.id}`}>
            <RosterRow p={p} me={me} line={lineOf(p)} onPress={p.kind === 'friend' ? (el) => onFriend(p.id, el) : null} />
            {p.kind === 'pending' && !ex && (
              <Button variant="quiet" size="sm" className="vr-lnk" onClick={() => onCancel(p.linkId)}>{t('friends.cancel')}</Button>
            )}
          </li>
        ))}
      </ul>
      {circles.length > 0 && (
        <>
          <h2 className="vr-band-h" id="vr-ro-k">{t('vr.circles')}</h2>
          <ul aria-labelledby="vr-ro-k">
            {circles.map((c) => {
              const n = c.circle.members.filter((m) => m.status === 'joined').length;
              return (
                <li key={c.id}>
                  <RosterRow p={{ id: c.id, name: c.name }} me={me} line={t(n === 1 ? 'vr.member1' : 'vr.members', { n })} onPress={() => onCircle(c.id)} />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function Ruler({ bands, labels, onGo }) {
  const { t } = useI18n();
  if (bands.length < 2) return null;
  return (
    <nav className="vr-ruler" aria-label={t('vr.months')}>
      {bands.map((b) => (
        <Pressable key={b.key} className="vr-ruler-m" onClick={() => onGo(`vr-b-${b.key}`)}>
          <span>{labels[b.key]}</span>
          <i aria-hidden="true">{[...b.moments, ...b.hidden].map((m) => <b key={m.id} />)}</i>
        </Pressable>
      ))}
    </nav>
  );
}

/* ---------------------------------------------------------- the page */

export function VriendenHome({
  s, meets, destinations, onView, onPlanDay, onOpenSaved, onOpenTripPlan, headRef, inviteOpen, setInviteOpen, error, setError,
}) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const lists = useSharedLists(user, { mock: IS_FRIENDS_MOCK });
  const [example, setExample] = useState(false);
  const [openId, setOpenId] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(null);
  const [enter] = useState(() => {
    if (entered || !drawAllowed()) return false;
    entered = true;
    return true;
  });
  const today = todayIso();
  const friends = s.links.filter((l) => l.kind === 'friend');
  const onError = () => setError(t('friends.unavailable'));
  const onFind = () => { setInviteOpen(false); onView('add'); };

  const exWords = { circle: t('vr.exCircle'), list: t('vr.exList') };
  const ex = useMemo(() => (example ? exampleTimeline(destinations, today, exWords) : null),
    [example, destinations, today, exWords.circle, exWords.list]); // eslint-disable-line react-hooks/exhaustive-deps -- the words, not the object
  const data = useMemo(() => {
    if (ex) return { ...ex, meets: ex.overlaps };
    const coplans = {};
    for (const [pid, co] of Object.entries(s.coplannersByPlan || {})) coplans[pid] = co.map((c) => ({ id: c.userId, name: c.name, emoji: c.emoji }));
    return {
      userId: s.userId, links: s.links, friendTrips: s.friendTrips, myPlans: s.myPlans, overlaps: meets, meets,
      waiting: waitingOf(s), circles: s.circles || [], groupTrips: s.groups || [],
      sharedLists: lists.missing ? [] : lists.lists || [], coplans,
    };
  }, [ex, s, meets, lists]);
  const me = data.userId;
  const tl = useMemo(() => buildTimeline({ ...data, me }, today), [data, me, today]);
  const strip = useMemo(() => stripOf({ links: data.links, friendTrips: data.friendTrips, circles: data.circles }, today), [data, today]);
  const name = usePlaceNames(destinations, [
    ...data.friendTrips.flatMap((tr) => tr.destinationIds || []),
    ...data.meets.map((o) => o.destId),
    ...data.myPlans.flatMap((p) => p.destination_ids || []),
    ...data.circles.flatMap((c) => c.proposals.map((p) => p.destId)),
    ...tl.undated.flatMap((m) => m.placeIds),
  ]);
  const meName = ex ? t('vr.you') : nameOf(s.me) || t('vr.you');
  const hasFriends = strip.some((p) => p.kind === 'friend');

  const go = (id) => {
    let el = document.getElementById(id);
    if (!el) return;
    // From 1100 px a month band is display: contents (one grid across the
    // months), so its first card is what scrolls into view.
    if (!el.getClientRects().length) el = el.querySelector('li') || el;
    el.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
    (el.querySelector('.vr-band-h, .vr-m-go') || el).focus?.({ preventScroll: true });
  };
  // A face grows into the friend page's face (a 320 ms shared element; a
  // fade where View Transitions are missing).
  const openFriend = (id, el) => openShared(el, `friend:${id}`, () => onView('friend', id));
  const onOpen = (m) => {
    if (m.kind === 'overlap' || m.kind === 'friendTrip') {
      const id = m.kind === 'overlap' ? m.src.theirs.tripPlanId : m.src.tripPlanId;
      setOpenId((c) => (c === id ? '' : id));
    } else if (m.kind === 'myTrip' || m.kind === 'coplan') onOpenTripPlan?.(m.src.id);
    else if (m.kind === 'circle') onView('circle', m.src.id);
    else if (m.kind === 'group') onView('group', m.src.id);
    else if (m.kind === 'list') { requestSavedList(m.src.id); onOpenSaved?.(); }
  };
  const canCircle = !ex && hasFriends && !s.circlesMissing;
  const canGroup = !ex && hasFriends && !s.groupsMissing;
  const newBtn = canCircle || canGroup ? (
    <span className="vr-new">
      <Button variant="quiet" size="sm" className="vr-lnk" iconStart={<HouseIcon.plus size={16} />} aria-expanded={newOpen}
        aria-controls="vr-new-menu" onClick={() => setNewOpen((v) => !v)}>{t('vr.new')}</Button>
      {newOpen && (
        <span className="vr-new-menu" id="vr-new-menu">
          {canCircle && <Pressable className="vr-new-row" onClick={() => onView('newcircle')}><HouseIcon.plus size={18} />{t('vr.newCircle')}</Pressable>}
          {canGroup && <Pressable className="vr-new-row" onClick={() => onView('newgroup')}><HouseIcon.plus size={18} />{t('tg.newGroup')}</Pressable>}
        </span>
      )}
    </span>
  ) : null;
  const labels = Object.fromEntries(tl.bands.map((b) => [b.key, b.thisMonth ? t('vr.thisMonth') : monthName(b.month, lang, today)]));
  const ruler = Object.fromEntries(tl.bands.map((b) => [b.key, monthName(b.month, lang, today, 'short').replace('.', '')]));
  const bandProps = { me, meName, destinations, openId, onOpen, onPlanDay };
  const zero = !example && friends.length === 0;

  return (
    <NamesCtx.Provider value={name}>
      <div className={`tg-page vr-page vr-home vr-v3${ex ? ' is-example' : ''}`}>
        <div className="vr-head">
          <h1 className="vr-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{t('tg.title')}</h1>
          <InviteButton open={inviteOpen} onOpen={() => setInviteOpen(true)} onClose={() => setInviteOpen(false)} onFind={onFind}
            variant={friends.length ? 'umber' : 'primary'} block={false} />
        </div>
        {error && <div className="auth-error" role="alert">{error}</div>}
        {ex && <ExampleBar onClose={() => setExample(false)} />}
        <ExCtx.Provider value={Boolean(ex)}>
          <Strip items={strip} me={me} meName={meName} meEmoji={ex ? '' : s.me?.avatarEmoji} onMe={() => onView('me')}
            onFriend={openFriend} onCircle={(id) => onView('circle', id)} onPending={(p) => setPendingOpen((c) => (c?.id === p.id ? null : p))} />
          {pendingOpen && !ex && (
            <p className="vr-pending">
              <span>{pendingOpen.name}, {t('tg.requestSent')}</span>
              <Button variant="quiet" size="sm" className="vr-lnk" onClick={() => { togetherActions.remove(pendingOpen.linkId); setPendingOpen(null); }}>{t('friends.cancel')}</Button>
            </p>
          )}
          <div className="vr-side">
            <Status count={tl.count} next={tl.next} hasFriends={hasFriends} onGo={go} ex={Boolean(ex)} />
            {zero && (
              <div className="vr-first">
                <h2 className="vr-first-t">{t('vr.zeroTitle')}</h2>
                <Button variant="secondary" className="mt-soft" iconStart={<EyeIcon size={18} />} onClick={() => setExample(true)}>{t('mt.seeExample')}</Button>
              </div>
            )}
            <NuBand items={tl.now} me={me} onView={onView} onError={onError} />
            <Roster items={strip} me={me} meets={data.meets} onFriend={openFriend} onCircle={(id) => onView('circle', id)}
              onCancel={(linkId) => togetherActions.remove(linkId)} />
          </div>
          <div className={`vr-main${enter ? ' is-enter' : ''}`}>
            <Ruler bands={tl.bands} labels={ruler} onGo={go} />
            {tl.bands.map((b) => (
              <Band key={b.key} id={`vr-b-${b.key}`} label={labels[b.key]} moments={b.moments} hidden={b.hidden} scale={b.scale} dated
                moreLabel={t('vr.moreIn', { n: b.hidden.length, month: b.thisMonth ? t('vr.thisMonth').toLowerCase() : monthName(b.month, lang, today) })}
                {...bandProps} />
            ))}
            {(tl.undated.length > 0 || newBtn) && (
              <Band id="vr-b-undated" className=" is-undated" label={t('vr.undated')} head={newBtn} moments={tl.undated} scale="row" dated={false} {...bandProps} />
            )}
          </div>
        </ExCtx.Provider>
      </div>
    </NamesCtx.Provider>
  );
}
