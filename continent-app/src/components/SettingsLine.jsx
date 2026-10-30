import React, {
  createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useSettledFigure } from '../lib/figureChange.js';
import { DateField } from './DateField.jsx';
import { Stepper } from './FilterControls.jsx';
import { matchProfile, PROFILE_LABEL_KEYS } from '../browse/LifestylePanel.jsx';
import { Button, Chip, ChipGroup, IconButton, Segmented } from './ui/index.js';
import { SheetShell } from '../browse/SheetShell.jsx';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { BedIcon, BusIcon, CalendarIcon, CarIcon, ChevronDownIcon, MapPinIcon, RouteIcon, TrainIcon } from './Icons.jsx';
import { PlaneIcon } from './TransportIcons.jsx';
import { FromPanel, fromName, fromPoint } from './FromPicker.jsx';
import { AirportReach } from './AirportReach.jsx';
import { CountriesPanel, countriesValue } from './CountriesControl.jsx';
import { partyText } from '../lib/party.js';
import { nextMode, TRAVEL_MODES } from '../lib/travelWay.js';
import '../styles/77-settings-v2.css';
import { rule } from '../lib/price/config.js';

/**
 * The settings line (T381; carta-design "Settings line", DIRECTION.md rule
 * shell R2): one compact row on every priced view that shows every input its
 * prices depend on, each part a button that opens the control that sets it.
 *
 *   from      where the trip starts: a town, any in Europe, or the device's
 *             location (T577; FromPicker, never an airport code)
 *   when      exact dates, a month, or any time (T578), and the nights
 *   people    adults, children and babies (T579)
 *   lifestyle the bed and the habits (opens the one Lifestyle dialog)
 *   countries only these, or all but these (T581, desktop; the phone has
 *             its own door beside Filters)
 *   way       how the traveller gets there: one button that steps through
 *             any way, plane, train, bus and car (T582)
 *
 * On a phone (T496) the line is one sentence, the bed and the way: the
 * sentence opens one sheet with From, When and People and one Done.
 *
 * The values live in App, which fills SettingsContext once; this file only
 * reads and writes them, so any surface can mount a line (or read a value
 * through useSettings / useTravelMonth) without a prop chain.
 *
 * Props, the contract other surfaces build against (register row T380-e):
 *   parts     which parts to draw, in this fixed order; default all six
 *   children  a surface's own filters, drawn after the parts
 *   className extra class on the band
 * The shell's own line also carries an empty `#settings-line-slot` that a tab
 * may portal its filters into (the header search slot works the same way).
 *
 * No accent anywhere: labels 12 px --text-2, values --text, figures tabular
 * (styles in 60-v6-shell.css and 77-settings-v2.css).
 */

export const SettingsContext = createContext(null);

/** Every global input and its setter, or null outside the app shell. */
export function useSettings() {
  return useContext(SettingsContext);
}

/**
 * The traveller's month (1 to 12), read from their own dates or the month
 * they picked, or null while the dates are Carta's or any time: a month fact
 * is shown only when the traveller has a month (carta-design "Month").
 */
export function useTravelMonth() {
  return useContext(SettingsContext)?.travelMonth ?? null;
}

/** T649: the traveller's whole "when" (lib/when.js): exact, month or any. */
export function useWhen() {
  return useContext(SettingsContext)?.when ?? ANY_WHEN;
}
const ANY_WHEN = { kind: 'any', month: null, months: [] };

export const SETTINGS_PARTS = ['origin', 'dates', 'party', 'lifestyle', 'countries', 'way'];
const MAX_NIGHTS = 30;
// T691: one cap for every screen (config/pricing.json party.limits).
const { max_seats: MAX_PARTY, max_babies: MAX_BABIES } = rule('party.limits');

export const WAY_ICONS = { any: MapPinIcon, plane: PlaneIcon, train: TrainIcon, bus: BusIcon, car: CarIcon };

