import { useState } from 'react';
import {
  adminAddNote, adminBanUser, adminDeleteUser, adminGetUser, adminMark,
  adminResetQuota, adminSetTier, adminUnbanUser,
} from '../../auth/admin.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useI18n } from '../../i18n/index.jsx';

// One account, open in full, and every action on it. `detail` is also the
// shell's routing switch: while it is set, the account view replaces
// whichever tab is showing, and a nav click clears it.
export function useUserDetail({ errText, reloadList, refreshStats, loadAudit }) {
  const { t } = useI18n();
  const { sendPasswordReset } = useAuth();
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

  const applyTier = async () => {
    if (!detail) return;
    setTierBusy(true); setActionErr(''); setActionNotice('');
    try {
      const days = tierDays.trim() ? parseInt(tierDays, 10) : NaN;
      await adminSetTier(detail.id, tierPick, Number.isFinite(days) && days > 0 ? days : null);
      await refreshDetail(detail.id);
      setActionNotice(t('admin.passApplied'));
      refreshStats();
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
      refreshStats();
      reloadList(); loadAudit(25);
    } catch (e) { setActionErr(errText(e)); }
    setDeleteBusy(false);
  };

  return {
    detail, setDetail, detailBusy, openUser,
    tierPick, setTierPick, tierDays, setTierDays, tierBusy, applyTier,
    actionNotice, actionErr,
    quotaArmed, quotaBusy, resetQuota, resetBusy, sendReset,
    banArmed, setBanArmed, banDays, setBanDays, banBusy, doBan, doUnban,
    noteText, setNoteText, noteBusy, saveNote,
    deleteArmed, setDeleteArmed, deleteConfirm, setDeleteConfirm, deleteBusy, doDelete,
  };
}
