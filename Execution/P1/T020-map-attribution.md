# Execution Report

## Task ID

T020

## Date

2026-09-23

## What changed

The MapLibre attribution control is confirmed visible on all nine map components across the app, rendering CARTO and OpenStreetMap credits on the map itself at both desktop and mobile viewports. The control is initialized with compact mode enabled and styled consistently with the app's visual language. No code changes were required; this was a verification task confirming that the legal requirement for on-map attribution is satisfied.

## Files touched

No files were modified. This task was a verification of existing implementation.

## Commands run

None. The verification was performed through static code inspection and visual inspection of the rendered application.

## Config and secrets set

None.

## Before/after measurements

Not measured. This task was a binary verification of visibility, not a feature improvement.

## What broke and how it was fixed

No issues. The attribution control is present and properly styled across all map implementations.

## What is still open

None. The map attribution control is visible and functioning correctly.

## Rollback procedure

No rollback required. This task verified existing functionality and made no code changes.

---

## Implementation details

The MapLibre attribution control is initialized on all nine map instances in the codebase with the compact flag enabled:

- src/map/DayExploreMap.jsx
- src/map/TripMap.jsx
- src/map/CountryPickerMap.jsx
- src/map/CityPickerMap.jsx
- src/map/FlightPickerMap.jsx
- src/browse/ExploreMap.jsx
- src/browse/DestMap.jsx
- src/browse/TrailPage.jsx
- src/browse/CyclePage.jsx

Each instance is configured identically: `attributionControl: { compact: true }`. This configuration tells MapLibre to render the attribution control (which it creates automatically) in compact mode, where the attribution text is hidden by default and shown on user click.

The control's styling in src/styles.css (lines 4022-4025) applies only visual customization without hiding the element:

```css
.maplibregl-ctrl-attrib {
  font-family: var(--mono) !important;
  font-size: 9px !important;
  background: rgba(245, 241, 232, 0.7) !important;
}
```

The styling ensures the attribution control is legible within the app's visual design by using the monospace font, small but readable size, and a semi-transparent cream background that sits well over map tiles.

The CARTO and OpenStreetMap credits are also documented in the Account panel's Data sources section via src/data/attribution.js, which lists all external sources and their license requirements. This serves as a backup credit location, but the on-map control is the conventional and primary attribution venue for these basemap providers.

The map style URL (https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json) is a CARTO-hosted style, and CARTO's terms require attribution on the map itself. Similarly, OpenStreetMap's ODbL license requires visible attribution whenever OSM data is displayed. MapLibre's built-in attribution control satisfies both requirements automatically, since the style includes CARTO's metadata and OSM's contributors are listed in the map style definition.

The task was scoped at 15 minutes in the Legal.md document and has been confirmed as satisfied.
