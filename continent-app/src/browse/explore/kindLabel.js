// A size word from the link (`xk`) as a chip label. Only metro, city, town,
// village and area have a pkind key; an old or hand-typed link (`xk=lake`)
// once showed the raw key "pkind.lake" on its chip and in the empty state's
// Remove button (house style audit, 2026-11). An unknown value reads as its
// category's name where one exists, else as the word itself. Pure, so the
// tests can load it.
const KIND_FALLBACK = { lake: 'places.catLakes', beach: 'places.catBeaches', mountain: 'places.catMountains', trail: 'places.catTrails' };

export function kindLabel(k, t) {
  const key = `pkind.${k}`;
  const word = t(key);
  if (word && word !== key) return word;
  if (KIND_FALLBACK[k]) return t(KIND_FALLBACK[k]);
  const s = String(k || '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
