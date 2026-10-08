# File ownership for the design waves (v6)

Written by T380 (design wave V2, 2026-10-08). Every file under `continent-app/src/` belongs to exactly one of the ten surfaces, and only that surface's build sessions (V3, V4, V5) edit it. The assignment is checked by `scripts/check_ownership.mjs` in the app repo, which walks `src/` and reads the tables below; it printed 461 files on disk, 461 assigned, 0 missing, 0 doubled on 2026-10-08. Run it again whenever a file is added or moved and update the table in the same commit.

The surfaces, in the order of the v6 stylesheets:

| Key | Surface | v6 stylesheet | Build sessions |
|---|---|---|---|
| shell | App shell, navigation, shared components and shared helpers | `60-v6-shell.css` | T381, T391, T401 |
| landing | The landing page and the first-run receipt | `61-v6-landing.css` | T382, T392, T402 |
| explore | Explore, the map tab | `62-v6-explore.css` | T383, T393, T403 |
| destinations | Destinations browse, regions, stubs, coverage | `63-v6-destinations.css` | T384, T394, T404 |
| destination | The destination (town) page and its PDF | `64-v6-destination.css` | T385, T395, T405 |
| outdoor | Trail, cycle route, tour, beach, lake and mountain pages and the detail skeleton | `65-v6-outdoor.css` | T386, T396, T406 |
| trips | The journeys library, the journey page and the composed route page | `66-v6-trips.css` | T387, T397, T407 |
| tripplanner | The trip wizard, the planned trip, its maps and exports | `67-v6-tripplanner.css` | T388, T398, T408 |
| dayplanner | The day planner, the chat planner, the day builder and its exports | `68-v6-dayplanner.css` | T389, T399, T409 |
| account | My trips, sharing, the record, Account, sign-in, passes, guides, upload and admin | `69-v6-account.css` | T390, T400, T410 |

## How ownership works

1. A build session edits only files its surface owns, plus the six i18n catalogues under its own prefixes (next section). A change it needs in another surface's file is a hand-off: it writes the request as a register row naming the owner's next session, and in the meantime it overrides the look from its own v6 stylesheet, which loads last. A shared component is changed by its owner on request; the requesting surface says what it needs, not how to build it.
2. Shared components and `App.jsx` belong to shell. "Shared" means rendered by two or more surfaces or by the chrome: Button, Icons, StateBlocks, Dropdown, DateField, FilterControls, the pickers, InfoDot, Fold, SheetShell, FilterChips, SectionRail, DayTrack, FlashDeck, CostBar, MonthStrip, HeroImage, RatingBadge, GemRating, KindGlyph, CountryFlag, TransportIcons, FavStar, ReportProblem, the Lifestyle panel and button, the legal pages, the error and maintenance screens. Shell also owns the shared helpers in `src/lib/` that more than one surface reads (pricing through `costIndex.js` and `runtime_pricing.js`, formatting, dates, URLs, motion, the shared-element transition, the token mirror) and the hooks the app mounts.
3. A component rendered by one surface only belongs to that surface even when it sits in `src/components/` (CostSummary to explore, FirstRunReceipt to landing, CountryIntel and FareProvenance to tripplanner, NotFor and LayerPhoto to outdoor, PackIcons and FactMeter to trips, PassModal to account, CrowdingBadge and WaterQualityBadge to destination).
4. Where two surfaces both render a component and both briefs want to change it, the surface whose brief changes it most owns it and the other asks: PlacesFilterSheet, CoverageEmpty and HonestFooters to destinations (Explore and the outdoor pages ask); DetailSkeleton, Signature, RouteFigures, RouteParts, CreditFold and NotFor to outdoor (the trip page asks); TripMap, MagicImportZone and PlannerSection to tripplanner (the day planner asks); FirstRunReceipt to landing (the destination and journey pages ask, additive props only); CostSummary to explore (the destination page asks); CategoryRail and CountryPage to explore (only ExploreTab renders them); the chat planner (CartaChatPlanner, TownPickerStep, RouteBuildingStage, AiPlanRoute) to dayplanner (only DayPlannerTab mounts it).
5. Old stylesheets are owned by the surface whose rules fill most of them. Many carry rules for other surfaces (the trip wizard's controls in `19-guide-ratings.css`, `24-destination-workspace.css` and `26-shortlist-extras.css`; the day planner's `dayws`, `dayp`, `daya`, `dayr` and `dayf` rules in `24-destination-workspace.css`; the account shell overrides in `23`, `24` and `25`; the account feedback sheet in `42-feedback.css` which also styles the shared ReportProblem). The rule for those: a surface moves the rules that belong to it out of a file it does not own into its own v6 stylesheet, deleting them from the old file in the same commit, and that deletion is the one edit it may make in the other surface's file. It never edits a rule it does not move. The v6 stylesheets load last, so until the move the surface may override instead.
6. The ten v6 stylesheets are each owned by their surface and hold only that surface's rules. Nothing goes into a v6 stylesheet of another surface, and nothing new goes into an old stylesheet.
7. Logic files (a `.js` that renders nothing) are owned so that every edit has one owner, but a build wave edits them only for a change a brief names; they are not design surfaces.
8. New files take the surface of the file that mounts them and are added to the table in the same commit. A new shared component (mounted by two or more surfaces from the start) goes to shell.
9. Harness scripts under `scripts/` are not in the table: a surface runs and updates the harnesses its brief lists ("Files the build waves will touch"), with a comment on every changed assertion. `scripts/verify_keyboard.mjs` and `scripts/verify_quality_floor.mjs` are shared floors: any surface may add a case for its own views and must leave the others' cases alone.
10. `src/map/tokenColors.js` is shell's, as DESIGN.md says: a surface that needs a new mirrored colour asks shell, because the design lint's `token-mirror-drift` rule reads that one file.

