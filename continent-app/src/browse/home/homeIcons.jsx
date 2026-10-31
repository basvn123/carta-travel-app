/**
 * The home page's icons (T948, owner 2026-10-31: "icons need to be more
 * human, look for a clean library"). Phosphor's duotone set: a 1.5 px line
 * with a soft fill at 20 percent of the same colour, so every icon takes one
 * Carta colour (currentColor) and reads warm rather than technical. MIT
 * licence. Only the icons named here are bundled, and only in the home
 * story's lazy chunk.
 */
export {
  AirplaneTilt, Bed, BookmarkSimple, CalendarBlank, Clock, CoffeeBean, Coins, GlobeHemisphereWest,
  HandCoins, Lightbulb, MagnifyingGlass, MapTrifold, Mountains, Path, Scales, Sparkle, Ticket, Train,
  UsersThree, ArrowRight,
} from '@phosphor-icons/react';

/** The weight and size every home icon uses. */
export const ICON = { weight: 'duotone', size: 22 };
