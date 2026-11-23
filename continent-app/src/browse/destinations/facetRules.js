/**
 * D-7 (ROADMAP G4, D7): a filter chip group is drawn only when some row can
 * answer it. A group no row can answer (SAC grades, Reachable by transit
 * while the data is not there) only returned an empty list, so it stays out
 * of the rail until its count is above zero; one already switched on stays,
 * so the traveller can switch it off.
 */
export const showFacet = (total, anyOn) => total > 0 || Boolean(anyOn);
