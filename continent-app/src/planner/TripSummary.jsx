import React, { useState, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import './TripSummary.css';
import { useI18n } from '../i18n/index.jsx';
import { Button, Chip, IconButton, Money, Tabs } from '../components/ui/index.js';
import {
  ArrowLeftIcon, BedIcon, CalendarIcon, CarIcon, FerryIcon, HomeIcon, MoonIcon, PersonIcon, PencilIcon,
  TrainIcon, BusIcon, SparkIcon, ShareIcon,
  ExpandIcon, ShrinkIcon, UndoIcon, RedoIcon, RouteIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import NotYet from '../components/NotYet.jsx';
import { AirlineMark } from '../components/flights/Flights.jsx';
import { useAirlines, airlineName } from '../lib/flights/useAirlines.js';
import { TRAVEL_MODE_LABEL } from '../lib/transportLinks.js';
import { fmtDate } from '../lib/dates.js';
import { formatMoney } from '../lib/money.js';
import { nightsBetween } from '../lib/tripDates.js';
import { partyText } from '../lib/party.js';
import { cityLabel } from '../lib/placeName.js';
import { useMedia } from '../browse/home/useHome.js';
import { RecordMapDialog } from '../auth/mytrips/parts.jsx';
import { CostCard } from './trip/CostCard.jsx';
import { ChangeTripSheet } from './trip/ChangeTripSheet.jsx';
import { RouteCodes } from './trip/RouteCodes.jsx';
import { bookRows } from './trip/ReadyToBook.jsx';
import { useSettings } from '../components/SettingsLine.jsx';
import { useLifestyleLabel } from './planHooks.js';
import { bookedCount, countdownText, shownTripName } from './trip/tripHead.js';

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
            <HeroImage key={`${p.city}-${i}`} url={p.url} city={p.city} className="ts-strip-img" ratio={i === 0 ? [4, 3] : [1, 1]} maxWidth={i === 0 ? 1280 : 480} eager={i === 0} />
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
 * The route as one timeline (T820): home, the way there, every stop, the way
 * home, home. Every row has the same grammar (a 40 px marker, a title, one
 * line of detail, a figure on the right), so every row starts on one edge.
 * The figures are the receipt's own: a way's fare, a stop's bed.
 *
 * T887 (trip page v5): Ready to book folds in. Each part carries where it
 * stands (Booked, or To book with its link out) and Add what you paid
 * (`rows`, bookRows() keyed flight-out, stay-i, leg-i, flight-back), and a
 * hop between stops that can be booked is a node of its own. An overnight
 * flight names its arrival day. The car advice offers the car with what it
 * does to the total (`onCar`, `carDelta`).
 */
function OverviewRoute({ tripStart, tripEnd, stopDetails, stayCosts, stayTier, priced, flight, ownFlight, driveLegs, origin, div, carTip = null, rows = [], onCar = null, carDelta = null }) {
  const { t } = useI18n();
  const { lang } = useI18n();
  const airlines = useAirlines();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  // Where a part stands, its link out and what was paid (T866, T873, T887).
  const Book = ({ row }) => {
    if (!row) return null;
    return (
      <span className="ts-node-book">
        {row.booked
          ? <Chip kind="status" tone="positive" className="ts-booked">{t('pf.doors.bookedMark')}</Chip>
          : row.link && <Chip kind="status" tone="neutral" className="ts-tobook">{t('tp.toBook')}</Chip>}
        {!row.booked && row.link && (
          <a className="btn btn-quiet btn-sm ts-book-link" href={row.link.href} target="_blank" rel="noreferrer noopener">
            <span className="btn-label">{row.link.label}</span>
          </a>
        )}
        {row.paid}
      </span>
    );
  };
  const split = ownFlight && (ownFlight.costOut != null || ownFlight.costBack != null);
  const paid = {
    out: ownFlight ? (split ? Number(ownFlight.costOut) || 0 : Number(ownFlight.costTotal) || 0) : 0,
    back: ownFlight && split ? Number(ownFlight.costBack) || 0 : 0,
  };
  const way = (dir) => {
    const date = dir === 'out' ? tripStart : tripEnd;
    const label = t(dir === 'out' ? 'itin.secGetThere' : 'itin.secGetHome');
    if (flight?.driving) {
      const d = dir === 'out' ? driveLegs?.out : driveLegs?.home;
      return { Icon: CarIcon, label, line: t('trip.modeCar'), sub: [d ? t('trip.sum.km', { km: Math.round(d.road_km) }) : '', date ? fmtDate(date, true) : ''], eur: d?.ground_total ?? null };
    }
    const leg = priced?.cartaFlight?.[dir] || null;
    if (leg && !(paid[dir] > 0)) {
      // T887: an arrival before the departure's clock time is the next day.
      const clock = (x) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(x || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
      const day = leg.date || date;
      const overnight = clock(leg.arr) != null && clock(leg.dep) != null && clock(leg.arr) < clock(leg.dep) && day;
      const next = overnight ? new Date(Date.parse(`${day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10) : null;
      const arr = overnight ? t('tp.arrNext', { time: leg.arr, day: fmtDate(next, true) }) : leg.arr;
      return {
        Icon: PlaneIcon, label, mark: leg.airline, from: leg.from, to: leg.to,
        line: airlineName(airlines, leg.airline) || t('trip.modeFly'),
        sub: [t('flight.times', { dep: leg.dep, arr }), overnight ? '' : fmtDate(day, true), leg.stops > 0 ? (leg.stops === 1 ? t('flight.stop1') : t('flight.stops', { n: leg.stops })) : ''],
        eur: leg.cost?.total ?? null,
      };
    }
    if (flight?.own || paid[dir] > 0) {
      const mode = flight?.mode || ownFlight?.mode || 'fly';
      const who = (flight?.airline || ownFlight?.airline || '').trim();
      return {
        Icon: WAY_ICON[mode] || PlaneIcon, label, line: who || t(TRAVEL_MODE_LABEL[mode] || 'trip.modeFly'),
        sub: [t('trip.sum.yourOwn'), date ? fmtDate(date, true) : ''],
        eur: paid[dir] > 0 ? paid[dir] : (dir === 'out' && !split ? (flight?.cost_total || null) : null),
      };
    }
    // A planned route without a fare yet still names its airports (T839).
    const ends = flight?.combinable ? (dir === 'out' ? [flight.origin, flight.into_anchor] : [flight.out_anchor, flight.origin]) : [];
    return { Icon: PlaneIcon, label, from: ends[0], to: ends[1], line: t('trip.modeFly'), notYet: true, sub: [date ? fmtDate(date, true) : ''], eur: null };
  };
  const fig = (eur) => (Number.isFinite(eur) && eur > 0 ? <Money value={eur / div} est precision="whole" /> : null);

  const Home = ({ date, end = false }) => (
    <li className={`ts-node is-home${end ? ' is-end' : ''}`}>
      <span className="ts-mark" aria-hidden="true"><HomeIcon size={18} /></span>
      <div className="ts-node-main">
        <span className="ts-node-title">{origin || t('trip.sum.home')}</span>
        <span className="ts-node-sub">{date ? fmtDate(date, true) : <NotYet />}</span>
      </div>
    </li>
  );
  const Way = ({ dir }) => {
    const w = way(dir);
    const { Icon } = w;
    return (
      <li className="ts-node is-way">
        <span className="ts-mark" aria-hidden="true"><Icon size={18} /></span>
        <div className="ts-node-main">
          <span className="ts-node-label">{w.from && w.to ? <RouteCodes from={w.from} to={w.to} icon={false} /> : w.label}</span>
          <span className="ts-node-title">
            {w.mark && <AirlineMark code={w.mark} size="sm" />}
            {w.line}
          </span>
          <span className="ts-node-sub">{w.notYet ? <NotYet /> : w.sub.filter(Boolean).join(', ')}</span>
          <Book row={byKey.get(`flight-${dir}`)} />
        </div>
        <span className="ts-node-fig">{w.notYet ? null : fig(w.eur)}</span>
      </li>
    );
  };

  return (
    <ol className="ts-route">
      <Home date={tripStart} />
      <Way dir="out" />
      {stopDetails.map((s, i) => {
        const city = cityLabel(s.dest?.city || '') || t('itin.unknown');
        const sc = stayCosts[i];
        const hop = byKey.get(`leg-${i}`);
        return (
          <React.Fragment key={`${s.destinationId}-${i}`}>
          <li className="ts-node is-stop">
            <span className="ts-mark is-photo" aria-hidden="true">
              <HeroImage url={s.dest?.image?.url} city={city} iso2={s.dest?.iso2} className="ts-mark-img" ratio={[1, 1]} maxWidth={160} />
            </span>
            <div className="ts-node-main">
              <span className="ts-node-title">{city}</span>
              <span className="ts-node-sub ts-node-facts">
                <span><MoonIcon size={14} /> {t(s.nights === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n: s.nights })}</span>
                {s.arriveDate && (
                  <span><CalendarIcon size={14} /> {t('plan.dateRange', { a: fmtDate(s.arriveDate, true), b: fmtDate(s.departDate, true) })}</span>
                )}
                <span><BedIcon size={14} /> {sc?.ownAccom ? t('trip.sum.ownStay') : t(`stay.${stayTier || 'home'}`)}</span>
              </span>
              <Book row={byKey.get(`stay-${i}`)} />
            </div>
            <span className="ts-node-fig">
              {fig(sc?.accomTotal ?? sc?.total)}
              {Number.isFinite(sc?.accomTotal ?? sc?.total) && <small>{t('tp.fig.stay')}</small>}
            </span>
          </li>
          {hop && (
            <li className="ts-node is-hop">
              <span className="ts-mark" aria-hidden="true">{hop.icon}</span>
              <div className="ts-node-main">
                <span className="ts-node-title">{hop.title}</span>
                {hop.sub && <span className="ts-node-sub">{hop.sub}</span>}
                <Book row={hop} />
              </div>
              <span className="ts-node-fig">{fig(hop.eur)}</span>
            </li>
          )}
          </React.Fragment>
        );
      })}
      {/* T873: the car advice is one quiet row on the route (it was a
          block under Review's receipt): only when a car is worth it and the
          trip does not drive already. */}
      {carTip && carTip.verdict !== 'no' && !flight?.driving && (
        <li className="ts-node is-car" data-testid="ts-car">
          <span className="ts-mark" aria-hidden="true"><CarIcon size={18} /></span>
          <div className="ts-node-main">
            <span className="ts-node-title">{t(carTip.verdict === 'yes' ? 'wizard.carAdviceYes' : 'wizard.carAdviceMaybe')}</span>
            {carTip.carStops?.length > 0 && (
              <span className="ts-node-sub">{t('tp.car.where', { places: carTip.carStops.map((c) => cityLabel(c)).join(', ') })}</span>
            )}
            {onCar && (
              <span className="ts-node-book">
                <Button variant="secondary" size="sm" className="ts-car-add" onClick={onCar}>
                  {Number.isFinite(carDelta) && Math.abs(carDelta) >= 1
                    ? t('tp.car.addFor', { delta: `${carDelta > 0 ? '+' : '-'}${formatMoney(Math.abs(carDelta), { precision: 'whole', locale: lang })}` })
                    : t('tp.car.add')}
                </Button>
              </span>
            )}
          </div>
          <span className="ts-node-fig" />
        </li>
      )}
      <Way dir="back" />
      <Home date={tripEnd} end />
    </ol>
  );
}

/** The trip's map as a card (T819): still on touch until opened full size. */
function MapCard({ map, mapFull, title }) {
  const { t } = useI18n();
  const [full, setFull] = useState(false);
  if (!map) return null;
  return (
    <>
      <div className="tpg-map" data-testid="tpg-map">
        {!full && map}
        <div className="tpg-map-shield" aria-hidden="true" onClick={() => setFull(true)} />
        <IconButton tone="surface" className="tpg-map-expand" label={t('saved.mapExpand')} onClick={() => setFull(true)}>
          <ExpandIcon size={18} />
        </IconButton>
      </div>
      {full && createPortal(
        <RecordMapDialog title={title} onClose={() => setFull(false)}>
          <div className="savedmap-full-map">{mapFull || map}</div>
          <div className="savedmap-full-bar">
            <span className="savedmap-full-title">{title}</span>
            <Button size="sm" iconStart={<ShrinkIcon size={16} />} onClick={() => setFull(false)}>{t('saved.mapShrink')}</Button>
          </div>
        </RecordMapDialog>,
        document.body,
      )}
    </>
  );
}

/**
 * The trip page (T819-T821, owner 2026-10-29): one page for a planned trip,
 * in tabs. Overview leads with what it costs (the total and four tiles),
 * then the route; Itinerary is the planner's detail (stays, hops, fares,
 * tools, export); Costs is the receipt; Days are the days. From 1024 px the
 * map and the trip's tools sit in a column beside the tabs, in view while
 * the page scrolls; narrower, the map is a card in the Overview.
 *
 *   tab, onTab           'overview' | 'itinerary' | 'costs' | 'days' | 'notes' (T889)
 *   panels               { itinerary, costs, days, notes }: the other tabs' bodies
 *   map, mapFull         the map for the card, and for full size
 *   onPlanHome()         All trips
 *   onPlanDays()         the day questions; absent hides Plan your days
 *   onSettings()         the trip settings (dates, people, from), from the More menu (T885)
 *   onChip(key, ref)     T836: a chip's own editor ('dates', 'people', 'from'),
 *                        hung from the chip; absent, those chips open the settings
 *   onRename(name)       the name in place (T836): a tap on it or its pencil
 *   onLifestyle()        the Lifestyle sheet; absent hides the chip
 *   onExport()           Share and export (the Itinerary's export block)
 *   history              { canUndo, canRedo, undo, redo } (T835): from 1024 px
 *                        Undo and Redo at the end of the tab row
 *   onAddPaid()          T839: put in what was paid (the route's own fields)
 *   onPlanRest()         T863: a flight-first or booked trip's "Plan the rest"
 *   booked               T866: { flights, stays: [destinationId] } marked Booked on the route
 *   book                 T873: Ready to book's Add what you paid handlers
 *                        { onTravelPaid, onOwnStay, onOwnLeg }; absent hides the list
 *   carTip               T873: lib/transport.js carAdvice for the route's one car row
 *   budgetCard           T846: the total against the budget, inside the
 *                        cost card since T886 (BudgetCard compact)
 *   bar                  round buttons on the top row (save)
 *   footer               the saved line under the page
 */
export function TripSummary({
  name, tripStart, tripEnd, party, stopDetails, stayCosts = [], stayTier = 'home',
  priced, flight = null, ownFlight = null, driveLegs = null, origin = '',
  tab = 'overview', onTab, panels = {}, map = null, mapFull = null,
  onPlanDays = null, onPlanHome = null, onSettings = null,
  onExport = null, bar = null, footer = null, history = null, onChip = null, onAddPaid = null, budgetCard = null,
  onPlanRest = null, booked = null, book = null, carTip = null,
  // T838: no edit mode. Every fact is changed where it is shown (the chips,
  // the name, the route's stops), so the page has one layout.
  onRename = null,
  // T888: Change your trip: what a patch does to the total, new dates, the flights.
  quoteDelta = null, onDates = null, onFlights = null,
  // T887: add the hire car the advice names, and what it does to the total.
  onCar = null, carDelta = null,
}) {
  const { t, lang } = useI18n();
  const title = shownTripName(name, stopDetails, lang) || t('itin.myTrip');
  const countdown = countdownText(t, tripStart, tripEnd);
  const bookedNow = bookedCount({ flight, priced, ownFlight, stopDetails, stayCosts, booked });
  const airlinesAll = useAirlines();
  const rows = bookRows({ tripStart, tripEnd, stopDetails, stayCosts, stayTier, priced, flight, ownFlight, party, booked, book }, { t, lang, airlines: airlinesAll });
  const nextRow = rows.find((r) => !r.booked && r.link) || null;
  // The Lifestyle sets what the days cost (one .lifestyle-btn door): a chip
  // with the trip's own, opening the same sheet as everywhere else.
  const settings = useSettings();
  const lifestyle = useLifestyleLabel();
  const onLifestyle = settings?.openLifestyle || null;
  const uid = useId();
  const wide = useMedia('(min-width: 1024px)');
  const [per, setPer] = useState('group');
  const people = partyText(t, party);
  const n = Math.max(1, (party.adults || 0) + (party.children || 0) + (party.babies || 0));
  const div = per === 'person' ? n : 1;
  const dates = tripStart && tripEnd
    ? t('plan.dateRange', { a: fmtDate(tripStart, true), b: fmtDate(tripEnd, true) })
    : '';
  const planned = stopDetails.reduce((x, s) => x + (s.nights || 0), 0);
  const windowN = nightsBetween(tripStart, tripEnd);
  const nightsNote = windowN > 0 && planned !== windowN ? t('pf.home.nightsPlanned', { x: planned, n: windowN }) : '';
  // T836: the chips' own editors hang from the chip that opened them.
  const chipEls = useRef({});
  const shareRef = useRef(null);
  const openChip = (key) => (onChip ? () => onChip(key, { current: chipEls.current[key] }) : onSettings);
  // The name in place (T836): a field while it is being renamed.
  const [naming, setNaming] = useState(null);
  const commitName = () => {
    if (naming != null && naming.trim() && naming.trim() !== name) onRename?.(naming.trim());
    setNaming(null);
  };
  const photos = stopDetails
    .filter((s) => s.dest?.image?.url)
    .map((s) => ({ url: s.dest.image.url, city: cityLabel(s.dest.city) }))
    .filter((p, i, a) => a.findIndex((q) => q.url === p.url) === i)
    .slice(0, 3);
  const places = [...new Set(stopDetails.map((s) => cityLabel(s.dest?.city || '')).filter(Boolean))];
  const lead = stopDetails.find((s) => s.dest)?.dest || null;

  const go = (id, anchor = null) => {
    onTab?.(id);
    window.requestAnimationFrame(() => {
      const el = anchor ? document.getElementById(anchor) : document.getElementById(`${uid}-tabs`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const tabs = [
    { id: 'overview', label: t('tp.tab.overview') },
    { id: 'itinerary', label: t('tp.tab.itinerary') },
    { id: 'costs', label: t('tp.tab.costs') },
    { id: 'days', label: t('tp.tab.days') },
    // T889: the bookings, notes and packing list, in their own tab.
    panels.notes && { id: 'notes', label: t('tp.tab.notes') },
  ].filter(Boolean);

  // T885: the trip bar, every input of the price as a label over its value,
  // one tap each to its own editor (T836's chip editors, the Lifestyle sheet).
  const cells = [
    { key: 'dates', label: t('tp.bar.when'), text: [dates || t('pf.when.unsure'), nightsNote].filter(Boolean).join(', '), onClick: openChip('dates'), dialog: Boolean(onChip) },
    { key: 'people', label: t('tp.bar.who'), text: people, onClick: openChip('people'), dialog: Boolean(onChip) },
    origin && { key: 'from', label: t('tp.bar.from'), text: origin, onClick: openChip('from'), dialog: Boolean(onChip) },
    onLifestyle && lifestyle && { key: 'lifestyle', label: t('tp.bar.stay'), text: lifestyle, onClick: onLifestyle, dialog: true },
  ].filter(Boolean);

  // T886, T888: one primary, then the trip's two doors: Change your trip
  // (one sheet for every input of the price) and Share.
  const [changing, setChanging] = useState(false);
  const change = () => setChanging(true);
  const tools = (
    <div className="tpg-tools" role="group" aria-label={t('plan.toolsTitle')}>
      {onPlanDays && wide && (
        <Button variant="primary" className="tpg-tool is-primary" iconStart={<SparkIcon size={18} />} onClick={onPlanDays}>
          {t('trip.planYourDays')}
        </Button>
      )}
      {onPlanRest && (
        <Button variant="secondary" className="tpg-tool tpg-rest" iconStart={<RouteIcon size={18} />} onClick={onPlanRest}>
          {t('pf.doors.rest')}
        </Button>
      )}
      {(
        <Button variant="secondary" className="tpg-tool" iconStart={<PencilIcon size={18} />} onClick={change}>
          {t('tp.change')}
        </Button>
      )}
      {onExport && (
        <Button variant="secondary" className="tpg-tool" iconStart={<ShareIcon size={18} />} onClick={() => onExport(null)}>
          {t('export.exportAndShare')}
        </Button>
      )}
    </div>
  );

  const mapCard = <MapCard map={map} mapFull={mapFull} title={title} />;

  // T886: what the trip costs, once: the side column from 1024 px (every
  // tab), the Overview on a phone. The budget lives inside it.
  const costCard = (
    <CostCard priced={priced} people={n} per={per} onPer={setPer} budget={budgetCard}
      aroundNote={carTip && carTip.verdict === 'yes' && !flight?.driving ? t('tp.tile.carAdvised') : ''}
      onOpen={(k) => go('costs', `tp-cost-${k}`)} onAll={() => go('costs')} onAddPaid={onAddPaid} />
  );

  const overview = (
    <div className="tpg-overview">
      {bookedNow.of > 0 && (
        <section className="tpg-next" aria-labelledby={`${uid}-next`}>
          <div className="tpg-next-top">
            <h2 className="tpg-next-h" id={`${uid}-next`}>{t(nextRow ? 'tp.next.title' : 'tp.next.done')}</h2>
            <span className="tpg-next-n">{t('tp.bookedOf', { n: bookedNow.n, of: bookedNow.of })}</span>
          </div>
          <span className="tpg-next-bar" aria-hidden="true">
            {Array.from({ length: bookedNow.of }, (_, i) => <i key={i} className={i < bookedNow.n ? 'is-on' : ''} />)}
          </span>
          {nextRow && (
            <div className="tpg-next-row">
              <span className="ts-mark" aria-hidden="true">{nextRow.icon}</span>
              <span className="tpg-next-main">
                <span className="ts-node-title">{nextRow.title}</span>
                <span className="ts-node-sub">{[nextRow.sub, Number.isFinite(nextRow.eur) && nextRow.eur > 0 ? formatMoney(nextRow.eur, { precision: 'whole', locale: lang }) : ''].filter(Boolean).join(', ')}</span>
              </span>
              <a className="btn btn-secondary btn-sm tpg-next-go" href={nextRow.link.href} target="_blank" rel="noreferrer noopener" aria-label={nextRow.link.label}>
                <span className="btn-label">{t('tp.book')}</span>
              </a>
            </div>
          )}
        </section>
      )}

      {!wide && costCard}
      {!wide && mapCard}

      <section className="tpg-route" aria-labelledby={`${uid}-route`}>
        <h2 className="tpg-h" id={`${uid}-route`}>{t('plan.yourRoute')}</h2>
        <OverviewRoute
          tripStart={tripStart} tripEnd={tripEnd} stopDetails={stopDetails} stayCosts={stayCosts} stayTier={stayTier}
          priced={priced} flight={flight} ownFlight={ownFlight} driveLegs={driveLegs} origin={origin} div={div}
          carTip={carTip} rows={rows} onCar={onCar} carDelta={carDelta}
        />
        {rows.some((r) => r.link) && <p className="tpg-book-note">{t('prov.bookingNote')}</p>}
      </section>

      {!wide && tools}
    </div>
  );

  const body = tab === 'overview' ? overview : (panels[tab] || null);

  return (
    <div className={`tpg is-${tab}${wide ? '' : ' has-dock'}`}>
      <div className="tpg-top">
        {onPlanHome ? (
          <Button variant="quiet" size="sm" className="ts-back" iconStart={<ArrowLeftIcon size={18} />} onClick={onPlanHome}>
            {t('trip.sum.allTrips')}
          </Button>
        ) : <span />}
        <span className="tpg-bar">
          {wide && (
            <Button variant="secondary" size="sm" className="tpg-change" iconStart={<PencilIcon size={16} />} onClick={change}>
              {t('tp.change')}
            </Button>
          )}
          {bar}
          {onExport && (
            // T847: Share this trip, beside Save and the settings.
            <IconButton ref={shareRef} tone="surface" label={t('tp.sh.title')} onClick={() => onExport(shareRef)} data-testid="tpg-share">
              <ShareIcon size={20} />
            </IconButton>
          )}
        </span>
      </div>

      {/* T885: one photo carries the trip's name, its places and where it
          stands (the countdown, what is booked); without a photo the same
          head stands on the page. */}
      <header className={`tpg-head${photos.length ? ' has-photo' : ''}`}>
        {photos.length > 0 && (
          <HeroImage url={photos[0].url} city={photos[0].city} className="tpg-photo-img" ratio={[3, 2]} maxWidth={1600} eager />
        )}
        {(countdown || bookedNow.of > 0) && (
          <p className="tpg-pills">
            {countdown && <span className="tpg-pill">{countdown}</span>}
            {bookedNow.of > 0 && <span className={`tpg-pill${bookedNow.n ? ' is-some' : ''}`}><span className="tpg-pill-dot" aria-hidden="true" />{t('tp.bookedOf', { n: bookedNow.n, of: bookedNow.of })}</span>}
          </p>
        )}
        <div className="tpg-ov">
          {naming != null ? (
            <>
              <h1 className="sr-only">{title}</h1>
              <input
                className="tpg-name tpg-name-input"
                value={naming}
                autoFocus
                maxLength={80}
                onChange={(e) => setNaming(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitName(); }
                  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setNaming(null); }
                }}
                aria-label={t('trip.nameAria')}
              />
            </>
          ) : (
            <div className="tpg-name-row">
              <h1 className="pf-title tpg-name" tabIndex={-1}>{title}</h1>
              {onRename && (
                <IconButton tone={photos.length ? 'photo' : 'plain'} className="tpg-rename" label={t('tp.rename')} onClick={() => setNaming(shownTripName(name, stopDetails, lang))}>
                  <PencilIcon size={16} />
                </IconButton>
              )}
            </div>
          )}
          <Button variant="quiet" size="sm" className="tpg-where" onClick={() => go('itinerary')} aria-label={`${t('tp.tab.itinerary')}: ${places.join(', ')}`}>
            {lead?.iso2 && <CountryFlag country={lead.iso2} size={13} />}
            <span>{[lead?.country, t(places.length === 1 ? 'tp.places1' : 'tp.placesN', { n: places.length })].filter(Boolean).join(', ')}</span>
          </Button>
        </div>
      </header>

      <div className="tpg-tripbar" role="group" aria-label={t('tp.bar.label')}>
        {cells.map(({ key, label, text, onClick, dialog }) => (
          <Button key={key} variant="quiet" className="tpg-cell" onClick={onClick} data-chip={key}
            aria-label={t('tp.bar.edit', { what: label, value: text })} aria-haspopup={dialog ? 'dialog' : undefined}
            ref={(el) => { chipEls.current[key] = el; }}>
            <span className="tpg-cell-k">{label}</span>
            <span className="tpg-cell-v">{text}</span>
            <PencilIcon size={14} className="tpg-cell-pen" aria-hidden="true" />
          </Button>
        ))}
      </div>

      <div className="tpg-tabs" id={`${uid}-tabs`}>
        <Tabs label={t('tp.tabsLabel')} tabs={tabs} value={tab} onChange={(id) => onTab?.(id)} panelId={`${uid}-panel`} />
        {history && wide && (
          <span className="tpg-history">
            <IconButton tone="plain" label={t('tp.undo.undoAria')} disabled={!history.canUndo} onClick={history.undo} data-testid="tpg-undo">
              <UndoIcon size={20} />
            </IconButton>
            <IconButton tone="plain" label={t('tp.undo.redoAria')} disabled={!history.canRedo} onClick={history.redo} data-testid="tpg-redo">
              <RedoIcon size={20} />
            </IconButton>
          </span>
        )}
      </div>

      <div className="tpg-body">
        <div className="tpg-main" role="tabpanel" id={`${uid}-panel`} aria-label={tabs.find((x) => x.id === tab)?.label}>
          {body}
          {footer}
        </div>
        {wide && (
          <aside className="tpg-side" aria-label={t('tp.sideLabel')}>
            {mapCard}
            {costCard}
            {tools}
          </aside>
        )}
      </div>

      {changing && (
        <ChangeTripSheet
          total={priced?.grandTotal}
          tripStart={tripStart}
          tripEnd={tripEnd}
          quoteDelta={quoteDelta}
          flightsBooked={Boolean(booked?.flights)}
          onDates={(a, b) => onDates?.(a, b)}
          history={history}
          onClose={() => setChanging(false)}
          open={{
            people: onChip ? openChip('people') : null,
            from: onChip && origin ? openChip('from') : null,
            flights: onFlights,
            stay: onLifestyle,
            places: () => go('itinerary'),
            settings: onSettings,
          }}
        />
      )}

      {/* T829, T886: below 1024 px the next steps stay in view in a bar over
          the bottom nav: Change your trip and Plan your days. The total is
          the cost card's alone, so the page says it once. */}
      {!wide && (
        <div className="tpg-dock" data-testid="tpg-dock">
          <Button variant="secondary" className="tpg-dock-change" iconStart={<PencilIcon size={16} />} onClick={change}>
            {t('tp.change')}
          </Button>
          {onPlanDays && (
            <Button variant="primary" className="tpg-dock-go" iconStart={<SparkIcon size={16} />} onClick={onPlanDays}>
              {t('trip.planYourDays')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
