/** How many of a rail's first cards count as its lead. */
export const LEAD_CARDS = 4;

/**
 * Fresh leads (Explore rails, owner 2026-11-18, G12): Rome scores high in Top
 * rated, Old towns, World Heritage, City breaks and Art, so twenty rails
 * would open on the same few photographs. Down the page, a place already
 * among an earlier rail's first LEAD_CARDS moves behind the places that are
 * not. Only the order changes: every rail keeps exactly its places, so its
 * See all still lists the same ones. The traveller's saved places keep
 * their own order and claim nothing, and a rail too short to be drawn
 * (under four places) claims nothing either.
 */
export function spreadLeads(rails, lead = LEAD_CARDS) {
  const seen = new Set();
  return rails.map((r) => {
    if (r.key === 'saved' || r.rows.length < 4) return r;
    const fresh = [];
    const again = [];
    for (const p of r.rows) (seen.has(p.id) ? again : fresh).push(p);
    const rows = again.length ? fresh.concat(again) : r.rows;
    for (const p of rows.slice(0, lead)) seen.add(p.id);
    return rows === r.rows ? r : { ...r, rows };
  });
}
