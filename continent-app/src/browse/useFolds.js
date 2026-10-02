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

  // A new subject resets the folds during render (React's pattern for state
  // that follows a prop), so `defaults` may be a fresh array on every render
  // without re-running anything, and no frame shows the last subject's folds.
  const [subject, setSubject] = React.useState(resetKey);
  if (subject !== resetKey) {
    setSubject(resetKey);
    setOpen(new Set(defaults));
  }

  const isOpen = React.useCallback((id) => open.has(id), [open]);
  const toggle = React.useCallback((id) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  }), []);

  return { open, setOpen, isOpen, toggle };
}
