/*
 * The one reader between the Settings sheet and the settings model (G12).
 * Lane 3 owns the model (`src/lib/settings/`): the context carries `model`
 * (readSettings) and `set` (makeSettingsSetters). The sheet never
 * re-derives a value or a price; every read and write passes through this
 * hook, so when a model name changes only this file follows.
 *
 * Until the context carries `model` and `set`, the reader builds the model
 * from the context's own fields and writes through today's setters
 * (setFrom, setDateFlex, setExploreMonth, the dates), so the sheet works on
 * either.
 */
import { useCallback, useMemo } from 'react';
import { useSettings } from '../../components/SettingsLine.jsx';
import { countryName } from '../../lib/countryName.js';
import { readSettings, nearestTown, countryStartTown, settingsSummary, priceFigure } from '../../lib/settings/index.js';
import { addDays } from './calendarModel.js';

/** How far "here" may be from the nearest town before it counts as no town
 *  near: a traveller outside Europe gets the plain message, not a start a
 *  continent away. */
export const NEAR_KM = 250;

/** The model from a context that does not carry one yet. */
function modelFromContext(s) {
  const choices = {
    transport_mode: s?.transportMode,
    price_view: s?.priceView,
    drive_home: s?.fromPlace || null,
    origin: s?.origin || null,
    origins: s?.airports || [],
    group_size: s?.party,
    children: s?.children,
    babies: s?.babies,
    price_excluded: s?.priceExcluded,
  };
  return readSettings(choices, {
    departDate: s?.departDate, returnDate: s?.returnDate, dateFlex: s?.dateFlex, ownDates: s?.ownDates, xm: s?.exploreMonth,
  });
}

export function useSettingsModel() {
  const s = useSettings();
  const data = s?.data || null;
  const ts = s?.travelStyles || null;
  const m = useMemo(() => s?.model || modelFromContext(s), [s]);
  const set = s?.set || null;

  // ---- Start ----
  const setCountry = useCallback((iso2) => {
    if (set?.setStartCountry) return Boolean(set.setStartCountry(iso2));
    const town = countryStartTown(data, iso2);
    if (!town) return false;
    s?.setFrom?.({ ...town, name: countryName(iso2) });
    return true;
  }, [s, set, data]);

  const setPlace = useCallback((p) => {
    if (set?.setStartPlace) set.setStartPlace(p);
    else s?.setFrom?.(p);
  }, [s, set]);

  /** "Use my current location": the nearest town in Carta's data, when one
   *  is near. Returns the town, or null (the step shows its plain line). */
  const setHere = useCallback((pt) => {
    const town = nearestTown(data, pt);
    if (!town || !(town.km <= NEAR_KM)) return null;
    if (set?.setStartHere) return set.setStartHere(pt);
    s?.setFrom?.({ name: town.name, lat: town.lat, lon: town.lon, iso2: town.iso2, country: town.country });
    return town;
  }, [s, set, data]);

  // ---- When ----
  const setMode = useCallback((mode) => {
    if (set?.setDateMode) { set.setDateMode(mode); return; }
    if (mode === 'month') s?.setDateFlex?.('month');
    else if (mode === 'dates') { s?.setDateFlex?.(null); s?.setExploreMonth?.(null); }
    else { s?.setDateFlex?.('any'); s?.setExploreMonth?.(null); }
  }, [s, set]);

  const setDates = useCallback((start, end) => {
    if (set?.setDates) { set.setDates(start, end); return; }
    s?.setDepartDate?.(start);
    s?.setReturnDate?.(end);
    s?.setDateFlex?.(null);
    s?.setExploreMonth?.(null);
  }, [s, set]);

  const setMonth = useCallback((ym) => {
    if (set?.setMonth) { set.setMonth(ym); return; }
    s?.setDateFlex?.('month');
    s?.setExploreMonth?.(Number(ym.slice(5, 7)));
  }, [s, set]);

  const setNights = useCallback((n) => {
    if (set?.setTripNights) { set.setTripNights(n); return; }
    if (s?.departDate) s?.setReturnDate?.(addDays(s.departDate, Math.max(1, Math.round(n))));
  }, [s, set]);

  // ---- Getting there, Prices shown ----
  const setWay = useCallback((mode) => {
    if (set?.setWay) set.setWay(mode);
    else s?.setTransportMode?.(mode);
  }, [s, set]);
  const setView = useCallback((v) => {
    const view = v === 'group' ? 'total' : 'pp';
    if (set?.setPriceView) set.setPriceView(view);
    else s?.setPriceView?.(view);
  }, [s, set]);
  const setSpan = useCallback((span) => { set?.setPriceSpan?.(span); }, [set]);

  return useMemo(() => ({
    s,
    m,
    data,
    ts,
    /** The model's own row texts (settingsSummary), by key. */
    summary: (t) => new Map(settingsSummary(m, ts?.active || null, t, { data }).map((x) => [x.key, x])),
    /** The model's figure for a row (a priceDay answer) in the current
     *  settings, or with `over` model fields changed (the example's whole
     *  trip for the group). */
    figure: (row, over = null) => priceFigure(row, over ? { ...m, ...over } : m),
    start: { kind: m.originKind, country: m.originCountry || '', place: m.fromPlace, setCountry, setPlace, setHere },
    when: {
      mode: m.dateMode, setMode, nights: m.tripNights, setNights, month: m.month || '', setMonth,
      start: m.dates?.start || s?.departDate || '', end: m.dates?.end || s?.returnDate || '', setDates,
      bounds: s?.dateBounds || null,
      // The month card's "from" figure: the model's, or none at all.
      monthFrom: typeof s?.monthFrom === 'function' ? s.monthFrom : null,
    },
    way: { mode: m.way, setMode: setWay },
    prices: {
      span: m.priceSpan, setSpan, canSpan: Boolean(set?.setPriceSpan),
      view: m.priceView === 'total' ? 'group' : 'person', setView, party: m.seats || 1,
    },
  }), [s, m, data, ts, setCountry, setPlace, setHere, setMode, setNights, setMonth, setDates, setWay, setView, setSpan, set]);
}
