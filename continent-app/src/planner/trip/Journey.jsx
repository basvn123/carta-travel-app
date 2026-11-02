import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip, Money } from '../../components/ui/index.js';
import NotYet from '../../components/NotYet.jsx';
import { BusIcon, CarIcon, ExternalIcon, FerryIcon, HomeIcon, PencilIcon, TrainIcon } from '../../components/Icons.jsx';
import { PlaneIcon } from '../../components/TransportIcons.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { AirlineMark } from '../../components/flights/Flights.jsx';
import { useAirlines, airlineName } from '../../lib/flights/useAirlines.js';
import { TRAVEL_MODE_LABEL } from '../../lib/transportLinks.js';
import { formatMoney } from '../../lib/money.js';
import { activeLocale } from '../../lib/localeState.js';
import { cityLabel } from '../../lib/placeName.js';

const WAY_ICON = { fly: PlaneIcon, train: TrainIcon, bus: BusIcon, car: CarIcon, ferry: FerryIcon };
const HOP_ICON = { train: TrainIcon, bus: BusIcon, ferry: FerryIcon, fly: PlaneIcon };

/** '20:50' -> 1250 minutes, or null. */
const clock = (x) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(x || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** The day stamp on the rail: weekday, the day large, the month. */
function Stamp({ iso }) {
  if (!iso) return <span className="jr-stamp is-empty" aria-hidden="true" />;
  const d = new Date(`${iso}T00:00:00Z`);
  const loc = activeLocale() || 'en-GB';
  const part = (o) => {
    try { return new Intl.DateTimeFormat(loc.startsWith('en') ? 'en-GB' : loc, { ...o, timeZone: 'UTC' }).format(d); } catch { return ''; }
  };
  return (
    <span className="jr-stamp" aria-hidden="true">
      <span className="jr-stamp-wd">{part({ weekday: 'short' })}</span>
      <span className="jr-stamp-d">{d.getUTCDate()}</span>
      <span className="jr-stamp-m">{part({ month: 'short' })}</span>
    </span>
  );
}

/**
 * Your route as a journey (T1005, owner 2026-11-02: "completely reorganised
 * and redesigned, clean and professional like the flight passes; change the
 * flights and everything changes in real time"). Replaces T819's node list.
 *
 * A rail of day stamps down the left; beside each, the part of the trip that
 * starts that day as a card in the passes' family:
 *
 *   home    where the trip starts and ends, one quiet line
 *   flight  the airline, Change flight (the flight sheet: the page reprices
 *           as soon as another flight is picked), the two airports large
 *           with their times and the plane between them
 *   stay    the town's photograph, its nights and bed, check-in and out
 *   hop     the two towns, the mode between them
 *
 * Every card that is booked somewhere ends in one row: To book or Booked,
 * the figure, and Book (T1006: compact; what was paid goes in from the
 * section's Add what you paid).
 *
 *   rows             bookRows() output (the links, the paid fields, booked)
 *   onChangeFlight   (dir) the flight sheet, or null
 */
export function Journey({
  tripStart, tripEnd, stopDetails, stayCosts, stayTier, priced, flight, ownFlight, driveLegs, origin, div,
  carTip = null, rows = [], onCar = null, carDelta = null, onChangeFlight = null,
}) {
  const { t, lang } = useI18n();
  const airlines = useAirlines();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const money = (eur) => (Number.isFinite(eur) && eur > 0 ? <Money value={eur / div} est precision="whole" /> : null);

  const split = ownFlight && (ownFlight.costOut != null || ownFlight.costBack != null);
  const paid = {
    out: ownFlight ? (split ? Number(ownFlight.costOut) || 0 : Number(ownFlight.costTotal) || 0) : 0,
    back: ownFlight && split ? Number(ownFlight.costBack) || 0 : 0,
  };

  // T1006 (owner: "more compact, the Find on link placed more cleanly"):
  // one row, where it stands, the figure, then Book out to the operator
  // (named for screen readers as the link it is: "Find on Google Flights").
  // What was paid goes in from the section's own Add what you paid.
  const Foot = ({ row, fig, figNote = '' }) => (
    <div className="jr-foot">
      <span className="jr-status">
        {row?.booked
          ? <Chip kind="status" tone="positive" className="ts-booked">{t('pf.doors.bookedMark')}</Chip>
          : row?.link && <Chip kind="status" tone="neutral" className="ts-tobook">{t('tp.toBook')}</Chip>}
      </span>
      <span className="jr-fig">
        {fig}
        {fig && (row?.yours ? <small>{t('plan.yours')}</small> : figNote && <small>{figNote}</small>)}
      </span>
      {!row?.booked && row?.link && (
        <a className="btn btn-secondary btn-sm jr-book" href={row.link.href} target="_blank" rel="noreferrer noopener" aria-label={row.link.label}>
          <span className="btn-label">{t('tp.book')}</span>
          <ExternalIcon size={13} />
        </a>
      )}
    </div>
  );

  const Way = ({ dir }) => {
    const date = dir === 'out' ? tripStart : tripEnd;
    const title = t(dir === 'out' ? 'itin.secGetThere' : 'itin.secGetHome');
    const row = byKey.get(`flight-${dir}`);
    if (flight?.driving) {
      const d = dir === 'out' ? driveLegs?.out : driveLegs?.home;
      return (
        <li className="jr-step is-way">
          <Stamp iso={date} />
          <article className="jr-card">
            <div className="jr-head">
              <span className="jr-brand"><span className="jr-glyph"><CarIcon size={16} /></span>{title}</span>
              {d && <span className="jr-meta">{t('trip.sum.km', { km: Math.round(d.road_km) })}</span>}
            </div>
            <Foot row={row} fig={money(d?.ground_total)} />
          </article>
        </li>
      );
    }
    const leg = priced?.cartaFlight?.[dir] || null;
    const own = flight?.own || paid[dir] > 0;
    const ends = leg ? [leg.from, leg.to]
      : flight?.combinable ? (dir === 'out' ? [flight.origin, flight.into_anchor] : [flight.out_anchor, flight.origin]) : [];
    const day = leg?.date || date;
    // T887: an arrival before the departure's clock time is the next day.
    const overnight = leg && clock(leg.arr) != null && clock(leg.dep) != null && clock(leg.arr) < clock(leg.dep);
    const arr = leg?.arr ? (overnight ? `${leg.arr} +1` : leg.arr) : '';
    const mode = own ? (flight?.mode || ownFlight?.mode || 'fly') : 'fly';
    const Icon = WAY_ICON[mode] || PlaneIcon;
    const who = own ? ((flight?.airline || ownFlight?.airline || '').trim() || t(TRAVEL_MODE_LABEL[mode] || 'trip.modeFly'))
      : leg ? (airlineName(airlines, leg.airline) || leg.airline) : t('trip.modeFly');
    const stops = leg && leg.stops > 0 ? (leg.stops === 1 ? t('flight.stop1') : t('flight.stops', { n: leg.stops })) : (leg ? t('flight.direct') : '');
    const eur = paid[dir] > 0 ? paid[dir] : leg ? (leg.cost?.total ?? null) : (dir === 'out' && own && !split ? (flight?.cost_total || null) : null);
    const canChange = onChangeFlight && leg && !own;
    return (
      <li className="jr-step is-way">
        <Stamp iso={day} />
        <article className="jr-card is-flight" aria-label={[title, ends.filter(Boolean).join(' '), who].filter(Boolean).join(', ')}>
          <div className="jr-head">
            <span className="jr-brand">
              {leg?.airline && !own ? <AirlineMark code={leg.airline} size="sm" /> : <span className="jr-glyph"><Icon size={16} /></span>}
              <span className="jr-name">{who}</span>
            </span>
            {canChange && (
              <Button variant="secondary" size="sm" className="jr-change" iconStart={<PencilIcon size={14} />} onClick={() => onChangeFlight(dir)}>
                {t('tp.fl.change')}
              </Button>
            )}
          </div>
          {ends[0] && ends[1] ? (
            <div className="jr-ends">
              <span className="jr-end">
                <span className="jr-code">{ends[0]}</span>
                <span className="jr-time">{leg?.dep || ' '}</span>
              </span>
              <span className="jr-line">
                <Icon size={14} aria-hidden="true" />
                {stops && <span className="jr-line-note">{stops}</span>}
              </span>
              <span className="jr-end is-to">
                <span className="jr-code">{ends[1]}</span>
                <span className="jr-time">{arr || ' '}</span>
              </span>
            </div>
          ) : null}
          {!leg && !own && <p className="jr-none"><NotYet /></p>}
          <Foot row={row} fig={money(eur)} />
        </article>
      </li>
    );
  };

  const Home = ({ end = false }) => (
    <li className={`jr-step is-home${end ? ' is-end' : ''}`}>
      {/* The flight beside it carries the day; home is a mark on the rail. */}
      <span className="jr-stamp is-empty" aria-hidden="true" />
      <div className="jr-home">
        <span className="jr-home-mark" aria-hidden="true"><HomeIcon size={16} /></span>
        <span className="jr-home-name">{origin || t('trip.sum.home')}</span>
      </div>
    </li>
  );

  return (
    <ol className="jr">
      <Home />
      <Way dir="out" />
      {stopDetails.map((s, i) => {
        const city = cityLabel(s.dest?.city || '') || t('itin.unknown');
        const sc = stayCosts[i];
        const row = byKey.get(`stay-${i}`);
        const hop = byKey.get(`leg-${i}`);
        const HopIcon = HOP_ICON[hop?.pass?.mode] || TrainIcon;
        const nights = t(s.nights === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n: s.nights });
        const bed = sc?.ownAccom ? t('trip.sum.ownStay') : t(`stay.${s.stayTier || stayTier || 'home'}`);
        return (
          <React.Fragment key={`${s.destinationId}-${i}`}>
            <li className="jr-step is-stay">
              <Stamp iso={s.arriveDate} />
              <article className="jr-card is-stay" aria-label={[city, nights, bed].join(', ')}>
                <div className="jr-stay">
                  <span className="jr-photo" aria-hidden="true">
                    <HeroImage url={s.dest?.image?.url} city={city} iso2={s.dest?.iso2} className="jr-photo-img" ratio={[1, 1]} maxWidth={200} />
                  </span>
                  <span className="jr-city">{city}</span>
                </div>
                {s.arriveDate && (
                  <div className="jr-ends is-dates">
                    <span className="jr-end">
                      <span className="jr-k">{t('tp.pass.in')}</span>
                      <span className="jr-date">{fmtShort(s.arriveDate)}</span>
                    </span>
                    <span className="jr-line is-quiet" aria-hidden="true" />
                    <span className="jr-end is-to">
                      <span className="jr-k">{t('tp.pass.out')}</span>
                      <span className="jr-date">{fmtShort(s.departDate)}</span>
                    </span>
                  </div>
                )}
                <Foot row={row} fig={money(sc?.accomTotal ?? sc?.total)} figNote={Number.isFinite(sc?.accomTotal ?? sc?.total) ? t('tp.fig.stay') : ''} />
              </article>
            </li>
            {hop && (
              <li className="jr-step is-hop">
                <Stamp iso={hop.pass?.date} />
                {/* T1006: the two towns and the mode between them say it all. */}
                <article className="jr-card is-hop" aria-label={hop.title}>
                  <div className="jr-ends is-towns">
                    <span className="jr-end"><span className="jr-town">{hop.pass?.from}</span></span>
                    <span className="jr-line" aria-hidden="true"><HopIcon size={14} /></span>
                    <span className="jr-end is-to"><span className="jr-town">{hop.pass?.to}</span></span>
                  </div>
                  <Foot row={hop} fig={money(hop.eur)} />
                </article>
              </li>
            )}
          </React.Fragment>
        );
      })}
      {/* T873: the car advice, one quiet card, only when a car is worth it. */}
      {carTip && carTip.verdict !== 'no' && !flight?.driving && (
        <li className="jr-step is-car" data-testid="ts-car">
          <span className="jr-stamp is-empty" aria-hidden="true" />
          <article className="jr-card is-tip">
            <div className="jr-head">
              <span className="jr-brand">
                <span className="jr-glyph"><CarIcon size={16} /></span>
                <span className="jr-brand-text">
                  <span className="jr-name">{t(carTip.verdict === 'yes' ? 'wizard.carAdviceYes' : 'wizard.carAdviceMaybe')}</span>
                  {carTip.carStops?.length > 0 && (
                    <span className="jr-meta">{t('tp.car.where', { places: carTip.carStops.map((c) => cityLabel(c)).join(', ') })}</span>
                  )}
                </span>
              </span>
              {onCar && (
                <Button variant="secondary" size="sm" className="ts-car-add" onClick={onCar}>
                  {Number.isFinite(carDelta) && Math.abs(carDelta) >= 1
                    ? t('tp.car.addFor', { delta: `${carDelta > 0 ? '+' : '-'}${formatMoney(Math.abs(carDelta), { precision: 'whole', locale: lang })}` })
                    : t('tp.car.add')}
                </Button>
              )}
            </div>
          </article>
        </li>
      )}
      <Way dir="back" />
      <Home end />
    </ol>
  );
}

/** "Sat 05 Jun" in the reader's language (fmtDate's weekday form). */
function fmtShort(iso) {
  if (!iso) return '';
  const loc = activeLocale() || 'en-GB';
  try {
    return new Intl.DateTimeFormat(loc.startsWith('en') ? 'en-GB' : loc, { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })
      .format(new Date(`${iso}T00:00:00Z`));
  } catch { return iso; }
}
