import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckIcon, CloseIcon, PlusIcon, InfoIcon, ShareIcon, RouteIcon, ChevronDownIcon,
} from '../components/Icons.jsx';
import { Button, IconButton } from '../components/ui/index.js';
import { HeroImage } from '../components/HeroImage.jsx';
import { Face } from './FriendFaces.jsx';
import { refreshFriendTrips } from './useFriendTrips.js';
import { useI18n } from '../i18n/index.jsx';
import { findByHandle, normaliseHandle, handleProblem, fetchMyProfile } from './profiles.js';
import {
  fetchFriendLinks, sendFriendRequest, acceptFriendRequest, removeFriendLink,
  listFriendTrips, buildFriendInviteUrl,
} from './friends.js';
import {
  friendFacts, fmtWindow, fmtWhere, since, withRecency, readLastSeen, writeLastSeen,
} from './friendFacts.js';
import { listCoplanInvites, acceptCoplanInvite, removeCoplanner } from './coplanners.js';
import { FriendTripPanel } from './FriendTripPanel.jsx';
import { FriendBadges } from './FriendBadges.jsx';
import { CountryFlagStack } from '../components/CountryFlag.jsx';
import { LoadingBlock, ErrorBlock } from '../components/StateBlocks.jsx';
import { GuidesStrip } from '../community/GuidesStrip.jsx';

/**
 * FriendsSpoke, the people whose trips you can see and who can see yours.
 *
 * THE PAGE IS ABOUT PLANS, AND PEOPLE ARE ITS INDEX. That is the one sentence
 * the layout follows. An earlier version was an address book: a row per
 * person, a name, a Remove button, and nothing anywhere that said what anybody
 * was actually doing, so the only way to learn anything was to open something.
 * Every row now carries a fact drawn from the trips that person is showing,
 * and the shelf of those trips is the largest thing on the page rather than
 * the smallest.
 *
 * You add somebody by typing the handle they gave you. There is no browsing,
 * no suggestions and no "people you may know", because all three are ways of
 * telling one person about another person who never agreed to it. The lookup
 * takes one exact handle and answers about that handle only. What IS
 * browsable is guides: a plan somebody published on purpose, which is a
 * document offered to the world rather than a person offered to a stranger.
 *
 * BANDS, in the order they need attention: you, then anything waiting on YOU,
 * then anything waiting on somebody else, then the people, then their plans,
 * then the milestones. That ordering is the whole information architecture of
 * this screen.
 *
 * ONE PRIMARY ACTION. Accepting a request is the page's primary when a request
 * exists, because it is an unanswered question addressed to you. Only when
 * nothing is waiting and you have nobody yet does the invite button take the
 * accent, which is the one moment the page's job really is to grow the graph.
 *
 * WHAT IS DELIBERATELY ABSENT: presence, current location, a profile score, a
 * rank, a match percentage. Carta's whole claim is that its numbers can be
 * defended, so a made-up number sitting one panel away from a receipt costs
 * more than it earns. The facts on a row are trips somebody chose to publish.
 *
 * Declining and unfriending are the same act, and neither is announced to the
 * other side. A refusal that sends a notification is a refusal people avoid
 * making.
 */

/* T466 (owner 2026-10-17: modernise Friends and align it with the rest of
   the app). The page is now on the Lagoon kit, laid out like My trips and
   Account: a card for you and your invite, groups under a house label, each
   group one bordered card of hairline rows, real faces instead of a person
   glyph, and the plans friends show you as photo rows before the list of
   people. Every button is the kit's; the class names the harnesses read
   (frn-yes, frn-no, frn-me-copy and the rest) stay on them. */

function Person({ link, fact, children }) {
  const name = link.displayName || `@${link.handle}`;
  return (
    <div className="frn-row">
      <Face name={name} emoji={link.avatarEmoji} />
      <span className="frn-who">
        <b>{name}</b>
        {link.displayName && <span className="frn-handle">@{link.handle}</span>}
        {fact && <span className="frn-fact">{fact}</span>}
      </span>
      <span className="frn-acts">{children}</span>
    </div>
  );
}

