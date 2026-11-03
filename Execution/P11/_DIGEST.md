# P11 digest

152 task reports folded on 2026-11-03 (T1034). Each entry keeps what changed and what broke; the full report, commands, files and rollback are in git under the tag `archive/execution-full-2026-11-03` (command under each entry). Open items live in `Execution/_OPEN.md`. Owner procedures kept beside this file: _OPEN-pass-subscription.md.

### T195: Write PRODUCT.md and DESIGN.md as the durable context (2026-10-01)

The repo root now carries two files that every session is told to read before touching anything a traveller sees. PRODUCT.md states the audience (people counting money, budget travellers inside Europe), the operational context (reading many prices at once and finding the cheapest honest option for fixed inputs), the provenance rule the numbers follow, the brand voice as it already exists in the carta-design skill, and the accessibility constraints the shipped app actually enforces (44 px tap floor, AA contrast with the ratios written next to the tokens, visible focus, focus traps on modals, reduced motion, six languages, single light theme).

Broke: Heredoc write of PRODUCT.md failed with "unexpected EOF while looking for matching quote" / The Bash tool mangles backticks inside a quoted heredoc (same family as the known backslash trap) / Wrote the three markdown files with the Write tool and used python for the register append; DESIGN.md first said primary buttons use `--paper` text on the acc...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T195-product-and-design-context.md"`

### T196: Put a generic-pattern detector in CI (2026-10-02)

There is now a design lint that runs in CI and fails when a change adds one of the generic patterns carta-design and DESIGN.md ban. It is continent-app/scripts/ci/design-lint.mjs, run by a new workflow, .github/workflows/design-lint.yml, modelled on trip-validator.yml. It is not part of npm run ci, and no existing workflow or package.json script was touched.

Broke: The outline rule first missed a one-line block such as .btn:focus { outline: none; }, because block text was only collected from the line after the opening brace. The scan now accumulates characters after the brace on the same line.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T196-design-lint-in-ci.md"`

### T197: Curate components by role, not by library (2026-10-02)

Carta now has a written rule for taking components from outside UI libraries, in `docs/COMPONENT_ROLES.md`. No component was adopted and no app file changed; the session note made this a document task, and the stack makes that the honest outcome rather than a shortcut. The research document's model is copy-paste ownership: components land as source files you own, with no dependency tree. That holds for the code but not for its assumptions. Every library it names (shadcn/ui, Origin UI, which is now coss ui, Magic UI, Motion Primitives and Aceternity UI) is written for Tailwind, and most also pull in Radix or Base UI primitives and the `motion` package.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T197-component-curation.md"`

### T198: Decide the typography conflict, explicitly (2026-10-02)

Carta's type is now a written decision rather than three documents that disagree. DESIGN.md carries one paragraph under Type: Fraunces for display, Plus Jakarta Sans for everything else, JetBrains Mono for measured facts, always through the tokens `--display`, `--ui` and `--mono` and never by name. Cormorant Garamond (the research note), Instrument Sans and IBM Plex Mono (the carta-design skill body) are rejected by name. The design lint enforces it with a ninth rule, `font-literal`. The three sources and what each said.

Broke: The seeded `:root { --font-display: ... }` did not fire / The token check was anchored to the start of the line, and the one-line fixture puts the property after the brace / The match now starts at line start, `{` or `;`; styles.css line 4022 `font-family: var(--mono) !important` was flagged / The value test did not allow the suffix / `!important`...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T198-typography-decision.md"`

### T199: Self-host fonts and take the React 19 / Tailwind v4 wins (2026-10-03)

Carta no longer asks Google for anything. The three families the tokens name, Fraunces for `--display`, Plus Jakarta Sans for `--ui` and JetBrains Mono for `--mono`, are now served from `continent-app/public/fonts` as variable woff2 files, latin and latin-ext only (six files, 218,820 bytes together). The `@font-face` rules sit inline in `continent-app/index.html`, so there is no stylesheet request, and the latin files of Plus Jakarta Sans and Fraunces are preloaded because every first paint uses them. The Google stylesheet link, the two preconnects, the unused Instrument Sans, IBM Plex Mono and Inter Tight families and the old comment that described a palette swap are gone.

Broke: The first slider probe found no slider / It looked for `.dual-range-input`, which no live screen renders; the only range input on screen is `.trip-slider-input`, behind Trips and the composed door / Probe rewritten to open that door first; Font counts in the interaction runs were inflated (13 to 17) / The counter also matched map glyph files under...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T199-fonts-and-runtime-performance.md"`

### T200 Measure Core Web Vitals on the three heaviest pages (2026-10-03)

Nothing in the product changed. This task measured LCP, INP and CLS on the price map, a destination page and a trip page, on desktop and on a simulated mobile phone, against the live site at https://www.carta-europetravel.com. It is the first measurement of the real deployment. T011 and T055 both measured a build served from loopback, which has no round trip and no real data host, so those numbers were a floor. These are not. The done condition, all three pages passing Core Web Vitals on mobile, is not met. Every page fails at least one metric on the phone profile. The failures are listed below and each has a register row. One qualification matters more than the rest.

Broke: First live fares run reported every own-host request as unclassified / The scratch copy classed only loopback as the app's own host / Classed `www.carta-europetravel.com` as self in the scratch copy; Static pass reported 19 unclassified call sites / The scratch copy compared forward slash paths with Windows separators / Resolved the roots with `pat...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T200-core-web-vitals.md"`

### T277: PRODUCT.md and ESTIMATION.md catch up with the owner decisions (2026-10-02)

PRODUCT.md no longer says the fare-snapshot surfaces "are being removed". T273 removed them, so "The one rule the numbers follow" now says no screen shows or sums a Carta flight figure, and the tilde and "est." stay for every other estimate. "What Carta is" now opens with the T201 positioning: the one sentence and a short paragraph. The paragraph is the T201 paragraph minus its flight claims, because the owner decided Carta does not price flights. "Who it is for" now opens with the audience order: hikers lead (confirmed in T275), then beach families, cyclists, city-break travellers, car-free travellers and trail runners.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T277-product-md-decisions.md"`

### T285 the docs catch up (2026-10-02)

Seven documentation rows are closed or part closed. Docs only, root repo only. The literal destination count (1,570, stale against the 3,868 in T201's report) is gone from 1.CARTA.md, docs/1.CARTA.md and README.md and replaced by a pointer to `meta.n_destinations` in app_data.json. PRODUCT.md's "The one rule the numbers follow" now words the harvested, cached, estimate chain for ground costs only. docs/REGIONS.md describes the per-region `code` field and the `contract` block of coverage.json (read from pipeline/regions/coverage.py, build_contract and write_wire). The trips dataset README carries the T084 validator figures.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T285-docs-catch-up.md"`

### Execution Report (2026-10-03)

The carta-design skill body now teaches the decided state instead of the reverted cool-grey Timetable palette. Colour, type, layout, components, interaction, copy, the never list, the quality floor and the seven ship questions were rewritten from DESIGN.md as it stands on main (d39d55a0b) and from the T198 typography decision. The skill now says: warm alabaster paper, slate ink, one terracotta accent; Fraunces for display only, Plus Jakarta Sans for everything else, JetBrains Mono for measured facts; ochre for ratings, teal for gems, danger red for destruction only; three ink shadows and no gradients; focus ring in `--accent`.

Broke: The skill path in the prompt was wrong (see above); handled by working on the tracked copy. A first assembly script failed on shell quoting before running; nothing was written by it.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T325-carta-design-skill-body.md"`

### T335: one shared Button, after the tokens (2026-10-03)

Carta now has one shared button, `continent-app/src/components/Button.jsx`, styled by `src/styles/03-button.css`. It has four variants (primary, secondary, ghost, danger) and two sizes (md, sm). It defaults to `type="button"`, passes every other prop through, and is a `forwardRef` component because React 18 does not forward `ref` as a prop. It was read from shadcn/ui's Button, as T197's contract says, not installed. From shadcn I took the idea of one component with named variants and sizes and the native button semantics. I left behind Tailwind, class-variance-authority, Radix Slot, the zinc palette, ring focus and every `dark:` class. No dependency was added.

Broke: First Playwright load timed out / Vite was optimising dependencies on the first request / Reloaded with domcontentloaded and a longer timeout; Edited style files showed whole-file diffs / A Python read converted CRLF to LF / Normalised the touched files back to CRLF; the diff is now only the intended lines

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T335-shared-button.md"`

### Execution Report: T360 (2026-10-03)

On 2026-10-03 the owner told the orchestrator to settle five open owner rows. The orchestrator decided them as below. The owner can overrule any of them; each is a small, separate change. 1. T161-a accepted as T161 proposed it. The rule is now written into DESIGN.md (new Components section) and into the carta-design skill, in the same commit. T161-b is built: the journey page shows a solid --paper strip flush under the hero with exactly three cells (difficulty as five squares plus the level word, style as one or two words from tags, total cost in mono). Placeholder words ("Unrated", "Mixed", "Price on request") keep three cells on every trip. No new token was needed. 2.

Broke: French string broke the file / An apostrophe in a single-quoted string / Reworded to "Le voyage en bref"; Large whole-file diffs after edits / Windows text mode and sed rewrote line endings against the index's endings / Restored each file to its index endings; the commit shows 138 insertions and 19 deletions; First count showed 0 on the journey pag...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T360-owner-design-calls.md"`

### Execution Report: T362 (2026-10-07)

On 2026-10-07 the owner answered every decision in block A of the owner runbook, in one sitting guided by this session: 81 answered table rows over the design rules, the product gates, the admin and moderation questions and four permissions. All but four accepted the written recommendation. The differences: no trail cap in any country ("broaden the coverage, we have space", T125), a mountain target of about 5,000 (T122), every one of the 3,868 cost pages indexed with no floor (T224-b), and the pack icon review left for later (T168-b). The owner also chose to skip the token roll and the rclone key swap (B1, B2). This task turned those answers into the state the waves read.

Broke: A plain regeneration of `_WAVES.md` would drop the wave log / `waves_md.py` writes a placeholder log; the real log is appended by hand after each wave / Regenerate to a temporary file and keep the existing log section; The first patch of `waves_md.py` did not apply / A heredoc in the shell broke on the apostrophes in the notes / Wrote the patch as...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T362-owner-decisions-applied.md"`

### T380: design direction v6, the new rules, motion tokens and file ownership (2026-10-08)

The ten V1 briefs are now one direction the build waves can follow without asking anyone. `docs/design-v6/DIRECTION.md` says what "more modern, more visual, more professional, more dynamic" means for Carta inside the locked palette and type, and gives one section each to motion, imagery, data visualisation, layout rhythm and type scale, density per mode, the phone, and the planning journey across surfaces. Its part 9 decides all 96 "Needs a rule" proposals from the briefs: 94 accepted (6 of them as amended, where two briefs proposed the same thing differently) and 2 rejected (landing R2, a photograph on each town toggle, and landing R5, a sticky phone primary), each with its reason.

Broke: Two Edit calls on `01-tokens.css` and `motion.js` were refused / The files had been read through Bash `cat`, not the Read tool / Read them with the tool and re-applied the edits; Appending the ten "Direction check" sections with ten heredocs in one Bash call failed with "unexpected EOF" before anything was written / The shell rejected the compound...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T380-v6-direction.md"`

### Execution Report: T413 (2026-10-07)

On the evening of 2026-10-07 the owner and this session put four days of merged work live. Production on Cloudflare Pages now runs waves 6 to 16c, including the darker contrast colours of T363, which the owner approved from the compare screenshots. The database is now current up to migration 051, apart from the Stripe set. The register had recorded almost all of stage 2 as never pasted, and that turned out to be wrong. A read-only catalog probe, run by the owner in the SQL editor, showed 017 to 024, 028 to 030 and 032 to 043 already live, with 025, 026, 027, 031 and 044 to 048 missing.

Broke: The first build vanished before the upload / The wave orchestrator's close-out deletes continent-app/dist and dist-data in the main checkout / Waited for the orchestrator to go idle, then rebuilt; The register said stage 2 was never pasted / Earlier pastes were made without closing their rows / The catalog probes; 36 rows closed here with what was...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T413-blocks-c-d-e-live.md"`

### T417: design system plan (roadmap 1.2) (2026-10-13)

The owner's roadmap now lives in the repo at `Roadmap/Carta roadmap.md`, and the plan for roadmap item 1.2 (one design system) is written next to it in `Roadmap/1.2-design-system-plan.md`. The plan rests on a measured inventory of the app as it is today: about 230 distinct button styles (the roadmap's "89" counted class families with "btn" in the name), 22 of 773 buttons going through the shared `Button`, 52 font sizes, 48 radii, 16 percent of spacing on tokens, about 40 card components, 12 money helpers and 5 estimate notations. It also explains why the app reads as black: the selected state is slate `--ink-fill` on 142 rules and about 90 older rules fill controls in near-black `--ink`.

Broke: `impeccable context` found no PRODUCT.md or DESIGN.md / It resolves the project root to `continent-app/`, its own git repo, while both files sit at the repo root / Read directly this session; a lasting fix is T417-b; Static `impeccable detect` over `src` returned no findings / The detector reads rendered pages and HTML; JSX plus a 44k-line styleshe...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T417-design-system-plan.md"`

### T418: design baseline, audit and critique (roadmap 1.2) (2026-10-13)

The "before" for roadmap 1.2 is measured and written down in `Roadmap/1.2-baseline-audit.md`. The built V6 app was served locally and assessed four ways: an impeccable critique whose design review ran in an isolated agent (21 of 36 on the Nielsen heuristics, consistency 1 of 4), an impeccable technical audit (11 of 20), the impeccable detector by URL on 11 surfaces at two viewports, and the quality-floor walker over 107 screens.

Broke: The quality-floor walker reports 0 usage contrast failures while the detector finds 144 / The walker does not resolve the accent text on `--accent-bg` pair the way the detector does / Recorded as T418-b; the baseline uses the detector figure; Critique order / The detector ran in the parent before the design review started, so the parent saw it firs...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T418-design-baseline-audit.md"`

### T419: the new visual direction (roadmap 1.2) (2026-10-13)

Carta has a chosen visual direction, recorded as an impeccable direction contract in `continent-app/.impeccable/surfaces/continent-app.md` and as a brand commitment in PRODUCT.md. The round ran on impeccable's decision page in three hands. The first, seeded (key b1a9897d, Operate mode), assigned "Field spec" (outdoor gear spec sheets) with "Platform" (rail passenger information) as impeccable's pick and six catalogue challengers (one competitive, five declined with named raises); the owner re-rolled toward safer with the steer "modern professional, simple, super clear, really dynamic, look at my other portfolio projects".

Broke: `impeccable context --target continent-app/...` finds no PRODUCT.md / `continent-app` is its own git repo, and discovery stops at the git root; `projectRoots` does not cross it / Run impeccable from the repo root without a target; brief targets use `continent-app`; `serve-question --start` piped into `tail` hung / The daemon kept the stdout pipe op...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T419-design-direction.md"`

### T420: PRODUCT.md brought to impeccable's product record (init) (2026-10-13)

PRODUCT.md now follows impeccable's product-record schema (stamp `impeccable:product-schema 1`) and carries the sections the doctor reported missing, filled only with facts the repo proves or the owner confirmed in one interview round. Platform is web: the store apps wrap the same web app, so there is one design language. Positioning summarises T201 and the four competitor clauses of T202. Operating Context records how a traveller uses Carta, the organic-search acquisition constraint, the launch date and the owner's first-year success (paid Trip Passes, visitors from search, trust and return). Evidence on Hand lists the real material and what must never be invented.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T420-product-init.md"`

### T421: Lagoon tokens, the whole app re-skinned (roadmap 1.2) (2026-10-13)

Every tab of the app now wears the Lagoon direction chosen in T419, from one token file. `continent-app/src/styles/01-tokens.css` is rebuilt in three layers: primitives (neutral, lagoon and sun scales), roles (`--surface*`, `--text*`, `--border*`, `--action*`, `--select-*`, `--focus`, `--best*`) and the legacy names, each now an alias of a role, so the 9,800 existing `var(--...)` uses re-skinned without touching a component. Figtree replaces Fraunces, Plus Jakarta Sans and JetBrains Mono as the one family; figures are tabular app-wide through `body`. New scales exist for type (eight steps, 11 px floor), radius, elevation and layers, and `--space-5` and `--space-6` moved onto the 4 px grid.

Broke: design-lint flagged `--font` as a font literal / The rule allows a typeface name only in `--display`, `--ui` or `--mono` / The face lives in `--ui`; `--font` aliases it; the rule accepts `var(--font)`; token-mirror-drift would fail on every aliased name / The mirror check compared the raw declaration (`var(--x)`) / The check follows the var() chain...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T421-lagoon-tokens.md"`

### T422: the component kit and the one selected state (roadmap 1.2) (2026-10-13)

