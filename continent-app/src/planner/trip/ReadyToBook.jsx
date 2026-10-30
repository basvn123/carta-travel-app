import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Chip, Money } from '../../components/ui/index.js';
import { BedIcon, BusIcon, FerryIcon, TrainIcon } from '../../components/Icons.jsx';
import { PlaneIcon } from '../../components/TransportIcons.jsx';
import { AirlineMark } from '../../components/flights/Flights.jsx';
import { useAirlines, airlineName } from '../../lib/flights/useAirlines.js';
import { googleFlightsLink, legLinks, stayBookLinks } from '../../lib/transportLinks.js';
import { fmtDate } from '../../lib/dates.js';
import { cityLabel } from '../../lib/placeName.js';
import { PaidField } from '../PlanTotal.jsx';

const LEG_ICON = { train: TrainIcon, bus: BusIcon, ferry: FerryIcon, fly: PlaneIcon };
const LEG_MODES = Object.keys(LEG_ICON);

/**
 * The trip's bookable parts, in the order they are booked (T873, plan flow
 * v3 "Ready to book in place of Review"; the owner did not mark it, so it is
 * built as proposed): the flight there, each stay, each hop between stops
 * by train, bus, ferry or plane, the flight home. Every row names the part,
 * says when and what it is, carries its figure (the traveller's own where
 * they put one in), one link out to where it is booked and "Add what you
 * paid", which writes the same field the Itinerary holds. A part marked
 * booked carries the Booked chip and no link. A drive there, a car hop and
 * a stay without a town have nothing to book and no row. One line under the
 * list says prices on those sites may have changed.
 *
 *   book   { onTravelPaid(dir, n), onOwnStay(destinationId, n), onOwnLeg(i, mode, n) }
 */
/**
 * The trip's bookable parts as rows (T887): what ReadyToBook lists and the
 * trip page's route carries on each of its nodes, keyed flight-out, stay-i,
 * leg-i and flight-back. Each row: icon, title, sub, eur, yours, booked,
 * link { href, label } and the paid field. Pure but for the PaidField
 * elements it builds.
 */
