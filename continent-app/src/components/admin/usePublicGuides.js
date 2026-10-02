import { useCallback, useEffect, useState } from 'react';
import { adminListPublicGuides } from '../../auth/admin.js';

// The Guides tab's state: every published trip, from
// admin_list_public_guides (migration 036).
//
// Unlike the other hooks this one does NOT load at unlock. It loads the
// first time the tab is shown (`wanted` turns true) and keeps the list
// after that, the way every other tab keeps its state across visits. Two
// reasons: the unlock sequence T062 kept identical stays identical, and the
// list is unbounded in principle, so only the first 100 are fetched, and
// only by somebody who came to read it. Show more pages in the rest. Refresh reloads it on demand.
//
// Failure clears nothing that was shown before and sets `error`, so the
// view can tell "none published" from "the query did not run" (a missing
// 036 on the live project answers "function does not exist").
const PAGE = 100;

export function usePublicGuides(wanted, errText) {
  const [guides, setGuides] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setGuides(await adminListPublicGuides(PAGE, 0));
    } catch (e) {
      setError(errText(e));
    }
    setLoaded(true);
    setBusy(false);
  }, [errText]);

  // Show more: the next page appended to what is already on screen (T067-b).
  // Rows already shown are not duplicated if a guide was published between
  // two pages and shifted the offset.
  const loadMore = useCallback(async () => {
    if (!guides) return;
    setBusy(true);
    setError('');
    try {
      const next = await adminListPublicGuides(PAGE, guides.rows.length);
      const seen = new Set(guides.rows.map((g) => g.id));
      setGuides({
        ...next,
        rows: [...guides.rows, ...(next.rows || []).filter((g) => !seen.has(g.id))],
      });
    } catch (e) {
      setError(errText(e));
    }
    setBusy(false);
  }, [errText, guides]);

  useEffect(() => {
    if (!wanted || loaded || busy) return;
    load();
  }, [wanted, loaded, busy, load]);

  return { guides, busy, error, load, loadMore };
}
