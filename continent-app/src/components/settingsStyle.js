/**
 * The trip settings and the active travel style (Style Studio, G12). Pure,
 * so node tests hold the rules the search dock's Who and Transport cards
 * draw (components/SearchDock.jsx).
 */
import { TRAVEL_MODES } from '../lib/travelWay.js';

/**
 * Which settings hold the active travel style's own value: the party when
 * its counts are the style's, the way there when it is the way the style
 * picked. A style that picked no way ('any') sets nothing.
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
 * The ways the Transport card offers: the style's own ways, in its order,
 * when it ticked two or more, so the choice is between the ways the
 * traveller travels; the rest wait behind "Other ways". Every way shows
 * when the style has fewer than two, when the traveller asked for all
 * (`all`), or when the current mode is outside the style's ways (a link, a
 * trip's way), so the selected chip is never hidden.
 * Returns { shown: modes[], more: bool }.
 */
export function wayChoices(mode, style, all = false) {
  const ways = (Array.isArray(style?.ways) ? style.ways : []).filter((w) => w !== 'any' && TRAVEL_MODES.includes(w));
  if (all || ways.length < 2 || !ways.includes(mode)) return { shown: [...TRAVEL_MODES], more: false };
  return { shown: ways, more: true };
}
