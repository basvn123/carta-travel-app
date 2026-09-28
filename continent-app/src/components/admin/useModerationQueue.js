import { useCallback, useEffect, useState } from 'react';
import { adminListFeedback, adminSetFeedbackStatus } from '../../auth/admin.js';

// The feedback inbox's state: the rows, the status filter, and the triage
// action. Marking a row also refreshes the overview's analytics, as it did
// before the split, so refreshAnalytics is passed in from useOverview.
export function useModerationQueue(unlocked, refreshAnalytics) {
  const [feedback, setFeedback] = useState(null);
  const [fbFilter, setFbFilter] = useState('new');
  const [fbBusy, setFbBusy] = useState(false);

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
    try {
      await adminSetFeedbackStatus(id, status);
      await loadFeedback(fbFilter);
      refreshAnalytics();
    } catch { /* the row keeps its state, a retry is one click */ }
  };

  return { feedback, fbFilter, setFbFilter, fbBusy, loadFeedback, setFeedbackStatus };
}
