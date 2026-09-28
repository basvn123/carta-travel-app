import { useEffect, useRef, useState } from 'react';
import { adminListUsers } from '../../auth/admin.js';

const PAGE = 50;

// The account list: search, paging, the CSV export. Held by the shell so
// the search and the loaded rows survive opening one account and coming
// back, and so an action on that account can reload the list.
export function useUsersList(unlocked, errText) {
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

  return {
    search, setSearch, rows, total, degraded, listBusy, listErr, csvBusy,
    setReloadKey, reloadList, loadMore, exportCsv,
  };
}
