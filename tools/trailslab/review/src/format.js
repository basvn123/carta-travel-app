// Formatting for measured facts. Everything here ends up in mono type, and
// nothing here invents precision the data does not have.

const nf = (digits) => new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: digits, maximumFractionDigits: digits,
});

export const num = (v, digits = 0) => (typeof v === 'number' && Number.isFinite(v)
  ? nf(digits).format(v) : null);

export const km = (metres, digits = 1) => (typeof metres === 'number' && Number.isFinite(metres)
  ? `${nf(digits).format(metres / 1000)} km` : '');

export const metres = (v) => (typeof v === 'number' && Number.isFinite(v)
  ? `${nf(0).format(Math.round(v))} m` : '');

export const hours = (minutes) => {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return '';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}` : `${m} min`;
};

export const score = (v) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? nf(n % 1 ? 1 : 0).format(n) : '';
};

export const stamp = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 16).replace('T', ' ');
};

// OSM relation id to the object it came from, for the reviewer who wants to
// see the source rather than trust the staging row.
export const osmUrl = (trip) => (trip.source === 'osm' && trip.source_ref
  ? `https://www.openstreetmap.org/relation/${trip.source_ref}` : null);
