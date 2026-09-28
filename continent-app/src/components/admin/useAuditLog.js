import { useCallback, useEffect, useState } from 'react';
import { adminGetAudit } from '../../auth/admin.js';

// The audit trail's state. Held by the shell because three other domains
// write to the trail and call loadAudit(25) afterwards, and two views read it.
export function useAuditLog(unlocked) {
  const [audit, setAudit] = useState(null);
  const [auditBusy, setAuditBusy] = useState(false);

  const loadAudit = useCallback(async (limit = 25) => {
    setAuditBusy(true);
    try { setAudit(await adminGetAudit(limit, 0)); } catch { setAudit(null); }
    setAuditBusy(false);
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    loadAudit(25);
  }, [unlocked, loadAudit]);

  return { audit, auditBusy, loadAudit };
}
