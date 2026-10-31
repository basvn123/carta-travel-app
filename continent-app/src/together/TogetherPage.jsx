import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button, IconButton } from '../components/ui/index.js';
import {
  ArrowLeftIcon, CheckIcon, CloseIcon, LockIcon, PlusIcon, RouteIcon, ChevronRightIcon,
} from '../components/Icons.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { LoadingBlock } from '../components/StateBlocks.jsx';
import { GuidesStrip } from '../community/GuidesStrip.jsx';
import { FriendTripPanel } from '../auth/FriendTripPanel.jsx';
import { FriendBadges } from '../auth/FriendBadges.jsx';
import { friendFacts, fmtWhere } from '../auth/friendFacts.js';
import { formatMoney } from '../lib/money.js';
import { useTogether, togetherActions } from './useTogether.js';
import { Block, ToneFace, fmtShort, nameOf } from './parts.jsx';
import { AddFriend } from './AddFriend.jsx';
import { FriendView } from './FriendView.jsx';
import { MeetCard } from './MeetCard.jsx';
import { FriendsSee } from './Privacy.jsx';
import { GroupBlock, GroupView, NewGroup, groupWaits } from './GroupTrips.jsx';
import { useOverlaps } from './signals.jsx';

/**
 * Together (T928, owner-approved spec v2): the people you travel with, on one
 * quiet page behind the header's people door. It replaces the Friends spoke
 * of Account, which keeps a single row linking here.
 *
 * Order, top to bottom on a phone (desktop splits it in two columns):
 *   the title and Add a friend;
 *   To answer: what is waiting on you (requests, invitations, votes);
 *   Friends' plans: the trips friends chose to show you;
 *   Friends: one row a person, one fact line, tap for their page;
 *   Guides: the published guides strip;
 *   Privacy.
 *
 * The rules FriendsSpoke wrote down still hold: you add somebody by their
 * exact handle or their link, there is no browsing of people, no presence,
 * no counts of followers; declining and removing are silent; nothing is
 * accepted on anybody's behalf.
 *
 * Sub-screens have their own address (`?tab=together&view=add`, `view=friend
 * &id=`), so Back steps out of one onto the page.
 */

function TripCard({ trip, destinations, costs, me, open, onToggle }) {
  const { t, lang } = useI18n();
  const dest = (trip.destinationIds || []).map((id) => destinations?.[id]).find(Boolean);
  const photo = (trip.destinationIds || []).map((id) => destinations?.[id]).find((d) => d?.image?.url);
  const when = fmtShort(trip.startDate, trip.endDate, lang, t('friends.dateJoin'));
  const day = dest ? costs?.get?.(dest.id)?.dayEur : null;
  const who = trip.ownerName || `@${trip.ownerHandle}`;
  return (
    <article className={`tg-fp${open ? ' is-open' : ''}`}>
      <div className="tg-fp-ph">
        <HeroImage url={photo?.image?.url || null} city={dest?.city || (trip.cities || [])[0] || trip.label}
          iso2={photo?.iso2 || dest?.iso2} className="tg-fp-img" maxWidth={640} sizes="(min-width: 1024px) 280px, 60vw" ratio={[4, 3]} />
        <ToneFace id={trip.ownerId} me={me} name={who} emoji={trip.ownerEmoji} />
      </div>
      <Button variant="quiet" block className="tg-fp-bd" aria-expanded={open} onClick={onToggle}>
        <b>{trip.label || fmtWhere(trip.cities)}</b>
        <span>
          {[when, Number.isFinite(day) ? t('tg.aDay', { price: formatMoney(day, { precision: 'whole' }) }) : ''].filter(Boolean).join(', ')}
        </span>
        <span className="tg-fp-who">{who}</span>
      </Button>
    </article>
  );
}

/** One row of "To answer": who or what, what it is, and its answer. */
function WaitRow({ face, title, line, children }) {
  return (
    <div className="tg-wr">
      {face}
      <span className="tg-wr-tx"><b>{title}</b><span>{line}</span></span>
      <span className="tg-wr-acts">{children}</span>
    </div>
  );
}

