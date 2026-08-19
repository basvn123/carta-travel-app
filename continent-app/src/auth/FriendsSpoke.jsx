import React, { useEffect, useState } from 'react';
import {
  PersonIcon, CheckIcon, CloseIcon, SearchIcon, PlusIcon, InfoIcon, ShareIcon,
} from '../components/Icons.jsx';
import { useI18n } from '../i18n/index.jsx';
import { findByHandle, normaliseHandle, handleProblem, fetchMyProfile } from './profiles.js';
import {
  fetchFriendLinks, sendFriendRequest, acceptFriendRequest, removeFriendLink,
  listFriendTrips, buildFriendInviteUrl,
} from './friends.js';
import { FriendTripPanel } from './FriendTripPanel.jsx';
import { CountryFlagStack } from '../components/CountryFlag.jsx';

/**
 * FriendsSpoke, the people whose trips you can see and who can see yours.
 *
 * Your own handle leads the page, because adding a friend needs it before it
 * needs theirs: the usual first move is sending somebody your name, not
 * receiving one. It used to live two screens away in the profile spoke, which
 * made the one thing you had to hand over the hardest thing to find.
 *
 * You add somebody by typing the handle they gave you. There is no browsing,
 * no suggestions and no "people you may know", because all three are ways of
 * telling one person about another person who never agreed to it. The lookup
 * takes one exact handle and answers about that handle only.
 *
 * Requests are shown in the order they need attention: the ones waiting on YOU
 * first, then the ones waiting on somebody else, then the settled ones. That
 * ordering is the whole information architecture of this screen.
 *
 * Declining and unfriending are the same act, and neither is announced to the
 * other side. A refusal that sends a notification is a refusal people avoid
 * making.
 */

function Person({ link, children }) {
  const name = link.displayName || `@${link.handle}`;
  return (
    <div className="frn-row">
      <span className="frn-face" aria-hidden="true">
        {link.avatarEmoji || <PersonIcon size={15} />}
      </span>
      <span className="frn-who">
        <b>{name}</b>
        {link.displayName && <span className="frn-handle">@{link.handle}</span>}
      </span>
      <span className="frn-acts">{children}</span>
    </div>
  );
}

