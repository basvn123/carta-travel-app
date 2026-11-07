import { useSettings } from '../../components/SettingsLine.jsx';
import React from 'react';
import { resolveWhen } from '../../lib/when.js';
import { partyOf } from '../../lib/party.js';
import { homePoint, wayFor } from '../../lib/travelWay.js';
import { flightLegs } from '../../lib/price/flight.js';
import { destAnchor } from '../../lib/origins.js';
import { legCost } from '../../lib/flights/flights.js';
import { legMinutes, minVerdict } from '../ExploreFilterRail.jsx';
import { makeLabels, whyFacts, noCarOk, underOk, quietOk, matchGuided, guidedComparator } from '../../lib/guidedSearch.js';
import { overviewRegion, overviewScore, reasonText, overviewReason } from '../../lib/placeOverview.js';
import { fmtMonthRanges } from '../ClimateStrip.jsx';
import { buildNearbyIndex, roleOf, kindOf } from '../../lib/taxonomy.js';
import { bandAtLeast } from '../../lib/rating.js';

export function useExploreRows({
  availableCountries, bbox, catAllRows, catRows, countryFilter, countryNot, data, dxf, guided,
  lang, sortKey, t, travelMonth, view, visible, xf,
}) {
  // How the traveller gets there (T518, T582): under the settings line's
  // way, each place carries `cost.way`, { mode, perPerson, airline?, hours? }:
  // the cheapest return flight a seat in the travel month from the home
  // airport's sweep (data.flights), or a train, coach or car journey from
  // the traveller's From point (lib/travelWay.js), or with any way the
  // cheapest of them. The party splits it (children, babies on a lap, T579).
  // With a month or any time (T578) the flight is the month's or the
  // year's cheapest. A place the chosen ground way cannot reach leaves the
  // list; a place without a flight keeps its row in plane mode, as before.
  const settingsLine = useSettings();
  const setExploreMonth = settingsLine?.setExploreMonth;
  React.useEffect(() => { setExploreMonth?.(dxf.month || null); }, [dxf.month, setExploreMonth]);
  const setCountryNot = settingsLine?.setCountryNot;
  // The one country the list is narrowed to, for its page link and the
  // category doors; none while the list leaves countries out (T581).
  const oneCountry = !countryNot && countryFilter.length === 1 ? countryFilter[0] : null;
  const flights = data?.flights || null;
  // T649: the month the quiet flag judges, from the one helper: the Explore
  // month filter when set, else the traveller's own when.
  const quietWhen = React.useMemo(
    () => (dxf.month ? resolveWhen({ xm: dxf.month }) : (settingsLine?.when || null)),
    [dxf.month, settingsLine?.when],
  );
  // T663 (V7): the flight follows the bed's date mode, from the one request.
  const request = settingsLine?.priceRequest || null;
  const wayMode = settingsLine?.transportMode || 'any';
  // T589: "Flight up to" shows only while flights can be the way there.
  const flightLimitAvailable = !!flights && (wayMode === 'plane' || wayMode === 'any');
  const party = React.useMemo(
    () => partyOf({ group_size: settingsLine?.party, children: settingsLine?.children, babies: settingsLine?.babies }),
    [settingsLine?.party, settingsLine?.children, settingsLine?.babies],
  );
  const home = React.useMemo(
    () => homePoint({ drive_home: settingsLine?.fromPlace, origin: settingsLine?.origin }, data),
    [settingsLine?.fromPlace, settingsLine?.origin, data],
  );
  const wayRows = React.useMemo(() => {
    if (!data?.destinations) return null;
    const m = new Map();
    for (const p of catAllRows) {
      const d = data.destinations[p.id];
      const r = flights && (wayMode === 'plane' || wayMode === 'any') ? flightLegs(flights, destAnchor(d), request) : null;
      // T691: the traveller's bag on both legs, as the calculator prices it.
      const bagKey = request?.baggage;
      const flight = r ? {
        perSeat: legCost(r.out, { paying: 1, bagKey }).perSeat + legCost(r.back, { paying: 1, bagKey }).perSeat,
        airline: r.out.airline,
        minutes: legMinutes(r.out), // T1100: the air time in the door-to-door weighing
      } : null;
      const way = wayFor(d || p, wayMode, { home, party, flight });
      // T589: the outbound flight's length, for the "Flight up to" filter.
      const fmin = flight ? flight.minutes : null;
      m.set(p.id, way ? { ...p, cost: { ...p.cost, way }, fmin } : (wayMode === 'plane' ? p : null));
    }
    return m;
  }, [catAllRows, flights, request, wayMode, home, party, data]);
  const withWay = React.useCallback(
    (list) => (wayRows ? list.map((p) => (wayRows.has(p.id) ? wayRows.get(p.id) : p)).filter(Boolean) : list),
    [wayRows],
  );
  const allRows = React.useMemo(() => withWay(catAllRows), [catAllRows, withWay]);
  const rows = React.useMemo(() => withWay(catRows), [catRows, withWay]);

  // The guided search's context (T442): the place a "near" facet names (from
  // the list's own merged catalogue), and the one way each facet is named.
  const nearRow = React.useMemo(
    () => (xf.near ? allRows.find((p) => p.id === xf.near) || null : null),
    [xf.near, allRows],
  );
  const gctx = React.useMemo(() => ({ guided, nearRow }), [guided, nearRow]);
  const gLabels = React.useMemo(
    () => makeLabels({ t, lang, guided, countries: availableCountries }),
    [t, lang, guided, availableCountries],
  );
  // The why line under a result, while a guided facet is on.
  const whyOn = !!(dxf.vibe || dxf.area || dxf.near || dxf.nb.length);
  const whyOf = React.useCallback(
    (p) => whyFacts(p, dxf, { ...gctx, t, lang, labels: gLabels }).join(', ') || null,
    [dxf, gctx, t, lang, gLabels],
  );
  // T504 (roadmap 1.5): what a place says in its one overview, worked out
  // once per place for the list, the map's picked card and the phone's
  // drawer alike. The month is the one set by hand, else the month of the
  // traveller's dates; without one the overview shows the base Score.
  const ovMonth = dxf.month || travelMonth || null;
  const overviewOf = React.useCallback((p) => ({
    region: overviewRegion(guided, p.id, lang),
    rating: overviewScore(p, ovMonth),
    reason: reasonText(
      overviewReason(p, { month: ovMonth, why: whyOn ? whyOf(p) : null }),
      t,
      { monthName: gLabels.monthInline, monthRanges: (ms) => fmtMonthRanges(ms, t) },
    ),
  }), [guided, lang, ovMonth, whyOn, whyOf, t, gLabels]);

  // C1's role needs the neighbour count; built once per catalogue.
  const nearby = React.useMemo(
    () => (data?.destinations ? buildNearbyIndex(data.destinations) : {}),
    [data],
  );
  const roleFor = React.useCallback(
    (p) => roleOf(p, nearby[p.id] || 0),
    [nearby],
  );

  // C6: the taxonomy filters, applied after the catalog hook's own. The
  // count shown in the control bar is THIS list's length (or, while the map
  // is up, the part of it inside the viewport), so it can never disagree
  // with what renders.
  const taxRows = React.useMemo(() => rows.filter((p) => {
    if (dxf.kinds.length && !dxf.kinds.includes(kindOf(p))) return false;
    if (dxf.verdicts.length && !bandAtLeast(p.rating, minVerdict(dxf.verdicts))) return false;
    if (dxf.roles.length && !dxf.roles.includes(roleFor(p).key)) return false;
    if (dxf.month && !(p.climate?.best || []).includes(dxf.month)) return false;
    if (dxf.nocar && !noCarOk(p)) return false;
    if (dxf.budget && !underOk(dxf.budget)(p)) return false;
    if (dxf.bmin && !(p.cost?.dayEur != null && p.cost.dayEur >= dxf.bmin)) return false;
    // T589: a flight longer than the limit drops the place; no flight drops
    // it only when the traveller goes by plane.
    if (dxf.fh && flightLimitAvailable) {
      if (p.fmin != null ? p.fmin > dxf.fh * 60 : wayMode === 'plane') return false;
    }
    if (dxf.quiet && !quietOk(p, quietWhen)) return false;
    if (dxf.badged && !p.country_badge) return false;
    if (dxf.sea && !(p.categories || []).some((c) => c === 'beach' || c === 'coast' || c === 'island')) return false;
    // The guided facets (vibe, area, near, close by) hold only once the
    // guided data has landed; until then the list waits empty rather than
    // showing places that may not match (T442).
    if ((dxf.vibe || dxf.area || dxf.near || dxf.nb.length) && !matchGuided(p, dxf, gctx)) return false;
    return true;
  }), [rows, dxf, roleFor, gctx, flightLimitAvailable, wayMode, quietWhen]);
  // A guided question ranks its answer: nearest first around a place, the
  // strongest vibe first otherwise, while the reader keeps the default sort.
  const guidedRows = React.useMemo(() => {
    if (sortKey && sortKey !== 'beauty') return taxRows;
    // (T444: under a guided question "beauty" reads "Best match"; picking
    // "Rating" sets "rating", which the catalogue sorts by rating.)
    const cmp = guidedComparator(dxf, gctx);
    return cmp ? [...taxRows].sort(cmp) : taxRows;
  }, [taxRows, dxf, gctx, sortKey]);

  // C7: what the map's viewport holds, counted live while the map is shown.
  const shownRows = React.useMemo(() => {
    if (view !== 'map' || !bbox) return guidedRows;
    const [w, so, e, n] = bbox;
    return guidedRows.filter((p) => {
      const lat = p.city_lat ?? p.lat;
      const lon = p.city_lon ?? p.lon;
      return lat >= so && lat <= n && lon >= w && lon <= e;
    });
  }, [guidedRows, view, bbox]);

  // One list shape everywhere (T427): compact rows, beside the map too.
  const listed = React.useMemo(
    () => (view === 'map' ? shownRows : guidedRows).slice(0, visible),
    [guidedRows, shownRows, view, visible],
  );
  return { settingsLine, setCountryNot, oneCountry, request, flightLimitAvailable, allRows, rows, nearRow, gLabels, overviewOf, roleFor, taxRows, guidedRows, shownRows, listed };
}
