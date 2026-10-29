import React, { forwardRef, useId, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, IconButton } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import { AlertIcon, BedIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, DiningIcon, HeartIcon, MapPinIcon, MoonIcon, PlaneIcon } from '../../components/Icons.jsx';
import { formatMoney } from '../../lib/money.js';
import { budgetBadge, factText, threeFigures, totalLeavesOut, tripName, tripPhotos } from './finderText.js';

/** A whole-euro figure, or NotYet when the data has none. */
function Figure({ eur, lang, ui }) {
  const { NotYet } = ui;
  return eur == null ? <NotYet /> : <span className="money">{formatMoney(eur, { locale: lang })}</span>;
}

/**
 * The trip's photos on a card (T810): one place's photo across the top, or
 * with several places the first large and the second beside it. A trip
 * whose places have no photo shows its country's best known one
 * (tripPhotos); only a country with none at all shows the flag-and-name
 * placeholder, never an empty box.
 */
export function TripPhotos({ trip, destinations, className = '', sizes = '(max-width: 768px) 92vw, 380px' }) {
  const photos = tripPhotos(trip, destinations).slice(0, 2);
  const lead = photos[0] || { url: null, city: trip.country, iso2: trip.iso2 };
  return (
    <div className={`tff-photos is-${Math.max(1, photos.length)} ${className}`.trim()}>
      <HeroImage url={lead.url} city={lead.city} iso2={lead.iso2} className="tff-photo" maxWidth={640} sizes={sizes} ratio={[3, 2]} />
      {photos[1] && (
        <HeroImage url={photos[1].url} city={photos[1].city} iso2={photos[1].iso2} className="tff-photo is-second" maxWidth={320} sizes="160px" ratio={[2, 3]} />
      )}
    </div>
  );
}

/**
 * The priced trip card (T798, rebuilt photo first in T810, owner
 * 2026-10-29: "too much information when there should be an image"): the
 * trip's photos with the heart and the match on them, the name, one line
 * of icon facts (country, nights, bases), the total a person with what it
 * leaves out, three icon figures (flight, stay, the days), the strongest
 * reason and the catch. The cost bar, the inclusions, the budget ruler and
 * the group total moved into the preview (T811).
 *
 * The whole card opens the preview: a click anywhere that is not one of
 * its own controls, and the name's button for a keyboard and a screen
 * reader (one accessible name). The heart, Compare and Skip do their own
 * thing and never open it.
 *
 *   onOpen(trip, el)   the preview; `el` (the name's button) gets focus back
 *   ui                 the app parts TripFlow hands down (see FindingTrips)
 *   compare            { ticked, refused, onToggle(id) }: the Compare tick (T802)
 *   keep               { kept, onKeep(trip), onSkip(trip) }: the heart and Skip (T806)
 */
