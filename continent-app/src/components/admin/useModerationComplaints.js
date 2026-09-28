import { useCallback, useEffect, useState } from 'react';
import { adminListModerationComplaints } from '../../auth/admin.js';

// The complaints queue shown at the top of the Reports tab: owners
// contesting a takedown, from admin_list_moderation_complaints (migration
// 039), with an open/all filter.
//
// Loads the first time the Reports tab is shown, like useContentReports, so
// the unlock request sequence T062 kept identical stays identical. Failure
// keeps what was shown and sets `error`; a missing 039 on the live project
// answers "could not find the function".
export function useModerationComplaints(wanted, errText) {
  const [complaints, setComplaints] = useState(null);
  const [filter, setFilter] = useState('open');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (which) => {
    setBusy(true);
    setError('');
    try {
      setComplaints(await adminListModerationComplaints(which === 'all' ? null : which, 100, 0));
    } catch (e) {
      setError(errText(e));
    }
    setLoaded(true);
    setBusy(false);
  }, [errText]);

  useEffect(() => {
    if (!wanted || loaded || busy) return;
    load(filter);
  }, [wanted, loaded, busy, load, filter]);

  const choose = (which) => { setFilter(which); load(which); };

  return { complaints, filter, choose, busy, error, reload: () => load(filter) };
}
