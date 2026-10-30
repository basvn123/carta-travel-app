import React, { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, IconButton } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import { CarIcon, CheckIcon, HeartIcon, MoreIcon, PlaneIcon, ScaleIcon, SunIcon } from '../../components/Icons.jsx';
import { formatMoney } from '../../lib/money.js';
import { CROWD_KEYS } from '../../lib/recommend/compare.js';
import { monthName } from '../../lib/dates.js';
import { budgetBadge, cardFacts, countryLabel, factText, groupHead, shortDuration, stopsText, totalLeavesOut, tripName, tripPhotos } from './finderText.js';

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
 * The match as a ring (T879): an umber arc to the score on a white disc,
 * deep from 85, lighter below 70; the figure inside, the whole read as
 * "89% match" by a screen reader. Shared by the card and the trip page.
 */
export function MatchRing({ pct, label, className = '' }) {
  const band = pct >= 85 ? 'hi' : pct >= 70 ? 'mid' : 'lo';
  return (
    <span className={`tff-ring is-${band} ${className}`.trim()} role="img" aria-label={label}>
      <svg className="tff-ring-arc" viewBox="0 0 42 42" aria-hidden="true">
        <circle className="is-track" cx="21" cy="21" r="19" />
        <circle className="is-arc" cx="21" cy="21" r="19" pathLength="100" strokeDasharray={`${pct} 100`} />
      </svg>
      <b aria-hidden="true">{pct}<small>%</small></b>
    </span>
  );
}

/** The crowd level as four rising bars, the level's own filled (T879); the word beside it carries the meaning. */
function CrowdMeter({ tier }) {
  return (
    <span className={`tff-meter${tier >= 3 ? ' is-high' : ''}`} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => <i key={i} className={i <= tier ? 'is-on' : ''} />)}
    </span>
  );
}

/**
 * The priced trip card (T879, the free direction the owner chose on
 * 2026-10-30, over T869's layout A): the photo carries the name and the
 * country over a dark fade, the match as a ring and the heart; under it
 * the four facts that echo the answers (the month's highs, the time there
 * and its stops, the crowds), then the total for the group with the price
 * a person, and the budget as a thin bar. The top pick (`feat`) takes a
 * whole row and names up to two reasons on its photo; `best` marks the
 * cheapest whole total in the list. The reasons and the catch in full are
 * the trip's page.
 *
 * The whole card opens the trip: a click anywhere that is not one of its
 * own controls, and the name's link for a keyboard and a screen reader
 * (one accessible name). The heart and the small menu (Compare, Skip) do
 * their own thing and never open it.
 *
 *   onOpen(trip, el)   the trip; `el` (the name's link) gets focus back
 *   compare            { ticked, refused, full, onToggle(id) }: the Compare tick (T802)
 *   keep               { kept, onKeep(trip), onSkip(trip) }: the heart and Skip (T806)
 *   feat               the top pick: a whole row and its reasons on the photo
 *   best               the cheapest whole total in the list
 */
