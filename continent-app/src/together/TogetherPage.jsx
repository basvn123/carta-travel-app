import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button, Blaze } from '../components/ui/index.js';
import { ArrowLeftIcon } from '../components/Icons.jsx';
import { HouseIcon } from '../components/HouseIcons.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { LoadingBlock } from '../components/StateBlocks.jsx';
import { listGuides } from '../community/guides.js';
import { fmtWhere } from '../auth/friendFacts.js';
import { SectHead } from '../auth/mytrips/atlas/Ink.jsx';
import { useTogether } from './useTogether.js';
import { AddFriend } from './AddFriend.jsx';
import { FriendView } from './FriendView.jsx';
import { FriendsSee } from './Privacy.jsx';
import { SettleView } from './SettleUp.jsx';
import { GroupView, NewGroup } from './GroupTrips.jsx';
import { useOverlaps } from './signals.jsx';
import { MeView } from './MeView.jsx';
import { GuestInvite } from './Invite.jsx';
import { VriendenHome } from './home/VriendenHome.jsx';
import { CircleView } from './circle/CircleView.jsx';
import { NewCircle } from './circle/NewCircle.jsx';
import { drawAllowed } from './vrienden.js';

/**
 * Vrienden (G16, decision 0017; was Together, T928): the people you travel
 * with, on one page behind the header's people door. The route stays
 * `?tab=together`.
 *
 *   home        VriendenHome: who goes where, to do, together on the road,
 *               friends, kringen and group trips, shared, balances
 *   invite      home with the invite sheet (phone) or popover (desktop) open
 *   me          Jij: your face and handle, what friends see, milestones
 *               (the old `privacy` address lands here)
 *   add, friend, group, newgroup, settle   as before
 *   circle, circlevote, circledates, circleflights, circlepick, newcircle
 *               the kring tool (src/together/circle/)
 *
 * The rules FriendsSpoke wrote down still hold: you add somebody by their
 * exact handle or their link, there is no browsing of people, no presence,
 * no counts of followers; declining and removing are silent; nothing is
 * accepted on anybody's behalf.
 *
 * Motion: figures draw in (the rail's bars, the lanes, the balance bars)
 * only when the page was opened after the app's first paint (`vr-draw`);
 * a deep link straight onto Vrienden shows end states.
 */

/** Guides: the two newest published guides as photo cards, and the door to
 *  all of them. Absent when nothing is published, as the strip was. */
