/**
 * wizardFlights.js, one helper for the guided wizard's period-first flow:
 * monthOptions() lists the months covered by the data window, for the
 * "I'm flexible" month chips. Carta prices no flights, so the fly-in and
 * fly-home option builders that lived here were removed (T508).
 */
/** ['2026-07', '2026-08', ...] between two ISO dates (inclusive), with labels. */
export function monthOptions(minIso, maxIso) {
  if (!minIso || !maxIso) return [];
  const NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const out = [];
  let [y, m] = minIso.split('-').map(Number);
  const [ey, em] = maxIso.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push({ key: `${y}-${String(m).padStart(2, '0')}`, label: `${NAMES[m - 1]} ${y}` });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