/**
 * A small non-modal popover under a part: Escape or a press outside closes
 * it and focus goes back to the part that opened it. It is fixed under the
 * top bar (top: var(--filter-h), 60-v6-shell.css) and lined up with its part
 * here, so the band itself can clip what does not fit on a phone without
 * clipping the popover.
 */
function SettingsPop({ id, label, anchorRef, onClose, children, className = '' }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const a = anchorRef.current;
    if (!el || !a) return;
    const gutter = 16;
    const r = a.getBoundingClientRect();
    const left = Math.max(gutter, Math.min(r.left, window.innerWidth - el.offsetWidth - gutter));
    el.style.left = `${Math.round(left)}px`;
  }, [anchorRef]);
  // Focus moves in once, when the popover opens, never again on a re-render
  // (a field that focuses itself wins).
  useEffect(() => {
    if (ref.current?.contains(document.activeElement)) return;
    ref.current?.querySelector('input, button:not([disabled]), [tabindex="0"]')?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
      anchorRef.current?.focus();
    };
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      onClose();
    };
    // Capture phase, so the app's own Escape handlers (which close the page
    // under the line) do not see the key that was meant for this popover.
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
    };
  }, [anchorRef, onClose]);
  return (
    <div className={`settings-pop ${className}`.trim()} id={id} role="dialog" aria-label={label} ref={ref}>
      {children}
    </div>
  );
}

/** One part: a label over (or before) its value, one button. */
function Part({
  name, label, value, display, mono, onClick, expanded, popId, partRef, hasPopup = 'dialog',
  // The phone face's buttons draw their own content and name (T496).
  ariaLabel, className = '', children,
}) {
  const { t } = useI18n();
  // A value that changes settles in place (T391, DIRECTION.md 2.3): one dip
  // of its opacity, the box keeping its width; nothing moves that did not
  // change, and nothing at all under reduced motion.
  const valueRef = useRef(null);
  useSettledFigure(valueRef, value);
  return (
    <button
      type="button"
      ref={partRef}
      className={`settings-part settings-part-${name} ${className}`.trim()}
      onClick={onClick}
      aria-haspopup={hasPopup || undefined}
      aria-expanded={hasPopup === 'dialog' && (popId || children) ? !!expanded : undefined}
      aria-controls={expanded && popId ? popId : undefined}
      aria-label={ariaLabel || t('settings.changeAria', { label, value })}
    >
      {children || (
        <>
          <span className="settings-part-label" aria-hidden="true">{label}</span>
          <span ref={valueRef} className={`settings-part-value${mono ? ' is-mono' : ''}`} aria-hidden="true">{display ?? value}</span>
        </>
      )}
    </button>
  );
}

function useShortDate() {
  const { lang, languages } = useI18n();
  const bcp47 = languages.find((l) => l.code === lang)?.bcp47 || 'en-GB';
  return useCallback((iso, opts = { day: 'numeric', month: 'short' }) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(bcp47, { ...opts, timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, m - 1, d || 1)));
  }, [bcp47]);
}

function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function nightsBetween(a, b) {
  if (!a || !b) return 0;
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86400000));
}

