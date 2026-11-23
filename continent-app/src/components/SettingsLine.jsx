import React, {
  createContext, useCallback, useContext, useId, useMemo,
} from 'react';
import { useI18n } from '../i18n/index.jsx';
import { DateField } from './DateField.jsx';
import { Stepper } from './FilterControls.jsx';
import { Button, Chip, ChipGroup, Segmented } from './ui/index.js';
import { SheetShell } from '../browse/SheetShell.jsx';
import { BusIcon, CarIcon, MapPinIcon, TrainIcon } from './Icons.jsx';
import { PlaneIcon } from './TransportIcons.jsx';
import { FromPanel, fromPoint } from './FromPicker.jsx';
import { AirportReach } from './AirportReach.jsx';
import '../styles/77-settings-v2.css';
import { rule } from '../lib/price/config.js';
import { isOn } from '../lib/flags.js';
import { partsAfter } from '../lib/partyParts.js';

/**
 * The trip settings every priced view reads (T381), and the controls that
 * set them. The values live in App, which fills SettingsContext once; this
 * file only reads and writes them, so any surface can read a value through
 * useSettings / useTravelMonth / useWhen without a prop chain.
 *
 * The settings line itself (one row of parts on every priced view) left the
 * app in commit 4a68a45e2d and was removed here in G12: Explore's controls
 * are the band's chips and the Settings sheet (browse/band, browse/settings).
 * What stays is shared: the When and People controls, the one-part editor
 * sheet Account opens and the formatters.
 */

// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
export const SettingsContext = createContext(null);

/** Every global input and its setter, or null outside the app shell. */
// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
export function useSettings() {
  return useContext(SettingsContext);
}

/**
 * The traveller's month (1 to 12), read from their own dates or the month
 * they picked, or null while the dates are Carta's or any time: a month fact
 * is shown only when the traveller has a month (carta-design "Month").
 */
// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
export function useTravelMonth() {
  return useContext(SettingsContext)?.travelMonth ?? null;
}

/** T649: the traveller's whole "when" (lib/when.js): exact, month or any. */
// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
export function useWhen() {
  return useContext(SettingsContext)?.when ?? ANY_WHEN;
}
const ANY_WHEN = { kind: 'any', month: null, months: [] };

const MAX_NIGHTS = 30;
// T691: one cap for every screen (config/pricing.json party.limits).
const { max_seats: MAX_PARTY, max_babies: MAX_BABIES } = rule('party.limits');

// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
export const WAY_ICONS = { any: MapPinIcon, plane: PlaneIcon, train: TrainIcon, bus: BusIcon, car: CarIcon };

// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
export function useShortDate() {
  const { lang, languages } = useI18n();
  const bcp47 = languages.find((l) => l.code === lang)?.bcp47 || 'en-GB';
  return useCallback((iso, opts = { day: 'numeric', month: 'short' }) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(bcp47, { ...opts, timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, m - 1, d || 1)));
  }, [bcp47]);
}

// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
export function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
export function nightsBetween(a, b) {
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
// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
export function whenValue(t, s, shortDate, { nightsToo = true } = {}) {
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
export function DatesControl({ s, pickEnd, setPickEnd, pickDate, shortDate }) {
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
export function PartyControl({ s }) {
  const { t } = useI18n();
  const children = s.children || 0;
  const babies = s.babies || 0;
  // W3-L1 (E2, G-8): a row for teens (12 to 17), who are priced as adults and
  // keep a family a family. `party` counts them in the adults, so the adults
  // row shows the others (18 and over); at least one stays.
  const withTeens = isOn('E2');
  const seatsAdult = Math.max(1, (s.party || 2) - children);
  const teens = withTeens ? Math.min(s.teens || 0, seatsAdult - 1) : 0;
  const adults = seatsAdult - teens;
  const rows = [
    { key: 'adults', n: adults, min: 1, max: MAX_PARTY - children - teens },
    ...(withTeens ? [{ key: 'teens', n: teens, min: 0, max: MAX_PARTY - children - adults, sub: 'party.teensSub' }] : []),
    { key: 'children', n: children, min: 0, max: MAX_PARTY - adults - teens, sub: 'party.childrenSub' },
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
            onChange={(n) => s.setPartyParts(partsAfter({ adults, teens, children, babies }, r.key, n, withTeens))}
            ariaLabel={t('party.countAria', { n: r.n, who: t(`party.${r.key}`) })}
            decLabel={t(`party.${r.key}Dec`)}
            incLabel={t(`party.${r.key}Inc`)}
          />
        </div>
      ))}
      {/* T907: Per person or whole group left this list for the results'
          toolbar (PriceViewSwitch): it is how prices read, not who goes. */}
    </div>
  );
}

/**
 * One part of the line as a sheet of its own (T934): Account's Your travel
 * opens From and Who here, the same controls on the same store the line
 * opens, so a change in either place shows in both. Every change holds at
 * once; Done only closes.
 *   part     'origin' or 'party'
 */
export function SettingsEditorSheet({ part, onClose, anchorRef = null }) {
  const s = useSettings();
  const { t } = useI18n();
  const baseId = useId();
  if (!s) return null;
  const mayFly = !['train', 'bus', 'car'].includes(s.transportMode);
  return (
    <SheetShell
      title={part === 'origin' ? t('settings.from') : t('settings.party')}
      labelId={`${baseId}-ed`}
      className="settings-sheet"
      closeLabel={t('a11y.close')}
      anchorRef={anchorRef}
      onClose={onClose}
    >
      {part === 'origin' && (
        <section className="settings-sheet-sec">
          <FromPanel data={s.data} current={fromPoint(s)} autoFocus={false} onPick={(p) => s.setFrom(p)} />
          {s.setAirports && s.fromPlace && mayFly && (
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
          )}
        </section>
      )}
      {part === 'party' && (
        <section className="settings-sheet-sec">
          <PartyControl s={s} />
        </section>
      )}
      <Button variant="primary" block className="settings-done" onClick={onClose}>
        {t('settings.done')}
      </Button>
    </SheetShell>
  );
}