## The six i18n catalogues

`src/i18n/en.js`, `de.js`, `es.js`, `fr.js`, `it.js` and `nl.js` (and `index.jsx`) are shared and listed under shell for the check. Every surface adds, changes or removes keys only under its own prefixes, in all six files at once, and parses the six before committing (session rule 8). A key that two surfaces need goes under a shell prefix and shell adds it on request. Prefixes were taken from how `en.js` is used today (`grep` over `src/`); a prefix not listed here is shell's until a surface claims it in this file.

| Surface | Prefixes |
|---|---|
| shell | `brand`, `shell`, `toast`, `a11y`, `common`, `nav`, `header`, `lang`, `lifestyle`, `settings` (new, the settings line), `side`, `state`, `empty`, `maintenance`, `origin`, `country`, `glossary`, `num`, `prov`, `dropdown`, `kind`, `pkind`, `role`, `monthStrip`, `legend`, `dir`, `tip`, `fig`, `photo`, `credit`, `layer`, `mode`, `why`, `sig`, `feat`, `band`, `scope`, `prerender`, and any `legal.*` the shell adds |
| landing | `landing`, `receipt` |
| explore | `explore`, `filter`, `sort`, `results`, `compare`, `rail`, `cpage`, `rating`, `cost`, `card`, `mapSize`, `map` |
| destinations | `places`, `cov`, `open`, `stub`, `region`, `trails` (the browse strings; the trail page's own strings are `detail.*` and `route.*`), `cycle` (browse) |
| destination | `dest`, `bestTime`, `crowd`, `water`, `pdf`, `nb`, `transfer` |
| outdoor | `detail`, `route`, `sig` (shared with trips and the day planner through shell), `derived`, `notfor`, `beach`, `lake`, `mtn`, `trails` and `cycle` (page strings; agreed with destinations by key, not by prefix) |
| trips | `journey`, `itin`, `trip` (the composed route page and trip cards; the planner's `trip.*` keys are tripplanner's by key), `gate`, `stay` (journey receipt), `fav` |
| tripplanner | `wizard`, `quiz`, `brief`, `match`, `ready`, `travel`, `extras`, `export`, `intel`, `guide`, `trip` (planner keys), `stay` (planner keys) |
| dayplanner | `day`, `dayws`, `dayex`, `chat`, `ai`, `ideas`, `shape` |
| account | `account`, `auth`, `profile`, `friends`, `coplan`, `share`, `saved`, `install`, `pass`, `upload`, `guides`, `report`, `moderation`, `admin` |

Three prefixes are split by key rather than by prefix because two surfaces grew into them: `trip.*` (trips for the composed page and cards, tripplanner for the wizard and planned view), `stay.*` (trips for the journey receipt, tripplanner for the stay step) and `trails.*` and `cycle.*` (destinations for the browse tab, outdoor for the pages). A session that touches one of those keys greps for its uses first and leaves keys the other surface reads alone.

## Hand-offs the briefs already asked for

Written here so the owners pick them up in V3 (each is also a register row on the brief that raised it).

- shell asks landing to write People, Nights and Stay into the shared choices (T382); asks destinations to show the Lifestyle button on every priced category and drop the accent tile tick (T384); asks tripplanner and dayplanner to place the Lifestyle opener and drop their private Steppers (T388, T389); asks account for the language list behind the settings line and the accent pills (T390).
- destinations asks shell for FilterChips on both tabs (shell owns it; Explore already renders it) and asks explore nothing: CategoryRail and CountryPage are explore's.
- destination asks landing for additive props on FirstRunReceipt and asks shell for MonthStrip's data contract if V3-4 adopts it.
- outdoor asks shell for the InfoDot swap in MonthStrip and for `useFocusTrap` changes; asks destinations for the `countryName` guard in DestinationsTab (V3 item 0).
- trips asks landing for a prop on FirstRunReceipt (hide the stay select, pass dates), asks shell for the day track's `onSelect` and the journey boot reader in App.jsx, asks destinations for the journey hand-off in DestinationsTab, asks tripplanner for TripMap's day-numbered mode, and asks account for a `journey` kind in useFavoriteItems.
- tripplanner asks nothing of the day planner; the chat planner is dayplanner's.
- dayplanner asks tripplanner for TripMap's pin styling and asks shell for new glossary terms.
- account asks shell for the "Saved trips" label (`nav.saved` is shell's prefix) and the one App.jsx line that closes My trips before sign-in.

## Files named in a brief that this table gives elsewhere

- `src/browse/NearbyOutdoors.jsx`, `src/components/CountryIntel.jsx` (destination brief): to outdoor and tripplanner, which render them (row T374-b). `src/components/MonthStrip.jsx`: to shell, because the destination, journey, mountain and Explore briefs all want it (T374-b, T375-f).
- `src/planner/ExpenseLedger.jsx` (day planner brief): to tripplanner, which alone draws it (row T378-b).
- `src/components/WaterQualityBadge.jsx`, `src/browse/BathingWater.jsx`: to destination; `src/components/KindGlyph.jsx`: to shell (row T375-f).
- `src/browse/CategoryRail.jsx`, `src/browse/CountryPage.jsx`: to explore; `src/browse/FilterChips.jsx`: to shell; `src/styles/44-tags.css`: to trips; the 67 desktop `.places-*` rules in `24-destination-workspace.css` move to `63-v6-destinations.css` by T384 (row T373-j).
- The chat planner files and the chat half of `21-chat-passes.css`: to dayplanner; the pass half of `21-chat-passes.css` is overridden from `69-v6-account.css` and moved there by T390 (rows T377-h, T378-b).
- The wizard rules in `19`, `24`, `26`, `17`, `18` and `20`: moved into `67-v6-tripplanner.css` by T388 under rule 5 (row T377-i).
- `src/components/ReportProblem.jsx`: to shell; `src/styles/42-feedback.css`: to account, which moves the ReportProblem rules to shell's request or leaves them for shell to override from `60-v6-shell.css` (row T379-b).

## Assignment tables

Kind: "renders" is JSX; "renders (js)" is JavaScript that builds markup, a PDF or an export file; "style" is a stylesheet; "logic" renders nothing. Generated by T380 from the file list on 2026-10-08.

### shell (112 files)

| File | Surface | Kind |
|---|---|---|
| `src/App.jsx` | shell | renders |
| `src/browse/CostBar.jsx` | shell | renders |
| `src/browse/DayTrack.jsx` | shell | renders |
| `src/browse/FilterChips.jsx` | shell | renders |
| `src/browse/FlashDeck.jsx` | shell | renders |
| `src/browse/Fold.jsx` | shell | renders |
| `src/browse/LifestyleButton.jsx` | shell | renders |
| `src/browse/LifestylePanel.jsx` | shell | renders |
| `src/browse/SectionRail.jsx` | shell | renders |
| `src/browse/SheetShell.jsx` | shell | renders |
| `src/components/AnnouncementBar.jsx` | shell | renders |
| `src/components/AppHeader.jsx` | shell | renders |
| `src/components/BottomNav.jsx` | shell | renders |
| `src/components/Button.jsx` | shell | renders |
| `src/components/CountryFlag.jsx` | shell | renders |
| `src/components/CountryPicker.jsx` | shell | renders |
| `src/components/DateField.jsx` | shell | renders |
| `src/components/Dropdown.jsx` | shell | renders |
| `src/components/ErrorBoundary.jsx` | shell | renders |
| `src/components/FavStar.jsx` | shell | renders |
| `src/components/FilterControls.jsx` | shell | renders |
| `src/components/GemRating.jsx` | shell | renders |
| `src/components/HeroImage.jsx` | shell | renders |
| `src/components/Icons.jsx` | shell | renders |
| `src/components/Imprint.jsx` | shell | renders |
| `src/components/InfoDot.jsx` | shell | renders |
| `src/components/KindGlyph.jsx` | shell | renders |
| `src/components/LegalFromUrl.jsx` | shell | renders |
| `src/components/Logo.jsx` | shell | renders |
| `src/components/MaintenanceGate.jsx` | shell | renders |
| `src/components/MonthStrip.jsx` | shell | renders |
| `src/components/OriginPicker.jsx` | shell | renders |
| `src/components/PrivacyPolicy.jsx` | shell | renders |
| `src/components/RatingBadge.jsx` | shell | renders |
| `src/components/ReportProblem.jsx` | shell | renders |
| `src/components/StateBlocks.jsx` | shell | renders |
| `src/components/TermsOfService.jsx` | shell | renders |
| `src/components/TransportIcons.jsx` | shell | renders |
| `src/i18n/index.jsx` | shell | renders |
| `src/main.jsx` | shell | renders |
| `src/lib/icsExport.js` | shell | renders (js) |
| `src/lib/kmlExport.js` | shell | renders (js) |
| `src/lib/prerenderShell.js` | shell | renders (js) |
| `src/map/pinKeys.js` | shell | renders (js) |
| `src/map/tokenColors.js` | shell | renders (js) |
| `src/styles.css` | shell | style |
| `src/styles/01-tokens.css` | shell | style |
| `src/styles/02-base.css` | shell | style |
| `src/styles/03-button.css` | shell | style |
| `src/styles/10-shell.css` | shell | style |
| `src/styles/14-filters-panels.css` | shell | style |
| `src/styles/27-states.css` | shell | style |
| `src/styles/31-infodot.css` | shell | style |
| `src/styles/32-day-carousel.css` | shell | style |
| `src/styles/33-flashcards.css` | shell | style |
| `src/styles/34-section-rail.css` | shell | style |
| `src/styles/36-cost-bar.css` | shell | style |
| `src/styles/45-empty-states.css` | shell | style |
| `src/styles/46-owner-calls.css` | shell | style |
| `src/styles/60-v6-shell.css` | shell | style |
| `src/browse/sheetAnchor.js` | shell | logic |
| `src/data/attribution.js` | shell | logic |
| `src/hooks/useAppData.js` | shell | logic |
| `src/hooks/useFocusTrap.js` | shell | logic |
| `src/hooks/useIsDesktop.js` | shell | logic |
| `src/hooks/usePanelState.js` | shell | logic |
| `src/hooks/useSiteConfig.js` | shell | logic |
| `src/hooks/useUrlSync.js` | shell | logic |
| `src/i18n/de.js` | shell | logic |
| `src/i18n/en.js` | shell | logic |
| `src/i18n/es.js` | shell | logic |
| `src/i18n/fr.js` | shell | logic |
| `src/i18n/it.js` | shell | logic |
| `src/i18n/nl.js` | shell | logic |
| `src/lib/accuracy.js` | shell | logic |
| `src/lib/affiliate.js` | shell | logic |
| `src/lib/appData.js` | shell | logic |
| `src/lib/bootIndex.js` | shell | logic |
| `src/lib/catalogue.js` | shell | logic |
| `src/lib/costIndex.js` | shell | logic |
| `src/lib/dataHost.js` | shell | logic |
| `src/lib/dates.js` | shell | logic |
| `src/lib/dayTrack.js` | shell | logic |
| `src/lib/e2eSeams.js` | shell | logic |
| `src/lib/figureChange.js` | shell | logic |
| `src/lib/flashcards.js` | shell | logic |
| `src/lib/format.js` | shell | logic |
| `src/lib/glossary.js` | shell | logic |
| `src/lib/heroImage.js` | shell | logic |
| `src/lib/homeVisit.js` | shell | logic |
| `src/lib/imageLadder.js` | shell | logic |
| `src/lib/launchEvents.js` | shell | logic |
| `src/lib/localeState.js` | shell | logic |
| `src/lib/math.js` | shell | logic |
| `src/lib/motion.js` | shell | logic |
| `src/lib/origins.js` | shell | logic |
| `src/lib/overrides.js` | shell | logic |
| `src/lib/pathBoot.js` | shell | logic |
| `src/lib/pictureFlag.js` | shell | logic |
| `src/lib/publishedJson.js` | shell | logic |
| `src/lib/reach.js` | shell | logic |
| `src/lib/runtime_pricing.js` | shell | logic |
| `src/lib/sharedElement.js` | shell | logic |
| `src/lib/statusFile.js` | shell | logic |
| `src/lib/supabaseClient.js` | shell | logic |
| `src/lib/taxonomy.js` | shell | logic |
| `src/lib/textSearch.js` | shell | logic |
| `src/lib/touchFeedback.js` | shell | logic |
| `src/lib/trip_kinds.js` | shell | logic |
| `src/lib/urlScheme.js` | shell | logic |
| `src/lib/urlState.js` | shell | logic |
| `src/map/coords.js` | shell | logic |

### landing (8 files)

| File | Surface | Kind |
|---|---|---|
| `src/browse/LandingPage.jsx` | landing | renders |
| `src/components/FirstRunReceipt.jsx` | landing | renders |
| `src/styles/38-first-run.css` | landing | style |
| `src/styles/39-landing.css` | landing | style |
| `src/styles/61-v6-landing.css` | landing | style |
| `src/lib/firstRun.js` | landing | logic |
| `src/lib/firstRunContext.js` | landing | logic |
| `src/lib/landing.js` | landing | logic |

### explore (18 files)

| File | Surface | Kind |
|---|---|---|
| `src/browse/CategoryRail.jsx` | explore | renders |
| `src/browse/CountryPage.jsx` | explore | renders |
| `src/browse/ExploreFilterRail.jsx` | explore | renders |
| `src/browse/ExploreMap.jsx` | explore | renders |
| `src/browse/ExploreRails.jsx` | explore | renders |
| `src/browse/ExploreTab.jsx` | explore | renders |
| `src/browse/TierLegend.jsx` | explore | renders |
| `src/components/CostSummary.jsx` | explore | renders |
| `src/styles/15-map-overlays.css` | explore | style |
| `src/styles/62-v6-explore.css` | explore | style |
| `src/hooks/useDestinationSearch.js` | explore | logic |
| `src/hooks/useExploreCatalog.js` | explore | logic |
| `src/hooks/useFilterState.js` | explore | logic |
| `src/lib/knownFor.js` | explore | logic |
| `src/lib/placeSize.js` | explore | logic |
| `src/lib/placeStory.js` | explore | logic |
| `src/lib/rating.js` | explore | logic |
| `src/lib/searchIndex.js` | explore | logic |

### destinations (21 files)

| File | Surface | Kind |
|---|---|---|
| `src/browse/CardStrip.jsx` | destinations | renders |
| `src/browse/CoverageEmpty.jsx` | destinations | renders |
| `src/browse/DestinationsTab.jsx` | destinations | renders |
| `src/browse/HonestFooters.jsx` | destinations | renders |
| `src/browse/PlaceCard.jsx` | destinations | renders |
| `src/browse/PlacesFilterSheet.jsx` | destinations | renders |
| `src/browse/RegionPage.jsx` | destinations | renders |
| `src/browse/SectionOpening.jsx` | destinations | renders |
| `src/browse/StubPage.jsx` | destinations | renders |
| `src/styles/23-places-pages.css` | destinations | style |
| `src/styles/30-section-opening.css` | destinations | style |
| `src/styles/37-card-fillings.css` | destinations | style |
| `src/styles/63-v6-destinations.css` | destinations | style |
| `src/lib/cardFillings.js` | destinations | logic |
| `src/lib/coverageCases.js` | destinations | logic |
| `src/lib/coverageEmpty.js` | destinations | logic |
| `src/lib/footers.js` | destinations | logic |
| `src/lib/geocode.js` | destinations | logic |
| `src/lib/openingScreen.js` | destinations | logic |
| `src/lib/regions.js` | destinations | logic |
| `src/lib/stubs.js` | destinations | logic |

### destination (24 files)

| File | Surface | Kind |
|---|---|---|
| `src/browse/AroundHere.jsx` | destination | renders |
| `src/browse/BathingWater.jsx` | destination | renders |
| `src/browse/ClimateStrip.jsx` | destination | renders |
| `src/browse/CrowdCalendar.jsx` | destination | renders |
| `src/browse/DestMap.jsx` | destination | renders |
| `src/browse/DestinationPage.jsx` | destination | renders |
| `src/browse/GettingThere.jsx` | destination | renders |
| `src/browse/MemberPlaces.jsx` | destination | renders |
| `src/browse/Neighbourhoods.jsx` | destination | renders |
| `src/browse/RatingBreakdown.jsx` | destination | renders |
| `src/browse/RoutesFromHere.jsx` | destination | renders |
| `src/browse/WebcamEmbed.jsx` | destination | renders |
| `src/components/CrowdingBadge.jsx` | destination | renders |
| `src/components/WaterQualityBadge.jsx` | destination | renders |
| `src/lib/destinationPdf.js` | destination | renders (js) |
| `src/styles/18-detail-panel.css` | destination | style |
| `src/styles/24-destination-workspace.css` | destination | style |
| `src/styles/64-v6-destination.css` | destination | style |
| `src/lib/activityAffiliates.js` | destination | logic |
| `src/lib/destInfo.js` | destination | logic |
| `src/lib/dossier.js` | destination | logic |
| `src/lib/mapTile.js` | destination | logic |
| `src/lib/nearby.js` | destination | logic |
| `src/lib/weather.js` | destination | logic |

### outdoor (44 files)

| File | Surface | Kind |
|---|---|---|
| `src/browse/BeachPage.jsx` | outdoor | renders |
| `src/browse/CreditFold.jsx` | outdoor | renders |
| `src/browse/CyclePage.jsx` | outdoor | renders |
| `src/browse/DerivedModules.jsx` | outdoor | renders |
| `src/browse/DetailSkeleton.jsx` | outdoor | renders |
| `src/browse/KeyFacts.jsx` | outdoor | renders |
| `src/browse/LakePage.jsx` | outdoor | renders |
| `src/browse/MountainPage.jsx` | outdoor | renders |
| `src/browse/NearbyOutdoors.jsx` | outdoor | renders |
| `src/browse/PointMap.jsx` | outdoor | renders |
| `src/browse/RouteFigures.jsx` | outdoor | renders |
| `src/browse/RouteParts.jsx` | outdoor | renders |
| `src/browse/Signature.jsx` | outdoor | renders |
| `src/browse/TrailPage.jsx` | outdoor | renders |
| `src/components/LayerPhoto.jsx` | outdoor | renders |
| `src/components/NotFor.jsx` | outdoor | renders |
| `src/lib/gpxPrivacy.js` | outdoor | renders (js) |
| `src/lib/trailExport.js` | outdoor | renders (js) |
| `src/styles/28-detail-skeleton.css` | outdoor | style |
| `src/styles/29-derived-modules.css` | outdoor | style |
| `src/styles/29-signature.css` | outdoor | style |
| `src/styles/65-v6-outdoor.css` | outdoor | style |
| `src/hooks/usePlaceExits.js` | outdoor | logic |
| `src/lib/beachStory.js` | outdoor | logic |
| `src/lib/beaches.js` | outdoor | logic |
| `src/lib/cycleStory.js` | outdoor | logic |
| `src/lib/cycling.js` | outdoor | logic |
| `src/lib/derivedModules.js` | outdoor | logic |
| `src/lib/detailSkeleton.js` | outdoor | logic |
| `src/lib/lakeStory.js` | outdoor | logic |
| `src/lib/lakes.js` | outdoor | logic |
| `src/lib/mountainStory.js` | outdoor | logic |
| `src/lib/mountains.js` | outdoor | logic |
| `src/lib/neighbours.js` | outdoor | logic |
| `src/lib/notFor.js` | outdoor | logic |
| `src/lib/numberSentences.js` | outdoor | logic |
| `src/lib/routeFigures.js` | outdoor | logic |
| `src/lib/signature.js` | outdoor | logic |
| `src/lib/terrainSource.js` | outdoor | logic |
| `src/lib/trailCards.js` | outdoor | logic |
| `src/lib/trailGeo.js` | outdoor | logic |
| `src/lib/trailShape.js` | outdoor | logic |
| `src/lib/trailStory.js` | outdoor | logic |
| `src/lib/trails.js` | outdoor | logic |

### trips (37 files)

| File | Surface | Kind |
|---|---|---|
| `src/browse/BookingOrder.jsx` | trips | renders |
| `src/browse/JourneyPage.jsx` | trips | renders |
| `src/browse/JourneyRoute.jsx` | trips | renders |
| `src/browse/JourneysSection.jsx` | trips | renders |
| `src/browse/LengthPicker.jsx` | trips | renders |
| `src/browse/LifestyleSlider.jsx` | trips | renders |
| `src/browse/PackGrid.jsx` | trips | renders |
| `src/browse/TripDayPhotos.jsx` | trips | renders |
| `src/browse/TripFilters.jsx` | trips | renders |
| `src/browse/TripPage.jsx` | trips | renders |
| `src/browse/TripPractical.jsx` | trips | renders |
| `src/browse/WeekPlan.jsx` | trips | renders |
| `src/components/FactMeter.jsx` | trips | renders |
| `src/components/PackIcons.jsx` | trips | renders |
| `src/styles/25-feature-pages.css` | trips | style |
| `src/styles/35-lifestyle-slider.css` | trips | style |
| `src/styles/43-trip-length.css` | trips | style |
| `src/styles/44-tags.css` | trips | style |
| `src/styles/66-v6-trips.css` | trips | style |
| `src/browse/dayShots.js` | trips | logic |
| `src/browse/useFolds.js` | trips | logic |
| `src/lib/bookingOrder.js` | trips | logic |
| `src/lib/dataSheet.js` | trips | logic |
| `src/lib/gateway.js` | trips | logic |
| `src/lib/imageCredit.js` | trips | logic |
| `src/lib/journeys.js` | trips | logic |
| `src/lib/lifestyleSlider.js` | trips | logic |
| `src/lib/packGrid.js` | trips | logic |
| `src/lib/packing.js` | trips | logic |
| `src/lib/priceMonths.js` | trips | logic |
| `src/lib/railAlternative.js` | trips | logic |
| `src/lib/tripFilters.js` | trips | logic |
| `src/lib/tripLength.js` | trips | logic |
| `src/lib/tripStory.js` | trips | logic |
| `src/lib/tripTags.js` | trips | logic |
| `src/lib/trips.js` | trips | logic |
| `src/lib/weekShape.js` | trips | logic |

### tripplanner (55 files)

| File | Surface | Kind |
|---|---|---|
| `src/components/CountryIntel.jsx` | tripplanner | renders |
| `src/components/FareProvenance.jsx` | tripplanner | renders |
| `src/map/CityPickerMap.jsx` | tripplanner | renders |
| `src/map/CountryPickerMap.jsx` | tripplanner | renders |
| `src/map/TripMap.jsx` | tripplanner | renders |
| `src/planner/CheapTipsSection.jsx` | tripplanner | renders |
| `src/planner/CountryBrief.jsx` | tripplanner | renders |
| `src/planner/CountryMatchCards.jsx` | tripplanner | renders |
| `src/planner/ExpenseLedger.jsx` | tripplanner | renders |
| `src/planner/GuidedTripWizard.jsx` | tripplanner | renders |
| `src/planner/GuidedTripWizardParts.jsx` | tripplanner | renders |
| `src/planner/MagicImportZone.jsx` | tripplanner | renders |
| `src/planner/PlannerSection.jsx` | tripplanner | renders |
| `src/planner/ReadyTripsStep.jsx` | tripplanner | renders |
| `src/planner/TravelLegsSection.jsx` | tripplanner | renders |
| `src/planner/TripExtras.jsx` | tripplanner | renders |
| `src/planner/TripItinerary.jsx` | tripplanner | renders |
| `src/planner/TripPlannerTab.jsx` | tripplanner | renders |
| `src/planner/WhereQuiz.jsx` | tripplanner | renders |
| `src/lib/tripExport.js` | tripplanner | renders (js) |
| `src/styles/11-trip-planner.css` | tripplanner | style |
| `src/styles/12-guided-trip.css` | tripplanner | style |
| `src/styles/19-guide-ratings.css` | tripplanner | style |
| `src/styles/26-shortlist-extras.css` | tripplanner | style |
| `src/styles/67-v6-tripplanner.css` | tripplanner | style |
| `src/hooks/useCountryInsights.js` | tripplanner | logic |
| `src/hooks/useTripPlanner.js` | tripplanner | logic |
| `src/lib/baggagePolicies.js` | tripplanner | logic |
| `src/lib/carriers.js` | tripplanner | logic |
| `src/lib/cartaRoute.js` | tripplanner | logic |
| `src/lib/cheapTips.js` | tripplanner | logic |
| `src/lib/countryBrief.js` | tripplanner | logic |
| `src/lib/countryCovers.js` | tripplanner | logic |
| `src/lib/countryMatch.js` | tripplanner | logic |
| `src/lib/countryTransport.js` | tripplanner | logic |
| `src/lib/fareFile.js` | tripplanner | logic |
| `src/lib/gettingThere.js` | tripplanner | logic |
| `src/lib/groundFares.js` | tripplanner | logic |
| `src/lib/groundLinks.js` | tripplanner | logic |
| `src/lib/omio.js` | tripplanner | logic |
| `src/lib/placeName.js` | tripplanner | logic |
| `src/lib/routing.js` | tripplanner | logic |
| `src/lib/sleepGroups.js` | tripplanner | logic |
| `src/lib/transport.js` | tripplanner | logic |
| `src/lib/transportLinks.js` | tripplanner | logic |
| `src/lib/tripCostOptimizer.js` | tripplanner | logic |
| `src/lib/tripGuide.js` | tripplanner | logic |
| `src/lib/trip_planner_pricing.js` | tripplanner | logic |
| `src/lib/wizardFlights.js` | tripplanner | logic |
| `src/lib/wizardTransit.js` | tripplanner | logic |
| `src/planner/bookingImport.js` | tripplanner | logic |
| `src/planner/bookingImportLogic.js` | tripplanner | logic |
| `src/planner/discoveredStore.js` | tripplanner | logic |
| `src/planner/plannerStore.js` | tripplanner | logic |
| `src/planner/tripDraftStore.js` | tripplanner | logic |

### dayplanner (40 files)

| File | Surface | Kind |
|---|---|---|
| `src/map/DayExploreMap.jsx` | dayplanner | renders |
| `src/planner/AiDayPlanModal.jsx` | dayplanner | renders |
| `src/planner/AiPlanRoute.jsx` | dayplanner | renders |
| `src/planner/CartaChatPlanner.jsx` | dayplanner | renders |
| `src/planner/DayActivityRows.jsx` | dayplanner | renders |
| `src/planner/DayAddPanel.jsx` | dayplanner | renders |
| `src/planner/DayExploreBuilder.jsx` | dayplanner | renders |
| `src/planner/DayFilesPanel.jsx` | dayplanner | renders |
| `src/planner/DayIdeasStep.jsx` | dayplanner | renders |
| `src/planner/DayPlanPanel.jsx` | dayplanner | renders |
| `src/planner/DayPlannerTab.jsx` | dayplanner | renders |
| `src/planner/DayTripCards.jsx` | dayplanner | renders |
| `src/planner/DayTripTransport.jsx` | dayplanner | renders |
| `src/planner/DayWorkspaceChrome.jsx` | dayplanner | renders |
| `src/planner/RouteBuildingStage.jsx` | dayplanner | renders |
| `src/planner/TownPickerStep.jsx` | dayplanner | renders |
| `src/planner/dayPlanIcs.js` | dayplanner | renders (js) |
| `src/planner/dayPlanKml.js` | dayplanner | renders (js) |
| `src/planner/dayPlanPdf.js` | dayplanner | renders (js) |
| `src/styles/13-day-planner.css` | dayplanner | style |
| `src/styles/20-day-planner-flow.css` | dayplanner | style |
| `src/styles/21-chat-passes.css` | dayplanner | style |
| `src/styles/68-v6-dayplanner.css` | dayplanner | style |
| `src/lib/cityResearch.js` | dayplanner | logic |
| `src/lib/citytrips.js` | dayplanner | logic |
| `src/lib/localIntel.js` | dayplanner | logic |
| `src/lib/poiShard.js` | dayplanner | logic |
| `src/lib/scenicWalks.js` | dayplanner | logic |
| `src/lib/steps.js` | dayplanner | logic |
| `src/planner/aiCitySuggest.js` | dayplanner | logic |
| `src/planner/aiDayPlan.js` | dayplanner | logic |
| `src/planner/dayDraft.js` | dayplanner | logic |
| `src/planner/dayExploreRails.js` | dayplanner | logic |
| `src/planner/dayFileStore.js` | dayplanner | logic |
| `src/planner/dayFormat.js` | dayplanner | logic |
| `src/planner/dayPlanStore.js` | dayplanner | logic |
| `src/planner/dayPlanSync.js` | dayplanner | logic |
| `src/planner/daySchedule.js` | dayplanner | logic |
| `src/planner/edgeFailure.js` | dayplanner | logic |
| `src/planner/sheetGripKeys.js` | dayplanner | logic |

### account (103 files)

| File | Surface | Kind |
|---|---|---|
| `src/admin/AdminPage.jsx` | account | renders |
| `src/auth/AccountPanel.jsx` | account | renders |
| `src/auth/AuthContext.jsx` | account | renders |
| `src/auth/AuthGate.jsx` | account | renders |
| `src/auth/AuthModal.jsx` | account | renders |
| `src/auth/FriendBadges.jsx` | account | renders |
| `src/auth/FriendTripPanel.jsx` | account | renders |
| `src/auth/FriendsSpoke.jsx` | account | renders |
| `src/auth/GoogleButton.jsx` | account | renders |
| `src/auth/InstallHint.jsx` | account | renders |
| `src/auth/ModerationNotice.jsx` | account | renders |
| `src/auth/PastTripForm.jsx` | account | renders |
| `src/auth/ResetPasswordScreen.jsx` | account | renders |
| `src/auth/SavedTripsPanel.jsx` | account | renders |
| `src/auth/SharedTripView.jsx` | account | renders |
| `src/auth/TripMemoryView.jsx` | account | renders |
| `src/auth/TripSharePanel.jsx` | account | renders |
| `src/community/GuidesPanel.jsx` | account | renders |
| `src/community/GuidesStrip.jsx` | account | renders |
| `src/community/ReportGuide.jsx` | account | renders |
| `src/community/UploadForm.jsx` | account | renders |
| `src/components/PassModal.jsx` | account | renders |
| `src/components/admin/AdminLock.jsx` | account | renders |
| `src/components/admin/AiModelFallbacks.jsx` | account | renders |
| `src/components/admin/AiUsage.jsx` | account | renders |
| `src/components/admin/AuditLog.jsx` | account | renders |
| `src/components/admin/CacheHitRate.jsx` | account | renders |
| `src/components/admin/ConfigManager.jsx` | account | renders |
| `src/components/admin/ContentReports.jsx` | account | renders |
| `src/components/admin/ContentSection.jsx` | account | renders |
| `src/components/admin/DecisionForm.jsx` | account | renders |
| `src/components/admin/EdgeErrors.jsx` | account | renders |
| `src/components/admin/FeedbackInbox.jsx` | account | renders |
| `src/components/admin/LaunchMetrics.jsx` | account | renders |
| `src/components/admin/Margin.jsx` | account | renders |
| `src/components/admin/MfaStepUp.jsx` | account | renders |
| `src/components/admin/MissingTables.jsx` | account | renders |
| `src/components/admin/ModerationComplaints.jsx` | account | renders |
| `src/components/admin/OssThreshold.jsx` | account | renders |
| `src/components/admin/OverrideDiffViewer.jsx` | account | renders |
| `src/components/admin/Overview.jsx` | account | renders |
| `src/components/admin/ParseFailures.jsx` | account | renders |
| `src/components/admin/PaywallFunnel.jsx` | account | renders |
| `src/components/admin/PipelineHealth.jsx` | account | renders |
| `src/components/admin/PublicGuides.jsx` | account | renders |
| `src/components/admin/Sparkbars.jsx` | account | renders |
| `src/components/admin/UnpublishGuide.jsx` | account | renders |
| `src/components/admin/UserDetail.jsx` | account | renders |
| `src/components/admin/UsersList.jsx` | account | renders |
| `src/hooks/usePaywall.jsx` | account | renders |
| `src/styles/16-auth.css` | account | style |
| `src/styles/17-saved-trips.css` | account | style |
| `src/styles/22-account-admin.css` | account | style |
| `src/styles/40-upload.css` | account | style |
| `src/styles/42-feedback.css` | account | style |
| `src/styles/69-v6-account.css` | account | style |
| `src/auth/achievements.js` | account | logic |
| `src/auth/admin.js` | account | logic |
| `src/auth/coplanners.js` | account | logic |
| `src/auth/dayPlanCloud.js` | account | logic |
| `src/auth/foreignTrip.js` | account | logic |
| `src/auth/friendFacts.js` | account | logic |
| `src/auth/friends.js` | account | logic |
| `src/auth/moderation.js` | account | logic |
| `src/auth/pastTrip.js` | account | logic |
| `src/auth/pastTripMemory.js` | account | logic |
| `src/auth/profiles.js` | account | logic |
| `src/auth/tripCrew.js` | account | logic |
| `src/auth/tripPlanStorage.js` | account | logic |
| `src/auth/tripShares.js` | account | logic |
| `src/auth/tripStorage.js` | account | logic |
| `src/community/guides.js` | account | logic |
| `src/community/uploads.js` | account | logic |
| `src/components/admin/format.js` | account | logic |
| `src/components/admin/useAuditLog.js` | account | logic |
| `src/components/admin/useConfigManager.js` | account | logic |
| `src/components/admin/useContentOverrides.js` | account | logic |
| `src/components/admin/useContentReports.js` | account | logic |
| `src/components/admin/useErrText.js` | account | logic |
| `src/components/admin/useFeedbackInbox.js` | account | logic |
| `src/components/admin/useMargin.js` | account | logic |
| `src/components/admin/useMfa.js` | account | logic |
| `src/components/admin/useModerationComplaints.js` | account | logic |
| `src/components/admin/useModerationDecision.js` | account | logic |
| `src/components/admin/useOverview.js` | account | logic |
| `src/components/admin/usePublicGuides.js` | account | logic |
| `src/components/admin/useUnpublishGuide.js` | account | logic |
| `src/components/admin/useUserDetail.js` | account | logic |
| `src/components/admin/useUsersList.js` | account | logic |
| `src/hooks/useAccountSync.js` | account | logic |
| `src/hooks/useEntitlement.js` | account | logic |
| `src/hooks/useFavoriteItems.js` | account | logic |
| `src/hooks/useIsAdmin.js` | account | logic |
| `src/lib/checkout.js` | account | logic |
| `src/lib/currency.js` | account | logic |
| `src/lib/favorites.js` | account | logic |
| `src/lib/feedback.js` | account | logic |
| `src/lib/passwordStrength.js` | account | logic |
| `src/lib/paywallEvents.js` | account | logic |
| `src/lib/pricing.js` | account | logic |
| `src/lib/reportKey.js` | account | logic |
| `src/lib/shareLink.js` | account | logic |
| `src/lib/stripImageMeta.js` | account | logic |
