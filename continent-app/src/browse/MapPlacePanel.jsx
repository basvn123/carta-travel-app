import React from 'react';
import { HeroImage } from '../components/HeroImage.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { Button, Money } from '../components/ui/index.js';
import { CostRow, CostSum } from '../components/ui/CostRow.jsx';
import { ArrowLeftIcon, CalendarIcon } from '../components/Icons.jsx';
import { useSettings } from '../components/SettingsLine.jsx';
import { isNational } from '../components/CostSummary.jsx';
import { useAirlines, airlineName } from '../lib/flights/useAirlines.js';
import { regionLine } from '../lib/placeOverview.js';
import { visitLength } from '../lib/nearby.js';
import { placeSights } from '../lib/placeStory.js';
import { knownFor } from '../lib/knownFor.js';
import { useI18n } from '../i18n/index.jsx';
import { PlaceOverview } from './PlaceOverview.jsx';
import { SaveButton } from './ExploreCards.jsx';
import '../styles/81-map-panel.css';

/**
 * MapPlacePanel (T592, owner decision 6 of 2026-10-22): Explore's map the
 * Kayak way. On a desktop it floats on the left over the map; on a phone it
 * is the body of the map drawer (`compact`).
 *
 * With no pick it lists the places on the map as the compact overview rows
 * (a row picks its place, it does not leave the map). With a pick it shows
 * the place: the photo with save, the name with the Score and its band word,
 * the flag with the region, then "Your trip" (the dates from the settings
 * line, the way there, the bed and the food and drink as icon rows, and one
 * total), the one action that opens the place, and a short why go with up
 * to three sights.
 *
 * Props
 *   rows        the places on the map (already capped by the caller)
 *   count       how many places the map holds (the heading's number, read
 *               by screen readers only since T603)
 *   picked      the picked place's row, or null
 *   overviewOf  (p) => { region, rating, reason }, the list's own wording
 *   onPick      (id) => void, a row picks its place
 *   onBack      () => void, back to the list
 *   onOpen      (id) => void, opens the place page
 *   favSet, onToggleFav
 *   compact     the phone drawer's body: no floating chrome
 */
