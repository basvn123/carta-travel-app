"""The design waves V1 to V6 (T369, owner instruction 2026-10-07): an impeccable-led
pass over every page, button and visual setting of the app.

waves_md.py imports this module: WAVES are appended after wave 16c, TASKS give each
task its model and title, body(task) builds its prompt, HOWTO is the orchestrator
section. Edit here, then regenerate:

    python Execution/_queue/waves_md.py
"""

MAIN = r"C:\Users\Gebruiker\Documents\Portfolio\Travel App"
SKILL = MAIN + r"\.claude\skills\impeccable"
SKILL_SH = "C:/Users/Gebruiker/Documents/Portfolio/Travel App/.claude/skills/impeccable"
SHOTS = r"C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots"
SHARED_DEV = "http://localhost:5199"
PREVIEW_BRANCH = "design"
PREVIEW_URL = "https://design.carta-app.pages.dev"
# The owner decides whether V6 also deploys production. False: preview only.
PRODUCTION_DEPLOY = False

# The ten surfaces. Each wave from V3 to V5 runs one session per surface. "files" is
# the starting point; docs/design-v6/OWNERSHIP.md (written by T380 in V2) is the
# authority on which session owns which file.
SURFACES = [
    ("shell", "60", "App shell, navigation and shared components",
     "every tab on the iphone, android and desktop devices (?tab=home, ?tab=map, ?tab=places, ?tab=trip, ?tab=day), the bottom nav and its "
     "plan chooser, the desktop left panel and top bar, the Lifestyle dialog from each tab, filter sheets, every modal "
     "and its scrim, toasts, the site notice (AnnouncementBar), the error and maintenance screens, the legal pages "
     "(?legal=privacy, terms, imprint), and the global settings a traveller can change anywhere: language, origin, "
     "dates, party size, Lifestyle",
     "src/App.jsx; src/components/: AppHeader, BottomNav, Button, Icons, StateBlocks, Dropdown, DateField, "
     "FilterControls, CountryPicker, OriginPicker, AnnouncementBar, MaintenanceGate, ErrorBoundary, InfoDot, Logo, "
     "Imprint, PrivacyPolicy, TermsOfService, LegalFromUrl; src/browse/: Fold, SheetShell, LifestyleButton, "
     "LifestylePanel; styles 02-base, 03-button, 10-shell, 14-filters-panels, 27-states, 31-infodot, 46-owner-calls",
     "verify_bottom_nav, verify_desktop_shell, verify_top_bar, verify_tab_switching, verify_filter_sheet, "
     "verify_lifestyle, verify_focus_trap, verify_keyboard, verify_quality_floor"),
    ("landing", "61", "Landing page and first run",
     "?tab=home (the landing page is also the home page, T209 and T194), a first visit with site storage cleared, "
     "the first priced result (the first-run receipt), and the first ninety seconds as docs/ONBOARDING_AND_EMPTY_STATES.md "
     "designs them",
     "src/browse/LandingPage.jsx, src/lib/landing.js, src/components/FirstRunReceipt.jsx, src/lib/firstRun.js, "
     "src/lib/firstRunContext.js; styles 38-first-run, 39-landing",
     "verify_receipt, verify_trip_landing, verify_prerender"),
    ("explore", "62", "Explore (the map tab)",
     "?tab=map: the control bar, the rails, the view toggle to the map, the price pins and the cheapest pin, the filter "
     "rail and sheet, a card and its preview with the compact receipt, the tier legend, the Lifestyle control opened "
     "from Explore, reach and month filters",
     "src/browse/: ExploreTab, ExploreMap, ExploreRails, ExploreFilterRail, TierLegend; src/components/: CostSummary, "
     "FareProvenance, FavStar; src/map/pinKeys.js, src/map/tokenColors.js; styles 15-map-overlays, 26-shortlist-extras",
     "verify_explore, verify_map_size_cards, verify_shortlist, verify_fare_provenance, verify_keyboard"),
    ("destinations", "63", "Destinations browse",
     "?tab=places: every category of the category rail (towns, walks, beaches, lakes, mountains, cycling, trips), the "
     "section opening screens, the one card with five fillings, search including search anywhere, the filter sheet, a "
     "country page, a region page (#region=), and the coverage empty states",
     "src/browse/: DestinationsTab, CategoryRail, PlaceCard, CardStrip, SectionOpening, PlacesFilterSheet, FilterChips, "
     "CountryPage, RegionPage, StubPage, CoverageEmpty; src/lib/cardFillings.js, src/lib/openingScreen.js; styles "
     "23-places-pages, 30-section-opening, 37-card-fillings, 44-tags, 45-empty-states",
     "verify_places_tab, verify_category_rail, verify_places_search, verify_regions, verify_country_cards, "
     "verify_paging"),
    ("destination", "64", "Destination (town) page",
     "#dest=<id> opened from a card: a large city, a small town and a town with routes (Valbona Valley has trails), "
     "every fold (around here, getting there, neighbourhoods, climate, crowds, rating, routes from here, nearby "
     "outdoors), the receipt, the hero and gallery, the honest footers, and the PDF export",
     "src/browse/: DestinationPage, AroundHere, GettingThere, Neighbourhoods, ClimateStrip, CrowdCalendar, "
     "RatingBreakdown, RoutesFromHere, NearbyOutdoors, MemberPlaces, DestMap, WebcamEmbed, HonestFooters, CreditFold; "
     "src/components/: CountryIntel, HeroImage, GemRating, RatingBadge, CrowdingBadge, MonthStrip; "
     "src/lib/destinationPdf.js; styles 18-detail-panel, 19-guide-ratings, 24-destination-workspace",
     "verify_destination_page, verify_routes_block, verify_hero_images, verify_transport_links, verify_stay_tiers"),
    ("outdoor", "65", "Outdoor detail pages (trail, cycling route and tour, beach, lake, mountain)",
     "a trail (#trail=), a cycling route (#cycle=<id>&cc=<cc>) and a cycling tour (#tour=), a beach (#beach=), a lake "
     "(#lake=) and a mountain from the Destinations mountains section, each through the shared detail skeleton: hero, "
     "map slot, signature figure, derived modules, take it with you (GPX, KML)",
     "src/browse/: DetailSkeleton, TrailPage, CyclePage, BeachPage, LakePage, MountainPage, Signature, DerivedModules, "
     "RouteFigures, RouteParts, BathingWater, PointMap; src/components/: WaterQualityBadge, LayerPhoto, KindGlyph; "
     "src/lib/detailSkeleton.js, signature.js, derivedModules.js; styles 28-detail-skeleton, 29-signature, "
     "29-derived-modules",
     "verify_trail_page, verify_beaches, verify_lakes, verify_mountains, verify_cycling, verify_route_page, "
     "verify_trail_free_gpx, verify_trails"),
    ("trips", "66", "Curated trips (the journeys library and the trip page)",
     "the Trips category in Destinations (the style cards, the trip list with its length and cost filters), and a "
     "journey page (#trip=<id>) for a hiking, a cycling, a city and a beach week, with every fold: suitability strip, "
     "the shape of the week, the day track and day detail, the booking order, the flashcards, the pack grid, the cost "
     "bar and receipt, the Lifestyle slider, the sticky section rail, the three exits",
     "src/browse/: JourneysSection, JourneyPage, TripPage, TripPractical, TripDayPhotos, DayTrack, FlashDeck, PackGrid, "
     "WeekPlan, BookingOrder, CostBar, LifestyleSlider, SectionRail, TripFilters, LengthPicker, JourneyRoute; "
     "src/components/: NotFor, PackIcons; styles 25-feature-pages, 32-day-carousel, 33-flashcards, 34-section-rail, "
     "35-lifestyle-slider, 36-cost-bar, 43-trip-length",
     "verify_journeys, verify_trip_page, verify_trips, verify_pack_grid"),
    ("tripplanner", "67", "Trip planner (the multi-city wizard and the planned trip)",
     "?tab=trip: every wizard step (origin, where with the quiz, the country picker map and the match cards, when, "
     "towns, ready trips, stays, route building), then the planned trip with its map, legs by mode, itinerary, extras, "
     "country brief and cheap tips, and the chat planner",
     "src/planner/: TripPlannerTab, GuidedTripWizard, GuidedTripWizardParts, TownPickerStep, ReadyTripsStep, "
     "RouteBuildingStage, TravelLegsSection, TripItinerary, TripExtras, CountryBrief, CountryMatchCards, "
     "CheapTipsSection, CartaChatPlanner, WhereQuiz, PlannerSection; src/map/: TripMap, CountryPickerMap, CityPickerMap; "
     "styles 11-trip-planner, 12-guided-trip, 21-chat-passes (the chat half)",
     "verify_planner_v2, verify_planner_v2_flow, verify_planner_t8, verify_where_quiz, verify_when_step, "
     "verify_ready_trips, verify_country_brief, verify_booked_route, verify_handoffs, shoot-planners.mjs"),
    ("dayplanner", "68", "Day planner",
     "?tab=day: the landing, the guided builder (start point, ideas, steps), the workspace with its map and three tabs, "
     "adding and moving an activity, the AI day plan, the expense ledger, magic import, the files panel, and the PDF, "
     "ICS and KML exports",
     "src/planner/: DayPlannerTab, DayWorkspaceChrome, DayPlanPanel, DayExploreBuilder, DayIdeasStep, DayActivityRows, "
     "DayAddPanel, DayFilesPanel, DayTripCards, DayTripTransport, AiDayPlanModal, AiPlanRoute, ExpenseLedger, "
     "MagicImportZone; src/map/DayExploreMap.jsx; src/planner/dayPlanPdf.js; styles 13-day-planner, "
     "20-day-planner-flow",
     "verify_day_landing, verify_day_workspace, verify_day_overview, verify_day_ideas, verify_day_steps, "
     "verify_day_dates, verify_day_start_point"),
    ("account", "69", "My trips, account, sharing, passes, guides and admin",
     "My trips (bottom nav; ?savedmock for a filled list), a saved trip, sharing and co-planners, a shared trip view, "
     "past trips and memories, Account (profile, friends, FAQ, language, data export), sign in and sign up, reset "
     "password, the pass modal and paywall (?paymock), community guides and the upload form, the install hint, and the "
     "admin page (consistency with the rest only; it is the owner's tool)",
     "src/auth/*.jsx, src/components/PassModal.jsx, src/community/*.jsx, src/admin/AdminPage.jsx, "
     "src/components/admin/*.jsx; styles 16-auth, 17-saved-trips, 21-chat-passes (the pass half), 22-account-admin, "
     "40-upload, 42-feedback",
     "verify_saved, verify_account_panel, verify_trip_share, verify_friends, verify_past_trip, verify_paywall, "
     "verify_guides, verify_admin_panel"),
]
SURF = {s[0]: s for s in SURFACES}
ORDER = [s[0] for s in SURFACES]

