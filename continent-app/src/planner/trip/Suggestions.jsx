import { useI18n } from '../../i18n/index.jsx';
import { cityLabel } from '../../lib/placeName.js';
import { ScoreChip } from '../../components/RatingBadge.jsx';

export function Suggestions({ suggestions, onPick }) {
  const { t } = useI18n();
  if (!suggestions.length) return null;
  return (
    <div className="trip-block">
      <div className="trip-block-title">{t('trip.suggestTitle')}</div>
      <div className="trip-suggest-row">
        {suggestions.map((s) => (
          <button
            key={s.id}
            className="trip-suggest-card"
            onClick={() => onPick(s)}
            title={t('trip.suggestFrom', { city: cityLabel(s.city), country: s.country, km: s.km, from: s.shared_origin || t('trip.overland') })}
          >
            <div className="trip-suggest-thumb" style={s.image ? { backgroundImage: `url(${s.image})` } : undefined}>
              {!s.image && <span className="trip-suggest-fallback">{cityLabel(s.city).slice(0, 1)}</span>}
              {s.reason && <span className="trip-suggest-chip">{s.reason}</span>}
            </div>
            <div className="trip-suggest-meta">
              <span className="trip-suggest-city">{cityLabel(s.city)}</span>
              <span className="trip-suggest-sub">
                {s.km} km
                {s.rating?.score != null && <ScoreChip rating={s.rating} size="xs" />}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The stops you already said you wanted.
 *
 * The shortlist existed and the planner never read it: you starred a city on
 * the map and then typed its name again here. This closes that. It sits
 * above the recommendations deliberately - your own wishes outrank the app's
 * suggestions - and it is drawn in the same card shape, because "somewhere I
 * might add" is one idea and should not look like two.
 *
 * Only DESTINATIONS appear: a trip stop is a place you sleep in, and a
 * shortlisted beach or walk is not one. They are reachable from the day
 * planner instead, which is where a beach belongs.
 *
 * A city already in the trip is dropped from the strip rather than shown
 * disabled: it is no longer somewhere you could add.
 */
export function ShortlistStops({ rows, onPick }) {
  const { t } = useI18n();
  if (!rows.length) return null;
  return (
    <div className="trip-block">
      <div className="trip-block-title">{t('fav.addFromShortlist')}</div>
      <div className="trip-suggest-row">
        {rows.map((s) => (
          <button
            key={s.id}
            className="trip-suggest-card"
            onClick={() => onPick(s)}
            title={t('trip.add')}
          >
            <div className="trip-suggest-thumb" style={s.image ? { backgroundImage: `url(${s.image})` } : undefined}>
              {!s.image && <span className="trip-suggest-fallback">{cityLabel(s.city).slice(0, 1) || '?'}</span>}
            </div>
            <div className="trip-suggest-meta">
              <span className="trip-suggest-city">{cityLabel(s.city)}</span>
              <span className="trip-suggest-sub">
                {s.country}
                {s.rating?.score != null && <ScoreChip rating={s.rating} size="xs" />}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
