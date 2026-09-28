import { useCallback, useEffect, useState } from 'react';
import { adminListPublicGuides } from '../../auth/admin.js';

// The Guides tab's state: every published trip, from
// admin_list_public_guides (migration 036).
//
// Unlike the other hooks this one does NOT load at unlock. It loads the
// first time the tab is shown (`wanted` turns true) and keeps the list
// after that, the way every other tab keeps its state across visits. Two
// reasons: the unlock sequence T062 kept identical stays identical, and the
// list has no limit (it returns every public guide), so it is only fetched
// by somebody who came to read it. Refresh reloads it on demand.
//
// Failure clears nothing that was shown before and sets `error`, so the
// view can tell "none published" from "the query did not run" (a missing
// 036 on the live project answers "function does not exist").
export function usePublicGuides(wanted, errText) {
  const [guides, setGuides] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setGuides(await adminListPublicGuides());
    } catch (e) {
      setError(errText(e));
    }
    setLoaded(true);
    setBusy(false);
  }, [errText]);

  useEffect(() => {
    if (!wanted || loaded || busy) return;
    load();
  }, [wanted, loaded, busy, load]);

  return { guides, busy, error, load };
}