function GuidesBlock({ destinations, onOpen }) {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let live = true;
    listGuides({ limit: 6 }).then((r) => { if (live) setRows(r); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!rows.length || !onOpen) return null;
  return (
    <section className="vr-sect vr-o-guides" aria-labelledby="tg-guides-h">
      <SectHead id="tg-guides-h" as="h2" title={t('tg.guides')}
        action={<Button variant="quiet" size="sm" className="vr-lnk" onClick={onOpen}>{t('rail.seeAllPlain')}</Button>} />
      <div className="tg-guides">
        {rows.slice(0, 2).map((g) => {
          const d = (g.destinationIds || []).map((id) => destinations?.[id]).find((x) => x?.image?.url);
          return (
            <Button key={g.tripPlanId} variant="quiet" className="tg-gd" onClick={onOpen}>
              <span className="tg-gd-ph">
                <HeroImage url={d?.image?.url || null} image={d?.image} className="tg-gd-img" maxWidth={960}
                  sizes="(min-width: 1100px) 20vw, 45vw" ratio={[4, 3]} />
              </span>
              <b>{g.label || fmtWhere(g.cities)}</b>
              <span className="tg-gd-by">@{g.ownerHandle}</span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}

const CIRCLE_VIEWS = ['circle', 'circlevote', 'circledates', 'circleflights', 'circlepick'];

export function TogetherPage({
  view = 'home', viewId = '', onView, onClose, destinations, costs, pendingHandle,
  onOpenGuides, onOpenAuth, onPlanDay, favorites, onPlanPlace, choices, onOpenTripPlan, onOpenSaved,
}) {
  const { t } = useI18n();
  const s = useTogether();
  const headRef = useRef(null);
  const [error, setError] = useState('');
  const [inviteOpen, setInviteOpen] = useState(view === 'invite');
  const [draw] = useState(drawAllowed);
  const meets = useOverlaps(s);
  const v = view === 'privacy' ? 'me' : view;

  // The page heading takes focus on arrival and on every sub-screen.
  useEffect(() => { headRef.current?.focus?.(); }, [v, viewId]);
  useEffect(() => { if (v === 'invite') setInviteOpen(true); }, [v]);
  // Escape steps out of a sub-screen, then closes the page.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (CIRCLE_VIEWS.includes(v) && v !== 'circle') onView('circle', viewId);
      else if (v !== 'home' && v !== 'invite') onView('home');
      else onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [v, viewId, onView, onClose]);
  // An invite link opens on the Add screen with the handle looked up.
  useEffect(() => { if (pendingHandle && s.signedIn) onView('add'); }, [pendingHandle, s.signedIn]); // eslint-disable-line react-hooks/exhaustive-deps -- once per link

  const back = (
    <Button variant="quiet" size="sm" className="tg-back" iconStart={<ArrowLeftIcon size={16} />} onClick={() => onView('home')}>
      {t('tg.title')}
    </Button>
  );

  let body;
  if (!s.signedIn && s.loaded) {
    body = pendingHandle ? (
      <div className="tg-page vr-page">
        <GuestInvite handle={pendingHandle} onSignIn={onOpenAuth} headRef={headRef} />
      </div>
    ) : (
      // T991 (owner): signed out, Vrienden is one card: the people glyph on
      // the waiting path, the title, the one line and Sign in.
      <div className="tg-page">
        <div className="tg-out">
          <div className="tg-out-art" aria-hidden="true">
            <Blaze size="lg" state="blank" />
            <HouseIcon.people size={28} />
          </div>
          <div className="tg-out-body">
            <h1 className="tg-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{t('tg.title')}</h1>
            <p className="tg-out-line">{t('tg.signInLine')}</p>
            <Button variant="primary" className="tg-out-go" onClick={onOpenAuth}>{t('saved.signIn')}</Button>
          </div>
        </div>
      </div>
    );
  } else if (!s.loaded) {
    body = (
      <div className="tg-page vr-page">
        <div className="vr-head"><h1 className="vr-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{t('tg.title')}</h1></div>
        <LoadingBlock label={t('saved.loading')} rows={3} />
      </div>
    );
  } else if (v === 'add') {
    body = <AddFriend back={back} headRef={headRef} pendingHandle={pendingHandle} aside={<FriendsSee onOpenSaved={onOpenSaved} />} />;
  } else if (v === 'me') {
    body = <MeView back={back} headRef={headRef} onOpenSaved={onOpenSaved} />;
  } else if (v === 'settle') {
    body = <SettleView headRef={headRef} groupId={viewId} onView={onView} />;
  } else if (v === 'friend') {
    body = (
      <FriendView back={back} headRef={headRef} friendId={viewId} destinations={destinations} costs={costs}
        favorites={favorites} onPlanPlace={onPlanPlace} onGone={() => onView('home')} />
    );
  } else if (v === 'group') {
    body = (
      <GroupView back={back} headRef={headRef} groupId={viewId} destinations={destinations} choices={choices}
        onOpenTripPlan={onOpenTripPlan} onSettle={() => onView('settle', viewId)} />
    );
  } else if (v === 'newgroup') {
    body = <NewGroup back={back} headRef={headRef} onCreated={(id) => onView('group', id)} />;
  } else if (v === 'newcircle') {
    body = <NewCircle back={back} headRef={headRef} onCreated={(id) => onView('circle', id)} />;
  } else if (CIRCLE_VIEWS.includes(v)) {
    body = (
      <CircleView circleId={viewId} step={v} onView={onView} headRef={headRef} destinations={destinations}
        onOpenTripPlan={onOpenTripPlan} />
    );
  } else {
    body = (
      <VriendenHome s={s} meets={meets} destinations={destinations} onView={onView} onPlanDay={onPlanDay}
        onOpenSaved={onOpenSaved} onOpenTripPlan={onOpenTripPlan} headRef={headRef}
        inviteOpen={inviteOpen} setInviteOpen={(o) => { setInviteOpen(o); if (!o && v === 'invite') onView('home'); }}
        error={error} setError={setError}
        extra={<GuidesBlock destinations={destinations} onOpen={onOpenGuides} />} />
    );
  }

  return (
    <div className="saved-shell together">
      <div className={`panel open account-panel saved-trips-panel tg-panel vr-panel${draw ? ' vr-draw' : ''}`}>
        {/* House style: each view arrives as a pushed view (Route
            primitive); the key only remounts the frame when the view or its
            subject changes. */}
        <div className="tg-route" key={`${v || 'home'}:${viewId || ''}`}>{body}</div>
      </div>
    </div>
  );
}
