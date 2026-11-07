import { useMemo } from 'react';
import { useTaste } from '../../browse/WhyItMatches.jsx';
import { tripTaste } from '../../lib/taste.js';
import { matchCountries } from '../../lib/countryMatch.js';

export function useWizardCountries({
  arrivalDest, booked, countryBriefs, countryCovers, countryInsights, destinations, flexMonth,
  layerIndexes, originPoint, quiz, startDate,
}) {
  // The month the trip actually falls in, which the When step already asked.
  // The same answer as tripMonth, written the way a calendar writes it, for
  // the handful of places (Google Flights Explore) that want a real month.
  const tripYearMonth = useMemo(() => {
    const iso = startDate || (flexMonth ? `${flexMonth}-05` : '');
    const m = /^(\d{4}-\d{2})/.exec(iso);
    return m ? m[1] : '';
  }, [startDate, flexMonth]);
  const tripMonth = useMemo(() => {
    const iso = startDate || (flexMonth ? `${flexMonth}-05` : '');
    const m = /^\d{4}-(\d{2})/.exec(iso);
    return m ? Number(m[1]) : null;
  }, [startDate, flexMonth]);

  // T766: the traveller's taste, with this trip's likes in place of the
  // profile's (the trip's answers seed the taste for this trip only).
  const savedTaste = useTaste();
  const quizTaste = useMemo(() => tripTaste(savedTaste, quiz.types), [savedTaste, quiz.types]);
  const countryMatches = useMemo(() => {
    if (!quiz.types?.length) return [];
    // T657: behind booked flights the trip starts where the flight lands, so
    // the matches are measured from the arrival and kept within a short hop
    // of it, not from home.
    const landed = booked.travel && arrivalDest && arrivalDest.lat != null;
    const rows = matchCountries({
      destinations,
      insights: countryInsights,
      layerIndexes,
      answers: landed ? { ...quiz, distance: 'short' } : quiz,
      month: tripMonth,
      taste: quizTaste,
      origin: landed
        ? { lat: arrivalDest.lat, lon: arrivalDest.lon }
        : (originPoint ? { lat: originPoint.lat, lon: originPoint.lon } : null),
    });
    // The card wants a photograph and three real places; the scorer returns
    // ids, because it stays node-runnable and knows nothing about images.
    return rows.map((r) => ({
      ...r,
      cover: countryCovers.get(r.country) || countryBriefs.get(r.country)?.cover || null,
      places: (r.topPlaces || [])
        .map((id) => ({ id, dest: destinations[id] }))
        .filter((x) => x.dest),
    }));
  }, [quiz, destinations, countryInsights, layerIndexes, tripMonth, originPoint,
    countryCovers, countryBriefs, booked.travel, arrivalDest, quizTaste]);

  /** The names the quiz recommended, for the map's dotted outline. */
  const recommendedNames = useMemo(
    () => new Set(countryMatches.slice(0, 6).map((m) => m.country)),
    [countryMatches],
  );
  return { tripYearMonth, tripMonth, quizTaste, countryMatches, recommendedNames };
}