export function TogetherPage({
  view = 'home', viewId = '', onView, onClose, destinations, costs, pendingHandle,
  onOpenGuides, onOpenAuth, onPlanDay, favorites, onPlanPlace, choices, onOpenTripPlan, onOpenSaved,
}) {
  const { t, lang } = useI18n();
  const s = useTogether();
  const headRef = useRef(null);
  const [openTrip, setOpenTrip] = useState('');
  const [error, setError] = useState('');
  const meets = useOverlaps(s);

  // The page heading takes focus on arrival and on every sub-screen.
  useEffect(() => { headRef.current?.focus?.(); }, [view, viewId]);
  // Escape steps out of a sub-screen, then closes the page.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (view !== 'home') onView('home'); else onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, onView, onClose]);
  // An invite link opens on the Add screen with the handle looked up.
  useEffect(() => { if (pendingHandle && s.signedIn) onView('add'); }, [pendingHandle, s.signedIn]); // eslint-disable-line react-hooks/exhaustive-deps -- once per link

  const incoming = s.links.filter((l) => l.kind === 'incoming');
  const outgoing = s.links.filter((l) => l.kind === 'outgoing');
  const friends = s.links.filter((l) => l.kind === 'friend');
  const today = new Date().toISOString().slice(0, 10);
  const shelf = useMemo(() => s.friendTrips
    .filter((tr) => !tr.endDate || tr.endDate >= today)
    .sort((a, b) => String(a.startDate || '9').localeCompare(String(b.startDate || '9'))), [s.friendTrips, today]);

  const act = (p) => p.catch(() => setError(t('friends.unavailable')));

  const factFor = (link) => {
    const { shown, next } = friendFacts(s.friendTrips, link.userId);
    if (!shown) return t('friends.factNothing');
    if (!next) return t(shown === 1 ? 'friends.factShownOne' : 'friends.factShownMany', { n: shown });
    const where = fmtWhere(next.cities);
    const when = fmtShort(next.startDate, next.endDate, lang, t('friends.dateJoin'));
    return [where, when].filter(Boolean).join(', ');
  };

  const back = (
    <Button variant="quiet" size="sm" className="tg-back" iconStart={<ArrowLeftIcon size={16} />} onClick={() => onView('home')}>
      {t('tg.title')}
    </Button>
  );

  let body;
  if (!s.signedIn && s.loaded) {
    body = (
      <div className="tg-page">
        <div className="tg-head"><h1 className="tg-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{t('tg.title')}</h1></div>
        <div className="tg-empty">
          <p>{t('tg.signInLine')}</p>
          <Button variant="primary" onClick={onOpenAuth}>{t('saved.signIn')}</Button>
        </div>
      </div>
    );
  } else if (!s.loaded) {
    body = (
      <div className="tg-page">
        <div className="tg-head"><h1 className="tg-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{t('tg.title')}</h1></div>
        <LoadingBlock label={t('saved.loading')} rows={3} />
      </div>
    );
  } else if (view === 'add') {
    body = <AddFriend back={back} headRef={headRef} pendingHandle={pendingHandle} aside={<FriendsSee onOpenSaved={onOpenSaved} />} />;
  } else if (view === 'privacy') {
    body = (
      <div className="tg-page">
        <div className="tg-head is-sub">{back}<h1 className="tg-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{t('tg.privacy')}</h1></div>
        <FriendsSee onOpenSaved={onOpenSaved} />
      </div>
    );
  } else if (view === 'friend') {
    body = (
      <FriendView back={back} headRef={headRef} friendId={viewId} destinations={destinations} costs={costs}
        favorites={favorites} onPlanPlace={onPlanPlace} onGone={() => onView('home')} />
    );
  } else if (view === 'group') {
    body = (
      <GroupView back={back} headRef={headRef} groupId={viewId} destinations={destinations} choices={choices}
        onOpenTripPlan={onOpenTripPlan} />
    );
  } else if (view === 'newgroup') {
    body = <NewGroup back={back} headRef={headRef} onCreated={(id) => onView('group', id)} />;
  } else {
    const nothing = !incoming.length && !s.invites.length && !friends.length && !outgoing.length;
    const groupsWaiting = groupWaits(s);
    body = (
      <div className="tg-page">
        <div className="tg-head">
          <h1 className="tg-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{t('tg.title')}</h1>
          <Button variant={nothing ? 'primary' : 'secondary'} size="sm" iconStart={<PlusIcon size={16} />} onClick={() => onView('add')}>
            {t('friends.addTitle')}
          </Button>
        </div>
        {error && <div className="auth-error" role="alert">{error}</div>}

        {(incoming.length > 0 || s.invites.length > 0 || groupsWaiting.length > 0) && (
          <Block id="tg-wait-h" title={t('tg.toAnswer')} className="tg-o-wait">
            <div className="tg-wait">
              {incoming.map((l, i) => (
                <WaitRow key={l.id} face={<ToneFace id={l.userId} name={nameOf(l)} emoji={l.avatarEmoji} />}
                  title={nameOf(l)} line={t('tg.friendRequest')}>
                  <Button variant={i === 0 ? 'primary' : 'secondary'} size="sm" className="frn-yes" onClick={() => act(togetherActions.accept(l.id))}>
                    {t('friends.accept')}
                  </Button>
                  <Button variant="secondary" size="sm" className="frn-no" onClick={() => act(togetherActions.remove(l.id))}>
                    {t('friends.decline')}
                  </Button>
                </WaitRow>
              ))}
              {s.invites.map((iv) => (
                <WaitRow key={iv.tripPlanId}
                  face={<span className="frn-face frn-face-md frn-face-trip" aria-hidden="true"><RouteIcon size={16} /></span>}
                  title={iv.label || fmtWhere(iv.cities)} line={t('tg.coplanFrom', { who: iv.ownerName || `@${iv.ownerHandle}` })}>
                  <Button variant="secondary" size="sm" iconStart={<CheckIcon size={16} />} onClick={() => act(togetherActions.takeInvite(iv.tripPlanId))}>
                    {t('coplan.join')}
                  </Button>
                  <IconButton label={t('friends.decline')} onClick={() => act(togetherActions.refuseInvite(iv.tripPlanId))}>
                    <CloseIcon size={16} />
                  </IconButton>
                </WaitRow>
              ))}
              {groupsWaiting.map((g) => {
                const owner = g.members.find((m) => m.userId === g.ownerId);
                return g.myStatus === 'invited' ? (
                  <WaitRow key={g.id} face={<ToneFace id={g.ownerId} name={owner?.name || ''} emoji={owner?.emoji} />}
                    title={g.title} line={t('tg.groupFrom', { who: owner?.name || '' })}>
                    <Button variant="secondary" size="sm" iconStart={<CheckIcon size={16} />} onClick={() => act(togetherActions.respondGroup(g.id, true))}>
                      {t('coplan.join')}
                    </Button>
                    <IconButton label={t('friends.decline')} onClick={() => act(togetherActions.respondGroup(g.id, false))}>
                      <CloseIcon size={16} />
                    </IconButton>
                  </WaitRow>
                ) : (
                  <WaitRow key={g.id} face={<ToneFace id={g.ownerId} me={s.userId} name={owner?.name || ''} emoji={owner?.emoji} />}
                    title={g.title} line={t('tg.voteWaiting')}>
                    <Button variant="secondary" size="sm" onClick={() => onView('group', g.id)}>{t('tg.vote')}</Button>
                  </WaitRow>
                );
              })}
            </div>
          </Block>
        )}

        <div className="tg-grid">
          <div className="tg-col">
            {meets.length > 0 && (
              <Block id="tg-meet-h" title={t('tg.plansMeet')} className="tg-o-meet">
                {meets.slice(0, 3).map((o) => (
                  <MeetCard key={o.key} o={o} me={s.userId} meName={nameOf(s.me)} onPlanDay={onPlanDay} onHide={(k) => togetherActions.hideMeet(k)} />
                ))}
              </Block>
            )}
            {shelf.length > 0 && (
              <Block id="tg-plans-h" title={t('tg.friendsPlans')} className="tg-o-plans">
                <div className="tg-shelf">
                  {shelf.map((tr) => (
                    <TripCard key={tr.tripPlanId} trip={tr} destinations={destinations} costs={costs} me={s.userId}
                      open={openTrip === tr.tripPlanId} onToggle={() => setOpenTrip((cur) => (cur === tr.tripPlanId ? '' : tr.tripPlanId))} />
                  ))}
                </div>
                {openTrip && <FriendTripPanel planId={openTrip} destinations={destinations} />}
              </Block>
            )}
          </div>
          <div className="tg-col">
            <GroupBlock s={s} onView={onView} />
            <Block id="tg-people-h" title={t('friends.title')} className="tg-o-people">
              {friends.length === 0 && outgoing.length === 0 ? (
                <p className="tg-muted">{t('tg.noFriends')}</p>
              ) : (
                <div className="tg-people">
                  {friends.map((l) => (
                    <Button key={l.id} variant="quiet" block className="tg-pr" onClick={() => onView('friend', l.userId)}>
                      <ToneFace id={l.userId} name={nameOf(l)} emoji={l.avatarEmoji} />
                      <span className="tg-pr-tx"><b>{nameOf(l)}</b><span>{factFor(l)}</span></span>
                      <ChevronRightIcon size={16} className="tg-pr-go" />
                    </Button>
                  ))}
                  {outgoing.map((l) => (
                    <div key={l.id} className="tg-pr is-static">
                      <ToneFace id={l.userId} name={nameOf(l)} emoji={l.avatarEmoji} />
                      <span className="tg-pr-tx"><b>{nameOf(l)}</b><span>{t('tg.requestSent')}</span></span>
                      <Button variant="quiet" size="sm" className="frn-no frn-text" onClick={() => act(togetherActions.remove(l.id))}>
                        {t('friends.cancel')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Block>
            {friends.length > 0 && (
              <div className="tg-o-badges">
                <FriendBadges userId={s.userId} friendCount={friends.length} refreshKey={friends.length} />
              </div>
            )}
            <div className="tg-o-guides">
              <GuidesStrip onOpen={onOpenGuides} />
            </div>
            <div className="tg-o-privacy">
              <Button variant="quiet" size="sm" iconStart={<LockIcon size={16} />} onClick={() => onView('privacy')}>{t('tg.privacy')}</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="saved-shell together">
      <div className="panel open account-panel saved-trips-panel tg-panel">
        {body}
      </div>
    </div>
  );
}

