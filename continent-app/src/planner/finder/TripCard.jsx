import React, { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, IconButton } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import { CheckIcon, HeartIcon, MapPinIcon, MoonIcon, MoreIcon, ScaleIcon } from '../../components/Icons.jsx';
import { formatMoney } from '../../lib/money.js';
import { cardLine, groupHead, totalLeavesOut, tripName, tripPhotos } from './finderText.js';

/**
 * The trip's photo on a card (T810, one photo since T869): the first
 * place's own photo, else its country's best known one (tripPhotos); only
 * a country with none at all shows the flag-and-name placeholder, never an
 * empty box.
 */
export function TripPhotos({ trip, destinations, className = '', sizes = '(max-width: 599px) 92vw, (max-width: 1023px) 46vw, 380px' }) {
  const lead = tripPhotos(trip, destinations)[0] || { url: null, city: trip.country, iso2: trip.iso2 };
  return (
    <div className={`tff-photos ${className}`.trim()}>
      <HeroImage url={lead.url} city={lead.city} iso2={lead.iso2} className="tff-photo" maxWidth={640} sizes={sizes} ratio={[3, 2]} />
    </div>
  );
}

/**
 * The card's small menu (T869): Compare (a tick, up to four) and Skip for
 * these answers. Escape, a tap outside or tabbing out closes it; Escape
 * gives focus back to the button. The arrow keys move between the items.
 */