/** The next twelve months from today's, as 'YYYY-MM'. */
function nextMonths(today = new Date()) {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

/** The When value: the dates, the month or any time, then the nights (not
 *  on a phone's one sentence, which has no room for them).
 *
 *  T667 (owner, 2026-10-24): the value says what the prices are for, from
 *  the one price request (lib/price/). Carta's own suggested dates are not
 *  the traveller's, so the prices are the year's average and the value reads
 *  "Any time"; the Explore month filter, while on, names its month. */
function whenValue(t, s, shortDate, { nightsToo = true } = {}) {
  const nights = nightsBetween(s.departDate, s.returnDate);
  const w = s.priceRequest?.when || null;
  let range = '';
  if (s.dateFlex === 'any' || w?.kind === 'any') range = t('dates.any');
  else if (w?.kind === 'month' && w.ym) range = shortDate(`${w.ym}-01`, { month: 'long' });
  else if (s.dateFlex === 'month' && s.departDate) range = shortDate(s.departDate, { month: 'long' });
  else if (s.departDate && s.returnDate) {
    range = t('settings.datesRange', { start: shortDate(s.departDate), end: shortDate(s.returnDate) });
  }
  if (!range) return t('settings.pickDates');
  if (!nightsToo) return range;
  return t(nights === 1 ? 'settings.datesNight' : 'settings.datesNights', { range, n: nights });
}

/**
 * When (T578): exact dates, a month or any time, over the trip's length.
 * A month moves the dates into it (the first day it can, the length kept),
 * so every screen that needs a pair still has one; Explore prices the
 * month's cheapest flight and the month's beds, and any time the cheapest
 * flight Carta has and the year's beds.
 */
function DatesControl({ s, pickEnd, setPickEnd, pickDate, shortDate }) {
  const { t } = useI18n();
  const nights = nightsBetween(s.departDate, s.returnDate);
  const setNights = (n) => {
    if (!s.departDate) return;
    s.setReturnDate(addDaysISO(s.departDate, Math.max(1, Math.min(MAX_NIGHTS, n))));
  };
  const mode = s.dateFlex === 'month' ? 'month' : s.dateFlex === 'any' ? 'any' : 'exact';
  const months = useMemo(() => nextMonths(), []);
  const pickMonth = (ym) => {
    const keep = Math.max(1, nights || 7);
    const min = s.dateBounds?.min;
    const first = `${ym}-01`;
    const start = min && min > first && min.slice(0, 7) === ym ? min : first;
    s.setDepartDate(start);
    s.setReturnDate(addDaysISO(start, keep));
  };
  return (
    <>
      <Segmented
        block
        className="settings-flex"
        label={t('dates.when')}
        value={mode}
        onChange={(v) => {
          s.setDateFlex(v === 'exact' ? null : v);
          if (v === 'month' && s.departDate && !months.includes(s.departDate.slice(0, 7))) pickMonth(months[0]);
        }}
        options={[
          { value: 'exact', label: t('dates.exact') },
          { value: 'month', label: t('dates.month') },
          { value: 'any', label: t('dates.any') },
        ]}
      />
      {mode === 'exact' && (
        <>
          {/* One calendar for both ends: the kit Segmented above it says which
              end the next pick sets (the lifted thumb, T426), and a pick of the
              leaving day keeps the trip's length. */}
          <Segmented
            block
            size="sm"
            className="settings-ends"
            label={t('settings.dates')}
            value={pickEnd}
            onChange={setPickEnd}
            options={['start', 'end'].map((end) => ({
              value: end,
              label: (
                <span className="settings-end-text">
                  <span className="settings-end-label">{t(end === 'start' ? 'settings.leave' : 'settings.return')}</span>
                  <span className="is-mono">{shortDate(end === 'start' ? s.departDate : s.returnDate)}</span>
                </span>
              ),
            }))}
          />
          <DateField
            inline
            value={pickEnd === 'start' ? s.departDate : s.returnDate}
            rangeStart={s.departDate}
            rangeEnd={s.returnDate}
            min={pickEnd === 'end' ? (s.departDate || s.dateBounds?.min) : s.dateBounds?.min}
            max={s.dateBounds?.max}
            onChange={pickDate}
          />
        </>
      )}
      {mode === 'month' && (
        <ChipGroup label={t('dates.monthsLabel')} className="settings-months">
          {months.map((ym) => (
            <Chip key={ym} kind="choice" selected={s.departDate?.slice(0, 7) === ym} onClick={() => pickMonth(ym)}>
              {shortDate(`${ym}-01`, ym.endsWith('-01') ? { month: 'short', year: 'numeric' } : { month: 'short' })}
            </Chip>
          ))}
        </ChipGroup>
      )}
      <div className="settings-row">
        <span className="settings-row-label">{t('settings.nightsLabel')}</span>
        <Stepper
          value={Math.max(1, nights)}
          min={1}
          max={MAX_NIGHTS}
          onChange={setNights}
          ariaLabel={t('settings.nightsAria', { n: nights })}
          decLabel={t('settings.nightsDec')}
          incLabel={t('settings.nightsInc')}
        />
      </div>
    </>
  );
}

/** People (T579): adults, children and babies, one row each. */
function PartyControl({ s }) {
  const { t } = useI18n();
  const children = s.children || 0;
  const adults = Math.max(1, (s.party || 2) - children);
  const babies = s.babies || 0;
  const rows = [
    { key: 'adults', n: adults, min: 1, max: MAX_PARTY - children },
    { key: 'children', n: children, min: 0, max: MAX_PARTY - adults, sub: 'party.childrenSub' },
    { key: 'babies', n: babies, min: 0, max: MAX_BABIES, sub: 'party.babiesSub' },
  ];
  return (
    <div className="party-rows">
      {rows.map((r) => (
        <div className="party-row" key={r.key}>
          <span className="party-row-text">
            <span className="party-row-label">{t(`party.${r.key}`)}</span>
            {r.sub && <span className="party-row-sub">{t(r.sub)}</span>}
          </span>
          <Stepper
            value={r.n}
            min={r.min}
            max={r.max}
            onChange={(n) => s.setPartyParts({ adults, children, babies, [r.key]: n })}
            ariaLabel={t('party.countAria', { n: r.n, who: t(`party.${r.key}`) })}
            decLabel={t(`party.${r.key}Dec`)}
            incLabel={t(`party.${r.key}Inc`)}
          />
        </div>
      ))}
      {s.setPriceView && (
        // T694 (plan rule 4, owner 2026-10-24): every price in the app per
        // person or for the whole group; filters and sorting follow.
        <div className="party-row party-view">
          <span className="party-row-text">
            <span className="party-row-label" id="party-view-label">{t('party.view')}</span>
          </span>
          <Segmented
            label={t('party.view')}
            size="sm"
            value={s.priceView === 'total' ? 'total' : 'pp'}
            onChange={s.setPriceView}
            options={[
              { value: 'pp', label: t('party.viewPp') },
              { value: 'total', label: t('party.viewTotal') },
            ]}
          />
        </div>
      )}
    </div>
  );
}

/** Getting there (T582): one button that steps to the next way. */
function WayPart({ s, compact = false }) {
  const { t } = useI18n();
  const mode = TRAVEL_MODES.includes(s.transportMode) ? s.transportMode : 'any';
  const next = nextMode(mode);
  const Icon = WAY_ICONS[mode];
  const label = t('way.label');
  const word = t(`way.${mode}`);
  const aria = t('way.cycleAria', { mode: word, next: t(`way.${next}`) });
  if (compact) {
    return (
      <IconButton label={aria} className="settings-way-btn" onClick={() => s.setTransportMode(next)}>
        <Icon size={20} />
      </IconButton>
    );
  }
  return (
    <Part
      name="way"
      label={label}
      value={word}
      hasPopup={null}
      ariaLabel={aria}
      display={(
        <span className="settings-way-value">
          <Icon size={16} className="settings-way-icon" />
          <span>{word}</span>
        </span>
      )}
      onClick={() => s.setTransportMode(next)}
    />
  );
}

export function SettingsLine({ parts = SETTINGS_PARTS, className = '', children, slot = false }) {
  const s = useSettings();
  const { t } = useI18n();
  const isDesktop = useIsDesktop();
  const shortDate = useShortDate();
  const [open, setOpen] = useState(null); // 'from' | 'dates' | 'party' | 'countries' | 'sheet' | null
  const [pickEnd, setPickEnd] = useState('start');
  const [sheetFrom, setSheetFrom] = useState(false);
  const baseId = useId();
  const fromRef = useRef(null);
  const datesRef = useRef(null);
  const partyRef = useRef(null);
  const countriesRef = useRef(null);
  const summaryRef = useRef(null);
  // A pick on the leaving end moves the trip and keeps its length, then hands
  // the next pick to the return; a pick on the return end sets it, unless it
  // lands on or before the leaving day, which then moves instead.
  const pickDate = useCallback((iso) => {
    if (!s || !iso) return;
    const nights = Math.max(1, nightsBetween(s.departDate, s.returnDate));
    if (pickEnd === 'end' && s.departDate && iso > s.departDate) {
      s.setReturnDate(iso);
      return;
    }
    s.setDepartDate(iso);
    s.setReturnDate(addDaysISO(iso, nights));
    setPickEnd('end');
  }, [s, pickEnd]);
  const close = useCallback(() => setOpen(null), []);
  const names = useMemo(() => new Map(s?.availableCountries || []), [s?.availableCountries]);
  if (!s) return null;

  const show = (p) => parts.includes(p);
  const toggle = (p) => {
    if (p === 'dates' || p === 'sheet') setPickEnd('start');
    if (p === 'sheet') setSheetFrom(false);
    setOpen((v) => (v === p ? null : p));
  };

  const from = fromName(s);
  const whenText = whenValue(t, s, shortDate);
  const children_ = s.children || 0;
  const party = Number.isFinite(s.party) ? s.party : 2;
  const people = partyText(t, { adults: Math.max(1, party - children_), children: children_, babies: s.babies || 0 });
  const profileKey = matchProfile(s.lifestyle || {});
  const bed = t(`stay.${s.stayTier || 'home'}`);
  const vibe = profileKey ? t(PROFILE_LABEL_KEYS[profileKey]) : t('lifestyle.custom');
  const countryList = s.countryFilter || [];
  const countriesText = countriesValue(t, countryList, s.countryNot, names);
  const pickFrom = (p, then) => { s.setFrom(p); then?.(); };
  // T860: the home airports in reach, the same choice the planner's reach
  // question sets; shown once a town is set and the way there may fly.
  const mayFly = !['train', 'bus', 'car'].includes(s.transportMode);
  const airports = s.setAirports && s.fromPlace && mayFly ? (
    <section className="settings-airports" aria-labelledby={`${baseId}-airports`}>
      <h3 className="settings-sheet-h" id={`${baseId}-airports`}>{t('pf.q.airports')}</h3>
      <AirportReach
        meta={s.data?.meta}
        point={s.fromPlace}
        covered={s.sweptOrigins}
        hours={s.airportHours}
        codes={s.airports}
        labelId={`${baseId}-airports-list`}
        onChange={(codes, hours) => s.setAirports(codes, hours)}
      />
    </section>
  ) : null;

  // The phone face (T622, owner 2026-10-23: "the when part is cut off,
  // just show when, from, type, transport ... use icons, but no full on
  // text"): four equal buttons, an icon over one short word each. When and
  // From open the one settings sheet (From with its town panel open), the
  // stay opens the Lifestyle dialog, and the way steps through the ways,
  // its icon showing the current one. Every value is in the button's name.
  if (!isDesktop) {
    const heads = party + (s.babies || 0);
    const summary = t('settings.summary', {
      dates: whenValue(t, s, shortDate, { nightsToo: false }),
      people: t(heads === 1 ? 'settings.peopleOne' : 'settings.peopleMany', { n: heads }),
    });
    const closeSheet = () => { close(); summaryRef.current?.focus(); };
    const openSheet = (withFrom) => {
      setPickEnd('start');
      setSheetFrom(!!withFrom);
      setOpen((v) => (v === 'sheet' ? null : 'sheet'));
    };
    const mode = TRAVEL_MODES.includes(s.transportMode) ? s.transportMode : 'any';
    // Any way draws a route, so it never reads as From's pin beside it.
    const WayIcon = mode === 'any' ? RouteIcon : WAY_ICONS[mode];
    const nextWay = nextMode(mode);
    return (
      <div className={`settings-line settings-line-phone ${className}`.trim()} role="group" aria-label={t('settings.label')}>
        {(show('dates') || show('party')) && (
          <Part
            name="when"
            className="settings-quad"
            partRef={summaryRef}
            value={summary}
            expanded={open === 'sheet' && !sheetFrom}
            ariaLabel={t('settings.summaryAria', { summary })}
            onClick={() => openSheet(false)}
          >
            <CalendarIcon size={20} className="settings-quad-icon" />
            <span className="settings-quad-word" aria-hidden="true">{t('dates.when')}</span>
          </Part>
        )}
        {show('origin') && (
          <Part
            name="from"
            className="settings-quad"
            value={from || t('origin.pickTown')}
            expanded={open === 'sheet' && sheetFrom}
            ariaLabel={t('settings.changeAria', { label: t('settings.from'), value: from || t('origin.pickTown') })}
            onClick={() => openSheet(true)}
          >
            <MapPinIcon size={20} className="settings-quad-icon" />
            <span className="settings-quad-word" aria-hidden="true">{t('settings.from')}</span>
          </Part>
        )}
        {show('lifestyle') && s.openLifestyle && (
          <Part
            name="bed"
            className="settings-quad"
            value={`${bed}, ${vibe}`}
            ariaLabel={t('settings.changeAria', { label: t('settings.lifestyle'), value: `${bed}, ${vibe}` })}
            onClick={s.openLifestyle}
          >
            <BedIcon size={20} className="settings-quad-icon" />
            <span className="settings-quad-word" aria-hidden="true">{t('settings.stayShort')}</span>
          </Part>
        )}
        {show('way') && s.setTransportMode && (
          <Part
            name="way"
            className="settings-quad"
            value={t(`way.${mode}`)}
            hasPopup={null}
            ariaLabel={t('way.cycleAria', { mode: t(`way.${mode}`), next: t(`way.${nextWay}`) })}
            onClick={() => s.setTransportMode(nextWay)}
          >
            <WayIcon size={20} className="settings-quad-icon" />
            <span className="settings-quad-word" aria-hidden="true">{t('settings.wayShort')}</span>
          </Part>
        )}
        {open === 'sheet' && (
          <SheetShell
            title={t('settings.label')}
            labelId={`${baseId}-sheet`}
            className="settings-sheet"
            closeLabel={t('a11y.close')}
            onClose={closeSheet}
          >
            {show('origin') && (
              <section className="settings-sheet-sec">
                <h3 className="settings-sheet-h">{t('settings.from')}</h3>
                <Button variant="secondary" block className="from-current" aria-expanded={sheetFrom}
                  iconStart={<MapPinIcon size={16} />} iconEnd={<ChevronDownIcon size={16} />}
                  onClick={() => setSheetFrom((v) => !v)}>
                  <span className="from-current-name">{from || t('origin.pickTown')}</span>
                </Button>
                {sheetFrom && (
                  <FromPanel data={s.data} current={fromPoint(s)} autoFocus={false}
                    onPick={(p) => pickFrom(p, () => setSheetFrom(false))} />
                )}
                {airports}
              </section>
            )}
            {show('dates') && (
              <section className="settings-sheet-sec">
                <h3 className="settings-sheet-h">{t('dates.when')}</h3>
                <DatesControl s={s} pickEnd={pickEnd} setPickEnd={setPickEnd} pickDate={pickDate} shortDate={shortDate} />
              </section>
            )}
            {show('party') && (
              <section className="settings-sheet-sec">
                <h3 className="settings-sheet-h">{t('settings.party')}</h3>
                <PartyControl s={s} />
              </section>
            )}
            {/* The sheet's one primary. Every change holds at once; Done
                only closes. */}
            <Button variant="primary" block className="settings-done" onClick={closeSheet}>
              {t('settings.done')}
            </Button>
          </SheetShell>
        )}
      </div>
    );
  }

  return (
    <div className={`settings-line ${className}`.trim()} role="group" aria-label={t('settings.label')}>
      <div className="settings-line-parts">
        {show('origin') && (
          <div className="settings-slot settings-slot-origin">
            <Part
              name="origin"
              label={t('settings.from')}
              value={from || t('origin.pickTown')}
              partRef={fromRef}
              popId={`${baseId}-from`}
              expanded={open === 'from'}
              onClick={() => toggle('from')}
            />
            {open === 'from' && (
              <SettingsPop id={`${baseId}-from`} label={t('settings.from')} anchorRef={fromRef} onClose={close} className="settings-pop-list">
                <FromPanel data={s.data} current={fromPoint(s)}
                  onPick={(p) => pickFrom(p, () => { close(); fromRef.current?.focus(); })} />
                {airports}
              </SettingsPop>
            )}
          </div>
        )}

        {show('dates') && (
          <div className="settings-slot settings-slot-dates">
            <Part
              name="dates"
              label={t('dates.when')}
              value={whenText}
              mono
              partRef={datesRef}
              popId={`${baseId}-dates`}
              expanded={open === 'dates'}
              onClick={() => toggle('dates')}
            />
            {open === 'dates' && (
              <SettingsPop id={`${baseId}-dates`} label={t('dates.when')} anchorRef={datesRef} onClose={close} className="settings-pop-dates">
                <DatesControl s={s} pickEnd={pickEnd} setPickEnd={setPickEnd} pickDate={pickDate} shortDate={shortDate} />
              </SettingsPop>
            )}
          </div>
        )}

        {show('party') && (
          <div className="settings-slot settings-slot-party">
            <Part
              name="party"
              label={t('settings.party')}
              value={people}
              partRef={partyRef}
              popId={`${baseId}-party`}
              expanded={open === 'party'}
              onClick={() => toggle('party')}
            />
            {open === 'party' && (
              <SettingsPop id={`${baseId}-party`} label={t('settings.party')} anchorRef={partyRef} onClose={close} className="settings-pop-party">
                <PartyControl s={s} />
              </SettingsPop>
            )}
          </div>
        )}

        {show('lifestyle') && s.openLifestyle && (
          <div className="settings-slot settings-slot-lifestyle">
            <Part
              name="lifestyle"
              label={t('settings.lifestyle')}
              value={`${bed}, ${vibe}`}
              display={(
                <>
                  <span>{bed}</span>
                  <span className="settings-vibe">{vibe}</span>
                </>
              )}
              onClick={s.openLifestyle}
            />
          </div>
        )}

        {show('countries') && s.setCountryFilter && (
          <div className="settings-slot settings-slot-countries">
            <Part
              name="countries"
              label={t('settings.countries')}
              value={countriesText}
              partRef={countriesRef}
              popId={`${baseId}-countries`}
              expanded={open === 'countries'}
              onClick={() => toggle('countries')}
            />
            {open === 'countries' && (
              <SettingsPop id={`${baseId}-countries`} label={t('settings.countries')} anchorRef={countriesRef} onClose={close} className="settings-pop-list">
                <CountriesPanel countries={s.availableCountries} list={countryList} setList={s.setCountryFilter}
                  not={!!s.countryNot} setNot={s.setCountryNot} />
              </SettingsPop>
            )}
          </div>
        )}

        {show('way') && s.setTransportMode && (
          <div className="settings-slot settings-slot-way">
            <WayPart s={s} />
          </div>
        )}
      </div>
      {(children || slot) && (
        <div className="settings-line-extra" id={slot ? 'settings-line-slot' : undefined}>
          {children}
        </div>
      )}
    </div>
  );
}
