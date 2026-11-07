import { lazy } from 'react';

// Lazy: the page imports maplibre-gl, which stays out of the main bundle.
export const StubPage = lazy(() => import('../StubPage.jsx').then((m) => ({ default: m.StubPage })));

export const TrailPage = lazy(() => import('../TrailPage.jsx').then((m) => ({ default: m.TrailPage })));

// Lazy for symmetry, not for weight: the beach page carries no map, but it is
// only ever reached by tapping a card, so it can arrive then.
export const BeachPage = lazy(() => import('../BeachPage.jsx').then((m) => ({ default: m.BeachPage })));

export const LakePage = lazy(() => import('../LakePage.jsx').then((m) => ({ default: m.LakePage })));

export const MountainPage = lazy(() => import('../MountainPage.jsx').then((m) => ({ default: m.MountainPage })));

export const CyclePage = lazy(() => import('../CyclePage.jsx').then((m) => ({ default: m.CyclePage })));

export const CycleFamilyPage = lazy(
  () => import('../CyclePage.jsx').then((m) => ({ default: m.CycleFamilyPage })),
);

// The itinerary page mounts TripMap, and TripMap pulls in maplibre-gl.
export const TripPage = lazy(() => import('../TripPage.jsx').then((m) => ({ default: m.TripPage })));

// The curated week's page: no map, but only ever reached by tapping a card.
export const JourneyPage = lazy(() => import('../JourneyPage.jsx').then((m) => ({ default: m.JourneyPage })));