# Task numbers. V1: T370 to T379 (briefs), V2: T380 (direction), V3: T381 to T390
# (structure), V4: T391 to T400 (visual and dynamic), V5: T401 to T410 (harden and
# polish), V6: T411 then T412 (consistency, release).
BRIEF = {k: f"T{370 + i}" for i, k in enumerate(ORDER)}
BUILD = {k: f"T{381 + i}" for i, k in enumerate(ORDER)}
VISUAL = {k: f"T{391 + i}" for i, k in enumerate(ORDER)}
POLISH = {k: f"T{401 + i}" for i, k in enumerate(ORDER)}
DIRECTION, CONSIST, RELEASE = "T380", "T411", "T412"

TASKS = {}
KIND = {}
for k in ORDER:
    name = SURF[k][2]
    TASKS[BRIEF[k]] = ("opus", f"design brief: {name}")
    TASKS[BUILD[k]] = ("opus", f"structure, information and flow: {name}")
    TASKS[VISUAL[k]] = ("opus", f"visual and dynamic: {name}")
    TASKS[POLISH[k]] = ("sonnet", f"harden, adapt and polish: {name}")
    KIND[BRIEF[k]], KIND[BUILD[k]], KIND[VISUAL[k]], KIND[POLISH[k]] = (("brief", k), ("build", k),
                                                                          ("visual", k), ("polish", k))
