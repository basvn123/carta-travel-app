import React, { useEffect, useState } from 'react';
import { PersonIcon, CheckIcon, CloseIcon, SearchIcon, PlusIcon } from '../components/Icons.jsx';
import { useI18n } from '../i18n/index.jsx';
import { findByHandle, normaliseHandle, handleProblem } from './profiles.js';
import {
  fetchFriendLinks, sendFriendRequest, acceptFriendRequest, removeFriendLink,
  listFriendTrips,
} from './friends.js';
import { FriendTripPanel } from './FriendTripPanel.jsx';
import { CountryFlagStack } from '../components/CountryFlag.jsx';

/**
 * FriendsSpoke, the people whose trips you can see and who can see yours.
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

export function FriendsSpoke({ userId }) {
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
    return () => { live = false; };
  }, [userId, t]);

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
      <div className="panel-section">
        <div className="section-title section-title-iconed">
          <SearchIcon size={12} /> {t('friends.addTitle')}
        </div>
        <p className="account-section-hint">{t('friends.addHint')}</p>
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
        <div className="section-title">{t('friends.yours', { n: friends.length })}</div>
        {loading ? (
          <div className="footnote">{t('saved.loading')}</div>
        ) : friends.length === 0 ? (
          <p className="account-section-hint">{t('friends.noneYet')}</p>
        ) : (
          friends.map((l) => (
            <Person link={l} key={l.id}>
              <button type="button" className="frn-no frn-text" onClick={() => drop(l.id)}>
                {t('friends.remove')}
              </button>
            </Person>
          ))
        )}
        <p className="account-section-hint frn-foot">{t('friends.privacyNote')}</p>
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
                  {showing && <FriendTripPanel planId={ft.tripPlanId} />}
                </div>
              );
            })
          )}
        </div>
      )}
    </>
  );
}
