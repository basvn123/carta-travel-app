// T1122 (ROADMAP G3): the flag and the pure parts of the umber cost card
// (planner/trip/CostCard.jsx), apart so the component file exports only
// components and the tests can load these without React.

/*
 * T1122 (ROADMAP G3, direction docs/design/direction.md section 3): the umber
 * cost card as signature, built as a variant behind a flag that is OFF until
 * the owner approves the T1111 direction (row T1122-a). Nothing a traveller
 * sees changes while COST_CARD_UMBER is false.
 *
 *   Flip it for everyone: set COST_CARD_UMBER = true.
 *   Preview it:           any page with ?cc=umber (kept for the tab's
 *                         session, so it survives the app's navigation);
 *                         ?cc=arc goes back to today's arc card.
 */
export const COST_CARD_UMBER = false;
const CC_KEY = 'carta.cc';

/** Which cost card to draw: 'umber' or 'arc'. `search` and `store` are seams for tests. */
export function costCardVariant(search, store, flag = COST_CARD_UMBER) {
  let q = '';
  try { q = new URLSearchParams(search || '').get('cc') || ''; } catch { q = ''; }
  try {
    if (q === 'umber' || q === 'arc') store?.setItem(CC_KEY, q);
    q = q || store?.getItem(CC_KEY) || '';
  } catch { /* storage blocked: the query alone decides */ }
  if (q === 'umber') return 'umber';
  if (q === 'arc') return 'arc';
  return flag ? 'umber' : 'arc';
}

/**
 * Remember a ?cc= preview before the app rewrites the address (its state
 * writer drops the query on boot), so the card reads it when it mounts.
 * main.jsx imports this module first thing; on the server it does nothing.
 */
export function rememberCostCardPreview() {
  if (typeof window === 'undefined') return;
  let store = null;
  try { store = window.sessionStorage; } catch { store = null; }
  costCardVariant(window.location.search, store);
}
rememberCostCardPreview();

// The bar's colours (direction section 3: flight sun, bed action, food
// lagoon); getting around takes the sun's deep step, the flight's family.
const BAR_KEYS = ['travel', 'around', 'stay', 'food'];
// A share is printed inside its segment only when the segment has room.
export const SHARE_MIN = 14;

/** The bar's segments: priced groups by share (0 to 100), then any missing group. Pure, for tests. */
export function barSegments(tiles) {
  const list = (tiles || []).filter((x) => BAR_KEYS.includes(x.key));
  const priced = list.filter((x) => !x.missing && !x.empty && x.eur > 0);
  const sum = priced.reduce((n, x) => n + x.eur, 0);
  const out = priced.map((x) => ({ key: x.key, share: sum > 0 ? Math.round((x.eur / sum) * 1000) / 10 : 0, missing: false }));
  for (const x of list) if (x.missing) out.push({ key: x.key, share: 0, missing: true });
  return out;
}