TASKS[DIRECTION] = ("fable", "design direction v6, the new rules, motion tokens and file ownership")
TASKS[CONSIST] = ("opus", "one traveller, one trip: the consistency pass across every surface")
TASKS[RELEASE] = ("sonnet", "release: the full check, the before and after gallery, the preview deploy")
KIND[DIRECTION], KIND[CONSIST], KIND[RELEASE] = ("direction", None), ("consist", None), ("release", None)


def _row(task, branch, app, folder, notes):
    return ([task], [branch], app, folder, None, notes)


V1_NOTE = ("Docs only: no app code, no app worktree. Look at the app on the shared read-only dev server the "
           f"orchestrator started at {SHARED_DEV} (from the main checkout). If it is down, start your own from the main "
           "checkout with `npx vite --port <your Vite port> --strictPort` in continent-app (never `npm run dev`, whose "
           "predev rewrites public/), and stop it when you finish. In your report and brief write app paths as "
           "`src/...` (app repo) and never with the continent-app/ prefix: the merge gate reads that prefix as app work.")

WAVES = [
    ("V1", "Design: one brief per surface (impeccable critique, audit and shape)",
     "Wave 16c merged and T369 merged. The orchestrator starts the shared dev server first (see Design waves V1 to V6).",
     [_row(BRIEF[k], f"p10-v6-brief-{k}", False, "P10", V1_NOTE) for k in ORDER]),
    ("V2", "Design: the direction, the rules and the file ownership (one session)",
     "Wave V1 merged (all ten briefs in docs/design-v6/briefs/).",
     [_row(DIRECTION, "p11-v6-direction", True, "P11",
           "One session, alone in this wave, because every later session builds on what it writes. EXCEPTION to "
           "the CLAUDE.md scope rule, granted by the owner's instruction of 2026-10-07: you may edit the carta-design "
           "skill (.claude/skills/carta-design/SKILL.md), DESIGN.md, src/styles.css (append imports only) and "
           "src/styles/01-tokens.css, in one commit per repo where CLAUDE.md asks for it. The root worktree is "
           "sparse and leaves .claude/ out: run `git sparse-checkout add .claude` in it before you edit the skill.")]),
    ("V3", "Design: structure, information and flow, every surface",
     "Wave V2 merged (docs/design-v6/DIRECTION.md and OWNERSHIP.md exist, the v6 stylesheets are imported).",
     [_row(BUILD[k], f"p10-v6-build-{k}", True, "P10",
           f"You own the files docs/design-v6/OWNERSHIP.md gives to '{k}', and src/styles/{SURF[k][1]}-v6-{k}.css. "
           "Nothing else.") for k in ORDER]),
    ("V4", "Design: visual and dynamic, every surface",
     "Wave V3 merged, and the orchestrator deployed the V3 preview.",
     [_row(VISUAL[k], f"p10-v6-visual-{k}", True, "P10",
           f"You own the files docs/design-v6/OWNERSHIP.md gives to '{k}', and src/styles/{SURF[k][1]}-v6-{k}.css. "
           "Nothing else.") for k in ORDER]),
    ("V5", "Design: harden, adapt and polish, every surface",
     "Wave V4 merged, and the orchestrator deployed the V4 preview.",
     [_row(POLISH[k], f"p10-v6-polish-{k}", True, "P10",
           f"You own the files docs/design-v6/OWNERSHIP.md gives to '{k}', and src/styles/{SURF[k][1]}-v6-{k}.css, "
           f"and the harness scripts listed for '{k}'. Nothing else.") for k in ORDER]),
    ("V6", "Design: the consistency pass, then the release",
     "Wave V5 merged, and the orchestrator deployed the V5 preview.",
     [([CONSIST, RELEASE], ["p10-v6-consistency", "p10-v6-release"], True, "P10", None,
       f"Two tasks in one row: {CONSIST} first, then {RELEASE} in the same worktrees. {CONSIST} may edit any file "
       f"OWNERSHIP.md lists, for consistency fixes only (no new features). EXCEPTION to session rule 7, for "
       f"{RELEASE} only and only these commands: `npm run build:pages` and "
       f"`npx wrangler pages deploy dist --project-name carta-app --branch {PREVIEW_BRANCH} --commit-dirty=true`. "
       + ("Production deploy: YES, see the task text." if PRODUCTION_DEPLOY else
          "Production deploy: NO. Never `--branch main`; production stays the owner's step."))]),
]