function CardMenu({ name, compare, onSkip }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const btnRef = useRef(null);
  const menuId = useId();
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  };
  useEffect(() => {
    if (!open) return undefined;
    boxRef.current?.querySelector('[role^="menuitem"]')?.focus();
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) close(false); };
    // Capture phase, and the key stops here: App keeps its own Escape stack.
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  const onMenuKey = (e) => {
    const items = [...boxRef.current.querySelectorAll('[role^="menuitem"]')];
    const i = items.indexOf(document.activeElement);
    let next = null;
    if (e.key === 'ArrowDown') next = items[(i + 1) % items.length];
    else if (e.key === 'ArrowUp') next = items[(i - 1 + items.length) % items.length];
    if (next) { e.preventDefault(); next.focus(); }
  };
  const label = t('tf.card.more', { name });
  const full = compare && compare.refused;
  return (
    <div className="tff-card-more" ref={boxRef}
      onBlur={(e) => { if (open && !boxRef.current?.contains(e.relatedTarget)) close(false); }}>
      <IconButton ref={btnRef} label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : setOpen(true))}>
        <MoreIcon size={18} />
      </IconButton>
      {open && (
        <div className="tff-card-pop" role="menu" id={menuId} aria-label={label} onKeyDown={onMenuKey}>
          {compare && (
            <Button variant="quiet" role="menuitemcheckbox" aria-checked={compare.ticked} className="tff-card-item"
              iconStart={<ScaleIcon size={16} />} iconEnd={compare.ticked ? <CheckIcon size={16} /> : null}
              onClick={() => { const was = compare.ticked; compare.onToggle(); if (was || !compare.full) close(); }}>
              {t('tf.cmp.tick')}
            </Button>
          )}
          {onSkip && (
            <Button variant="quiet" role="menuitem" className="tff-card-item"
              onClick={() => { close(false); onSkip(); }}>
              {t('tf.keep.skipFor')}
            </Button>
          )}
          {full && <p className="tff-card-full" role="status">{t('tf.cmp.full', { n: 4 })}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * The priced trip card (T798, photo first in T810, the gallery card in
 * T869, owner's layout A 2026-10-29): the photo with the match and the
 * heart on it; the name; one line of country, nights and bases; the
 * strongest reason and the catch in one line; the trip's total for the
 * group in whole euros. The cost split, the budget ruler and the receipt
 * are the trip's own page (today TripPreview, Batch F's page next).
 *
 * The whole card opens the trip: a click anywhere that is not one of its
 * own controls, and the name's button for a keyboard and a screen reader
 * (one accessible name). The heart and the small menu (Compare, Skip) do
 * their own thing and never open it.
 *
 *   onOpen(trip, el)   the trip; `el` (the name's button) gets focus back
 *   ui                 the app parts TripFlow hands down (see FindingTrips)
 *   compare            { ticked, refused, full, onToggle(id) }: the Compare tick (T802)
 *   keep               { kept, onKeep(trip), onSkip(trip) }: the heart and Skip (T806)
 */
export const TripCard = forwardRef(function TripCard({ trip, destinations, marked = false, onOpen, compare = null, keep = null }, ref) {
  const { t, lang } = useI18n();
  const openRef = useRef(null);
  const name = tripName(trip, destinations, lang);
  const partial = totalLeavesOut(trip);
  const head = groupHead(trip);
  const group = Number.isFinite(trip.total?.group) ? trip.total.group : trip.total?.perPerson;
  const total = Number.isFinite(group) ? formatMoney(group, { locale: lang }) : null;
  const unit = t(`tf.card.${head === 1 ? 'forYou' : 'forN'}${partial ? 'Partial' : ''}`, { n: head });
  const pct = trip.match?.pct;
  const bases = trip.places.length;
  const { reason, caught } = cardLine(trip, { t, lang });

  const setRefs = (el) => {
    openRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  const open = () => {
    const el = openRef.current;
    // Focus first, so closing the trip returns here (useFocusTrap).
    el?.focus({ preventScroll: true });
    onOpen(trip, el);
  };
  // A click on the card opens it, unless it landed on a control (the
  // name's own button opens it through its onClick).
  const onCardClick = (e) => {
    if (e.target.closest('button, a, input, label, [role="menu"]')) return;
    open();
  };
  const ticked = Boolean(compare?.ticked);

  return (
    // The click is the pointer's way in; the name's button is the
    // keyboard's and the screen reader's, so the article is no control.
    <article className={`tff-card${marked ? ' is-marked' : ''}${ticked ? ' is-ticked' : ''}`} onClick={onCardClick}>
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
        <div className="tff-card-top">
          <h3 className="tff-card-name">
            <Button
              variant="quiet"
              className="tff-card-open"
              ref={setRefs}
              aria-label={t('tf.card.openTrip', { name, price: total || t('money.onRequest'), unit })}
              onClick={open}
            >
              {name}
            </Button>
          </h3>
          {(compare || keep?.onSkip) && (
            <CardMenu
              name={name}
              compare={compare ? { ...compare, onToggle: () => compare.onToggle(trip.id) } : null}
              onSkip={keep?.onSkip ? () => keep.onSkip(trip) : null}
            />
          )}
        </div>
        <p className="tff-card-meta">
          <span className="tff-meta-item">
            {trip.iso2 && <CountryFlag country={trip.iso2} size={13} />}
            {trip.country}
          </span>
          <span className="tff-meta-item"><MoonIcon size={14} />{t('tf.keep.nights', { n: trip.nights })}</span>
          <span className="tff-meta-item"><MapPinIcon size={14} />{t(bases === 1 ? 'tf.card.base1' : 'tf.card.bases', { n: bases })}</span>
        </p>
        {(reason || caught) && (
          <p className="tff-card-line">
            {reason && <span className="tff-card-reason">{t('tf.card.sentence', { text: reason })}</span>}
            {reason && caught && ' '}
            {caught && <span className="tff-card-catch">{t('tf.card.sentence', { text: caught })}</span>}
          </p>
        )}
        <p className="tff-card-total">
          {total ? <span className="tff-total-eur money">{total}</span> : <span className="tff-total-eur">{t('money.onRequest')}</span>}
          <span className="tff-total-unit">{unit}</span>
        </p>
        {(marked || ticked) && (
          <p className="tff-card-marks">
            {marked && <span className="tff-card-mark"><CheckIcon size={14} />{t('tf.card.planned')}</span>}
            {ticked && <span className="tff-card-mark"><CheckIcon size={14} />{t('tf.card.comparing')}</span>}
          </p>
        )}
      </div>
    </article>
  );
});
