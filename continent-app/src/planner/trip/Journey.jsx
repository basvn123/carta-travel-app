import React from 'react';
import { partnerButtonProps } from '../../lib/partnerLink.js';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip, Money, Plate } from '../../components/ui/index.js';
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
 * House style (G1, 2026-11, the trip lane's "path"): the list is drawn as a
 * footpath. A stay is a signpost plate (the town, its dates and nights, the
 * figure as one unit); a flight, a drive or a hop is a leg plate on one line
 * (the two ends, the figure). What is done with a part (where it stands,
 * Change, Book) sits in the quiet row under its plate. The day stamps stand
 * beside the path like waymark posts; the path itself is drawn in CSS.
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
  const Foot = ({ row, lead = null }) => (
    <div className="jr-foot">
      {lead}
      <span className="jr-status">
        {row?.booked
          ? <Chip kind="status" tone="positive" className="ts-booked">{t('pf.doors.bookedMark')}</Chip>
          : row?.link && <Chip kind="status" tone="neutral" className="ts-tobook">{t('tp.toBook')}</Chip>}
      </span>
      {!row?.booked && row?.link && (
        <Button {...partnerButtonProps(row.link.href)} size="sm" className="jr-book" aria-label={row.link.label}
          iconAfter={<ExternalIcon size={13} />}>
          {t('tp.book')}
        </Button>
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
          <span className="jr-node" aria-hidden="true"><CarIcon size={14} /></span>
          <article className="jr-card is-drive">
            <Plate variant="leg" className="jr-plate" lead={<CarIcon size={16} />} name={title}
              sub={d ? t('trip.sum.km', { km: Math.round(d.road_km) }) : null}
              fig={money(d?.ground_total)} figSub={row?.yours ? t('plan.yours') : null} />
            <Foot row={row} />
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
        <span className="jr-node" aria-hidden="true"><Icon size={14} /></span>
        <article className="jr-card is-flight" aria-label={[title, ends.filter(Boolean).join(' '), who].filter(Boolean).join(', ')}>
          <Plate
            variant="leg"
            className="jr-plate"
            name={ends[0] && ends[1] ? (
              <span className="jr-ends">
                <span className="jr-end">
                  <span className="jr-code">{ends[0]}</span>
                  <span className="jr-time">{leg?.dep || ''}</span>
                </span>
                <span className="jr-line" aria-hidden="true" />
                <span className="jr-end is-to">
                  <span className="jr-code">{ends[1]}</span>
                  <span className="jr-time">{arr || ''}</span>
                </span>
              </span>
            ) : title}
            sub={!leg && !own ? <NotYet /> : null}
            fig={money(eur)}
            figSub={money(eur) && row?.yours ? t('plan.yours') : null}
          />
          <Foot
            row={row}
            lead={(
              <span className="jr-brand">
                {leg?.airline && !own ? <AirlineMark code={leg.airline} size="sm" /> : <span className="jr-glyph"><Icon size={16} /></span>}
                <span className="jr-name">{who}</span>
                {stops && <span className="jr-line-note">{stops}</span>}
                {canChange && (
                  <Button variant="quiet" size="sm" className="jr-change" iconStart={<PencilIcon size={14} />} onClick={() => onChangeFlight(dir)}>
                    {t('tp.fl.change')}
                  </Button>
                )}
              </span>
            )}
          />
        </article>
      </li>
    );
  };

  const Home = ({ end = false }) => (
    <li className={`jr-step is-home${end ? ' is-end' : ''}`}>
      {/* The flight beside it carries the day; home is a mark on the rail. */}
      <span className="jr-stamp is-empty" aria-hidden="true" />
      <span className="jr-node is-home" aria-hidden="true" />
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
              <span className="jr-node is-stay" aria-hidden="true">{i + 1}</span>
              <article className="jr-card is-stay" aria-label={[city, nights, bed].join(', ')}>
                <Plate
                  className="jr-plate"
                  lead={(
                    <span className="jr-photo" aria-hidden="true">
                      <HeroImage url={s.dest?.image?.url} city={city} iso2={s.dest?.iso2} className="jr-photo-img" ratio={[1, 1]} maxWidth={200} />
                    </span>
                  )}
                  name={<span className="jr-city">{city}</span>}
                  sub={[s.arriveDate ? t('plan.dateRange', { a: fmtShort(s.arriveDate), b: fmtShort(s.departDate) }) : '', nights].filter(Boolean).join(', ')}
                  fig={money(sc?.accomTotal ?? sc?.total)}
                  figSub={money(sc?.accomTotal ?? sc?.total) && row?.yours ? t('plan.yours') : null}
                />
                <Foot row={row} />
              </article>
            </li>
            {hop && (
              <li className="jr-step is-hop">
                <Stamp iso={hop.pass?.date} />
                {/* T1006: the two towns and the mode between them say it all;
                    house style: "Bus to Lake Bled" on a leg plate, from the
                    town of the plate above. */}
                <span className="jr-node" aria-hidden="true"><HopIcon size={14} /></span>
                <article className="jr-card is-hop" aria-label={hop.title}>
                  <Plate variant="leg" className="jr-plate" lead={<HopIcon size={16} />} name={hop.title}
                    sub={hop.pass?.from ? t('tp.hopFrom', { city: hop.pass.from }) : null}
                    fig={money(hop.eur)} figSub={money(hop.eur) && hop.yours ? t('plan.yours') : null} />
                  <Foot row={hop} />
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
          <span className="jr-node is-tip" aria-hidden="true"><CarIcon size={14} /></span>
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