COMMON = rf"""DESIGN WAVE RULES (V1 to V6, T369; these sit on top of the session rules)

The owner's brief, 2026-10-07, in their words: keep the same colour scheme and styling, but make Carta more
modern, more visual, more professional and above all more dynamic. The first priority is how travellers
actually plan a trip: which information they want and in what order, so that one traveller planning one
holiday finds everything in the right place and also enjoys how it looks. Every page, every button and
every visual setting is in scope across the six waves.

Read before anything else: PRODUCT.md, DESIGN.md, the carta-design skill
({MAIN}\.claude\skills\carta-design\SKILL.md), docs/design-v6/TRIP-PLANNING-RESEARCH.md, and from V2 on
docs/design-v6/DIRECTION.md, docs/design-v6/OWNERSHIP.md and your surface brief in docs/design-v6/briefs/.

Impeccable is the method. Read {SKILL}\SKILL.md and the reference files each step names (read the files
directly: a newer personal copy may also be installed; these waves use the project copy). Run its setup
once, with your ROOT worktree as the working directory so it finds PRODUCT.md and DESIGN.md:
  sh "{SKILL_SH}/scripts/impeccable" context --target <the main file of your surface>
(use impeccable.cmd from PowerShell; the engine binary is cached in %USERPROFILE%\.impeccable\bin). Its
working folder .impeccable/ is gitignored; copy anything worth keeping into your brief or report.

This run is unattended, and the owner has told every session in it to proceed without asking (owner
instruction 2026-10-07). This is the "user tells you to proceed" case of impeccable's AUTONOMY_DIRECTIVE_CHECK.
Never open impeccable's decision page (serve-question), its live mode or any question tool, and never wait
for an approval. This is refinement, not redesign: impeccable's "Refinement preserves" applies, never a
new-work direction roll. Where impeccable would ask, take the option that keeps Carta's palette, type and
identity, and write the choice and the reason in your report.

Precedence: carta-design and DESIGN.md win over impeccable, over the research and over taste. Locked: the
palette and its token jobs, the three typefaces and their roles, one saturated accent, no gradients, the
three shadows, mono only for measured facts, honest labelled numbers, sentence case, no em dashes, no
banned words. Impeccable's craft floor and its detector come on top. A pattern carta-design does not cover
needs a written rule in DIRECTION.md first. If a change you want has no rule, do not build it; write it
as a register row for the next wave.

Plan first, in planning mode. Before you edit any file, run the planning step this task names and commit
the plan. If your harness offers plan mode, use it for this step. This run is unattended, so do not wait
for the plan to be approved: commit it, then carry it out.

Phone first (T414). Most travellers dream and choose on a phone and use the planners on the go
(TRIP-PLANNING-RESEARCH.md, section 5), so the phone is never the afterthought of a desktop layout. Look at
the real screens with Playwright (in node_modules; Chromium and WebKit are installed in the Playwright cache,
so never run `npx playwright install`) from a scratch script outside the repos, on these devices, always
with the device descriptor so touch, the device pixel ratio and the mobile viewport are on:
  iphone    WebKit, devices['iPhone 13'] (390x844): the Safari engine
  android   Chromium, devices['Pixel 5'] (393x851), and once per view at 360x740 with isMobile and
            hasTouch on: the small Android floor
  desktop   Chromium, 1280x800, mouse
On the phones also check, and write in the report what you found: landscape (844x390); tap only, so
nothing depends on hover; the on-screen keyboard (focus each input and shrink the viewport height by
40 percent: the field and its submit stay visible and the bottom nav does not ride up over them); the
safe areas under the notch and the home bar (env(safe-area-inset-*)); full-height layouts on 100dvh, not
100vh, so a collapsing address bar never hides a bar or a button; the main action within thumb reach on a
tall phone; tap targets of at least --tap; and a swipe is never the only way to do something. WebKit on
Windows is close to iOS Safari, not the same: what only a real phone can prove (haptics, the install
prompt, the real keyboard, scroll momentum) goes into one owner row per session, listed.
Save the screenshots that show the change as JPEG, quality 80, viewport only (not full page), at most
ten per session, to {SHOTS}\<surface>\<wave>-<view>-<iphone|android|desktop>.jpg. That folder is
outside both repos on purpose: never commit a screenshot. V1 saves the "before" set; every build wave
saves its "after" set with the same view names so the release can pair them.

Everything else still holds: the session rules, CLAUDE.md, six i18n catalogues for every new string
(write de, es, fr, it and nl yourself and raise one owner row for native review), the design lint
(`node scripts/ci/design-lint.mjs` in the app worktree, 0 new violations), `npm run lint` 0 errors,
`npm test`, `npm run build` then delete dist/ and dist-data/. Keep what earlier waves built working: the
receipt, InfoDot and glossary, day track, flashcards, sticky rail, Lifestyle control, cost bar,
suitability strip, empty states, touch feedback, shared element transitions, keyboard map access
(scripts/verify_keyboard.mjs 20 of 20) and the quality floor (scripts/verify_quality_floor.mjs).

Before you finish a build wave: run `sh "{SKILL_SH}/scripts/impeccable" detect --json <every file you
changed>` once and fix what it finds; answer carta-design's seven questions in the report; run your
surface's harnesses. A harness assertion that encodes the old design may be updated, with a comment
saying why, never deleted."""