export function bookRows({
  tripStart, tripEnd, stopDetails, stayCosts = [], stayTier = 'home', priced, flight = null, ownFlight = null,
  party, booked = null, book = null,
}, { t, lang, airlines }) {
  const legs = priced?.legs || [];
  const bookedStays = new Set(booked?.stays || []);
  const split = ownFlight && (ownFlight.costOut != null || ownFlight.costBack != null);
  const paid = {
    out: ownFlight ? (split ? Number(ownFlight.costOut) || 0 : Number(ownFlight.costTotal) || 0) : 0,
    back: ownFlight && split ? Number(ownFlight.costBack) || 0 : 0,
  };
  const adults = party?.adults || 1;
  const children = party?.children || 0;
  const rows = [];

  const flightRow = (dir) => {
    if (flight?.driving) return;
    const leg = priced?.cartaFlight?.[dir] || null;
    const ends = leg ? [leg.from, leg.to]
      : flight?.combinable ? (dir === 'out' ? [flight.origin, flight.into_anchor] : [flight.out_anchor, flight.origin]) : [];
    if (!leg && !ends[0] && !(paid[dir] > 0)) return;
    const date = leg?.date || (dir === 'out' ? tripStart : tripEnd);
    const isBooked = Boolean(booked?.flights);
    const link = !isBooked && ends[0] && ends[1] ? googleFlightsLink({ fromIata: ends[0], toIata: ends[1], date, lang }) : null;
    rows.push({
      key: `flight-${dir}`,
      icon: leg?.airline && !(paid[dir] > 0) ? <AirlineMark code={leg.airline} size="sm" /> : <PlaneIcon size={18} />,
      title: t(dir === 'out' ? 'tp.rb.out' : 'tp.rb.back'),
      sub: [
        ends[0] && ends[1] ? t('tf.tp.codes', { from: ends[0], to: ends[1] }) : '',
        date ? fmtDate(date, true) : '',
        leg && !(paid[dir] > 0) ? [airlineName(airlines, leg.airline) || leg.airline, t('flight.times', { dep: leg.dep, arr: leg.arr })].filter(Boolean).join(' ') : '',
      ].filter(Boolean).join(', '),
      eur: paid[dir] > 0 ? paid[dir] : (leg?.cost?.total ?? null),
      yours: paid[dir] > 0,
      booked: isBooked,
      link: link ? { href: link, label: t('plan.findOn', { provider: 'Google Flights' }) } : null,
      paid: book?.onTravelPaid ? (
        <PaidField id={`rtb-paid-${dir}`} value={paid[dir]} label={t('plan.youPaid')} addLabel={t('travel.addWhatYouPaid')}
          onChange={(n) => book.onTravelPaid(dir, n)} folded hint={false} />
      ) : null,
    });
  };

  flightRow('out');
  stopDetails.forEach((s, i) => {
    if (!s.dest) return;
    const sc = stayCosts[i] || {};
    const city = cityLabel(s.dest.city || '');
    const tier = s.stayTier || stayTier;
    const isBooked = bookedStays.has(s.destinationId);
    const find = !isBooked && !sc.ownAccom ? stayBookLinks({
      tier, city: s.dest.city, country: s.dest.country, checkin: s.arriveDate, checkout: s.departDate, adults, children,
    })[0] : null;
    rows.push({
      key: `stay-${i}`,
      icon: <BedIcon size={18} />,
      title: t('tp.rb.stay', { city, nights: t(s.nights === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n: s.nights }) }),
      sub: [sc.ownAccom ? t('trip.sum.ownStay') : t(`stay.${tier || 'home'}`), s.arriveDate ? t('plan.dateRange', { a: fmtDate(s.arriveDate, true), b: fmtDate(s.departDate, true) }) : ''].filter(Boolean).join(', '),
      eur: sc.accomTotal ?? null,
      yours: Boolean(sc.ownAccom),
      booked: isBooked,
      link: find ? { href: find.href, label: t('plan.findOn', { provider: find.provider }) } : null,
      paid: book?.onOwnStay ? (
        <PaidField id={`rtb-paid-bed-${i}`} value={sc.ownAccom ? sc.accomTotal : 0} estimate={sc.estAccomTotal ?? sc.accomTotal}
          label={t('plan.bookingPrice')} addLabel={t('travel.addWhatYouPaid')} onChange={(n) => book.onOwnStay(s.destinationId, n)} folded hint={false} />
      ) : null,
    });
    const leg = i < stopDetails.length - 1 ? legs[i] : null;
    const next = stopDetails[i + 1];
    if (!leg || !next?.dest || !LEG_MODES.includes(leg.mode) || leg.no_road) return;
    const own = Boolean(leg.modes?.[leg.mode]?.own);
    const link = own ? null : legLinks({
      from: { city: s.dest.city, iso2: s.dest.iso2 }, to: { city: next.dest.city, iso2: next.dest.iso2 }, mode: leg.mode, date: next.arriveDate || '',
    })[0];
    const Icon = LEG_ICON[leg.mode];
    rows.push({
      key: `leg-${i}`,
      icon: <Icon size={18} />,
      title: t(`tp.rb.leg.${leg.mode}`, { city: cityLabel(next.dest.city || '') }),
      sub: next.arriveDate ? fmtDate(next.arriveDate, true) : '',
      eur: leg.ground_total ?? null,
      yours: own,
      booked: false,
      link: link ? { href: link.url, label: t('plan.findTicketsOn', { site: link.label }) } : null,
      paid: book?.onOwnLeg ? (
        <PaidField id={`rtb-paid-leg-${i}`} value={own ? leg.ground_total : 0} estimate={own ? null : leg.ground_total}
          label={t('plan.youPaid')} addLabel={t('travel.addWhatYouPaid')} onChange={(n) => book.onOwnLeg(i, n > 0 ? leg.mode : null, n)} folded hint={false} />
      ) : null,
    });
  });
  flightRow('back');
  return rows;
}

export function ReadyToBook(props) {
  const { t, lang } = useI18n();
  const airlines = useAirlines();
  const bookedMark = <Chip kind="status" tone="positive" className="ts-booked">{t('pf.doors.bookedMark')}</Chip>;
  const rows = bookRows(props, { t, lang, airlines });

  if (!rows.length) return null;
  return (
    <section className="tpg-book" aria-labelledby="tpg-book-h" data-testid="tpg-book">
      <h2 className="tpg-h" id="tpg-book-h">{t('tp.rb.title')}</h2>
      <ol className="tpg-book-list">
        {rows.map((r) => (
          <li key={r.key} className="tpg-book-row" data-row={r.key}>
            <span className="ts-mark" aria-hidden="true">{r.icon}</span>
            <div className="tpg-book-main">
              <span className="ts-node-title">{r.title}</span>
              {r.sub && <span className="ts-node-sub">{r.sub}</span>}
              {r.booked && bookedMark}
              <span className="tpg-book-acts">
                {r.link && (
                  <a className="btn btn-quiet btn-sm tpg-book-link" href={r.link.href} target="_blank" rel="noreferrer noopener">
                    <span className="btn-label">{r.link.label}</span>
                  </a>
                )}
                {r.paid}
              </span>
            </div>
            <span className="ts-node-fig">
              {Number.isFinite(r.eur) && r.eur > 0 ? (
                r.yours
                  ? <span className="plan-line-yours"><Money value={r.eur} precision="cents" /><small>{t('plan.yours')}</small></span>
                  : <Money value={r.eur} est precision="cents" />
              ) : null}
            </span>
          </li>
        ))}
      </ol>
      <p className="tpg-book-note">{t('prov.bookingNote')}</p>
    </section>
  );
}
