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
 * T438: the action teal became umber brown; ratings and gems joined it.
 *
 * T421 (Lagoon): legacy names in 01-tokens.css now alias roles through var();
 * each value here is the end of that chain, and the lint follows it.
 */
export const TOKEN_COLOURS = {
  '--ink': '#1e2421',
  '--ink-soft': '#465049',
  '--ink-mute': '#59625c',
  '--accent': '#8c5a2b',
  '--rule-soft': '#dde2da',
  '--rate-bg': '#e3e7df',
  '--green': '#3f6332',
  '--paper-dim': '#e3e7df',
  '--rule': '#cfd5cc',
  '--accent-bg': '#f6e7d3',
  '--rate': '#744820',
  '--bg-card': '#ffffff',
  '--on-fill': '#ffffff',
  '--trail-pin': '#2f7a45',
  '--swim-ink': '#2c6376',
  '--lake-ink': '#2b5fa8',
  '--water-link': '#2b5fa8',
  '--beach-ink': '#0e7c86',
  '--mountain-ink': '#6248a8',
  '--gem-ink': '#744820',
  // T430: the PDF kit's warning and tick colours (lib/pdfKit.js).
  '--amber-ink': '#a8400f',
  '--status-success': '#10b981',
  // The house map (house style 2026-11, src/map/houseBasemap.js).
  '--map-land': '#f8f9f5',
  '--map-water': '#d3dfe2',
  '--map-border': '#d7dcd3',
  '--map-route': '#8c5a2b',
  '--plate': '#1e2421',
  '--action': '#8c5a2b',
  // The airline badge's house colour and its two inks (lib/flights/airlineColours.js).
  '--umber-800': '#5a3716',
  '--neutral-0': '#ffffff',
  '--neutral-900': '#1e2421',
};

/**
 * Map-only colours that have no CSS token yet: the three lower steps of the
 * Explore tier ramp (step 3 is --rate). T438 moved them off the ochre ramp
 * onto ink shades (--neutral-600, the --kind-village grey, --neutral-300) so
 * no pin reads as the brown action colour; T441 redraws the pins as ink dots
 * and retires the ramp (T364-b).
 */
export const MAP_ONLY_COLOURS = {
  tier2: '#59625c',
  tier1: '#8f978f',
  tier0: '#b4bcb3',
};

/**
 * The Carta basemap (G12, .work/2026-11-20-map-view/decision.md "Base map"):
 * the Protomaps tiles drawn by src/lib/map/cartaMapStyle.js. Map-only, like
 * the ramp above: a warm paper land so the pins read first, and a dark
 * equivalent. `label` on `land` is 7:1 light and 8:1 dark; `waterLabel` on
 * `water` passes 4.5:1 in both.
 */
export const BASEMAP_COLOURS = {
  light: {
    land: '#f4efe6',
    water: '#dfe6e6',
    border: '#d9c6ae',
    road: '#e8dccb',
    park: '#d6dccd',
    label: '#465049',
    waterLabel: '#4f6468',
  },
  dark: {
    land: '#232a26',
    water: '#1a2428',
    border: '#6e5a44',
    road: '#343c37',
    park: '#28322b',
    label: '#c9cec7',
    waterLabel: '#93a7ab',
  },
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
