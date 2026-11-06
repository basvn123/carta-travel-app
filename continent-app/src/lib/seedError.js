// Seeded render errors (T1106, H13): a way to prove, in a test or in
// `npm run dev`, that a crash inside one card or screen stays inside it.
// A SectionBoundary with a `name` calls maybeThrowSeeded(name) while it
// renders; if that name is seeded it throws. Nothing is seeded in production:
// the URL switch below only works in a dev build, and the test API is inert
// until a test calls seedError().
//
//   dev:  /?seedError=explore,trip   (comma list of boundary names, or "*")
//   test: seedError('explore'); ... clearSeededErrors();

const seeded = new Set();

export function seedError(...names) { names.flat().forEach((n) => seeded.add(n)); }
export function clearSeededErrors() { seeded.clear(); }

function fromUrl() {
  try {
    if (!import.meta.env?.DEV) return [];
    const v = new URLSearchParams(window.location.search).get('seedError');
    return v ? v.split(',').map((x) => x.trim()).filter(Boolean) : [];
  } catch { return []; }
}

export function isSeeded(name) {
  if (seeded.has(name) || seeded.has('*')) return true;
  const u = fromUrl();
  return u.includes(name) || u.includes('*');
}

export function maybeThrowSeeded(name) {
  if (isSeeded(name)) throw new Error(`Seeded test error in ${name}`);
}
