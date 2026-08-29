import React, { useEffect, useState } from 'react';
import { LinkIcon, CheckIcon, TrashIcon, PersonIcon } from '../components/Icons.jsx';
import { useI18n } from '../i18n/index.jsx';
import {
  fetchTripShares, createTripShare, revokeTripShare, buildShareUrl,
  SHARE_DURATIONS, DEFAULT_SHARE_DAYS, daysLeft,
} from './tripShares.js';
import { setTripVisibility, fetchFriendLinks } from './friends.js';
import { listTripCoplanners, inviteCoplanner, removeCoplanner } from './coplanners.js';

/**
 * TripSharePanel, handing one saved trip to somebody as a read-only link.
 *
 * Opens under the trip's card, the same way the memory view does, so sharing
 * reads as something you do TO this trip rather than a place you go.
 *
 * The two scopes are stated as what the reader will see, not as permission
 * levels: "where and when" against "the whole trip". What neither of them
 * carries is said out loud, because the one question anybody sharing a trip
 * actually has is whether their money is in it. It is not, at either scope,
 * and the reader is never asked to take that on trust: the whitelist lives in
 * one SQL function and proves itself on apply (migration 009).
 *
 * Every link can be withdrawn, and says when it was made, because a link you
 * cannot take back is the thing that stops people sharing at all.
 *
 * Visibility sits at the top of the same panel rather than in a menu of its
 * own, so one screen answers the whole of "who can see this trip". Friends and
 * links are independent: a private trip can still have a live link out, which
 * is exactly why the links below are listed even when visibility is private.
 */
/**
 * Who can see this trip, as three answers rather than as permission levels.
 *
 * The third one publishes. It is the only option here that puts something in
 * front of strangers, so it is the only one whose sub-line has to say exactly
 * what does and does not travel: migration 019 narrows the friend projection
 * for a public reader (no dates, no crew, no spend), and a control that
 * publishes without saying so would be the whole problem.
 *
 * 'link' is absent on purpose. A share token is handed to one person and is
 * managed by the list further down this panel, so it is not a third state of
 * the same question.
 */
const VIS_OPTS = [
  { key: 'private', labelKey: 'share.visPrivate', subKey: 'share.visPrivateSub' },
  { key: 'friends', labelKey: 'share.visFriends', subKey: 'share.visFriendsSub' },
  { key: 'public', labelKey: 'guides.publish', subKey: 'guides.publishSub' },
];


/**
 * CoplannerBlock, who else may edit this trip.
 *
 * Only friends appear in the picker, because migration 020's insert policy
 * only accepts a friend and a control that offers what the database refuses
 * is a control that lies. Only the owner sees this block at all.
 *
 * The sub-line says exactly what a co-planner gets and what they do not, in
 * the same voice the visibility control above uses, because "Collaborate" on
 * its own is the kind of button people press without knowing what they just
 * handed over.
 */
