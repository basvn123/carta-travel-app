import { useState } from 'react';
import { adminUnpublishGuide } from '../../auth/admin.js';
import { useI18n } from '../../i18n/index.jsx';

// The takedown's state, shared by the Guides tab and the Reports tab
// (migration 038, admin_unpublish_guide). One form is open at a time,
// keyed by where it was opened (`guide:<planId>` or `report:<reportId>`),
// so the same guide reported twice does not open two forms.
//
// It is armed in two steps, the way suspend and delete are on an account:
// the first click opens the form with the reason field, the second sends.
// The reason is required: it goes into the audit log and is the text of the
// statement of reasons the owner receives (T070). A takedown never deletes: the plan
// goes private and stays in its owner's account.
//
// The notice is shown at the top of the tab, not on the row: after the
// reload the guide has left the Guides list and its reports have left the
// New filter.
//
// After a takedown the Guides list and the Reports queue reload if they
// were loaded (a tab never opened stays unloaded, as T067 and T068 keep
// it), and the audit trail reloads.
export function useUnpublishGuide({ errText, guidesIndex, reports, loadAudit }) {
  const { t } = useI18n();
  const [armed, setArmed] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const arm = (key) => {
    setArmed(key); setReason(''); setError(''); setNotice('');
  };
  const cancel = () => { setArmed(null); setReason(''); setError(''); };

  const submit = async (planId) => {
    if (!armed || busy) return;
    if (!reason.trim()) { setError(t('admin.errReason')); return; }
    setBusy(true); setError('');
    try {
      const res = await adminUnpublishGuide(planId, reason.trim());
      setNotice(res?.changed
        ? t('admin.unpublishDone', { n: res.reportsActioned || 0 })
        : t('admin.unpublishNoChange'));
      setArmed(null); setReason('');
      if (guidesIndex.guides) guidesIndex.load();
      if (reports.reports) reports.reload();
      loadAudit(25);
    } catch (e) {
      setError(e?.code === 'not_found' ? t('admin.errPlanGone') : errText(e));
    }
    setBusy(false);
  };

  return { armed, reason, setReason, busy, error, notice, arm, cancel, submit };
}