Carta has a component kit in `continent-app/src/components/ui/`: Button (primary, secondary, quiet, danger; md and sm; loading, icons, block), IconButton (a 44 px box, a required label, plain, surface and photo tones, a pressed state), Chip (filter, choice in a ChipGroup with arrow keys, count, status with six tones), Segmented (a raised white thumb on a sunken track, radio semantics), Tabs (teal underline, tablist semantics, arrow, Home and End keys), Card (row and tile layouts, fixed slots media, title, meta, price, rating, actions, one stretched opener so nothing interactive nests), Field (input, select or textarea with a required label, help and error tied by aria-describedby) and Icon (...

Broke: Kit chip and tab classes would lose to legacy `.chip`, `.tab`, `.tabs` / Those legacy rules load after the kit / Kit classes take a `ui-` prefix; The active bottom-nav icon was white on the new tint / Its colour was set in a separate rule (`--on-fill`) / Icon and label take `--select-ink`; Lint: a literal inset shadow and an `outline: none` in the...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T422-ui-kit.md"`

### T423: one money formatter (roadmap 1.2) (2026-10-13)

Every euro in the app now comes from one formatter, `continent-app/src/lib/money.js` (`formatMoney`, `formatApprox`, `formatEst`, `formatMoneyRange`), and a `<Money>` component in the kit. The eleven app-side helpers that each formatted money their own way (`eur`, `eurExact`, `eurDay`, `eurCents`, `eurRange`, `eur0`, `eurFmt`, `formatPrice`, the inline Intl call on the journey page) are now one-line aliases over it, so the symbol sits where the reader's language puts it everywhere (€87 in English, 87 € in German and French) and digits group by locale.

Broke: "40 € to 60 €" in German / `formatRange` hard-coded the English word / The joiner follows the app language; A double tilde would have shown on the leg summary / The caller prefixed `~` and the new template does too / The caller passes the bare figure with `~`, the template adds the word; Two shell heredoc paths mangled while scripting / Backslashes...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T423-money.md"`

### T424: the style guide page (roadmap 1.2) (2026-10-13)

The "one place" of roadmap 1.2 exists: `?styleguide` opens Carta's design system page instead of the app. It is built from the live kit and the live tokens, so it cannot drift from what ships: colour roles with their resolved values and what each is and is not for, the text pairs with their measured contrast, the primitive ramps, the type scale on real copy, spacing, radius and elevation, the four button kinds with disabled and loading states and the icon button, the four chip kinds (filters toggle, the month choice group moves with arrow keys, every status tone), the segmented control and tabs, the card anatomy as compact rows and photo tiles with real catalogue photos (Kotor, Hallstatt, Pl...

Broke: Card titles on the page had a 30 px gap under them / The page's section-heading rule matched the cards' own h3 / Scoped to `.sg-section > h3`; A literal inset shadow would have failed design-lint / Swatch outlines drawn with box-shadow / Outline with a negative offset

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T424-styleguide.md"`

### T425: design docs from the built system, and the migration lint (roadmap 1.2) (2026-10-13)

The written design system now describes what ships. DESIGN.md was rewritten in place by the impeccable documenter brief (run in a general-purpose agent, because the harness has no impeccable agent type) into the DESIGN.md format: YAML frontmatter with colours, type, radius, spacing and components; then overview, a new "Where to adjust the style" section for the owner's hand tuning (which file holds what, the live preview at `/?styleguide`, the checks to run after a change), colours, type, layout, elevation, shapes, the kit with variants, states and when to use each, the money rules, do's and don'ts, and a history of what Lagoon retired.

Broke: Two lint regexes lost their `\b` / A shell heredoc turned `\b` into a backspace byte / Byte-level replace from a script file; The clean fixture would trip the new legacy-token rule / It used `--accent`, `--bg-card`, `--mono` / Moved to `--action`, `--surface`, `--font`; The documenter saw 9,565 "new" violations / It ran before the baseline was writ...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T425-design-docs-lint.md"`

### T426: the app shell on the Lagoon kit (roadmap 1.2 migration, surface 1 of 9) (2026-10-13)

The shell is the first surface moved onto the Lagoon kit and roles. Seven of the twelve raw buttons in the shell components now come from the kit. In the header, "Get a pass" and Friends are kit secondaries (`Button` size sm). Friends shows the selected tint while its panel is open, and "Get a pass" reads the same on every width instead of swapping between two labels. The phone plus is a kit `IconButton` on the surface tone: a white disc with one border edge, which settles T422-c. The sheet close is a kit `IconButton`.

Broke: The state dot on the active desktop tab was invisible / It was `--on-fill` (white) from the dark-fill era, and the active tab is now the light tint / `--select-ink`; `02-base.css` turned LF / `sed -i` in Git Bash (known trap) / Rewritten as CRLF with node, edits re-applied; A bash heredoc failed on quotes / Shell quoting / Script written to the scr...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T426-shell-migration.md"`

### T427: Explore, part 1: layout, cards, sections, no clutter (Explore redesign, step 4 of 9) (2026-10-13)

Explore now follows the owner's review of 2026-10-13: full width, sections of photo tiles, every list in compact rows, and no counts or explanatory captions. **Layout.** - The 1180 px cap is gone on Explore. One 32 px gutter now lines up the header, the settings line, the side panel and the content on every tab. - The top band is the title "Explore Europe" alone, with no count beside it. The List/Map kit `Segmented` and the sort sit on the right. On a phone the title is read but not drawn, so the search leads the screen.

Broke: Row photographs were broken images / A 300 px thumbnail was asked for; Wikimedia renders only fixed widths / 250 px, the smallest rendered width (2x for a 72 px photo); "Hiking bases" listed Paris, Amsterdam, Bruges / Cities have trail ends nearby / The guided layer ignores trail proximity for cities; The phone showed a large "Explore Europe" headi...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T427-explore-layout.md"`

### T428: The Destinations tab, rebuilt on the kit in Explore's grammar (2026-10-15)

This is roadmap 1.2's Destinations task (`Roadmap/1.2-migration-handoff.md`), carried out to the owner's brief of 2026-10-14: make the tab modern, clean and professional, show what matters first, cut every sentence the traveller does not need, reuse Explore's patterns, put people and better photographs in front, add a guided way in, link to the other tabs, and check every photograph. It builds on T448 (trip styles) and T449 (country galleries).

Broke: A card did not open when pressed on its photograph / Global press `scale` turned the link into its overlay's containing block / `04-ui.css`: no compression on the stretched link, the card takes the press; The fix lost to the global rule / The global `:is()` list carries `input[type=checkbox]`, one element more specific / Doubled class; Typing a cou...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T428-destinations-tab.md"`

### T429: The destination page, open and visual, with one price (2026-10-14)

The page a traveller opens from Explore (Rome is `#dest=FCO`) was rebuilt to the owner's brief of 2026-10-13 and the three calls the owner made today: When to go then Things to do lead, six sections open with at most five folded rows, and colour comes from photography. **Before.** A photo strip, a head, then a 380 px right column holding the first-run receipt, the cost fold, When to go and nine more folded rows, three screens long beside an empty left half. The receipt carried the method sentences the owner named ("Priced for 2 people and 7 nights: the bed measured in Rome, the food at the national basket...", "Tap a segment for its figure", "At the dorm bed rate it would be...").

Broke: Photo tracks rendered as a row beside their heading / `.dtrack` is the day carousel's class (32-day-carousel.css) / Renamed to `.dphoto-*`; Primary below the fold at 1280 x 720 / The receipt sat above the buttons in the card / Buttons under the inputs, the receipt after them; Card's top lost above the screen with the calendar open / A sticky column...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T429-destination-page.md"`

### Design Health Score (outdoor item pages, before T430) (2026-10-15)

target: outdoor item pages total_score: 22 max_score: 40 na_heuristics: p0_count: 1 p1_count: 2 target_identity: "file:/home/user/carta-travel-app/continent-app/src/browse/DetailSkeleton.jsx" target_fingerprint: "sha256:28a7c6e0ded62fcd8cbba27bfb6cb88b0c55dd634994ae728c8cad27fc5e5d83" target_path: /home/user/carta-travel-app/continent-app/src/browse/DetailSkeleton.jsx timestamp: 2026-10-15T11-30-51Z slug: continent-app-src-browse-detailskeleton-jsx --- Method: dual-agent (A: design review sub-agent, B: detector and browser sub-agent). Photos and map tiles blocked in the sandbox.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T430-critique/2026-10-15T11-30-51Z__continent-app-src-browse-detailskeleton-jsx.md"`

### Design Health Score (trip page and trips list, before T431) (2026-10-15)

target: trip page and trips list total_score: 21 max_score: 40 na_heuristics: p0_count: 1 p1_count: 3 target_identity: "file:/home/user/carta-travel-app/continent-app/src/browse/JourneyPage.jsx" target_fingerprint: "sha256:63c3d3f83de87f5053f9117decbf38e71f242a4b6688fd5609ac0d9df4b840a7" target_path: /home/user/carta-travel-app/continent-app/src/browse/JourneyPage.jsx timestamp: 2026-10-15T11-30-51Z slug: continent-app-src-browse-journeypage-jsx --- Method: dual-agent (A: design review sub-agent, B: detector and browser sub-agent).

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T430-critique/2026-10-15T11-30-51Z__continent-app-src-browse-journeypage-jsx.md"`

### Design Health Score (item pages, after T430) (2026-10-15)

target_identity: "file:/home/user/carta-travel-app/continent-app/src/browse/DetailSkeleton.jsx" target_fingerprint: "sha256:b60c096630766ab71f6a75bbab9c63129175940fd1cc4310067ba5e22d8a65ab" target_path: /home/user/carta-travel-app/continent-app/src/browse/DetailSkeleton.jsx timestamp: 2026-10-15T13-29-20Z slug: continent-app-src-browse-detailskeleton-jsx --- Method: dual-agent (A: design review sub-agent, B: detector and browser sub-agent). Photos and map tiles blocked in the sandbox; layout judged around them.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T430-critique/2026-10-15T13-29-20Z__continent-app-src-browse-detailskeleton-jsx.md"`

### Design Health Score (trip page and trips list, after T431) (2026-10-15)

target_identity: "file:/home/user/carta-travel-app/continent-app/src/browse/JourneyPage.jsx" target_fingerprint: "sha256:be63288bd9d9fd6d8c93f0180f85407397cdf0f3ef184ad3a4aae514f9568483" target_path: /home/user/carta-travel-app/continent-app/src/browse/JourneyPage.jsx timestamp: 2026-10-15T13-29-20Z slug: continent-app-src-browse-journeypage-jsx --- Method: dual-agent (A: design review sub-agent, B: detector and browser sub-agent). Photos and map tiles blocked in the sandbox; layout judged around them.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T430-critique/2026-10-15T13-29-20Z__continent-app-src-browse-journeypage-jsx.md"`

### Task ID (2026-10-15)

The five outdoor item pages (trail, beach, lake, mountain, cycle route and tour) and their section openings on the Destinations tab were rebuilt on one shared system, in the order the owner decided on 2026-10-15 and recorded in carta-design ("Detail page grammar"): show first what makes the traveller want to go, then what decides it. Every item page now opens on a swipeable, credited photo gallery (the destination page's gallery, lifted into `PhotoGallery.jsx` so there is one gallery in the app), then a head with the full name, the Score and band, where it is and one hook line that sells the place, then a fact band of four to six measured facts with an icon each (a missing fact is left out,...

Broke: Item pages crashed on the stub page / SourcesLine got `sources={false}` / Guard with Array.isArray; DetailPage used alternatives before declaring them / Rail readiness read the merged list / Count the two inputs instead; Cycle GPX button rendered white / Legacy .cycle-gpx and .tpage-primary classes beat the kit / Classes removed; tourGpxText delete...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T430-item-pages.md"`

### Task ID (2026-10-15)

Trips (the style library on the Destinations tab, a style's list and the trip page) were rebuilt on the item pages' system of T430, and the catalogue gained five trip styles the owner asked for, each with one fully slotted sample trip. The library is fifteen style tiles; a style's list is photo tiles (one across on a phone, two from 769 px, three from 1280 px) with the full title, where it is, the places the trip visits, the best months and the range a person, and no day count or difficulty word, because the one length choice above the list states the length (it is generic now: "3 or 4 days" and "7 days" today, and each 10 or 14 day length adds its own choice when such trips arrive).

Broke: The rail sample's hero took the Prague city trip's photograph / The sample pins win over the uniqueness pass / Another file for the sample hero; the 253 journey files diffed unchanged; The rail style photo was a concert in Schönbrunn / The first Vienna dossier photo / The Landwasser Viaduct with a train; Sample trips failed the accuracy-signals che...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T431-trips.md"`

### Critique 1, trip planner after the T432 build (2026-10-16) (2026-10-16)

target: src/planner total_score: 21 max_score: 40 p0_count: 0 p1_count: 3 target_identity: "file:C:\\Users\\Gebruiker\\Documents\\Portfolio\\wt\\t432-app\\src\\planner" timestamp: 2026-10-16T08-00-20Z slug: src-planner --- Method: dual-agent (A: design review · B: detector and browser) Target: continent-app/src/planner (GuidedTripWizard, TripPlannerTab, TripItinerary, TravelLegsSection, PlanTotal, LifestyleChoices, CheapTipsSection), live at http://localhost:4240/?tab=trip&o=CRL&paymock.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T432-critique/2026-10-16T08-00-20Z__src-planner.md"`

### Critique 2, trip planner after the fix batch (2026-10-16) (2026-10-16)

target: src/planner total_score: 25 max_score: 40 p0_count: 0 p1_count: 1 target_identity: "file:C:\\Users\\Gebruiker\\Documents\\Portfolio\\wt\\t432-app\\src\\planner" timestamp: 2026-10-16T08-25-46Z slug: src-planner --- Method: dual-agent (A: design review · B: detector and browser), confirming round | # | Heuristic | Score | |---|---|---| | 1 | Visibility of system status | 3 | | 2 | Match with the real world | 3 | | 3 | User control and freedom | 3 | | 4 | Consistency and standards | 2 | | 5 | Error prevention | 3 | | 6 | Recognition rather than recall | 3 | | 7 | Flexibility and efficien...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T432-critique/2026-10-16T08-25-46Z__src-planner.md"`

### T432: Trip planner redesign (wizard, review, planned trip) (2026-10-16)

The trip planner now has one price. Before, the last wizard step and the planned trip summed the same trip twice, through two functions with different inputs: the Albania test week read €671.80 on the last step and €791.80 one tap later (the airport transfers were only in the second sum), the planner dropped a typed car cost, a train ticket still picked up an airport transfer, the wizard and the planner read the Lifestyle from two places, and a flexible date could price a different week.

Broke: The planned trip cost €120 more than the last wizard step / Airport transfers only in useTripPlanner's grandTotal / One function, priceTrip, priced from the state the wizard hands over; A train ticket picked up an airport transfer / An own fare that was not a flight still took the routed flight's airport / Non-flight arrivals land at the first stop...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T432-trip-planner.md"`

### T433 critique, after (2026-10-16) (2026-10-16)

Method: dual-agent (A: design review, B: detector and browser evidence), on branch p11-day-planner with the shots in `../T433-shots/after/`. One fix batch followed (recorded at the end). | # | Heuristic | Before | After | Key issue left | |---|---|---|---|---| | 1 | Visibility of system status | 2 | 3 | Nested progress on the AI path (Step 5 of 5 over Question 3 of 7) | | 2 | Match with the real world | 2 | 3 | "a day here, a person"; "Which day" heads a range | | 3 | User control and freedom | 2 | 3 | The day page's back is an icon-only arrow | | 4 | Consistency and standards | 1 | 3 | Column...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T433-critique/after.md"`

### T433 critique, before (2026-10-16) (2026-10-16)

Method: dual-agent (A: design review, B: detector and browser evidence), run on app master f603b74 with the shots in `../T433-shots/before/`. | # | Heuristic | Score | Key issue | |---|---|---|---| | 1 | Visibility of system status | 2 | AI allowance never shown; "1 stops"; the bot import lands on an empty "Plan day 1" | | 2 | Match with the real world | 2 | "Import onto my map", "Carta bot find", "Files", "Whole days"; title "Rome (Fiumicino)" | | 3 | User control and freedom | 2 | Two back controls in the bot; no Back in the wizard; "Back to all day plans" for one day | | 4 | Consistency and...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T433-critique/before.md"`

### T433: Day planner rebuilt (flow, Carta's questions, builder, planned day, checked routes) (2026-10-16)

The day planner now works the way the trip planner does, plans several days, and checks every walk it draws. **The questions.** They wear the trip planner's own wizard frame: the same classes, a kit `StepRail` and a `DayWizardShell`. That gives the same named rail, "Step x of 5", the phone's one-line bar and steps sheet, and Back beside a primary that says where it goes. The five steps are Start, Days, Ideas, How, and then Carta's questions or Places. - The copy that repeated each question is gone. - "Continue a trip" is now "Plan a day of your trip": one compact row per saved trip, named by its towns rather than "Untitled".

Broke: The planned day looped "Maximum update depth exceeded" / With no pickable pins, TripMap reframes when its stops, segments or padding change by identity, and the reframe reports the view back / The three are memoized above the early return; The Days step squeezed the whole wizard into 420 px / The shell's modifier class `dayw-when` collided with the...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T433-day-planner.md"`

### T434 critique, after (2026-10-16) (2026-10-16)

Method: dual-agent, as before. Assessment A (`assessment-a-after.md`) and Assessment B with the impeccable audit (`assessment-b-after.md`, `audit-after.md`) ran isolated. Frames: `../T434-shots/after/` (360, 390, 820, 1440 px; English and German). | # | Heuristic | Before | After | Key issue left | |---|---|---|---|---| | 1 | Visibility of system status | 2 | 3 | The record map is a blank box until WebGL draws (no still drawing of the countries yet) | | 2 | Match with the real world | 2 | 3 | Plain words now; German country names were English (fixed in the batch below) | | 3 | User control and...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T434-critique/after.md"`

### T434 critique, Assessment A after the rebuild (design review) (2026-10-16)

Date: 2026-10-16. Reviewer: Assessment A, isolated. I did not run the detector or read its output, and I did not read the T434 report, so this judges the code and the screenshots alone. Read first: PRODUCT.md, DESIGN.md (tokens), `.claude/skills/carta-design/SKILL.md`, `before.md`. Evidence: `continent-app/src/auth/SavedTripsPanel.jsx`, `src/auth/mytrips/{MyTripsTabs,TripCards,parts}.jsx`, `src/auth/TripSharePanel.jsx`, `src/community/GuidesPanel.jsx`, `src/styles/70-mytrips.css`, `src/lib/myTrips.js`, `src/lib/visitedCountries.js`, the English strings in `src/i18n/en.js`, the screenshots in `...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T434-critique/assessment-a-after.md"`

### T434 critique, Assessment A (design review), My trips before state

Scope: `continent-app/src/auth/SavedTripsPanel.jsx` (2,137 lines), `src/styles/17-saved-trips.css`, `69-v6-account.css`, `25-feature-pages.css` lines 8 to 219. Tabs Planned, Shortlist, Visited. Evidence: `Execution/P11/T434-shots/before/before-mytrips-{empty,trips,shortlist,visited}-{phone,ipad}*.png` (no desk shots had arrived; the iPad shots at 820 px already show the desktop layout with the side panel). Compared against `T457-shots/after-d-explore.jpg`, `after-m-explore.jpg` and `T458-shots/overview-laptop.png`.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T434-critique/assessment-a-before.md"`

### T434 critique, Assessment B (after): detector and browser evidence (2026-10-16)

Surface: the rebuilt My trips. `continent-app/src/auth/SavedTripsPanel.jsx`, `src/auth/mytrips/{MyTripsTabs,TripCards,parts}.jsx`, `src/auth/TripSharePanel.jsx`, `src/community/GuidesPanel.jsx`, `src/styles/70-mytrips.css`, `src/lib/myTrips.js`. Run 2026-10-16, about 20:10 to 20:45, on branch `p11-my-trips` (root `434a700ea`, app `05c36df`, T434 work uncommitted in the app tree). Evidence only, no design opinion. Read-only: no source was edited. **Concurrency caveat.** Another session was still editing and rebuilding while this ran.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T434-critique/assessment-b-after.md"`

### T434 critique, Assessment B (before): detector and browser evidence (2026-10-16)

Surface: My trips. `continent-app/src/auth/SavedTripsPanel.jsx` and what it renders in `src/auth/` (PastTripForm, TripMemoryView, TripSharePanel, InstallHint, FriendTripPanel, ModerationNotice) plus `src/community/GuidesPanel.jsx`. CSS: `src/styles/17-saved-trips.css` (lines 1-620 and 1338-1830) and `src/styles/69-v6-account.css`. Run 2026-10-16, about 18:15 to 18:50, against branch `p11-my-trips` at `434a700ea`. Evidence only, no design opinion. **Concurrency caveat.** Another session was editing the app while this ran.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T434-critique/assessment-b-before.md"`

### T434 My trips: technical audit, after the rebuild (2026-10-16)

This audit was run on 2026-10-16, about 20:10 to 20:45, against the working tree on `p11-my-trips` (root `434a700ea`, app `05c36df` plus the uncommitted T434 work). It follows `impeccable/reference/audit.md`, the same playbook as `audit-before.md`, so the scores compare like with like. Read only: no source was edited.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T434-critique/audit-after.md"`

### T434 My trips: technical audit, before the rebuild (2026-10-16)

Audit run 2026-10-16 against the working tree on `p11-my-trips` (root `434a700ea`, app `05c36df`), dev server on port 4260, following `impeccable/reference/audit.md`. Read only: no source was edited. Scope: `src/auth/SavedTripsPanel.jsx`, `PastTripForm.jsx`, `TripMemoryView.jsx`, `TripSharePanel.jsx`, `src/community/GuidesPanel.jsx`; CSS `src/styles/17-saved-trips.css`, `69-v6-account.css`, `25-feature-pages.css` lines 8 to 219. Where a finding lives in a file outside that list (the surface's CSS is spread wider, see Patterns), the file is named.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T434-critique/audit-before.md"`

### T434 critique, before (2026-10-16) (2026-10-16)

Method: dual-agent. Assessment A (design review) and Assessment B (detector and browser evidence) ran as isolated sub-agents and did not see each other's output; a third sub-agent ran the impeccable `audit`. Their full write-ups are `assessment-a-before.md`, `assessment-b-before.md` and `audit-before.md` in this folder. Screenshots: `../T434-shots/before/` (360, 390, 820 and 1440 px, taken from a worktree of app HEAD 05c36df).

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T434-critique/before.md"`

### T434: My trips, rebuilt (2026-10-16)

The owner wanted My trips to be top tier against Wanderlog, Polarsteps and Airbnb Trips: compact and clean, with human copy, aligned with the tabs around it, and actually useful. My trips was the last surface still in the look from before Lagoon. The critique scored it 22/40 and the audit 10/20. **What a traveller sees now.** Three sections that work like Destinations' sections: tiles in the side panel on desktop, and tiles under the title on a phone. **Trips.** - The next trip is one focal card with: - a photo, with nothing written on it; - a countdown chip and flags; - the cities, and the dates written "Fri 6 Nov to Thu 12 Nov, 6 nights".

Broke: The first "before" desktop and iPad frames showed the half-built new page / The dev server reloaded while the rewrite landed mid-shoot / Re-shot every before frame from a worktree of 05c36df on port 4270, with its data and modules junctioned; The CSS pruner's first run dropped a live mobile @media block in 24-destination-workspace.css / The emptine...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T434-my-trips.md"`

### T435: The finish review over the whole app (2026-10-17)

T435 was reserved in `Roadmap/1.2-migration-handoff.md` as the end of roadmap 1.2: an impeccable finish review over the whole app, with "after" numbers measured against `Roadmap/1.2-baseline-audit.md`. The migration it closes ran from T426 to T434, with the second passes T446, T458 to T461 and T463 to T468 after it. The review repeated the baseline's method. **Two isolated assessments:** - **The design review** never saw the detector output. It covered 36 shots of the same 11 surfaces at 390 x 844 and 1440 x 900, plus computed-style probes for fonts, selected states, button kinds and price strings.

Broke: A broken photo on the day planner's plan cards / `HeroImage maxWidth={240}` asked Commons for a width it does not render (HTTP 400) / `thumbAt()` snaps every width to the next rendered one; The climb bars fired the layout-transition rule on every page / They animated height / `transform: scaleY()` from the bottom

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T435-finish-review.md"`

### T436: the owner's calls on roadmap 1.2, applied (2026-10-13)

The owner answered the five open calls of 1.2 on 2026-10-13: the style guide is approved (closes T424-a, the design half of 1.2), the cheapest pin in view becomes the best-value sun marker (closes T425-a; built in the Explore migration, T427, and written into the handoff), the positive status chip follows "status, not green" (closes T425-c), the brand mark is redrawn in Lagoon (closes T421-c), and the work is pushed. The kit's positive chip is now `--text` on `--surface-sunken` with a 6 px `--status-success` dot; DESIGN.md and the skill say so.

Broke: `scripts/og/tokens.mjs` found no `:root` / It read `styles.css`, which only imports the domain files since T191 / Reads `src/styles/01-tokens.css`, follows var(); A shell heredoc ate backslashes in two edits / Same trap as T425 / Edits made with the file tool

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T436-owner-calls-lagoon.md"`

### T437: the Score, Switch and Tile in the kit (Explore redesign, step 1 of 9) (2026-10-13)

Ratings no longer draw as filled ochre chips. Every rating in the app (cards, rows, pins, page heads, the map card, the day planner pins, the rating breakdown) is now the Score: a drawn star and the figure in ink, tabular, at 12 px or more, on no fill. The star carries the tier: filled from the second tier up and outlined below, so the band reads without a word. Where a page has room, an opt-in `band` prop adds the band word through i18n: "Exceptional", "Excellent" and "Very good" in six languages. This came first in the plan for a reason.

Broke: The day planner pin score drew at 11 px with an inset ring / Old rule, and my first rewrite used an inset shadow / 12 px, a 1 px border, no inset shadow (the skill bans inset shadows); The switch focus ring sat on the track with `outline: none` on the row / The lint's outline rule would flag it / The row takes the standard 2 px focus ring

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T437-kit-score-switch-tile.md"`

### T438: the brown palette, the rules that go with it, and checks that work (Explore redesign, step 2 of 9) (2026-10-13)

The app now has two base colours, the owner's call of 2026-10-13: blue-grey ink and one warm brown. **Tokens.** A new `umber` ramp joins the primitives in `01-tokens.css`. Every role that read the lagoon teal now reads it: - action, hover and press; - the action tint; - the selected state (tint, label and edge); - the focus ring. Only those lines changed; the rest of the hand-tuned file is untouched. The selected tint was made a little richer (`#f6e7d3`) so it sits 9.9 delta E from the sunken grey, so a selected item never looks like a quiet band.

Broke: `--rate-soft` failed contrast as "rating as text" / I first pointed it at the border colour, but it is read as text in about 20 rules / It points at `--text-3` (5.2:1); the three tints that used it as a border take `--border`; The selected tint and the sunken grey were only 5.4 delta E apart / The first umber 100 was very pale / Umber 100 became `#...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T438-brown-palette.md"`

### T439: guided search data, precomputed and free (Explore redesign, step 3 of 9) (2026-10-13)

The owner asked for a search people would use, free, and guided, so the traveller can only ask what Carta can answer. This task builds the data half. `pipeline/guided_search_layer.py` writes `continent-app/public/search/guided.json`: 366 KB, 70 KB gzipped, lazy-loadable. It holds three things the app cannot work out from a destination record alone. **Areas.** Forty named areas with labels in all six languages: - 11 mountain areas: the Alps, the Pyrenees, the Dolomites, the Carpathians, the Apennines, the Tatras, the Picos de Europa, the Scottish Highlands, the Black Forest, the Julian Alps and the Lake District; - 15 coasts and islands: the Amalfi Coast, Crete, the Balearics, the Cyclades an...

Broke: Hallstatt and Karlovy Vary landed in "Bavaria" / Region boxes crossed borders / Every regional area lists its countries; Füssen was a "beach town" / Lake beaches sit in the beach layer / Beach proximity counts only for coastal places; Lagos was "lakeside" / Lagoons and reservoirs are in the lake layer / Only lakes of tier 2 and up count; Nearly eve...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T439-guided-search-data.md"`

### T440: Explore part 2: the filter rail on the kit, and the settings line as a booking bar (Explore redesign, step 5 of 9) (2026-10-13)

**The filter rail.** The owner said the rail's buttons "feel like AI". It is now built from the kit, with each kind of choice drawn by the one part made for it. Every filter Explore had is still there; only the controls changed. - **Trip type.** Nine Tiles, two across: icon over the word in the narrow desktop panel, icon beside the word in the phone sheet. - **Budget and month.** Labelled selects (kit Field). They moved in from the row above the list, so every input that narrows the list now lives in one place, and the input row is gone. - **Rating.** One choice row: Any, Very good, Excellent, Exceptional, each meaning "this band and up".

Broke: The phone Filters sheet drew the rail unstyled (huge headings, tall tiles) / The sheet renders outside `.explore-shell`, which scoped the new rules / The rail rules are scoped to `.xrail` itself; Budget and month selects cut to "Any bu" / Side by side in a 216 px panel / Stacked; Trip-type labels broke mid-word ("Beac h") in the desktop panel / Row...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T440-explore-filters-bar.md"`

### T441: Explore map: fast, clear, prices from the first view (Explore redesign, step 6 of 9) (2026-10-14)

The owner said of the map: "it loads too long, and then you only see numbers until you zoom". The map now opens quickly, draws every place at once and shows prices straight away. **What the reader sees** - **No number clusters.** Every place is a small ink dot from the first frame, sized by kind and darker for a better rating; unrated places recede. A dot is never brown, so it can't read as an action. - **Prices from the opening view.** The best-rated places in view carry a label: the name, then the day cost (for example "Rome ~€87"). That is 14 labels on a 1440 px desktop and 10 on a phone, where before there were none until zoom 7.

Broke: The map opened on Iceland to Cyprus, below the label zoom, so no prices showed / An unfiltered list counted as a filter, because the map compared the list with the raw catalogue, which is larger / The map takes the list's own catalogue, and frames Europe unless a filter or search is on (`framed`); Labels read "Paris (CDG)" and "Venice (Marco Polo)"...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T441-explore-map.md"`

### T442: The guided search (Explore redesign, step 7 of 9) (2026-10-14)

The owner asked for "a search people would use", free and accurate, where "you can guide the kind of questions that can be asked, but ensure the user can only ask this". Explore's free text field, which matched place names only, is replaced by a guided search. No model runs and nothing is sent anywhere. The Claude API is not involved. **How it works.** A question is read against a closed vocabulary built from Carta's own data: - the 20 vibes and 40 named areas from `guided.json` (T439); - the catalogue's places, with the search index's aliases and member villages; - the countries, the months, the budget steps, and five extras (a beach, trails or a lake close by, no car needed, not crowded).

Broke: "rome" could not complete to "romantic" / A finished word was parsed, not completed / While typing, the last one to three words are a fragment whenever a phrase starts with them; "quiet village" lost "quiet" / One vibe slot; the later word won / "Quiet" beside another vibe becomes the not crowded extra; "wandern" and "strand" were unknown / Only th...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T442-guided-search.md"`

### T444: The full Explore check, and its fixes (Explore redesign, check after step 7) (2026-10-14)

The owner asked for a full check of Explore with impeccable, on desktop and iPhone, against everything in the original brief (2026-10-13), before the work is pushed. The check ran as impeccable's critique specifies, as two independent reviews. **Assessment A, the design review.** A director's review with screenshots on desktop (1440 x 900), an iPhone 13 (390 x 844, touch) and German at 360 px. - Heuristic score: 24 of 40. - The brief: counts, full width and the two base colours met; the rest met or partly met.

Broke: Opening a place pushed a step, but the address lost `#dest=` and the step's marker / `persistState` and Explore's filter sync rewrote the URL with a null state and no hash / Both keep the place hash and the current state; The close-by-arrow probe timed out on desktop / The page's back arrow is a phone control / The desktop probe closes with Escape...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T444-explore-check.md"`

### T445: Deploy the Explore redesign (data, preview, production) (2026-10-14)

The owner approved the Explore work (T437 to T444) and asked for the deploy. Production is Cloudflare Pages by direct upload (project `carta-app`), with the data shards on R2 (`data.carta-europetravel.com/data`). The documented order is the data first, then a preview, then production (scripts/build-pages.mjs). **Two problems found and fixed before the deploy** - **The search data was not on the data host.** `search/guided.json` (T439) is an R2 entry, but it had never been uploaded, so the data host answered 404. A production deploy without it would have shown the guided search stuck on "Loading the search" and the hiking and beach rails empty.

Broke: The guided search data was missing on the data host / T439 added the R2 entry, but the upload (an owner step with rclone keys) never ran / Uploaded the one new file with wrangler; `dataCachePolicy()` threw / T439 added `search` to R2_TIER without a `_headers` rule / Added the `/search/*` rule; The production deploy command was refused / The session...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T445-deploy-explore.md"`

### T446: The destination page through impeccable: critique, fixes, re-critique (2026-10-14)

The owner asked, after T429, to repoint impeccable's project brief, to "ensure that impeccable has done everything possible" on the destination page, and to publish a before and after showcase. **Impeccable's own records** - The surface brief named a target, `continent-app`, that no longer resolves. Run from the nested app repo, impeccable's root is `continent-app`, so the target became `continent-app/continent-app`. - It was rewritten through `impeccable surface-brief write src` as `continent-app/.impeccable/surfaces/src.md`, the body unchanged, and the old file was removed. - The design sidecar `.impeccable/design.json` was stale against DESIGN.md.

Broke: Village heading and list side by side at 1280 / The wrapper took the list's grid class `.destp-members` / Wrapper renamed `.destp-villages`; Rail stopped selecting When / Scroll padding on the scroller moved the landing point past the rail's 60 px line / Focus offset put on the focusable controls, sections keep their margin; Three track cards cover...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T446-destination-impeccable.md"`

### T447: Every Score star filled; owner answers to the destination page calls (2026-10-14)

**Score stars.** The owner answered the open design calls from T429 and T446 on 2026-10-14. Until now the Score drew its star filled from the second tier up and outlined below. Reviewers in the T446 critique read the outline as "not rated". - The star is now always filled: in the kit Score (`RatingBadge.jsx`, every card, row, page head and outdoor page) and in the Explore map's preview card (`ExploreMap.jsx`). - Below the first band it stays grey (`--text-3`), as before. - The carta-design rule says so. **The owner's answers (2026-10-14):** - **T429-b, yes.** The destination page totals the Lifestyle day times nights and party. The seasonal receipt basis stays retired. Closed.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T447-score-star.md"`

### T448: Trip styles in plain words, people in the photographs, the library rebuilt (2026-10-14)

The owner asked (2026-10-14) whether every trip style makes sense and is clear, whether valuable styles are missing (people who sleep in hostels was the example), and for photographs that show people doing the activity: someone riding a bike on the cycling card, not another view. The owner chose to rebuild the trip data in this session rather than only review it. **The review.** A separate agent read all 253 trips against the ten styles and counted with Python on `trips.master.json`. Its full findings are summarised here; the working file was a scratchpad note. - The typing is sound.

Broke: The offline build refused to write (3 trips unresolved) / 43 places were never cached / Ran with fetching on, against a scratch cache first; 12 trips got a worse photograph / The uniqueness pass, plus new candidates / Pinned the old photograph (`JOURNEY_HERO_PINS`); 10 more trips moved after pinning / Pinned trips took back photos their neighbours...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T448-trip-styles.md"`

### T449: Country galleries, section photographs, and the moth (2026-10-14)

The owner asked (2026-10-14) for a few things: - each country to show the photographs people know it for, a few to swipe through, with a short line of text before they open it; - a check on the images; - an end to the Belgium card that showed "a leaf with an animal on it". **Before.** - A country card had no photograph of its own. It took the first photograph of the country's best-rated trail (`DestinationsTab.jsx` `askCover`). For Belgium that was trail 86628, "Promenade du Lac de Nisramont", whose photo is a Commons insect shot, `2018-11-04 Colotois pennaria (2).jpg` (a moth). - The trail harvest's species filter matched a Latin binomial only at the start of a file name.

Broke: Commons answered HTTP 429 while three agents downloaded at once / Rate limit / Backoff and slower pacing in every script; A 640 px thumb returned HTTP 400 / Commons renders only 250, 330, 500, 960, 1280 and 1920 / Used 500 px for checks (matches `WIKI_WIDTHS` in `heroImage.js`); The JS species rule missed the underscore spelling / `_` is a word cha...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T449-country-photos.md"`

### T450: The country and region pages on the kit (2026-10-15)

Roadmap 1.2 lists the country and region pages with the Destinations surface. The owner's brief of 2026-10-14 asked for one design language across the tab: the photographs people know a country for, a line of what it is known for, stats in the same professional system, no filler text, and easy movement between tabs.

Broke: The country hero was narrower than the page / `max-height` with an `aspect-ratio` shrinks the width / A clamped height on desktop, 4:3 on a phone; The gallery arrows never showed on the country hero / They showed on `.dgal-card` hover only / The hero added to the same rule; The quality floor found a skipped heading on the region page (H3 after H1)...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T450-country-region-pages.md"`

### T451: The Destinations impeccable check (2026-10-15)

This is the fifth task of the Destinations plan (T448, T449, T428, T450, T451). It ran the same kind of check T444 ran for Explore and T446 for the destination page: - a dual critique by two isolated sub-agents: A, a design review with Nielsen scores at 390, 1440 and German at 360; B, the impeccable detector on the files and in the browser; - a third agent that fact-checked every string and photograph on the tab; - one fix batch; - one confirming round, then stop. The first round scored **24/40** (one P0, two P1s). After the batch the re-score is **27/40**, with no P0.

Broke: Template literals and regexes lost their backslashes in `node -e` edits / The shell ate `\s` and `` ` `` / Re-made with the Edit tool; later edits went through script files (memory: heredocs eat backslashes); The new harness checks found nothing (`els.slice is not a function`) / `$$eval` in a `String.replace` replacement became `$eval` (`$$` is the...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T451-destinations-check.md"`

### T452: The Destinations lists as compact rows (2026-10-15)

The owner asked for this on 2026-10-15, answering row T451-b: the lists should suit the user, look really good, match the other tabs, sections and Explore, and give "just enough information to attract them, not too much, not too little". Explore already answers that question: - photo tiles in the rails, where inspiration leads; - compact rows in the full list, at every width. The kit Card records the owner's own decision of 2026-10-13: "row, the compact default, about ten to a phone screen". Destinations lists drew full-width photo tiles instead, about 540 px each on a phone.

Broke: verify_places_tab: "trip cards carry km and stops" / A row shows two values; city days showed length and time / Values reordered: length, then stops or climb, then time; Two unit tests / They asserted the old order / Updated to the new order; Long trip titles were cut with no ellipsis, and the place line ran to three lines / The title's button was...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T452-destinations-rows.md"`

### T453: Trails opens on walks (2026-10-15)

The T451 design review found that Trails, the section hikers reach first, opened without a single walk (row T451-a). The owner asked for an investigation first, then the fix. **The investigation.** A read-only agent mapped the trail wire. It found: - 45 country files, 17,619 rated walks, 3,554 of them with a photograph; - every other section (beaches, lakes, mountains, cycling) opens on a `top.json`; - the comment in the tab said Trails could not, only because no Europe-wide list existed; - such a list can be built offline from the published country files, with no trailslab database and no network.

Broke: "6668" as a walk tile's name / A route with only a ref as its name / The selection needs a name with letters; "7" as a tile's name / `displayName` dropped "(The Blue Eye)" / The bracket goes only when a real name remains; Blank lines in the six language files / The insert script's indent capture took a newline / Removed

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T453-trails-opening.md"`

### T454: Honest lift claims on mountains (2026-10-15)

The T451 fact check found the Mountains layer claiming a lift to the summit of mountains whose lifts stop well below it: Mont Blanc, the Matterhorn, Teide, the Eiger, Dachstein, Dajti, Hochkönig and Montserrat (row T451-d). The owner asked for it to be fixed in the pipeline. **Why it happened.** A read-only investigation of `pipeline/mountains/peak_index.py` `lift_of()` found two causes: 1. **The OSM distance was too loose.** An OSM aerialway element within 700 m of the summit counted as "this mountain's lift". Every true summit lift in the wire sits within 219 m. From about 300 m out the station is a shoulder or a terrace well below the top: Teide 550 m, Titlis 592 m, Hafelekar 488 m. 2.

Broke: The first dry run demoted Lomnický štít, Ulriken, Harder Kulm, Ljubljana Castle Hill and Montjuïc / OSM measured their station 279 to 680 m from the summit node / `LIFT_TOP_CONFIRMED` by Wikidata id

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T454-mountain-lifts.md"`

### T455: What a cycling card may claim (2026-10-15)

The T451 fact check found four ways the cycling layer said more than it knew (row T451-e). The owner asked for the pipeline fix. A read-only investigation traced all four to one cause: the unit of data is one OSM relation, and every long named route is stored as several relations that are never joined. The rebuild needs the trailslab database and the harvest caches, and neither is on this machine (row T297-a). So the rules live in one new module, `pipeline/cycling/wire_truth.py`, used twice: - `export_cycling.py` calls it at the next rebuild; - `repair_cycling_wire.py` applies it to the published wire now. **1.

Broke: A second run would have unmarked stretches / The repair cleans the very words ("[Abschnitt E]") that mark them / A mark once set stays; "A stretch of a longer route, A national signed route" / Two sentences joined with a comma / A stretch row shows the stretch label alone.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T455-cycling-truth.md"`

### T456: Places said from our own spine (2026-10-15)

The T451 fact check found place lines that were wrong (row T451-c). The owner asked for the pipeline fix. A read-only investigation traced each error to its source: - **Lake and beach regions.** The `region` was the first Wikidata P131 label of the item, whichever SPARQL returned first. A lake on a border was published once per country with the same label, so the Swiss and German copies of Lake Constance said "Vorarlberg". The label came in English or in the local script ("Άγιος Βασίλειος Κορινθίας" for a Cretan beach). - **The lakes harvest.** It let in sea bays, rias, estuaries, beaches and about thirty car parks.

Broke: 1,916 GB and IE walks looked like "elsewhere" / UK rows carry ITL codes (TL...), outside NUTS 2021 / TL read as GB. Northern Ireland walks filed under Ireland then moved to GB (56); the others are correct where they are.; verify_lakes: the index no longer matched the country files / 95 rows dropped, index counts and photo tally unchanged / The repa...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T456-place-truth.md"`

### T457: Destinations lined up with Explore (2026-10-16)

The owner looked at Explore and Destinations side by side on 2026-10-16 and asked for four things: 1. Destinations' sections should sit as close to the filter pane as Explore's "Explore Europe", "Top rated in Europe" and "Hiking bases" do. 2. The two left filter panes must be aligned; the example was that Destinations' "All countries" had no flags where Explore's country filter has one a country. 3. Trips, Trails, Beaches, Lakes, Mountains and Cycling needed a more professional switch than the small tab row, "like Explore's tabs". 4. "Browse the full list" should show three columns like Explore's "All places" and get a smarter placement than the bottom of the page.

Broke: Choosing "All countries" closed the new country fold and dropped keyboard focus to the page / The fold's `open` was a controlled attribute, re-applied from the selection / The code never closes the fold; a country that arrives from a link or the track opens it once and scrolls the row into view, in the list and in the panel; The panel's new h3 head...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T457-destinations-align.md"`

### T458: trip planner, second pass after the owner's walk (2026-10-16)

The trip planner T432 rebuilt now does what the owner found missing on a walk through it, and the gaps T432 left open are closed. The party is three groups (adults 12 and over, children 3 to 11, babies under 3) and the price follows it: a child counts half on beds, meals and train and bus fares, a baby travels free, and a car is still priced per car with every seat counted. Where the trip leaves from is one card with the near airports as choice chips, asked on Getting there (or after Booked when travel is held), so the flow is Booked, Who, When, Where, Trips, Getting there, Review.

Broke: shoot-planners timed out on the new step order / The script still clicked through a From step / From block removed; Who is step 2; The consistency walk found no party stepper / `.wiz-party-row` became PartyEditor's `.party-row` / Selector updated; Airport pins were 42 px wide / The plain pin took its tag's width / `min-width: var(--tap)` on tagged...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T458-trip-planner-2.md"`

### T459 critique, after (2026-10-16) (2026-10-16)

Method: dual-agent (A: design review in this context, B: detector agent). B's report landed while A's notes were being finished, so independence is partial; every A finding below was taken from the shots before B was read. Code: continent-app working tree on p11-day-planner-2. Shots: `../T459-shots/after/` (en and de flows, 4 widths, Ghent to Bruges 2-day walk), against `../T459-shots/before/`, `../T432-shots/flow-after-03-when-desktop.png` and `before.md` (27/40).

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T459-critique/after.md"`

### T459 critique, before (2026-10-16) (2026-10-16)

Method: dual-agent (A: design review in this context, B: detector agent; the final CLI result below was rerun here after A was written). Code read from app master; shots in `../T459-shots/before/` (28 frames, 4 widths) and `../T433-shots/after/`, against the trip planner in `../T432-shots/` and `../T458-shots/stays-laptop.png`.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T459-critique/before.md"`

### T459: Day planner, second pass (2026-10-16)

The owner walked T433's day planner and asked for three things: the frame finished to the trip planner's standard, Build it myself made calm and clear about where the day is spent, and every caption earning its place. The day planner now carries the trip planner's whole frame. The visible changes, step by step: **The recap.** The picked-so-far pill ("Rome, Fri 16 Oct to Sun 18 Oct, Change") is gone. In its place is the trip planner's "Planning around" recap, which is a kit piece now (`components/ui/Recap.jsx`, the trip wizard's own markup and classes). - Every answer is a chip that goes back to its own step: the start, the days, the ideas.

Broke: The day steps' titles were smaller and spaced differently from the trip planner's / T433 put each h1 inside `.dayw-step`, and the trip wizard's rules target `.guide-canvas > .guide-title`; `.day-wizard .guide-title { margin: 0 }` also flattened it / Title rendered by the shell straight in the canvas; the override removed; "Where" offered Ghent and...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T459-day-planner-2.md"`

### T460 critique, after (2026-10-16) (2026-10-16)

Method: dual-agent, as before (`assessment-a-after.md`; `assessment-b-after.md` and `audit-after.md`). Frames and measurements: `../T460-shots/after/` (built preview, guest, free and Trip Pass holder, 360, 390, 820 and 1440 px, English and German). | | Before | After | |---|---|---| | Critique (Nielsen, /40) | 22 | 26 | | Audit (/20) | 10 | 15 | | Audit issues P0, P1, P2, P3 | 0, 5, 8, 3 | 1, 3, 5, 6 | The panel is one decision on one phone screen (717 of 844 px), with about 106 words, one primary that names the amount, and two lines of small print.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T460-critique/after.md"`

### T460 Assessment A (design review): the pass panel, AFTER

Surface: the rebuilt pass panel (`PassModal.jsx`, `71-pass.css`) and its doors and side effects: `usePaywall.jsx` (quota gates now open the panel for payers, a guest's pick survives sign-in), `useEntitlement.js` (subscription state), `AnnouncementBar.jsx`, `AppHeader.jsx`, the pass sections of `TermsOfService.jsx`, the `pass.*` strings in `en.js` (German checked in the `-de` shots), `pricing.js`, and the Stripe side (`checkout`, `stripe-webhook`, `billing`, `_shared/passes.mjs` `waiverText`). Mode: Persuade.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T460-critique/assessment-a-after.md"`

### T460 Assessment A (design review): the pass panel, BEFORE

Surface: the pass picker (`PassModal.jsx`) and its doors: the header "Get a pass", the Account pass card, the expiry banner, and every gate and offer that calls `usePaywall`. Mode: Persuade (a selling surface, so conversion is weighed alongside usability). Read from app commit `9e7ab0d` so the working tree could move underneath. Screenshots: `Execution/P11/T460-shots/before/before-pass-{guest,free}-{p360,phone,ipad,desk}.jpg` and `measure-before.json`. The impeccable detector was not run or read. Sources that win: PRODUCT.md, DESIGN.md, `.claude/skills/carta-design/SKILL.md`.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T460-critique/assessment-a-before.md"`

### T460 critique, Assessment B (after): detector and evidence (2026-10-16)

Surface: the rebuilt pass panel. `continent-app/src/components/PassModal.jsx` (211 lines), its own stylesheet `src/styles/71-pass.css` (155 lines, loaded with the lazy panel), the door `src/hooks/usePaywall.jsx`, `src/hooks/useEntitlement.js`, `src/components/AnnouncementBar.jsx` (`PassExpiryBanner`), `src/components/AppHeader.jsx`, `src/lib/pricing.js`, `src/lib/billing.js`; server `supabase/functions/{checkout,stripe-webhook,billing}/index.ts`, `supabase/functions/_shared/passes.mjs`, `supabase/migrations/053_pass_subscriptions.sql` and its throwaway test.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T460-critique/assessment-b-after.md"`

### T460 critique, Assessment B (before): detector and evidence (2026-10-16)

Surface: the pass panel (the paywall). `continent-app/src/components/PassModal.jsx`, mounted only by `src/hooks/usePaywall.jsx`, with its tiers from `src/lib/pricing.js`, the expiry banner in `src/components/AnnouncementBar.jsx`, and its CSS in `src/styles/21-chat-passes.css` (pass block, lines 302 to 462 and 778 to 837) and `src/styles/69-v6-account.css` (pass rules at 133 to 155, 248 to 320, 428 to 434, 490 to 514).

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T460-critique/assessment-b-before.md"`

### T460 audit (after): the pass panel (2026-10-16)

Impeccable `audit`, run 2026-10-16 on the working tree (app repo uncommitted on top of `9e7ab0d`), so it compares like with like against `audit-before.md` (10/20). Scope: `src/components/PassModal.jsx`, `src/styles/71-pass.css`, `src/hooks/usePaywall.jsx` and its call sites, `src/hooks/useEntitlement.js`, `src/components/AnnouncementBar.jsx`, `src/components/AppHeader.jsx`, `src/lib/pricing.js`, `src/lib/billing.js`, and the server: `supabase/functions/{checkout,stripe-webhook,billing}/index.ts`, `supabase/functions/_shared/passes.mjs`, `supabase/migrations/053_pass_subscriptions.sql`.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T460-critique/audit-after.md"`

### T460 audit (before): the pass panel (2026-10-16)

Impeccable `audit`, run 2026-10-16 on the app repo at `9e7ab0d`, against copies materialised from git (the working tree was being edited by another session). Scope: `src/components/PassModal.jsx`, `src/hooks/usePaywall.jsx` and its call sites, `src/lib/pricing.js`, `src/components/AnnouncementBar.jsx` (`PassExpiryBanner`), `src/styles/21-chat-passes.css`, `src/styles/69-v6-account.css`, and the inherited `.day-saved-*`, `.ai-plan-*`, `.guide-next` and `.auth-link` rules. The evidence is in `assessment-b-before.md` beside this file; line numbers are `9e7ab0d` line numbers.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T460-critique/audit-before.md"`

### T460 critique, before (2026-10-16) (2026-10-16)

Method: dual-agent. Assessment A (`assessment-a-before.md`) and Assessment B with the impeccable audit (`assessment-b-before.md`, `audit-before.md`) ran isolated, on the files as they stood at app commit 9e7ab0d. Frames: `../T460-shots/before/`. | # | Heuristic | Score | Key issue | |---|---|---|---| | 1 | Visibility of system status | 2 | A guest's Free card says "Your current plan"; a paying user's "See passes" opens nothing | | 2 | Match with the real world | 2 | Internal names; the Trip Pass promised "to the day you fly" in 30 days | | 3 | User control and freedom | 3 | A guest's choice wa...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T460-critique/before.md"`

### T460: Pass and billing, the yearly plan and the 60-day Trip Pass (2026-10-16)

The owner asked four things about the pass: - whether it is used in the right places; - whether it converts; - whether the panel is too wordy; - whether a 30-day one-off pass is right when people want something recurring. They chose from the market research: - The Year Pass becomes a **yearly plan that renews until cancelled**, at EUR 14.99. Wanderlog, Roadtrippers and Komoot all sell by the year. - The Trip Pass stays a one-off payment and now runs **60 days**, because a trip is planned over about six weeks and the pass should still be live on the trip. **The panel.** It is rebuilt as one decision. The critique scored the old one 22/40 and the audit 10/20.

Broke: 053's 60-day check failed at first / Adding 60 calendar days across the end of summer time is 60 days and an hour / The test allows an hour; The guest and German shoot scenes timed out / The panel is now a lazy chunk, slow to load on the busy dev server, and the shoot's selectors were English only / A focused measurement on the built preview (`meas...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T460-pass-billing.md"`

### T461: Account, help and the legal pages (2026-10-16)

Account is now a settings page a traveller can read at a glance, with the yearly plan's controls where the law and the terms say they are. **Your plan.** The hub's pass card became "Your plan" (`auth/account/PlanSection.jsx`): - the tier and its balance; - for a yearly subscriber, "Renews {date}", "Manage payment" (Stripe's billing page) and a plainly labelled "Cancel yearly plan". It confirms in place, in one sentence that names the end date, with the safe choice focused. It then says "Cancelled. Your yearly plan runs until {date}." and offers "Keep my yearly plan". This is the online cancellation that BGB 312k, the terms and the Stripe checkbox all point at (row T460-e).

Broke: verify_friends stopped at its second step / it clicked `.header-friends-btn`, removed by T426 / Friends is opened through Account (closes T434-h); Further down, verify_friends failed on the share panel and the Passes check / the harness had never reached them since T426 and T434; the picker is a kit select, visibility a Segmented, the pass door `.s...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T461-account-help.md"`

### T461 critique, after: Account, help and legal pages

The same two isolated reviews ran on the working tree before the fix batch: `assessment-a-after.md` (design review) and `assessment-b-after.md` with `audit-after.md` (detector, browser evidence, audit). This file records the scores, then the one fix batch that followed, as impeccable's bounded loop asks. No third round was run.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T461-critique/after.md"`

### T461 Assessment A (design review): Account area, AFTER (2026-10-16)

Reviewer: Assessment A, design review only (the detector was not run or read). Source: the uncommitted working tree on `p11-account` (app repo), read on 2026-10-16: `AccountPanel.jsx`, `account/FaqView.jsx`, `FeedbackView.jsx`, `PlanSection.jsx`, `LegalDoc.jsx`, `PrivacyPolicy.jsx`, `TermsOfService.jsx`, `Imprint.jsx`, `AuthModal.jsx`, `AuthGate.jsx`, `69-v6-account.css` (the T461 block from line 437), the `account.*`, `auth.*` and `gate.*` keys in `en.js`, `lib/contact.js`, `lib/billing.js`, `supabase/functions/billing/index.ts`. Screens: `Execution/P11/T461-shots/after/`.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T461-critique/assessment-a-after.md"`

### T461 Assessment A (design review): Account area, BEFORE (2026-10-16)

Reviewer: Assessment A, design review only (the detector was not run or read). Source: app repo at commit `09f27e5` (Merge p11-pass, T460): `src/auth/AccountPanel.jsx`, `FriendsSpoke.jsx`, `AuthModal.jsx`, `AuthGate.jsx`, `src/components/PrivacyPolicy.jsx`, `TermsOfService.jsx`, `Imprint.jsx`, `src/lib/feedback.js`, `src/lib/billing.js`, `src/lib/pricing.js`, styles `16-auth.css`, `22-account-admin.css` (1 to 272), `69-v6-account.css`, `25-feature-pages.css` (1 to 120), the `account.*`, `auth.*`, `gate.*` strings in `src/i18n/en.js`.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T461-critique/assessment-a-before.md"`

### T461 critique, Assessment B (after): detector and evidence (2026-10-16)

Surface: the rebuilt Account area in the app working tree on branch `p11-account` (uncommitted, on top of `09f27e5`). Files: `src/auth/AccountPanel.jsx`, `src/auth/account/FaqView.jsx`, `FeedbackView.jsx`, `PlanSection.jsx`, `src/components/LegalDoc.jsx`, `PrivacyPolicy.jsx`, `TermsOfService.jsx`, `Imprint.jsx`, `src/auth/AuthModal.jsx`, `AuthGate.jsx`, the T461 section at the end of `src/styles/69-v6-account.css` (line 437 on).

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T461-critique/assessment-b-after.md"`

### T461 critique, Assessment B (before): detector and evidence (2026-10-16)

Surface: the Account area. `continent-app/src/auth/AccountPanel.jsx`, `FriendsSpoke.jsx`, `AuthModal.jsx`, `AuthGate.jsx`; `src/components/PrivacyPolicy.jsx`, `TermsOfService.jsx`, `Imprint.jsx`; `src/lib/feedback.js`; CSS `src/styles/16-auth.css`, `22-account-admin.css`, `69-v6-account.css`. Baseline: app commit `09f27e5` (Merge p11-pass, T460). Run 2026-10-16, about 22:20 to 22:50. Evidence only; the scoring is in `audit-before.md`. Another session was rebuilding the Account area while this ran.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T461-critique/assessment-b-before.md"`

### T461 Account: technical audit, after the rebuild (2026-10-16)

I ran this audit on 2026-10-16 against the uncommitted working tree on `p11-account` (on top of `09f27e5`), following `impeccable/reference/audit.md`. It was read only: no project file was edited. The evidence, the method and the detector run are in `assessment-b-after.md`. **Pinning.** The browser facts come from the built `dist/` of 22:54, served on port 4297. Port 4191 answered 404. Another session edited PlanSection, Imprint, Terms, the CSS and the i18n files at 23:06, and the code findings cite those files as they stood at 23:12.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T461-critique/audit-after.md"`

### T461 Account: technical audit, before the rebuild (2026-10-16)

I ran this audit on 2026-10-16 against app commit `09f27e5` (Merge p11-pass, T460), following `impeccable/reference/audit.md`. It was read only: no source was edited. **How the before state was pinned.** Another session was rebuilding the Account area in the working tree at the same time, so the working tree could not stand in for the baseline. All code was read from `git show 09f27e5`. The browser checks ran on a scratch Vite server built from the 09f27e5 source (port 4291, the live `public/` and `.env`).

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T461-critique/audit-before.md"`

### T461 critique, before: Account, help and legal pages

Baseline: app commit 09f27e5 (T460 merged), read from git, not the working tree. Two isolated reviews ran as impeccable's critique asks: assessment A, a design review from the source and the before frames in `../T461-shots/before/`; and assessment B, the detector plus browser evidence, with the technical audit. Their full files sit next to this one: `assessment-a-before.md`, `assessment-b-before.md` and `audit-before.md`.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T461-critique/before.md"`

### T462 critique: the home page AFTER the rebuild, reviewer A

Method: independent reviewer A, Assessment A only (design review), Persuade mode (a home page for first-time visitors), per `impeccable/reference/critique.md`. No detector output was read before this was written. No project file was edited. Target: `continent-app/src/browse/home/HomePage.jsx`, `HomeDemo.jsx`, `useDemoClock.js`, `src/lib/homeDemo.js`, `src/styles/61-v6-home.css`, `home.*` in `src/i18n/en.js` (and the same keys in de, es, fr, it, nl).

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T462-critique/after-a.md"`

### T462 critique: the home page AFTER the rebuild, reviewer B (technical)

Method: independent technical review of the rebuilt home page. No project file was edited. Sources read in full: `continent-app/src/browse/home/HomePage.jsx`, `HomeDemo.jsx`, `useDemoClock.js`, `src/lib/homeDemo.js`, `src/styles/61-v6-home.css`, the `home.*` keys in all six catalogs, and the T462 diffs of `App.jsx`, `ExploreTab.jsx`, `GuidedSearch.jsx` and `styles.css`. Live checks ran with Playwright (Chromium, from `continent-app/package.json`) against the dev server at http://localhost:5202/ with fresh storage, so the first visit opens the home page.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T462-critique/after-b.md"`

### T462 critique: confirming round after the fix batch

Method: one confirming reviewer, after `after-a.md` (design review, 28/40) and `after-b.md` (technical audit, 16/20), per `impeccable/reference/critique.md` and `audit.md`, against PRODUCT.md, DESIGN.md ("Home page exception (T462)") and the carta-design skill. No project file was edited. Persuade mode; all ten heuristics scored (none n/a), so the maximum is 40. Evidence: - Final shots in `Execution/P11/T462-shots/after/` (full pages and folds at 360, 390, 768, 1024 and 1440 en, de 360 and 1440, scenes 1 to 4 at 1440 and 390, `probe.json`).

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T462-critique/after-confirm.md"`

### T462 critique: the home page BEFORE the rebuild (2026-10-13)

Method: single reviewer, Persuade mode (a home page for first-time visitors). Assessment A (design review) was written from the source, the screenshots and two full-page captures before the detector output was read; Assessment B (detector, live URL scans, browser probe) was run afterwards and is reported separately. No project file was edited. Target: `continent-app/src/browse/LandingPage.jsx`, styled by `continent-app/src/styles/39-landing.css` and `continent-app/src/styles/61-v6-landing.css` (the receipt card itself is `ReceiptCard.jsx`, styled in `38-first-run.css`, out of scope here).

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T462-critique/before.md"`

### T462: The home page, rebuilt (plan any trip, with honest prices) (2026-10-17)

The home page a first visit opens on (and the Carta brand mark leads to) is no longer the T209 landing receipt, a hiker's price instrument with 22 catalogue counts, no photos and one of the app's nine capabilities on show. It is now a front page that says what Carta is for and then shows it. The first screen carries the promise ("Plan any trip in Europe, with honest prices"), one sentence under it, the real guided search one tap away, three questions that return places today (walking first), the one primary ("Plan a trip"), and a live demo built in code from the app's own parts and the catalogue's own figures: a search for lakes in the Alps in July, Lake Bled opened as Explore shows it, a th...

Broke: Picking a demo scene from its tab showed a blank scene / the pause froze the scene's entrance animation at frame zero / two kinds of stop: Pause, off screen, hidden tab and a page over it freeze the motion; hover, focus and a picked tab only stop the turning; Play did not restart the demo / the pointer and focus that pressed Play stayed on it and c...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T462-home-page.md"`

### T463: The home page, told in the app's own screens (2026-10-17)

The owner reviewed the T462 home page and did not like it. In their words: the "demo video" (a looping panel coded to look like the app) was not professional, "Pick what the trip is for" was unclear, the photos were weak, the feature rows were walls of text, and the pricing did not look like the rest of the app. They asked for a story a visitor scrolls through, the real app, personas, sliders instead of text, and a page that is clean on desktop and on an iPhone. They also asked for market research and the full impeccable workflow. A research agent studied about twenty landing pages, among them Polarsteps, Wanderlog, Komoot, Airbnb's release pages, Tricount, Revolut, Linear and Notion.

Broke: The dev server answered nothing for minutes / Two Vite servers left over from 2026-10-16 (ports 4250 and 4260) were each spinning a core / Stopped them and restarted one server on 5203; The phone page scrolled 425 px sideways / The story column was a grid item with the default minimum width, so it grew to the full width of its chapter track / `.hom...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T463-home-page-2.md"`

### T464: The home page, phone first (2026-10-17)

The owner liked T463's home page on a desktop. On a phone they found it too long ("I have to scroll too much"), not dynamic or professional enough, and wasteful with the width. On a desktop they found the screens in the hero too small to read, so the value was unclear. They also called several subcaptions generic and three persona photos weak (Without a car, City breaks, On a tight budget). They asked for market research, the impeccable workflow and an easier way back to the home page than the Carta mark.

Broke: The desktop page scrolled sideways (verify_home hscroll) / The bleeding laptop widened the scroll container / `.home-page` is a size container, and the hero reaches its right edge in `cqw` and clips there with `overflow-x: clip`; The pinned phone was pushed up at the last chapter (verify_home pinned) / The shorter chapter padding left less scroll u...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T464-home-page-3.md"`

### T465: The plan chooser, two tiles (2026-10-17)

On a phone the bottom nav's plus opens the choice between the Trip planner and the Day planner. It was two rows, each an icon, the planner's name and a grey sub line ("Route, stops and ground costs", "Hour by hour in one city"). The owner asked for the sub lines to go and for a more modern, professional way to choose between the trip and the day. Market research (the T464 research agent) looked at how leading apps present a choice made from a plus button: - **Wanderlog** has an orange plus in its bottom bar offering "Trip plan", "Trip story" and "Guide". - **Google Maps Contribute** offers "Add place", "Edit map", "Write review" and "Add photo".

Broke: The design lint reported one new money-literal / A T464 code comment in src/lib/homeDemo.js quoted a price with a euro sign / The comment writes the figure out in words; scripts/verify_focus_trap.mjs failed before reaching the chooser / It serves the built dist with vite preview, and the dist predates this work; it timed out waiting for the destina...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T465-plan-chooser.md"`

### T466: Friends, on the kit and across the app (2026-10-17)

The owner asked for the Friends area (invites, milestones, a friend's trips) to be optimised, modernised and cleaned up, to line up with the rest of the app, and to show up in other sections where it makes sense. On 2026-10-17 they chose where: - on destination pages - on My trips cards - behind one Friends door Market research (the T464 research agent) looked at how Polarsteps, Strava, Komoot, Wanderlog and Been present friends: - a follow request with an accept gate - a secret link that works without an account - an invite button that opens the messaging apps - avatar stacks beside a trip's dates (Wanderlog's "+4") - friend comparisons and quiet milestones - a feed of friends' trips that l...

Broke: The design lint called three new raw buttons (the destination line, its trip rows, the My trips line) / New code may not add a raw `<button>` outside the kit / All three are kit Buttons (quiet or secondary, block) with a row layout on `.btn.<class> .btn-label`; The destination line drew centred and brown / A scripted CSS replace matched inside text...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T466-friends-2.md"`

### T467: My trips, the Visited figures (2026-10-17)

The owner found the figures band on My trips' Visited tab ("Countries, Cities, Trips, Nights away") not optimised and not how they want it. It was four equal cells with a label over a number. At 360 px the four cells were about 80 px each, and the longest labels (German "Nächte unterwegs", French "Nuits en voyage") had no room. Market research (the T464 research agent) looked at how travel-stats apps show a traveller's own figures: - **Been** leads with a hero pair: "20 Countries" beside a ring with "10% World". - **Visited** shows goal rings. - **Polarsteps** puts story stats beside the counts.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T467-mytrips-record.md"`

### T468: Roadmap 1.9, the phone problems (2026-10-17)

Roadmap 1.9 lists the phone problems the owner sees: - primary buttons under the bottom bar - buttons cut off at 380 px - the wizard taking 48% of a Pixel 5 Its done condition is that no primary button is hidden on an iPhone 13 or a Pixel 5. Thirteen register rows carried pieces of it (T411-h, T413-c, T410-h, T389-i, T409-g, T411-c, T372-b, T386-d, T406-d, T402-d, T373-i, and the owner questions T432-g and T433-i). No harness in the repo measured a Pixel 5 or the iPhone 13's visible viewport outside the home page. A new harness, `scripts/verify_phone_chrome.mjs`, walks every main phone screen at three sizes.

Broke: The harness reported the destination page and the pass dialog as hiding their primaries / It read the bar's position even where a full-screen page or a sheet covers the bar / The bar counts only where elementFromPoint finds it on top; The harness reported the page's primary behind the Report a problem sheet / It checked every primary on the page /...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T468-phone-fixes.md"`

### T469: seasonal truth, audited and written into the roadmap (2026-10-20)

The owner brought five ideas: environmental context on the cards, a rating that varies by month, a price that follows the chosen dates, a 12-month price and weather strip with a one-tap nudge, and sunset and rain guardrails in the day planner backed by a trustworthy forecast. This task audited the code and data behind each idea and checked the external facts. It wrote the systems out in a new plan file, `Roadmap/2.10-seizoen-rating-prijs.md` (Dutch, like the roadmap), and added eleven rows to `Roadmap/Carta roadmap.md`: 1.10 and 1.11 in phase 1, 2.10 to 2.13 in phase 2, 3.9 in phase 3, and 4.9 to 4.12 in phase 4. It also updated the week plan and pointed 4.4 at the new season record.

Broke: The owner's example nudge said "+6 hours of daylight in May or September" for Edinburgh / Hand-written figure; the real gain is +7.8 h (May) and +4.5 h (September) on 8.4 h on 14 November, sunset 16:09 / The plan requires every number in a nudge or reason to be computed from the season record

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T469-seasonal-truth-roadmap.md"`

### T470: owner calls on the T469 season plan applied (2026-10-20)

The owner answered the five T469 calls on 2026-10-20. The answers are now written into `Roadmap/2.10-seizoen-rating-prijs.md` (its decision table became "Besluiten") and into `Roadmap/Carta roadmap.md` (rows 1.10, 2.10, 2.12, 2.13 and 4.9, the phase 2 decision line, and weeks W48 and W50). The forecast moves to MET Norway, and Open-Meteo leaves the app. Hotel prices must be "really cheap and if possible real". That means free sources only: LiteAPI's two free endpoints with a production key, plus the free Hostelworld partner programme. The paid `/pricing/index` is dropped, so a sweep costs €0. With a month chosen, a card shows the month score and the reason.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T470-seasonal-owner-calls.md"`

### T471: cost and logistics, audited and written into the roadmap (2026-10-20)

The owner brought eight ideas: 1. a cheaper alternative (a "dupe") wherever a destination is proposed 2. a Lifestyle model in which every setting moves the price on a written basis 3. "Sleep nearby and save" for expensive cities 4. cost plus logistics as Carta's differentiator, carried across the app and its docs 5. a day planner that starts from suggestions and asks about pace, walking and children 6. an own engine for car, train and bus costs when there is no partner 7. Carta as the planning and budgeting brain on top of Google Maps 8.

Broke: T470 closed three open Stripe owner rows and reworded the register header / A blanket text replacement of "open" in `_OPEN.md` / Restored in this commit; T469-a to e marked closed by T470 as T470 intended; The idea's satellite example (Zermatt to a cheaper town within 30 km) / Straight-line radius; Cervinia is 15 km away but hours by road / The pla...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T471-cost-logistics-roadmap.md"`

### T472: navigation, pass and price display, audited and written into the roadmap (2026-10-20)

The owner brought three things: a mission statement to reuse wherever Carta explains itself, a paragraph on how travellers decide, and an external UX audit of carta-europetravel.com with eighteen pain points. The audit's points are the navigation, the pass, the fixed defaults, what the price includes, the price display, the planners, the phone, speed, offline and sharing. The mission now sits in PRODUCT.md under "Mission": the owner's Dutch text, an English rendering and a short form. The decision paragraph is the first section of a new `user_knowledge.md` at the repo root. The audit was checked against the code and against the live bundle of 20 October.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T472-nav-pass-price-roadmap.md"`

### T473: owner calls on the T472 navigation plan applied (2026-10-20)

The owner answered the three decisions T472 needed by W44, all as proposed. - **T472-a:** the navigation becomes three places plus an account icon. Explore takes Destinations in, and its categories become filters and rails. Plan holds the trip and its days as one workspace, and one day is a one-day trip. My trips is the third. Old links keep working. - **T472-b:** the pass keeps the name Trip Pass. No button ever says "Get a pass" on its own. - **T472-c:** the first trip saves on the device without an account. Sign-in comes only for a second device, co-editing or a second trip.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T473-owner-calls-t472.md"`

### T474: Roadmap 1.2 finished, the T435 rest list built (2026-10-21)

T435 left roadmap 1.2 (one design system) at "mostly done" with eight rows, T435-a to T435-h. This task builds all eight, each at its cause rather than at its symptom. The ninth row, T435-i, is the owner's call and stays open. **T435-a, the journey link.** A cold `#journey=<id>` link landed on the Trips list and never opened the week. The cause was a take-once handover. `lib/journeys.js` handed the id out once, and `JourneysSection` took it on mount. React's doubled effect in development, and any remount, lost the id, and the handover only worked if the list happened to be on screen.

Broke: The Lifestyle panel opened hidden behind the journey page / The lift rule over full-screen pages covered `.destp` only / `body:has(.destp, .tpage)`; The first route split left five route rules overridable / A file whose route part fell under 1 KB stayed whole, but its rules had counted as moved while the safety pass ran / The split now settles agai...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T474-design-system-finish.md"`

### T475: total budget, transit, day planner and group choice, audited and written into the roadmap (2026-10-20)

The owner brought five ideas: search by a total trip budget instead of a day price, explain why a place is cheap or expensive, show time and cost between the stops of a multi-city trip, make the day planner executable (stay relative to sights, walking, opening days, live effect on the trip total, comparable options), and a native compare-and-vote card for a travel group. This task audited the code and data behind each idea, researched transit partners, search architecture and share cards on the web, and wrote the systems out in a new plan file, `Roadmap/2.22-budget-vervoer-dag-delen.md` (Dutch, like the roadmap).

Broke: The main worktree was on T469's unmerged branch and shared with another session / T469 committed on p11-seasonal-truth and did not switch back / Worked in a sparse worktree at ../wt/t470 branched from fc1ea0a68, so T475 stacks on T469 without touching the shared checkout; `git sparse-checkout set '/Roadmap/'` wrote `C:/Program Files/Git/Roadmap/` /...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T475-budget-transit-share-roadmap.md"`

### T476: owner calls on T475 recorded (2026-10-20)

The owner answered three of T475's five calls on 20 October, and this task wrote them into the plan file, the roadmap and the register. - **T475-b, guests may create a vote.** The owner wrote "guests can vote". Voting without an account was already in the plan, so this is read as guests may also create a vote. The plan now gives a guest creator a separate manage link with its own secret code, kept on the device, to close or revoke the vote. It also adds abuse limits: a cap per device and per IP (for example five votes a day), 30 days validity by default, and no extension for guest votes.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T476-owner-calls-t475.md"`

### T477: the parallel T470 and T471 renumbered to T475 and T476 and merged (2026-10-21)

Two sessions both wrote a T470 and a T471 on 20 October. Main carries the season owner calls (T470) and the cost and logistics audit (T471). Branch `p11-owner-calls-t470` (worktree `wt/t470`, cut from T469 at `fc1ea0a68`) carries a different T470, the total budget, transit, day planner and group vote audit, and a T471 that records the owner calls on it. That branch was never merged, because it would have doubled two report numbers and ten register IDs. It also reused roadmap numbers that main had already taken: its plan file was `Roadmap/2.14-...` next to main's `2.14-kosten-en-logistiek.md`, and its twelve new roadmap rows sat on numbers main had filled with different content.

Broke: A week plan item landed inside "(delen zonder account; besluit T472-d vooraf)" in W13 / The focus cell was split on the first "; ", which sat inside parentheses / Split only on a "; " at parenthesis depth zero

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T477-renumber-t470-branch.md"`

### T478 to T482: the four T474 follow-ups, and batch mode (2026-10-21)

T478: A region (coast, range or NUTS-2 region) is now a favourite kind. Its page bar shows the same save button as a destination. A saved region resolves through `loadRegion`, appears in My trips with the other saved items, and opens its region page from there.

T479: `src/lib/supabaseClient.js` no longer imports supabase-js at the top. `getSupabase()` loads it once and returns the one client as a shared promise (null when accounts are off; a failed chunk load is retried on the next call).

T480: A build-only Vite plugin, `scripts/i18n/enSplit.mjs`, cuts `src/i18n/en.js` into two virtual modules, so `en.js` stays the one file translators edit.

T481: The first pass scoped wildcard child rules to the children the JSX renders, using `:where()` so specificity stays the same (a new `pcard-part` class on the Destinations card hook spans).

T482: The owner asked to spend fewer tokens and run faster without doing shallower work. CLAUDE.md now has a "Batches" section. Several tasks in one prompt share one batch branch, each still as its own commit.

Broke: T478 favorites.js turned LF in a CRLF file / A scripted edit wrote `\n` / Redone line-ending aware; T479 Uncommitted T479 and T480 edits swapped places mid-task / `refs/stash` is shared by every worktree; two agents stashed and popped at once / Both diffs saved as patches, compared byte for byte, each restored to its own tree; rule added to CLAUDE....

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T478-T482-t474-followups.md"`

### T483, T486, T487: forecast proxy, one price sentence, Google Maps day link (2026-10-21)

T483: The 7-day forecast no longer calls Open-Meteo from the browser (blocked by the live CSP, so it never showed in production, and non-commercial). A Pages Function, `functions/api/forecast.js`, fetches MET Norway's Locationforecast `complete` endpoint with an identifying User-Agent, rounds the point to a ~1 km cell, holds the upstream...

T486: The day figure is a bed plus food and drink (`computeCosts`: stay plus `groundSpendPerPerson`, which sums meals, drinks, coffee, nights out and groceries; no transport).

T487: `googleMapsDirParts(points, mode, maxStops)` in `lib/routing.js` cuts the day into Google Maps links that each end where the next begins, so walking the parts in order walks the whole day and no stop is ever dropped (the old single link sent up to 9 stops and silently thinned anything past that).

Broke: T483 MET's `compact` endpoint has no 6-hour max and min, so the first proxy run returned null highs and lows; switched to `complete`. A Python rewrite flattened CRLF in nine files; restored before commit, and the commits were rebuilt so every blob keeps the line endings HEAD had.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T483-T487-forecast-price-sentence-gmaps.md"`

### T484 to T494: design batch (roadmap 1.3, 1.3a to 1.3d, 1.4, 1.15) and the fixes it found (2026-10-21)

T484: `Roadmap/1.3-tabs-inventaris.md` now covers all ten tabs (shell, Home, Explore, Destinations, the destination page, outdoor pages, trip library and My trips, trip planner, day planner, account and pass).

T485: `Roadmap/1.3a-app-schil.md` sets the shell around the three places. The desktop header is 64 px: the logo (the way to Home), Explore, Plan, My trips, Explore's search slot and a 44 px account icon.

T488: `Roadmap/1.15-navigatie-ontwerp.md` decides the information architecture. - **Places.** The order is Explore (Destinations' six categories as tiles with a `cat=` filter), Plan, My trips, Account. Account is an icon on desktop and the fourth slot on phone.

T489: `Roadmap/1.3b-destinations.md` makes Destinations the browse and list side of Explore. - **Tiles.** Six category tiles: Places, Trails, Beaches, Lakes, Mountains and Cycling. They are a 3 by 2 grid on phone and two across in the desktop panel.

T490: `Roadmap/1.3c-tripplanner.md` keeps the T458 wizard order (Booked, From, Who, When, Where, Stay/Trips/Your stays, Getting there, Review) and puts it in the 1.17 workspace.

T491: `Roadmap/1.4-bestemmingspagina.md` replaces the six open sections and the sticky section rail with four tabs: Overview, Nearby, When to go and Practical. The tabs use the kit `Tabs`, stick under PageBar and change the URL without a history step.

T492: `Roadmap/1.3d-dagplanner.md` keeps the questions (Start, Days, Ideas, How, then the fork). A day opened from a trip starts at What. - **Builder.** It keeps Where then What, with search and List|Map on What's row and "Add to day" at 48 px.

T494: Four small defects the design agents found are fixed in the app, each one line or one rule: - **Bottom nav on a notched phone.** `--bottom-nav-h` now includes the home-indicator inset (`calc(86px + env(safe-area-inset-bottom, 0px))`).

Broke: T485 The agent found two shell defects. T494 fixed both: the bottom bar was too short on a notched phone, and the header tabs were under `--tap` on touch tablets. Dead `.header-pricing-btn` CSS and px font sizes are filed as T485-j and T485-l.; T488 T494 fixed one defect the agent found: `?tab=destinations` silently opened the map.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T484-T494-design-batch.md"`

### T493: T483 to T487 follow-ups, and the deploy (2026-10-21)

Three code follow-ups, one commit each in continent-app, then a production deploy of all of master. - **T487-a.** The trip planner's city-to-city Google Maps link (`TripItinerary.jsx`) and the day PDF's link (`dayPdf.js`) now use `googleMapsDirParts`, so neither thins a route past 9 stops nor sends a phone browser more than 3 stops a link. The trip link splits on a phone (narrow or coarse pointer) into "Part 1: Prague to Vienna" style buttons, one link on desktop. The PDF always uses phone-sized parts, since it is read on a phone, under "Open Day N in Google Maps".

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T493-t483-t487-followups-deploy.md"`

### T495: designs approved, roadmap brought up to date, decision sheet (2026-10-21)

The owner approved the seven designs of the T484 to T492 batch ("roadmap: akkoord", 21 October). The roadmap rows 1.3, 1.3a, 1.3b, 1.3c, 1.3d, 1.4 and 1.15 now read "Klaar, goedgekeurd 21 okt", each with its document and task. The "Begin hier" paragraph now gives the state on 21 October and what comes next: answer the detail questions, then 1.3e, 1.5, 1.17, 1.18 and 1.19, with 2.18 waiting on the T488 answers. A line under the owner decisions records the approval. The open detail questions from the designs (55 rows owned by the user, T484-a to T492-g) are collected in one private decision sheet, https://claude.ai/artifact/UeUtVU7C7zXPQT5NwYXCZU.

Broke: The root merge refused to switch branches / Merging the app branch rewrote five shared app files with CRLF, which the root repo saw as modified / `git diff --ignore-cr-at-eol` was empty, so the five files were checked out clean before the merge

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T495-designs-approved-roadmap.md"`

### T496 to T502: the approved designs built (shell, pass, Explore, destination page, trip and day planner) (2026-10-21)

T496: **Places and addresses** - The app has three places plus an account icon: Explore, Plan and My trips. - Home sits behind the logo on desktop, and behind "How Carta works" in Account on a phone.

T497: - **Gates:** - Every PDF asks for a Trip Pass, including item, journey and TripPriceCard PDFs (gate in `useItemPdf`). - Calendar and map exports have their own headings. - Sharing and co-planners are free; the share gates and their sheet are gone.

T498: **Explore and the trip library** - Explore has six category tiles (Places, Trails, Beaches, Lakes, Mountains, Cycling), 3 by 2 on a phone and two across in the desktop panel. Every switch writes `cat=`, and the picked country carries over.

T499: **Layout and tabs** - Above the tabs: the PageBar, the gallery and the head. The head reads "~€87 est. a person a day" and "A bed plus food and drink.".

T500: **Wizard** - Six steps: Booked and Who are one step. - From 1024 px the step takes the left 55%; the right column holds the price card, then the map. Picked countries are `--select-bg` with an ink edge.

T501: - **Detail control:** a quiet control with three levels: List (default), Parts of the day, By the hour. The choice is kept per traveller.

T502: - **Removed:** - dead CSS: `.trip-sheet*`, `.trip-mapcard*`, `.trip-mapfull*`, `.tf-chips`, `.tlib-bar`; - 130 unused keys in each language; - `FirstRunReceipt.jsx` (FlightSheet now lives in `components/FlightSheet.jsx`).

Broke: T496 Phone settings sentence cut to "2 ..." / "Prices for" hid only below 360 px / Hidden up to 440 px (T502); T496 Reset button showed a raw key / `settings.resetToCartaDates` never added / Uses `settings.useCartaDates` (T502); T496 Account sections at 28 px with a 16 px title, grey language tiles / Old panel padding and tokens / 16 px phone gutte...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T496-T502-build-batch.md"`

### T503 to T509: W45 batch (My trips and account, Explore map and list, positioning, budget search, follow-ups, retired fare text, owner calls) (2026-10-21)

T503: - Design doc `Roadmap/1.3e-mijn-trips-account-pass.md` (Dutch): now and keep, drop, new; phone and desktop sketches; states; eight owner questions. - My trips lists the trip saved on this device (T500-a), with "Saved on this device.

T504: - Design doc `Roadmap/1.5-explore-kaart-lijst.md` (Dutch), seven owner questions. - One component, `PlaceOverview`, draws a place in the list, docked at the foot of the desktop map and in the phone map drawer: photo, name with Score, region and country, one re...

T505: - The owner's sentence (T471-b): "Stop stitching trips together from five apps. Carta plans the whole trip in one place, with what each day costs." In `PRODUCT.md` (with the rule "Carta never navigates" under Product Principles, Google Maps and ViaMichelin in...

T506: - Design doc `Roadmap/1.19-budgetzoeken.md` (Dutch) with the worked example and nine owner questions. - Explore opens with "Search by total budget": "How much do you have?", a sentence for who, how long, when and how, Change for the fields, a buffer of 10% by...

T507: - T500-b numbered pins on the wizard's stops map, a tapped pin picks its Stays row (`7db0a60`, `f4ca008`, `c810d2a`). - T501-a a guest's parked chat answers live in localStorage for two hours and are deleted when read, expired or left (`7025ed3`).

T508: - 10 tips with flight-fare, airline or bag-rule claims removed from `cheapTips.json`. - 20 dead fare keys removed in six languages (among them `detail.ryanairRoundTrip`, `detail.viaNote` "Flight fares are real stored budget-airline prices"); the origin tooltip...

T509: - Register: 23 rows closed (by T503, T504, T505, T507 and T509); T471-d and T475-e marked postponed by the owner. - `docs/design-v6/DIRECTION.md` section 11: the four 1.8 choices (a person a day, the group total only in budget search and on the receipt; whole...

Broke: T503 - The desktop Account rail's numbers row is a link and took the body's line height (39 px against 36); `line-height: normal` on `.account-side a.side-navrow` (`6b98ced`). - css-routes: the Visited band's `.mt-band-hero dd .mt-band-edit` could override two item page heading rules; held in the first paint with `css-routes --hold` (`fc27344`).; T...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T503-T509-w45-batch.md"`

### T510: the old logo back, and the browser tab reads Carta (2026-10-21)

The owner asked for the old logo and for the app to be called Carta rather than the long name. They chose the 3 October (T212) mark: a cream tile with an ink compass and a rust north needle. They also chose to fix only the browser tab title. - Favicon, app icons and store icons (`brand/store/`) restored byte for byte from `06f9c69` (T212). T436 and T438 had made them white on teal, then white on brown. - In-app mark (`Logo.jsx`): north needle is rust `#e05a47` again, a fixed colour rather than `var(--action)`. Ring, inner ring and pivot keep their tokens. - `scripts/og/icons.mjs` now draws the icons in fixed T212 colours, so rerunning it keeps this look. - `index.html` `<title>`: "Carta".

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T510-old-logo.md"`

### T511 to T519: live flight prices (batch report) (2026-10-21)

T511: All old flight fare logic is gone from both repos. Root: the Ryanair, Wizz Air, Vueling and Volotea harvesters, Travelpayouts and ryanair_archive collectors, the fare model (snapshot, features, model, drift), the tp_stage, fares, fares_targeted, fare_history,...

T511: `pipeline/flights/build_routes.py` builds which flight routes exist in Europe from Eurostat's airport-pair tables (`avia_par_{cc}`, monthly commercial passenger departures, CC BY 4.0) and OurAirports (public domain): pairs with at least 4 departures in at leas...

T511: fli-js (MIT, Punit Arani, `punitarani/fli`, package 0.0.4) is vendored unchanged in `continent-app/workers/shared/fli/` and bundled to `fli.bundle.mjs` (778 KB) by `build-fli.mjs`, so the Worker, the Pages Function and node tests import plain JS.

T511: The Cloudflare Worker `flight-sweep` (`continent-app/workers/flight-sweep`) prices Europe's routes on its own. A cron every minute runs that minute's share (`plan.mjs`): near tier, the next 14 days every other day, each route every 12 hours; far tier, weeks 3...

T511: `continent-app/functions/api/flights.js` answers `/api/flights?o=&d=&date=` with every flight of that day, live from Google Flights, cheapest first, with the link.

T511: The sweep keeps every airline it sees (Google's name) and at each publish copies Google's 70 px logo for up to 25 new airlines into R2 `data/airlines/{code}.png`; `_index.json` maps every airline to its name and whether a logo exists.

T511: `continent-app/src/lib/flights/` prices the flight in every total. `flights.js` (pure): a swept day, the cheapest in a month, the nearest swept day within four days (the flight keeps and shows its own date), a return for the party, live beats swept, hours band...

T511: Every screen that prices a trip shows the flight, built with the impeccable skill (context read directly from PRODUCT.md, DESIGN.md and the app's surface brief because the launcher resolved the nested repo, then the craft floor and carta-design; its detector f...

T511: The copy and the docs say what is now true. Six languages: a `flight.*` block, `journey.incFlight`, and rewrites of `trip.flightNotPriced`, `itin.flightNotPriced`, `trip.legDisclaimer`, `journey.composedSub` and the FAQ answer on flight prices.

Broke: T511 Admin page still drew "Fare model drift gate" / Not caught by the removal list / Panel removed (commit e6b8b3c); T511 First test run wrote to a stray `C:\c\...` folder / Windows Python read the Git Bash path `/c/Users/...` as `C:\c\Users\...` / Reran with Windows paths; the stray folder could not be removed by the session (safety check) and is...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T511-T519-live-flights.md"`

### Food and drink prices for every destination: plan (T513 to T515) (2026-10-21)

**Branch:** `p11-food-costs` (root) and `p11-food-costs` (continent-app) **Base:** root main 802266c21 (T510), app master c135d9c **Written:** 2026-10-21 - Food and drink is already in every total. `groundSpendPerPerson()` in `lib/runtime_pricing.js` turns the lifestyle (dinners, lunches, quick bites, drinks, coffees, nights out and self-catered days) into euros. `priceTrip()` adds it as the `days` line of every trip total, and `computeCosts()` adds it to the euro-a-day figure on every card. The lifestyle already moves it. - The prices under it are weak.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T513-T515-food-prices-PLAN.md"`

### T513 to T515: food and drink prices for every destination (2026-10-21)

Batch report (CLAUDE.md "Batches"): one section per task, one browser check at the end. The plan this batch followed is `Execution/P11/T513-T515-food-prices-PLAN.md`. T513 (the food price layer, pipeline), T514 (food costs follow the Lifestyle everywhere, app), T515 (the Food and drink fold on the destination page, app). 2026-10-21 - Root: `p11-food-costs` from main 802266c21 (T510). Commits 3773fc4d0 and 07077c73f (T513), plus this report. - App (`continent-app`, its own repo): `p11-food-costs` from master c135d9c, in the worktree `C:\Users\Gebruiker\Documents\Portfolio\wt\T513-app`.

Broke: The worktree started from T011 (September) / The desktop app branched it from a stale `main` ref / New branch `p11-food-costs` from main 802266c21; no work was lost; Austria, Czechia and Denmark fell 15 to 25% in the first run / `fix_data.py`'s Vienna, Prague and Split prices live only in the app data, not in `cache/costs.json`, and Denmark and Fin...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T513-T515-food-prices.md"`

### T530 to T536: bed prices for every bed type and month, merged with live flights and food (2026-10-21)

T530: `pipeline/stays/xotelo.py` and `discover_xotelo.py` probe and harvest Xotelo; `spike.py` is the laptop runner for the scrape half. Findings: - **Xotelo** works with no key.

T531: **Harvesters:** - `harvest_iab.py` reads Inside Airbnb by destination footprint, converted with ECB rates. It gives the entire place for 2, 4, 6 and 8 sleepers, the private room, the shared room, and up to 8 neighbourhood medians.

T532: `.github/workflows/stays-refresh.yml`: - Every Monday: a Xotelo slice, capped at 5.5 h. - First Monday of the month: Eurostat, Inside Airbnb, calibration, then a gated build and a publish to `r2:carta/data/stays-live/v1/`.

T533: - Moved to `pipeline/archive/`: `harvest_accommodation.py`, `apply_accommodation_anchors.py`, `apply_longtail_granularity.py`, `harvest_hostelworld.py`, `harvest_hotels_liteapi.py`, `apply_stay_tiers.py`, `resume_cache.py`.

T534: - `src/lib/stayPrice.js` `bedPrice()` prices night by night: each night gets its month's measured price, the weekend factor and the peak factor. Rooms are sized to the party, and Airbnb fees apply only to an entire place.

T535: The Lifestyle panel and the planner show three kinds: Hostel, Home and Hotel. Under the chosen kind, the kit's Segmented control asks which bed, which home or which hotel (2 to 5 star).

T536: **Merge:** - Live flights and food are merged into this batch, in both repos. - The food branch lacked its licence rows (the Eurostat food tables, Open Food Facts Open Prices) and its two meta keys in the wire table. Both added.

Broke: T530 Six country ids wrong / Written from memory / Verified against the property URLs, corrected; T531 Overpass 502 for 20 countries / Server overload / Retry on 502 and 503; a second run completed 41 countries; T531 `database is locked` / A build read the journal while an orphaned bootstrap wrote it / WAL mode and a 60 s busy timeout; T531 Florenc...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T530-T536-stay-prices.md"`

### T537: cost sections, one clean line everywhere (2026-10-22)

The owner asked for every cost section to be "visually simple and clean with appropriate icons", and for "a super clean modern link to the actual flight". - **One breakdown line.** There used to be five ways to draw a label and a figure: the receipt card's `.frr-line`, the budget receipt's copy of it, the planner's `.plan-line`, the trip card's `.tprice-line` and the Explore hover's `.cost-row` with a five-step gauge. Each had its own label size and figure weight, and most had no icons. They are now one kit primitive, `CostRow` and `CostSum` in `src/components/ui/CostRow.jsx`.

Broke: - An earlier edit dropped TripPriceCard's `SLOT_KIND` (a no-undef error). Restored next to `LINE_KEY`. - The Python edits wrote LF into files stored as CRLF (and the reverse), which made a 40,000-line diff. Each file's line endings were restored from HEAD before the commit, giving a real diff of 481/616.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T537-cost-sections.md"`

### T538: the last cost figures on the shared line (2026-10-22)

The owner asked to finish the five price spots that T537 left behind. - **Itinerary, each stop.** The bed line is now the kit CostRow (bed icon, "Beds", the figure marked est. or "yours"). It sits beside the Find a place and booking-price actions. - **Itinerary, extras.** The rental car and vignette rows are now CostRow, with the car and route icons. - **Airport transfer picker.** Totals show as `~€… est.`. These are modelled prices, and before this they showed as a bare figure.

Broke: - The first CSS pruner joined a line onto the one before it wherever it dropped a rule. Restored from HEAD and re-ran a corrected pruner. The second run's diff adds only one changed selector line. - The edits changed line endings. Each file was restored to its line endings in HEAD before the commit.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T538-cost-figures-rest.md"`

### T539 to T540: a lean scrape, and live bed prices for the traveller's own nights (2026-10-22)

T539: - `scrape_booking.py` is lean by default: - 6 probe dates instead of 19: the January, March, May, August and October Tuesdays, plus one May Friday for the weekend factor. - A town OSM shows with nothing to book is skipped. A town missing from the supply file is still searched, because unknown is not the same as empty. - The hostel search runs only where OSM shows a hostel. - A star-class search runs only when OSM says the town has that class and the popularity page did not already show one.

T540: - **Keys per destination.** `pipeline/stays/live_keys.py` picks up to 6 Xotelo properties per destination from the 99,917 already discovered, using the same rule as the price anchors. These are the most reviewed hotel in each price quartile and the two most reviewed guesthouses. Each carries its typical night, the geometric mean of TripAdvisor's yearly low and high. - They go into the stays wire as `xk`: `[key, kind, stars, band, typ]`. - `build_stays` attaches them on every build.

Broke: T540 - **Prices too high.** The first version used the live prices as the price. Vienna's popular central hotels gave €258 a night for the cheapest quartile. Switched to the factor model, then added the damping. - **28-second first answer.** 3 nights × 6 keys at 4 calls a time took 28 s.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T539-T540-lean-scrape-live-stays.md"`

### T550 to T558: Ask Carta, a free RAG search on open models (2026-10-22)

T550: Ask Carta has a measurable definition of "understood". `tests/fixtures/ask-golden.json` holds 140 questions in six languages across seven question types (find, budget, when, about, compare, near, plan) with the Intent each must produce, scored on only the keys...

T551: The catalogue can be searched by meaning. `pipeline/ask_index_layer.py` turns ten sources (one adapter each in one registry: dest, highlight, sight, trail, journey, beach, lake, peak, country, lexicon) into 64,838 passages with a payload, embeds them with `min...

T552: Everyday words land on facets: "chill", "laid back", "rustig", "ruhiges" are quiet; "foodie", "mangiare", "tapas" are food; "gunstiger", "moins cher" are cheapest first; "Lissabon", "Oporto", "Nizza", "Krakau", "Salisburgo" are their places.

T553: `src/lib/ask/intent.js` reads a question into one typed Intent: the question type, Explore's own facets plus `warm`, a season as `monthRange`, and the trip around it: adults, children, family, days (nights + 1, weeks, long weekend), money as a total or a day b...

T554: `/api/ask` embeds the question with the T551 model and scores only the sources a question type needs, prefiltered on its country or places, and maps up to five unplaced words to lexicon facets (cosine at least 0.62).

T555: `src/lib/ask/rank.js` turns an Intent into answer facts with Explore's own predicates, so an answer never disagrees with the list it opens.

T556: A written answer is possible on open models, free. `context.js` builds the pack (at most 14 numbered notes of at most 300 characters: the lead, one fact row per pick, table rows, honesty lines, then passages about the picks only).

T557: A traveller with WebGPU can choose "Answer on this device". - **Model:** `src/lib/ask/onDevice.js` runs Qwen 2.5 1.5B Instruct q4f16 (845 MB) through `@mlc-ai/web-llm` 0.2.85 (Apache-2.0, pinned) in a Web Worker.

T558: The top-right search on Explore is now Ask Carta ("Ask Carta: a place, a vibe, a month or a budget"), at the top of the tab on a phone, and the total-budget card is gone from the page. Nothing either did is lost.

Broke: T551 Every `gem:` dossier missed / the filename rule / uses `dossier_base()`, mirroring `dossierFileBase`; T551 huggingface-hub 1.33 broke transformers / pip upgrade with model2vec / pinned below 1.0; T551 A dry run rewrote `data/derived/freshness_report.json` / the stage's side effect / restored; T552 "crete" first mapped to Heraklion; Crete is an...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T550-T558-ask-carta.md"`

### T551 notes: the Ask Carta retrieval index (for the T550-T558 batch report)

Root repo: - `pipeline/ask_index_layer.py` (new). Ten source adapters in one registry (`SOURCES`: dest, highlight, sight, trail, journey, beach, lake, peak, country, lexicon). Adding a data type later means one adapter and one registry line. The layer writes passages, int8 and sign-bit vectors, and a pruned, quantised copy of `minishlab/potion-multilingual-128M` into `<public>/search/ask/`. Its modes: `--check` (recall on GOLDEN and MULTI with the shipped files and the two-stage scorer), `--bakeoff` (the three models, float, full vocabulary) and `--fixture` (the JS test fixture). `--public` points it at any `public/` folder; the default is `continent-app/public`.

Broke: - `pip install model2vec` upgraded huggingface-hub to 1.33. That breaks transformers 4.57, the version sentence-transformers and `guided_search_layer.py` use. I downgraded the hub to 0.36.2 (model2vec works with it) and pinned `<1.0` in `requirements-ml.txt`.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T551-notes.md"`

### T557 notes: Ask Carta on device (WebGPU, WebLLM)

- `src/lib/ask/onDevice.js` (new, main thread, no React). The module generate.js already expects as `onDevice`. - `isSupported(): Promise<boolean>`: `navigator.gpu`, an adapter from `requestAdapter()`, the adapter has `shader-f16` (both q4f16_1 models need it), and `navigator.deviceMemory >= 4` when the browser reports it. Memoised. - `isInstalled(): Promise<boolean>`: reads Cache Storage directly (`webllm/model` for `tensor-cache.json` and every shard it lists, `webllm/wasm` for the model library), the same keys WebLLM writes, so the check never loads WebLLM. - `install({ onProgress }): Promise<void>`: the only path that downloads.

Broke: - My own cleanup emptied the worktree's `node_modules`. I removed the two temporary build worktrees with `git worktree remove --force` after a `rmdir` of their `node_modules` junction failed on a forward-slash path; git followed the junction and deleted the contents of `wt/p11-ask-carta-app/node_modules` (a real folder there, not a junction as the...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T557-notes.md"`

### T559 to T562: live bed prices, the four follow-ups (2026-10-22)

T559: What Xotelo publishes, checked 2026-10-22 on xotelo.com: - No terms, licence, privacy or limits page (/terms, /terms-of-service, /privacy, /faq and /pricing all 404).

T560: - **The bucket was missing.** The private bucket `carta-stays-state` that `stays-refresh.yml` pulls from and pushes to **did not exist**, so the first monthly run would have failed at "Pull state from R2".

T561: - **Planner** (`useTripPlanner.js`): - Each dated stop asks `/api/stays` for its own nights and party. - The trip is repriced when an answer lands, because `bedPrice()` already reads it through `accommodationPerPerson()`.

T562: New `pipeline/stays/calibrate_live.py`. - **Sample.** 30 towns with at least 3 hotel keys and a hotel3 curve, at most 2 per country. Four ordinary Tuesdays (November, January, April, July), away from peak weeks. One call at a time.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T559-T562-live-stays-follow-ups.md"`

### T563 to T566: Ask Carta, the four unverified items, checked with the owner (2026-10-22)

T563: A real open model (`@cf/qwen/qwen3-30b-a3b-fp8` on Workers AI) wrote answers for all 140 golden questions through a local `wrangler pages dev` of the Functions: real AI binding, throwaway local KV.

T564: "Answer on this device" was tested end to end in the in-app Chromium 152 on this laptop's Intel Iris Xe (gen-12lp, shader-f16), with the model from Hugging Face through a temporary dev setting.

T565: **Deploy layout fixed:** the production build sends every `search/` file to the R2 data bucket, where the Ask index was never uploaded.

T566: - **The pill is a field:** Home's pill is now Ask Carta's own field (a search form with an Ask button, same pill). - **Typed question:** it opens Explore with the question already answered, through seed `{ question }` and `askSeed` into the panel.

Broke: T563 "80 euro" read as "8 euro", "of 10" as "of 1" / a streamed `{"response": 0}` failed `if (!p)` / `p == null`, pieces kept as strings; T563 Kept sentences reversed a comparison / the model worked out comparisons itself / code writes them as notes; the check demands one; T563 "best visited in June" dropped as a verdict / the compare rule read "be...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T563-T566-ask-carta-verify.md"`

### T567: the trip planner's bed-line rule back in the main sheet (2026-10-22)

`npm run ci:css-routes` failed on app master since T538. One rule, `.itin-bed-cost .costrow { padding: 0; }`, sat in the planners route sheet (`src/styles/planners/67-v6-tripplanner.css`), while the main sheet's `.itin-days-list .itin-day-row-main` has the same specificity and also sets `padding`. The checker cannot prove the two never match one element. A route sheet loads after the main sheet, but its order against a rule in its own source file is not guaranteed once split, so the check refused it. The rule now lives in the main `src/styles/67-v6-tripplanner.css`, right after `.itin-days-list .itin-day-row-main`, so it still comes after that rule as it did in the route sheet.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T567-css-routes-tripplanner.md"`

### T568: Ask Carta as a question bar in Explore's main panel (2026-10-22)

The owner asked for Ask Carta (the RAG answer panel, T550 to T566) to leave the app header, where its field was cut to "Ask Carta: a plac...", and sit under the filters in the main panel. They wanted it cleaner and more dynamic, with no example text in the field. On Explore, at every width, Ask Carta is now a real field under the filter chips (`AskBar.jsx`), not a button dressed as one. It has a visible "Ask Carta" label with the spark (the word is read but not drawn under 480 px), the placeholder "Type your question" and an Ask button. Typing and pressing Enter or Ask asks at once, and the answer panel opens directly under the field at the field's width.

Broke: Two brown primaries on screen after an answer ("See answer" in the bar, "Plan this trip" in the panel) / The bar's button was primary whenever the field held text / Primary only for a new, unasked question; The panel opened right-aligned and half over the suggestions / `useAnchoredSheet` hung it from the whole bar at 760 px / The ref is the form; t...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T568-ask-bar.md"`

### T569: Ask Carta's typed suggestions, the rules changed for them, and the written answer on localhost (2026-10-22)

The owner answered T568-a and asked for three things: no placeholder in the Ask Carta bar, rotating or self-typing prompts no longer banned ("I like some animation"), and the written answer working on localhost. The bar now has no placeholder. While it is empty and unfocused it types its four suggested questions out letter by letter (about 45 ms each), holds each for about 1.8 s, erases it (18 ms a letter) and types the next, with a blinking 2 px caret. The hint is `aria-hidden`, because the visible "Ask Carta" label names the field.

Broke: AskBar.jsx did not parse / A Python edit wrote a real newline into `lines.join('\n')` / The key joins with `' / '`

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T569-ask-motion.md"`

### T570-T571: Ask Carta as a chat (the Kayak structure), and answers that guide the trip (2026-10-22)

T570: Ask Carta is no longer a field on the page. It is one small "Ask Carta" button: in the app header on desktop, and sharing the Filters row in two equal halves on a phone. **The panel** (`AskChat.jsx`, loaded on the first press, 29.6 KB JS and CSS): - Desktop: a 420 px column docked on the right under the settings line, so From, Dates, People and Lifestyle stay visible. From 1024 px the Explore list makes room beside it. It is not modal; Escape closes it.

T571: Each question is a turn (`AskTurn.jsx`). It runs useAsk's stages for that turn alone (parse, hybrid search, facts, words, the written answer checked sentence by sentence). While they run, the real stages show as steps: "Reading your question", "Looking through Carta's places", "Checking flights from Brussels (BRU)", "Writing the answer". Done steps get a tick; the live one pulses.

Broke: T570 133 existing `chat.*` strings (the planner's bot) deleted from all six languages / My i18n script dropped every line starting `"chat.` before adding the new ones / Restored the six files from git (no other uncommitted change was in them); the new keys live under `askChat.*`; T570 Class names `.chat-send`, `.chat-input`, `.chat-row`, `.chat-fie...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T570-T571-ask-chat.md"`

### T572-T576: Ask Carta follow-ups, filter safety, one chat everywhere, chats in the account, live beds (2026-10-22)

T572: `lib/ask/followup.js` binds a question that names no place to the place the last answer was about. Binding happens when the question either: - points back ("there", "daar", "dort", "là", "allí", "lì"), or - asks nothing of its own: no vibe, area, country, budg...

T573: Before this task the chat answered from all of Carta whatever Explore showed. Its "Show all N places" then replaced Explore's filters with the answer's.

T574: The chat is one instance, hosted by Explore (mounted from app start, and it holds the catalogue the answers read). It opens from doors through `askChatStore.js`: - the header on every place on desktop (Explore, Plan, My trips); - the Filters row on Explore on...

T575: **Migration** `supabase/migrations/054_ask_chats.sql` (root repo): - one row per chat per user (`chat_id`, `title`, `turns` jsonb, `updated_at`, `deleted_at` as a tombstone); - RLS so a user reads and writes only their own rows, and anon reads nothing; - at mo...

T576: The trip card asks for live prices for the trip's own nights: the flight's dates, else the traveller's. It uses `/api/stays` (T540, Xotelo) through `loadLiveStay`, and prices the bed with `bedPrice()`, the same live reprice the place's own card uses.

Broke: T572 "Where to stay there?" answered "Carta covers Europe, and Stay isn't in it yet." / `outsidePlace` took the unknown word after "to" as a destination / Verbs after "to" are skipped; a question that points back skips the outside check

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T572-T576-ask-chat-2.md"`

### T577 to T583: Explore tidy (owner request 2026-10-22, "/impeccable") (2026-10-22)

T577: The settings line's first part reads "From Brussels", never "Brussels BRU". Its popover (`FromPicker.jsx`) is one search field with no placeholder (named "Search a town or country" for screen readers), a quiet "Use my location" (the device's position, named th...

T578: The When popover opens on Dates, Month or Any time over the Nights stepper; "Carta picked these dates." and the "Suggested dates" label are gone.

T579: People is three rows, Adults, Children (2 to 11) and Babies (under 2), each label left and a stepper right in a popover no wider than its rows (the owner's screenshot showed a lone stepper in white space; the stepper buttons go to 36 px on a fine pointer, 44 o...

T580: The panel head is one title line ("How you'll spend") beside the close; the "Lifestyle" eyebrow, "Two answers set what a day costs...", the stay note and the trade-off sentence at the foot are gone, and the foot is Done alone.

T581: The desktop settings line has a Countries part ("All of Europe", "France, Italy", "4 countries", "Not France", "All but 2"). Its popover is Only these or All but these over a search and a list of tick rows, with Clear; every change applies at once.

T582: The last part of the settings line (an icon button on a phone) steps through Any way (a pin), Plane, Train, Bus and Car. Any way is the new default.

T583: A list answer is two or three human sentences, three compact place rows and one "More places" that adds three more ("Show all places" is gone), then a separate Carta bubble, "Got one in mind?", with the top places and "Not yet" as quick replies.

Broke: T577 The phone sheet's From row and the way button were raw buttons (design-lint) / Written before checking the kit / Moved onto `Button` and `IconButton` (96664bd); T582 20 tests failed after the composeTrip change / A new `groundTotal` helper redeclared the existing on-the-ground total / Renamed to `wayTotal`, the field to `way_total`

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T577-T583-explore-tidy.md"`

### T584 to T594: Explore v6 (owner request 2026-10-22, reference board) (2026-10-22)

T584: The chat panel's head and the foot with the field were white `--surface` bands on the warm panel. Both now stand on `--surface-page`; a hairline shows under the head only when the conversation has scrolled under it, and above the foot only when there is more b...

T585: From 1024 px, the first time Explore opens on a device, a dialog asks "What matters most on this trip?": a labelled field whose text goes to Ask Carta, then "Have details? Share what you know." with From, Where to, When and Who rows showing the settings line's...

T586: Explore was everything at once: tiles, rails, the full list and a long side pane. At rest it is now an overview: "Find your next trip", a What and Where bar (What is Places, the five categories and Trip styles; Where is the place search; a secondary Search), t...

T587: Every browse rail (Explore's place rails, Trip styles, and the openings of Trails, Beaches, Lakes, Mountains and Cycling) is now a story rail after the owner's Komoot reference: a lead card on `--surface-sunken`, tilted -2deg, holding the heading, one line, up...

T588: The focused view's head is "Places in Europe" with the live count under it, then one row of pill buttons: Share (copies the link, "Link copied"), Sort (a menu instead of a bare select), Filters with its count (opens and closes the desktop pane, the sheet on a...

T589: The pane, after the owner's Hostelworld reference: a head with the live count and Clear all; Kind of place as small icon chips; Good for (A base for the week, A day trip, A stop on the way) high and never folded with one help line; Budget a day as a stepped tw...

T590: On the owner's word ("the mention of estimate is not needed"), an estimate shows the tilde only, everywhere `<Money est>` and `formatEst()` run, in receipts, the planner legs and the plan, day and destination PDFs; screen readers hear "about {price}".

T591: The preview the owner disliked (rank, role, known for, best months with a twelve-month strip, three sights, "worth N days", the reach line and a full receipt) now holds the hook line, one verdict chip for the month, one plan sentence ("2 days in November, abou...

T592: Map view on a desktop is the full width map with a panel floating on its left: the places on the map as rows, or the picked place with its photo, Score and band, region, a "Your trip" box (dates or month and nights, the way there with Google Flights and the ai...

T593: Trails, Beaches, Lakes, Mountains and Cycling open on a What and Where bar (What is the tab's own main facet, Where its place search with locate and suggestions, a secondary Search, and the Map or List pill), a quick filter row ("All filters" and up to four dr...

T594: Every page-like tab now ends on a footer like the owner's Rightmove reference, on `--surface-sunken`: the mark, the positioning sentence, Explore, Plan, Carta and Legal columns of real links through the app's own door, and the year.

Broke: T586 "Best in October" above a trip the settings line dates 21 to 28 Nov / `travelMonth` is set only for dates the traveller chose; default dates fell back to today / the rails take the month the settings line shows (9f8b862); T586 The "Explore" link left the lens in place after the map or a place page / it stepped back through history, which held...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T584-T594-explore-v6.md"`

### T595 to T600: Explore v7 (owner review of v6, 2026-10-22) (2026-10-22)

T595: The overview now opens on one compact block: "Where to next?", Ask Carta as a field-like door with an example question (the chat's only door: it left the desktop header, the phone's top bar and the Plan tab), one bar with What, Where, Search and the Map toggle...

T596: The footer lost its positioning sentence; the focused view's title and the filter pane's head no longer show "3,073 places" (the count stays for screen readers); Good for lost its help line ("Pick how you will use the place.").

T597: The Lifestyle panel has a Getting there row (Any way, Plane, Train, Bus, Car) bound to the same setting as the settings line, so choosing Plane in either place prices flights only.

T598: The focused view's head is one row: a round arrow back and the title on the left, the pills (Share, Sort, Filters, Saved, Map) on the right.

T599: Each rail's grey lead card now shows what the rail holds: the title, an optional short line, a fanned stack of the rail's first three photographs, one large figure ("From ~€35 a day"), up to two small facts and See all.

T600: Beaches, Lakes, Mountains and Cycling have a Europe-wide map; Trails maps each country's best walks until a country is picked, then every walk of that country as a route.

Broke: T595 The phone Search button was an empty white box / its word is hidden on a phone and it had no icon / the button keeps its search icon (4c35b72); T595 The Countries pill sat on top of "Go without a car" / the settings line's `flex: 1 1 0` rule let it shrink to nothing in a scrolling row / the pill keeps its size in rows of pills (671aad9); T598...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T595-T600-explore-v7.md"`

### T601 to T604: Explore v8 (owner review of v7, 2026-10-22) (2026-10-22)

T601: The overview's top is a hero: a licensed Commons photograph as a band across the content width, a solid panel over its lower edge with "Where to next?", a small Ask Carta pill and one joined What | Where | Search field (Search is the one primary, the field ris...

T602: Trails, Beaches, Lakes, Mountains and Cycling lost their permanent left panel and the Country fold. All filters, Sort and the quick chips sit on top; on a desktop All filters slides the 320 px pane in (closed by default), on a phone it opens the sheet.

T603: "3,045 places on the map" is read by screen readers only.

T604: Each quick chip on Places opens a popover that draws the filter pane's own section (same controls, words, order and state); a set chip shows its value in the selected tint with a tick.

Broke: T601 At 1440 and 1880 px the hero sat centred and narrower than the rails, so the left edges did not line up / the band was capped at 1240 px / the band takes the rails' width; only the panel is capped (53b99ba)

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T601-T604-explore-v8.md"`

### T624: Booking stay scrape reads prices and stars again (2026-10-23)

The first real Booking.com scrape (run tag 2026-10, started out of season with FORCE=1) read 313 pages in 2.2 hours and stored 0 prices, without ever reporting a block. Booking now answers headless Chrome with a 202 and a redirect to a bare `searchresults` page: the search is gone from the URL and the page is the empty search form. The reader saw no cards, took that for a town with nothing to book, and marked the page done. A visible (headed) Chrome window gets the normal results page, with no change of browser or user agent, no CAPTCHA solving and no evasion code.

Broke: 313 Booking pages journalled done with 0 prices / Booking redirects headless Chrome to a bare searchresults page (202, then 301 without the query); the block test only knew 403, 429, "captcha" and "awswaf" / A searchresults URL without `ss=` is a block; Booking runs headed; Every Booking card had `stars = null` / Icons are now bare spans (the count...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T624-booking-headed.md"`

### T633: Booking scrape retries a dropped search once before it stops (2026-10-23)

After T624 the scheduled run (CartaStaysNow, 16:56) stopped on its first page, STN, with a 20-hour block: Booking had dropped the search from the URL once. The same STN search worked straight after, headed, from a shell (15 cards, then 10 pages and 270 prices with the real scraper on a copy of the journal) and from a Task Scheduler probe (25 and 40 cards, page visible and focused), so neither the scheduled context nor the town was the cause: Booking drops a search now and then on a page it serves a minute later.

Broke: Scheduled Booking run stopped on page 1 with a 20 h block / One dropped search counted as a block (T624's rule), and Booking drops a search intermittently / One retry after 60 s before the block

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T633-booking-retry.md"`

### T634: Booking scrape runs headed in an off-screen window (2026-10-23)

Since T624 the Booking scrape runs headed because Booking turns headless Chrome away, which put a Chrome window on the owner's screen every night (and closing it by hand ended a run on 2026-10-23). `scrape_booking.py --headed` now starts Chromium with `--window-position=-32000,-32000`: the same normal browser, served normally by Booking, but nothing on screen. `--show` puts the window back on screen for debugging. Chrome's newer headless mode (`channel="chromium"`) was tried first and is still blocked: it reports `HeadlessChrome` in its user agent, and changing that would be disguising the scraper, which the stays scrapers do not do.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T634-booking-offscreen.md"`

### T643 to T646: price engine F0, the scrape gate (2026-10-23)

T643: Every stays observation now carries the same facts: `currency`, `unit` (bed, person, room, place), `tax_included`, `from_or_discount`, the page's `price_text` and `per_text`, added to the journal as additive columns.

T644: A town's level for a bed type is now the median of its sources' medians: each source's median of its property medians counts once, so Booking's 25 to 50 cards a page no longer outvote Xotelo's 4 anchors; one source alone gives its own median, as before.

T645: `build_stays.py` runs one gate on every build and writes `cache/stays/gate_report.md`; with `--gate` a failed gate exits 2 before anything is written.

T646: `build_stays.py` stamps the manifest after writing the country files: `gate.passed`, `gate.hash` (sha256 of the country files in name order) and `build` (its first 12 characters).

Broke: T643 Headless Chromium failed to start ("Invalid file descriptor to ICU data") at 19:45, and the headed one was gone / Python Playwright's build 1217 was garbage-collected by another project's Playwright install while a scraper held some files / `python -m playwright install chromium chromium-headless-shell`; T646 gives the scrape its own browser f...

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T643-T646-price-f0-scrape-gate.md"`

### T679: the stays scrapers survive bad pages, and each site runs on its own (2026-10-24)

A Booking or Hostelworld session no longer ends on one bad page. On 2026-10-23 and 24 Hostelworld stopped four times (a 60 s page timeout at Helsingborg, `ERR_INTERNET_DISCONNECTED`, `ERR_NETWORK_IO_SUSPENDED` when the laptop slept, a closed browser) and each time lost the rest of its run. Two causes: no page was wrapped, and the session caught Python's built-in `TimeoutError` (which the scraper raised itself for `--max-hours`), not Playwright's `TimeoutError`, a different class, so a slow page ended the session.

Broke: The live Booking run (old code) ended at 17:11, 13 minutes before its 6 hours / The recovery test killed every Playwright Chromium on the laptop, the live run's too / Nothing lost (the journal resumes it); kill only the test's own process tree next time

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T679-scrape-robust.md"`

### T739: the flight sweep publishes through a queue (2026-10-26)

The flight-sweep Worker's hourly publish had failed on every run since 2026-10-23 02:07 UTC with "Too many API requests by single Worker invocation" (live log, 2026-10-26 02:07 UTC: exception after 63 s). One run may make 1,000 calls; an airport costs four (two D1 reads, the previous R2 file read by the T645 route check, one R2 write), and after the 2026-10-23 seed every one of the 377 home airports had changed, so a run needed about 1,900. Nothing reached R2 for three days: D1 holds 73,838 fares (62,172 priced) that the app never received. Workers Paid (the owner, 2026-10-26, T514-a) did not lift this limit.

Broke: No publish for three days / One run needed about 1,900 calls; the limit is 1,000, on Workers Paid too / The queue; The T645 route check added a call per airport / It reads the previous file to compare medians / Kept, and counted inside the batch

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T739-sweep-publish-queue.md"`

### T741: the stays scrapers write their log in UTF-8 (2026-10-27)

From 2026-10-27 02:16 every hourly Booking run ended within 20 seconds on `UnicodeEncodeError: 'charmap' codec can't encode characters` (`scrape_booking.py` line 279, the per-town log line). Under Task Scheduler the log is a file, so Python writes it as cp1252, and the next town in line has an id with a letter outside cp1252 (two ids do, for example `gem:hafnarfjorður`). The line sits outside T679's per-page protection, so each run skipped the finished towns in seconds and died on the same town; no Booking page was scraped from about 02:00 to the merge.

Broke: Every Booking run crashed on its log line / cp1252 log file, a town id with a letter outside it / UTF-8 streams

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T741-scrape-utf8.md"`

### T742: the stays journal reaches R2 through wrangler (2026-10-27)

The scrape journal never reached R2: the rclone key the owner set (`RCLONE_CONFIG_R2_*`) answers 403 Forbidden on `carta-stays-state`, and before that rclone had no key at all (T624-d, T741-a), so the monthly Actions build could not see a single Booking or Hostelworld price. `wrangler`, logged in on this laptop, reads and writes that bucket (checked with a test object, then deleted).

Broke: The first test refused the upload ("no such table: obs") / wrangler leaves an empty file when the key does not exist / Delete the copy when the download fails

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T742-stays-upload-wrangler.md"`

### T780: the flight sweep down to what the app needs (2026-10-27)

On 27 October around 20:30, Google started refusing the flight-sweep Worker: 40 refusals in 4 minutes, after a day of about 6,200 searches an hour with almost none. The owner asked for the sweep to be slowed to the minimum, with no blocks, and accepted that a price may be a few days old. The sweep now runs about 1,100 searches an hour instead of 6,200, which is 82% fewer. How the work is split: - **Near dates** (the next 14 days): every fourth day (1, 5, 9, 13 days out) instead of every other day, each route every 3 days instead of every 12 hours. The app already takes the nearest swept day within 4 days of the one asked for (`flights.nearest_day_spread`).

Broke: - The old guard's stop callback read a refusal count that nothing had incremented yet, so a minute with refusals ran all its searches. Fixed by counting refusals as results come in. - A far cycle (20,160 minutes) longer than the route list would have bunched all far searches into its first week. Fixed by routesInMinute.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T780-sweep-gentle.md"`

### T798: flight fares 6 to 9 months out, from the Hetzner box (2026-10-28)

The owner asked for flight prices past November, to June or July 2027, gathered slowly on the box. Before, the Cloudflare sweep (workers/flight-sweep) covered the next 26 weeks: dates up to about 28 April 2027. Now a third tier, late, covers weeks 27 to 40 (day 182 to about day 279, so May to early August 2027 today, rolling forward each day): - `plan.mjs`: `LATE_CYCLE` (4 weeks), `LATE_WEEKS` (14) and `lateJobsForMinute`, the far tier's one-day-a-week spread carried on, with the same month mask. Each route is searched once a cycle; the tier starts the day after the far tier's last. - `workers/late-sweep/run.mjs` (new): the box runner.

Broke: - A full root worktree (`git worktree add`) filled C: (the root repo tracks continent-app/public, about 48,000 files); bash then could not fork. Stopped the checkout, deleted the partial `public/`, and made a sparse root worktree (202 MB).

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T798-late-flights.md"`

### T915-T917: the flight sweep's blind spot, January and February sooner, a faster box fill (2026-10-30)

T915: The route list comes from Eurostat, where a route exists when either end's country reports it. Routes between two countries that do not report (the UK, Czechia, the Channel Islands, the Isle of Man, the Faroes, Albania, Kosovo, Moldova) were never searched: London to Prague, London to Edinburgh, Manchester to Tirana.

T915: The box's fills wait 2 to 4.5 seconds between searches, was 3 to 6.5, still doubled from 23:00 to 05:00 UTC and slowed 1.5 times per refusal (at most 4 times). That is about 960 searches an hour by day, was about 690, beside the late tier's 205; the late fill's remaining routes end about a day sooner than at the old pace, but now a...

T915: The owner wants every fare to the end of February complete. Those dates are the Worker's far tier (weeks 3 to 26), which reaches each route once in 2 weeks and has done about 2,450 of the about 7,350 routes that fly in January and February since its range grew on 26 October, about 460 more a day.

Broke: T915 - The first pair count was 1,009: Carta's list holds a few overseas and African airports (RUN, DZA, NIM, LMZ, ...) in non-reporting countries. Limited to Europe by coordinates: 564.

Full: `git show archive/execution-full-2026-11-03:"Execution/P11/T915-T917-sweep-gaps.md"`