# How each surface is used on a phone (T414). Every surface is designed phone first;
# this says what the phone moment is, so the brief and the build plan start there.
PHONE = {
    "shell": "the bottom nav, sheets and dialogs are what a phone traveller touches most; one thumb, one hand, "
             "often outdoors",
    "landing": "the first visit usually comes from a shared link or a search on a phone; the first screen must "
               "answer what Carta is and what a day costs without a scroll",
    "explore": "browsing for ideas on the sofa or the commute; the rails, the map toggle and the card preview "
               "must work one-handed, and the map must never trap the scroll",
    "destinations": "scanning many places quickly on a phone; dense cards, a filter sheet within thumb reach",
    "destination": "deciding on one town, often on a phone; the receipt and the folds must read without "
                   "pinching or sideways scrolling",
    "outdoor": "read at home and opened again at the trailhead, on a phone, outdoors, with one bar of signal; "
               "the key facts and the GPX within the first screen",
    "trips": "a week read on a phone over several evenings; the day track, flashcards and sticky rail are "
             "phone patterns first",
    "tripplanner": "started on a phone as often as on a laptop; every wizard step fits one phone screen with "
                   "its action in thumb reach, and the on-screen keyboard never hides the field",
    "dayplanner": "used during the trip, on a phone, standing in the street; the day must read and edit "
                  "one-handed in sun and with poor signal",
    "account": "My trips is where a phone traveller comes back to a saved trip; sharing goes through the "
               "phone's share sheet; the admin page alone may be desktop first",
}


def _surface_head(k):
    key, css, name, opens, files, harness = SURF[k]
    return (f"SURFACE  {name} (key '{key}')\n"
            f"Where to look: {opens}.\n"
            f"On a phone: {PHONE[key]}.\n"
            f"Main files (OWNERSHIP.md is the authority from V2 on): {files}.\n"
            f"Harnesses (continent-app/scripts/): {harness}.\n"
            f"Your v6 stylesheet from V3 on: src/styles/{css}-v6-{key}.css (created and imported by T380).")


def _report(task, folder, slug):
    return (f"REPORT  Execution/{folder}/{task}-{slug}.md, following Execution/_TEMPLATE.md. Plain prose, short "
            "sentences, before and after figures where a number moved (screens touched, controls removed or "
            "added, detector findings, harness results), a rollback procedure, and what is still open, each "
            "open item also as a register row.")


