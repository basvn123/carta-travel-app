import React, { forwardRef, useId, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { AlertIcon, CheckIcon, HeartIcon } from '../../components/Icons.jsx';
import { CostBar } from '../../browse/CostBar.jsx';
import { formatMoney } from '../../lib/money.js';
import { monthName } from '../../lib/dates.js';
import {
  barSegments, budgetLine, factText, firstPlace, inclusions, matchBars, likeLabel, threeFigures, totalLeavesOut, tripName,
} from './finderText.js';

/** A whole-euro figure, or NotYet when the data has none. */
function Figure({ eur, lang, ui }) {
  const { NotYet } = ui;
  return eur == null ? <NotYet /> : <span className="money">{formatMoney(eur, { locale: lang })}</span>;
}

/** The trip's cost bar: the slots in order, on the ink ramp, no brown, no legend. */
export function TripBar({ trip, t, lang }) {
  const segments = barSegments(trip).map((s) => ({
    slot: s.id, weight: s.eur, label: t(s.labelKey), figure: formatMoney(s.eur, { locale: lang }),
  }));
  // The bar's hint line is the receipt's; on a card the bar speaks only when a segment is tapped.
  const quiet = (k, v) => (k === 'journey.barHint' ? '' : t(k, v));
  return <CostBar t={quiet} segments={segments} />;
}

/** "Why this match": the bars per like and what stands against the trip. */
export function WhyMatch({ trip, t, lang, id }) {
  const bars = matchBars(trip);
  const conflicts = (trip.match?.conflicts || []).filter((c) => ['busy', 'car', 'heat'].includes(c.key));
  return (
    <div className="tff-why" id={id}>
      <ul className="tff-bars">
        {bars.map((b) => (
          <li key={b.key} className="tff-bar">
            <span className="tff-bar-label">{likeLabel(t, b.key)}</span>
            <span className="tff-bar-track" aria-hidden="true"><span className="tff-bar-fill" style={{ transform: `scaleX(${b.pct / 100})` }} /></span>
            <span className="tff-bar-pct">{t('tf.why.pct', { pct: b.pct })}</span>
          </li>
        ))}
      </ul>
      {conflicts.length > 0 && (
        <ul className="tff-why-against">
          {conflicts.map((c) => (
            <li key={c.key}>
              <AlertIcon size={14} />
              <span>{c.key === 'heat'
                ? t('tf.why.heat', { month: monthName(c.month ?? trip.month, lang) })
                : factText({ key: `tf.catch.${c.key}`, facts: { place: c.place, month: c.month ?? trip.month } }, { t, lang })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The priced trip card (T798, DESIGN.md "Priced trip card"): the first
 * place's photo, the trip's name under it, country, nights and bases, the
 * match when it is set, the trip total a person in whole euros, the three
 * figures, the cost bar, what is in the total, the budget ruler, up to
 * three reasons and the catch, and the group total in the foot.
 *
 * Every figure is the trip's own (lib/recommend); nothing here adds up.
 *   onOpen(trip, el)   the receipt (T799), from the total or the card
 *   ui                 the app parts TripFlow hands down (see FindingTrips)
 *   compare            { ticked, refused, onToggle(id) }: the Compare tick
 *                      (T802); `refused` says the fifth tick was not taken
 *   keep               { kept, onKeep(trip), onSkip(trip) }: the heart that
 *                      keeps the trip in My trips, and Skip, which hides it
 *                      for these answers (T806)
 */
export const TripCard = forwardRef(function TripCard({ trip, destinations, marked = false, onOpen, ui, compare = null, keep = null }, ref) {
  const { t, lang } = useI18n();
  const [whyOpen, setWhyOpen] = useState(false);
  const whyId = useId();
  const tickId = useId();
  const name = tripName(trip, destinations, lang);
  const place = firstPlace(trip, destinations);
  const fig = threeFigures(trip);
  const ruler = budgetLine(trip, { locale: lang });
  const partial = totalLeavesOut(trip);
  const total = formatMoney(trip.total.perPerson, { locale: lang });
  const pct = trip.match?.pct;
  const many = trip.party.head + (trip.party.babies || 0) > 1;
  const bases = trip.places.length;
  return (
    <article className={`tff-card${marked ? ' is-marked' : ''}`} aria-label={name}>
      <HeroImage
        url={place?.image?.url}
        city={place?.city || trip.country}
        iso2={place?.iso2 || trip.iso2}
        className="tff-card-img"
        maxWidth={640}
        sizes="(max-width: 768px) 92vw, 300px"
        ratio={[3, 2]}
      />
      <div className="tff-card-body">
        <div className="tff-card-head">
          <h3 className="tff-card-name">{name}</h3>
          <p className="tff-card-meta">
            {t(bases === 1 ? 'tf.card.metaOne' : 'tf.card.meta', { country: trip.country, n: trip.nights, b: bases })}
          </p>
          {marked && <p className="tff-card-mark"><CheckIcon size={14} />{t('tf.card.planned')}</p>}
        </div>

        {pct != null && (
          <Button
            variant="quiet"
            size="sm"
            className="tff-match"
            aria-expanded={whyOpen}
            aria-controls={whyId}
            aria-label={t('tf.card.matchWhy', { pct })}
            onClick={() => setWhyOpen((v) => !v)}
          >
            {t('tf.card.match', { pct })}
          </Button>
        )}

        <Button
          variant="quiet"
          className="tff-total"
          ref={ref}
          aria-label={t(partial ? 'tf.card.openPartial' : 'tf.card.open', { name, price: total })}
          onClick={(e) => onOpen(trip, e.currentTarget)}
        >
          <span className="tff-total-eur money">{total}</span>
          <span className="tff-total-unit">{t(partial ? 'tf.card.unitPartial' : 'tf.card.unit')}</span>
        </Button>

        <dl className="tff-three">
          <div><dt>{t('tf.card.flight')}</dt><dd><Figure eur={fig.flight} lang={lang} ui={ui} /></dd></div>
          <div><dt>{t('tf.card.stay')}</dt><dd><Figure eur={fig.stay} lang={lang} ui={ui} /></dd></div>
          <div><dt>{t('tf.card.days')}</dt><dd><Figure eur={fig.days} lang={lang} ui={ui} /></dd></div>
        </dl>

        <TripBar trip={trip} t={t} lang={lang} />

        <ul className="tff-inc" aria-label={t('tf.card.inTotal')}>
          {inclusions(trip).map((x) => (
            <li key={x.id} className={`tff-inc-item is-${x.state}`}>
              {x.state === 'in' && <CheckIcon size={12} />}
              {t(`tf.inc.${x.state}`, { what: t(`tf.inc.${x.id}`) })}
            </li>
          ))}
        </ul>

        {ruler && (
          <div className={`tff-ruler${ruler.over ? ' is-over' : ''}`}>
            <span>{t(ruler.key, ruler.vars)}</span>
            <span className="tff-ruler-track" aria-hidden="true">
              <span className="tff-ruler-fill" style={{ transform: `scaleX(${ruler.fill})` }} />
              <span className="tff-ruler-mark" style={{ left: `${(ruler.over ? trip.budget.eur / trip.total.perPerson : 1) * 100}%` }} />
            </span>
          </div>
        )}

        {whyOpen && <WhyMatch trip={trip} t={t} lang={lang} id={whyId} />}

        {(trip.reasons.length > 0 || trip.catch) && (
          <ul className="tff-reasons">
            {trip.reasons.map((r, i) => (
              <li key={i} className="tff-reason"><CheckIcon size={12} /><span>{factText(r, { t, lang })}</span></li>
            ))}
            {trip.catch && (
              <li className="tff-reason is-catch"><AlertIcon size={14} /><span>{factText(trip.catch, { t, lang })}</span></li>
            )}
          </ul>
        )}

        {many && (
          <p className="tff-card-foot">
            <span>{t('tf.card.group', { n: trip.party.head + (trip.party.babies || 0) })}</span>
            <span className="money">{formatMoney(trip.total.group, { locale: lang })}</span>
          </p>
        )}

        {(keep || compare) && (
          <div className="tff-acts">
            {keep && (
              <Button
                variant="quiet"
                size="sm"
                className={`tff-keep${keep.kept ? ' is-kept' : ''}`}
                aria-pressed={keep.kept}
                aria-label={t('tf.keep.one', { name })}
                iconStart={<HeartIcon size={18} />}
                onClick={() => keep.onKeep(trip)}
              >
                {t(keep.kept ? 'tf.keep.kept' : 'tf.keep.keep')}
              </Button>
            )}
            {keep && (
              <Button variant="quiet" size="sm" className="tff-skip-one" aria-label={t('tf.keep.skipOne', { name })} onClick={() => keep.onSkip(trip)}>
                {t('tf.keep.skip')}
              </Button>
            )}
            {compare && (
              <div className="tff-tick">
                <input
                  type="checkbox"
                  id={tickId}
                  checked={compare.ticked}
                  aria-label={t('tf.cmp.tickOne', { name })}
                  aria-describedby={compare.refused ? `${tickId}-full` : undefined}
                  onChange={() => compare.onToggle(trip.id)}
                />
                <label htmlFor={tickId}>{t('tf.cmp.tick')}</label>
                {compare.refused && <p className="tff-tick-full" id={`${tickId}-full`} role="status">{t('tf.cmp.full', { n: 4 })}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
});