/** A group under the house label: the label is a real heading. */
function Band({ id, title, count, action, children, className = '' }) {
  return (
    <section className={`panel-section frn-band ${className}`.trim()} aria-labelledby={id}>
      <div className="frn-head">
        <h3 className="frn-h" id={id}>
          {title}
          {count != null && <span className="frn-count">{count}</span>}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A trip's photo: the first stop's catalogue picture, or its flag-and-name
 *  placeholder (carta-design "Photography": never a grey box). */
function TripThumb({ trip, destinations }) {
  const dest = (trip.destinationIds || []).map((id) => destinations?.[id]).find((d) => d?.image?.url);
  return (
    <HeroImage
      url={dest?.image?.url || null}
      city={dest?.city || (trip.cities || [])[0] || trip.label}
      iso2={dest?.iso2}
      className="frn-trip-img"
      maxWidth={250}
      sizes="72px"
      ratio={[1, 1]}
    />
  );
}

export function FriendsSpoke({ userId, pendingHandle, destinations, onOpenSaved, onOpenGuides }) {
  const { t, lang } = useI18n();
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // The trips those friends have set to 'friends', on this same page: the
  // whole point of having friends here is seeing where they are going.
  const [trips, setTrips] = useState([]);
  const [openTrip, setOpenTrip] = useState('');
  const [myHandle, setMyHandle] = useState('');
  const [copied, setCopied] = useState(false);
  // How this works and what stays private: one paragraph each, folded away
  // behind an icon. It is worth saying and not worth saying every time.
  const [aboutOpen, setAboutOpen] = useState(false);
  // Bumped on every act on the graph, so the milestone row re-reads the
  // ledger at exactly the moments a badge can have been awarded (migration
  // 013 grants in the same transaction as the row that qualifies).
  const [badgeBump, setBadgeBump] = useState(0);
  // Trips somebody has asked you to help plan. These are questions addressed
  // to you about an object, so they sit with the friend requests rather than
  // with the trips: both bands are things waiting on YOU.
  const [invites, setInvites] = useState([]);
  // Read once, on mount, then frozen for the visit: the mark says what is new
  // SINCE YOU LAST LOOKED, so it must not clear itself while you are still
  // looking at it. The stamp is written on the way out.
  const [lastSeen] = useState(readLastSeen);

  // The first read failed outright: the page says so with a way to try
  // again (state.friendsFailed, register T189-b), instead of an empty list
  // that reads as having no friends.
  const [loadFailed, setLoadFailed] = useState(false);
  const [tries, setTries] = useState(0);

  const reload = () => {
    setBadgeBump((k) => k + 1);
    // Accepting somebody is the moment their trips become visible, so the
    // shared copy other screens read goes stale here.
    refreshFriendTrips();
    return Promise.all([
      fetchFriendLinks(userId).then(setLinks),
      // Accepting a request is exactly the moment their trips become visible.
      listFriendTrips().then(setTrips).catch(() => {}),
      listCoplanInvites().then(setInvites).catch(() => {}),
    ])
      .catch(() => setError(t('friends.unavailable')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let live = true;
    setLoadFailed(false);
    fetchFriendLinks(userId)
      .then((rows) => { if (live) setLinks(rows); })
      .catch(() => { if (live) setLoadFailed(true); })
      .finally(() => { if (live) setLoading(false); });
    listFriendTrips()
      .then((rows) => { if (live) setTrips(rows); })
      .catch(() => {});
    listCoplanInvites()
      .then((rows) => { if (live) setInvites(rows); })
      .catch(() => {});
    // A project without migration 010 has no handle to show, which is not
    // something the account holder can act on, so the block is simply absent.
    fetchMyProfile(userId)
      .then((row) => { if (live && row?.handle) setMyHandle(row.handle); })
      .catch((err) => console.warn('[friends] could not read your handle:', err?.message || err));
    return () => { live = false; };
  }, [userId, t, tries]);

  // Stamping the visit on the way OUT, not on the way in: doing it on mount
  // would clear every New mark in the same frame that drew it.
  useEffect(() => () => writeLastSeen(), []);

  // The tick is a confirmation, not a state: it has to clear itself or the
  // next copy has nothing to report.
  useEffect(() => {
    if (!copied) return undefined;
    const id = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(id);
  }, [copied]);

  const copyHandle = async () => {
    try {
      await navigator.clipboard.writeText(`@${myHandle}`);
      setCopied(true);
    } catch {
      setError(t('share.copyFailed'));
    }
  };

  // Sharing hands over a LINK, not a string to retype: it opens Carta on this
  // page with the handle already looked up, so the person on the other end
  // presses one button. The share sheet where the browser has one, the
  // clipboard where it does not.
  const shareHandle = async () => {
    const url = buildFriendInviteUrl(myHandle);
    if (!url) return;
    const text = t('friends.inviteText', { handle: myHandle });
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Carta', text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
    } catch (err) {
      // Dismissing the share sheet rejects; that is a decision, not a fault.
      if (err?.name !== 'AbortError') setError(t('share.copyFailed'));
    }
  };

  // Somebody opened your invite link: look their handle up straight away, so
  // the page opens on the person rather than on an empty search box.
  useEffect(() => {
    if (!pendingHandle || pendingHandle === myHandle) return;
    setQuery(pendingHandle);
    let live = true;
    findByHandle(pendingHandle)
      .then((hit) => {
        if (!live || !hit || hit.userId === userId) return;
        setFound(hit);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [pendingHandle, myHandle, userId]);

  const search = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setFound(null);
    const wanted = normaliseHandle(query);
    const problem = handleProblem(wanted);
    if (problem) { setError(t(problem)); return; }
    if (links.some((l) => l.handle === wanted)) { setError(t('friends.errAlready')); return; }
    setSearching(true);
    try {
      const hit = await findByHandle(wanted);
      // "No such handle" and "that is you" are both dead ends, but only the
      // first is anybody's business, so they read the same.
      if (!hit || hit.userId === userId) setError(t('friends.errNoOne'));
      else setFound(hit);
    } catch {
      setError(t('friends.unavailable'));
    } finally {
      setSearching(false);
    }
  };

  const ask = async () => {
    setError('');
    try {
      await sendFriendRequest(userId, found.userId);
      setFound(null);
      setQuery('');
      setNotice(t('friends.asked'));
      await reload();
    } catch (err) {
      setError(t(err.code === 'ALREADY_LINKED' ? 'friends.errAlready' : 'friends.unavailable'));
    }
  };

  // Accepting hands you the itinerary to edit, so the notice says where it
  // went: a trip that quietly appears in a list you were not looking at is a
  // trip nobody finds.
  const takeInvite = async (planId) => {
    setError('');
    try {
      await acceptCoplanInvite(planId, userId);
      setInvites((cur) => cur.filter((i) => i.tripPlanId !== planId));
      setNotice(t('coplan.joined'));
    } catch { setError(t('coplan.failed')); }
  };
  const refuseInvite = async (planId) => {
    setError('');
    try {
      await removeCoplanner(planId, userId);
      setInvites((cur) => cur.filter((i) => i.tripPlanId !== planId));
    } catch { setError(t('coplan.failed')); }
  };

  const accept = async (id) => {
    try { await acceptFriendRequest(id); await reload(); } catch { setError(t('friends.unavailable')); }
  };
  const drop = async (id) => {
    try { await removeFriendLink(id); await reload(); } catch { setError(t('friends.unavailable')); }
  };

  const incoming = links.filter((l) => l.kind === 'incoming');
  const outgoing = links.filter((l) => l.kind === 'outgoing');
  const friends = links.filter((l) => l.kind === 'friend');

  // The shelf reads newest first and marks what moved since the last visit.
  // That is the whole of the change log: no feed, no counter, no metric
  // anybody would have to defend, just the rows that moved.
  const shelf = useMemo(() => withRecency(trips, lastSeen), [trips, lastSeen]);

  // One line per person saying what they are doing, built from the trips
  // already fetched, so an informative row costs no extra query. A PLAN, not
  // a state: a trip somebody published, never where they are right now.
  const factFor = (link) => {
    const { shown, next } = friendFacts(trips, link.userId);
    if (!shown) return t('friends.factNothing');
    if (!next) return t(shown === 1 ? 'friends.factShownOne' : 'friends.factShownMany', { n: shown });
    const where = fmtWhere(next.cities);
    const when = fmtWindow(next.startDate, next.endDate, lang, t('friends.dateJoin'));
    if (!when) return where;
    // The place is prose and the window is a measured fact, so they are set in
    // the two faces this app reserves for exactly that difference.
    return <>{where ? `${where}, ` : ''}<span className="frn-fact-when">{when}</span></>;
  };

  // The accent goes to the one action that is the page's answer right now. A
  // waiting request outranks growth, because it is a question somebody asked
  // you; only an empty graph with nothing pending makes inviting the primary.
  const invitePrimary = incoming.length === 0 && invites.length === 0 && friends.length === 0;

  if (loadFailed) {
    return (
      <div className="panel-section">
        <ErrorBlock message={t('state.friendsFailed')} onRetry={() => { setLoading(true); setTries((n) => n + 1); }} retryLabel={t('layer.retry')} />
      </div>
    );
  }

  return (
    <div className="frn-page">
      {myHandle && (
        <section className="panel-section frn-band" aria-labelledby="frn-me-h">
          <div className="frn-me">
            <div className="frn-me-text">
              <h3 className="frn-h" id="frn-me-h">{t('friends.yourHandle')}</h3>
              <span className="frn-me-handle">@{myHandle}</span>
              <span className="frn-me-line">{t('friends.meLine')}</span>
            </div>
            <div className="frn-me-acts">
              <Button
                variant={invitePrimary ? 'primary' : 'secondary'}
                className={`frn-me-share${invitePrimary ? ' primary' : ''}`}
                iconStart={<ShareIcon size={16} />}
                onClick={shareHandle}
              >
                {t('friends.invite')}
              </Button>
              <Button
                variant="quiet"
                className="frn-me-copy"
                iconStart={copied ? <CheckIcon size={16} /> : null}
                onClick={copyHandle}
              >
                {copied ? t('share.copied') : t('share.copy')}
              </Button>
            </div>
          </div>
        </section>
      )}

      {incoming.length > 0 && (
        <Band id="frn-in-h" title={t('friends.waitingOnYou', { n: incoming.length })}>
          <div className="frn-list">
            {incoming.map((l) => (
              <Person link={l} key={l.id}>
                <Button variant="primary" size="sm" className="frn-yes" iconStart={<CheckIcon size={16} />} onClick={() => accept(l.id)}>
                  {t('friends.accept')}
                </Button>
                <IconButton className="frn-no" label={t('friends.decline')} onClick={() => drop(l.id)}>
                  <CloseIcon size={16} />
                </IconButton>
              </Person>
            ))}
          </div>
        </Band>
      )}

      {invites.length > 0 && (
        <Band id="frn-co-h" title={t('coplan.invitesTitle', { n: invites.length })}>
          <div className="frn-list">
            {invites.map((iv) => {
              const who = iv.ownerName || `@${iv.ownerHandle}`;
              const where = fmtWhere(iv.cities);
              return (
                <div className="frn-row" key={iv.tripPlanId}>
                  <span className="frn-face frn-face-md frn-face-trip" aria-hidden="true"><RouteIcon size={16} /></span>
                  <span className="frn-who">
                    <b>{iv.label || where}</b>
                    <span className="frn-fact">{t('coplan.askedBy', { who })}</span>
                  </span>
                  <span className="frn-acts">
                    {/* One primary per view: with a friend request waiting too,
                        that request keeps it and joining is secondary. */}
                    <Button
                      variant={incoming.length ? 'secondary' : 'primary'}
                      size="sm"
                      className="frn-yes"
                      iconStart={<CheckIcon size={16} />}
                      onClick={() => takeInvite(iv.tripPlanId)}
                    >
                      {t('coplan.join')}
                    </Button>
                    <IconButton className="frn-no" label={t('friends.decline')} onClick={() => refuseInvite(iv.tripPlanId)}>
                      <CloseIcon size={16} />
                    </IconButton>
                  </span>
                </div>
              );
            })}
          </div>
          <p className="frn-hint">{t('coplan.whatYouGet')}</p>
        </Band>
      )}

      {outgoing.length > 0 && (
        <Band id="frn-out-h" title={t('friends.waitingOnThem', { n: outgoing.length })}>
          <div className="frn-list">
            {outgoing.map((l) => (
              <Person link={l} key={l.id} fact={t('friends.factAsked')}>
                <Button variant="quiet" size="sm" className="frn-no frn-text" onClick={() => drop(l.id)}>
                  {t('friends.cancel')}
                </Button>
              </Person>
            ))}
          </div>
        </Band>
      )}

      {/* The plans come before the people (T466): the page is about where
          your friends are going, and the people are its index. */}
      {friends.length > 0 && (
        <Band id="frn-trips-h" title={t('friends.theirTrips')} count={shelf.length || null}>
          {shelf.length === 0 ? (
            /* An empty state is an invitation, not an apology: it names the
               space and hands over the action that fills it. The action is
               yours to take, because the only half of this you control is
               showing a trip of your own. */
            <div className="frn-empty-act">
              <p>{t('friends.emptyTrips')}</p>
              {onOpenSaved && (
                <Button className="frn-empty-btn" onClick={onOpenSaved}>
                  {t('friends.showATrip')}
                </Button>
              )}
            </div>
          ) : (
            <div className="frn-list frn-shelf">
              {shelf.map((ft) => {
                const showing = openTrip === ft.tripPlanId;
                const who = ft.ownerName || `@${ft.ownerHandle}`;
                const when = fmtWindow(ft.startDate, ft.endDate, lang, t('friends.dateJoin'));
                const moved = since(ft.updatedAt, lang);
                return (
                  <div className={`frn-trip${showing ? ' is-open' : ''}`} key={ft.tripPlanId}>
                    <button
                      type="button"
                      className={`frn-trip-row${showing ? ' on' : ''}`}
                      onClick={() => setOpenTrip(showing ? '' : ft.tripPlanId)}
                      aria-expanded={showing}
                    >
                      <TripThumb trip={ft} destinations={destinations} />
                      <span className="frn-trip-meta">
                        <b>
                          {ft.label || (ft.cities || []).join(', ')}
                          {ft.isNew && <span className="frn-trip-new">{t('friends.newMark')}</span>}
                        </b>
                        <span className="frn-trip-who">
                          <Face name={who} emoji={ft.ownerEmoji} size="sm" />
                          {t('friends.byWhom', { who })}
                          {moved && <span className="frn-trip-when">{moved}</span>}
                        </span>
                        {when && <span className="frn-trip-dates">{when}</span>}
                      </span>
                      {(ft.countries || []).length > 0 && (
                        <CountryFlagStack countries={ft.countries} size={14} />
                      )}
                      <ChevronDownIcon size={16} className="frn-trip-chev" />
                    </button>
                    {showing && <FriendTripPanel planId={ft.tripPlanId} destinations={destinations} />}
                  </div>
                );
              })}
            </div>
          )}
        </Band>
      )}

      <Band
        id="frn-yours-h"
        title={t('friends.yours', { n: friends.length })}
        action={(
          <IconButton
            className={`frn-about-btn${aboutOpen ? ' on' : ''}`}
            label={t('friends.aboutTitle')}
            pressed={aboutOpen}
            aria-expanded={aboutOpen}
            onClick={() => setAboutOpen((v) => !v)}
          >
            <InfoIcon size={16} />
          </IconButton>
        )}
      >
        {aboutOpen && (
          <div className="frn-about">
            <p>{t('friends.noneYet')}</p>
            <p>{t('friends.privacyNote')}</p>
          </div>
        )}

        {/* The lookup sits inside the band it acts on rather than in a section
            of its own: adding somebody is a thing you do TO this list, and a
            page with fewer bands has a clearer order. */}
        <form className="frn-find" onSubmit={search}>
          <label className="acct-handle-row">
            <span className="acct-handle-at" aria-hidden="true">@</span>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck="false"
              value={query}
              onChange={(e) => { setQuery(normaliseHandle(e.target.value)); setFound(null); }}
              placeholder={t('friends.handlePlaceholder')}
              aria-label={t('friends.addTitle')}
            />
          </label>
          <Button type="submit" variant="secondary" className="frn-look" loading={searching} disabled={!query}>
            {t('friends.look')}
          </Button>
        </form>
        {found && (
          <div className="frn-found">
            <Person link={found}>
              <Button variant="secondary" size="sm" className="frn-yes" iconStart={<PlusIcon size={16} />} onClick={ask}>
                {t('friends.ask')}
              </Button>
            </Person>
          </div>
        )}
        {error && <div className="auth-error" role="alert">{error}</div>}
        {notice && <div className="auth-notice auth-notice-inline">{notice}</div>}

        {loading ? (
          <LoadingBlock label={t('saved.loading')} rows={2} />
        ) : friends.length === 0 ? (
          <p className="frn-empty">{t('friends.emptyPeople')}</p>
        ) : (
          <div className="frn-list">
            {friends.map((l) => (
              <Person link={l} key={l.id} fact={factFor(l)}>
                <Button variant="quiet" size="sm" className="frn-no frn-text" onClick={() => drop(l.id)}>
                  {t('friends.remove')}
                </Button>
              </Person>
            ))}
          </div>
        )}
      </Band>

      <FriendBadges userId={userId} friendCount={friends.length} refreshKey={badgeBump} />

      {/* The one door on this page that leads somewhere with strangers in it,
          and it leads to their DOCUMENTS. It is at the foot because it is not
          what somebody came here for, and it is here at all because an account
          with no friends yet would otherwise leave this page with nothing to
          read. It hides itself when nothing is published. */}
      <div className="panel-section frn-guides">
        <GuidesStrip onOpen={onOpenGuides} />
      </div>
    </div>
  );
}