def _brief(task, k):
    key, css, name = SURF[k][:3]
    extra = ""
    if k == "shell":
        extra = ("\n\nThis brief also carries the cross-surface layer, because you are the only V1 session that sees "
                 "the whole app: the navigation model (how a traveller moves between dreaming, choosing, budgeting, "
                 "planning and keeping a trip, and where that breaks today); every global setting and where each is "
                 "set and shown; an inventory of every shared component and how consistently it is used; and the "
                 "motion, imagery and data visualisation the app has today, surface by surface, as the input for "
                 "the V2 direction.")
    return f"""# {task}: design brief: {name}
(design wave V1, T369; no mind-map prompt exists for it)

{COMMON}

{_surface_head(k)}

WHAT  Plan, do not build. Write docs/design-v6/briefs/{key}.md: the brief that V3, V4 and V5 build this
surface from. No app code changes in this task.{extra}

STEPS
1. Setup: impeccable context (above), then read reference/critique.md, reference/audit.md,
   reference/shape.md and reference/operate.md. Pick the surface's mode (Persuade, Operate, Read or
   Experience) and say why.
2. Walk the surface as the traveller in TRIP-PLANNING-RESEARCH.md would, on the iphone, android
   and desktop devices (phone first), from a cold start and from a returning visit. Save the "before"
   screenshots to {SHOTS}\{key}\V1-<view>-<device>.jpg.
3. Inventory. One table row per view, state, button, link, chip, toggle, input, sheet, modal, empty,
   loading and error state, and visual setting on this surface: what it does, where it sits, which file
   draws it, and a verdict (keep, move, merge, remove, rework). Every button is in this table.
4. Critique, following reference/critique.md: heuristic scores, the priority issues, with evidence from
   the screenshots. Then a short technical audit following reference/audit.md (accessibility, responsive,
   performance), using the existing harnesses rather than new tooling, plus the phone checks of the
   design wave rules (landscape, keyboard, safe areas, dvh, thumb reach) with what fails on which device.
5. The traveller's job here: what they need to see first, second and third, what is missing, what sits
   in the wrong place, and what sends them to another tab or another site. Cite the research.
6. PLANNING STEP (planning mode): impeccable shape, following reference/shape.md. Write the plan as three
   numbered lists, one per build wave: V3 structure, information and flow; V4 visual and dynamic (motion,
   imagery, data visualisation, micro-interactions, all within the palette); V5 harden, adapt and polish.
   Write each item for the phone first and say what changes on desktop.
   Each item: the change, the files, the impeccable command that guides it, and how to check it is done.
   End with a target-state table of every button and control on the surface.
7. "Needs a rule": every proposal carta-design does not cover today, one line each, with the rule you
   propose. T380 (V2) accepts or rejects each one before anything is built.

DONE WHEN  docs/design-v6/briefs/{key}.md exists with all seven parts, the before screenshots are saved,
and the brief names every file the build waves will touch.

{_report(task, "P10", f"v6-brief-{key}")}"""


def _direction():
    briefs = ", ".join(f"docs/design-v6/briefs/{k}.md" for k in ORDER)
    v6files = ", ".join(f"src/styles/{SURF[k][1]}-v6-{k}.css" for k in ORDER)
    return f"""# {DIRECTION}: design direction v6, the new rules, motion tokens and file ownership
(design wave V2, T369; no mind-map prompt exists for it)

{COMMON}

WHAT  Turn ten briefs into one direction the build waves can follow without asking anyone. You are the
design director for this pass. The owner delegated the design calls in it to this session on 2026-10-07,
within the locked palette and type; record each call so the owner can overrule it later.

READ  All ten briefs: {briefs}. Impeccable's reference/new-work.md (only for its thinking on a direction
contract; this is still refinement), reference/animate.md, reference/visualize.md, reference/layout.md,
reference/typeset.md, reference/delight.md and reference/craft-floor.md. The existing motion helpers:
src/lib/motion.js, src/lib/sharedElement.js and src/lib/touchFeedback.js.

PLANNING STEP (planning mode)  Before editing, write and commit docs/design-v6/DIRECTION.md as a plan.
Then make the changes it lists.

DELIVER
1. docs/design-v6/DIRECTION.md. The thesis: what "more modern, more visual, more professional, more
   dynamic" means for Carta when the palette and type stay as they are. Then one section each for:
   - motion: duration and easing tokens, what moves (figures that update in place without jitter, list
     to detail, sheets and panels, map camera, reordering, press states) and what never moves, with the
     reduced-motion branch for each;
   - imagery: real licensed photographs and map tiles only, crops, ratios, credits;
   - data visualisation: one visual family for month strips, bars, profiles, the cost bar and the receipt;
   - layout rhythm, the type scale (Fraunces display sizes), elevation (the three shadows), iconography;
   - density per mode: Operate for the planners and Explore, Read for trip and detail pages, Persuade for
     the landing page;
   - the phone (T414): phone first everywhere; the breakpoints and what each adds; safe-area and dvh
     rules for every fixed or sticky bar; the thumb zone and where the one primary action sits on a
     phone; sheets versus pages; gestures as shortcuts only; landscape; the on-screen keyboard; and what
     desktop adds beyond a wider phone (side by side map and list, hover detail, keyboard shortcuts);
   - the planning journey across surfaces: how a traveller moves from dreaming to a kept trip, and which
     surface owns each step.
2. Every "Needs a rule" item from the ten briefs, accepted or rejected with a reason, in a table. Accepted
   rules go into the carta-design skill (Components or Interaction) and into DESIGN.md in the same commit.
   You may relax carta-design's motion rule (today: under 300 ms, transform and opacity only) where the
   direction needs it, as long as every motion keeps a reduced-motion branch. The palette, the three
   faces, the no-gradient rule and the never list stay as they are.
3. Motion tokens in src/styles/01-tokens.css (for example --dur-1 to --dur-4 and --ease-out, --ease-in-out),
   recorded in DESIGN.md in the same commit (CLAUDE.md). Shared motion primitives in src/lib/ only where
   two or more briefs need the same one (for example an in-place number transition for tabular figures).
4. The ten v6 stylesheets, each a header comment and nothing else: {v6files}. Append their ten @import
   lines at the end of src/styles.css, in that order, after 46-owner-calls.css. They load last, so a build
   session can override an older rule from its own file without editing a file it does not own.
5. docs/design-v6/OWNERSHIP.md: every file in src/ that renders something (jsx, and js that builds
   markup or a PDF), and every file in src/styles/, assigned to exactly one of the ten surfaces
   ({", ".join(ORDER)}). Shared components and App.jsx go to 'shell'. The six i18n catalogues are shared:
   each surface adds keys only under its own prefixes, listed here. Check the assignment with a script so
   no file is missing or doubled, and print the counts in the report.
6. At the end of each brief, a short "Direction check" section: what the direction changes in that brief's
   plan. Do not rewrite the briefs.

DONE WHEN  DIRECTION.md and OWNERSHIP.md exist, the rule table is complete, the carta-design skill and
DESIGN.md agree with src/styles/01-tokens.css, the ten v6 stylesheets are imported, and build, lint, test
and the design lint pass.

{_report(DIRECTION, "P11", "v6-direction")}"""


