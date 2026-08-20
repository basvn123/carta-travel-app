import React, { useEffect, useRef, useState } from 'react';
import {
  adminAddNote, adminBanUser, adminDeleteUser, adminGetAudit, adminGetUser,
  adminListUsers, adminMark, adminResetQuota, adminSetConfig, adminSetTier,
  adminStats, adminUnbanUser,
} from './admin.js';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from './AuthContext.jsx';
import { useI18n } from '../i18n/index.jsx';
import { TIERS } from '../lib/pricing.js';
import {
  ArrowLeftIcon, ChevronRightIcon, DownloadIcon, LockIcon, SearchIcon,
} from '../components/Icons.jsx';

// The staff door. It renders only for accounts in public.admin_users, but
// that gate is decoration: every RPC this spoke calls re-checks membership on
// the server, refuses anybody else, and rate-limits even a real admin
// session. What it does need is the same restraint as the rest of the panel:
// measured facts in mono, destructive actions armed before they fire, and
// the audit trail naming whatever happened.
//
// The spoke opens behind a re-auth lock: holding a warm session is not proof
// of identity (an unlocked laptop is enough for that), so a password account
// proves the password again, the same shape the panel already uses to change
// it. Google-only accounts retype their address instead; that is a speed
// bump rather than proof, and the server-side gate is the real floor. The
// lock re-arms every time the spoke is entered, because unlocking lives in
// component state and the spoke unmounts on the way out.
//
// Spoke contract (see FriendsSpoke): bare .panel-section blocks, no header of
// its own, the hub's back button is the way out.

const PAGE = 50;

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit', month: 'short', year: 'numeric',
    }).format(new Date(iso));
  } catch { return ''; }
}

function fmtDateTime(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch { return ''; }
}

