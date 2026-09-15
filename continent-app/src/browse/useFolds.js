import React from 'react';

/**
 * The open/closed set for a page of folds.
 *
 * `defaults` is the set of ids that start open; `resetKey` is the thing whose
 * change means a different subject is being shown (a destination id, a trip
 * id), at which point the folds go back to their defaults rather than
 * inheriting the shape of the last thing the reader opened.
 */
export function useFolds(defaults, resetKey) {
  const [open, setOpen] = React.useState(() => new Set(defaults));

  React.useEffect(() => { setOpen(new Set(defaults)); }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOpen = React.useCallback((id) => open.has(id), [open]);
  const toggle = React.useCallback((id) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  }), []);

  return { open, setOpen, isOpen, toggle };
}
