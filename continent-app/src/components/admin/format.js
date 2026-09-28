// Formatting shared by the admin views. Moved out of AdminPage.jsx
// unchanged by T062, so every view writes a date and names an account
// the same way.

export function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit', month: 'short', year: 'numeric',
    }).format(new Date(iso));
  } catch { return ''; }
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch { return ''; }
}

export function initial(r) {
  const s = r.displayName || r.handle || r.email || '?';
  return s.trim().charAt(0).toUpperCase();
}

export function rowName(r) {
  return r.displayName || r.handle || r.email || r.id;
}
