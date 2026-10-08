import React, { useState } from 'react';
import { HeroImage } from '../components/HeroImage.jsx';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { CheckIcon, InfoIcon, PlusIcon } from '../components/Icons.jsx';
import { Flag } from './GuidedTripWizardParts.jsx';
import { cityLabel } from '../lib/placeName.js';
import { useI18n } from '../i18n/index.jsx';
import { monthName } from '../lib/dates.js';

/** A reason that is a count ("1276 rated trails") as a labelled value: the
 *  figure alone in mono through Intl.NumberFormat ("1,276"), the words under
 *  it in --ui (T398, brief V4-8). The sentence is translated whole and split
 *  at the figure, so word order survives every language; a reason with no
 *  count keeps its sentence. */
function Reason({ r, t, lang }) {
  const n = r.vars?.n;
  if (typeof n !== 'number') return <li className="mcard-why-text">{t(r.key, r.vars)}</li>;
  let figure;
  try { figure = new Intl.NumberFormat(lang).format(n); } catch { figure = String(n); }
  const parts = t(r.key, { ...r.vars, n: '\u0000' }).split('\u0000');
  // Where the language puts the count first, the words become its label;
  // otherwise the sentence stays whole with the count in mono inside it.
  if (parts[0].trim() !== '') {
    return <li className="mcard-why-text">{parts[0]}<span className="mono">{figure}</span>{parts.slice(1).join('')}</li>;
  }
  return (
    <li className="mcard-why-fact">
      <span className="mcard-why-n">{figure}</span>
      <span className="mcard-why-l">{parts.slice(1).join('').trim()}</span>
    </li>
  );
}

/** How many recommendations before the "show more" link. */
const PAGE = 6;

/** "From €43 a day a person": the sentence translated whole, the figure alone
 *  in mono, so word order survives every language. */
export function DayCostLine({ cost, t, className = '' }) {
  if (!cost) return null;
  const parts = t('match.fromDay', { eur: '\u0000' }).split('\u0000');
  return (
    <p className={`wiz-cost-line ${className}`}>
      {parts[0]}
      <span className="mono">{cost.minText}</span>
      {parts.slice(1).join('')}
      {cost.national && <> {t('match.national')}</>}
    </p>
  );
}

/**
 * One recommended country.
 *
 * A country card used to carry a flight fare, which moved every time the
 * dates moved and said nothing about the country (see the note at the top of
 * lib/countryBrief.js), and then no price at all. Since T388 it carries the
 * figure the traveller weighs first (rule "Cost on cards"): what a day there
 * costs a person at their Lifestyle, from the cheapest town, read from the
 * same cost index Explore prices with. Never a flight. Then why it is being
 * recommended, in the traveller's own terms.
 */
function MatchCard({ match, picked, onToggle, onBrief, t, lang, cost }) {
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
        {/* The name sits in a paper band under the photograph, never on it
            (T398, rule "Caption band"); a picked card carries an ink tick
            there. */}
        <span className="mcard-head">
          <Flag iso2={match.iso2} className="guide-flag-img-sm" />
          <b>{match.country}</b>
          {picked && <span className="mcard-check"><CheckIcon size={12} /></span>}
        </span>
      </button>

      <div className="mcard-body">
        <DayCostLine cost={cost} t={t} />
        {/* The match line: what they asked for, and when it is at its best. */}
        {typeLabel && (
          <p className="mcard-match">
            {typeLabel}
            {/* A comma, not a middot: carta-design bans dot separators (T193). */}
            {match.bestMonth && <span className="mcard-month">, {t('quiz.bestIn', { month: monthName(match.bestMonth, lang) })}</span>}
          </p>
        )}

        {/* Every reason is a number that came from a published file, set as
            a run of labelled values, not a bulleted list. */}
        {reasons.length > 0 && (
          <ul className="mcard-why">
            {reasons.map((r, i) => <Reason key={i} r={r} t={t} lang={lang} />)}
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
export function CountryMatchCards({ matches, picked, onToggle, onBrief, costs = null }) {
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
            cost={costs?.get(m.country) || null}
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
