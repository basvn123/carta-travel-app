import { tripGrade, trailRating } from '../../lib/trailCards.js';
import { displayName, GRADE_KEY, trailFigures, placeLine } from '../../lib/cardFillings.js';
import { routeTitle, cycleRating } from '../../lib/cycleStory.js';
import { mountainRating } from '../../lib/mountainStory.js';
import { lakeRating } from '../../lib/lakeStory.js';
import { beachRating } from '../../lib/beachStory.js';

export function useDescribeFacts({ countryName, lang, opening, t }) {
  // One tile's words: the name, where it is, one measured fact and the
  // Score (T428: the same tile Explore's rails draw, through the kit Card).
  const describeFacts = (row) => {
    const layer = opening?.layer;
    const km = (v, digits) => `${Number(v).toLocaleString(lang, { maximumFractionDigits: digits })} km`;
    if (layer === 'trail') {
      const grade = tripGrade(row);
      return {
        name: displayName(row.name),
        cc: opening?.europe ? row.country : null,
        // Europe-wide (T453) the country is what a tile has to say first;
        // within one country, the grade.
        where: opening?.europe ? countryName(row.country)
          : (grade && GRADE_KEY[grade] ? t(GRADE_KEY[grade]) : null),
        // G13: length, walking time and climb, the three a walk is chosen by.
        fact: trailFigures(row).join(', ') || null,
        factLabel: null,
        rating: trailRating(row),
      };
    }
    if (layer === 'cycle') {
      return {
        name: routeTitle(row, t),
        cc: row.cc,
        where: countryName(row.cc),
        fact: row.km != null ? km(row.km, 0) : null,
        factLabel: t('card.vLength'),
        rating: cycleRating(row, t),
      };
    }
    if (layer === 'mountain') {
      return {
        name: displayName(row.name),
        cc: row.cc,
        where: placeLine(row.range, countryName(row.cc)),
        fact: row.ele != null ? `${Math.round(row.ele).toLocaleString(lang)} m` : null,
        factLabel: t('card.vHeight'),
        rating: mountainRating(row, t),
      };
    }
    if (layer === 'lake') {
      const a = row.size?.areaKm2;
      return {
        name: displayName(row.name),
        cc: row.cc,
        where: placeLine(row.region, countryName(row.cc)),
        factLabel: t('card.vArea'),
        fact: a != null ? `${a.toLocaleString(lang, { maximumFractionDigits: a < 10 ? 1 : 0 })} km²` : null,
        rating: lakeRating(row, t),
      };
    }
    return {
      name: displayName(row.name),
      cc: row.cc,
      where: placeLine(row.region, countryName(row.cc)),
      factLabel: t('card.vLength'),
      fact: row.lengthM != null ? `${Math.round(row.lengthM).toLocaleString(lang)} m` : null,
      rating: beachRating(row, t),
    };
  };
  return { describeFacts };
}
