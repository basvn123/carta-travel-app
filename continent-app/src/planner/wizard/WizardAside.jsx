import React from 'react';
import { CountryPickerMap } from '../../map/CountryPickerMap.jsx';
import { CityPickerMap } from '../../map/CityPickerMap.jsx';
import { PlanTotal } from '../PlanTotal.jsx';
import { TripTotalBar } from '../TripTotalBar.jsx';

const BEFORE_WHERE = new Set(['Booked', 'From', 'When']);
const noop = () => {};

/**
 * The wizard's right column from 1024 px (T500, roadmap 1.3c section 1): the
 * price card until there is a place, then the step's map (Where: the country
 * map, picked countries in the selected tint; Stay: the city picker that sat
 * in the step; Your stays, Trips, Getting there and Review: the picked stops),
 * and at its foot the total bar, one tap from the receipt.
 */
export function WizardAside({
  stepName, priced, summaryDates, party, setParty, gotoGetting, onOpenTotal,
  allCountries, countries, toggleCountry, recommendedNames, countryCovers, onBrief,
  mapCities, toggleCity, setFocusedId, anchorDest, includedIds,
}) {
  const anchor = anchorDest && anchorDest.lat != null ? { lat: anchorDest.lat, lon: anchorDest.lon } : null;
  let body;
  if (BEFORE_WHERE.has(stepName) || (!includedIds.length && !countries.size && stepName !== 'Where')) {
    body = (
      <PlanTotal priced={priced} dates={summaryDates} party={party} onParty={setParty} onAddFare={gotoGetting} />
    );
  } else if (stepName === 'Where' || (stepName !== 'Stay' && !includedIds.length)) {
    body = (
      <div className="wiz-aside-map">
        <CountryPickerMap
          countries={allCountries}
          selected={countries}
          onToggle={toggleCountry}
          recommended={recommendedNames}
          covers={countryCovers}
          onBrief={onBrief}
        />
      </div>
    );
  } else if (stepName === 'Stay') {
    body = (
      <div className="wiz-aside-map">
        <CityPickerMap
          cities={mapCities}
          onToggle={toggleCity}
          onFocus={(id) => setFocusedId((cur) => (cur === id ? '' : id))}
          anchor={anchor}
        />
      </div>
    );
  } else {
    // The trip's own stops: looking, not choosing, so a pin does nothing.
    body = (
      <div className="wiz-aside-map">
        <CityPickerMap cities={mapCities} onToggle={noop} onFocus={noop} anchor={anchor} />
      </div>
    );
  }
  return (
    <aside className="wiz-rail wiz-aside">
      <div className="wiz-aside-body">{body}</div>
      <TripTotalBar priced={priced} layout="bar" onOpen={onOpenTotal} className="wiz-aside-total" />
    </aside>
  );
}
