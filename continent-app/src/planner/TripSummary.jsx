import React, { useState, useId } from 'react';
import { createPortal } from 'react-dom';
import './TripSummary.css';
import { useI18n } from '../i18n/index.jsx';
import { Button, IconButton, Money, Segmented, Tabs } from '../components/ui/index.js';
import {
  ArrowLeftIcon, BedIcon, CalendarIcon, CarIcon, FerryIcon, HomeIcon, MoonIcon, PersonIcon, PencilIcon,
  TrainIcon, BusIcon, SparkIcon, ChevronRightIcon, MapPinIcon, LifestyleIcon, SettingsIcon, ShareIcon,
  ExpandIcon, ShrinkIcon,
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
import { useMedia } from '../browse/home/useHome.js';
import { RecordMapDialog } from '../auth/mytrips/parts.jsx';
import { CostTiles } from './trip/CostTiles.jsx';
import { useSettings } from '../components/SettingsLine.jsx';
import { useLifestyleLabel } from './planHooks.js';

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
 * The figures are the receipt's own: a way's fare, a stop's bed and days.
 */
function OverviewRoute({ tripStart, tripEnd, stopDetails, stayCosts, stayTier, priced, flight, ownFlight, driveLegs, origin, div }) {
  const { t } = useI18n();
  const airlines = useAirlines();
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
      return {
        Icon: PlaneIcon, label, mark: leg.airline,
        line: airlineName(airlines, leg.airline) || t('trip.modeFly'),
        sub: [t('flight.times', { dep: leg.dep, arr: leg.arr }), fmtDate(leg.date || date, true)],
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
    return { Icon: PlaneIcon, label, line: t('trip.modeFly'), notYet: true, sub: [date ? fmtDate(date, true) : ''], eur: null };
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
          <span className="ts-node-label">{w.label}</span>
          <span className="ts-node-title">
            {w.mark && <AirlineMark code={w.mark} size="sm" />}
            {w.line}
          </span>
          <span className="ts-node-sub">{w.notYet ? <NotYet /> : w.sub.filter(Boolean).join(' · ')}</span>
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
        return (
          <li className="ts-node is-stop" key={`${s.destinationId}-${i}`}>
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
            </div>
            <span className="ts-node-fig">{fig(sc?.total)}</span>
          </li>
        );
      })}
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
 *   tab, onTab           'overview' | 'itinerary' | 'costs' | 'days'
 *   panels               { itinerary, costs, days }: the other tabs' bodies
 *   map, mapFull         the map for the card, and for full size
 *   onPlanHome()         All trips
 *   onPlanDays()         the day questions; absent hides Plan your days
 *   onEdit()             the stop editor
 *   onSettings()         the trip settings (dates, people, from); settingsRef anchors it
 *   onLifestyle()        the Lifestyle sheet; absent hides the chip
 *   onExport()           Share and export (the Itinerary's export block)
 *   bar                  round buttons on the top row (save)
 *   footer               the saved line under the page
 */
export function TripSummary({
  name, tripStart, tripEnd, party, stopDetails, stayCosts = [], stayTier = 'home',
  priced, flight = null, ownFlight = null, driveLegs = null, origin = '',
  tab = 'overview', onTab, panels = {}, map = null, mapFull = null,
  onPlanDays = null, onEdit, onPlanHome = null, onSettings = null, settingsRef = null,
  onExport = null, bar = null, footer = null,
  // T830: Edit trip in the same page. mode 'edit' puts the editor where the
  // tabs' body goes, an Editing bar with Done where the tabs were, the name
  // as a field, and keeps the photos, the chips and the map.
  mode = 'view', editBody = null, onDone = null, onRename = null,
}) {
  const editing = mode === 'edit';
  const { t, lang } = useI18n();
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
  const photos = stopDetails
    .filter((s) => s.dest?.image?.url)
    .map((s) => ({ url: s.dest.image.url, city: cityLabel(s.dest.city) }))
    .filter((p, i, a) => a.findIndex((q) => q.url === p.url) === i)
    .slice(0, 3);
  const places = [...new Set(stopDetails.map((s) => cityLabel(s.dest?.city || '')).filter(Boolean))];

  const total = priced?.grandTotal;
  const perPerson = priced?.perPerson;
  const shown = per === 'person' ? perPerson : total;

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
  ];

  const chips = [
    { key: 'places', Icon: MapPinIcon, text: places.join(', ') || t('itin.unknown'), onClick: () => go('itinerary'), aria: t('tp.tab.itinerary') },
    { key: 'dates', Icon: CalendarIcon, text: [dates || t('pf.when.unsure'), nightsNote].filter(Boolean).join(' · '), onClick: onSettings, aria: t('wizard.summaryDates') },
    { key: 'people', Icon: PersonIcon, text: people, onClick: onSettings, aria: t('settings.party') },
    origin && { key: 'from', Icon: HomeIcon, text: origin, onClick: onSettings, aria: t('pf.settings') },
    onLifestyle && lifestyle && { key: 'lifestyle', Icon: LifestyleIcon, text: lifestyle, onClick: onLifestyle, aria: t('settings.lifestyle') },
  ].filter(Boolean);

  const tools = (
    <div className="tpg-tools" role="group" aria-label={t('plan.toolsTitle')}>
      {onPlanDays && wide && (
        <Button variant="primary" className="tpg-tool is-primary" iconStart={<SparkIcon size={18} />} onClick={onPlanDays}>
          {t('trip.planYourDays')}
        </Button>
      )}
      <Button variant="secondary" className="tpg-tool" iconStart={<PencilIcon size={18} />} onClick={onEdit}>
        {t('trip.sum.edit')}
      </Button>
      {onSettings && (
        <Button variant="secondary" className="tpg-tool" iconStart={<SettingsIcon size={18} />} onClick={onSettings}>
          {t('pf.settings')}
        </Button>
      )}
      {onExport && (
        <Button variant="secondary" className="tpg-tool" iconStart={<ShareIcon size={18} />} onClick={onExport}>
          {t('export.exportAndShare')}
        </Button>
      )}
    </div>
  );

  const mapCard = <MapCard map={map} mapFull={mapFull} title={name || t('itin.myTrip')} />;

  const overview = (
    <div className="tpg-overview">
      <section className="tpg-band" aria-labelledby={`${uid}-cost`} data-testid="ts-total">
        <div className="tpg-band-head">
          <div className="tpg-band-total">
            <h2 className="tpg-band-lbl" id={`${uid}-cost`}>
              {per === 'person'
                ? t('tp.totalAPerson')
                : t('receipt.total', { people: n === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n }) })}
            </h2>
            <span className="tpg-band-n" data-total={Number.isFinite(total) ? String(total) : ''}>
              {Number.isFinite(shown) ? <Money value={shown} est precision="cents" /> : <NotYet />}
            </span>
            {Number.isFinite(total) && (
              <span className="tpg-band-sub">
                {[
                  n > 1 && per === 'group' && Number.isFinite(perPerson) ? t('plan.aPerson', { price: formatMoney(perPerson, { precision: 'cents', locale: lang }) }) : '',
                  planned > 0 ? t('tp.aDay', { price: formatMoney(shown / planned, { precision: 'whole', locale: lang }) }) : '',
                ].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          {n > 1 && (
            <Segmented
              size="sm"
              label={t('tp.showFor')}
              value={per}
              onChange={setPer}
              options={[{ value: 'group', label: t('tp.forGroup') }, { value: 'person', label: t('tp.forPerson') }]}
            />
          )}
        </div>
        <CostTiles priced={priced} per={per} people={n} nights={planned} onOpen={(k) => go('costs', `tp-cost-${k}`)} />
        <Button variant="quiet" size="sm" className="tpg-band-more" iconEnd={<ChevronRightIcon size={16} />} onClick={() => go('costs')}>
          {t('tp.breakdown')}
        </Button>
      </section>

      {!wide && mapCard}

      <section className="tpg-route" aria-labelledby={`${uid}-route`}>
        <h2 className="tpg-h" id={`${uid}-route`}>{t('plan.yourRoute')}</h2>
        <OverviewRoute
          tripStart={tripStart} tripEnd={tripEnd} stopDetails={stopDetails} stayCosts={stayCosts} stayTier={stayTier}
          priced={priced} flight={flight} ownFlight={ownFlight} driveLegs={driveLegs} origin={origin} div={div}
        />
      </section>

      {!wide && tools}
    </div>
  );

  // Editing on a phone: the map card over the editor, so a stop added or
  // moved shows on the route at once.
  const body = editing ? <>{!wide && mapCard}{editBody}</> : tab === 'overview' ? overview : (panels[tab] || null);

  return (
    <div className={`tpg is-${editing ? 'edit' : tab}${wide ? '' : ' has-dock'}`}>
      <div className="tpg-top">
        {onPlanHome ? (
          <Button variant="quiet" size="sm" className="ts-back" iconStart={<ArrowLeftIcon size={18} />} onClick={onPlanHome}>
            {t('trip.sum.allTrips')}
          </Button>
        ) : <span />}
        <span className="tpg-bar">
          {bar}
          {onSettings && (
            <IconButton ref={settingsRef} tone="surface" label={t('pf.settings')} onClick={onSettings}>
              <SettingsIcon size={20} />
            </IconButton>
          )}
        </span>
      </div>

      {photos.length > 0 && (
        <div className={`tpg-hero is-${photos.length}`}>
          {photos.map((p, i) => (
            <HeroImage key={`${p.url}-${i}`} url={p.url} city={p.city} className="tpg-hero-img"
              ratio={i === 0 ? [3, 2] : [1, 1]} maxWidth={i === 0 ? 1600 : 640} eager={i === 0} />
          ))}
        </div>
      )}

      <header className="tpg-head">
        {editing && onRename ? (
          <>
            <h1 className="sr-only">{name || t('itin.myTrip')}</h1>
            <input
              className="tpg-name tpg-name-input"
              value={name}
              onChange={(e) => onRename(e.target.value)}
              placeholder={t('trip.namePlaceholder')}
              aria-label={t('trip.nameAria')}
            />
          </>
        ) : (
          <h1 className="pf-title tpg-name" tabIndex={-1}>{name || t('itin.myTrip')}</h1>
        )}
        <ul className="tpg-chips" aria-label={t('tp.tripFacts')}>
          {chips.map(({ key, Icon, text, onClick, aria }) => (
            <li key={key}>
              {onClick ? (
                <button type="button" className="tpg-chip" onClick={onClick} aria-label={`${aria}: ${text}`} data-chip={key}>
                  <Icon size={16} aria-hidden="true" /><span>{text}</span>
                </button>
              ) : (
                <span className="tpg-chip is-static" data-chip={key}><Icon size={16} aria-hidden="true" /><span>{text}</span></span>
              )}
            </li>
          ))}
        </ul>
      </header>

      {editing ? (
        <div className="tpg-editbar" id={`${uid}-tabs`}>
          <span className="tpg-editbar-lbl"><PencilIcon size={16} aria-hidden="true" />{t('tp.editing')}</span>
          {onDone && wide && (
            <Button variant="primary" size="sm" className="tpg-done trip-edit-done" onClick={onDone}>{t('trip.doneEditing')}</Button>
          )}
        </div>
      ) : (
        <div className="tpg-tabs" id={`${uid}-tabs`}>
          <Tabs label={t('tp.tabsLabel')} tabs={tabs} value={tab} onChange={(id) => onTab?.(id)} panelId={`${uid}-panel`} />
        </div>
      )}

      <div className="tpg-body">
        <div className="tpg-main" role={editing ? undefined : 'tabpanel'} id={`${uid}-panel`} aria-label={editing ? t('tp.editing') : tabs.find((x) => x.id === tab)?.label}>
          {body}
          {footer}
        </div>
        {wide && (
          <aside className="tpg-side" aria-label={t('tp.sideLabel')}>
            {mapCard}
            {editing ? (
              <div className="tpg-side-total" data-testid="ts-total">
                <span className="tpg-band-lbl">{t('receipt.total', { people: n === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n }) })}</span>
                <span className="tpg-band-n" data-total={Number.isFinite(total) ? String(total) : ''}>
                  {Number.isFinite(total) ? <Money value={total} est precision="cents" /> : <NotYet />}
                </span>
                {n > 1 && Number.isFinite(perPerson) && (
                  <span className="tpg-band-sub">{t('plan.aPerson', { price: formatMoney(perPerson, { precision: 'cents', locale: lang }) })}</span>
                )}
              </div>
            ) : tools}
          </aside>
        )}
      </div>

      {/* T829: below 1024 px the total and the next step stay in view, in a
          bar over the bottom nav (Expedia's summary bar on a phone). The
          figure follows the Group / Per person switch; tapping it opens the
          Costs tab. */}
      {!wide && (
        <div className="tpg-dock" data-testid="tpg-dock">
          <button type="button" className="tpg-dock-total" onClick={() => go('costs')}
            aria-label={`${per === 'person' ? t('tp.totalAPerson') : t('receipt.total', { people: n === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n }) })}: ${Number.isFinite(shown) ? formatMoney(shown, { precision: 'cents', locale: lang }) : t('data.notYet')}. ${t('tp.breakdown')}`}>
            <span className="tpg-dock-n">{Number.isFinite(shown) ? <Money value={shown} est precision="cents" /> : <NotYet />}</span>
            <span className="tpg-dock-lbl">
              {per === 'person' ? t('tp.totalAPerson') : t('receipt.total', { people: n === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n }) })}
            </span>
          </button>
          {editing && onDone ? (
            <Button variant="primary" className="tpg-dock-go trip-edit-done" onClick={onDone}>
              {t('trip.doneEditing')}
            </Button>
          ) : onPlanDays ? (
            <Button variant="primary" className="tpg-dock-go" iconStart={<SparkIcon size={16} />} onClick={onPlanDays}>
              {t('trip.planYourDays')}
            </Button>
          ) : (
            <Button variant="primary" className="tpg-dock-go" iconStart={<PencilIcon size={16} />} onClick={onEdit}>
              {t('trip.sum.edit')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