export const TripCard = forwardRef(function TripCard({ trip, destinations, marked = false, onOpen, compare = null, keep = null, feat = false, best = false }, ref) {
  const { t, lang } = useI18n();
  const openRef = useRef(null);
  const name = tripName(trip, destinations, lang);
  const partial = totalLeavesOut(trip);
  const head = groupHead(trip);
  const group = Number.isFinite(trip.total?.group) ? trip.total.group : trip.total?.perPerson;
  const total = Number.isFinite(group) ? formatMoney(group, { locale: lang }) : null;
  const pp = Number.isFinite(trip.total?.perPerson) ? formatMoney(trip.total.perPerson, { locale: lang }) : null;
  const unit = head > 1 && pp
    ? t(partial ? 'tf.card.ppPartial' : 'tf.card.ppAll', { eur: pp })
    : t(`tf.card.forYou${partial ? 'Partial' : ''}`);
  const pct = trip.match?.pct;
  const bases = trip.places.length;
  const country = countryLabel(trip, lang);
  const month = monthName(trip.month, lang);
  const f = cardFacts(trip, destinations);
  const time = shortDuration(t, f.minutes);
  const badge = budgetBadge(trip, { locale: lang });
  const used = trip.budget?.eur ? (trip.budget.eur + trip.budget.delta) / trip.budget.eur : null;
  const reasons = feat ? (trip.reasons || []).slice(0, 2).map((r) => factText(r, { t, lang })).filter(Boolean) : [];

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
  // name's own link opens it through its onClick).
  const onCardClick = (e) => {
    if (e.target.closest('button, a, input, label, [role="menu"]')) return;
    open();
  };
  const ticked = Boolean(compare?.ticked);

  return (
    // The click is the pointer's way in; the name's link is the keyboard's
    // and the screen reader's, so the article is no control.
    <article className={`tff-card${feat ? ' is-feat' : ''}${marked ? ' is-marked' : ''}${ticked ? ' is-ticked' : ''}`} onClick={onCardClick}>
      <div className="tff-card-media">
        <TripPhotos trip={trip} destinations={destinations} sizes={feat ? '(max-width: 599px) 92vw, (max-width: 1023px) 92vw, 640px' : '(max-width: 599px) 46vw, (max-width: 1023px) 31vw, 320px'} />
        {pct != null && <MatchRing pct={pct} label={t('tf.card.match', { pct })} />}
        {feat && <span className="tff-card-toplbl">{t('tf.card.top')}</span>}
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
        <div className="tff-card-ov">
          <h3 className="tff-card-name">
            {/* T870: the trip's page has its own address, so the name is a
                link to it (a new tab opens the page from the address). */}
            <a
              className="tff-card-open"
              href={`#tf=${encodeURIComponent(trip.id)}`}
              ref={setRefs}
              aria-label={t('tf.card.openTrip', { name, price: total || t('money.onRequest'), unit })}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
                e.preventDefault();
                open();
              }}
            >
              {name}
            </a>
          </h3>
          <p className="tff-card-where">
            {trip.iso2 && <CountryFlag country={trip.iso2} size={13} />}
            <span>{bases > 1 ? `${country}, ${t('tf.card.bases', { n: bases })}` : country}</span>
          </p>
          {reasons.length > 0 && (
            <ul className="tff-card-why">
              {reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
        </div>
      </div>

      <div className="tff-card-body">
        <ul className="tff-card-facts" aria-label={t('tf.card.facts')}>
          {f.high != null && month && (
            <li aria-label={t('tf.card.highs', { c: f.high, month })}><SunIcon size={14} className="is-sun" /><span aria-hidden="true">{f.high}°</span></li>
          )}
          {time && (
            <li aria-label={[t('tf.card.way', { time }), f.stops > 0 ? stopsText(t, f.stops) : ''].filter(Boolean).join(', ')}>
              {f.way === 'car' ? <CarIcon size={14} /> : <PlaneIcon size={14} />}
              <span aria-hidden="true">{time}{f.stops > 0 ? `, ${stopsText(t, f.stops)}` : ''}</span>
            </li>
          )}
          {f.crowd != null && CROWD_KEYS[f.crowd] && month && (
            <li className={f.crowd >= 3 ? 'is-warn' : ''} aria-label={t('tf.card.crowd', { month, level: t(CROWD_KEYS[f.crowd]) })}>
              <CrowdMeter tier={f.crowd} /><span aria-hidden="true">{t(CROWD_KEYS[f.crowd])}</span>
            </li>
          )}
        </ul>
        {best && <p className="tff-card-tags"><span className="tff-card-best">{t('tf.card.best')}</span></p>}
        <div className="tff-card-price">
          <p className="tff-card-total">
            {total ? <span className="tff-total-eur money">{total}</span> : <span className="tff-total-eur">{t('money.onRequest')}</span>}
            <span className="tff-total-unit">{unit}</span>
          </p>
          {(compare || keep?.onSkip) && (
            <CardMenu
              name={name}
              compare={compare ? { ...compare, onToggle: () => compare.onToggle(trip.id) } : null}
              onSkip={keep?.onSkip ? () => keep.onSkip(trip) : null}
            />
          )}
        </div>
        {badge && Number.isFinite(used) && (
          <div className={`tff-card-budget${badge.over ? ' is-over' : ''}`}>
            <span className="tff-card-bar" role="img" aria-label={t('tf.card.budget', { pct: Math.round(used * 100) })}>
              <i style={{ width: `${Math.min(100, Math.max(2, used * 100))}%` }} />
            </span>
            <span className="tff-card-budl">{t(badge.key, badge.vars)}</span>
          </div>
        )}
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
