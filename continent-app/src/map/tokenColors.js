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
 * --accent and --ink-mute were held out while T363 darkened them; T363 is
 * done, so T411 mirrors them with the other colours the print exports read
 * (the destination PDF builds its fallback palette from this table instead
 * of a stale literal copy). They are still read live through tokenColour().
 *
 * T421 (Lagoon): legacy names in 01-tokens.css now alias roles through var();
 * each value here is the end of that chain, and the lint follows it.
 */
export const TOKEN_COLOURS = {
  '--ink': '#1f2a33',
  '--ink-soft': '#44515c',
  '--ink-mute': '#5c6873',
  '--accent': '#0b7480',
  '--rule-soft': '#e9eae7',
  '--rate-bg': '#f6e6cb',
  '--green': '#4a6a3a',
  '--paper-dim': '#efeeea',
  '--rule': '#dcdfdd',
  '--accent-bg': '#dff0f1',
  '--rate': '#8f5a0c',
  '--bg-card': '#ffffff',
  '--on-fill': '#ffffff',
  '--trail-pin': '#3d7a4e',
  '--swim-ink': '#2c6376',
  '--lake-ink': '#2a6f9e',
  '--water-link': '#2b6f9e',
  '--beach-ink': '#c48a2a',
  '--mountain-ink': '#6b5b95',
  '--gem-ink': '#7a4a6f',
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
