/**
 * The doors into the Style Studio (G12, decision.md "Doors"). Every place
 * that used to open its own style editor (the Lifestyle dialog, the old
 * sheet, the taste doors, the Style dock's panel) now opens the one studio
 * through these, so nothing else edits a style.
 *
 * A door that names a step ("where you sleep and eat" on a price) edits the
 * active style there. `ts.setOpen` (lib/travelStyles.js studioOpen) settles
 * the rest: with no style yet it starts a new one at the first step, and
 * with styles but none in use it shows the overview to pick from.
 */

/** Opens the studio at `step` of the active style. */
export function openStudioAt(ts, step) {
  ts?.setOpen({ view: 'edit', step });
}

/** Opens the studio on its overview: the list of styles. */
export function openStudio(ts) {
  ts?.setOpen({ view: 'overview' });
}