def _build(task, k, wave):
    key, css, name = SURF[k][:3]
    if wave == "V3":
        title, plan_cmd = "structure, information and flow", "shape"
        refs = "reference/shape.md, reference/layout.md, reference/distill.md, reference/clarify.md, reference/onboard.md"
        aim = ("Carry out the V3 list of your brief: put what the traveller needs in the order they need it, make "
               "the main path obvious and the next step always visible, cut what does not earn its place, merge "
               "duplicate controls, and make every global setting visible where it changes a figure. The "
               "inventory table in the brief is the checklist: every button ends in its target state.")
    elif wave == "V4":
        title, plan_cmd = "visual and dynamic", "critique (of the V3 result)"
        refs = ("reference/animate.md, reference/visualize.md, reference/delight.md, reference/typeset.md, "
                "reference/bolder.md (within the palette)")
        aim = ("Carry out the V4 list of your brief under DIRECTION.md: motion from the shared tokens and "
               "primitives, figures that update in place, list-to-detail and sheet transitions, photographs and "
               "map tiles used with intent, data drawn in the one visual family, and press, hover and selected "
               "states that answer at once. Dynamic means the page answers the traveller's input; it never "
               "means decoration that moves on its own.")
    else:
        title, plan_cmd = "harden, adapt and polish", "audit and critique (of the V4 result)"
        refs = ("reference/harden.md, reference/adapt.md, reference/audit.md, reference/optimize.md, "
                "reference/polish.md, reference/clarify.md")
        aim = ("Carry out the V5 list of your brief, then a final pass: long names and empty data, all six "
               "languages, every phone check of the design wave rules on the iphone and android devices, 360 to 1440 px, touch and mouse, keyboard and screen reader labels, no layout shift "
               "from motion, INP and LCP no worse than before (scripts/perf/baseline_vitals.mjs where it covers "
               "your surface), and every string in Carta's voice. Update your surface's harnesses where the "
               "design changed, with a comment per changed assertion.")
    return f"""# {task}: {title}: {name}
(design wave {wave}, T369; no mind-map prompt exists for it)

{COMMON}

{_surface_head(k)}

WHAT  {aim}

READ  docs/design-v6/briefs/{key}.md (its "Direction check" too), docs/design-v6/DIRECTION.md,
docs/design-v6/OWNERSHIP.md, the reports of the earlier V waves for '{key}', and impeccable's {refs}.

PLANNING STEP (planning mode)  Run impeccable {plan_cmd} on the surface as it is now (after the merge of
the previous wave), then write the plan for this wave as docs/design-v6/plans/{wave}-{key}.md: the
changes in order, the files, the checks. Commit it in the root worktree before the first app edit.

RULES FOR THIS WAVE  Edit only files OWNERSHIP.md gives to '{key}', plus src/styles/{css}-v6-{key}.css.
New rules go in the v6 file; change an older rule in place only when that file is yours. A change that
needs another surface's file is a register row for the V6 consistency pass, not an edit. Keep every
figure, label and provenance marker true to the data.

DONE WHEN  Every item of the plan is done or written up as open with a reason; the after screenshots
are saved; build, lint, test, the design lint, the detector and your harnesses pass; carta-design's seven
questions are answered in the report.

{_report(task, "P10", f"v6-{wave.lower()}-{key}")}"""


def _consist():
    return f"""# {CONSIST}: one traveller, one trip: the consistency pass across every surface
(design wave V6, T369; no mind-map prompt exists for it)

{COMMON}

WHAT  Plan one holiday the way the research says people do, end to end, on the merged result of V5, at
phone first (the iphone device in WebKit, then the android device, then desktop): land on the home page, browse in Explore and Destinations, open a town, a trail and a
curated trip, price it with the Lifestyle control, build it in the trip planner, plan two days in the day
planner, save it, share it, come back to it from My trips. Then fix what breaks the feeling of one product.

PLANNING STEP (planning mode)  Run impeccable critique over the whole journey and write
docs/design-v6/plans/V6-consistency.md: every inconsistency (spacing, type sizes, motion timing, button
styles, icon sizes, wording of the same thing, how a figure is shown on two screens, empty and loading
states), and every register row the V3 to V5 sessions left for this pass. Commit it, then fix them.

RULES  Consistency fixes only: no new features, no new rules. You may edit any file OWNERSHIP.md lists.
Prefer fixing a shared component or a token over patching each surface. Run every harness named in the
ten surfaces, scripts/verify_keyboard.mjs and scripts/verify_quality_floor.mjs, and say which fail and why.

DONE WHEN  The journey plays through without a broken step on all three devices, the inconsistency list is
closed or carried as rows, and build, lint, test, the design lint and the detector pass.

{_report(CONSIST, "P10", "v6-consistency")}"""


