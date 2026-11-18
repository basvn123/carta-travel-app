/**
 * The settings line and the active travel style (Style Studio, G12). Pure,
 * so node tests hold the rules SettingsLine.jsx draws.
 */
import { nextMode, TRAVEL_MODES } from '../lib/travelWay.js';

/**
 * Which parts of the line hold the active travel style's own value: the
 * party when its counts are the style's, the way there when it is the way
 * the style picked. A style that picked no way ('any') sets nothing.
 *   s  the settings context (party, children, babies, transportMode, travelStyles)
 */
export function styleSourced(s) {
  const a = s?.travelStyles?.active;
  if (!a) return { party: false, way: false };
  const kids = s.children || 0;
  const seats = Number.isFinite(s.party) ? s.party : 2;
  return {
    party: a.who.adults + a.who.kids === seats && a.who.kids === kids && a.who.babies === (s.babies || 0),
    way: a.way !== 'any' && a.way === s.transportMode,
  };
}

/**
 * The way the cycler steps to: through the style's own ways when it ticked
 * two or more, in its order, so a tap never lands on a way the traveller
 * left out; else through every way. A mode outside the list (a link, a
 * trip's way) steps to the list's first.
 */
export function nextWayFor(mode, style) {
  const ways = (Array.isArray(style?.ways) ? style.ways : []).filter((w) => w !== 'any' && TRAVEL_MODES.includes(w));
  if (ways.length < 2) return nextMode(mode);
  return ways[(ways.indexOf(mode) + 1) % ways.length];
}