export const TripCard = forwardRef(function TripCard({ trip, destinations, marked = false, onOpen, ui, compare = null, keep = null }, ref) {
  const { t, lang } = useI18n();
  const tickId = useId();
  const openRef = useRef(null);
  const name = tripName(trip, destinations, lang);
  const fig = threeFigures(trip);
  const badge = budgetBadge(trip, { locale: lang });
  const partial = totalLeavesOut(trip);
  const total = formatMoney(trip.total.perPerson, { locale: lang });
  const pct = trip.match?.pct;
  const bases = trip.places.length;
  const reason = trip.reasons[0] || null;
  const [costOpen, setCostOpen] = useState(false);
  const costId = useId();
  const group = trip.total?.group;
  const people = trip.party ? Math.max(1, (trip.party.adults || 0) + (trip.party.kids || trip.party.children || 0)) : null;

  const setRefs = (el) => {
    openRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  const open = () => {
    const el = openRef.current;
    // Focus first, so closing the preview returns here (useFocusTrap).
    el?.focus({ preventScroll: true });
    onOpen(trip, el);
  };
  // A click on the card opens it, unless it landed on a control (the
  // name's own button opens it through its onClick).
  const onCardClick = (e) => {
    if (e.target.closest('button, a, input, label')) return;
    open();
  };

  return (
    // The click is the pointer's way in; the name's button is the
    // keyboard's and the screen reader's, so the article is no control.
    <article className={`tff-card${marked ? ' is-marked' : ''}`} onClick={onCardClick}>
      <div className="tff-card-media">
        <TripPhotos trip={trip} destinations={destinations} />
        {pct != null && <span className="tff-card-pill">{t('tf.card.match', { pct })}</span>}
        {keep && (
          <IconButton
            tone="photo"
            className={`tff-card-heart${keep.kept ? ' is-kept' : ''}`}
            pressed={keep.kept}
            label={t('tf.keep.one', { name })}
            onClick={() => keep.onKeep(trip)}
          >
            <HeartIcon size={18} />
          </IconButton>
        )}
      </div>

      <div className="tff-card-body">
        <h3 className="tff-card-name">
          <Button
            variant="quiet"
            className="tff-card-open"
            ref={setRefs}
            aria-label={t(partial ? 'tf.card.openPartial' : 'tf.card.open', { name, price: total })}
            onClick={open}
          >
            {name}
          </Button>
        </h3>
        <p className="tff-card-meta">
          <span className="tff-meta-item">
            {trip.iso2 && <CountryFlag country={trip.iso2} size={13} />}
            {trip.country}
          </span>
          <span className="tff-meta-item"><MoonIcon size={14} />{t('tf.keep.nights', { n: trip.nights })}</span>
          <span className="tff-meta-item"><MapPinIcon size={14} />{t(bases === 1 ? 'tf.card.base1' : 'tf.card.bases', { n: bases })}</span>
        </p>
        {marked && <p className="tff-card-mark"><CheckIcon size={14} />{t('tf.card.planned')}</p>}

        {(reason || trip.catch) && (
          <ul className="tff-reasons">
            {reason && <li className="tff-reason"><CheckIcon size={12} /><span>{factText(reason, { t, lang })}</span></li>}
            {trip.catch && <li className="tff-reason is-catch"><AlertIcon size={14} /><span>{factText(trip.catch, { t, lang })}</span></li>}
          </ul>
        )}
      </div>

      {/* The price, Booking's way (T825, owner 2026-10-29): what the figure
          covers, the total a person large, the group's under it, the budget
          note, then the full cost on request and the one way in. */}
      <aside className="tff-card-price">
        <p className="tff-price-for">
          {[t('tf.keep.nights', { n: trip.nights }), people ? t(people === 1 ? 'receipt.onePerson' : 'receipt.nPeople', { n: people }) : ''].filter(Boolean).join(', ')}
        </p>
        <p className="tff-total">
          <span className="tff-total-eur money">{total}</span>
          <span className="tff-total-unit">{t('tf.card.person')}, {t(partial ? 'tf.card.noFlight' : 'tf.card.allIn')}</span>
        </p>
        {people > 1 && Number.isFinite(group) && (
          <p className="tff-total-group">{t('tf.card.group', { n: people })}: <span className="money">{formatMoney(group, { locale: lang })}</span></p>
        )}
        {badge && <span className={`tff-budget${badge.over ? ' is-over' : ''}`}>{t(badge.key, badge.vars)}</span>}
        <Button variant="quiet" size="sm" className="tff-cost-toggle" aria-expanded={costOpen} aria-controls={costId}
          onClick={() => setCostOpen((v) => !v)}
          iconEnd={<ChevronDownIcon size={16} className={costOpen ? 'plan-chev is-open' : 'plan-chev'} />}>
          {t('tf.card.fullCost')}
        </Button>
        <dl className="tff-three" id={costId} hidden={!costOpen}>
          <div>
            <dt><PlaneIcon size={16} /><span>{t('tf.card.flight')}</span></dt>
            <dd><Figure eur={fig.flight} lang={lang} ui={ui} /></dd>
          </div>
          <div>
            <dt><BedIcon size={16} /><span>{t('tf.card.stay')}</span></dt>
            <dd><Figure eur={fig.stay} lang={lang} ui={ui} /></dd>
          </div>
          <div>
            <dt><DiningIcon size={16} /><span>{t('tf.card.daysLong')}</span></dt>
            <dd><Figure eur={fig.days} lang={lang} ui={ui} /></dd>
          </div>
        </dl>
        <Button variant="primary" size="sm" className="tff-card-see" iconEnd={<ChevronRightIcon size={16} />} onClick={open}>
          {t('tf.card.see')}
        </Button>
      </aside>

      {(keep || compare) && (
        <div className="tff-card-foot">
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
          {keep && (
            <Button variant="quiet" size="sm" className="tff-skip-one" aria-label={t('tf.keep.skipOne', { name })} onClick={() => keep.onSkip(trip)}>
              {t('tf.keep.skip')}
            </Button>
          )}
        </div>
      )}
    </article>
  );
});
