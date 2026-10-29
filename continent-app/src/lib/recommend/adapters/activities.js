/**
 * The things-to-do slot (T792): not measured yet. Published activity
 * prices cover 0 of the catalogue's things to do (row T715-a), so the slot
 * draws NotYet, stays out of every sum and has nothing to swap. When
 * prices land, this adapter returns them and the slot's row in
 * config/slots.json turns live; no screen changes.
 */
export const activities = {
  price() {
    return { eurGroup: null, pick: null, options: null, because: null, quality: 'missing' };
  },
};
