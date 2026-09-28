import { useState } from 'react';
import { adminDismissContentReport, adminDecideComplaint } from '../../auth/admin.js';
import { useI18n } from '../../i18n/index.jsx';

// The three decisions a moderator takes in the Reports tab that are not a
// takedown (migration 039): dismiss a report, uphold a complaint, reverse a
// complaint. Each one needs a written reason, so they share one form state,
// keyed by `<kind>:<id>` (dismiss:<reportId>, upheld:<statementId>,
// reversed:<statementId>), and only one form is open on the page at a time.
//
// The reason matters differently per kind. On a dismissal it is the record
// of why nothing was done. On a complaint it is the answer the owner reads
// under their trip in My trips, so it is written to them.
//
// After a decision the reports list and the complaints queue reload if they
// were loaded, and the audit trail reloads.
export function useModerationDecision({ errText, reports, complaints, loadAudit }) {
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

  const wordFor = (e) => {
    const code = e?.code || '';
    if (code === 'not_found') return t('admin.errDecisionGone');
    if (code === 'no_complaint') return t('admin.errNoComplaint');
    if (code === 'bad_outcome') return t('admin.errGeneric');
    return errText(e);
  };

  const submit = async (kind, id) => {
    if (!armed || busy) return;
    if (!reason.trim()) { setError(t('admin.errReason')); return; }
    setBusy(true); setError('');
    try {
      if (kind === 'dismiss') {
        const res = await adminDismissContentReport(id, reason.trim());
        setNotice(res?.changed ? t('admin.dismissDone') : t('admin.decisionNoChange'));
      } else {
        const res = await adminDecideComplaint(id, kind, reason.trim());
        if (!res?.changed) setNotice(t('admin.decisionNoChange'));
        else if (res.outcome === 'upheld') setNotice(t('admin.upheldDone'));
        else setNotice(t(res.reinstated ? 'admin.reversedReinstated' : 'admin.reversedKept'));
      }
      setArmed(null); setReason('');
      if (reports.reports) reports.reload();
      if (complaints.complaints) complaints.reload();
      loadAudit(25);
    } catch (e) {
      setError(wordFor(e));
    }
    setBusy(false);
  };

  return { armed, reason, setReason, busy, error, notice, arm, cancel, submit };
}
