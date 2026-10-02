import { useCallback, useEffect, useState } from 'react';
import { adminListFeedback, adminSetFeedbackStatus } from '../../auth/admin.js';

// The feedback inbox's state: the rows, the status filter, and the triage
// action. Marking a row also refreshes the overview's analytics, as it did
// before the split, so refreshAnalytics is passed in from useOverview.
export function useFeedbackInbox(unlocked, refreshAnalytics, errText) {
  const [feedback, setFeedback] = useState(null);
  const [fbFilter, setFbFilter] = useState('new');
  const [fbBusy, setFbBusy] = useState(false);
  const [fbErr, setFbErr] = useState('');

  const loadFeedback = useCallback(async (status) => {
    setFbBusy(true);
    try { setFeedback(await adminListFeedback(status === 'all' ? null : status, 100, 0)); } catch { setFeedback(null); }
    setFbBusy(false);
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    loadFeedback('new');
  }, [unlocked, loadFeedback]);

  const setFeedbackStatus = async (id, status) => {
    setFbErr('');
    try {
      await adminSetFeedbackStatus(id, status);
      await loadFeedback(fbFilter);
      refreshAnalytics();
    } catch (e) {
      // The row keeps its state and the reason is shown (slow_down, mfa,
      // forbidden), the way the Site tab shows its own (T065-d).
      setFbErr(errText ? errText(e) : String(e?.message || e));
    }
  };

  return { feedback, fbFilter, setFbFilter, fbBusy, fbErr, loadFeedback, setFeedbackStatus };
}
