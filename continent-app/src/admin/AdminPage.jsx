import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  adminAddNote, adminAnalytics, adminBanUser, adminDeleteUser, adminGetAudit,
  adminGetUser, adminHealth, adminListFeedback, adminListUsers, adminMark,
  adminListOverrides, adminResetQuota, adminSetConfig, adminSetFeedbackStatus,
  adminSetTier, adminStats, adminUnbanUser,
} from '../auth/admin.js';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useI18n } from '../i18n/index.jsx';
import { TIERS } from '../lib/pricing.js';
import {
  AlertIcon, ArrowLeftIcon, DownloadIcon, LockIcon, SearchIcon,
} from '../components/Icons.jsx';
import { ContentSection } from './ContentSection.jsx';

// The back office, as a page rather than a drawer.
//
// It started as a spoke inside the account panel, which was the wrong shape
// the moment it had to show a table: 440px of slide-over is a place to change
// your own name, not a place to read every account you have. So this takes
// the whole viewport, keeps the app's own typography (Fraunces on headings,
// mono on every measured fact) and lays the work out in four sections that
// each answer one question: how is it going, who are they, what is the site
// saying, and what has been done.
//
// SECURITY, because this file will be read by somebody wondering. Nothing
// here is a permission. Every call goes through an RPC that re-checks
// membership in public.admin_users against the caller's signed token, rate
// limits the caller, and writes the outcome to an append-only trail. A
// visitor who edits this bundle to force the page open sees the same empty
// screen with "forbidden" on it, because the browser has no say in the
// answer. The lock below is a second pair of eyes on a warm session, not a
// gate; the gate is in the database.

const PAGE = 50;
const SECTIONS = ['overview', 'users', 'content', 'feedback', 'site', 'audit'];

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

function initial(r) {
  const s = r.displayName || r.handle || r.email || '?';
  return s.trim().charAt(0).toUpperCase();
}

function rowName(r) {
  return r.displayName || r.handle || r.email || r.id;
}

/** Four weeks of daily counts. Scaled to the busiest day, with that day's
 *  figure written out, so the chart is never the only way to read it. */
function Sparkbars({ series }) {
  const top = Math.max(...series.map((d) => d.n || 0), 1);
  return (
    <div className="adminpage-spark" role="img"
      aria-label={series.map((d) => `${d.day}: ${d.n}`).join(', ')}>
      {series.map((d) => (
        <span key={d.day} className="adminpage-sparkbar" title={`${d.day}: ${d.n}`}>
          <span style={{ height: `${Math.max((d.n / top) * 100, d.n ? 8 : 2)}%` }} />
        </span>
      ))}
    </div>
  );
}

