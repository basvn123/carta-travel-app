// Explore search (G12): the gazetteer, matching, ranking and what a pick
// means for the list. Pure parts are tested in tests/search.test.mjs; the
// panel is src/browse/search/SearchPanel.jsx.
export { FEATURES, FEATURE_KEYS, extractTokens, removeFeature, hasFeatures } from './features.js';
export { loadGazetteerIndex, loadAreas, loadTownsFor, prefetchFor, shardsFor, prepareAreas, prepareTowns } from './gazetteer.js';
export { cartaPlaces, cityPart, kmBetween, inBox } from './places.js';
export { suggest, readQuery, cartaTwin, MAX_PLACES } from './suggest.js';
export { resolveIds, hitsFor, placesNear, NEAR_KM, NEAR_MIN, NEAR_MAX_KM } from './resolve.js';
export { rememberPick, pickedHits, resetPicked } from './picked.js';
export { readRecent, addRecent, addRecentText, clearRecent, MAX_RECENT } from './recent.js';
export { cartaRegionsFrom } from './cartaRegions.js';
export { townNames, namesFromTowns, startTown, useStartNames } from './startNames.js';
export { rememberLocalName, localNameOf, resetLocalNames, usePlaceLocalName } from './localNames.js';
export { elides, nearLabel } from './nearLabel.js';
