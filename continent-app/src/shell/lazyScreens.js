import { lazy } from 'react';

// A failed dynamic import is almost always a stale bundle: the client is still
// running an old index.html whose chunk hashes no longer exist on the server
// (common on mobile Safari / installed PWAs after a redeploy). Safari reports
// this as "Importing a module script failed." Rather than surface that as a
// crash, force one hard reload to fetch the fresh manifest, guarding against a
// reload loop so a genuinely-broken chunk still eventually shows the error.
const CHUNK_RELOAD_KEY = 'continent.chunkReloaded.v1';

function lazyWithReload(factory) {
  return lazy(async () => {
    try {
      const mod = await factory();
      try { window.sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch {}
      return mod;
    } catch (err) {
      let alreadyReloaded = false;
      try { alreadyReloaded = !!window.sessionStorage.getItem(CHUNK_RELOAD_KEY); } catch {}
      if (!alreadyReloaded) {
        try { window.sessionStorage.setItem(CHUNK_RELOAD_KEY, '1'); } catch {}
        window.location.reload();
        // Never resolve: keep the Suspense fallback up until the reload lands,
        // so React doesn't render the error state in the meantime.
        return new Promise(() => {});
      }
      throw err;
    }
  });
}

// Code-split the two planner tabs (maplibre-gl rides along with them), so the
// first paint only ships the browse UI shell. The Explore tab itself no
// longer mounts a map at all.
export const TripPlannerTab = lazyWithReload(() => import('../planner/TripPlannerTab.jsx').then((m) => ({ default: m.TripPlannerTab })));

export const DayPlannerTab = lazyWithReload(() => import('../planner/DayPlannerTab.jsx').then((m) => ({ default: m.DayPlannerTab })));

// The Plan place with nothing open (T654): the opening, the trip-kind sheet
// and a new trip's setup questions. Lazy, with the planners' sheet.
export const PlanFlow = lazyWithReload(() => import('../planner/flow/PlanFlow.jsx').then((m) => ({ default: m.PlanFlow })));

// The back office. Lazy because it ships to one account in the whole user
// base, and every traveller would otherwise pay for its bytes.
export const AdminPage = lazyWithReload(() => import('../admin/AdminPage.jsx').then((m) => ({ default: m.AdminPage })));

// The Trip Pass prices, a place with its own address (T496, owner T488-d).
// The page itself is T497's; App only gives it a route.
export const PricingPage = lazyWithReload(() => import('../pass/PricingPage.jsx'));

// The guides gallery streams in on demand: it is a whole browse surface
// plus the trip map, and most sessions never open it.
export const GuidesPanel = lazy(() => import('../community/GuidesPanel.jsx').then((m) => ({ default: m.GuidesPanel })));

export const RegionPage = lazy(() => import('../browse/RegionPage.jsx').then((m) => ({ default: m.RegionPage })));

export const CountryPage = lazy(() => import('../browse/CountryPage.jsx').then((m) => ({ default: m.CountryPage })));

// My trips is its own chunk with its own stylesheet (T434): nothing of it is
// needed before the traveller opens it.
export const SavedTripsPanel = lazy(() => import('../auth/SavedTripsPanel.jsx').then((m) => ({ default: m.SavedTripsPanel })));

export const TogetherPage = lazy(() => import('../together/TogetherPage.jsx').then((m) => ({ default: m.TogetherPage })));

export const TogetherSheet = lazy(() => import('../planner/finder/FindingTrips.jsx').then((m) => ({ default: m.TogetherSheet })));
