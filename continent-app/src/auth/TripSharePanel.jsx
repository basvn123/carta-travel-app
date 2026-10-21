import React, { useEffect, useRef, useState } from 'react';
import { LinkIcon, TrashIcon, PersonIcon, PlusIcon } from '../components/Icons.jsx';
import { useI18n } from '../i18n/index.jsx';
import { Button, IconButton, Segmented, Field } from '../components/ui/index.js';
import {
  fetchTripShares, createTripShare, revokeTripShare, buildShareUrl,
  SHARE_DURATIONS, DEFAULT_SHARE_DAYS, daysLeft,
} from './tripShares.js';
import { setTripVisibility, fetchFriendLinks } from './friends.js';
import {
  listTripCoplanners, inviteCoplanner, removeCoplanner,
  listCoplanLinks, createCoplanLink, revokeCoplanLink, coplanLinkUrl,
} from './coplanners.js';

/**
 * TripSharePanel, everything about one trip and other people, under its card.
 *
 * Three questions, in the order a traveller asks them (T434):
 *   1. Who plans this with me: co-planners, invited by link or from friends.
 *   2. A view-only link for anyone, with no account needed.
 *   3. Who sees the trip inside Carta: only me, my friends, or the guides.
 *
 * What a link never carries (the expense ledger, booking references, notes)
 * is said once, because whether their money is in it is the one question
 * anybody sharing a trip has. The whitelist lives in one SQL function
 * (migration 009). Every link can be withdrawn, and the two answers that
 * cannot be held back (publishing, withdrawing a link somebody may hold) ask
 * once in place, with the safe answer focused.
 */
const VIS_OPTS = [
  { key: 'private', labelKey: 'share.visPrivate', subKey: 'share.visPrivateSub' },
  { key: 'friends', labelKey: 'share.visFriends', subKey: 'share.visFriendsSub' },
  { key: 'public', labelKey: 'guides.publish', subKey: 'guides.publishSub' },
];

/** Copies a URL, or hands it to the phone's own share sheet when there is one. */
async function handOver(url, title) {
  if (typeof navigator !== 'undefined' && navigator.share && window.matchMedia?.('(pointer: coarse)').matches) {
    try { await navigator.share({ url, title }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  await navigator.clipboard.writeText(url);
  return 'copied';
}

/** An inline "are you sure" with the safe answer focused; Escape keeps. */
function AskInline({ text, sub, keepLabel, goLabel, goVariant = 'danger', onKeep, onGo, label }) {
  const keepRef = useRef(null);
  useEffect(() => { keepRef.current?.focus(); }, []);
  return (
    <div
      className="tshare-ask"
      role="group"
      aria-label={label}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onKeep(); } }}
    >
      <p className="tshare-ask-text">{text}</p>
      {sub && <p className="tshare-sub">{sub}</p>}
      <div className="tshare-ask-row">
        <Button ref={keepRef} size="sm" onClick={onKeep}>{keepLabel}</Button>
        <Button size="sm" variant={goVariant} onClick={onGo}>{goLabel}</Button>
      </div>
    </div>
  );
}

/**
 * Plan together. A co-planner edits the route and the dates; they cannot
 * delete the trip, publish it or change who sees it, and the owner's day
 * plans, expenses and bookings stay the owner's (migration 020).
 *
 * Two ways in: a link anyone can open signed in (migration 052, which also
 * makes them friends, the condition 020 sets), or a friend from the list.
 * Without 052 on the project the link row hides itself.
 */