def _release():
    prod = (f"""
PRODUCTION  The owner said yes for this run. Only after the preview checks pass, run
`npx wrangler pages deploy dist --project-name carta-app --branch main --commit-dirty=true` and repeat the
checks on https://www.carta-europetravel.com. If any preview check fails, do not deploy production.""" if PRODUCTION_DEPLOY else
            """
PRODUCTION  Not in this run. Never `--branch main`. Raise one owner row: promote the design preview to
production with the runbook's block C steps (C2 to C5 in Execution/_OWNER-RUNBOOK.md).""")
    return f"""# {RELEASE}: release: the full check, the before and after gallery, the preview deploy
(design wave V6, after {CONSIST} in the same worktrees, T369; no mind-map prompt exists for it)

{COMMON}

WHAT  Prove the result, show it, and put it where the owner can open it in the morning.

PLANNING STEP (planning mode)  Write docs/design-v6/plans/V6-release.md with the check list below and the
order you will run it in. Commit it.

STEPS
1. In the app worktree: `npm run lint`, `npm test`, `node scripts/ci/design-lint.mjs`,
   `node scripts/ci/banned-terms.mjs`, the six i18n catalogues parse, `npm run build`, then
   scripts/verify_keyboard.mjs and scripts/verify_quality_floor.mjs against a vite preview of that build, and
   every surface harness. Record pass or fail per script. Delete dist/ and dist-data/ afterwards.
2. The gallery: {SHOTS}\index.html, a plain page that pairs each V1 "before" screenshot with the latest
   "after" of the same view and device, phones first, surface by surface, with one line under each pair saying what changed.
   It lives outside the repos. Write docs/design-v6/MORNING.md in the root worktree: what changed per
   surface in five lines or fewer, the check results, what is still open, the preview URL and the gallery
   path.
3. The preview deploy, from the app worktree: `npm run build:pages`, then
   `npx wrangler pages deploy dist --project-name carta-app --branch {PREVIEW_BRANCH} --commit-dirty=true`.
   Open {PREVIEW_URL} on the iphone, android and desktop devices with the console open: Explore, a destination, a trail, a journey,
   the trip planner, the day planner, My trips. If the preview needs data the data host does not have yet
   (an R2 push is the owner's step C3), say exactly which file fails in the report and an owner row; never
   run push-data. Delete dist/ and dist-data/ afterwards.
{prod}

DONE WHEN  The checks are recorded, the gallery and MORNING.md exist, and {PREVIEW_URL} serves the build or
the report says exactly why not.

{_report(RELEASE, "P10", "v6-release")}"""


def body(task):
    kind, k = KIND[task]
    if kind == "brief":
        return _brief(task, k)
    if kind == "direction":
        return _direction()
    if kind == "build":
        return _build(task, k, "V3")
    if kind == "visual":
        return _build(task, k, "V4")
    if kind == "polish":
        return _build(task, k, "V5")
    if kind == "consist":
        return _consist()
    return _release()


HOWTO = rf"""## Design waves V1 to V6 (T369, owner instruction 2026-10-07)

An impeccable-led pass over every page, button and visual setting: keep the colour scheme and styling, make
Carta more modern, visual, professional and dynamic, and put what a traveller needs where they need it. The
skill is in .claude/skills/impeccable (v4.3.1, from riga-hackathon); docs/design-v6/ holds the research,
the briefs, the direction, the ownership map and the plans. The waves run in order, V1 to V6, and they are
built to run overnight without the owner:

- Run them back to back. Do not wait for the owner between waves, and do not ask before merging (owner
  instruction 2026-10-07). A session that fails its gate is held and logged, and the next wave still runs.
  A held V1 brief means that surface sits out V3 to V5; say so in the log.
- Before V1: start one shared read-only dev server for the ten brief sessions, from the main checkout,
  `cd continent-app; npx vite --port 5199 --strictPort` in the background (the generated public data is
  already there; never `npm run dev`, whose predev rewrites public/). Stop it when V1 is merged.
- V1 sessions have no app worktree (docs only); run wave_gate.ps1 for them without -App.
- After merging V3, V4 and V5, deploy a preview from the main checkout so the morning always has the newest
  merged state: `cd continent-app; npm run build:pages; npx wrangler pages deploy dist --project-name carta-app
  --branch {PREVIEW_BRANCH} --commit-dirty=true`, then delete dist/ and dist-data/. Preview only: never
  `--branch main` (production is {"part of V6, by owner decision" if PRODUCTION_DEPLOY else "the owner's step"}).
  The preview lives at {PREVIEW_URL}.
- Screenshots go to {SHOTS} (outside both repos), never into git.
- Kickoff, pasted into a Fable session in the main checkout: "Carta. You are the orchestrator for the design
  waves. Read Execution/_WAVES.md (the orchestrator steps, the session rules and 'Design waves V1 to V6') and
  run waves V1, V2, V3, V4, V5 and V6 in order, without waiting for me between waves. Hold and log any session
  that fails its gate and carry on. Never push."
"""
