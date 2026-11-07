import { useMemo } from 'react';

export function useAppSettingsValue({
  availableCountries, choices, countryFilter, countryNot, data, dateBounds, dateFlex,
  defaultDates, departDate, exploreMonth, openLifestyle, ownDates, request, returnDate,
  setAirports, setCountryFilter, setCountryNot, setDateFlex, setDepartDate, setExploreMonth,
  setFrom, setOrigin, setParty, setPartyParts, setPriceExcluded, setPriceView, setReturnDate,
  setTransportMode, sweptOrigins, travelMonth, when,
}) {
  const settings = useMemo(() => ({
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
    openLifestyle,
  }), [data, choices.origin, choices.drive_home, choices.origins, choices.airport_hours, choices.group_size, choices.children, choices.babies, choices.transport_mode, choices.price_view, choices.price_excluded, choices.stay_tier, choices.lifestyle, setOrigin, setFrom, setAirports, sweptOrigins, departDate, returnDate, setDepartDate, setReturnDate, defaultDates, dateBounds, ownDates, dateFlex, setDateFlex, travelMonth, when, request, exploreMonth, setExploreMonth, setParty, setPartyParts, setTransportMode, setPriceView, setPriceExcluded, countryFilter, setCountryFilter, countryNot, setCountryNot, availableCountries, openLifestyle]);
  return { settings };
}
