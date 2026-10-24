/**
 * appSync.js (T660): the trip settings' party and dates written into the
 * app-wide values Explore prices with (SettingsContext), so a place costs the
 * same on Explore as in the planner. One place, because three screens answer
 * these questions: Who, When, and the free field when its words answer them
 * (the end check caught the free field's May trip pricing Explore in
 * November).
 */

function addDaysISO(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** People: adults, children, babies. */
export function syncParty(app, party) {
  app?.setPartyParts?.({ adults: party.adults, children: party.kids, babies: party.babies });
}

/**
 * When: exact dates; a month (its first day, or the earliest allowed day of
 * it, for the trip's nights); or any time.
 */
export function syncWhen(app, when, today = new Date()) {
  if (!app) return;
  if (when.mode === 'exact' && when.start && when.end) {
    app.setDateFlex?.(null);
    app.setDepartDate?.(when.start);
    app.setReturnDate?.(when.end);
    return;
  }
  if (when.mode === 'months' && when.months.length) {
    const now = today.getMonth() + 1;
    // The first picked month still to come, this one included.
    const sorted = [...when.months].sort((a, b) => ((a - now + 12) % 12) - ((b - now + 12) % 12));
    const m = sorted[0];
    const year = m >= now ? today.getFullYear() : today.getFullYear() + 1;
    const first = `${year}-${String(m).padStart(2, '0')}-01`;
    const min = app.dateBounds?.min;
    const start = min && min > first ? min : first;
    app.setDateFlex?.('month');
    app.setDepartDate?.(start);
    app.setReturnDate?.(addDaysISO(start, when.nights || 7));
    return;
  }
  app.setDateFlex?.('any');
}
