import React, { useState } from 'react';
import { HeroImage } from '../components/HeroImage.jsx';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { CheckIcon, InfoIcon, PlusIcon } from '../components/Icons.jsx';
import { Flag } from './GuidedTripWizardParts.jsx';
import { cityLabel } from '../lib/placeName.js';
import { useI18n } from '../i18n/index.jsx';
import { monthName } from '../lib/dates.js';

/** How many recommendations before the "show more" link. */
const PAGE = 6;

/**
 * One recommended country.
 *
 * No price anywhere on this card, on purpose. A country card used to carry a
 * flight fare, which moved every time the dates moved and said nothing about
 * the country (see the note at the top of lib/countryBrief.js). What it
 * carries instead is why it is being recommended, in the traveller's own
 * terms: the trip type they asked for, and the measured facts behind it.
 */
function MatchCard({ match, picked, onToggle, onBrief, t, lang }) {
  const reasons = match.reasons || [];
  const typeLabel = match.topType ? t(`quiz.type.${match.topType}`) : '';
  return (
    <div className={`mcard ${picked ? 'on' : ''}`}>
      <button
        type="button"
        className="mcard-pick"
        onClick={() => onToggle(match.country)}
        aria-pressed={picked}
        aria-label={match.country}
      >
        <HeroImage
          url={match.cover}
          city={match.country}
          iso2={match.iso2}
          className="mcard-img"
          maxWidth={960}
          sizes="(max-width: 768px) 92vw, 380px"
          ratio={[16, 10]}
        />
        <span className="mcard-scrim" aria-hidden="true" />
        {picked && <span className="mcard-check"><CheckIcon size={13} /></span>}
        <span className="mcard-head">
          <Flag iso2={match.iso2} className="guide-flag-img-sm" />
          <b>{match.country}</b>
        </span>
      </button>

      <div className="mcard-body">
        {/* The match line: what they asked for, and when it is at its best. */}
        {typeLabel && (
          <p className="mcard-match">
            {typeLabel}
            {match.bestMonth && <span className="mcard-month"> · {t('quiz.bestIn', { month: monthName(match.bestMonth, lang) })}</span>}
          </p>
        )}

        {/* Every bullet is a number that came from a published file. */}
        {reasons.length > 0 && (
          <ul className="mcard-why">
            {reasons.map((r, i) => <li key={i}>{t(r.key, r.vars)}</li>)}
          </ul>
        )}

        {/* Three places that actually carry the chosen trip type, so the
            thumbnails are evidence for the recommendation, not decoration. */}
        {match.places?.length > 0 && (
          <div className="mcard-places">
            {match.places.map((p) => (
              <div className="mcard-place" key={p.id}>
                <HeroImage
                  url={p.dest.image?.url}
                  city={p.dest.city}
                  iso2={p.dest.iso2}
                  className="mcard-place-img"
                  maxWidth={250}
                  sizes="88px"
                  ratio={[1, 1]}
                />
                <span className="mcard-place-name">{cityLabel(p.dest.city)}</span>
                <ScoreChip rating={p.dest.rating} />
              </div>
            ))}
          </div>
        )}

        <div className="mcard-acts">
          <button
            type="button"
            className={`mcard-add ${picked ? 'on' : ''}`}
            onClick={() => onToggle(match.country)}
            aria-pressed={picked}
          >
            {picked ? <CheckIcon size={13} /> : <PlusIcon size={13} />}
            {picked ? t('quiz.added') : t('quiz.add')}
          </button>
          <button type="button" className="mcard-info" onClick={() => onBrief(match.country)}>
            <InfoIcon size={12} /> {t('brief.whatsThere')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * "Recommended for you": the ranked countries as photo cards.
 *
 * Shows six, then six more behind a quiet link, because a recommendation list
 * that scrolls forever is a search result, and the point of the quiz was not
 * to produce one.
 */
export function CountryMatchCards({ matches, picked, onToggle, onBrief }) {
  const { t, lang } = useI18n();
  const [shown, setShown] = useState(PAGE);
  if (!matches.length) return null;
  return (
    <>
      <div className="mcards">
        {matches.slice(0, shown).map((m) => (
          <MatchCard
            key={m.country}
            match={m}
            picked={picked.has(m.country)}
            onToggle={onToggle}
            onBrief={onBrief}
            t={t}
            lang={lang}
          />
        ))}
      </div>
      {matches.length > shown && (
        <button type="button" className="mcards-more" onClick={() => setShown(shown + PAGE)}>
          {t('quiz.showMore', { n: Math.min(PAGE, matches.length - shown) })}
        </button>
      )}
    </>
  );
}
