import { useCallback, useEffect, useState } from 'react';
import { adminListContentReports } from '../../auth/admin.js';

// The Reports tab's state: DSA notices filed against public guides, from
// admin_list_content_reports (migration 037), with a new/all filter.
//
// Like usePublicGuides (T067) it loads the first time the tab is shown
// (`wanted` turns true), not at unlock, so the unlock request sequence T062
// kept identical stays identical. It keeps its rows across tab visits;
// Refresh and the filter reload on demand.
//
// Failure clears nothing that was shown before and sets `error`, so the view
// can tell "no reports" from "the query did not run" (a missing 037 on the
// live project answers "could not find the function").
export function useContentReports(wanted, errText) {
  const [reports, setReports] = useState(null);
  const [filter, setFilter] = useState('new');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (which) => {
    setBusy(true);
    setError('');
    try {
      setReports(await adminListContentReports(which === 'all' ? null : which, 100, 0));
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

  return { reports, filter, choose, busy, error, reload: () => load(filter) };
}