function PlanTogether({ userId, tripPlanId, t, title }) {
  const [people, setPeople] = useState([]);
  const [friends, setFriends] = useState([]);
  const [links, setLinks] = useState({ links: [], missing: false });
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const reload = () => listTripCoplanners(tripPlanId).then(setPeople).catch(() => {});

  useEffect(() => {
    let live = true;
    listTripCoplanners(tripPlanId).then((rows) => { if (live) setPeople(rows); }).catch(() => {});
    listCoplanLinks(tripPlanId).then((r) => { if (live) setLinks(r); }).catch(() => {});
    fetchFriendLinks(userId)
      .then((rows) => { if (live) setFriends(rows.filter((l) => l.kind === 'friend')); })
      .catch(() => {});
    return () => { live = false; };
  }, [tripPlanId, userId]);

  useEffect(() => {
    if (!note) return undefined;
    const id = setTimeout(() => setNote(''), 4000);
    return () => clearTimeout(id);
  }, [note]);

  const onTrip = new Set(people.map((p) => p.userId));
  const canAsk = friends.filter((f) => !onTrip.has(f.userId));

  const inviteByLink = async () => {
    setBusy('link');
    setError('');
    try {
      // One live link per trip: copying again hands over the same link
      // rather than minting another until the cap refuses.
      let token = links.links[0]?.token || '';
      if (!token) {
        const made = await createCoplanLink(tripPlanId);
        if (made.missing) { setLinks({ links: [], missing: true }); return; }
        token = made.token;
      }
      const how = await handOver(coplanLinkUrl(token), title || t('saved.fallbackTrip'));
      if (how !== 'cancelled') setNote(t(how === 'shared' ? 'coplan.linkShared' : 'coplan.linkCopied'));
      listCoplanLinks(tripPlanId).then(setLinks).catch(() => {});
    } catch (err) {
      setError(t(err?.code === 'TOO_MANY_LINKS' ? 'coplan.tooManyLinks' : 'coplan.failed'));
    } finally {
      setBusy('');
    }
  };

  const stopLinks = async () => {
    setError('');
    try {
      await Promise.all(links.links.map((l) => revokeCoplanLink(l.token)));
      setLinks({ links: [], missing: false });
    } catch { setError(t('coplan.failed')); }
  };

  const ask = async () => {
    if (!pick) return;
    setBusy('ask');
    setError('');
    try {
      await inviteCoplanner(tripPlanId, userId, pick);
      setPick('');
      await reload();
    } catch (err) {
      setError(t(err.code === 'ALREADY_ON_TRIP' ? 'coplan.errAlready' : 'coplan.failed'));
    } finally {
      setBusy('');
    }
  };

  const drop = async (who) => {
    setError('');
    try { await removeCoplanner(tripPlanId, who); await reload(); } catch { setError(t('coplan.failed')); }
  };

  return (
    <section className="tshare-block tshare-coplan" aria-labelledby={`coplan-${tripPlanId}`}>
      <h3 className="tshare-h" id={`coplan-${tripPlanId}`}>{t('coplan.title')}</h3>
      <p className="tshare-sub">{t('coplan.sub')}</p>

      {people.length > 0 && (
        <ul className="coplan-list">
          {people.map((p) => (
            <li className="coplan-row" key={p.userId}>
              <span className="coplan-face" aria-hidden="true">
                {p.avatarEmoji || <PersonIcon size={16} />}
              </span>
              <span className="coplan-who">
                <span className="coplan-name">{p.displayName || `@${p.handle}`}</span>
                <span className="coplan-state">
                  {t(p.status === 'accepted' ? 'coplan.stateOn' : 'coplan.statePending')}
                </span>
              </span>
              <Button size="sm" variant="quiet" onClick={() => drop(p.userId)}>
                {t(p.status === 'accepted' ? 'coplan.remove' : 'friends.cancel')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {!links.missing && (
        <div className="tshare-actions">
          <Button
            size="sm"
            iconStart={<LinkIcon size={16} />}
            onClick={inviteByLink}
            loading={busy === 'link'}
          >
            {t('coplan.inviteLink')}
          </Button>
          {links.links.length > 0 && (
            <Button size="sm" variant="quiet" onClick={stopLinks}>
              {t('coplan.stopLinks', { n: links.links.length })}
            </Button>
          )}
        </div>
      )}
      {!links.missing && <p className="tshare-sub">{t('coplan.linkWhat')}</p>}
      {note && <p className="tshare-status" role="status">{note}</p>}

      {canAsk.length > 0 && (
        <div className="coplan-ask">
          <Field
            as="select"
            label={t('coplan.pickLabel')}
            hideLabel
            value={pick}
            onChange={(e) => setPick(e.target.value)}
          >
            <option value="">{t('coplan.pickLabel')}</option>
            {canAsk.map((f) => (
              <option key={f.userId} value={f.userId}>{f.displayName || `@${f.handle}`}</option>
            ))}
          </Field>
          <Button size="sm" iconStart={<PlusIcon size={16} />} onClick={ask} disabled={!pick} loading={busy === 'ask'}>
            {t('coplan.invite')}
          </Button>
        </div>
      )}

      {error && <p className="tshare-error" role="alert">{error}</p>}
    </section>
  );
}

export function TripSharePanel({
  userId, tripPlanId, visibility = 'private', onVisibility, canInvite = true, title = '',
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
  const [askPublic, setAskPublic] = useState(false);
  const [askRevoke, setAskRevoke] = useState('');

  const subKey = (VIS_OPTS.find((o) => o.key === vis) || VIS_OPTS[0]).subKey;

  const pickVisibility = async (next, confirmed = false) => {
    if (next === vis) return;
    if (next === 'public' && !confirmed) { setAskPublic(true); return; }
    setAskPublic(false);
    const before = vis;
    setVis(next); // optimistic: the control must not lag the tap
    setError('');
    try {
      await setTripVisibility(tripPlanId, next);
      onVisibility?.(tripPlanId, next);
    } catch (e) {
      setVis(before);
      // Migration 051's publish gate raises with a stable hint: a guide
      // taken down and not yet reversed, or an account with no profile.
      setError(e?.hint === 'moderation_locked' ? t('share.visLocked')
        : e?.hint === 'profile_required' ? t('share.visNoProfile')
          : t('share.visFailed'));
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

  // "Copied" is a confirmation, not a state: two seconds, then "Copy" again.
  useEffect(() => {
    if (!copied) return undefined;
    const id = setTimeout(() => setCopied(''), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  const fmtDate = (iso) => {
    try {
      return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
    } catch { return ''; }
  };

  const copy = async (token) => {
    const url = buildShareUrl(token);
    if (!url) return;
    try {
      const how = await handOver(url, title || t('saved.fallbackTrip'));
      if (how !== 'cancelled') setCopied(token);
    } catch {
      setError(t('share.copyFailed'));
    }
  };

  const make = async () => {
    // Every share link is free (T488-b): it is how the next traveller hears
    // about Carta, and planning together is planning.
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
    setAskRevoke('');
    setError('');
    try {
      await revokeTripShare(token);
      setLinks((cur) => cur.filter((l) => l.token !== token));
    } catch {
      setError(t('share.revokeFailed'));
    }
  };

  return (
    <div className="tshare" id={`tshare-${tripPlanId}`} tabIndex={-1}>
      {canInvite && <PlanTogether userId={userId} tripPlanId={tripPlanId} t={t} title={title} />}

      <section className="tshare-block" aria-labelledby={`tshare-link-${tripPlanId}`}>
        <h3 className="tshare-h" id={`tshare-link-${tripPlanId}`}>{t('share.linkTitle')}</h3>
        <p className="tshare-sub">{t('share.neverIncluded')}</p>
        <div className="tshare-opts">
          <Segmented
            label={t('share.scopeLabel')}
            size="sm"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'itinerary', label: t('share.scopeItinerary') },
              { value: 'memory', label: t('share.scopeMemory') },
            ]}
          />
          <Segmented
            label={t('share.lifeTitle')}
            size="sm"
            value={String(days)}
            onChange={(v) => setDays(v === 'null' ? null : Number(v))}
            options={SHARE_DURATIONS.map((d) => ({
              value: String(d),
              label: d ? t('share.lifeDays', { n: d }) : t('share.lifeForever'),
            }))}
          />
        </div>
        <div className="tshare-actions">
          <Button size="sm" iconStart={<LinkIcon size={16} />} onClick={make} loading={busy}>
            {t('share.make')}
          </Button>
        </div>

        {!loading && links.length > 0 && (
          <ul className="tshare-list" aria-label={t('share.liveLinks', { n: links.length })}>
            {links.map((l) => (
              <li className="tshare-row" key={l.token}>
                <span className="tshare-row-meta">
                  <span className="tshare-row-name">{t(l.scope === 'memory' ? 'share.scopeMemory' : 'share.scopeItinerary')}</span>
                  <span className="tshare-row-date">
                    {l.expires_at
                      ? t('share.expiresIn', { n: Math.max(0, daysLeft(l.expires_at)) })
                      : t('share.madeOn', { date: fmtDate(l.created_at) })}
                  </span>
                </span>
                <Button size="sm" variant="quiet" onClick={() => copy(l.token)} aria-live="polite">
                  {copied === l.token ? t('share.copied') : t('share.copy')}
                </Button>
                <IconButton label={t('share.revoke')} onClick={() => setAskRevoke(l.token)}>
                  <TrashIcon size={16} />
                </IconButton>
                {askRevoke === l.token && (
                  <AskInline
                    label={t('share.revoke')}
                    text={t('share.revokeAsk')}
                    keepLabel={t('share.revokeKeep')}
                    goLabel={t('share.revokeGo')}
                    onKeep={() => setAskRevoke('')}
                    onGo={() => withdraw(l.token)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tshare-block" aria-labelledby={`tshare-vis-${tripPlanId}`}>
        <h3 className="tshare-h" id={`tshare-vis-${tripPlanId}`}>{t('share.visTitle')}</h3>
        <Segmented
          label={t('share.visTitle')}
          size="sm"
          value={vis}
          onChange={(v) => pickVisibility(v)}
          options={VIS_OPTS.map((o) => ({ value: o.key, label: t(o.labelKey) }))}
        />
        {askPublic ? (
          <AskInline
            label={t('guides.publish')}
            text={t('share.publicAsk')}
            sub={t('guides.publishSub')}
            keepLabel={t('share.publicKeep')}
            goLabel={t('share.publicGo')}
            goVariant="primary"
            onKeep={() => setAskPublic(false)}
            onGo={() => pickVisibility('public', true)}
          />
        ) : (
          <p className="tshare-sub">{t(subKey)}</p>
        )}
      </section>

      {error && <p className="tshare-error" role="alert">{error}</p>}
    </div>
  );
}
