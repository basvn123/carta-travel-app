import React from 'react';
import './TripSummary.css';
import { useI18n } from '../i18n/index.jsx';
import { Button, Money } from '../components/ui/index.js';
import {
  ArrowLeftIcon, BedIcon, CalendarIcon, CarIcon, FerryIcon, HomeIcon, MoonIcon, PersonIcon, PencilIcon,
  TrainIcon, BusIcon, SparkIcon, ChevronRightIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import NotYet from '../components/NotYet.jsx';
import { AirlineMark } from '../components/flights/Flights.jsx';
import { useAirlines, airlineName } from '../lib/flights/useAirlines.js';
import { TRAVEL_MODE_LABEL } from '../lib/transportLinks.js';
import { fmtDate } from '../lib/dates.js';
import { formatMoney } from '../lib/money.js';
import { nightsBetween } from '../lib/tripDates.js';
import { partyText } from '../lib/party.js';
import { cityLabel } from '../lib/placeName.js';

const WAY_ICON = { fly: PlaneIcon, train: TrainIcon, bus: BusIcon, car: CarIcon, ferry: FerryIcon };

/**
 * The trip's head (T814): its photos, its name, the dates and the people,
 * shared by the summary and by the trip page before a route (TripHome), so
 * both read as one trip page. `photos` may be empty: then no strip.
 */
export function TripHead({ name, photos = [], dates = '', people = '', nights = '', titleTag = 'h1', titleRef = null, actions = null }) {
  const Title = titleTag;
  const { t } = useI18n();
  const shown = photos.slice(0, 3);
  return (
    <header className="ts-head">
      {shown.length > 0 && (
        <div className={`ts-strip is-${shown.length}`}>
          {shown.map((p, i) => (
            <HeroImage key={`${p.city}-${i}`} url={p.url} city={p.city} className="ts-strip-img" ratio={i === 0 ? [4, 3] : [1, 1]} maxWidth={i === 0 ? 720 : 360} eager={i === 0} />
          ))}
        </div>
      )}
      <div className="ts-name-row">
        <Title className="pf-title ts-name" tabIndex={-1} ref={titleRef}>{name}</Title>
        {actions && <span className="ts-bar">{actions}</span>}
      </div>
      <ul className="ts-facts">
        <li>
          <CalendarIcon size={16} />
          <span className="sr-only">{t('wizard.summaryDates')}: </span>
          <span>{dates || t('pf.when.unsure')}</span>
        </li>
        {nights && (
          <li>
            <MoonIcon size={16} />
            <span>{nights}</span>
          </li>
        )}
        {people && (
          <li>
            <PersonIcon size={16} />
            <span className="sr-only">{t('settings.party')}: </span>
            <span>{people}</span>
          </li>
        )}
      </ul>
    </header>
  );
}

/**
 * The trip summary (T814, owner 2026-10-29): what a planned trip lands on
 * after Finish and whenever it is opened from Plan. One white card on the
 * warm paper: the photos of its stops, the name, the dates, the people, the
 * route as a timeline (home, the way there, every stop with its nights and
 * its bed, the way home) and the planner's own total, a person and for the
 * group (read from quoteTrip()'s output, never summed here). The details
 * live behind See trip details, today's full trip page.
 *
 *   onDetails()    the full trip page
 *   onPlanDays()   the day questions (DaysPrompt without its yes or no); absent hides it
 *   onEdit()       the stop editor, as Edit stops on the full page
 *   onPlanHome()   back to the Plan home ("All trips"); absent hides it
 *   bar            round buttons beside the trip's name (save, settings)
 */
export function TripSummary({
  name, tripStart, tripEnd, party, stopDetails, stayCosts = [], stayTier = 'home',
  priced, flight = null, ownFlight = null, driveLegs = null, origin = '',
  onDetails, onPlanDays = null, onEdit, onPlanHome = null, bar = null,
}) {
  const { t, lang } = useI18n();
  const airlines = useAirlines();
  const people = partyText(t, party);
  const n = Math.max(1, (party.adults || 0) + (party.children || 0) + (party.babies || 0));
  const dates = tripStart && tripEnd
    ? t('plan.dateRange', { a: fmtDate(tripStart, true), b: fmtDate(tripEnd, true) })
    : '';
  // The stops' nights against the dates (T815): said only when they differ.
  const planned = stopDetails.reduce((x, s) => x + (s.nights || 0), 0);
  const windowN = nightsBetween(tripStart, tripEnd);
  const nightsNote = windowN > 0 && planned !== windowN ? t('pf.home.nightsPlanned', { x: planned, n: windowN }) : '';
  const photos = stopDetails
    .filter((s) => s.dest?.image?.url)
    .map((s) => ({ url: s.dest.image.url, city: cityLabel(s.dest.city) }));

  // The way there and home, each in one row: Carta's flight (airline,
  // times), the traveller's own (paid or named), the drive, or not known yet.
  const split = ownFlight && (ownFlight.costOut != null || ownFlight.costBack != null);
  const paid = {
    out: ownFlight ? (split ? Number(ownFlight.costOut) || 0 : Number(ownFlight.costTotal) || 0) : 0,
    back: ownFlight && split ? Number(ownFlight.costBack) || 0 : 0,
  };
  const way = (dir) => {
    const date = dir === 'out' ? tripStart : tripEnd;
    const title = t(dir === 'out' ? 'itin.secGetThere' : 'itin.secGetHome');
    if (flight?.driving) {
      const d = dir === 'out' ? driveLegs?.out : driveLegs?.home;
      return { Icon: CarIcon, title, line: t('trip.modeCar'), sub: d ? t('trip.sum.km', { km: Math.round(d.road_km) }) : '', date };
    }
    const leg = priced?.cartaFlight?.[dir] || null;
    if (leg && !(paid[dir] > 0)) {
      return {
        Icon: PlaneIcon, title, mark: leg.airline,
        line: airlineName(airlines, leg.airline) || t('trip.modeFly'),
        sub: t('flight.times', { dep: leg.dep, arr: leg.arr }), date: leg.date || date,
      };
    }
    if (flight?.own || paid[dir] > 0) {
      const mode = flight?.mode || ownFlight?.mode || 'fly';
      const who = (flight?.airline || ownFlight?.airline || '').trim();
      return { Icon: WAY_ICON[mode] || PlaneIcon, title, line: who || t(TRAVEL_MODE_LABEL[mode] || 'trip.modeFly'), sub: t('trip.sum.yourOwn'), date };
    }
    return { Icon: PlaneIcon, title, line: t('trip.modeFly'), notYet: true, date };
  };

  const renderWay = (dir) => {
    const w = way(dir);
    const { Icon } = w;
    return (
      <li className="ts-node is-way" key={`way-${dir}`}>
        <span className="ts-dot" aria-hidden="true"><Icon size={18} /></span>
        <div className="ts-node-main">
          <span className="ts-node-label">{w.title}</span>
          <span className="ts-node-title">
            {w.mark && <AirlineMark code={w.mark} size="sm" />}
            {w.line}
          </span>
          <span className="ts-node-sub">
            {w.notYet ? <NotYet /> : [w.sub, w.date ? fmtDate(w.date, true) : ''].filter(Boolean).join(', ')}
          </span>
        </div>
      </li>
    );
  };

  const total = priced?.grandTotal;
  const perPerson = priced?.perPerson;

  return (
    <div className="ts">
      {onPlanHome && (
        <div className="ts-top">
          <Button variant="quiet" size="sm" className="ts-back" iconStart={<ArrowLeftIcon size={18} />} onClick={onPlanHome}>
            {t('trip.sum.allTrips')}
          </Button>
        </div>
      )}
      <TripHead name={name || t('itin.myTrip')} photos={photos} dates={dates} nights={nightsNote} people={people} actions={bar} />

      <div className="ts-body">
        <aside className="ts-side">
          <div className="ts-total" data-testid="ts-total">
            <span className="ts-total-lbl">{t('receipt.total', { people: n === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n }) })}</span>
            <span className="ts-total-n" data-total={Number.isFinite(total) ? String(total) : ''}>
              {Number.isFinite(total) ? <Money value={total} est precision="cents" /> : <NotYet />}
            </span>
            {n > 1 && Number.isFinite(perPerson) && (
              <span className="ts-total-pp">{t('plan.aPerson', { price: formatMoney(perPerson, { precision: 'cents', locale: lang }) })}</span>
            )}
          </div>
          <div className="ts-actions">
            <Button variant="primary" block className="ts-details" iconEnd={<ChevronRightIcon size={18} />} onClick={onDetails}>
              {t('trip.sum.seeDetails')}
            </Button>
            {onPlanDays && (
              <Button variant="secondary" block className="ts-days" iconStart={<SparkIcon size={16} />} onClick={onPlanDays}>
                {t('trip.planYourDays')}
              </Button>
            )}
            <Button variant="quiet" block className="ts-edit" iconStart={<PencilIcon size={16} />} onClick={onEdit}>
              {t('trip.sum.edit')}
            </Button>
          </div>
        </aside>
        <section className="ts-route-wrap" aria-labelledby="ts-route-h">
          <h2 className="sr-only" id="ts-route-h">{t('plan.yourRoute')}</h2>
          <ol className="ts-route">
            <li className="ts-node is-home">
              <span className="ts-dot" aria-hidden="true"><HomeIcon size={18} /></span>
              <div className="ts-node-main">
                <span className="ts-node-title">{origin || t('trip.sum.home')}</span>
                <span className="ts-node-sub">{tripStart ? fmtDate(tripStart, true) : <NotYet />}</span>
              </div>
            </li>
            {renderWay('out')}
            {stopDetails.map((s, i) => {
              const city = cityLabel(s.dest?.city || '') || t('itin.unknown');
              const own = stayCosts[i]?.ownAccom;
              return (
                <li className="ts-node is-stop" key={`${s.destinationId}-${i}`}>
                  <span className="ts-thumb" aria-hidden="true">
                    <HeroImage url={s.dest?.image?.url} city={city} iso2={s.dest?.iso2} className="ts-thumb-img" ratio={[1, 1]} maxWidth={160} />
                  </span>
                  <div className="ts-node-main">
                    <span className="ts-node-title">{city}</span>
                    <span className="ts-node-sub ts-node-facts">
                      <span><MoonIcon size={14} /> {t(s.nights === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n: s.nights })}</span>
                      {s.arriveDate && (
                        <span><CalendarIcon size={14} /> {t('plan.dateRange', { a: fmtDate(s.arriveDate, true), b: fmtDate(s.departDate, true) })}</span>
                      )}
                      <span><BedIcon size={14} /> {own ? t('trip.sum.ownStay') : t(`stay.${stayTier || 'home'}`)}</span>
                    </span>
                  </div>
                </li>
              );
            })}
            {renderWay('back')}
            <li className="ts-node is-home is-end">
              <span className="ts-dot" aria-hidden="true"><HomeIcon size={18} /></span>
              <div className="ts-node-main">
                <span className="ts-node-title">{origin || t('trip.sum.home')}</span>
                <span className="ts-node-sub">{tripEnd ? fmtDate(tripEnd, true) : <NotYet />}</span>
              </div>
            </li>
          </ol>
        </section>

      </div>
    </div>
  );
}

