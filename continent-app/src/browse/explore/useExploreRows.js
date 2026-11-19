import { useSettings } from '../../components/SettingsLine.jsx';
import React from 'react';
import { resolveWhen } from '../../lib/when.js';
import { partyOf } from '../../lib/party.js';
import { homePoint } from '../../lib/travelWay.js';
import { wayRowsFor, wayKey, flightFiles, waysReady, wayRowsPending, warmWays } from '../../lib/settings/ways.js';
import { makeLabels, whyFacts, noCarOk, underOk, quietOk, matchGuided, guidedComparator } from '../../lib/guidedSearch.js';
import { overviewRegion, overviewScore, reasonText, overviewReason } from '../../lib/placeOverview.js';
import { fmtMonthRanges } from '../ClimateStrip.jsx';
import { buildNearbyIndex, roleOf } from '../../lib/taxonomy.js';
import { bandAtLeast, minVerdict } from '../../lib/rating.js';
import { picksOk, rankVibe, tempOk } from '../filters/filterModel.js';

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
  // G12 (D10): the flight follows the Settings When (lib/price/flight.js:
  // checked pairs of the trip length, else the route's typical fare,
  // flagged), from every home airport file the app holds. No setting
  // removes a row: a way with no figure is kept as notKnown. The climate
  // month filter no longer sets the app's month: When owns it now (the
  // logic critic's fact 5: two months gave wrong prices).
  const settingsLine = useSettings();
  const setCountryNot = settingsLine?.setCountryNot;
  // The one country the list is narrowed to, for its page link and the
  // category doors; none while the list leaves countries out (T581).
  const oneCountry = !countryNot && countryFilter.length === 1 ? countryFilter[0] : null;
  const flights = data?.flights || null;
  const files = React.useMemo(() => flightFiles(data), [data]);
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
  // G12: memoised on the part of the request a way depends on (wayKey), so
  // a price view or span change reprices nothing here; the figure itself is
  // lib/settings priceFigure at render.
  const wKey = wayKey(request, wayMode, home, party);
  // G12, D10 (round 7): ways not yet kept for these inputs (App warms them
  // ahead of a re-price, but not for inputs Explore holds while the start
  // town is still unknown) are worked out in slices here; until then every
  // row shows its way as not known yet, never a guessed figure.
  const [waysTick, setWaysTick] = React.useState(0);
  const wayRows = React.useMemo(() => {
    if (!data?.destinations) return null;
    const args = { rows: catAllRows, destinations: data.destinations, files, request, mode: wayMode, home, party };
    if (!waysReady(args)) return { pending: true, map: wayRowsPending(args) };
    return { pending: false, map: wayRowsFor(args) };
    // `request` is read through wKey: only a change that moves a way reprices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catAllRows, files, wKey, data, waysTick]);
  const waysPending = !!wayRows?.pending;
  React.useEffect(() => {
    if (!waysPending || !data?.destinations) return undefined;
    const ctl = new AbortController();
    warmWays({ destinations: data.destinations, files, request, mode: wayMode, home, party, signal: ctl.signal })
      .then((done) => { if (done && !ctl.signal.aborted) React.startTransition(() => setWaysTick((n) => n + 1)); });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waysPending, wKey, data, files]);
  const withWay = React.useCallback(
    (list) => (wayRows ? list.map((p) => (wayRows.map.has(p.id) ? wayRows.map.get(p.id) : p)) : list),
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
  // One predicate for the list (deferred xf) and the sheet's live count
  // (xf as tapped): the count reads the rows already priced, so "Show n
  // places" follows a tap at once while the list follows after (owner: the
  // count lagged 0.5 to 1 s behind a tap).
  const keepFor = React.useCallback((f, when) => (p) => {
    if (f.verdicts.length && !bandAtLeast(p.rating, minVerdict(f.verdicts))) return false;
    if (f.month && !(p.climate?.best || []).includes(f.month)) return false;
    if (f.nocar && !noCarOk(p)) return false;
    if (f.budget && !underOk(f.budget)(p)) return false;
    if (f.quiet && !quietOk(p, when)) return false;
    if ((f.vibe || f.area || f.near || f.nb.length) && !matchGuided(p, f, gctx)) return false;
    if (f.temps.length && travelMonth && !tempOk(p, travelMonth, f.temps)) return false;
    if (f.picks.length && !picksOk(p, f.picks, guided)) return false;
    return true;
  }, [gctx, travelMonth, guided]);
  const liveWhen = React.useMemo(
    () => (xf.month ? resolveWhen({ xm: xf.month }) : (settingsLine?.when || null)),
    [xf.month, settingsLine?.when],
  );
  // The count for any filter state, for the sheet to show before React
  // renders the tab: one cheap pass over the rows already priced.
  const countFor = React.useCallback((f) => {
    const keep = keepFor(f, f.month ? resolveWhen({ xm: f.month }) : (settingsLine?.when || null));
    let n = 0;
    for (const p of rows) if (keep(p)) n += 1;
    return n;
  }, [rows, keepFor, settingsLine?.when]);
  const liveTotal = React.useMemo(() => {
    if (xf === dxf) return null;
    let n = 0;
    const keep = keepFor(xf, liveWhen);
    for (const p of rows) if (keep(p)) n += 1;
    return n;
  }, [rows, xf, dxf, keepFor, liveWhen]);
  // The guided facets and the sheet's picks hold only once the guided data
  // has landed (T442); the day high reads Settings' When month and waits
  // without one (decision.md section 2). See keepFor above.
  const taxRows = React.useMemo(() => rows.filter(keepFor(dxf, quietWhen)), [rows, dxf, keepFor, quietWhen]);
  // A guided question ranks its answer: nearest first around a place, the
  // strongest vibe first otherwise, while the reader keeps the default sort.
  const guidedRows = React.useMemo(() => {
    if (sortKey && sortKey !== 'beauty') return taxRows;
    // (T444: under a guided question "beauty" reads "Best match"; picking
    // "Rating" sets "rating", which the catalogue sorts by rating.)
    // A pick with a vibe behind it (Hiking bases, Islands) orders its list
    // the way the same typed word does, strongest first.
    const rank = !dxf.vibe && !dxf.near ? rankVibe(dxf.picks) : null;
    const cmp = guidedComparator(rank ? { ...dxf, vibe: rank } : dxf, gctx);
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
  return { settingsLine, setCountryNot, oneCountry, request, flightLimitAvailable, allRows, rows, nearRow, gLabels, overviewOf, roleFor, taxRows, liveTotal, countFor, guidedRows, shownRows, listed };
}
