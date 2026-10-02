import { useCallback, useEffect, useState } from 'react';
import { adminListConfig, adminSetConfig, adminSetConfigPublic } from '../../auth/admin.js';
import { supabase } from '../../lib/supabaseClient.js';

// site_config as the Site tab edits it: maintenance, the notice, the flags.
// Held by the shell so an unsaved edit survives a trip to another tab.
export function useConfigManager(unlocked, errText, loadAudit) {
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

  // Every key with its public flag (045). null until read, and left null
  // when the function is missing, so the visibility card only draws once the
  // migration is pasted (T066-b).
  const [keyRows, setKeyRows] = useState(null);
  const [visBusy, setVisBusy] = useState('');
  const [visErr, setVisErr] = useState('');

  const loadKeys = useCallback(async () => {
    try {
      const res = await adminListConfig();
      setKeyRows(Array.isArray(res?.rows) ? res.rows : null);
    } catch { setKeyRows(null); }
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    loadKeys();
  }, [unlocked, loadKeys]);

  const setKeyPublic = async (key, isPublic) => {
    setVisBusy(key); setVisErr('');
    try {
      await adminSetConfigPublic(key, isPublic);
      await loadKeys();
      loadAudit(25);
    } catch (e) { setVisErr(errText(e)); }
    setVisBusy('');
  };

  useEffect(() => {
    if (!unlocked) return;
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
  }, [unlocked]);

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

  const saveFlags = async () => {
    setFlagsBusy(true); setFlagsErr(''); setFlagsSaved(false);
    try {
      await adminSetConfig('features', flags);
      setFlagsSaved(true);
      loadAudit(25);
    } catch (e) { setFlagsErr(errText(e)); }
    setFlagsBusy(false);
  };

  return {
    maintOn, setMaintOn, maintText, setMaintText, maintBusy, maintSaved, setMaintSaved, maintErr,
    noticeOn, setNoticeOn, noticeText, setNoticeText, noticeTone, setNoticeTone,
    noticeBusy, noticeSaved, setNoticeSaved, noticeErr,
    flags, setFlags, newFlag, setNewFlag, flagsBusy, flagsSaved, setFlagsSaved, flagsErr,
    saveNotice, saveMaintenance, saveFlags,
    keyRows, visBusy, visErr, setKeyPublic,
  };
}