export function FriendsSpoke({ userId, pendingHandle, destinations }) {
  const { t } = useI18n();
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

  const reload = () => Promise.all([
    fetchFriendLinks(userId).then(setLinks),
    // Accepting a request is exactly the moment their trips become visible.
    listFriendTrips().then(setTrips).catch(() => {}),
  ])
    .catch(() => setError(t('friends.unavailable')))
    .finally(() => setLoading(false));

  useEffect(() => {
    let live = true;
    fetchFriendLinks(userId)
      .then((rows) => { if (live) setLinks(rows); })
      .catch(() => { if (live) setError(t('friends.unavailable')); })
      .finally(() => { if (live) setLoading(false); });
    listFriendTrips()
      .then((rows) => { if (live) setTrips(rows); })
      .catch(() => {});
    // A project without migration 010 has no handle to show, which is not
    // something the account holder can act on, so the block is simply absent.
    fetchMyProfile(userId)
      .then((row) => { if (live && row?.handle) setMyHandle(row.handle); })
      .catch((err) => console.warn('[friends] could not read your handle:', err?.message || err));
    return () => { live = false; };
  }, [userId, t]);

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

  const accept = async (id) => {
    try { await acceptFriendRequest(id); await reload(); } catch { setError(t('friends.unavailable')); }
  };
  const drop = async (id) => {
    try { await removeFriendLink(id); await reload(); } catch { setError(t('friends.unavailable')); }
  };

  const incoming = links.filter((l) => l.kind === 'incoming');
  const outgoing = links.filter((l) => l.kind === 'outgoing');
  const friends = links.filter((l) => l.kind === 'friend');

  return (
    <>
      {myHandle && (
        <div className="panel-section">
          <div className="section-title section-title-iconed">
            <PersonIcon size={12} /> {t('friends.yourHandle')}
          </div>
          <div className="frn-me">
            <span className="frn-me-handle">@{myHandle}</span>
            <button type="button" className="frn-me-copy" onClick={copyHandle}>
              {copied ? <CheckIcon size={13} /> : null}
              {copied ? t('share.copied') : t('share.copy')}
            </button>
            <button type="button" className="frn-me-share" onClick={shareHandle}>
              <ShareIcon size={13} />
              {t('friends.share')}
            </button>
          </div>
        </div>
      )}

      <div className="panel-section">
        <div className="section-title section-title-iconed">
          <SearchIcon size={12} /> {t('friends.addTitle')}
        </div>
        <form className="frn-find" onSubmit={search}>
          <div className="acct-handle-row">
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
          </div>
          <button type="submit" className="auth-submit auth-submit-quiet" disabled={searching || !query}>
            {searching ? t('account.pleaseWait') : t('friends.look')}
          </button>
        </form>
        {found && (
          <div className="frn-found">
            <Person link={found}>
              <button type="button" className="frn-yes" onClick={ask}>
                <PlusIcon size={13} /> {t('friends.ask')}
              </button>
            </Person>
          </div>
        )}
        {error && <div className="auth-error">{error}</div>}
        {notice && <div className="auth-notice auth-notice-inline">{notice}</div>}
      </div>

      {incoming.length > 0 && (
        <div className="panel-section">
          <div className="section-title">{t('friends.waitingOnYou', { n: incoming.length })}</div>
          {incoming.map((l) => (
            <Person link={l} key={l.id}>
              <button type="button" className="frn-yes" onClick={() => accept(l.id)} aria-label={t('friends.accept')}>
                <CheckIcon size={13} /> {t('friends.accept')}
              </button>
              <button type="button" className="frn-no" onClick={() => drop(l.id)} aria-label={t('friends.decline')} title={t('friends.decline')}>
                <CloseIcon size={13} />
              </button>
            </Person>
          ))}
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="panel-section">
          <div className="section-title">{t('friends.waitingOnThem', { n: outgoing.length })}</div>
          {outgoing.map((l) => (
            <Person link={l} key={l.id}>
              <button type="button" className="frn-no frn-text" onClick={() => drop(l.id)}>
                {t('friends.cancel')}
              </button>
            </Person>
          ))}
        </div>
      )}

      <div className="panel-section">
        <div className="frn-head">
          <span className="section-title">{t('friends.yours', { n: friends.length })}</span>
          <button
            type="button"
            className={`frn-about-btn${aboutOpen ? ' on' : ''}`}
            onClick={() => setAboutOpen((v) => !v)}
            aria-expanded={aboutOpen}
            aria-label={t('friends.aboutTitle')}
            title={t('friends.aboutTitle')}
          >
            <InfoIcon size={14} />
          </button>
        </div>
        {aboutOpen && (
          <div className="frn-about">
            <p>{t('friends.noneYet')}</p>
            <p>{t('friends.privacyNote')}</p>
          </div>
        )}
        {loading ? (
          <div className="footnote">{t('saved.loading')}</div>
        ) : friends.length === 0 ? null : (
          friends.map((l) => (
            <Person link={l} key={l.id}>
              <button type="button" className="frn-no frn-text" onClick={() => drop(l.id)}>
                {t('friends.remove')}
              </button>
            </Person>
          ))
        )}
      </div>

      {friends.length > 0 && (
        <div className="panel-section">
          <div className="section-title">{t('friends.theirTrips')}{trips.length > 0 && ` (${trips.length})`}</div>
          {trips.length === 0 ? (
            <p className="account-section-hint">{t('friends.noTripsShown')}</p>
          ) : (
            trips.map((ft) => {
              const showing = openTrip === ft.tripPlanId;
              const who = ft.ownerName || `@${ft.ownerHandle}`;
              return (
                <div className="frn-trip" key={ft.tripPlanId}>
                  <button
                    type="button"
                    className={`frn-trip-row${showing ? ' on' : ''}`}
                    onClick={() => setOpenTrip(showing ? '' : ft.tripPlanId)}
                    aria-expanded={showing}
                  >
                    <span className="frn-trip-meta">
                      <b>{ft.label || (ft.cities || []).join(', ')}</b>
                      <span className="frn-trip-who">{t('friends.byWhom', { who })}</span>
                    </span>
                    {(ft.countries || []).length > 0 && (
                      <CountryFlagStack countries={ft.countries} size={14} />
                    )}
                  </button>
                  {showing && <FriendTripPanel planId={ft.tripPlanId} destinations={destinations} />}
                </div>
              );
            })
          )}
        </div>
      )}
    </>
  );
}
