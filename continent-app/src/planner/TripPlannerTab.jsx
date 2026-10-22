import React, { useEffect, useMemo, useRef, useState } from 'react';
// The rules only this route renders load with its chunk (T474, CSS per route;
// scripts/css-routes.mjs).
import '../styles/planners.css';
import { Dropdown } from '../components/Dropdown.jsx';
import { DateField } from '../components/DateField.jsx';
import { OriginPicker } from '../components/OriginPicker.jsx';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { favDestIds } from '../lib/favorites.js';
import { Button } from '../components/Button.jsx';
import { ErrorBlock } from '../components/StateBlocks.jsx';
import { TripMap } from '../map/TripMap.jsx';
import { TripItinerary, TransferModePicker } from './TripItinerary.jsx';
import { GuidedTripWizard } from './GuidedTripWizard.jsx';
import { PlanTotal } from './PlanTotal.jsx';
import { TripTotalBar } from './TripTotalBar.jsx';
import { MapDrawer } from '../components/MapDrawer.jsx';
import { SheetShell } from '../browse/SheetShell.jsx';
import {
  loadDeviceTrip, saveDeviceTrip, clearDeviceTrip, newDeviceKey, deviceSaveDecision, deviceMeetsAccount,
} from './deviceTripStore.js';
import { CheapTipsSection } from './CheapTipsSection.jsx';
import { fmtHours, eurExact } from '../lib/format.js';
import { formatApprox, formatEst } from '../lib/money.js';
import { fmtDate, laterISO, useToday, planningHorizon } from '../lib/dates.js';
import { fetchDrivingRoute } from '../lib/routing.js';
import { useTripPlanner } from '../hooks/useTripPlanner.js';
import { MAX_PARTY } from '../lib/tripTotal.js';
import { useLifestyleLabel } from './planHooks.js';
import { useCountryInsights } from '../hooks/useCountryInsights.js';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { fetchTripPlans } from '../auth/tripPlanStorage.js';
import { useI18n } from '../i18n/index.jsx';
import { loadAssignments, TRIP_DRAFT_PLAN_ID } from './dayPlanStore.js';
import { SparkIcon, TrainIcon, BusIcon, CarIcon, FerryIcon, BulbIcon, InfoIcon, CloseIcon, ChevronDownIcon, ExternalIcon } from '../components/Icons.jsx';
import { IconButton, Money, Chip, ChipGroup } from '../components/ui/index.js';
import { Stepper as KitStepper } from '../components/FilterControls.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { knownForFacts } from '../lib/knownFor.js';
import { geocodeAddress } from '../lib/geocode.js';
import { cityLabel } from '../lib/placeName.js';
import { scrollBehavior } from '../lib/motion.js';

// One shared empty catalogue for the moments before data lands. A fresh `{}`
// per render would hand every memo below a new dependency each time and
// rebuild the country and city lists on every render (T192).
const NO_DESTINATIONS = Object.freeze({});

// Small circular progress ring for "planned vs available nights".
function NightsRing({ planned, total }) {
  const pct = total > 0 ? Math.min(1, planned / total) : 0;
  const r = 15;
  const c = 2 * Math.PI * r;
  const over = total > 0 && planned > total;
  return (
    <svg className="nights-ring" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r={r} className="nights-ring-track" fill="none" strokeWidth="3" />
      <circle
        cx="20" cy="20" r={r} fill="none" strokeWidth="3" strokeLinecap="round"
        className={`nights-ring-arc ${over ? 'over' : ''}`}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 20 20)"
      />
    </svg>
  );
}

// The editor's stepper is the kit's (T458), with the unit beside the figure.
function Stepper({ value, onChange, min = 0, max = 60, suffix }) {
  const { t } = useI18n();
  return (
    <div className="trip-stepper">
      <KitStepper value={value} min={min} max={max} onChange={onChange} decLabel={t('trip.fewer')} incLabel={t('trip.more')} />
      {suffix && <span className="trip-step-suffix">{suffix(value)}</span>}
    </div>
  );
}

// `label` is an i18n key, render it through t().
const MODE_META = {
  train: { Icon: TrainIcon, label: 'trip.modeTrain' },
  bus: { Icon: BusIcon, label: 'trip.modeBus' },
  car: { Icon: CarIcon, label: 'trip.modeCar' },
  // Hops Carta prices from what the traveller paid, not from its own data.
  fly: { Icon: PlaneIcon, label: 'trip.modeFly' },
  ferry: { Icon: FerryIcon, label: 'trip.modeFerry' },
};
const ModeIcon = ({ mode, size = 13 }) => {
  const I = MODE_META[mode]?.Icon;
  return I ? <I size={size} className="trip-mode-icon" /> : null;
};

/**
 * The planned view's "More" menu (carta-design "More" menu rule, T388): the
 * footer keeps Plan your days and Save trip, and every further action sits
 * behind one secondary button with menu semantics. Escape and a click outside
 * close it and focus returns to the button; the arrow keys move between the
 * items. A destructive item is drawn in --danger text and keeps its confirm.
 */
