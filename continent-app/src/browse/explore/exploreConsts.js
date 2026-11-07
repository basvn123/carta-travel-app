/**
 * The Explore page, after the map: the whole catalogue as a photo-forward
 * grid a person can actually read. Instead of an all-in trip price (the fare
 * pipeline is retired from this page), every card answers four things at a
 * glance: what is this place, how good is it (the rating, and the tier seal
 * that says what the number means), what a day there costs one person in
 * euros, and where it is. Opening a card opens the full-screen
 * DestinationPage, rendered from the dossier contract.
 *
 * v5 (2026-09-12) made the page calm. One control bar heads the feed with
 * the title, the live count, the grid/map switch and the sort, where the
 * old page split those between the side rail and a header halfway down.
 * Three collections lead the idle page instead of eight, and the rest
 * become one row of doors into the grid. The card carries the name, the
 * score, the country, the kind and the euros a day, nothing else: the
 * season, the sights and how long the place is worth moved into the hover
 * preview, which already existed for exactly that. On a desktop the map
 * sits beside the grid rather than replacing it, so the list narrows to
 * what the map shows and the two never disagree.
 *
 * Hovering a card opens a preview with the things the card cannot fit. It
 * follows WCAG 1.4.13, so it is dismissible with Escape, survives the
 * pointer travelling into it, and opens on keyboard focus as well as hover.
 * On touch the card's info control opens it (V3), and since V4 it is a
 * paper popover beside or under the card, never over its photograph.
 */

export const PAGE = 48;

/** The overview photograph's candidates (T622): places whose catalogue
 *  photo is a landscape, never a facade. */
export const SCENIC_HERO = new Set([
  'Hallstatt', 'Bled', 'Lauterbrunnen', 'Grindelwald', 'Zermatt', 'Positano', 'Amalfi',
  'Manarola', 'Vernazza', 'Riomaggiore', 'Portofino', 'Reine', 'Geiranger', 'Oia',
  'Kotor', 'Annecy', 'Giethoorn', 'Bellagio', 'Varenna', "Cortina d'Ampezzo", 'Ortisei',
  'Chamonix', 'Plitvice', 'Bohinj', 'Gruyères', 'Mürren',
]);
