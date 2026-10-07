/**
 * The token mirror (T364, owner call T362 on T196-b).
 *
 * MapLibre paint properties cannot read a CSS custom property, so a colour a
 * map needs has to exist in JavaScript as a concrete value. This is the ONE
 * module allowed to hold a hex literal. Each entry copies its value from the
 * :root of src/styles/01-tokens.css under the token's own name, and
 * scripts/ci/design-lint.mjs fails when an entry no longer matches that file.
 * No other JavaScript file may hold a hex colour (the lint's js-hex-literal
 * rule), except the flag and brand artwork and the print exports it lists.
 *
 * --accent and --ink-mute are deliberately not mirrored: they are the two
 * contrast tokens the owner has asked to see darkened (T363), so they are only
 * ever read live, through tokenColour(), and cannot drift here.
 */
export const TOKEN_COLOURS = {
  '--ink': '#0f172a',
  '--paper-dim': '#efece2',
  '--rule': '#ccc7b8',
  '--accent-bg': '#f7dcd4',
  '--rate': '#8f5a0c',
  '--bg-card': '#ffffff',
  '--on-fill': '#ffffff',
  '--trail-pin': '#3d7a4e',
  '--swim-ink': '#2c6376',
  '--lake-ink': '#2a6f9e',
  '--water-link': '#2b6f9e',
  '--beach-ink': '#c48a2a',
  '--mountain-ink': '#6b5b95',
  '--gem-ink': '#2c6e63',
};

/**
 * Map-only colours that have no CSS token yet: the three lower steps of the
 * Explore tier ramp (step 3 is --rate). They are not checked against
 * 01-tokens.css; whether they become tokens is an open design call (T364-b).
 */
export const MAP_ONLY_COLOURS = {
  tier2: '#c08a2e',
  tier1: '#eddbb6',
  tier0: '#b9b4a5',
};

/**
 * A design token as a concrete colour: the live value from the document when
 * there is one (so a token change reaches the map without a code change),
 * otherwise the mirror above. Call it at paint time, not at module load.
 */
export function tokenColour(name) {
  if (typeof document !== 'undefined') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) return v;
  }
  return TOKEN_COLOURS[name] || '#000000';
}
