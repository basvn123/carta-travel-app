import React, { useState, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import './TripSummary.css';
import { useI18n } from '../i18n/index.jsx';
import { Button, IconButton, Tabs } from '../components/ui/index.js';
import {
  ArrowLeftIcon, CalendarIcon, MoonIcon, PersonIcon, PencilIcon, SparkIcon, ShareIcon,
  ExpandIcon, ShrinkIcon, UndoIcon, RedoIcon, RouteIcon,
} from '../components/Icons.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { useAirlines } from '../lib/flights/useAirlines.js';
import { fmtDate } from '../lib/dates.js';
import { nightsBetween } from '../lib/tripDates.js';
import { partyText } from '../lib/party.js';
import { cityLabel } from '../lib/placeName.js';
import { useMedia } from '../browse/home/useHome.js';
import { RecordMapDialog } from '../auth/mytrips/parts.jsx';
import { CostCard } from './trip/CostCard.jsx';
import { ChangeTripSheet } from './trip/ChangeTripSheet.jsx';
import { bookRows } from './trip/ReadyToBook.jsx';
import { BookPasses } from './trip/BookPasses.jsx';
import { Journey } from './trip/Journey.jsx';
import { TripTrace } from './trip/TripTrace.jsx';
import { useSettings } from '../components/SettingsLine.jsx';
import { useLifestyleParts } from './planHooks.js';
import { bookedCount, countdownText, shownTripName } from './trip/tripHead.js';


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
/**
 * The trip's map as a titled card (T819; T1005, owner: "a title, a better
 * map with the full trajectory, clean"): the trip drawn on Europe
 * (TripTrace), then Open the map for the live map full size. Without a
 * trace, the live map as before.
 */
function MapCard({ map, mapFull, title, trace, headId }) {
  const { t } = useI18n();
  const [full, setFull] = useState(false);
  if (!map && !trace) return null;
  const drawn = trace?.stops?.length ? <TripTrace trace={trace} label={t('tp.map.title')} /> : null;
  return (
    <section className="tpg-mapcard" aria-labelledby={headId}>
      <div className="tpg-mapcard-top">
        <h2 className="tpg-h" id={headId}>{t('tp.map.title')}</h2>
        {(mapFull || map) && (
          <Button variant="quiet" size="sm" className="tpg-mapcard-open" iconStart={<ExpandIcon size={16} />} onClick={() => setFull(true)}>
            {t('saved.mapExpand')}
          </Button>
        )}
      </div>
      {drawn ? (
        <button type="button" className="tpg-mapcard-hit" onClick={() => (mapFull || map) && setFull(true)} aria-label={t('saved.mapExpand')}>
          {drawn}
        </button>
      ) : (
        <div className="tpg-map" data-testid="tpg-map">
          {!full && map}
          <div className="tpg-map-shield" aria-hidden="true" onClick={() => setFull(true)} />
          <IconButton tone="surface" className="tpg-map-expand" label={t('saved.mapExpand')} onClick={() => setFull(true)}>
            <ExpandIcon size={18} />
          </IconButton>
        </div>
      )}
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
    </section>
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
 *   onChangeFlight(dir)  T1003: the flight sheet, from the cost card's Flights row
 *                        and (T1005) the route's flight cards
 *   trace                T1005: the trip's points for the drawn map (TripTrace)
 *   bar                  round buttons on the top row (save)
 *   footer               the saved line under the page
 */
export function TripSummary({
  name, tripStart, tripEnd, party, stopDetails, stayCosts = [], stayTier = 'home',
  priced, flight = null, ownFlight = null, driveLegs = null, origin = '',
  tab = 'overview', onTab, panels = {}, map = null, mapFull = null,
  onPlanDays = null, onPlanHome = null, onSettings = null,
  onExport = null, bar = null, footer = null, history = null, onChip = null, onAddPaid = null, budgetCard = null, onChangeFlight = null, trace = null,
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
  // The Lifestyle sets what the days cost (one .lifestyle-btn door): a chip
  // with the trip's own, opening the same sheet as everywhere else.
  const settings = useSettings();
  const lifestyle = useLifestyleParts();
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
  // T1001: the When cell on two lines, so nothing is cut off: the days
  // ("5 Jun to 12 Jun"), then the weekdays and the nights ("Sat to Sat, 7 nights").
  const dayFmt = (iso, opts) => {
    try { return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang, { ...opts, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)); } catch { return ''; }
  };
  const datesShort = tripStart && tripEnd
    ? t('plan.dateRange', { a: dayFmt(tripStart, { day: 'numeric', month: 'short' }), b: dayFmt(tripEnd, { day: 'numeric', month: 'short' }) })
    : '';
  const datesSub = tripStart && tripEnd
    ? [t('plan.dateRange', { a: dayFmt(tripStart, { weekday: 'short' }), b: dayFmt(tripEnd, { weekday: 'short' }) }),
      nightsNote || (windowN > 0 ? t('pf.nightsN', { n: windowN }) : '')].filter(Boolean).join(', ')
    : '';
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
  // The country in the reader's language ("Griekenland", not the wire's "Greece").
  const leadCountry = (() => {
    try { return lead?.iso2 ? new Intl.DisplayNames([lang], { type: 'region' }).of(lead.iso2.toUpperCase()) : lead?.country; } catch { return lead?.country; }
  })();

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
    { key: 'dates', label: t('tp.bar.when'), text: datesShort || dates || t('pf.when.unsure'), sub: datesShort ? datesSub : nightsNote, onClick: openChip('dates'), dialog: Boolean(onChip) },
    { key: 'people', label: t('tp.bar.who'), text: people, onClick: openChip('people'), dialog: Boolean(onChip) },
    origin && { key: 'from', label: t('tp.bar.from'), text: origin, onClick: openChip('from'), dialog: Boolean(onChip) },
    onLifestyle && lifestyle && { key: 'lifestyle', label: t('tp.bar.stay'), text: lifestyle.bed, sub: lifestyle.vibe, onClick: onLifestyle, dialog: true },
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
      {/* T1011 (owner: "just one Change your trip"): it is the dock's on a
          phone and the top row's from 1024 px, never a tool as well. */}
      {onExport && (
        <Button variant="secondary" className="tpg-tool" iconStart={<ShareIcon size={18} />} onClick={() => onExport(null)}>
          {t('export.exportAndShare')}
        </Button>
      )}
    </div>
  );

  const mapCard = <MapCard map={map} mapFull={mapFull} title={title} trace={trace} headId={`${uid}-map`} />;

  // T886: what the trip costs, once: the side column from 1024 px (every
  // tab), the Overview on a phone. The budget lives inside it.
  const costCard = (
    <CostCard priced={priced} people={n} per={per} onPer={setPer} budget={budgetCard}
      aroundNote={carTip && carTip.verdict === 'yes' && !flight?.driving ? t('tp.tile.carAdvised') : ''}
      onOpen={(k) => go('costs', `tp-cost-${k}`)} onAll={() => go('costs')} onAddPaid={onAddPaid}
      lifestyle={lifestyle} onLifestyle={onLifestyle} onChangeFlight={onChangeFlight} />
  );

  const overview = (
    <div className="tpg-overview">
      {bookedNow.of > 0 && <BookPasses rows={rows} headId={`${uid}-next`} />}

      {!wide && costCard}
      {!wide && mapCard}

      <section className="tpg-route" aria-labelledby={`${uid}-route`}>
        <div className="tpg-route-top">
          <h2 className="tpg-h" id={`${uid}-route`}>{t('plan.yourRoute')}</h2>
          {onAddPaid && (
            <Button variant="quiet" size="sm" className="tpg-route-paid" iconStart={<PencilIcon size={14} />} onClick={onAddPaid}>
              {t('tp.addPaid')}
            </Button>
          )}
        </div>
        <Journey
          tripStart={tripStart} tripEnd={tripEnd} stopDetails={stopDetails} stayCosts={stayCosts} stayTier={stayTier}
          priced={priced} flight={flight} ownFlight={ownFlight} driveLegs={driveLegs} origin={origin} div={div}
          carTip={carTip} rows={rows} onCar={onCar} carDelta={carDelta} onChangeFlight={onChangeFlight}
        />
      </section>

      {!wide && tools}
    </div>
  );

  // T1007: on a phone the Costs tab opens on the cost card (from 1024 px it
  // is in the side column already); the receipt under it is the detail.
  const body = tab === 'overview' ? overview
    : tab === 'costs' && !wide ? <div className="tpg-costs">{costCard}{panels.costs || null}</div>
      : (panels[tab] || null);

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
            <span>{[leadCountry, t(places.length === 1 ? 'tp.places1' : 'tp.placesN', { n: places.length })].filter(Boolean).join(', ')}</span>
          </Button>
        </div>
      </header>

      <div className="tpg-tripbar" role="group" aria-label={t('tp.bar.label')}>
        {cells.map(({ key, label, text, sub, onClick, dialog }) => (
          <Button key={key} variant="quiet" className="tpg-cell" onClick={onClick} data-chip={key}
            aria-label={t('tp.bar.edit', { what: label, value: [text, sub].filter(Boolean).join(', ') })} aria-haspopup={dialog ? 'dialog' : undefined}
            ref={(el) => { chipEls.current[key] = el; }}>
            <span className="tpg-cell-k">{label}</span>
            <span className="tpg-cell-v">{text}</span>
            {sub && <span className="tpg-cell-sub">{sub}</span>}
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
