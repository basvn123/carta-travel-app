import React, { useEffect, useState } from 'react';
import { LinkIcon, CheckIcon, TrashIcon } from '../components/Icons.jsx';
import { useI18n } from '../i18n/index.jsx';
import {
  fetchTripShares, createTripShare, revokeTripShare, buildShareUrl,
} from './tripShares.js';
import { setTripVisibility, VISIBILITIES } from './friends.js';

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
export function TripSharePanel({ userId, tripPlanId, visibility = 'private', onVisibility }) {
  const { t, lang } = useI18n();
  const [scope, setScope] = useState('itinerary');
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [vis, setVis] = useState(visibility);

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
      const row = await createTripShare(userId, tripPlanId, scope);
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
          {VISIBILITIES.filter((v) => v !== 'link').map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={vis === v}
              className={`tshare-vis-opt${vis === v ? ' on' : ''}`}
              onClick={() => pickVisibility(v)}
            >
              {t(v === 'private' ? 'share.visPrivate' : 'share.visFriends')}
            </button>
          ))}
        </div>
        <p className="tshare-vis-sub">
          {t(vis === 'friends' ? 'share.visFriendsSub' : 'share.visPrivateSub')}
        </p>
      </div>

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
                <span className="tshare-row-date">{t('share.madeOn', { date: fmtDate(l.created_at) })}</span>
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