export function MapPlacePanel({
  rows = [], count = 0, picked = null, overviewOf, onPick, onBack, onOpen,
  favSet = null, onToggleFav = null, compact = false, t,
}) {
  const rootRef = React.useRef(null);
  const headRef = React.useRef(null);
  const lastPick = React.useRef(null);
  const pickedId = picked ? picked.id : null;

  // A new pick starts the panel at its top, and when the reader was working
  // inside the panel the focus lands on the place's name; back on the list
  // it returns to the row that was open.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const inside = root.contains(document.activeElement) || document.activeElement === document.body;
    if (!compact) root.scrollTop = 0;
    if (pickedId) {
      lastPick.current = pickedId;
      if (inside) headRef.current?.focus({ preventScroll: true });
    } else if (lastPick.current && inside) {
      const hit = root.querySelector(`.xrow[data-id="${CSS.escape(lastPick.current)}"] .xrow-hit`);
      hit?.focus({ preventScroll: false });
    }
  }, [pickedId, compact]);

  const cls = `mpp${compact ? ' mpp--compact' : ' mpp--float'}${picked ? ' is-picked' : ''}`;
  return (
    <section ref={rootRef} className={cls}
      aria-label={picked ? picked.city : t('mapPanel.aria')}>
      {picked ? (
        <PickedPlace p={picked} ov={overviewOf(picked)} headRef={headRef} t={t}
          onBack={onBack} onOpen={() => onOpen(picked.id)}
          fav={favSet ? favSet.has(picked.id) : false} onToggleFav={onToggleFav}
          compact={compact} />
      ) : (
        <>
          {/* T603 (owner 2026-10-22: "Remove: 3045 places on the map"):
              the count stays as the list's heading for screen readers. */}
          <h2 className="mpp-count sr-only">
            {count === 1 ? t('mapPanel.inViewOne') : t('mapPanel.inView', { n: count })}
          </h2>
          {rows.length === 0 ? (
            <p className="mpp-empty">{t('mapPanel.empty')}</p>
          ) : (
            <div className="xrows mpp-rows">
              {rows.map((p) => (
                <PlaceOverview key={p.id} p={p} {...overviewOf(p)} t={t}
                  fav={favSet ? favSet.has(p.id) : false} onToggleFav={onToggleFav}
                  onOpen={() => onPick(p.id)}
                  hitProps={{ 'aria-label': t('mapPanel.show', { city: p.city }) }} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function PickedPlace({ p, ov, headRef, t, onBack, onOpen, fav, onToggleFav, compact }) {
  const where = regionLine(p, ov.region, t);
  const why = knownFor(p) || ov.reason || '';
  const sights = placeSights(p, 3);
  return (
    <div className="mpp-place">
      <div className="mpp-top">
        <Button variant="quiet" size="sm" iconStart={<ArrowLeftIcon size={16} />} onClick={onBack}>
          {t('mapPanel.back')}
        </Button>
      </div>
      <div className="mpp-media">
        <HeroImage url={p.image} city={p.city} iso2={p.iso2} className="mpp-img"
          maxWidth={800} sizes={compact ? '100vw' : '400px'} ratio={[4, 3]} />
        {onToggleFav && (
          <SaveButton fav={fav} onToggle={() => onToggleFav(p.id)} t={t} name={p.city}
            tone="photo" className="mpp-save" />
        )}
      </div>
      <div className="mpp-head">
        <h2 className="mpp-name" ref={headRef} tabIndex={-1}>{p.city}</h2>
        <ScoreChip rating={ov.rating || p.rating} size="lg" band />
      </div>
      <p className="mpp-where">
        <CountryFlag country={p.iso2} size={14} />
        <span>{where}</span>
      </p>

      <TripBox p={p} t={t} onOpen={onOpen} />

      {why && (
        <div className="mpp-why">
          <h3 className="mpp-sub">{t('mapPanel.whyGo')}</h3>
          <p className="mpp-why-text">{why}</p>
          {sights.length > 0 && (
            <p className="mpp-sights">
              <span className="mpp-sights-label">{t('mapPanel.sights')}</span>
              {' '}{sights.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function nightsBetween(a, b) {
  if (!a || !b) return 0;
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86400000)) : 0;
}

function useShortDate() {
  const { lang, languages } = useI18n();
  const bcp47 = languages.find((l) => l.code === lang)?.bcp47 || 'en-GB';
  return React.useCallback((iso, opts = { day: 'numeric', month: 'short' }) => {
    if (!iso) return '';
    const [y, m, d] = String(iso).split('-').map(Number);
    return new Intl.DateTimeFormat(bcp47, { ...opts, timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, m - 1, d || 1)));
  }, [bcp47]);
}

/** "Your trip": the one bordered object in the panel. */
function TripBox({ p, t, onOpen }) {
  const s = useSettings();
  const shortDate = useShortDate();
  const dateNights = nightsBetween(s?.departDate, s?.returnDate);
  const guess = visitLength(p);
  // The traveller's own length first; without dates, the length the place
  // is worth, said so.
  const nights = dateNights || (guess ? Math.max(1, Math.round(guess.n || guess.days || 1)) : 0);
  let when;
  if (s?.dateFlex === 'any') when = t('dates.any');
  else if (s?.dateFlex === 'month' && s?.departDate) when = shortDate(s.departDate, { month: 'long', year: 'numeric' });
  else if (s?.departDate && s?.returnDate) {
    when = t('mapPanel.dates', { start: shortDate(s.departDate), end: shortDate(s.returnDate) });
  } else when = t('mapPanel.noDates');
  const nightsWord = nights === 1 ? t('mapPanel.nightsOne') : t('mapPanel.nights', { n: nights });
  return (
    <div className="mpp-trip">
      <h3 className="mpp-sub">{t('mapPanel.yourTrip')}</h3>
      <p className="mpp-when">
        <CalendarIcon size={16} className="mpp-when-icon" />
        <span>{when}</span>
        {nights > 0 && (
          <span className="mpp-when-n">
            {dateNights ? nightsWord : t('mapPanel.pricedFor', { n: nights })}
          </span>
        )}
      </p>
      <TripParts cost={p.cost} nights={nights} t={t} />
      <Button variant="primary" block onClick={onOpen} className="mpp-open">
        {t('mapPanel.open', { city: p.city })}
      </Button>
    </div>
  );
}

/*
 * The trip's parts for the nights asked: the way there (Google Flights with
 * the airline for a flight), the bed and the food and drink, one total, all a
 * person; an estimate carries the tilde alone. Kept apart from the per-day
 * PriceParts on purpose: the panel prices the stay, the card prices a day.
 * Open (T592-a): take the total from priceTrip() as budgetSearch.js does.
 */
function TripParts({ cost, nights, t }) {
  const airlines = useAirlines();
  if (!cost) return null;
  const way = cost.way && cost.way.perPerson > 0 ? cost.way : null;
  const n = nights > 0 ? nights : 0;
  const stayEst = cost.stayLevel !== 'city';
  const foodEst = cost.foodLevel !== 'city';
  const wayEst = way ? way.mode !== 'plane' : false;
  const rows = [];
  if (way) {
    const plane = way.mode === 'plane';
    const sub = plane
      ? (way.airline
        ? t('mapPanel.flightFrom', { airline: airlineName(airlines, way.airline) })
        : t('mapPanel.flightSource'))
      : (way.hours > 0 ? t('mapPanel.hours', { h: Math.round(way.hours * 10) / 10 }) : t('mapPanel.return'));
    rows.push(
      <CostRow key="way" kind={plane ? 'flight' : way.mode}
        label={plane ? t('flight.flightLine') : t(`way.${way.mode}`)} sub={sub}
        value={<Money value={way.perPerson} est={wayEst} />} />,
    );
  }
  if (cost.stayEur != null) {
    rows.push(
      <CostRow key="bed" kind="bed" label={t('cost.bed')}
        sub={n ? (n === 1 ? t('mapPanel.nightsOne') : t('mapPanel.nights', { n })) : t('mapPanel.aNight')}
        value={<Money value={cost.stayEur * (n || 1)} est={stayEst} />} />,
    );
  }
  if (cost.foodEur != null) {
    rows.push(
      <CostRow key="food" kind="food" label={t('cost.food')}
        sub={n ? (n === 1 ? t('mapPanel.daysOne') : t('mapPanel.days', { n })) : t('mapPanel.aDay')}
        value={<Money value={cost.foodEur * (n || 1)} est={foodEst} />} />,
    );
  }
  if (!rows.length) return null;
  const day = cost.dayEur != null ? cost.dayEur : null;
  const total = n && day != null ? day * n + (way ? way.perPerson : 0) : null;
  return (
    <dl className="costrows mpp-parts">
      {rows}
      {total != null ? (
        <CostSum label={t('mapPanel.total')} live={false}
          value={<Money value={total} est={isNational(cost) || wayEst} />}
          each={t('mapPanel.aPerson')} />
      ) : day != null && (
        <CostSum label={t('cost.dayTotal')} live={false}
          value={<Money value={day} est={isNational(cost)} />} />
      )}
    </dl>
  );
}