export function AdminSpoke() {
  const { t } = useI18n();
  const { user, hasPassword, reauthenticate, sendPasswordReset } = useAuth();

  const [unlocked, setUnlocked] = useState(false);
  const [lockValue, setLockValue] = useState('');
  const [lockBusy, setLockBusy] = useState(false);
  const [lockErr, setLockErr] = useState('');

  const [stats, setStats] = useState(null);
  const [audit, setAudit] = useState(null);

  // The site notice editor. Seeded from what is live right now (the table is
  // world-readable, so a plain select is enough), published through the gated
  // RPC. The dirty flag exists so "Notice published" stops claiming to be
  // true the moment anything is edited again.
  const [noticeOn, setNoticeOn] = useState(false);
  const [noticeText, setNoticeText] = useState('');
  const [noticeTone, setNoticeTone] = useState('info');
  const [noticeBusy, setNoticeBusy] = useState(false);
  const [noticeSaved, setNoticeSaved] = useState(false);
  const [noticeErr, setNoticeErr] = useState('');

  // Feature flags: site_config.features, an object of plain booleans. The
  // server refuses anything else, so this editor cannot publish a shape the
  // useFeature hook would choke on.
  const [flags, setFlags] = useState({});
  const [newFlag, setNewFlag] = useState('');
  const [flagsBusy, setFlagsBusy] = useState(false);
  const [flagsSaved, setFlagsSaved] = useState(false);
  const [flagsErr, setFlagsErr] = useState('');

  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [listBusy, setListBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const listReq = useRef(0);

  // One user opened in full. While set, the list section shows the detail
  // instead; everything else on the spoke stays where it was.
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [tierPick, setTierPick] = useState('free');
  const [tierDays, setTierDays] = useState('');
  const [tierBusy, setTierBusy] = useState(false);
  const [actionNotice, setActionNotice] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [quotaArmed, setQuotaArmed] = useState(false);
  const [quotaBusy, setQuotaBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [banArmed, setBanArmed] = useState(false);
  const [banDays, setBanDays] = useState('');
  const [banBusy, setBanBusy] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const errText = (e) => {
    const code = e?.code || '';
    if (code === 'forbidden') return t('admin.errForbidden');
    if (code === 'slow_down') return t('admin.errSlow');
    if (code === 'confirm_mismatch') return t('admin.errConfirm');
    if (code === 'target_is_admin') return t('admin.errTargetAdmin');
    if (code === 'own_account') return t('admin.errOwn');
    return t('admin.errGeneric');
  };

  const unlock = async () => {
    setLockBusy(true); setLockErr('');
    try {
      if (hasPassword) {
        await reauthenticate(lockValue);
      } else if (lockValue.trim().toLowerCase() !== (user?.email || '').toLowerCase()) {
        throw new Error('mismatch');
      }
      setUnlocked(true);
    } catch {
      setLockErr(hasPassword ? t('admin.lockWrong') : t('admin.lockWrongEmail'));
    }
    setLockBusy(false);
  };

  useEffect(() => {
    if (!unlocked) return;
    adminStats().then(setStats).catch(() => setStats(null));
    adminGetAudit(20, 0).then(setAudit).catch(() => setAudit(null));
    if (supabase) {
      supabase.from('site_config').select('key,value').then(({ data }) => {
        for (const row of data || []) {
          if (row.key === 'announcement' && row.value && typeof row.value === 'object') {
            setNoticeOn(!!row.value.enabled);
            setNoticeText(typeof row.value.text === 'string' ? row.value.text : '');
            setNoticeTone(row.value.tone === 'warn' ? 'warn' : 'info');
          }
          if (row.key === 'features' && row.value && typeof row.value === 'object') {
            const clean = {};
            for (const [k, v] of Object.entries(row.value)) {
              if (typeof v === 'boolean') clean[k] = v;
            }
            setFlags(clean);
          }
        }
      });
    }
  }, [unlocked]);

  // The user list follows the search box, debounced so typing does not fire a
  // query per keystroke. The request id guard drops a slow answer that would
  // otherwise overwrite a newer search.
  useEffect(() => {
    if (!unlocked) return undefined;
    const id = ++listReq.current;
    setListBusy(true);
    const timer = setTimeout(async () => {
      try {
        const res = await adminListUsers(search.trim() || null, PAGE, 0);
        if (id !== listReq.current) return;
        setRows(res.rows || []);
        setTotal(res.total || 0);
      } catch {
        if (id === listReq.current) { setRows([]); setTotal(0); }
      } finally {
        if (id === listReq.current) setListBusy(false);
      }
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, unlocked]);

  const reloadList = async () => {
    try {
      const res = await adminListUsers(search.trim() || null, Math.max(rows.length, PAGE), 0);
      setRows(res.rows || []);
      setTotal(res.total || 0);
    } catch { /* the list keeps what it had */ }
  };

  const loadMore = async () => {
    try {
      const res = await adminListUsers(search.trim() || null, PAGE, rows.length);
      setRows((r) => [...r, ...(res.rows || [])]);
      setTotal(res.total || 0);
    } catch { /* the button stays, a retry is one click */ }
  };

  const openUser = async (id) => {
    setDetailBusy(true);
    setActionErr(''); setActionNotice('');
    setQuotaArmed(false); setBanArmed(false); setBanDays('');
    setDeleteArmed(false); setDeleteConfirm('');
    try {
      const d = await adminGetUser(id);
      setDetail(d);
      setTierPick(d.tier || 'free');
      setTierDays('');
    } catch (e) {
      setActionErr(errText(e));
    }
    setDetailBusy(false);
  };

  const saveNotice = async () => {
    setNoticeBusy(true); setNoticeErr(''); setNoticeSaved(false);
    try {
      await adminSetConfig('announcement', {
        enabled: noticeOn, text: noticeText.trim(), tone: noticeTone,
      });
      setNoticeSaved(true);
    } catch (e) {
      setNoticeErr(errText(e));
    }
    setNoticeBusy(false);
  };

  const saveFlags = async () => {
    setFlagsBusy(true); setFlagsErr(''); setFlagsSaved(false);
    try {
      await adminSetConfig('features', flags);
      setFlagsSaved(true);
    } catch (e) {
      setFlagsErr(errText(e));
    }
    setFlagsBusy(false);
  };

  const applyTier = async () => {
    if (!detail) return;
    setTierBusy(true); setActionErr(''); setActionNotice('');
    try {
      const days = tierDays.trim() ? parseInt(tierDays, 10) : NaN;
      await adminSetTier(detail.id, tierPick, Number.isFinite(days) && days > 0 ? days : null);
      await openUser(detail.id);
      setActionNotice(t('admin.passApplied'));
      adminStats().then(setStats).catch(() => {});
      reloadList();
    } catch (e) {
      setActionErr(errText(e));
    }
    setTierBusy(false);
  };

  const resetQuota = async () => {
    if (!detail) return;
    if (!quotaArmed) { setQuotaArmed(true); return; }
    setQuotaBusy(true); setActionErr(''); setActionNotice('');
    try {
      await adminResetQuota(detail.id);
      await openUser(detail.id);
      setActionNotice(t('admin.quotaDone'));
    } catch (e) {
      setActionErr(errText(e));
    }
    setQuotaBusy(false); setQuotaArmed(false);
  };

  // The reset mail rides the ordinary public recover endpoint; admin_mark is
  // what puts it into the trail, since the endpoint itself cannot.
  const sendReset = async () => {
    if (!detail?.email) return;
    setResetBusy(true); setActionErr(''); setActionNotice('');
    try {
      await sendPasswordReset(detail.email);
      await adminMark('send_reset', detail.id).catch(() => {});
      await openUser(detail.id);
      setActionNotice(t('admin.resetSent'));
    } catch (e) {
      setActionErr(errText(e));
    }
    setResetBusy(false);
  };

  const doBan = async () => {
    if (!detail) return;
    setBanBusy(true); setActionErr(''); setActionNotice('');
    try {
      const days = banDays.trim() ? parseInt(banDays, 10) : 36500;
      await adminBanUser(detail.id, Number.isFinite(days) && days > 0 ? days : 36500);
      await openUser(detail.id);
      setActionNotice(t('admin.banDone'));
      reloadList();
    } catch (e) {
      setActionErr(errText(e));
    }
    setBanBusy(false);
  };

  const doUnban = async () => {
    if (!detail) return;
    setBanBusy(true); setActionErr(''); setActionNotice('');
    try {
      await adminUnbanUser(detail.id);
      await openUser(detail.id);
      setActionNotice(t('admin.banLifted'));
      reloadList();
    } catch (e) {
      setActionErr(errText(e));
    }
    setBanBusy(false);
  };

  const saveNote = async () => {
    if (!detail || !noteText.trim()) return;
    setNoteBusy(true); setActionErr(''); setActionNotice('');
    try {
      await adminAddNote(detail.id, noteText.trim());
      setNoteText('');
      await openUser(detail.id);
      setActionNotice(t('admin.noteSaved'));
    } catch (e) {
      setActionErr(errText(e));
    }
    setNoteBusy(false);
  };

  const doDelete = async () => {
    if (!detail) return;
    setDeleteBusy(true); setActionErr('');
    try {
      await adminDeleteUser(detail.id, deleteConfirm.trim());
      setDetail(null);
      adminStats().then(setStats).catch(() => {});
      reloadList();
    } catch (e) {
      setActionErr(errText(e));
    }
    setDeleteBusy(false);
  };

  // The whole list as a file, for support and bookkeeping. Follows the
  // current search, pages through the RPC, and caps at 5000 rows so a typo
  // can never ask the server for the moon.
  const exportCsv = async () => {
    setCsvBusy(true);
    try {
      const all = [];
      let want = Infinity;
      while (all.length < want && all.length < 5000) {
        const res = await adminListUsers(search.trim() || null, 100, all.length);
        want = res.total || 0;
        const batch = res.rows || [];
        if (!batch.length) break;
        all.push(...batch);
      }
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const head = ['id', 'email', 'handle', 'display_name', 'tier', 'pass_expires',
        'suspended_until', 'signed_up', 'last_sign_in', 'trip_plans', 'day_plans'];
      const lines = [head.join(',')].concat(all.map((r) => [
        r.id, r.email, r.handle, r.displayName, r.tier, r.expiresAt,
        r.bannedUntil, r.createdAt, r.lastSignIn, r.tripPlans, r.dayPlans,
      ].map(esc).join(',')));
      // The BOM is for Excel, which otherwise guesses the encoding wrong.
      const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `carta-users-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { /* the button stays, a retry is one click */ }
    setCsvBusy(false);
  };

  const rowName = (r) => r.displayName || r.handle || r.email || r.id;

  if (!unlocked) {
    return (
      <div className="panel-section">
        <div className="admin-lock">
          <span className="admin-lock-icon" aria-hidden="true"><LockIcon size={20} /></span>
          <p className="account-section-hint">
            {hasPassword ? t('admin.lockHint') : t('admin.lockHintEmail')}
          </p>
          <div className="auth-field">
            <label className="auth-label" htmlFor="admin-lock-input">
              {hasPassword ? t('admin.lockLabel') : t('admin.lockLabelEmail')}
            </label>
            <input
              id="admin-lock-input"
              className="auth-input"
              type={hasPassword ? 'password' : 'email'}
              autoComplete={hasPassword ? 'current-password' : 'off'}
              value={lockValue}
              onChange={(e) => { setLockValue(e.target.value); setLockErr(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && lockValue.trim()) unlock(); }}
            />
          </div>
          {lockErr && <p className="admin-error">{lockErr}</p>}
          <button
            className="auth-submit account-wide-btn"
            disabled={lockBusy || !lockValue.trim()}
            onClick={unlock}
          >
            {lockBusy ? t('account.pleaseWait') : t('admin.lockUnlock')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="panel-section">
        <p className="account-section-hint">{t('admin.hint')}</p>
        {stats && (
          <div className="admin-stats">
            <div className="admin-stat"><b>{stats.users}</b><span>{t('admin.statUsers')}</span></div>
            <div className="admin-stat"><b>{stats.newMonth}</b><span>{t('admin.statNewMonth')}</span></div>
            <div className="admin-stat"><b>{stats.passesTrip}</b><span>{t('admin.statTrip')}</span></div>
            <div className="admin-stat"><b>{stats.passesYear}</b><span>{t('admin.statYear')}</span></div>
            <div className="admin-stat"><b>{stats.tripPlans}</b><span>{t('admin.statTrips')}</span></div>
            <div className="admin-stat"><b>{stats.aiToday}</b><span>{t('admin.statAiToday')}</span></div>
          </div>
        )}
      </div>

      <div className="panel-section">
        <div className="section-title">{t('admin.noticeTitle')}</div>
        <p className="account-section-hint">{t('admin.noticeHint')}</p>
        <label className="admin-toggle">
          <input
            type="checkbox"
            checked={noticeOn}
            onChange={(e) => { setNoticeOn(e.target.checked); setNoticeSaved(false); }}
          />
          <span>{t('admin.noticeEnabled')}</span>
        </label>
        <textarea
          className="account-feedback-input admin-notice-input"
          rows={3}
          maxLength={280}
          value={noticeText}
          placeholder={t('admin.noticePlaceholder')}
          onChange={(e) => { setNoticeText(e.target.value); setNoticeSaved(false); }}
        />
        <div className="admin-tone" role="radiogroup" aria-label={t('admin.noticeTitle')}>
          {['info', 'warn'].map((tone) => (
            <button
              key={tone}
              type="button"
              role="radio"
              aria-checked={noticeTone === tone}
              className={`admin-tone-opt ${noticeTone === tone ? 'on' : ''}`}
              onClick={() => { setNoticeTone(tone); setNoticeSaved(false); }}
            >
              {t(tone === 'warn' ? 'admin.noticeToneWarn' : 'admin.noticeToneInfo')}
            </button>
          ))}
        </div>
        {noticeErr && <p className="admin-error">{noticeErr}</p>}
        <button
          className="auth-submit account-wide-btn"
          disabled={noticeBusy || (noticeOn && !noticeText.trim())}
          onClick={saveNotice}
        >
          {noticeBusy ? t('account.pleaseWait') : noticeSaved ? t('admin.noticeSaved') : t('admin.noticeSave')}
        </button>
      </div>

      <div className="panel-section">
        <div className="section-title">{t('admin.flagsTitle')}</div>
        <p className="account-section-hint">{t('admin.flagsHint')}</p>
        {Object.keys(flags).length === 0 && (
          <p className="account-section-hint">{t('admin.flagsNone')}</p>
        )}
        <div className="admin-flags">
          {Object.entries(flags).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
            <div key={k} className="admin-flag-row">
              <code className="admin-flag-name">{k}</code>
              <button
                type="button"
                role="switch"
                aria-checked={v}
                className={`admin-flag-toggle ${v ? 'on' : ''}`}
                onClick={() => { setFlags((f) => ({ ...f, [k]: !v })); setFlagsSaved(false); }}
              >
                {v ? t('admin.flagOn') : t('admin.flagOff')}
              </button>
              <button
                type="button"
                className="admin-flag-del"
                aria-label={t('admin.flagRemove')}
                onClick={() => {
                  setFlags((f) => {
                    const next = { ...f };
                    delete next[k];
                    return next;
                  });
                  setFlagsSaved(false);
                }}
              >
                x
              </button>
            </div>
          ))}
        </div>
        <div className="admin-flag-add">
          <input
            value={newFlag}
            aria-label={t('admin.flagAddLabel')}
            placeholder="beta_map"
            onChange={(e) => setNewFlag(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40))}
          />
          <button
            type="button"
            className="admin-btn-secondary"
            disabled={!newFlag || flags[newFlag] !== undefined}
            onClick={() => {
              setFlags((f) => ({ ...f, [newFlag]: false }));
              setNewFlag('');
              setFlagsSaved(false);
            }}
          >
            {t('admin.flagAdd')}
          </button>
        </div>
        {flagsErr && <p className="admin-error">{flagsErr}</p>}
        <button
          type="button"
          className="admin-btn-secondary"
          disabled={flagsBusy}
          onClick={saveFlags}
        >
          {flagsBusy ? t('account.pleaseWait') : flagsSaved ? t('admin.flagsSaved') : t('admin.flagsSave')}
        </button>
      </div>

      {!detail ? (
        <div className="panel-section">
          <div className="admin-users-head">
            <div className="section-title">{t('admin.usersTitle')}</div>
            <button
              type="button"
              className="admin-csv-btn"
              disabled={csvBusy}
              onClick={exportCsv}
            >
              <DownloadIcon size={13} /> {csvBusy ? t('account.pleaseWait') : t('admin.exportCsv')}
            </button>
          </div>
          <div className="admin-search">
            <SearchIcon size={15} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('admin.searchPlaceholder')}
              aria-label={t('admin.searchLabel')}
            />
          </div>
          {actionErr && <p className="admin-error">{actionErr}</p>}
          {rows.length === 0 && !listBusy && (
            <p className="account-section-hint">{t('admin.none')}</p>
          )}
          <div className="admin-users">
            {rows.map((r) => (
              <button key={r.id} type="button" className="admin-user-row" onClick={() => openUser(r.id)} disabled={detailBusy}>
                <span className="admin-user-ava" aria-hidden="true">
                  {r.avatarEmoji || rowName(r).charAt(0).toUpperCase()}
                </span>
                <span className="admin-user-meta">
                  <b>{rowName(r)}</b>
                  <span>{r.email}</span>
                </span>
                {r.isAdmin && <span className="admin-chip staff">{t('admin.chipStaff')}</span>}
                {!!r.bannedUntil && <span className="admin-chip banned">{t('admin.chipBanned')}</span>}
                {r.tier !== 'free' && <span className={`admin-chip ${r.tier}`}>{r.tier}</span>}
                <ChevronRightIcon size={16} className="account-menu-chev" />
              </button>
            ))}
          </div>
          {rows.length > 0 && (
            <p className="admin-showing">{t('admin.showing', { shown: rows.length, total })}</p>
          )}
          {rows.length < total && (
            <button type="button" className="admin-btn-secondary" onClick={loadMore}>
              {t('admin.loadMore')}
            </button>
          )}
        </div>
      ) : (
        <div className="panel-section">
          <button type="button" className="account-back admin-back" onClick={() => setDetail(null)}>
            <ArrowLeftIcon size={13} /> {t('admin.backToList')}
          </button>

          <div className="admin-detail-head">
            <span className="admin-user-ava admin-user-ava-lg" aria-hidden="true">
              {detail.avatarEmoji || (detail.displayName || detail.handle || detail.email || '?').charAt(0).toUpperCase()}
            </span>
            <span className="admin-user-meta">
              <b>{detail.displayName || detail.handle || detail.email}</b>
              <span>{detail.email}{detail.handle ? ` @${detail.handle}` : ''}</span>
            </span>
            {detail.isAdmin && <span className="admin-chip staff">{t('admin.chipStaff')}</span>}
            {!!detail.bannedUntil && <span className="admin-chip banned">{t('admin.chipBanned')}</span>}
          </div>

          <dl className="admin-facts">
            <div><dt>{t('admin.fSignedUp')}</dt><dd>{fmtDate(detail.createdAt)}</dd></div>
            <div><dt>{t('admin.fLastSeen')}</dt><dd>{fmtDateTime(detail.lastSignIn) || t('admin.never')}</dd></div>
            <div><dt>{t('admin.fProvider')}</dt><dd>{detail.provider || 'email'}</dd></div>
            <div><dt>{t('admin.fConfirmed')}</dt><dd>{detail.confirmedAt ? t('admin.yes') : t('admin.no')}</dd></div>
            {!!detail.bannedUntil && (
              <div><dt>{t('admin.fBanned')}</dt><dd>{fmtDate(detail.bannedUntil)}</dd></div>
            )}
            <div><dt>{t('admin.fTrips')}</dt><dd>{detail.tripPlans}</dd></div>
            <div><dt>{t('admin.fDayPlans')}</dt><dd>{detail.dayPlans}</dd></div>
            <div><dt>{t('admin.fFriends')}</dt><dd>{detail.friends}</dd></div>
            <div><dt>{t('admin.fBadges')}</dt><dd>{(detail.badges || []).length}</dd></div>
            <div><dt>{t('admin.fPlansUsed')}</dt><dd>{detail.plansUsed}</dd></div>
            <div><dt>{t('admin.fGroundUsed')}</dt><dd>{detail.groundUsed}</dd></div>
          </dl>

          <div className="section-title">{t('admin.passTitle')}</div>
          {detail.tier !== 'free' && detail.expiresAt && (
            <p className="account-section-hint admin-pass-now">
              {t('admin.passUntil', { tier: t((TIERS[detail.tier] || TIERS.free).labelKey), date: fmtDate(detail.expiresAt) })}
            </p>
          )}
          <div className="admin-tone" role="radiogroup" aria-label={t('admin.passTitle')}>
            {['free', 'trip', 'year'].map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={tierPick === k}
                className={`admin-tone-opt ${tierPick === k ? 'on' : ''}`}
                onClick={() => setTierPick(k)}
              >
                {t(TIERS[k].labelKey)}
              </button>
            ))}
          </div>
          {tierPick !== 'free' && (
            <div className="admin-days">
              <label htmlFor="admin-days">{t('admin.passDays')}</label>
              <input
                id="admin-days"
                inputMode="numeric"
                placeholder={tierPick === 'year' ? '365' : '30'}
                value={tierDays}
                onChange={(e) => setTierDays(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>
          )}
          {actionNotice && <p className="admin-notice-ok">{actionNotice}</p>}
          {actionErr && <p className="admin-error">{actionErr}</p>}
          <button className="auth-submit account-wide-btn" disabled={tierBusy || detailBusy} onClick={applyTier}>
            {tierBusy ? t('account.pleaseWait') : t('admin.passApply')}
          </button>

          <div className="section-title admin-support-title">{t('admin.supportTitle')}</div>
          <div className="admin-tools">
            <button type="button" className="admin-btn-secondary" disabled={quotaBusy} onClick={resetQuota}>
              {quotaBusy ? t('account.pleaseWait') : quotaArmed ? t('admin.quotaConfirm') : t('admin.quotaReset')}
            </button>
            <button type="button" className="admin-btn-secondary" disabled={resetBusy || !detail.email} onClick={sendReset}>
              {resetBusy ? t('account.pleaseWait') : t('admin.sendReset')}
            </button>
            {!detail.bannedUntil ? (
              !banArmed ? (
                <button type="button" className="admin-btn-secondary" onClick={() => setBanArmed(true)}>
                  {t('admin.banArm')}
                </button>
              ) : (
                <div className="admin-ban-form">
                  <p className="account-section-hint">{t('admin.banHint')}</p>
                  <div className="admin-days">
                    <label htmlFor="admin-ban-days">{t('admin.passDays')}</label>
                    <input
                      id="admin-ban-days"
                      inputMode="numeric"
                      placeholder="36500"
                      value={banDays}
                      onChange={(e) => setBanDays(e.target.value.replace(/[^0-9]/g, ''))}
                    />
                  </div>
                  <div className="admin-danger-actions">
                    <button type="button" className="admin-btn-secondary" onClick={() => { setBanArmed(false); setBanDays(''); }}>
                      {t('admin.banCancel')}
                    </button>
                    <button type="button" className="admin-btn-secondary admin-ban-go" disabled={banBusy} onClick={doBan}>
                      {banBusy ? t('account.pleaseWait') : t('admin.banGo')}
                    </button>
                  </div>
                </div>
              )
            ) : (
              <button type="button" className="admin-btn-secondary" disabled={banBusy} onClick={doUnban}>
                {banBusy ? t('account.pleaseWait') : t('admin.banLift')}
              </button>
            )}
          </div>

          <div className="section-title admin-support-title">{t('admin.notesTitle')}</div>
          <textarea
            className="account-feedback-input admin-note-input"
            rows={2}
            maxLength={1000}
            value={noteText}
            placeholder={t('admin.notePlaceholder')}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <button
            type="button"
            className="admin-btn-secondary"
            disabled={noteBusy || !noteText.trim()}
            onClick={saveNote}
          >
            {noteBusy ? t('account.pleaseWait') : t('admin.noteSave')}
          </button>

          {(detail.history || []).length > 0 && (
            <>
              <div className="section-title admin-support-title">{t('admin.historyTitle')}</div>
              <div className="admin-audit">
                {detail.history.map((h, i) => (
                  <div key={i} className="admin-audit-row">
                    <span className="admin-audit-when">{fmtDateTime(h.createdAt)}</span>
                    <span className="admin-audit-what">
                      <b>{h.action}</b>
                      {h.action === 'note' && h.detail?.text ? ` ${h.detail.text}`
                        : h.detail?.tier ? ` ${h.detail.tier}`
                        : h.detail?.days ? ` ${h.detail.days}d` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="admin-danger">
            {!deleteArmed ? (
              <button type="button" className="admin-danger-arm" onClick={() => setDeleteArmed(true)}>
                {t('admin.deleteArm')}
              </button>
            ) : (
              <>
                <p className="account-section-hint">{t('admin.deleteHint')}</p>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="admin-del-confirm">{t('admin.deleteConfirmLabel')}</label>
                  <input
                    id="admin-del-confirm"
                    className="auth-input"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder={detail.email || detail.handle || ''}
                    autoComplete="off"
                  />
                </div>
                <div className="admin-danger-actions">
                  <button
                    type="button"
                    className="admin-btn-secondary"
                    onClick={() => { setDeleteArmed(false); setDeleteConfirm(''); }}
                  >
                    {t('admin.deleteCancel')}
                  </button>
                  <button
                    className="book-btn account-delete-btn"
                    disabled={deleteBusy || !deleteConfirm.trim()}
                    onClick={doDelete}
                  >
                    {deleteBusy ? t('account.pleaseWait') : t('admin.deleteGo')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="panel-section">
        <div className="section-title">{t('admin.auditTitle')}</div>
        {audit && (audit.rows || []).length === 0 && (
          <p className="account-section-hint">{t('admin.auditEmpty')}</p>
        )}
        <div className="admin-audit">
          {(audit?.rows || []).map((r) => (
            <div key={r.id} className="admin-audit-row">
              <span className="admin-audit-when">{fmtDateTime(r.createdAt)}</span>
              <span className="admin-audit-what">
                <b>{r.action}</b>
                {r.target ? ` ${r.target}` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
