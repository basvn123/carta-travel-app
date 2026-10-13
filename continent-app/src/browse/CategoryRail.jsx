import {
  SkylineIcon, BeachIcon, TreeIcon, MountainIcon, MuseumIcon,
  PalmIcon, MoonIcon, DiningIcon, HeartIcon,
} from '../components/Icons.jsx';

/**
 * One glyph per trip kind (city, beach, nature and six more), the same
 * vocabulary everywhere a trip style is offered.
 *
 * T440: the trip styles are drawn by ExploreFilterRail as kit Tiles, an icon
 * over the word, two across; the toggle strip this file used to render is
 * gone, and only the icon map is shared from here.
 */
export const KIND_ICONS = {
  city: SkylineIcon,
  beach: BeachIcon,
  nature: TreeIcon,
  mountains: MountainIcon,
  cultural: MuseumIcon,
  island: PalmIcon,
  party: MoonIcon,
  food: DiningIcon,
  romantic: HeartIcon,
};