function CoplannerBlock({ userId, tripPlanId, t }) {
  const [people, setPeople] = useState([]);
  const [friends, setFriends] = useState([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reload = () => listTripCoplanners(tripPlanId).then(setPeople).catch(() => {});

  useEffect(() => {
    let live = true;
    listTripCoplanners(tripPlanId).then((rows) => { if (live) setPeople(rows); }).catch(() => {});
    fetchFriendLinks(userId)
      .then((rows) => { if (live) setFriends(rows.filter((l) => l.kind === 'friend')); })
      .catch(() => {});
    return () => { live = false; };
  }, [tripPlanId, userId]);

  const onTrip = new Set(people.map((p) => p.userId));
  const canAsk = friends.filter((f) => !onTrip.has(f.userId));

  const invite = async () => {
    if (!pick) return;
    setBusy(true);
    setError('');
    try {
      await inviteCoplanner(tripPlanId, userId, pick);
      setPick('');
      await reload();
    } catch (err) {
      setError(t(err.code === 'ALREADY_ON_TRIP' ? 'coplan.errAlready' : 'coplan.failed'));
    } finally {
      setBusy(false);
    }
  };

  const drop = async (who) => {
    setError('');
    try { await removeCoplanner(tripPlanId, who); await reload(); } catch { setError(t('coplan.failed')); }
  };

  return (
    <div className="tshare-coplan">
      <span className="coplan-title">{t('coplan.title')}</span>
      <p className="coplan-sub">{t('coplan.sub')}</p>

      {people.length > 0 && (
        <div className="coplan-list">
          {people.map((p) => (
            <div className="coplan-row" key={p.userId}>
              <span className="frn-face" aria-hidden="true">
                {p.avatarEmoji || <PersonIcon size={14} />}
              </span>
              <span className="coplan-who">
                <b>{p.displayName || `@${p.handle}`}</b>
                <span className="coplan-state">
                  {t(p.status === 'accepted' ? 'coplan.stateOn' : 'coplan.statePending')}
                </span>
              </span>
              <button type="button" className="frn-no frn-text" onClick={() => drop(p.userId)}>
                {t(p.status === 'accepted' ? 'coplan.remove' : 'friends.cancel')}
              </button>
            </div>
          ))}
        </div>
      )}

      {canAsk.length > 0 ? (
        <div className="coplan-ask">
          <select
            className="coplan-pick"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            aria-label={t('coplan.pickLabel')}
          >
            <option value="">{t('coplan.pickLabel')}</option>
            {canAsk.map((f) => (
              <option key={f.userId} value={f.userId}>
                {f.displayName || `@${f.handle}`}
              </option>
            ))}
          </select>
          <button type="button" className="coplan-ask-btn" onClick={invite} disabled={!pick || busy}>
            {busy ? t('account.pleaseWait') : t('coplan.invite')}
          </button>
        </div>
      ) : (
        <p className="tshare-never">{t(friends.length ? 'coplan.allAsked' : 'coplan.needFriend')}</p>
      )}

      {error && <div className="auth-error">{error}</div>}
    </div>
  );
}

export function TripSharePanel({
  userId, tripPlanId, visibility = 'private', onVisibility, canInvite = true,
}) {
  const { t, lang } = useI18n();
  const [scope, setScope] = useState('itinerary');
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [vis, setVis] = useState(visibility);
  // Thirty days by default rather than forever: a link handed out for one
  // conversation should not outlive it, and nobody comes back to tidy up.
  const [days, setDays] = useState(DEFAULT_SHARE_DAYS);

  const subKey = (VIS_OPTS.find((o) => o.key === vis) || VIS_OPTS[0]).subKey;

  const pickVisibility = async (next) => {
    if (next === vis) return;
    const before = vis;
    setVis(next); // optimistic: the control must not lag the tap
    setError('');
    try {
      await setTripVisibility(tripPlanId, next);
      onVisibility?.(tripPlanId, next);
    } catch {
      setVis(before);
      setError(t('share.visFailed'));
    }
  };

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchTripShares(tripPlanId)
      .then((rows) => { if (live) setLinks(rows); })
      .catch(() => { if (live) setError(t('share.unavailable')); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [tripPlanId, t]);

  // The tick is a confirmation, not a state: it has to go away on its own or
  // the next copy has nothing to report.
  useEffect(() => {
    if (!copied) return undefined;
    const id = setTimeout(() => setCopied(''), 2500);
    return () => clearTimeout(id);
  }, [copied]);

  const fmtDate = (iso) => {
    try {
      return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' })
        .format(new Date(iso));
    } catch { return ''; }
  };

  const copy = async (token) => {
    const url = buildShareUrl(token);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
    } catch {
      setError(t('share.copyFailed'));
    }
  };

  const make = async () => {
    setBusy(true);
    setError('');
    try {
      const row = await createTripShare(userId, tripPlanId, scope, days);
      setLinks((cur) => [row, ...cur]);
      await copy(row.token);
    } catch {
      setError(t('share.createFailed'));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (token) => {
    setError('');
    try {
      await revokeTripShare(token);
      setLinks((cur) => cur.filter((l) => l.token !== token));
    } catch {
      setError(t('share.revokeFailed'));
    }
  };

  return (
    <div className="tshare">
      <div className="tshare-vis">
        <span className="tshare-vis-title">{t('share.visTitle')}</span>
        <div className="tshare-vis-opts" role="radiogroup" aria-label={t('share.visTitle')}>
          {VIS_OPTS.map((o) => (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={vis === o.key}
              className={`tshare-vis-opt${vis === o.key ? ' on' : ''}`}
              onClick={() => pickVisibility(o.key)}
            >
              {t(o.labelKey)}
            </button>
          ))}
        </div>
        <p className="tshare-vis-sub">{t(subKey)}</p>
      </div>

      {canInvite && <CoplannerBlock userId={userId} tripPlanId={tripPlanId} t={t} />}

      <p className="tshare-lede">{t('share.lede')}</p>

      <div className="tshare-scopes" role="radiogroup" aria-label={t('share.scopeLabel')}>
        {[
          { key: 'itinerary', title: t('share.scopeItinerary'), sub: t('share.scopeItinerarySub') },
          { key: 'memory', title: t('share.scopeMemory'), sub: t('share.scopeMemorySub') },
        ].map((s) => (
          <button
            key={s.key}
            type="button"
            role="radio"
            aria-checked={scope === s.key}
            className={`tshare-scope${scope === s.key ? ' on' : ''}`}
            onClick={() => setScope(s.key)}
          >
            <b>{s.title}</b>
            <span>{s.sub}</span>
          </button>
        ))}
      </div>

      <div className="tshare-life">
        <span className="tshare-life-title">{t('share.lifeTitle')}</span>
        <div className="tshare-life-opts" role="radiogroup" aria-label={t('share.lifeTitle')}>
          {SHARE_DURATIONS.map((d) => (
            <button
              key={String(d)}
              type="button"
              role="radio"
              aria-checked={days === d}
              className={`tshare-life-opt${days === d ? ' on' : ''}`}
              onClick={() => setDays(d)}
            >
              {d ? t('share.lifeDays', { n: d }) : t('share.lifeForever')}
            </button>
          ))}
        </div>
      </div>

      <p className="tshare-never">{t('share.neverIncluded')}</p>

      <button type="button" className="tshare-make" onClick={make} disabled={busy}>
        <LinkIcon size={14} />
        {busy ? t('share.making') : t('share.make')}
      </button>

      {error && <div className="auth-error">{error}</div>}

      {!loading && links.length > 0 && (
        <div className="tshare-list">
          <span className="tshare-list-title">{t('share.liveLinks', { n: links.length })}</span>
          {links.map((l) => (
            <div className="tshare-row" key={l.token}>
              <span className="tshare-row-meta">
                <b>{t(l.scope === 'memory' ? 'share.scopeMemory' : 'share.scopeItinerary')}</b>
                <span className="tshare-row-date">
                  {l.expires_at
                    ? t('share.expiresIn', { n: Math.max(0, daysLeft(l.expires_at)) })
                    : t('share.madeOn', { date: fmtDate(l.created_at) })}
                </span>
              </span>
              <button
                type="button"
                className="tshare-copy"
                onClick={() => copy(l.token)}
              >
                {copied === l.token ? <CheckIcon size={13} /> : <LinkIcon size={13} />}
                {copied === l.token ? t('share.copied') : t('share.copy')}
              </button>
              <button
                type="button"
                className="tshare-revoke"
                onClick={() => withdraw(l.token)}
                aria-label={t('share.revoke')}
                title={t('share.revoke')}
              >
                <TrashIcon size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
