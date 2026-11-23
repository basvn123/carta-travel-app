import { useMemo, useRef } from 'react';
import { readSettings } from '../lib/settings/model.js';
import { makeSettingsSetters } from '../lib/settings/setters.js';
import { monthFrom as monthFromOf } from '../lib/settings/monthFrom.js';
import { useStartNames } from '../lib/search/startNames.js';
import { styleAvoids } from '../lib/heatRisk.js';

export function useAppSettingsValue({
  availableCountries, choices, countryFilter, countryNot, data, dateBounds, dateFlex,
  defaultDates, departDate, exploreMonth, openStyleSpend, ownDates, request, returnDate,
  setAirports, setChoices, setCountryFilter, setCountryNot, setDateFlex, setDepartDate, setExploreMonth,
  setFrom, setOrigin, setParty, setPartyParts, setPriceExcluded, setPriceView, setReturnDate,
  setTransportMode, sweptOrigins, travelMonth, when,
}) {
  // G12 (D10): the Settings model and its setters (lib/settings), read by
  // the band's chips, the Settings sheet and Explore's rows. `model` is
  // readSettings over the choices and App's dates; `set` holds one setter
  // per field. setChoices comes from App (until it is passed, the setters
  // that write new fields do nothing).
  const choicesRef = useRef(choices);
  choicesRef.current = choices;
  const readModel = useMemo(
    () => readSettings(choices, { departDate, returnDate, dateFlex, ownDates, xm: exploreMonth }),
    [choices, departDate, returnDate, dateFlex, ownDates, exploreMonth],
  );
  // The home town and "here" carry no names of their own; the gazetteer
  // gives them in the UI language (Brussel, Bruxelles), so the start chip,
  // the summary and the Settings Start row all read one model (fixes-r1).
  const model = useStartNames(readModel, data);
  const set = useMemo(() => makeSettingsSetters({
    setChoices, setFrom, setDepartDate, setReturnDate, setDateFlex, setExploreMonth, data, sweptOrigins,
    getChoices: () => choicesRef.current,
  }), [setChoices, setFrom, setDepartDate, setReturnDate, setDateFlex, setExploreMonth, data, sweptOrigins]);
  // The When step's month cards ask for a "from" figure each; one catalogue
  // pass a month (20 to 40 ms). The figures do not depend on the month the
  // traveller picks, so they are kept on the request without its dates and
  // the view: picking a month must not price twelve months again.
  const latest = useRef({ request, model });
  latest.current = { request, model };
  const fromKey = request
    ? JSON.stringify([{ ...request, when: null, dateMode: null }, model.priceView, model.seats])
    : '';
  const monthFrom = useMemo(() => {
    const known = new Map();
    return (ym) => {
      if (!known.has(ym)) known.set(ym, monthFromOf(data, latest.current.request, ym, latest.current.model));
      return known.get(ym);
    };
  }, [data, fromKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // REQ-data-3 (D20): the style's "avoid" answers; the destination page's
  // heat guard (lib/heatRisk.js guardsHeat) reads `avoid` from here.
  const avoid = useMemo(() => styleAvoids(choices.travel_styles), [choices.travel_styles]);
  const settings = useMemo(() => ({
    model, set,
    monthFrom,
    data,
    origin: choices.origin,
    setOrigin,
    // T577: the From place (a named town or the traveller's location), else
    // null and the line names the home airport's town.
    fromPlace: choices.drive_home || null,
    setFrom,
    // T860: the home airports in reach and how they were chosen.
    airports: choices.origins || [],
    airportHours: choices.airport_hours ?? null,
    setAirports,
    sweptOrigins,
    departDate, returnDate, setDepartDate, setReturnDate,
    defaultDates, dateBounds,
    ownDates,
    dateFlex, setDateFlex,
    travelMonth, when,
    // T663: the one price request, and the Explore month filter it reads.
    priceRequest: request, exploreMonth, setExploreMonth,
    party: choices.group_size,
    children: choices.children || 0,
    babies: choices.babies || 0,
    avoid,
    setParty,
    setPartyParts,
    transportMode: choices.transport_mode || 'any',
    setTransportMode,
    priceView: choices.price_view || 'pp',
    setPriceView,
    priceExcluded: choices.price_excluded || [],
    setPriceExcluded,
    // T581: Explore's countries, in or out.
    countryFilter, setCountryFilter, countryNot, setCountryNot,
    availableCountries,
    stayTier: choices.stay_tier || 'home',
    lifestyle: choices.lifestyle,
    openStyleSpend,
  }), [model, set, monthFrom, data, choices.origin, choices.drive_home, choices.origins, choices.airport_hours, choices.group_size, choices.children, choices.babies, avoid, choices.transport_mode, choices.price_view, choices.price_excluded, choices.stay_tier, choices.lifestyle, setOrigin, setFrom, setAirports, sweptOrigins, departDate, returnDate, setDepartDate, setReturnDate, defaultDates, dateBounds, ownDates, dateFlex, setDateFlex, travelMonth, when, request, exploreMonth, setExploreMonth, setParty, setPartyParts, setTransportMode, setPriceView, setPriceExcluded, countryFilter, setCountryFilter, countryNot, setCountryNot, availableCountries, openStyleSpend]);
  return { settings };
}
