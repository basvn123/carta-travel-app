/**
 * textSearch.js, one shared fold for user-typed search boxes.
 *
 * "atomium", "Atomium" and "Átomium" should all hit the same POI, and typing
 * "etoile" must match "Maison de l'Étoile". NFD-decompose, strip the combining
 * marks, map the few letters NFD leaves intact (l-stroke, o-slash, eszett),
 * then lowercase. Same folding the destination search and the POI dedupe use.
 */
export function searchFold(s) {
  return String(s || '')
    .replace(/[łŁ]/g, 'l')
    .replace(/[øØ]/g, 'o')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