export function AdminPage({ onClose }) {
  const { t } = useI18n();
  const { user, hasPassword, reauthenticate, sendPasswordReset } = useAuth();

  const [unlocked, setUnlocked] = useState(false);
  const [lockValue, setLockValue] = useState('');
  const [lockBusy, setLockBusy] = useState(false);
  const [lockErr, setLockErr] = useState('');

  const [section, setSection] = useState('overview');
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [audit, setAudit] = useState(null);
  const [auditBusy, setAuditBusy] = useState(false);

  const [overrides, setOverrides] = useState([]);

  const [feedback, setFeedback] = useState(null);
  const [fbFilter, setFbFilter] = useState('new');
  const [fbBusy, setFbBusy] = useState(false);

  const [maintOn, setMaintOn] = useState(false);
  const [maintText, setMaintText] = useState('');
  const [maintBusy, setMaintBusy] = useState(false);
  const [maintSaved, setMaintSaved] = useState(false);
  const [maintErr, setMaintErr] = useState('');

  const [noticeOn, setNoticeOn] = useState(false);
  const [noticeText, setNoticeText] = useState('');
  const [noticeTone, setNoticeTone] = useState('info');
  const [noticeBusy, setNoticeBusy] = useState(false);
  const [noticeSaved, setNoticeSaved] = useState(false);
  const [noticeErr, setNoticeErr] = useState('');

  const [flags, setFlags] = useState({});
  const [newFlag, setNewFlag] = useState('');
  const [flagsBusy, setFlagsBusy] = useState(false);
  const [flagsSaved, setFlagsSaved] = useState(false);
  const [flagsErr, setFlagsErr] = useState('');

  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [degraded, setDegraded] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  // A failed list and an empty list used to look identical, which is how a
  // database of accounts read as "no accounts match that search" for an
  // afternoon. They are now different things on screen.
  const [listErr, setListErr] = useState('');
  const [csvBusy, setCsvBusy] = useState(false);
  // Bumped by the retry button. The list loads once per search, so a failure
  // on the first load would otherwise be a dead end until the page reopened.
  const [reloadKey, setReloadKey] = useState(0);
  const listReq = useRef(0);

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

  const errText = useCallback((e) => {
    const code = e?.code || '';
    if (code === 'forbidden') return t('admin.errForbidden');
    if (code === 'slow_down') return t('admin.errSlow');
    if (code === 'confirm_mismatch') return t('admin.errConfirm');
    if (code === 'target_is_admin') return t('admin.errTargetAdmin');
    if (code === 'own_account') return t('admin.errOwn');
    if (code === 'bad_note') return t('admin.errNote');
    // A Postgres error carries its own message, and on this screen the person
    // reading it is the person who can fix it, so it is shown rather than
    // flattened into "something went wrong".
    if (e?.message) return e.message;
    return t('admin.errGeneric');
  }, [t]);

  // Escape closes the page, the way every other overlay in the app behaves.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  const loadAudit = useCallback(async (limit = 25) => {
    setAuditBusy(true);
    try { setAudit(await adminGetAudit(limit, 0)); } catch { setAudit(null); }
    setAuditBusy(false);
  }, []);

  const loadOverrides = useCallback(async () => {
    try {
      const res = await adminListOverrides(null);
      setOverrides(res.rows || []);
    } catch { setOverrides([]); }
  }, []);

  const loadFeedback = useCallback(async (status) => {
    setFbBusy(true);
    try { setFeedback(await adminListFeedback(status === 'all' ? null : status, 100, 0)); } catch { setFeedback(null); }
    setFbBusy(false);
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    adminStats().then(setStats).catch(() => setStats(null));
    adminHealth().then(setHealth).catch(() => setHealth(null));
    adminAnalytics().then(setAnalytics).catch(() => setAnalytics(null));
    loadAudit(25);
    loadFeedback('new');
    loadOverrides();
    if (supabase) {
      supabase.from('site_config').select('key,value').then(({ data }) => {
        for (const row of data || []) {
          if (row.key === 'announcement' && row.value && typeof row.value === 'object') {
            setNoticeOn(!!row.value.enabled);
            setNoticeText(typeof row.value.text === 'string' ? row.value.text : '');
            setNoticeTone(row.value.tone === 'warn' ? 'warn' : 'info');
          }
          if (row.key === 'maintenance' && row.value && typeof row.value === 'object') {
            setMaintOn(!!row.value.enabled);
            setMaintText(typeof row.value.message === 'string' ? row.value.message : '');
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
  }, [unlocked, loadAudit, loadFeedback, loadOverrides]);

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
        setDegraded(!!res.degraded);
        setListErr('');
      } catch (e) {
        if (id === listReq.current) { setRows([]); setTotal(0); setListErr(errText(e)); }
      } finally {
        if (id === listReq.current) setListBusy(false);
      }
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, unlocked, errText, reloadKey]);

  const reloadList = async () => {
    try {
      const res = await adminListUsers(search.trim() || null, Math.max(rows.length, PAGE), 0);
      setRows(res.rows || []);
      setTotal(res.total || 0);
    } catch { /* the table keeps what it had */ }
  };

  const loadMore = async () => {
    try {
      const res = await adminListUsers(search.trim() || null, PAGE, rows.length);
      setRows((r) => [...r, ...(res.rows || [])]);
      setTotal(res.total || 0);
    } catch (e) { setListErr(errText(e)); }
  };

  const openUser = async (id) => {
    setDetailBusy(true);
    setActionErr(''); setActionNotice('');
    setQuotaArmed(false); setBanArmed(false); setBanDays('');
    setDeleteArmed(false); setDeleteConfirm(''); setNoteText('');
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

  const refreshDetail = async (id) => {
    try { setDetail(await adminGetUser(id)); } catch { /* keep what is shown */ }
  };

  const saveNotice = async () => {
    setNoticeBusy(true); setNoticeErr(''); setNoticeSaved(false);
    try {
      await adminSetConfig('announcement', {
        enabled: noticeOn, text: noticeText.trim(), tone: noticeTone,
      });
      setNoticeSaved(true);
      loadAudit(25);
    } catch (e) { setNoticeErr(errText(e)); }
    setNoticeBusy(false);
  };

  const saveMaintenance = async () => {
    setMaintBusy(true); setMaintErr(''); setMaintSaved(false);
    try {
      await adminSetConfig('maintenance', { enabled: maintOn, message: maintText.trim() });
      setMaintSaved(true);
      loadAudit(25);
    } catch (e) { setMaintErr(errText(e)); }
    setMaintBusy(false);
  };

  const setFeedbackStatus = async (id, status) => {
    try {
      await adminSetFeedbackStatus(id, status);
      await loadFeedback(fbFilter);
      adminAnalytics().then(setAnalytics).catch(() => {});
    } catch { /* the row keeps its state, a retry is one click */ }
  };

  const saveFlags = async () => {
    setFlagsBusy(true); setFlagsErr(''); setFlagsSaved(false);
    try {
      await adminSetConfig('features', flags);
      setFlagsSaved(true);
      loadAudit(25);
    } catch (e) { setFlagsErr(errText(e)); }
    setFlagsBusy(false);
  };

  const applyTier = async () => {
    if (!detail) return;
    setTierBusy(true); setActionErr(''); setActionNotice('');
    try {
      const days = tierDays.trim() ? parseInt(tierDays, 10) : NaN;
      await adminSetTier(detail.id, tierPick, Number.isFinite(days) && days > 0 ? days : null);
      await refreshDetail(detail.id);
      setActionNotice(t('admin.passApplied'));
      adminStats().then(setStats).catch(() => {});
      reloadList(); loadAudit(25);
    } catch (e) { setActionErr(errText(e)); }
    setTierBusy(false);
  };

  const resetQuota = async () => {
    if (!detail) return;
    if (!quotaArmed) { setQuotaArmed(true); return; }
    setQuotaBusy(true); setActionErr(''); setActionNotice('');
    try {
      await adminResetQuota(detail.id);
      await refreshDetail(detail.id);
      setActionNotice(t('admin.quotaDone'));
      loadAudit(25);
    } catch (e) { setActionErr(errText(e)); }
    setQuotaBusy(false); setQuotaArmed(false);
  };

  const sendReset = async () => {
    if (!detail?.email) return;
    setResetBusy(true); setActionErr(''); setActionNotice('');
    try {
      await sendPasswordReset(detail.email);
      await adminMark('send_reset', detail.id).catch(() => {});
      await refreshDetail(detail.id);
      setActionNotice(t('admin.resetSent'));
      loadAudit(25);
    } catch (e) { setActionErr(errText(e)); }
    setResetBusy(false);
  };

  const doBan = async () => {
    if (!detail) return;
    setBanBusy(true); setActionErr(''); setActionNotice('');
    try {
      const days = banDays.trim() ? parseInt(banDays, 10) : 36500;
      await adminBanUser(detail.id, Number.isFinite(days) && days > 0 ? days : 36500);
      await refreshDetail(detail.id);
      setActionNotice(t('admin.banDone'));
      setBanArmed(false); reloadList(); loadAudit(25);
    } catch (e) { setActionErr(errText(e)); }
    setBanBusy(false);
  };

  const doUnban = async () => {
    if (!detail) return;
    setBanBusy(true); setActionErr(''); setActionNotice('');
    try {
      await adminUnbanUser(detail.id);
      await refreshDetail(detail.id);
      setActionNotice(t('admin.banLifted'));
      reloadList(); loadAudit(25);
    } catch (e) { setActionErr(errText(e)); }
    setBanBusy(false);
  };

  const saveNote = async () => {
    if (!detail || !noteText.trim()) return;
    setNoteBusy(true); setActionErr(''); setActionNotice('');
    try {
      await adminAddNote(detail.id, noteText.trim());
      setNoteText('');
      await refreshDetail(detail.id);
      setActionNotice(t('admin.noteSaved'));
      loadAudit(25);
    } catch (e) { setActionErr(errText(e)); }
    setNoteBusy(false);
  };

  const doDelete = async () => {
    if (!detail) return;
    setDeleteBusy(true); setActionErr('');
    try {
      await adminDeleteUser(detail.id, deleteConfirm.trim());
      setDetail(null);
      adminStats().then(setStats).catch(() => {});
      reloadList(); loadAudit(25);
    } catch (e) { setActionErr(errText(e)); }
    setDeleteBusy(false);
  };

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
      const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `carta-users-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { setListErr(errText(e)); }
    setCsvBusy(false);
  };

  // ---- the lock -----------------------------------------------------------
  if (!unlocked) {
    return (
      <div className="adminpage adminpage-locked">
        <div className="adminpage-lock">
          <span className="adminpage-lock-icon" aria-hidden="true"><LockIcon size={22} /></span>
          <h1 className="adminpage-lock-title">{t('admin.title')}</h1>
          <p className="adminpage-lock-hint">
            {hasPassword ? t('admin.lockHint') : t('admin.lockHintEmail')}
          </p>
          <label className="adminpage-lock-label" htmlFor="admin-lock-input">
            {hasPassword ? t('admin.lockLabel') : t('admin.lockLabelEmail')}
          </label>
          <input
            id="admin-lock-input"
            className="adminpage-lock-input"
            type={hasPassword ? 'password' : 'email'}
            autoComplete={hasPassword ? 'current-password' : 'off'}
            value={lockValue}
            onChange={(e) => { setLockValue(e.target.value); setLockErr(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && lockValue.trim()) unlock(); }}
          />
          {lockErr && <p className="adminpage-err">{lockErr}</p>}
          <div className="adminpage-lock-actions">
            <button type="button" className="adminpage-btn" onClick={onClose}>
              {t('admin.lockCancel')}
            </button>
            <button
              type="button"
              className="adminpage-btn primary"
              disabled={lockBusy || !lockValue.trim()}
              onClick={unlock}
            >
              {lockBusy ? t('account.pleaseWait') : t('admin.lockUnlock')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const missing = (stats?.missing || []).concat(
    health?.tables
      ? Object.entries(health.tables).filter(([, present]) => !present).map(([k]) => k)
      : [],
  );
  const missingUnique = [...new Set(missing)];

  // ---- one account, in full ----------------------------------------------
  const renderDetail = () => (
    <div className="adminpage-detail">
      <button type="button" className="adminpage-back" onClick={() => setDetail(null)}>
        <ArrowLeftIcon size={13} /> {t('admin.backToList')}
      </button>

      <div className="adminpage-detail-head">
        <span className="adminpage-ava lg" aria-hidden="true">
          {detail.avatarEmoji || initial(detail)}
        </span>
        <div className="adminpage-detail-id">
          <h2>{rowName(detail)}</h2>
          <p>
            {detail.email}
            {detail.handle ? ` @${detail.handle}` : ''}
          </p>
          <code className="adminpage-uuid">{detail.id}</code>
        </div>
        <div className="adminpage-detail-chips">
          {detail.isAdmin && <span className="adminpage-chip staff">{t('admin.chipStaff')}</span>}
          {!!detail.bannedUntil && <span className="adminpage-chip banned">{t('admin.chipBanned')}</span>}
          {detail.tier !== 'free' && <span className={`adminpage-chip ${detail.tier}`}>{detail.tier}</span>}
        </div>
      </div>

      {actionNotice && <p className="adminpage-ok">{actionNotice}</p>}
      {actionErr && <p className="adminpage-err">{actionErr}</p>}

      <div className="adminpage-cols">
        <section className="adminpage-card">
          <h3 className="adminpage-h3">{t('admin.factsTitle')}</h3>
          <dl className="adminpage-facts">
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

          <h3 className="adminpage-h3">{t('admin.historyTitle')}</h3>
          {(detail.history || []).length === 0 ? (
            <p className="adminpage-muted">{t('admin.historyEmpty')}</p>
          ) : (
            <ul className="adminpage-log">
              {detail.history.map((h, i) => (
                <li key={i}>
                  <span className="adminpage-when">{fmtDateTime(h.createdAt)}</span>
                  <span className="adminpage-what">
                    <b>{h.action}</b>
                    {h.action === 'note' && h.detail?.text ? ` ${h.detail.text}`
                      : h.detail?.tier ? ` ${h.detail.tier}`
                      : h.detail?.days ? ` ${h.detail.days}d` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="adminpage-card">
          <h3 className="adminpage-h3">{t('admin.passTitle')}</h3>
          {detail.tier !== 'free' && detail.expiresAt && (
            <p className="adminpage-muted">
              {t('admin.passUntil', {
                tier: t((TIERS[detail.tier] || TIERS.free).labelKey),
                date: fmtDate(detail.expiresAt),
              })}
            </p>
          )}
          <div className="adminpage-segment" role="radiogroup" aria-label={t('admin.passTitle')}>
            {['free', 'trip', 'year'].map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={tierPick === k}
                className={`adminpage-seg ${tierPick === k ? 'on' : ''}`}
                onClick={() => setTierPick(k)}
              >
                {t(TIERS[k].labelKey)}
              </button>
            ))}
          </div>
          {tierPick !== 'free' && (
            <div className="adminpage-inline">
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
          <button
            type="button"
            className="adminpage-btn primary wide"
            disabled={tierBusy || detailBusy}
            onClick={applyTier}
          >
            {tierBusy ? t('account.pleaseWait') : t('admin.passApply')}
          </button>

          <h3 className="adminpage-h3">{t('admin.supportTitle')}</h3>
          <div className="adminpage-stack">
            <button type="button" className="adminpage-btn" disabled={quotaBusy} onClick={resetQuota}>
              {quotaBusy ? t('account.pleaseWait') : quotaArmed ? t('admin.quotaConfirm') : t('admin.quotaReset')}
            </button>
            <button type="button" className="adminpage-btn" disabled={resetBusy || !detail.email} onClick={sendReset}>
              {resetBusy ? t('account.pleaseWait') : t('admin.sendReset')}
            </button>
            {!detail.bannedUntil ? (
              !banArmed ? (
                <button type="button" className="adminpage-btn" onClick={() => setBanArmed(true)}>
                  {t('admin.banArm')}
                </button>
              ) : (
                <div className="adminpage-armed">
                  <p className="adminpage-muted">{t('admin.banHint')}</p>
                  <div className="adminpage-inline">
                    <label htmlFor="admin-ban-days">{t('admin.passDays')}</label>
                    <input
                      id="admin-ban-days"
                      inputMode="numeric"
                      placeholder="36500"
                      value={banDays}
                      onChange={(e) => setBanDays(e.target.value.replace(/[^0-9]/g, ''))}
                    />
                  </div>
                  <div className="adminpage-row">
                    <button type="button" className="adminpage-btn" onClick={() => { setBanArmed(false); setBanDays(''); }}>
                      {t('admin.banCancel')}
                    </button>
                    <button type="button" className="adminpage-btn danger" disabled={banBusy} onClick={doBan}>
                      {banBusy ? t('account.pleaseWait') : t('admin.banGo')}
                    </button>
                  </div>
                </div>
              )
            ) : (
              <button type="button" className="adminpage-btn" disabled={banBusy} onClick={doUnban}>
                {banBusy ? t('account.pleaseWait') : t('admin.banLift')}
              </button>
            )}
          </div>

          <h3 className="adminpage-h3">{t('admin.notesTitle')}</h3>
          <textarea
            className="adminpage-textarea"
            rows={3}
            maxLength={1000}
            value={noteText}
            placeholder={t('admin.notePlaceholder')}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <button
            type="button"
            className="adminpage-btn"
            disabled={noteBusy || !noteText.trim()}
            onClick={saveNote}
          >
            {noteBusy ? t('account.pleaseWait') : t('admin.noteSave')}
          </button>

          <h3 className="adminpage-h3 danger">{t('admin.dangerTitle')}</h3>
          {!deleteArmed ? (
            <button type="button" className="adminpage-btn danger" onClick={() => setDeleteArmed(true)}>
              {t('admin.deleteArm')}
            </button>
          ) : (
            <div className="adminpage-armed">
              <p className="adminpage-muted">{t('admin.deleteHint')}</p>
              <label className="adminpage-lock-label" htmlFor="admin-del-confirm">
                {t('admin.deleteConfirmLabel')}
              </label>
              <input
                id="admin-del-confirm"
                className="adminpage-lock-input"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={detail.email || detail.handle || ''}
                autoComplete="off"
              />
              <div className="adminpage-row">
                <button
                  type="button"
                  className="adminpage-btn"
                  onClick={() => { setDeleteArmed(false); setDeleteConfirm(''); }}
                >
                  {t('admin.deleteCancel')}
                </button>
                <button
                  type="button"
                  className="adminpage-btn danger solid"
                  disabled={deleteBusy || !deleteConfirm.trim()}
                  onClick={doDelete}
                >
                  {deleteBusy ? t('account.pleaseWait') : t('admin.deleteGo')}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );

  return (
    <div className="adminpage">
      <header className="adminpage-bar">
        <div className="adminpage-brand">
          <LockIcon size={15} />
          <span>{t('admin.title')}</span>
        </div>
        <nav className="adminpage-nav" aria-label={t('admin.title')}>
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={`adminpage-navbtn ${section === s && !detail ? 'on' : ''}`}
              aria-current={section === s && !detail ? 'page' : undefined}
              onClick={() => { setSection(s); setDetail(null); }}
            >
              {t(`admin.nav.${s}`)}
            </button>
          ))}
        </nav>
        <button type="button" className="adminpage-close" onClick={onClose} aria-label={t('account.close')}>
          x
        </button>
      </header>

      <main className="adminpage-body">
        {missingUnique.length > 0 && (
          <div className="adminpage-warn" role="status">
            <AlertIcon size={15} />
            <span>{t('admin.missingTables', { tables: missingUnique.join(', ') })}</span>
          </div>
        )}

        {detail ? renderDetail() : (
          <>
            {section === 'overview' && (
              <>
                <h1 className="adminpage-h1">{t('admin.nav.overview')}</h1>
                <p className="adminpage-muted">{t('admin.hint')}</p>
                {stats ? (
                  <div className="adminpage-tiles">
                    <div className="adminpage-tile"><b>{stats.users}</b><span>{t('admin.statUsers')}</span></div>
                    <div className="adminpage-tile"><b>{stats.newWeek}</b><span>{t('admin.statNewWeek')}</span></div>
                    <div className="adminpage-tile"><b>{stats.newMonth}</b><span>{t('admin.statNewMonth')}</span></div>
                    <div className="adminpage-tile"><b>{stats.passesTrip}</b><span>{t('admin.statTrip')}</span></div>
                    <div className="adminpage-tile"><b>{stats.passesYear}</b><span>{t('admin.statYear')}</span></div>
                    <div className="adminpage-tile"><b>{stats.tripPlans}</b><span>{t('admin.statTrips')}</span></div>
                    <div className="adminpage-tile"><b>{stats.dayPlans}</b><span>{t('admin.statDayPlans')}</span></div>
                    <div className="adminpage-tile"><b>{stats.aiToday}</b><span>{t('admin.statAiToday')}</span></div>
                  </div>
                ) : (
                  <p className="adminpage-err">{t('admin.statsFailed')}</p>
                )}

                {analytics && (
                  <>
                    <h2 className="adminpage-h2">{t('admin.activeTitle')}</h2>
                    <p className="adminpage-muted">{t('admin.activeHint')}</p>
                    <div className="adminpage-tiles">
                      <div className="adminpage-tile"><b>{analytics.activeDay}</b><span>{t('admin.activeDay')}</span></div>
                      <div className="adminpage-tile"><b>{analytics.activeWeek}</b><span>{t('admin.activeWeek')}</span></div>
                      <div className="adminpage-tile"><b>{analytics.activeMonth}</b><span>{t('admin.activeMonth')}</span></div>
                      <div className="adminpage-tile"><b>{analytics.neverSignedIn}</b><span>{t('admin.neverIn')}</span></div>
                    </div>

                    <div className="adminpage-cols">
                      <section className="adminpage-card">
                        <h3 className="adminpage-h3">{t('admin.signupsTitle')}</h3>
                        {/* Four weeks of signups. A bar per day, scaled to the
                            busiest one, with the count in mono underneath the
                            peak so the shape is never the only information. */}
                        <Sparkbars series={analytics.signups || []} />
                        <p className="adminpage-muted">
                          {t('admin.signupsTotal', {
                            n: (analytics.signups || []).reduce((s, d) => s + (d.n || 0), 0),
                          })}
                        </p>
                      </section>

                      <section className="adminpage-card">
                        <h3 className="adminpage-h3">{t('admin.providerTitle')}</h3>
                        <p className="adminpage-muted">{t('admin.providerHint')}</p>
                        <ul className="adminpage-bars">
                          {(analytics.providers || []).map((p) => {
                            const top = Math.max(...(analytics.providers || []).map((x) => x.n), 1);
                            return (
                              <li key={p.provider}>
                                <span className="adminpage-barlabel">{p.provider}</span>
                                <span className="adminpage-bartrack">
                                  <span className="adminpage-barfill" style={{ width: `${(p.n / top) * 100}%` }} />
                                </span>
                                <span className="adminpage-barnum">{p.n}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    </div>

                    <div className="adminpage-cols">
                      <section className="adminpage-card">
                        <h3 className="adminpage-h3">{t('admin.topDestsTitle')}</h3>
                        <p className="adminpage-muted">{t('admin.topDestsHint')}</p>
                        {(analytics.topDests || []).length === 0 ? (
                          <p className="adminpage-muted">{t('admin.topNone')}</p>
                        ) : (
                          <ol className="adminpage-rank">
                            {analytics.topDests.map((d) => (
                              <li key={d.id}>
                                <span className="adminpage-rankname">
                                  {d.city || d.id}
                                  {d.country && <em>{d.country}</em>}
                                </span>
                                <span className="adminpage-ranknum">{d.n}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </section>

                      <section className="adminpage-card">
                        <h3 className="adminpage-h3">{t('admin.topCountriesTitle')}</h3>
                        {(analytics.topCountries || []).length === 0 ? (
                          <p className="adminpage-muted">{t('admin.topNone')}</p>
                        ) : (
                          <ol className="adminpage-rank">
                            {analytics.topCountries.map((c) => (
                              <li key={c.country}>
                                <span className="adminpage-rankname">{c.country}</span>
                                <span className="adminpage-ranknum">{c.n}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </section>
                    </div>
                  </>
                )}

                <h2 className="adminpage-h2">{t('admin.recentTitle')}</h2>
                {(audit?.rows || []).length === 0 ? (
                  <p className="adminpage-muted">{t('admin.auditEmpty')}</p>
                ) : (
                  <ul className="adminpage-log">
                    {(audit.rows || []).slice(0, 8).map((r) => (
                      <li key={r.id}>
                        <span className="adminpage-when">{fmtDateTime(r.createdAt)}</span>
                        <span className="adminpage-what">
                          <b>{r.action}</b>{r.target ? ` ${r.target}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {section === 'users' && (
              <>
                <div className="adminpage-headrow">
                  <h1 className="adminpage-h1">{t('admin.nav.users')}</h1>
                  <button type="button" className="adminpage-btn" disabled={csvBusy} onClick={exportCsv}>
                    <DownloadIcon size={13} /> {csvBusy ? t('account.pleaseWait') : t('admin.exportCsv')}
                  </button>
                </div>

                <div className="adminpage-search">
                  <SearchIcon size={16} />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('admin.searchPlaceholder')}
                    aria-label={t('admin.searchLabel')}
                  />
                </div>

                {degraded && (
                  <div className="adminpage-warn" role="status">
                    <AlertIcon size={15} />
                    <span>{t('admin.degraded')}</span>
                  </div>
                )}
                {listErr && (
                  <p className="adminpage-err">
                    {listErr}
                    <button
                      type="button"
                      className="adminpage-retry"
                      onClick={() => setReloadKey((k) => k + 1)}
                    >
                      {t('admin.retry')}
                    </button>
                  </p>
                )}

                {/* Three states, told apart on purpose: rows, a genuinely
                    empty search, and a failure. A failure draws no table at
                    all, because a header row over nothing reads as "your
                    database is empty" when it means "the query did not
                    run". */}
                {rows.length === 0 ? (
                  (!listBusy && !listErr) && <p className="adminpage-muted">{t('admin.none')}</p>
                ) : (
                  <div className="adminpage-tablewrap">
                    <table className="adminpage-table">
                      <thead>
                        <tr>
                          <th>{t('admin.colUser')}</th>
                          <th>{t('admin.colEmail')}</th>
                          <th>{t('admin.colPlan')}</th>
                          <th>{t('admin.colJoined')}</th>
                          <th>{t('admin.colSeen')}</th>
                          <th className="num">{t('admin.colTrips')}</th>
                          <th>{t('admin.colStatus')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} onClick={() => openUser(r.id)}>
                            <td>
                              <button
                                type="button"
                                className="adminpage-namebtn"
                                onClick={(e) => { e.stopPropagation(); openUser(r.id); }}
                              >
                                <span className="adminpage-ava" aria-hidden="true">
                                  {r.avatarEmoji || initial(r)}
                                </span>
                                <span className="adminpage-nametext">
                                  <b>{rowName(r)}</b>
                                  {r.handle && <span>@{r.handle}</span>}
                                </span>
                              </button>
                            </td>
                            <td className="mono">{r.email}</td>
                            <td>
                              {r.tier === 'free'
                                ? <span className="adminpage-muted">free</span>
                                : <span className={`adminpage-chip ${r.tier}`}>{r.tier}</span>}
                            </td>
                            <td className="mono">{fmtDate(r.createdAt)}</td>
                            <td className="mono">{fmtDateTime(r.lastSignIn) || t('admin.never')}</td>
                            <td className="mono num">{r.tripPlans}</td>
                            <td>
                              {r.isAdmin && <span className="adminpage-chip staff">{t('admin.chipStaff')}</span>}
                              {!!r.bannedUntil && <span className="adminpage-chip banned">{t('admin.chipBanned')}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {rows.length > 0 && (
                  <p className="adminpage-count">{t('admin.showing', { shown: rows.length, total })}</p>
                )}
                {rows.length < total && (
                  <button type="button" className="adminpage-btn" onClick={loadMore}>
                    {t('admin.loadMore')}
                  </button>
                )}
              </>
            )}

            {section === 'content' && (
              <ContentSection
                overrides={overrides}
                onOverridesChanged={async () => { await loadOverrides(); loadAudit(25); }}
                errText={errText}
              />
            )}

            {section === 'feedback' && (
              <>
                <h1 className="adminpage-h1">{t('admin.nav.feedback')}</h1>
                <p className="adminpage-muted">{t('admin.feedbackHint')}</p>
                <div className="adminpage-segment" role="radiogroup" aria-label={t('admin.nav.feedback')}>
                  {['new', 'open', 'done', 'all'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={fbFilter === s}
                      className={`adminpage-seg ${fbFilter === s ? 'on' : ''}`}
                      onClick={() => { setFbFilter(s); loadFeedback(s); }}
                    >
                      {t(`admin.fb.${s}`)}
                      {s === 'new' && feedback?.new ? ` (${feedback.new})` : ''}
                    </button>
                  ))}
                </div>
                {fbBusy && <p className="adminpage-muted">{t('account.pleaseWait')}</p>}
                {!fbBusy && (feedback?.rows || []).length === 0 && (
                  <p className="adminpage-muted">{t('admin.fbEmpty')}</p>
                )}
                <div className="adminpage-fblist">
                  {(feedback?.rows || []).map((f) => (
                    <article key={f.id} className="adminpage-fb">
                      <header className="adminpage-fbhead">
                        <span className={`adminpage-chip kind-${f.kind}`}>{t(`account.feedbackKind.${f.kind}`)}</span>
                        <span className="adminpage-fbwho">
                          {f.handle ? `@${f.handle}` : f.email || t('admin.fbAnon')}
                        </span>
                        <span className="adminpage-when">{fmtDateTime(f.createdAt)}</span>
                        <span className={`adminpage-chip status-${f.status}`}>{t(`admin.fb.${f.status}`)}</span>
                      </header>
                      <p className="adminpage-fbmsg">{f.message}</p>
                      {f.context && (
                        <p className="adminpage-fbctx">
                          {[f.context.path, f.context.viewport, f.context.lang]
                            .filter(Boolean).join('  ')}
                        </p>
                      )}
                      <div className="adminpage-row">
                        {f.email && (
                          <a
                            className="adminpage-btn"
                            href={`mailto:${f.email}?subject=${encodeURIComponent('Re: your Carta feedback')}`}
                          >
                            {t('admin.fbReply')}
                          </a>
                        )}
                        {f.status !== 'open' && (
                          <button type="button" className="adminpage-btn" onClick={() => setFeedbackStatus(f.id, 'open')}>
                            {t('admin.fbMarkOpen')}
                          </button>
                        )}
                        {f.status !== 'done' && (
                          <button type="button" className="adminpage-btn" onClick={() => setFeedbackStatus(f.id, 'done')}>
                            {t('admin.fbMarkDone')}
                          </button>
                        )}
                        {f.userId && (
                          <button type="button" className="adminpage-btn" onClick={() => { setSection('users'); openUser(f.userId); }}>
                            {t('admin.fbOpenUser')}
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}

            {section === 'site' && (
              <>
                <h1 className="adminpage-h1">{t('admin.nav.site')}</h1>
                <section className="adminpage-card adminpage-maint">
                  <h3 className="adminpage-h3">{t('admin.maintTitle')}</h3>
                  <p className="adminpage-muted">{t('admin.maintHint')}</p>
                  <label className="adminpage-check">
                    <input
                      type="checkbox"
                      checked={maintOn}
                      onChange={(e) => { setMaintOn(e.target.checked); setMaintSaved(false); }}
                    />
                    <span>{t('admin.maintEnabled')}</span>
                  </label>
                  <textarea
                    className="adminpage-textarea"
                    rows={2}
                    maxLength={500}
                    value={maintText}
                    placeholder={t('admin.maintPlaceholder')}
                    onChange={(e) => { setMaintText(e.target.value); setMaintSaved(false); }}
                  />
                  {maintErr && <p className="adminpage-err">{maintErr}</p>}
                  <button
                    type="button"
                    className={`adminpage-btn wide ${maintOn ? 'danger solid' : ''}`}
                    disabled={maintBusy}
                    onClick={saveMaintenance}
                  >
                    {maintBusy ? t('account.pleaseWait')
                      : maintSaved ? t('admin.maintSaved')
                      : maintOn ? t('admin.maintClose') : t('admin.maintOpen')}
                  </button>
                </section>
                <div className="adminpage-cols">
                  <section className="adminpage-card">
                    <h3 className="adminpage-h3">{t('admin.noticeTitle')}</h3>
                    <p className="adminpage-muted">{t('admin.noticeHint')}</p>
                    <label className="adminpage-check">
                      <input
                        type="checkbox"
                        checked={noticeOn}
                        onChange={(e) => { setNoticeOn(e.target.checked); setNoticeSaved(false); }}
                      />
                      <span>{t('admin.noticeEnabled')}</span>
                    </label>
                    <textarea
                      className="adminpage-textarea"
                      rows={3}
                      maxLength={280}
                      value={noticeText}
                      placeholder={t('admin.noticePlaceholder')}
                      onChange={(e) => { setNoticeText(e.target.value); setNoticeSaved(false); }}
                    />
                    <div className="adminpage-segment" role="radiogroup" aria-label={t('admin.noticeTitle')}>
                      {['info', 'warn'].map((tone) => (
                        <button
                          key={tone}
                          type="button"
                          role="radio"
                          aria-checked={noticeTone === tone}
                          className={`adminpage-seg ${noticeTone === tone ? 'on' : ''}`}
                          onClick={() => { setNoticeTone(tone); setNoticeSaved(false); }}
                        >
                          {t(tone === 'warn' ? 'admin.noticeToneWarn' : 'admin.noticeToneInfo')}
                        </button>
                      ))}
                    </div>
                    {noticeErr && <p className="adminpage-err">{noticeErr}</p>}
                    <button
                      type="button"
                      className="adminpage-btn primary wide"
                      disabled={noticeBusy || (noticeOn && !noticeText.trim())}
                      onClick={saveNotice}
                    >
                      {noticeBusy ? t('account.pleaseWait') : noticeSaved ? t('admin.noticeSaved') : t('admin.noticeSave')}
                    </button>
                  </section>

                  <section className="adminpage-card">
                    <h3 className="adminpage-h3">{t('admin.flagsTitle')}</h3>
                    <p className="adminpage-muted">{t('admin.flagsHint')}</p>
                    {Object.keys(flags).length === 0 && (
                      <p className="adminpage-muted">{t('admin.flagsNone')}</p>
                    )}
                    <div className="adminpage-flags">
                      {Object.entries(flags).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
                        <div key={k} className="adminpage-flag">
                          <code>{k}</code>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={v}
                            className={`adminpage-switch ${v ? 'on' : ''}`}
                            onClick={() => { setFlags((f) => ({ ...f, [k]: !v })); setFlagsSaved(false); }}
                          >
                            {v ? t('admin.flagOn') : t('admin.flagOff')}
                          </button>
                          <button
                            type="button"
                            className="adminpage-flagdel"
                            aria-label={t('admin.flagRemove')}
                            onClick={() => {
                              setFlags((f) => { const n = { ...f }; delete n[k]; return n; });
                              setFlagsSaved(false);
                            }}
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="adminpage-row">
                      <input
                        className="adminpage-lock-input mono"
                        value={newFlag}
                        aria-label={t('admin.flagAddLabel')}
                        placeholder="beta_map"
                        onChange={(e) => setNewFlag(
                          e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40),
                        )}
                      />
                      <button
                        type="button"
                        className="adminpage-btn"
                        disabled={!newFlag || flags[newFlag] !== undefined}
                        onClick={() => {
                          setFlags((f) => ({ ...f, [newFlag]: false }));
                          setNewFlag(''); setFlagsSaved(false);
                        }}
                      >
                        {t('admin.flagAdd')}
                      </button>
                    </div>
                    {flagsErr && <p className="adminpage-err">{flagsErr}</p>}
                    <button
                      type="button"
                      className="adminpage-btn primary wide"
                      disabled={flagsBusy}
                      onClick={saveFlags}
                    >
                      {flagsBusy ? t('account.pleaseWait') : flagsSaved ? t('admin.flagsSaved') : t('admin.flagsSave')}
                    </button>
                  </section>
                </div>
              </>
            )}

            {section === 'audit' && (
              <>
                <h1 className="adminpage-h1">{t('admin.nav.audit')}</h1>
                <p className="adminpage-muted">{t('admin.auditHint')}</p>
                {(audit?.rows || []).length === 0 ? (
                  <p className="adminpage-muted">{t('admin.auditEmpty')}</p>
                ) : (
                  <div className="adminpage-tablewrap">
                    <table className="adminpage-table">
                      <thead>
                        <tr>
                          <th>{t('admin.colWhen')}</th>
                          <th>{t('admin.colAction')}</th>
                          <th>{t('admin.colActor')}</th>
                          <th>{t('admin.colTarget')}</th>
                          <th>{t('admin.colDetail')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(audit.rows || []).map((r) => (
                          <tr key={r.id}>
                            <td className="mono">{fmtDateTime(r.createdAt)}</td>
                            <td><b>{r.action}</b></td>
                            <td className="mono">{r.actor}</td>
                            <td className="mono">{r.target || ''}</td>
                            <td className="adminpage-detailcell">
                              {r.detail ? JSON.stringify(r.detail) : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {(audit?.rows || []).length < (audit?.total || 0) && (
                  <button
                    type="button"
                    className="adminpage-btn"
                    disabled={auditBusy}
                    onClick={() => loadAudit((audit?.rows || []).length + 50)}
                  >
                    {auditBusy ? t('account.pleaseWait') : t('admin.loadMore')}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
