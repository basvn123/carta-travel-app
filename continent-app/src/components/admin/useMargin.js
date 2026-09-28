import { useEffect, useState } from 'react';
import { adminMargin } from '../../auth/admin.js';

export function useMargin(unlocked) {
  // The margin dashboard opens on the last CLOSED month, not on the month in
  // progress: a part month of sales against a whole month of infrastructure is
  // not a figure anybody should read. The selector moves this offset and the
  // effect below refetches, so the RPC is asked once per month looked at.
  const [marginBack, setMarginBack] = useState(1);
  const [margin, setMargin] = useState(null);

  // Its own effect, because it has its own argument. Folding it into the big
  // overview effect would refetch every other section on every month change.
  useEffect(() => {
    if (!unlocked) return;
    adminMargin(marginBack).then(setMargin).catch(() => setMargin(null));
  }, [unlocked, marginBack]);

  return { margin, marginBack, setMarginBack };
}