function MoreMenu({ items }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const first = wrapRef.current?.querySelector('[role="menuitem"]');
    first?.focus();
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const list = [...(wrapRef.current?.querySelectorAll('[role="menuitem"]') || [])];
      if (!list.length) return;
      e.preventDefault();
      const i = list.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
      list[next].focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  const shown = items.filter(Boolean);
  if (!shown.length) return null;
  return (
    <div className="trip-more" ref={wrapRef}>
      <Button
        ref={btnRef}
        className="trip-more-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {t('trip.moreActions')}
      </Button>
      {open && (
        <div className="trip-more-menu" role="menu" aria-label={t('trip.moreActionsAria')}>
          {shown.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              className={`trip-more-item ${it.danger ? 'is-danger' : ''} ${it.className || ''}`}
              title={it.title}
              onClick={() => { setOpen(false); it.onClick(); }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** One overland leg between two stops: the chosen mode inline, expandable to
 *  compare all three (train/bus/car), switch mode, and jump to booking links. */
function LegRow({ leg, onMode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!leg) return <div className="trip-leg">↳ {t('trip.routeUnknown')}</div>;
  if (leg.no_road || !leg.mode) return <div className="trip-leg">↳ {leg.note || t('trip.noOverland')}</div>;
  const chosen = leg.modes[leg.mode];
  // A ground fare from the calibration or the prior is an estimate (groundFares.js).
  const legEst = Boolean(chosen.est || leg.est);
  return (
    <div className="trip-leg trip-leg-rich">
      <button className="trip-leg-main" onClick={() => setOpen(!open)} aria-expanded={open}>
        ↳ <ModeIcon mode={leg.mode} /> {chosen.own
          ? (chosen.eur_total > 0
            ? t('trip.legBookedSummary', { mode: t(MODE_META[leg.mode].label), price: eurExact(chosen.eur_total) })
            : `${t(MODE_META[leg.mode].label)}, ${t('trip.legBookedNoPrice')}`)
          : t('trip.legSummary', { mode: t(MODE_META[leg.mode].label), km: leg.road_km, price: legEst ? formatApprox(chosen.eur_pp, { precision: 'cents' }) : eurExact(chosen.eur_pp), hours: fmtHours(chosen.hours) })}
        {leg.long_haul && !chosen.own ? `, ${t('trip.longLeg')}` : ''}
        {!chosen.own && legEst && (
          <span className="fare-prov"><span className="fare-prov-est" title={t('prov.estTitle')}>{t('prov.est')}</span></span>
        )}
        <span className="trip-leg-caret">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="trip-leg-detail">
          <div className="trip-leg-modes">
            {Object.entries(leg.modes).map(([m, o]) => (
              <button
                key={m}
                className={`trip-leg-mode ${leg.mode === m ? 'on' : ''}`}
                onClick={() => onMode(m)}
                title={leg.recommended === m ? t('trip.cartaPick') : undefined}
              >
                <span><ModeIcon mode={m} /> {t(MODE_META[m].label)}{leg.recommended === m && !o.own && <span className="guide-reco-mark"><SparkIcon size={10} /></span>}</span>
                <b>{o.own && !(o.eur_total > 0) ? '-' : t('trip.perPersonShort', { price: !o.own && o.est ? formatEst(o.eur_pp, t('money.est'), { precision: 'cents' }) : eurExact(o.eur_pp) })}</b>
                <small>{o.own ? t('trip.legBooked') : `~${fmtHours(o.hours)}`}</small>
              </button>
            ))}
          </div>
          {chosen.note && <p className="trip-leg-note">{chosen.note}</p>}
          <div className="trip-leg-links">
            {chosen.links.map((l, j) => (
              <a key={j} href={l.url} target="_blank" rel="noreferrer">{l.label} <ExternalIcon size={12} className="link-ext" /></a>
            ))}
          </div>
          {!chosen.own && <p className="trip-leg-disclaimer">{t('trip.legDisclaimer')}</p>}
        </div>
      )}
    </div>
  );
}

/** "Driving from" editor for own-car trips: the drive out/home legs price
 *  from this point. Same explicit-search Nominatim flow as the wizard. */
function OwnCarFromEditor({ carHome, setCarHome }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const search = async () => {
    const q = query.trim();
    if (q.length < 3 || busy) return;
    setBusy(true);
    setResults(await geocodeAddress(q));
    setBusy(false);
  };
  if (carHome) {
    return (
      <p className="trip-note trip-carfrom-note">
        <CarIcon size={11} /> {t('trip.drivingFrom', { from: carHome.name })}
        {' '}
        <button className="trip-carfrom-change" onClick={() => setCarHome(null)}>{t('wizard.change')}</button>
      </p>
    );
  }
  return (
    <div className="trip-carfrom">
      <div className="trip-carfrom-row">
        <input
          className="trip-ownflight-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          placeholder={t('wizard.carFromPlaceholder')}
          aria-label={t('wizard.carFromLabel')}
        />
        <button className="trip-carfrom-btn" onClick={search} disabled={busy || query.trim().length < 3}>
          {busy ? t('wizard.searching') : t('wizard.search')}
        </button>
      </div>
      {results.length > 0 && (
        <div className="trip-carfrom-results">
          {results.map((r, i) => (
            <button
              key={`${r.lat},${r.lon},${i}`}
              className="trip-carfrom-result"
              onClick={() => { setCarHome({ name: r.shortLabel, lat: r.lat, lon: r.lon }); setResults([]); setQuery(''); }}
            >{r.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Suggestions({ suggestions, onPick }) {
  const { t } = useI18n();
  if (!suggestions.length) return null;
  return (
    <div className="trip-block">
      <div className="trip-block-title">{t('trip.suggestTitle')}</div>
      <div className="trip-suggest-row">
        {suggestions.map((s) => (
          <button
            key={s.id}
            className="trip-suggest-card"
            onClick={() => onPick(s)}
            title={t('trip.suggestFrom', { city: cityLabel(s.city), country: s.country, km: s.km, from: s.shared_origin || t('trip.overland') })}
          >
            <div className="trip-suggest-thumb" style={s.image ? { backgroundImage: `url(${s.image})` } : undefined}>
              {!s.image && <span className="trip-suggest-fallback">{cityLabel(s.city).slice(0, 1)}</span>}
              {s.reason && <span className="trip-suggest-chip">{s.reason}</span>}
            </div>
            <div className="trip-suggest-meta">
              <span className="trip-suggest-city">{cityLabel(s.city)}</span>
              <span className="trip-suggest-sub">
                {s.km} km
                {s.rating?.score != null && <ScoreChip rating={s.rating} size="xs" />}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The stops you already said you wanted.
 *
 * The shortlist existed and the planner never read it: you starred a city on
 * the map and then typed its name again here. This closes that. It sits
 * above the recommendations deliberately - your own wishes outrank the app's
 * suggestions - and it is drawn in the same card shape, because "somewhere I
 * might add" is one idea and should not look like two.
 *
 * Only DESTINATIONS appear: a trip stop is a place you sleep in, and a
 * shortlisted beach or walk is not one. They are reachable from the day
 * planner instead, which is where a beach belongs.
 *
 * A city already in the trip is dropped from the strip rather than shown
 * disabled: it is no longer somewhere you could add.
 */
function ShortlistStops({ rows, onPick }) {
  const { t } = useI18n();
  if (!rows.length) return null;
  return (
    <div className="trip-block">
      <div className="trip-block-title">{t('fav.addFromShortlist')}</div>
      <div className="trip-suggest-row">
        {rows.map((s) => (
          <button
            key={s.id}
            className="trip-suggest-card"
            onClick={() => onPick(s)}
            title={t('trip.add')}
          >
            <div className="trip-suggest-thumb" style={s.image ? { backgroundImage: `url(${s.image})` } : undefined}>
              {!s.image && <span className="trip-suggest-fallback">{cityLabel(s.city).slice(0, 1) || '?'}</span>}
            </div>
            <div className="trip-suggest-meta">
              <span className="trip-suggest-city">{cityLabel(s.city)}</span>
              <span className="trip-suggest-sub">
                {s.country}
                {s.rating?.score != null && <ScoreChip rating={s.rating} size="xs" />}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The stop a pin was tapped for, on the map itself (T432): where, when, how
 * many nights (changeable here), what its bed costs, and the way to the
 * place's own page. The map answers "what is this stop" without the list.
 */
function StopPeek({ stop, index, stayCost, onNights, onOpen, onClose }) {
  const { t } = useI18n();
  if (!stop?.dest) return null;
  const city = cityLabel(stop.dest.city);
  return (
    <div className="trip-peek" role="group" aria-label={city}>
      <span
        className="trip-peek-photo"
        style={stop.dest.image?.url ? { backgroundImage: `url(${stop.dest.image.url})` } : undefined}
        aria-hidden="true"
      />
      <div className="trip-peek-main">
        <p className="trip-peek-city"><span className="trip-peek-i">{index + 1}</span>{city}</p>
        <p className="trip-peek-when">
          {stop.arriveDate ? t('plan.dateRange', { a: fmtDate(stop.arriveDate, true), b: fmtDate(stop.departDate, true) }) : ''}
        </p>
        {stayCost && (
          <p className="trip-peek-bed">
            {t('plan.lineBeds')}{' '}
            {stayCost.ownAccom ? <Money value={stayCost.accomTotal} precision="cents" /> : <Money value={stayCost.accomTotal} est precision="cents" />}
          </p>
        )}
        <div className="trip-peek-row">
          <KitStepper
            value={stop.nights}
            min={1}
            max={30}
            onChange={onNights}
            ariaLabel={t(stop.nights === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n: stop.nights })}
            decLabel={t('trip.fewer')}
            incLabel={t('trip.more')}
          />
          <span className="trip-peek-nights">{t(stop.nights === 1 ? 'plan.nightOneWord' : 'plan.nightManyWord')}</span>
          {onOpen && (
            <Button size="sm" variant="quiet" onClick={() => onOpen(stop.destinationId)}>{t('plan.openPlace')}</Button>
          )}
        </div>
      </div>
      <IconButton label={t('wizard.close')} onClick={onClose} className="trip-peek-close"><CloseIcon size={16} /></IconButton>
    </div>
  );
}

// The receipt the total bar opens (one per planner view).
const RECEIPT_ID = 'trip-receipt';

/** "Sat 14 Nov to Sat 21 Nov, 3 stops" for a trip in the keep-which choice. */
function keptTripLine(t, label, start, end, stops) {
  return [
    start && end ? t('plan.dateRange', { a: fmtDate(start, true), b: fmtDate(end, true) }) : '',
    stops ? t(stops === 1 ? 'trip.stopsOne' : 'trip.stopsMany', { n: stops }) : '',
  ].filter(Boolean).join(', ') || label;
}

/**
 * A trip kept on this device meets an account that already holds a trip on
 * the free plan (T490-f): the traveller chooses which one to keep. Two equal
 * cards, one sentence, no default: nothing happens until one is chosen, and
 * closing keeps both where they are.
 */
function KeepTripChoice({ device, account, onKeepDevice, onKeepAccount, onClose }) {
  const { t } = useI18n();
  const d = device?.trip || {};
  const rows = [
    {
      key: 'device', name: d.planLabel || t('trip.keepDeviceName'), where: t('trip.keepOnDevice'),
      line: keptTripLine(t, '', d.tripStart, d.tripEnd, d.stops?.length || 0), onKeep: onKeepDevice,
    },
    {
      key: 'account', name: account?.label || t('trip.keepAccountName'), where: t('trip.keepInAccount'),
      line: keptTripLine(t, '', account?.start_date, account?.end_date, account?.cities?.length || 0), onKeep: onKeepAccount,
    },
  ];
  return (
    <SheetShell title={t('trip.keepTitle')} onClose={onClose} className="trip-keep-sheet" labelId="trip-keep-title">
      <p className="trip-keep-lead">{t('trip.keepLead')}</p>
      <ul className="trip-keep-list" role="list">
        {rows.map((r) => (
          <li key={r.key} className="trip-keep-card">
            <span className="trip-keep-where">{r.where}</span>
            <span className="trip-keep-name">{r.name}</span>
            {r.line && <span className="trip-keep-line">{r.line}</span>}
            <Button variant="secondary" className="trip-keep-btn" onClick={r.onKeep}>{t('trip.keepThis')}</Button>
          </li>
        ))}
      </ul>
    </SheetShell>
  );
}

export const TripPlannerTab = React.memo(function TripPlannerTab({ data, user, authConfigured, onRequestAuth, openPlanId, onOpenPlanConsumed, origin, onChangeOrigin, onPlanDay, openSharedTrip, onSharedTripConsumed, tripSeed = null, onTripSeedConsumed = null, stayTier = 'home', lifestyle = null, favorites = null, onOpenDest = null, onOpenCountry = null, onOpenTrip = null }) {
  const { t, lang } = useI18n();
  const paywall = usePaywall();
  const countryInsights = useCountryInsights();
  const lifestyleLabel = useLifestyleLabel();
  // `stayTier` is the lifestyle panel's "where you sleep" choice; the planner
  // prices its stays from the same setting as the map and the receipt.
  // The days are priced at the Lifestyle panel's habits, live, the same
  // value the wizard's estimate reads (T432).
  const tp = useTripPlanner(data, countryInsights, stayTier, lifestyle || data?.meta?.defaults?.lifestyle || null);
  // No offer opens when a trip is finished (T488-c): the pass appears only
  // when something paid is tapped.
  const destinations = data?.destinations || NO_DESTINATIONS;
  // Trip dates start today at the earliest, never at the fare window's
  // harvest date (see useToday).
  const today = useToday();
  const dateMin = laterISO(data?.meta?.start_date, today);
  const dateMax = planningHorizon(data?.meta?.end_date, today);

  const [pendingCountry, setPendingCountry] = useState('');
  const [pendingDestId, setPendingDestId] = useState('');
  // Which stop's "what is this city known for" facts are expanded (index|null).
  const [stopInfoIdx, setStopInfoIdx] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [selectedStop, setSelectedStop] = useState(null);
  // A published trip opened from Destinations arrives with stops but no dates,
  // so the editor opens on the window with a line saying why it is asking and
  // what happens once it has an answer. Cleared the moment a window exists.
  const [awaitingDates, setAwaitingDates] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  // The workspace (T500, roadmap 1.3c section 3 and 1.17): from 1024 px the
  // list on the left and the map on the right with the total bar under it;
  // below that the map fills the screen and the trip lies over it in the
  // shared three-state drawer (T490-h, T490-k). The map card page and the
  // drag sheet are gone.
  const [isDesk, setIsDesk] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );
  const [drawer, setDrawer] = useState('half');
  // A new key opens the receipt's lines (the total bar's one job).
  const [receiptKey, setReceiptKey] = useState(0);
  // The trip kept on this device without an account (T500, 2.19).
  const [deviceTrip, setDeviceTrip] = useState(() => loadDeviceTrip());
  const [deviceError, setDeviceError] = useState(false);
  // A device trip meeting an account that already holds one (T490-f).
  const [keepChoice, setKeepChoice] = useState(null);
  const [pendingMove, setPendingMove] = useState(null);
  const migrating = useRef(false);
  const stopRefs = useRef({});

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e) => setIsDesk(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // The wizard hands over a trip Carta already arranged (routed from the
  // fly-in, days filled from the interests), show it planned right away, with
  // the route on the map. Edit / Replan / Start over stay one tap away.
  const handleWizardComplete = (selection) => {
    tp.loadFromWizard(selection);
    tp.setPlanned(true);
    setWizardOpen(false);
    setSelectedStop(null);
    setDrawer('half');
  };

  const handleStartOver = () => {
    if (!window.confirm(t('trip.confirmStartOver'))) return;
    tp.clearPlan();
    setSelectedStop(null);
    setSaveError('');
  };

  // The planned overview had a close cross in its top card that called
  // clearPlan() and emptied an unsaved trip with one tap (row T377-e). Closing
  // without clearing would only have led to the editor, which is what Edit
  // stops does, so the cross is gone and Start over (with its confirm) is the
  // one way to clear a trip (T388).

  // A trip plan chosen from the Saved-trips overview: load it and switch
  // straight to its planned view, or, for { id, edit: true }, into the
  // editable stop list so dates/stops can be changed right away.
  useEffect(() => {
    if (!openPlanId) return;
    // The trip kept on this device, opened from My trips (T503, T500-a).
    if (typeof openPlanId === 'object' && openPlanId.device) {
      const stored = loadDeviceTrip();
      if (stored) { tp.loadSnapshot(stored.trip, stored.key); setSelectedStop(null); setDeviceTrip(stored); }
      onOpenPlanConsumed && onOpenPlanConsumed();
      return;
    }
    const planId = typeof openPlanId === 'object' ? openPlanId.id : openPlanId;
    const editMode = typeof openPlanId === 'object' && openPlanId.edit;
    tp.loadPlan(planId).then(() => {
      tp.setPlanned(!editMode);
      setSelectedStop(null);
    }).catch(() => {
      // A failed fetch used to leave the tab silently stuck; surface it instead.
      setSaveError(t('trip.openFailed'));
    });
    onOpenPlanConsumed && onOpenPlanConsumed();
  }, [openPlanId]); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot hand-off: tp is a fresh object every render, and a re-run before App clears the id would load the plan twice

  // A trip that arrived via a share link (decoded + sanitized in App): load it
  // like a wizard hand-over and open the planned view. Stops whose destination
  // id no longer exists in the data are dropped rather than crashing the view.
  useEffect(() => {
    if (!openSharedTrip) return;
    const d = openSharedTrip;
    const stops = d.stops.filter((s) => destinations[s.destinationId]);
    if (stops.length) {
      tp.loadFromWizard({
        startDate: d.tripStart,
        stops,
        label: d.label || '',
        groupSize: d.groupSize,
        transport: d.transportPref,
        pace: d.pace,
        baggage: d.baggage,
        anchorId: d.anchorId,
        anchorOrigin: d.anchorOrigin,
        returnAnchorId: d.returnAnchorId,
        ownFlight: d.ownFlight?.airline || d.ownFlight?.costTotal ? d.ownFlight : null,
        legModes: d.legModes,
        ownLegs: d.ownLegs,
        ownStays: d.ownStays,
        children: d.children,
        babies: d.babies,
      });
      // The sender's trip name wins here (loadFromWizard treats its label as a
      // fallback so wizard runs never clobber a typed name; a share must).
      tp.setPlanLabel(d.label || '');
      // A published itinerary carries stops and nights but no dates, and the
      // planned view is a dated thing: opening it on a trip with no window
      // showed a route whose every stop said nothing about when. So a trip that
      // arrives without dates lands in the editor, which opens on the travel
      // window and gates the rest of itself on having one. A shared trip that
      // DOES carry dates is a finished plan and opens planned, as before.
      tp.setPlanned(!!d.tripStart);
      setAwaitingDates(!d.tripStart);
      setSelectedStop(null);
    }
    onSharedTripConsumed && onSharedTripConsumed();
  }, [openSharedTrip]); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot hand-off: tp is a fresh object every render, and a re-run before App clears the trip would load it twice

  // A country seed ("Plan a trip here") with a trip already on the map: the
  // wizard is not on screen, so open it as the modal and let it take the
  // seed from there. On an empty planner the inline wizard already holds it.
  useEffect(() => {
    if (!tripSeed) return;
    if (tp.planned || tp.stopDetails.length > 0) setWizardOpen(true);
  }, [tripSeed, tp.planned, tp.stopDetails.length]);

  // Selecting a stop (via pin or card) scrolls its card into view.
  useEffect(() => {
    if (selectedStop == null) return;
    stopRefs.current[selectedStop]?.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
  }, [selectedStop]);

  // Drop the highlight if the selected stop was removed/reordered out of range.
  useEffect(() => {
    if (selectedStop != null && selectedStop >= tp.stopDetails.length) setSelectedStop(null);
  }, [tp.stopDetails.length, selectedStop]);

  // Manual "Add stop": country first, then city within it, picking both at once
  // made the combined list noisy, and country-first mirrors how travellers
  // actually think about where to go next.
  // Both scan the whole destinations map; memoize so a sheet-drag or stop-select
  // re-render doesn't re-dedupe/re-sort ~24,800 rows every time.
  const countryOptions = useMemo(
    () => [...new Set(Object.values(destinations).map((d) => d.country).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
      .map((c) => ({ value: c, label: c })),
    [destinations],
  );
  const cityOptions = useMemo(
    () => (pendingCountry
      ? Object.entries(destinations)
          .filter(([, d]) => d.country === pendingCountry)
          .map(([id, d]) => ({ value: id, label: cityLabel(d.city) }))
          .sort((a, b) => a.label.localeCompare(b.label))
      : []),
    [destinations, pendingCountry],
  );

  const hasDates = tp.tripStart && tp.tripEnd && tp.windowNights > 0;
  // Know before you go: the countries' rules and this trip's savings, as one
  // track (planner/CheapTipsSection.jsx, T432).
  const beforeYouGo = tp.stopDetails.length > 0 ? (() => {
    const tripCountries = [...new Set(tp.stopDetails.map((s) => s.dest?.country).filter(Boolean))];
    const withIntel = countryInsights ? tripCountries.filter((c) => countryInsights[c]) : [];
    return (
      <CheapTipsSection
        stopDetails={tp.stopDetails}
        tripStart={tp.tripStart}
        transportPref={tp.transportPref}
        groupSize={tp.groupSize}
        intelRecs={withIntel.map((c) => ({ country: c, rec: countryInsights[c] }))}
      />
    );
  })() : null;

  // What the traveller paid to get there or home (T432), typed on the
  // overview's route. One record holds both directions, kept apart.
  const setTravelPaid = (dir, n) => {
    const base = tp.ownFlight || { airline: '', mode: tp.transportPref === 'owncar' ? 'car' : 'fly' };
    const split = base.costOut != null || base.costBack != null;
    const costOut = dir === 'out' ? n : (split ? Number(base.costOut) || 0 : Number(base.costTotal) || 0);
    const costBack = dir === 'back' ? n : (split ? Number(base.costBack) || 0 : 0);
    tp.setOwnFlight({ ...base, costOut, costBack, costTotal: Math.round((costOut + costBack) * 100) / 100 });
  };
  // The inline builder is now only an editor for a trip that already exists,   // opened from Saved trips' "Edit", or "Edit stops" on a planned trip. A fresh
  // trip planner shows only the guide launcher; new trips are built by the wizard.
  const hasTrip = tp.stopDetails.length > 0;
  // The map's stops, held by value rather than rebuilt per render. TripMap
  // clears its pins and refits the camera whenever `stops` changes identity,
  // so a fresh array here replayed that whole redraw (and a 700 ms camera
  // glide) on every nights bump, stop select or sheet drag, none of which
  // moves a pin. stopDetails itself changes on every nights bump, so the
  // array is keyed on what the map draws: the coordinates and the names.
  // A planned trip's pins carry their nights (T432): the map reads as the
  // trip, "Berat, 3 nights", not as a row of numbers.
  const pinTag = (s) => (tp.planned ? t(s.nights === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n: s.nights }) : '');
  // A flown trip starts and ends at an airport (T458): the planned map shows
  // it as a pin of its own, and the road to it is part of the drawn route.
  const flying = Boolean(tp.planned && tp.flight && !tp.flight.driving
    && (tp.flight.combinable || (tp.flight.own && (tp.flight.mode || 'fly') === 'fly')));
  const airportOf = (dest) => {
    const iata = dest?.anchor_airport || null;
    const o = iata ? data?.meta?.origins?.[iata] : null;
    return o && o.lat != null ? { lat: o.lat, lon: o.lon, city: `${cityLabel(o.city || iata)} ${iata}`, tag: t('plan.pinAirport'), plain: true, airport: true } : null;
  };
  const geoStops = tp.stopDetails.filter((s) => s.dest && s.dest.lat != null && s.dest.lon != null);
  const airIn = flying ? airportOf(geoStops[0]?.dest) : null;
  const airOut = flying ? airportOf(geoStops[geoStops.length - 1]?.dest) : null;
  const mapStopsKey = [
    airIn ? `${airIn.lat},${airIn.lon}` : '',
    ...geoStops.map((s) => `${s.dest.lat},${s.dest.lon},${cityLabel(s.dest.city)},${pinTag(s)}`),
    airOut ? `${airOut.lat},${airOut.lon}` : '',
  ].join('|');
  const mapStops = useMemo(
    () => [
      ...(airIn ? [airIn] : []),
      ...tp.stopDetails
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.dest && s.dest.lat != null && s.dest.lon != null)
        .map(({ s, i }) => ({
          lat: s.dest.lat, lon: s.dest.lon, city: cityLabel(s.dest.city), tag: pinTag(s),
          tagImg: tp.planned ? (s.dest.image?.url || null) : null, stopIndex: i,
        })),
      // Flying home from the same airport: the route still returns to it,
      // with no second pin on top of the first.
      ...(airOut ? [airIn && airIn.lat === airOut.lat && airIn.lon === airOut.lon ? { ...airOut, ghost: true } : airOut] : []),
    ],
    [mapStopsKey], // eslint-disable-line react-hooks/exhaustive-deps -- keyed by value on purpose, see above
  );
  // The pins TripMap draws (no ghost), and its indexes back to the trip's.
  const pinStops = useMemo(() => mapStops.filter((m) => !m.ghost), [mapStops]);
  const toStop = (i) => (pinStops[i]?.stopIndex ?? null);
  const toMapIndex = (stop) => (stop == null ? null : pinStops.findIndex((m) => m.stopIndex === stop));

  // Draw the real road route through the stops whenever there are two or more
  // (keyless OSRM, same as the day planner's walking route), while editing
  // AND once planned, so the line never cuts across water when a road exists.
  // Keyed on the coordinates so a stale response for a since-changed route is
  // ignored; falls back to the dashed straight-line hops when the router has
  // no answer (a genuine sea crossing).
  const routeKey = mapStops.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join(';');
  const [tripRoute, setTripRoute] = useState(null);
  useEffect(() => {
    if (mapStops.length < 2) { setTripRoute(null); return undefined; }
    let alive = true;
    fetchDrivingRoute(mapStops).then((r) => { if (alive && r) setTripRoute({ key: routeKey, ...r }); });
    return () => { alive = false; };
  }, [mapStops, routeKey]);
  const tripRouteOk = tripRoute && tripRoute.key === routeKey;

  const addPending = () => {
    if (!pendingDestId) return;
    tp.addStop(pendingDestId);
    setPendingDestId('');
  };

  /**
   * The shortlist as stops you could add.
   *
   * Destinations only (a shortlisted beach is not somewhere you sleep), and
   * anything already in the trip is dropped rather than shown disabled: it
   * is no longer somewhere you could add.
   */
  const shortlistStops = useMemo(() => {
    if (!favorites || !favorites.size) return [];
    const already = new Set(tp.stopDetails.map((st) => st.destinationId));
    const out = [];
    for (const id of favDestIds(favorites)) {
      if (already.has(id)) continue;
      const d = destinations[id];
      if (!d) continue;
      out.push({ id, city: cityLabel(d.city), country: d.country, image: d.image?.url || null, rating: d.rating });
    }
    return out;
  }, [favorites, destinations, tp.stopDetails]);

  const handlePendingCountry = (c) => {
    setPendingCountry(c);
    setPendingDestId(''); // city choice no longer valid once the country changes
  };

  const notify = (msg) => {
    setSaveNotice(msg);
    window.setTimeout(() => setSaveNotice(''), 3500);
  };

  // Without an account the first trip is kept on this device (T473, T500):
  // "Save trip" writes it to carta.deviceTrip.v1 and says so. A second trip
  // asks for the pass, as a second account trip does; a browser that keeps
  // nothing (a private window, a full store) says so and offers sign-in.
  const saveOnDevice = () => {
    if (deviceSaveDecision(loadDeviceTrip(), tp.deviceKey) === 'second') {
      paywall.require('save');
      return;
    }
    const key = tp.deviceKey || newDeviceKey();
    if (!saveDeviceTrip({ key, trip: tp.snapshot })) {
      setDeviceError(true);
      return;
    }
    tp.setDeviceKey(key);
    setDeviceTrip(loadDeviceTrip());
    setDeviceError(false);
    notify(t('trip.savedDeviceNotice'));
  };

  const handleSave = async () => {
    setSaveError('');
    if (!user) { saveOnDevice(); return; }
    const wasUpdate = Boolean(tp.planId);
    const fromEdit = !tp.planned;
    // A free traveller keeps one trip. The second one is somebody who came
    // back, which is the person worth asking. Saving over an existing trip is
    // never gated, and the count is only fetched when it can change the
    // answer, so a pass holder never pays for the round trip.
    if (!wasUpdate && !paywall.paid) {
      let existing = [];
      try { existing = await fetchTripPlans(user.id); } catch { existing = []; }
      if (existing.length >= 1 && !paywall.require('save')) return;
    }
    try {
      await tp.savePlan(user.id);
      notify(wasUpdate ? t('trip.updatedNotice') : t('trip.savedNotice'));
      if (fromEdit && wasUpdate) {
        // Done editing an existing trip: hand the traveller back to the Trip
        // planner's start page (the trip itself is safe under Saved trips).
        tp.clearPlan();
        setSelectedStop(null);
      }
    } catch (e) {
      // The service's own text ("JWT expired", a constraint name) is for the
      // console; the traveller gets what failed and what to do (T193).
      console.warn('trip save failed', e);
      setSaveError(t('state.tripSaveFailed'));
    }
  };

  // A trip kept on the device follows its edits, as a day plan does: once
  // kept, it stays "Saved on this device" without a second press.
  const keptHere = !user && Boolean(tp.deviceKey) && deviceTrip?.key === tp.deviceKey;
  useEffect(() => {
    if (!keptHere || !tp.stops.length) return;
    if (!saveDeviceTrip({ key: tp.deviceKey, trip: tp.snapshot })) setDeviceError(true);
  }, [tp.snapshot]); // eslint-disable-line react-hooks/exhaustive-deps -- written when the trip changes, not when the key is first set (saveOnDevice already wrote it)

  // Signing in with a trip on the device (T490-f). With room on the account
  // (no trip yet, or a pass) the trip moves across; on the free plan with a
  // trip already there, the traveller chooses which one to keep.
  useEffect(() => {
    if (!user || migrating.current) return;
    const stored = loadDeviceTrip();
    if (!stored) return;
    migrating.current = true;
    (async () => {
      let existing;
      try { existing = await fetchTripPlans(user.id); } catch { migrating.current = false; return; }
      const how = deviceMeetsAccount(stored, existing.length, paywall.paid);
      if (how === 'move') setPendingMove({ stored, asPlanId: null });
      else if (how === 'choose') setKeepChoice({ stored, account: existing[0] });
    })();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps -- once per sign-in

  // The move itself waits one render: the device trip is put on the planner
  // first, then saved, so savePlan reads the trip it is saving.
  useEffect(() => {
    if (!pendingMove || !user) return;
    const { stored, asPlanId } = pendingMove;
    if (tp.deviceKey !== stored.key) { tp.loadSnapshot(stored.trip, stored.key); return; }
    setPendingMove(null);
    tp.savePlan(user.id, { asPlanId }).then(() => {
      clearDeviceTrip();
      setDeviceTrip(null);
      notify(t('trip.savedNotice'));
    }).catch((e) => {
      console.warn('device trip move failed', e);
      setSaveError(t('state.tripSaveFailed'));
    });
  }, [pendingMove, tp.deviceKey, user]); // eslint-disable-line react-hooks/exhaustive-deps -- tp is a fresh object every render

  const keepDeviceTrip = () => {
    const c = keepChoice;
    setKeepChoice(null);
    if (c) setPendingMove({ stored: c.stored, asPlanId: c.account.id });
  };
  const keepAccountTrip = () => {
    const c = keepChoice;
    setKeepChoice(null);
    clearDeviceTrip();
    setDeviceTrip(null);
    if (!c) return;
    tp.loadPlan(c.account.id).then(() => { tp.setPlanned(true); setSelectedStop(null); })
      .catch(() => setSaveError(t('trip.openFailed')));
  };

  // Which itinerary days already have Day-planner picks on this device, so the
  // per-day button can honestly read "Modify" instead of "Plan". Re-read when
  // the planned view (re)opens, picks are made over in the Day planner tab.
  const dayAssignments = useMemo(
    () => (tp.planned ? loadAssignments(tp.planId || TRIP_DRAFT_PLAN_ID) : {}),
    [tp.planned, tp.planId],
  );
  const isDayPlanned = (stopIndex, dayOfStay) => {
    const picks = dayAssignments?.[stopIndex]?.[dayOfStay - 1];
    return Array.isArray(picks) && picks.length > 0;
  };

  // Planned-view actions, pinned at the BOTTOM of the sheet on every layout,
  // in ONE row (T388, brief item 7): the primary, Save trip as the secondary,
  // and everything else behind "More" (Edit stops, Replan route, Start over).
  const plannedActionButtons = (
    <>
      {/* Arranging the trip settles the cities, the nights and the legs, and
          leaves the days empty. That next step had no door here: the traveller
          had to find the Day planner tab and pick their own trip out of it. */}
      {/* One primary: planning the days is the step forward when there is
          a door to it; otherwise saving is. Everything else is the shared
          secondary Button (T193). */}
      {onPlanDay && tp.stopDetails.length > 0 && (
        <Button
          variant="primary"
          className="trip-planday-btn"
          onClick={() => onPlanDay({ planId: tp.planId, stopIndex: 0, dayIndex: 0 })}
        >
          <SparkIcon size={14} /> {t('trip.planYourDays')}
        </Button>
      )}
      <Button
        variant={onPlanDay && tp.stopDetails.length > 0 ? 'secondary' : 'primary'}
        className="trip-save-planned-btn"
        onClick={handleSave}
        disabled={tp.saveState === 'saving'}
      >
        {tp.saveState === 'saving' ? t('trip.saving') : tp.saveState === 'saved' || keptHere ? t('trip.savedTick') : tp.planId ? t('trip.updateTrip') : t('trip.saveTrip')}
      </Button>
      <MoreMenu
        items={[
          { key: 'edit', className: 'trip-edit-btn', label: t('trip.editStops'), title: t('trip.editStopsTitle'), onClick: () => tp.setPlanned(false) },
          tp.stopDetails.length >= 3 && { key: 'replan', className: 'trip-plan-again-btn', label: t('trip.replanRoute'), title: t('trip.replanTitle'), onClick: () => tp.optimizeRoute() },
          { key: 'over', className: 'trip-startover-btn', label: t('trip.startOver'), title: t('trip.startOverTitle'), danger: true, onClick: handleStartOver },
        ]}
      />
    </>
  );

  // An empty planner has nothing to put on a map: no stops, no route, no
  // prices. So the tab opens on the question instead of on a locator map of
  // Europe, and the guide runs as the page itself, under the app header,
  // rather than as a modal that covers it. The map layout returns the moment
  // there is a trip to draw.
  const emptyPlanner = !tp.planned && tp.stopDetails.length === 0;
  if (emptyPlanner) {
    return (
      <div className="trip-planner-screen trip-planner-blank">
        <GuidedTripWizard
          inline
          data={data}
          stayTier={tp.stayTier}
          lifestyle={lifestyle}
          favorites={favorites}
          onOpenDest={onOpenDest}
          onOpenCountry={onOpenCountry}
          onOpenTrip={onOpenTrip}
          onCancel={() => setWizardOpen(false)}
          onComplete={handleWizardComplete}
          seed={tripSeed}
          onSeedConsumed={onTripSeedConsumed}
        />
        {saveNotice && <div className="trip-save-toast" role="status">{saveNotice}</div>}
        {keepChoice && (
          <KeepTripChoice
            device={keepChoice.stored}
            account={keepChoice.account}
            onKeepDevice={keepDeviceTrip}
            onKeepAccount={keepAccountTrip}
            onClose={() => setKeepChoice(null)}
          />
        )}
      </div>
    );
  }

  // The list: the planned trip, or the stop editor (T500: the same place).
  const listBody = (
    <>
          {tp.planned ? (
            <>
            <TripItinerary
              dayPlan={tp.dayPlan}
              label={tp.planLabel}
              stopDetails={tp.stopDetails}
              grandTotal={tp.grandTotal}
              groupSize={tp.groupSize}
              onSetGroupSize={(n) => tp.setGroupSize(Math.max(1, Math.min(MAX_PARTY, n)))}
              priced={tp.priced}
              party={{ adults: tp.groupSize, children: tp.children, babies: tp.babies }}
              onSetParty={tp.setParty}
              ownFlight={tp.ownFlight}
              onTravelPaid={setTravelPaid}
              onOwnLeg={(i, mode, n) => tp.setOwnLeg(i, mode, n)}
              onOwnStay={tp.setOwnStay}
              flightHours={tp.flightHours}
              onFlightHours={tp.setFlightHours}
              baggage={tp.baggage}
              receiptId={RECEIPT_ID}
              receiptOpenKey={receiptKey}
              onPdf={async () => {
                const { downloadPlanPdf } = await import('../lib/planPdf.js');
                await downloadPlanPdf({
                  label: tp.planLabel, priced: tp.priced, dayPlan: tp.dayPlan,
                  lifestyle: lifestyleLabel, t, lang, transportPref: tp.transportPref,
                });
              }}
              beforeSlot={beforeYouGo}
              flight={tp.flight}
              legs={tp.legs}
              setLegMode={tp.setLegMode}
              anchorLegs={tp.anchorLegs}
              flightTransfer={tp.flightTransfer}
              transferMode={tp.transferMode}
              setTransferMode={tp.setTransferMode}
              driveLegs={tp.driveLegs}
              stayCosts={tp.stayCosts}
              carRental={tp.carRental}
              vignettes={tp.vignettes}
              tripHasCar={tp.tripHasCar}
              activeStopIndex={selectedStop}
              onSelectStop={setSelectedStop}
              isDayPlanned={isDayPlanned}
              extrasPlanId={tp.planId || TRIP_DRAFT_PLAN_ID}
              sharePayload={tp.stops.length ? {
                tripStart: tp.tripStart,
                stops: tp.stops,
                groupSize: tp.groupSize,
                transportPref: tp.transportPref,
                legModes: tp.legModes,
                ownLegs: tp.ownLegs,
                ownStays: tp.ownStays,
                children: tp.children,
                babies: tp.babies,
                pace: tp.pace,
                baggage: tp.baggage,
                anchorId: tp.anchorId,
                anchorOrigin: tp.anchorOrigin,
                returnAnchorId: tp.returnAnchorId,
                ownFlight: tp.ownFlight,
                label: tp.planLabel,
              } : null}
              onPlanDay={onPlanDay ? (day) => onPlanDay({
                planId: tp.planId,
                stopIndex: day.stopIndex,
                dayIndex: day.dayOfStay - 1,
              }) : null}
            />
            </>
          ) : hasTrip ? (
          <>
          {/* Step 1 - travel window */}
          <div className="trip-block">
            <div className="trip-block-title">{t('trip.whenTitle')}</div>
            {awaitingDates && !hasDates && (
              <p className="trip-awaiting-dates">{t('trip.tripNeedsDates', { trip: tp.planLabel || t('trip.thisTrip') })}</p>
            )}
            {/* The window is answered, so the only thing left on a published
                trip is how they reach it. One button, straight to the overview
                where the legs are, instead of scrolling past every stop to
                find out the editor has no way out. */}
            {awaitingDates && hasDates && (
              <button
                className="trip-to-legs-btn"
                onClick={() => { setAwaitingDates(false); tp.setPlanned(true); setSelectedStop(null); }}
              >
                {t('trip.onToGettingThere')} <span aria-hidden="true">&rarr;</span>
              </button>
            )}
            <div className="trip-dates-row">
              <label className="trip-field">
                <span className="trip-field-label">{t('trip.start')}</span>
                <DateField value={tp.tripStart} min={dateMin} max={tp.tripEnd || dateMax} onChange={tp.setTripStart} placeholder={t('trip.startDate')} />
              </label>
              <span className="trip-dates-arrow" aria-hidden="true">→</span>
              <label className="trip-field">
                <span className="trip-field-label">{t('trip.end')}</span>
                <DateField value={tp.tripEnd} min={tp.tripStart || dateMin} max={dateMax} onChange={tp.setTripEnd} placeholder={t('trip.endDate')} />
              </label>
            </div>
          </div>

          {/* Step 2 - where the trip starts from. Dates first, then this, then
              the stops - the same order a traveller actually decides things. */}
          {hasDates && onChangeOrigin && (
            <div className="trip-block">
              <div className="trip-block-title">{t('trip.whereFromTitle')}</div>
              <div className="trip-origin-row">
                <OriginPicker data={data} origin={origin} onChangeOrigin={onChangeOrigin} />
              </div>
            </div>
          )}

          {hasDates && (
            <>
              {/* Planned-nights indicator */}
              <div className="trip-nights-summary">
                <NightsRing planned={tp.plannedNights} total={tp.windowNights} />
                <div className="trip-nights-text">
                  {t('trip.nightsOfWindow', { n: tp.plannedNights, of: tp.windowNights })}
                  {tp.plannedNights > tp.windowNights && <span className="trip-nights-warn"> {t('trip.overWindow')}</span>}
                </div>
              </div>

              {/* Stops list */}
              {tp.stopDetails.length > 0 && (
                <div className="trip-stops">
                  {tp.stopDetails.map((s, i) => (
                    <React.Fragment key={i}>
                      <div className="trip-stop-wrap">
                        <div
                          className={`trip-stop ${selectedStop === i ? 'active' : ''} ${dragIdx === i ? 'dragging' : ''}`}
                          ref={(el) => { stopRefs.current[i] = el; }}
                          onClick={() => setSelectedStop(i)}
                          // The row has no button of its own to pick it with,
                          // so focus reaching any control inside the row
                          // picks it, the way a click on the row does (T190).
                          onFocus={() => setSelectedStop(i)}
                          onDragOver={(e) => { if (dragIdx != null) e.preventDefault(); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (dragIdx != null && dragIdx !== i) tp.reorderStop(dragIdx, i);
                            setDragIdx(null);
                          }}
                        >
                          <div
                            className="trip-stop-idx"
                            draggable
                            onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; }}
                            onDragEnd={() => setDragIdx(null)}
                            title={t('trip.dragReorder')}
                          >{i + 1}</div>
                          <div className="trip-stop-body">
                            <div className="trip-stop-city">
                              {s.dest ? cityLabel(s.dest.city) : t('trip.unknown')}
                              {s.dest && (
                                <button
                                  className={`guide-city-info-btn ${stopInfoIdx === i ? 'open' : ''}`}
                                  onClick={(e) => { e.stopPropagation(); setStopInfoIdx(stopInfoIdx === i ? null : i); }}
                                  aria-expanded={stopInfoIdx === i}
                                  title={t('trip.aboutCity', { city: cityLabel(s.dest.city) })}
                                ><InfoIcon size={12} /></button>
                              )}
                            </div>
                            <div className="trip-stop-when">
                              {s.arriveDate ? t('plan.dateRange', { a: fmtDate(s.arriveDate, true), b: fmtDate(s.departDate, true) }) : t('trip.setDates')}
                            </div>
                          </div>
                          <Stepper
                            value={s.nights}
                            onChange={(n) => tp.setStopNights(i, n)}
                            suffix={(n) => (n === 1 ? t('trip.nightOne') : t('trip.nightMany'))}
                          />
                          <div className="trip-stop-tools" onClick={(e) => e.stopPropagation()}>
                            {i > 0 && (
                              <IconButton className="trip-stop-move is-up" label={t('trip.moveUp')} onClick={() => tp.moveStop(i, -1)}>
                                <ChevronDownIcon size={18} />
                              </IconButton>
                            )}
                            {i < tp.stopDetails.length - 1 && (
                              <IconButton className="trip-stop-move" label={t('trip.moveDown')} onClick={() => tp.moveStop(i, 1)}>
                                <ChevronDownIcon size={18} />
                              </IconButton>
                            )}
                            <IconButton className="trip-stop-remove" label={t('trip.removeStopAria')} onClick={() => tp.removeStop(i)}>
                              <CloseIcon size={16} />
                            </IconButton>
                          </div>
                        </div>
                        {/* Full width of the row (not squeezed into the narrow
                            body column alongside the stepper and tools), so
                            long facts read as normal sentences instead of
                            wrapping one word per line. */}
                        {stopInfoIdx === i && s.dest && (
                          <div className="guide-city-facts" onClick={(e) => e.stopPropagation()}>
                            {knownForFacts(s.dest).map(([label, value]) => (
                              <div className={`guide-city-fact ${label === 'Known for' ? 'guide-city-fact-known' : ''}`} key={label}>
                                <span className="guide-city-fact-label">{label}</span>
                                <span className="guide-city-fact-value">{value}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {i < tp.legs.length && (
                        <LegRow leg={tp.legs[i]} onMode={(m) => tp.setLegMode(i, m)} />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* How to travel between the stops */}
              {tp.stopDetails.length > 1 && (
                <div className="trip-block">
                  <div className="trip-block-title">{t('trip.betweenTitle')}</div>
                  <ChipGroup label={t('trip.betweenTitle')} className="trip-transport-chips">
                    {[
                      ['auto', SparkIcon, 'trip.cartaPicks'],
                      ['public', TrainIcon, 'trip.trainBus'],
                      ['car', CarIcon, 'trip.rentalCarOpt'],
                      ['owncar', CarIcon, 'trip.ownCarOpt'],
                    ].map(([k, ModeIco, lbl]) => (
                      <Chip key={k} kind="choice" selected={tp.transportPref === k} onClick={() => tp.setTransportPref(k)}>
                        {React.createElement(ModeIco, { size: 16 })} {t(lbl)}
                      </Chip>
                    ))}
                  </ChipGroup>
                  {tp.transportPref === 'car' && tp.carRental && (
                    <p className="trip-note">
                      {t('trip.carRentalNote', { total: eurExact(tp.carRental.eur_total), days: tp.carRental.days, perDay: eurExact(tp.carRental.eur_per_day), group: tp.groupSize })}
                    </p>
                  )}
                  {tp.transportPref === 'owncar' && (
                    <>
                      <p className="trip-note">{t('trip.ownCarNote')}</p>
                      <OwnCarFromEditor carHome={tp.carHome} setCarHome={tp.setCarHome} />
                    </>
                  )}
                </div>
              )}

              {/* Cheaper order. The cheaper-dates rows ranked start dates by
                  frozen flight fares and went with T273: Carta does not price
                  flights. */}
              {tp.stopDetails.length > 0 && tp.cheaperOrder && (
                <div className="trip-block trip-savings">
                  <div className="trip-block-title"><BulbIcon size={13} /> {t('trip.cheaperTitle')}</div>
                  <div className="trip-saving-row">
                    <span>{t('trip.cheaperOrder', { amount: eurExact(tp.cheaperOrder.saving_eur) })}</span>
                    <button onClick={tp.applyCheaperOrder}>{t('trip.reorder')}</button>
                  </div>
                </div>
              )}

              {/* Your own wishes first, then the app's recommendations. */}
              <ShortlistStops rows={shortlistStops} onPick={(s) => tp.addStop(s.id)} />

              {/* Recommendations */}
              <Suggestions suggestions={tp.nextStopSuggestions} onPick={(s) => tp.addStop(s.id)} />

              {/* Add stop */}
              <div className="trip-block">
                <div className="trip-block-title">{tp.stopDetails.length === 0 ? t('trip.addFirstStop') : t('trip.addAnotherStop')}</div>
                <div className="trip-add-row">
                  <Dropdown
                    className="trip-add-country"
                    value={pendingCountry}
                    onChange={handlePendingCountry}
                    options={countryOptions}
                    placeholder={t('trip.country')}
                    searchPlaceholder={t('trip.searchCountries')}
                  />
                  <Dropdown
                    className="trip-add-city"
                    value={pendingDestId}
                    onChange={setPendingDestId}
                    options={cityOptions}
                    placeholder={pendingCountry ? t('trip.city') : t('trip.pickCountryFirst')}
                    searchPlaceholder={t('trip.searchCities')}
                    disabled={!pendingCountry}
                  />
                  <button className="trip-add-btn" onClick={addPending} disabled={!pendingDestId}>{t('trip.add')}</button>
                </div>
              </div>

              {/* The editor prices through the one receipt (T490-j): every
                  line from tripLines(), no sum of its own. */}
              {tp.stopDetails.length > 0 && (
                <>
                  <PlanTotal
                    id={RECEIPT_ID}
                    openKey={receiptKey}
                    priced={tp.priced}
                    party={{ adults: tp.groupSize, children: tp.children, babies: tp.babies }}
                    onParty={tp.setParty}
                    variant="card"
                    title={t('plan.tripTotal')}
                  />
                  {/* Not when Carta has a flight on the receipt (T518). */}
                  {tp.flight?.combinable && !tp.flight?.own && !tp.priced?.cartaFlight?.out && !tp.priced?.cartaFlight?.back && (
                    <div className="trip-saving-row trip-flight-own-door">
                      <span>{t('trip.flightNotPriced')}</span>
                      <button onClick={() => tp.setOwnFlight({ airline: '', costTotal: 0, mode: 'fly' })}>{t('trip.addOwnFare')}</button>
                    </div>
                  )}
                  <TransferModePicker
                    flightTransfer={tp.flightTransfer}
                    anchorIn={tp.anchorLegs?.in}
                    anchorOut={tp.anchorLegs?.out}
                    setTransferMode={tp.setTransferMode}
                  />
                  {!authConfigured && <p className="trip-note">{t('trip.deviceOnlyNote')}</p>}
                </>
              )}
            </>
          )}

          </>
          ) : null}
          {/* The guide call to action that stood here could never render: an
              empty planner returns the inline wizard above (T388 removed it). */}

          {/* Know before you go: the country intel and the money tips as ONE
              fold, closed until asked for (T388, brief item 6). Outside the
              planned/edit branches so it shows on both; the stop-count guard
              hides it pre-trip. */}
          {!tp.planned && beforeYouGo}
    </>
  );

  const peek = selectedStop != null && tp.stopDetails[selectedStop] ? (
    <StopPeek
      stop={tp.stopDetails[selectedStop]}
      index={selectedStop}
      stayCost={tp.stayCosts[selectedStop]}
      onNights={(n) => tp.setStopNights(selectedStop, n)}
      onOpen={onOpenDest}
      onClose={() => setSelectedStop(null)}
    />
  ) : null;
  const routeProps = {
    stops: pinStops,
    onSelectStop: (i) => { const s = toStop(i); if (s != null) setSelectedStop(s); },
    selectedIndex: toMapIndex(selectedStop),
    routeGeometry: tripRouteOk ? tripRoute.geometry : null,
    routeSegments: tripRouteOk ? tripRoute.segments : null,
  };

  // The total bar opens the receipt: its lines open, and the list (desktop)
  // or the drawer (phone) brings it into view.
  const openReceipt = () => {
    setReceiptKey((k) => k + 1);
    if (!isDesk && drawer === 'strip') setDrawer('half');
    window.requestAnimationFrame(() => {
      const el = document.getElementById(RECEIPT_ID);
      if (!el) return;
      el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      el.focus({ preventScroll: true });
    });
  };

  // The trip's name and its one line (the name is a field, so the view's h1
  // carries the same words for assistive tech, T193).
  const head = (
    <div className="trip-topcard">
      <h1 className="sr-only tab-h1">{tp.planLabel || t('trip.planYourTrip')}</h1>
      <input
        className="trip-topcard-name"
        value={tp.planLabel}
        onChange={(e) => tp.setPlanLabel(e.target.value)}
        placeholder={t('trip.namePlaceholder')}
        aria-label={t('trip.nameAria')}
      />
      <p className="trip-topcard-sub">
        {[
          hasDates ? t('plan.dateRange', { a: fmtDate(tp.tripStart, true), b: fmtDate(tp.tripEnd, true) }) : '',
          tp.stopDetails.length ? t(tp.stopDetails.length === 1 ? 'trip.stopsOne' : 'trip.stopsMany', { n: tp.stopDetails.length }) : '',
          tp.plannedNights > 0 ? t(tp.plannedNights === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n: tp.plannedNights }) : '',
        ].filter(Boolean).join(', ')}
      </p>
    </div>
  );

  // Saved, and where (T500). Without an account: "Saved on this device" and a
  // quiet way to have it on another device; a browser that kept nothing says
  // so with sign-in as the way out.
  const saveStatus = deviceError ? (
    <ErrorBlock className="trip-footer-error" message={t('trip.deviceSaveFailed')}>
      {authConfigured && onRequestAuth && (
        <Button size="sm" variant="secondary" onClick={onRequestAuth}>{t('trip.signIn')}</Button>
      )}
    </ErrorBlock>
  ) : keptHere ? (
    <p className="trip-device-status">
      <span className="trip-device-dot" aria-hidden="true" />
      <span>{t('trip.savedDevice')}</span>
      {authConfigured && onRequestAuth && (
        <Button variant="quiet" size="sm" className="trip-device-signin" onClick={onRequestAuth}>{t('trip.savedDeviceSignIn')}</Button>
      )}
    </p>
  ) : null;

  const footer = tp.planned ? (
    <div className="trip-sheet-footer plan-ws-actions">
      {saveError && <ErrorBlock className="trip-footer-error" message={saveError} />}
      {saveStatus}
      <div className="trip-sheet-footer-row">{plannedActionButtons}</div>
    </div>
  ) : tp.stopDetails.length > 0 && !wizardOpen ? (
    // Editing the stops always has a way back to the trip (T458).
    <div className="trip-sheet-footer trip-edit-footer plan-ws-actions">
      {saveError && <ErrorBlock className="trip-footer-error" message={saveError} />}
      {saveStatus}
      <div className="trip-sheet-footer-row">
        <Button variant="secondary" className="trip-save-btn" onClick={handleSave} disabled={tp.saveState === 'saving'}>
          {tp.saveState === 'saving' ? t('trip.saving') : tp.saveState === 'saved' || keptHere ? t('trip.savedTick') : tp.planId ? t('trip.updateTrip') : t('trip.saveTrip')}
        </Button>
        <Button variant="primary" className="trip-edit-done" onClick={() => { setAwaitingDates(false); tp.setPlanned(true); setSelectedStop(null); }}>
          {t('trip.doneEditing')}
        </Button>
      </div>
    </div>
  ) : null;

  const body = (
    <>
      {head}
      {listBody}
    </>
  );

  return (
    <div className={`trip-planner-screen plan-ws ${tp.planned ? 'is-planned' : 'is-editing'} ${isDesk ? 'is-desk' : 'is-phone'}`}>
      {isDesk ? (
        <>
          <div className="plan-ws-list" onClick={(e) => e.stopPropagation()}>
            <div className="plan-ws-scroll">{body}</div>
            {footer}
          </div>
          <div className="plan-ws-side">
            <div className="plan-ws-map">
              <TripMap
                {...routeProps}
                padBottom={48}
                // The planned trip's route draws itself once, leg by leg, when
                // the planned view first opens (T398, "Route reveal").
                revealRoute={Boolean(tp.planned)}
              />
              {peek && <div className="trip-peek-slot">{peek}</div>}
            </div>
            <TripTotalBar priced={tp.priced} layout="bar" onOpen={openReceipt} controls={RECEIPT_ID} />
          </div>
        </>
      ) : (
        <>
          <div className="plan-ws-map is-under">
            <TripMap
              {...routeProps}
              padBottom={drawer === 'strip' ? 96 : Math.round((typeof window !== 'undefined' ? window.innerHeight : 700) * 0.45)}
              revealRoute={Boolean(tp.planned)}
              cooperativeGestures={false}
            />
            {peek && drawer !== 'full' && <div className="trip-peek-slot is-top">{peek}</div>}
          </div>
          <MapDrawer
            className="plan-ws-drawer"
            state={drawer}
            onStateChange={setDrawer}
            ariaLabel={tp.planLabel || t('trip.planYourTrip')}
            labels={{ strip: t('drawer.tripStrip'), half: t('drawer.tripHalf'), full: t('drawer.tripFull') }}
            strip={<TripTotalBar priced={tp.priced} layout="strip" onOpen={openReceipt} controls={RECEIPT_ID} />}
            footer={footer}
          >
            {body}
          </MapDrawer>
        </>
      )}

      {saveNotice && (
        <div className="trip-save-toast" role="status">{saveNotice}</div>
      )}

      {keepChoice && (
        <KeepTripChoice
          device={keepChoice.stored}
          account={keepChoice.account}
          onKeepDevice={keepDeviceTrip}
          onKeepAccount={keepAccountTrip}
          onClose={() => setKeepChoice(null)}
        />
      )}

      {wizardOpen && (
        <GuidedTripWizard data={data} stayTier={tp.stayTier} lifestyle={lifestyle} favorites={favorites} onOpenDest={onOpenDest} onOpenCountry={onOpenCountry} onOpenTrip={onOpenTrip} onCancel={() => setWizardOpen(false)} onComplete={handleWizardComplete} seed={tripSeed} onSeedConsumed={onTripSeedConsumed} />
      )}
    </div>
  );
});
