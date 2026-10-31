import React from 'react';
import { HomeMotion } from './motionKit.jsx';
import { HomeCost, useStoryWeek } from './HomeCost.jsx';
import { HomeProof } from './HomeProof.jsx';
import { HomeTour } from './HomeTour.jsx';
import { HomeTry } from './HomeTry.jsx';

/**
 * The home page under the hero (T950 to T953), in its own chunk so Motion
 * and the icons load after the film, never in the first load. Three acts
 * after the cheap flight: what the trip really costs, the proof in one
 * picture, then everything Carta does; then the visitor's own first try.
 */
export default function HomeStory({ rows, places, place, flightFor, origin, lang, doors, wide, onSearch, onPlan, planHref }) {
  const week = useStoryWeek(rows, flightFor);
  return (
    <HomeMotion>
      <HomeCost week={week} place={place} from={origin} />
      <HomeProof week={week} place={place} onPlan={onPlan} planHref={planHref} />
      <HomeTour lang={lang} doors={doors} wide={wide} />
      <HomeTry rows={rows} places={places} onSearch={onSearch} />
    </HomeMotion>
  );
}
