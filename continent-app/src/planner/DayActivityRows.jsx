import { useState } from 'react';
import {
  HomeIcon, BeachIcon, MountainIcon, CastleIcon,
} from '../components/Icons.jsx';

/** A place with no photo still deserves a thumbnail that says what it is.
 *  The glyphs match the map pins (town / nature / active / sight), so a row
 *  and its pin read as the same thing. */
const THUMB_GLYPH = { town: HomeIcon, beach: BeachIcon, active: MountainIcon, sight: CastleIcon };

/** The one thumbnail every list of places uses: the photo when the catalogue
 *  has one, its category glyph when it does not. `cat` is a poiMapCat key and
 *  `Glyph` overrides it for places that are not catalogue rows at all (a bot
 *  find has no category to speak of).
 *
 *  This is all that survives of the old day-planner list components. The
 *  timeline, the tiered "things to do" accordion and the pickable activity row
 *  they lived beside were replaced by the day workspace: DayPlanPanel holds
 *  the route, DayAddPanel holds the browser. */
export function PoiThumb({ img, cat, name, Glyph }) {
  // Some harvested photo URLs are dead (Wikimedia 400s on a few of the 640px
  // thumbnails). A CSS background cannot tell, so it paints an empty tinted
  // square; a real <img> can say it failed and hand the row back to its glyph.
  const [failed, setFailed] = useState(false);
  if (img && !failed) {
    return (
      <img
        className="day-thumb"
        src={img}
        alt={name || ''}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }
  const Fallback = Glyph || THUMB_GLYPH[cat] || CastleIcon;
  return (
    <span className="day-thumb day-thumb-empty" aria-hidden="true">
      <Fallback size={19} />
    </span>
  );
}
