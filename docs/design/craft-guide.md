# Craft guide: custom and clear interfaces

This guide gives you a repeatable way to make any product's interface feel fully its own while staying calm and clear to read. It covers the process, the identity systems, background graphics, clarity, layout at three device sizes, interaction and haptics, accessibility, the 2026 list of generated-design tells, and how to judge the result from evidence. Each part states the general rule first, then shows how this app applied it.

Where this app's own rules live:
- Who the product is for and how it speaks: [`../../PRODUCT.md`](../../PRODUCT.md).
- Tokens, components and exact values: [`../../DESIGN.md`](../../DESIGN.md) (grep it, do not read it whole). The token source of truth is `:root` in `continent-app/src/styles.css` and its imports.
- The project's design skill, which wins over every other design source: [`../../.claude/skills/carta-design/SKILL.md`](../../.claude/skills/carta-design/SKILL.md).
- Why the house style looks the way it does: [`../decisions/0012-house-style.md`](../decisions/0012-house-style.md).

How sources are marked. Most rules come from a research round in November 2026 (craft principles, the design toolkit, interaction and haptics). Where that research said a claim was not verified, this guide keeps the label "(unverified)". Where a number is a rule of thumb rather than a standard, it says "(rule of thumb)".

---

## 1. How to use this guide

### When to open it
- Before any task that changes what a user sees: a new screen, a restyle, a component, a background graphic, motion, a share card or an export.
- When a screen "looks generic" or "looks AI-made" and you need to say why.
- When you judge someone else's visual work.

### Which sections for which task

| Task | Read |
|---|---|
| Small fix inside the existing style (one component, one state) | 5, 7, 8, 11 |
| Restyle of one existing screen | 2, 5, 6, 7, 9, 10, 11 |
| New screen inside the existing style | 2, 3 (worked examples only), 5, 6, 7, 10, 11 |
| New background graphic or illustration | 3, 4, 8 |
| Motion, micro-interactions, haptics | 7, 8 |
| A new house style or a whole new product | everything, in order |
| Judging visual work | 9, 10, 11 |

### The quick version (10 lines)
1. Write the screen's one job, its one main action and its one dominant element before you draw.
2. Name the frame (ground, header, empty state, transitions) and the core (lists, figures, forms). Expression goes in the frame; the core stays calm.
3. Use at least three signature elements drawn from the product's own world, and nothing from the slop catalogue (section 9).
4. Tokens only. No new colour, radius, shadow, size or duration outside the token file.
5. Cut every sentence the context already says. One name per object.
6. Design phone, tablet and desktop as three layouts, then sweep 360 to 1920 for horizontal scroll.
7. Every selection, toggle, add, remove and screen change maps to one interaction primitive. Only figures the user changed may move.
8. Measure contrast (4.5:1 text, 3:1 marks), 44 px targets, visible focus, colour never alone, reduced motion shows the end state.
9. Take screenshots at three angles and prefer DOM checks for anything a script can assert.
10. Let a fresh judge score the screenshots and code against the rubric (section 10). Fix in one batch, confirm once, stop.

---

## 2. The process

### 2.1 The standard pipeline
The project's crew plugin runs this as a playbook. Use `crew:design` for any visual task bigger than a small fix; it runs the full `crew:deep-task` pipeline with design settings (explorer areas, three directions, critic lenses, a rubric, screenshot verification). For a small fix (crew level L1), use only the rubric and the screenshots (steps 1, 7 and 8).

1. **Brief and rubric.** Write the task in a few lines: who looks, on what device, in what mood, what the screen must do. Pick a rubric before you design (section 10 has a template). Name the "mode" of each surface, using the words of the `impeccable` skill: Operate (a tool used to get work done), Persuade (a marketing page), Read (long text) or Experience (a showpiece).
2. **Explore.** Map what exists before you invent: the current screens with screenshots, the components and CSS, the user jobs per screen, the technical limits, the product's own world (its artefacts), references inside and outside the market, the installed tools. Write each finding to a file with evidence.
3. **Diverge.** Write 15 to 20 ideas, then keep three directions that sit in clearly different aesthetic territories. Each one must name one choice that only makes sense for this product. If two directions differ only in colour, they are one direction.
4. **Propose.** Each direction becomes a full proposal: tokens, type, ground graphics, signature components, interaction system, layouts at three angles, copy, and a mapping that shows every existing function is still there. Build an HTML prototype of 2 to 3 key screens with real data.
5. **Critique by lenses.** One critic per lens, each reading all proposals: hierarchy and clarity, accessibility, ownability and brand fit, generic-design detector, feasibility and scale, interaction and feel, three angles. Each issue is tagged blocker, major or minor with a concrete fix. Run one revision round.
6. **Decide.** Judges score the revised prototypes from screenshots. Record the decision, what was taken from the losing directions, the must-fix list and the risks in a decision file. If the owner chooses, record their words.
7. **Build tokens first.** Tokens, fonts, the shared kit, the interaction kit, the app shell and the background graphic system come before any screen. Screens then change in lanes (one area each), every lane on the same foundation.
8. **Verify at three angles.** Mechanical checks green first (lint, tests, contrast, design lint, build), then screenshots at phone, tablet and desktop, the width sweep, the DOM checks.
9. **Judge from evidence.** A fresh judge who did not see the work being made scores screenshots plus code against the rubric. Fix in one batch, confirm in one round, stop. Anything left goes to the report or the backlog, not into an endless loop.

In this app: the house style run of November 2026 ran these nine steps with seven explorers, three directions ("Waymark", "Line", "Ledger"), seven critic lenses, two proposal rounds and three judges per round. The owner picked a hybrid: Waymark's structure, signature elements and motion with Line's brown and beige colours and rail cards, a little rounder. See [`../decisions/0012-house-style.md`](../decisions/0012-house-style.md).

### 2.2 Which tool at which step
These are the installed design skills and tools. Treat one engine as the backbone and the rest as lenses you pull in for one job.

| Step | First choice | Also useful | Avoid |
|---|---|---|---|
| Load context | The project design skill, `PRODUCT.md`, `DESIGN.md`; `impeccable` context for the target file | | Old design files that describe a previous look |
| Shape a screen | `impeccable shape` (task, hierarchy, states, content) | `frontend-design` for a first thinking pass and the last "remove one thing" pass | Page recipes from `taste-skill` on app screens |
| New world or identity | `impeccable` new-work flow: seven visual systems from the audience's world across at least three material families, then a dice-dealt challenger round (`concept-seed`) | `taste-skill` idea sentence and competitor test | `genjutsu paint` (writes a second design file) |
| Restyle | `impeccable` with `layout`, `typeset`, `colorize`; `distill` to strip | `redesign-existing-projects` once, as a diagnosis checklist | `redesign` as the fixer (it adds stock photos, grain and serif) |
| Motion | `impeccable animate` (one focal moment, continuity, feedback, budget) | `genjutsu` modules `motion-principles` and `framer-motion` for one hard piece | GSAP scroll recipes, blur-in on everything |
| Copy | `impeccable clarify` plus the project skill's copy section | | Tool-written filler |
| Accessibility | The project's contrast script, axe checks, `impeccable audit` | `web-design-guidelines` (gives `file:line` findings on JSX) | Contrast judged by eye |
| Anti-slop scan | `impeccable detect`, the `taste-skill` tells registry and critique passes | `genjutsu` audit script, group "tells" | Treating a clean scan as proof |
| Screenshots and states | `playwright-cli` or the project's `verify_*.mjs` scripts | Chrome DevTools MCP for traces (unverified in this setup) | Judging from code alone |
| Design docs | `impeccable document` (one `DESIGN.md` in the Google 8-section format) | Brand files in `~/.claude/design-md/` as format models (read `nerdwallet`, `wise`, `aljazeera`, `dell-1996`) | A second design file (`MASTER.md`, a Stitch-flavoured copy) |
| Marketing pages only | `impeccable` in Persuade mode plus `taste-skill` | | `taste-skill` page rules on app screens |
| Prototype comps | HTML prototypes with real data | Image comps from `imagegen-frontend-mobile` if an image generator exists (unverified) | Matching a comp that ignores real data density |

Where each family stands:
- **`impeccable`** is the craft engine: about 20 commands, a detector and a refuse list. Its two strongest rules: "the brief wins" and "verify in bounded passes, not a loop".
- **The `taste-skill` family** (`taste-skill`, `gpt-taste`, `soft-skill`, `minimalist-skill`, `brutalist-skill`, `stitch-skill`): `taste-skill` v2 says in its own description it is not for dashboards or app screens. Use its idea sentence, competitor test, tells list and 14 look passes everywhere; use its page rules only on marketing pages. `soft-skill`, `gpt-taste` and `minimalist-skill` prescribe looks that the newer tools call slop (glass nav, eyebrow pills, cream with serif, marquees). Use them as audit lists at most.
- **`genjutsu`**: two ideas worth taking: an "Allowed patterns" line under the design thesis (anything listed is deliberate, anything else is a finding) and an audit report that separates "checked here, with evidence" from "not verified".
- **`frontend-design`**: short and cheap. "Spend your boldness in one place."
- **`web-design-guidelines`**: the best installed code-level reviewer for accessibility and interaction. It does not know the project's money, language or token rules.

### 2.3 When skills disagree
The project's own design skill wins over every other design source. Its look rules are defaults, not bans; accessibility, honest numbers, the copy rules and licensed photography always bind. Then:

| Conflict | Ruling |
|---|---|
| Eyebrow label above headings (some skills require it, others ban it) | Banned unless `DESIGN.md` lists it under allowed patterns with a reason |
| Shadows and rules | One depth language stated in `DESIGN.md`; price tables may use rules |
| Gradients | Decide once. The project's design lint fails any gradient; if a graphic needs one, change the lint rule and its baseline in the same commit and document it. Default: flat SVG |
| Motion volume ("8 moving elements" versus "one moment") | One authored moment per surface; Operate screens get feedback and state only |
| Reduced motion (blanket kill versus end state) | The end state at once, feedback kept legible |
| Monospace | Only for true measurements through the mono token; tabular figures in the text face otherwise |
| Fonts | Choose from the subject; check `impeccable`'s reflex list and the licence of every shortlisted face |
| Stock or placeholder images | Only licensed or credited images, licence checked per file |
| A second design file | One file: `DESIGN.md` |
| Tools that wait for the user | In an autonomous run the orchestrator answers and records the answer in the decision file |
| Animation library | Use the one the project already has; no new dependency |

---

## 3. Identity: what makes a product ownable

A product feels custom when a few signature systems all come from one source in the product's own world and repeat everywhere with discipline. It feels decorated when each screen adds its own system.

### 3.1 The anchor sentence
- **What:** one sentence that names the product's world and its one honest claim. Every system below must follow from it. If a system cannot be explained by the sentence, drop it.
- **A useful shape:** "On this product, [a thing from its world] becomes [a device]." Then the competitor test: put the nearest competitor's name in the sentence. If it still works, the idea belongs to the category, not to you.
- **Test:** for each signature element, can you point to the clause of the sentence it comes from?
- **In this app:** "The app dresses in the furniture of a European footpath, made for prices." The one choice that only makes sense here: minutes on foot and euros are one unit on one object, read the same way.

### 3.2 How to find motifs in the product's world
1. List 10 physical artefacts the product's subject produces (for travel: timetables, tickets, receipts, survey sheets, signage, trail blazes, price boards).
2. For each, note one structural property: a grid, a perforation, tick marks, leader dots, a fixed column, a stamp, a fold.
3. Rank by meaning (does it say something true about the product), then by cliché risk (does every competitor use it).
4. Pick the property, not the picture: a leader-dot line, not a drawing of a ticket.
5. Render it three ways: a UI detail (4 to 8 px), a marker (24 to 48 px) and a ground graphic. If it fails at one of the three, it is not a system.
6. Write the rule: what it is, where it appears, where it never appears.

### 3.3 The systems, and how many you need
Strong products own three to five of the systems below, drawn from one idea. Plan for at least three that a user would notice.

**A signature shape or object.** One form that appears as container edge, marker, mask or graphic anchor. It must be drawable as one SVG path and survive in one colour. It goes wrong when it is only a logo, used once, a category cliché (compass, globe, plane trail), or when it looks like a button but is not one.
- Test: show it alone at 16 px. Is it still yours?
- In this app: **the blaze**, a trail waymark: a white halo with an umber paint stripe and a short heel under its right end (no national waymark system has the heel). It marks only "chosen" or "here": the current tab, the chosen map pin, the sheet grip, the wordmark slot. It never decorates section headings. The paint stripe stays square, because a waymark is painted square, even though its containers are rounded.
- In this app: **the signpost plate**, a dark plate with one pointed end that holds a place, a time on foot and euros as one unit ("6 h 39 on foot", "€100 to €149"). Its other corners are softly rounded.

**A background graphic system.** A rule-based family of ground graphics, not one wallpaper. Section 4 is the rulebook.
- In this app: relief drawn only from real peaks, always printing a real height.

**An illustration system.** Written as constraints so a new drawing takes minutes: stroke width, colour limit, what is never shown. Prefer diagrams that explain (a day, a leg, a price) over decorative scenes. It goes wrong when every use needs an illustrator, when it looks like generic generated vector art, or when screens mix styles.

**A characterful icon set.** One grid, one stroke logic, one recognisable quirk (a cut corner, an open terminal), so the set is identifiable at 16 px. Pair with a word wherever meaning is not universal; tap area stays 44 px.
- In this app: custom icons on a 24 px grid, 1.75 stroke, square caps, mitred joins: signpost for Explore, route for Plan, a cairn of four flat stones for save, rings for Together, borders for countries (no globe). No sparkle for AI: the Ask button carries a small boxed "AI" tag.

**A type system with personality.** A readable text and figure face plus personality in two or three roles only (display, large figures, one label role). Use weight, width and optical size for hierarchy instead of many sizes; at most five or six sizes in use.
- Choose the text face first: legible at 13 to 16 px, real tabular figures, every glyph your languages need.
- Test: render the hardest names in every language ("Český Krumlov", "Banská Štiavnica", "Übernachtung", "Piñón").
- In this app: Overpass (SIL Open Font License) for every word and figure with tabular, lining figures; Sofia Sans Extra Condensed only for plate names. Both self-hosted. No uppercase transforms.

**A colour system with a story.** Four to six named colours with roles and a reason, one dominant, one sharp accent, neutrals tinted toward the brand hue. Derive each hue from a thing in the product's world and write the sentence that explains it. One accent carries action. Reserve a colour for one meaning and never reuse it for decoration.
- Test: grayscale the screen. Meaning must survive.
- In this app: umber brown is the paint you put on the path when you choose. Umber 600 (`#8c5a2b`) carries action, selected, the blaze paint, the route and the chosen pin; beige (umber 100 `#f6e7d3` and 200 `#e7d3bc`) carries tints, the food wagon, selected rows and quiet surfaces. The ground is a pale lichen stone (`#eef0ea`), paper is white, ink is a green-black (`#1e2421`). Kind colours (trails, beaches, lakes, mountains, cycling) appear for kinds only and always with a pictogram and a word.

**A data-visualisation language.** One mark per quantity, one baseline style, one way to show "estimate" versus "measured" that does not rely on colour, direct labels instead of legends, thin rules, tabular figures. Reuse the same grammar in list rows, map pins and receipts so a cost reads the same on every screen. Marks need 3:1 contrast against their ground.
- In this app: **the price formation**, a row of parts in a fixed order: getting there as an outlined umber pill, the bed as a solid umber wagon, food and drink as a beige wagon, then the day figure in large dark type. The day figure always stays the loudest thing in the row; the wagons never outweigh the price. A place without a split shows one honest wagon. An unpriced part is a dashed "Not yet" outside the sum.
- In this app: on itemised receipts, dotted leaders join a label to its figure across a wide row, and a "Rounding" line appears when printed lines do not add up to the engine's total.

**A motion signature.** One recognisable easing and one recognisable gesture used for every change of state. Two or three durations and a few curves as tokens. Section 7 is the system.
- In this app: "painted and placed": a stripe paints on select, plates settle into place, the card photo becomes the place header.

**Texture and material.** One material from the product's artefact world, on grounds and large surfaces only, never under small text. Full-screen noise and grain templates are tells.

**Sound and haptics.** For a utility on a phone: haptics yes (light, optional, on commits), sound no.

**Voice.** Choose a reference world and ask what it would say (a timetable, a receipt). Verb plus object on buttons, errors that say what happened and what to do, empty states that name the space and give the action.
- In this app: short labels with the unit said once: "Places in Europe", "A day, a person", "Total for 2 people", "Plan a trip here", "Still to book", "No place fits". A missing value says "Not yet".

### 3.4 Ownability tests
- **Logo hidden:** crop out the logo and name, show three screens to three people. Can they say which product? Pass: two of three.
- **Swap test:** replace the product name and content with another sector's. If it still looks right, it is generic.
- **Competitor lineup:** your screen next to five competitor screens at thumbnail size. Yours should be spottable.
- **Squint test:** blur about 8 px. The dominant element, the groups and the ground graphic still read as a composition; figures still form columns.
- **Grayscale test:** meaning survives without colour.
- **Template test:** no critical hit from the slop catalogue (section 9).

In this app, the calibration the judges used: a 2 on ownability is warm grey ground, white rounded cards, a photo grid and a coloured button (the app's old look and every travel template). A 4 is a screen whose type, ground, graphics and figures could only belong to a product that prices Europe honestly for people who walk.

---

## 4. Background graphics rulebook

A background graphic is a surface textured only from the subject's world. Stripes and grids need a real map, blueprint or measuring tool under them: contour lines, survey grids and timetable rules qualify. Random noise, blobs, mesh gradients and sketch-style scenes do not.

Copy this template for any product and fill in every line.

### 4.1 The template

| Rule | What to write down |
|---|---|
| Source | What real data or artefact the graphic is drawn from. If there is no data, there is no graphic. |
| Where it may appear | The frame: page ground, header band, hero, empty states, share cards, covers, interstitials |
| Where it must never appear | Behind figures and price columns, inside inputs, behind receipt lines, under map labels, on error messages, under focus rings, behind small text |
| Clear zone | Text under 18 px (or under 14 px bold) never sits on a graphic. Give it a flat ground: a plain panel, a scrim or a graphic-free zone |
| Density by zone | Frame: full strength. Working core (lists, tables, forms): flat ground, or only in the outer 16 to 24 px gutter at under 3 percent contrast (rule of thumb) |
| Contrast budget | Text near the graphic meets AA (4.5:1, or 3:1 for large text) against the worst point under it, not the average. Keep the graphic's tone within about 8 percent lightness of the ground (rule of thumb), then measure |
| Dominance | The graphic is never the first thing the eye lands on, except on frame-only screens |
| Scale family | Three sizes (small tile, header band, full bleed) and one shared angle or light direction |
| Light direction | One direction for every graphic, written down |
| Per-section variation | One family, changed by parameters (seed, density, hue token), never a new graphic per section |
| Count | At most N per screen (write the number) |
| State response | Frame level only: quieter while loading, stronger on empty, flat while the user edits. Never carries meaning that is not also in text |
| Motion | Static by default. If it changes with data, cross-fade once. Reduced motion shows the end frame. Anything moving over 5 seconds needs a pause control |
| Accessibility | `aria-hidden="true"` on inline SVG, or a CSS background or pseudo-element; `pointer-events: none` |
| Forced colours | Dropped under `@media (forced-colors: active)` |
| Missing data or photo | A named fallback (a flat tint with the signature mark), never an empty box |
| Zoom and small screens | At 400 percent zoom and in phone landscape it hides no content and causes no horizontal scroll |
| Performance | Inline SVG patterns under 2 KB, SVG background tiles under 5 KB, at most one full-bleed SVG over 20 KB per route (rule of thumb budgets; set them in CI). Pre-compute generated output; no `filter`, `mix-blend-mode` or `backdrop-filter` on large scrolling layers; `contain: paint`; never on the critical path of the largest paint |

### 4.2 Techniques to choose from
- Inline or tiled SVG patterns: smallest and crispest; themeable with CSS variables when inlined.
- Contour and line systems whose density follows something real (height, price band, density of places), so the graphic is information in miniature.
- Seeded graphics: a function of an id gives every place its own ground. Cache the output; never regenerate per frame.
- One huge letter, numeral or map fragment cropped by the viewport at low contrast, for headers and empty states.
- Masks and cut-outs: a graphic seen only through a shape.
- Two or three flat layers fixed to each other. No parallax.
- CSS-only marks (`repeating-linear-gradient`, `radial-gradient` masks) for rules, ticks and dots, where your lint allows gradients.
- Photography as ground only with a defined, repeatable treatment and a licence.

### 4.3 How to check text contrast near a graphic
No installed tool measures this; token contrast scripts only check declared colour pairs. Do it like this:
1. Render the screen at 390 and 1440 px.
2. For each text box that sits on or next to the graphic, sample the rendered pixels behind the box and take the worst (closest to the text colour) value.
3. Compute the WCAG ratio of the text colour against that worst value. It must meet 4.5:1 (3:1 for large text).
4. Repeat with the graphic at its strongest state (empty state, data that draws the densest lines).
5. Run the decoration-off test: hide the graphics. If the screen is clearer, the graphics are too strong. If it is identical but plain, they are well behaved.

### 4.4 In this app: relief from real ground
- **Source:** a relief is drawn only from peaks with a height in the place's data (height, bearing, distance). Every relief prints at least one real height on a flat tag ("Kleť 1,087 m", "Mont Blanc 4,806 m"). Prices are never drawn as terrain. No peak, no relief.
- **Where:** the place page's surroundings band, the trip header (peaks from the trip's own places), the share card, the PDF cover. Not in the phone list header: a judge found it cost rows, and relief belongs to pages whose peaks are that page's own. At least 8 rows must fit in the first view at 390 x 844.
- **Composition:** always to one side of a hard umber cut with a blaze on top; text sits only on the flat side. Never behind figures, rows, fields, focus rings or map labels.
- **Light:** lit where the slope faces north-west.
- **Drawing and cost:** contours from a height field built from the peaks (marching squares), east to west at true scale, memoised per id and size, `contain: paint`, at most two per screen, cross-faded once when the data behind it changes.
- **Fallbacks:** a missing photo shows a flat world tint (water, lowland or rock) with a blaze. Forced colours drop the relief.

---

## 5. Clarity

The rule that makes custom and clear live together: the further a surface is from a number the user must trust, the more expression it may carry. A figure never sits on a graphic.

| Expressive (frame) | Calm (core) |
|---|---|
| Page ground, header band, hero | Price lists, tables, receipts |
| Empty states, first run, errors | Forms and inputs |
| Section transitions, sheets arriving | Figures that change with inputs |
| Share cards, PDFs, covers | Map labels and the numbers on pins |
| Loading and success moments | Confirmation of money or dates |

### 5.1 One job per screen in 5 seconds
- Before designing, write each screen's one job, its one main action and its one dominant element. The dominant element is the largest, boldest or most isolated thing; everything else recedes.
- One primary action per area. If every button is primary, none is.
- Hierarchy tools in order: size, weight, position, space, then colour. Colour last and never alone.
- Test (5-second test): show the screen for 5 seconds, ask what it is for and what to do next. Pass: 4 of 5 people answer correctly (a common convention, not a measured standard).
- Test (first click): give a task ("find the cheapest place for 3 nights") and record the first tap. Pass: 80 percent correct (convention).

### 5.2 Reading order
- DOM order equals visual order equals tab order.
- On a phone, top to bottom: what this is, the key figure, the action, the detail.
- Put the best option and the main action first or last, not in the middle.
- Primary actions large and in the bottom third on phones, never smaller than 44 px.

### 5.3 Decoration never competes with figures
- Ground graphics, photos and tints stay out of the core (section 4).
- One thing differs per screen. If the accent appears everywhere, nothing stands out.
- In this app: the day figure is always the loudest element in a price row; the wagons and plates around it are quieter.

### 5.4 Minimal text
- Cut unit sentences, sublines and explanations that the context already gives.
- Say the unit once per list (in the column head or group label), not on every row, unless a row can be read alone (a single pin or card carries its own unit).
- A heading is not followed by an intro that repeats it.
- Explanations sit behind a tap ("Why this one"), not under every element.
- Headlines fit two lines at every width.
- In this app (owner rule): no sublines or unit sentences. "A day, a person" sits once in the column head; plates carry a name and at most one short line.

### 5.5 Dense data that scans
1. Tabular figures on every number (`font-variant-numeric: tabular-nums`), from a face whose tabular figures are designed, not synthesised.
2. Right-align figures so magnitudes compare; left-align text; headers align with their column.
3. The same decimal places within a column. In this app: whole euros when comparing, cents on receipts.
4. Currency placement follows the locale through one formatter, never string concatenation. In this app: every euro goes through `formatMoney()`.
5. Figures do not jitter when they change: fixed-width columns, tabular figures, no count-up.
6. The comparable thing is the largest: the figure per day, not its caption.
7. Sort by the figure the user came for, show the sort key, allow switching.
8. Separate groups with space or one hairline, not boxes. One container level only; no card inside a card. A visible break every 5 to 9 rows in long lists.
9. Tappable rows at least 44 px high. In this app: about ten places on a 390 x 844 phone list, which means rows of about 56 to 64 px including the photo (inferred from the density target).
10. Estimates are marked by a word or a shape, not by colour alone.
11. Never round to look tidy. A total prints the engine's own total, never a sum of rounded lines; a rounding difference gets its own line.
12. Name left, figure right at a stable x position, one stable secondary line; anything more moves behind a tap.

### 5.6 Grouping
- The gap between groups is at least twice the gap inside a group.
- Group with space and alignment before you add a container.
- Identical rows read as one list; a differing row reads as special. Use that on purpose.
- A line or dot leader between a label and its figure keeps them one unit.

### 5.7 One name per object
- Every object has one name, used on every screen, in every button and in every language. If the button says "Save", the result says "Saved", not "Added to favourites".
- Plain nouns and numbers carry information scent: they tell the user what is behind a tap. Clever labels lose it.
- Keep a vocabulary list and check new copy against it.
- In this app: the house style run wrote one vocabulary in six languages (place, trip, stop, day, getting there, bed, food) and marked it in the string catalogues.

### 5.8 States
Design every one of these for every component and screen:
- **Loading:** a skeleton shaped like the final layout, not a spinner; no layout shift when content arrives. A pending button keeps its label and shows an indicator only after 150 to 300 ms, so fast saves never flash.
- **Empty:** name the space and give the action ("No place fits", with Clear all). Never "No items yet" alone.
- **Error:** what happened, why, what to do, in plain words, without blame or apology. Focus moves to the first invalid field.
- **Missing value:** a word, never a blank or a zero. In this app: "Not yet", shown as a dashed part outside the sum.
- **Updating:** old values stay in place at reduced opacity with the word for "Updating"; nothing jumps.
- **Long strings:** every label at its longest translation at 360 px. German runs about 30 percent longer than English.
- **Hover, focus, active, disabled** for every control.

---

## 6. Three angles

Phone, tablet and desktop are three layouts, not one layout stretched. A desktop-shrunk phone screen and a phone screen with features cut off are both failures.

### 6.1 The sizes

| Angle | Design at | Also check | Notes |
|---|---|---|---|
| Phone | 390 x 844 | 360 (the floor) | Its own composition: own crop, own line breaks; `min-height: 100dvh`, not `100vh` |
| Tablet portrait | 820 x 1180 | 768 | Often a rail plus content, or list plus a sticky panel |
| Tablet landscape | 1180 x 820 | 1024 | Its own layout for the main screens, not the desktop squeezed |
| Desktop | 1440 x 900 | 1280 | The main reference |
| Wide desktop | 1920 | | Content keeps a sensible measure; no empty stretch |

### 6.2 The width sweep
Render each touched screen at 360, 390, 600, 768, 820, 1024, 1180, 1280, 1440 and 1920 px. The sweep fails on:
- any horizontal scroll (`document.documentElement.scrollWidth > innerWidth`);
- an element overflowing its parent or the viewport;
- a broken grid or a single orphan item on its own line;
- a control cut off instead of wrapping or moving into a More menu.

Make every grid track `minmax(0, ...)` so long words cannot push a column wider than the screen.

### 6.3 Touch and pointer
- Every hover affordance also has a tap path; hover is never the only way to reveal a control.
- Targets are 44 px on every device, not only phones.
- Carousels use native scroll snap on touch and show arrow buttons on pointer screens.
- Drag interactions have a button alternative (WCAG 2.5.7): a reorder list also offers Move up and Move down.
- Check both: emulate touch for phone sizes and use a mouse and keyboard at desktop sizes.

### 6.4 In this app
- Phone below 600 px: bottom bar. Tablet 600 to 1023: a side rail; one column up to 767, list plus sticky map from 768. Desktop from 1024: top nav. Wide from 1280: Explore adds the map column.
- From 768 to 1023 the Explore toolbar wraps or moves extras into a More menu; nothing is cut.
- The place page puts the price and its action in the first view at every angle: under the gallery on phones, in a sticky side column on tablet and desktop.

---

## 7. Interaction

The goal is a product that feels alive: every touch gets a short, physical response that confirms what changed, without slowing the task. One system, a handful of tokens, ten primitives.

### 7.1 Rules
1. **Respond in the next frame.** Every touch shows a state change within 100 ms: state first, motion second, heavy work deferred (in React, set the urgent state, then wrap the expensive update in `startTransition`).
2. **Motion says what changed and where it went.** If it explains nothing, drop it.
3. **Overshoot lives only on the control the finger touched:** at most 5 percent of its travel (the tick spring), about 13 percent for the Add icon (the pop spring). Never on content, figures, surfaces, markers or pages.
4. **One signature moment per screen;** everything else is primitives.
5. **Interruptible.** State changes ride on springs or transitions, never keyframes. The one exception is the shake of a refused submit.
6. **Never block input.** A surface is interactive from its first frame. A view transition lasts at most `--dur-3` and never snapshots the whole page.
7. **Figures move only when the user changed them,** one at a time, old to new (section 7.6).
8. **Haptics only on a touch commit** (section 7.5).
9. **The more often, the smaller.** Frequent actions (selecting, scrolling, switching tabs) get the least motion; rare ones (the first trip created) may get more.
10. **Reduced motion shows the end state at once.** Haptics have their own setting.

### 7.2 Tokens
Define every duration and curve as a token; never write a literal in a component. Generate CSS spring curves from the same spring definitions the JavaScript uses, so a CSS control and a JavaScript control move identically.

**Durations and curves (CSS):**

| Token | Value | For |
|---|---|---|
| `--dur-1` | 120 ms | Colour changes on press, select and hover; fast exits |
| `--dur-2` | 200 ms | State changes, reveals, tab content, figure dip, closing a sheet |
| `--dur-3` | 320 ms | The shared photo moving into a page header; longest view transition |
| `--dur-4` | 480 ms | Map camera moves; one-off draws |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Default entrance |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Markers, chevrons |
| `--dur-press` | 80 ms | Press-in |
| `--dur-tick` and `--ease-tick` | 300 ms, a `linear()` curve generated from the tick spring | Press release, switch thumb, check mark |
| `--dur-pop` and `--ease-pop` | 550 ms, generated from the pop spring | The Add icon only |
| `--dur-sheet` and `--ease-sheet` | 400 ms, `cubic-bezier(0.32, 0.72, 0, 1)` (the iOS sheet curve) | A sheet rising |
| `--press-scale` | 0.97 | Buttons, chips, switches, segments |
| `--press-scale-sm` | 0.92 | Icon-only controls up to 48 px |
| `--press-scale-lg` | 0.985 | Cards and rows (larger things move less) |
| `--press-shade` | 0.78 opacity | Press feedback |
| `--lift-scale` | 1.03 | A row picked up to reorder |
| `--dur-note` | 4000 ms | How long a delta note ("up €42") stays |

General duration guide for other products: 100 to 150 ms for feedback, 150 to 300 ms for state, 300 to 500 ms for overlays and views, 500 to 800 ms only for one focal entrance. Exits are faster than entrances.

**Springs (JavaScript, `motion/react` style, mass 1):**

| Name | Definition | Physics | Overshoot | Settled at | For |
|---|---|---|---|---|---|
| `tick` | visualDuration 0.18 s, bounce 0.3 | stiffness 846.2, damping 40.7 | 4.6 % | 300 ms | Only the control the finger touched |
| `pop` | visualDuration 0.26 s, bounce 0.45 | stiffness 405.6, damping 22.2 | 12.6 % | 550 ms | The Add icon only |
| `settle` | visualDuration 0.2 s, bounce 0 | stiffness 685.4, damping 52.4 | 0 | 400 ms | Figures, rows gliding, plates, the chosen pin |
| `surface` | visualDuration 0.32 s, bounce 0 | stiffness 267.7, damping 32.7 | 0 | 600 ms | Sheets, toasts, dialogs |
| `route` | visualDuration 0.36 s, bounce 0 | stiffness 211.5, damping 29.1 | 0 | 700 ms | A page pushed by script (not the view transition) |
| `reveal` | visualDuration 0.64 s, bounce 0 | stiffness 66.9, damping 16.4 | 0 | 1100 ms | Marketing pages only |
| `fling` | stiffness 400, damping 40 | | 0 | 500 ms | Every gesture release; keeps the finger's velocity |

Motion maps `visualDuration` to physics as stiffness = (2π / (1.2 x visualDuration))² and damping = 2 x (1 minus bounce) x √stiffness. The CSS `linear()` strings come from the library's own `spring(...).toString()`. `linear()` easing is supported in Chrome 113, Firefox 112 and Safari 17.2.

In this app: the springs live in `continent-app/src/lib/motionTokens.js` (the research called `settle` "quick"); the CSS curves are generated by `continent-app/scripts/ci/spring-easings.mjs`. Change a spring there, run the script, paste its output; never edit a `linear()` string by hand. Every transition goes through one token function that returns `{ duration: 0 }` under reduced motion.

### 7.3 The primitives
Every interactive moment maps to one of these ten. If something does not fit, ask whether it should move at all.

| Primitive | Where | What moves | Haptic | Reduced motion |
|---|---|---|---|---|
| **Press** | Every pressable | In: scale to the press token and opacity 0.78 over `--dur-press`. Out: scale back on the tick curve, opacity over `--dur-1` | None | Shade only |
| **Select** | Chips, segments, choice rows, date cells, sort | Fill over `--dur-1`; a mark scales from 0.5 to 1 on `tick`; the segment marker slides on `settle`. The control keeps its width: reserve the mark's slot in both states | `tick` | Instant |
| **Toggle** | Switch | Thumb moves on `tick`; track colour over `--dur-1`; a pressed thumb stretches `scaleX(1.15)` from its resting side. State also shown by position and a mark | `tick` | Instant |
| **Add** | Save, add a stop, add to trip | Icon swaps outline to filled from scale 0.6 on `pop`; the destination's count swaps and its icon nudges once (1, 1.12, 1 over `--dur-tick`); a toast names where it went, with Undo | `confirm` | Instant swap, toast appears |
| **Remove** | Remove, unsave, clear | Fades over `--dur-1`; neighbours close the gap on `settle`; Undo toast for at least 6 s, paused while touched, hovered or focused | `tick` (removing is a choice, not an error) | Instant |
| **Reveal** | Folds, show more, popovers, menus, inline errors | Opacity 0 to 1 and a 4 px drift over `--dur-2`; height snaps; chevron rotates over `--dur-2`; popover scales 0.96 to 1 from its trigger; exit over `--dur-1` | None | Instant |
| **Count** | Totals, counts, steppers | Only the changed characters swap, old to new, on `settle`; the leaving glyph is gone in 120 ms; a delta note for `--dur-note`; many figures at once share one opacity dip | On the stepper, never on the figure | Instant |
| **Reflow** | Filter results, sort | Staying rows glide on `settle`; entering rows fade over `--dur-2`; leaving rows fade over `--dur-1`; no per-row stagger; only when at most 24 rows are mounted and the user changed something, else instant | None (the control already ticked) | Instant |
| **Sheet** | Phone sheets, desktop dialogs | Rises over `--dur-sheet`; drags 1 to 1; 0.25 resistance past the edge; closes past 30 percent of its height or at 0.5 px per ms; else returns on `fling`; closes over `--dur-2`. Desktop: scale 0.97 to 1 with opacity over `--dur-2` from the trigger | None (an optional `tick` when a drag crosses the close threshold) | Instant; the drag still follows the finger |
| **Route** | Page and tab changes | Bottom-nav tabs: content fades and rises 8 px over `--dur-2` while header and nav hold still. Drill-in from a card: the photo becomes the page header over `--dur-3`. Other pushes: 24 px slide with opacity over `--dur-2`. In-page tabs slide 16 px toward the tapped tab. Scroll restored on back | None | Instant |

Two more recipes:
- **Refused submit:** focus moves to the first invalid field, its message appears (Reveal), the field group shakes once: x 0, -6, 6, -4, 4, 0 px over 300 ms. `warn`. Reduced motion: no shake.
- **Success:** only for real outcomes (a booking read, a trip created, a payment done), never for routine saves. A drawn tick plus `confirm`.

### 7.4 One signature moment per screen
Each screen gets one authored moment; everything else stays primitives. Animation soup (many small effects with no focus) is a tell.

In this app:

| Screen | The one moment |
|---|---|
| Explore | Choosing a pin or row: the row paints and its price settles into an umber plate; the pin lifts |
| Place page | The card's photo becomes the page header on arrival |
| Plan and trip finder | The found trip's route draws once (capped at 900 ms) |
| Trip page | Adding a part couples it into the trip like a wagon and the total swaps with its delta note |
| Day planner | A moved block lifts, ticks through slots and settles |
| Account, settings, auth, legal | None: quiet screens, switches only |

### 7.5 Haptics
**Support, late 2026:** `navigator.vibrate` works in Chrome for Android, Samsung Internet and a Play Store wrapper of Chrome. Firefox removed it in version 129 (August 2024). Safari on iOS has never had it. On iOS the only web route is the `<input type="checkbox" switch>` control, whose toggle plays the system tick from iOS 18; reports say programmatic toggles stopped working in iOS 26.5 (unverified, no Apple note). Treat iOS web haptics as a bonus, never a promise. In a native wrapper such as Capacitor, use its haptics plugin, which calls the platform's own feedback generators.

**Three words, no more:**

| Word | Means | Use for | Android pattern | Native wrapper |
|---|---|---|---|---|
| `tick` | A value you changed landed | Chip, segment, switch, stepper, date cell, sort, a drag crossing a slot | `10` ms | Light impact; selection events during a drag |
| `confirm` | Something was kept or created | Saved, stop added, trip created, form saved | `[10, 60, 14]` | Success notification |
| `warn` | It did not work | Submit refused, save failed | `[20, 80, 20]` | Error notification (warning for validation) |

Pulse lengths are starting values: calibrate 8, 10 and 12 ms on two real phones, one a budget model, and keep the shortest one that is felt. Android's own guidance: a key click should last 10 to 20 ms, and "given the choice of buzzy haptics or no haptics, choose no haptics".

**Rules:**
- Fire on the commit (the click or change handler), never on `pointerdown`: a finger landing may be the start of a scroll.
- Never on navigation (tabs, links, back, opening a page), on opening or closing a sheet or menu, on scroll, carousel swipes, map pan, on load, on timers, on data the user did not ask for, or on another person's edit.
- Never on mouse, pen or keyboard input; track the last input type.
- Never twice for one action: if the control ticks and a toast confirms, pick the stronger one.
- Never more than once per 50 ms (two pulses closer than that smear into a buzz), and no pattern longer than about 120 ms.
- Never the only signal: every haptic has a visible and announced counterpart.
- Call it synchronously inside the user's handler; after an `await` the browser may refuse.
- Only kit components call the haptics utility; screens never call `navigator.vibrate` directly.

**The setting:** a "Vibrate on tap" switch in settings, shown only where the device has a working route. Three stored states per device: on, off, absent. Absent follows a default (on, except off when the system asks for reduced motion). An explicit choice wins either way, because haptics are not visual motion. Store it with try and catch; if storage is blocked, the default applies.

In this app: `continent-app/src/lib/haptics.js` holds the three patterns, the 50 ms gap, the setting and the iOS switch route.

### 7.6 Numbers that move honestly
1. **Only the user's own change moves a figure,** and only within one second of it. Everything else swaps silently. Do not animate while the user scrolls (a 250 ms quiet period after the last scroll event works).
2. **Old to new, nothing in between.** A frame shows the old glyph or the new glyph, never a third value. No count-ups (a count-up shows dozens of wrong figures on the way to the right one) and no digit spins through intermediate digits.
3. **One rolling figure at a time.** When many figures change together (a date change reprices ten rows), they share one opacity dip, started in the same frame.
4. **Tabular figures and a stable box.** Right-align so a new digit grows to the left and the unit does not jump.
5. **Short.** Visually done in about 200 ms.
6. **Direction is information.** New digits come from below when the value rose and from above when it fell, and a delta note says it in words ("up €42"), so direction never rides on motion or colour alone.
7. **One formatter.** The animation works on the formatted string; it never formats on its own.
8. **Read once.** The animated glyphs are `aria-hidden`; a visually hidden copy holds the full value; one polite live region announces the outcome (section 8).
9. **Never a scale bump on a figure.** Nudge a badge or icon instead.
10. **List order never changes while the user reads.** Only their own sort or filter reorders; a refresh they did not ask for never does.

### 7.7 What never animates
1. A figure the user did not change (refreshes, someone else's edit).
2. List order while the user reads.
3. Paragraphs, labels and headings in app screens. Streaming text that really streams is not an effect.
4. The map camera on its own.
5. Anything at the first paint of an app screen: no entrance choreography, no fade-up rows, no stagger.
6. Hover beyond a `--dur-1` colour change; focus rings at all.
7. Keyboard shortcuts and keyboard focus moves.
8. Loops, except a real loading indicator.
9. Blur of any kind; scale on text-heavy cards below the large press scale.
10. Confetti, particles, sparkles, sound.
11. Anything tied to scroll position (no parallax, no scroll-scrubbed motion).
12. DOM overlays while the map camera moves.

In this app, also: price plates and the chosen pin settle without overshoot, and the pin drop runs only when the traveller opens the map, never at first paint.

### 7.8 Performance
- Animate `transform` (or `translate`, `scale`, `rotate`) and `opacity`. Colour may change over `--dur-1` on press or select.
- Never animate a CSS custom property: it is not hardware accelerated and every descendant restyles.
- Never `transition: all`.
- Lifted shadows: draw them once on a pseudo-element and animate its opacity, never `box-shadow`.
- Heights snap; fade the content instead.
- No `filter`, `backdrop-filter` or blur animation on phones.
- `will-change: transform` only on an element about to move under the finger, removed on release; never on a rule that matches a list.
- INP (time from tap to next painted frame) at or under 200 ms on a budget Android at 4x to 6x CPU slowdown; no long task over 100 ms on a chip tap.
- At most one signature moment plus the touched control's feedback running at once.

---

## 8. Accessibility floor

These bind on every task. A design that fails one is not finished, however it looks.

### 8.1 Contrast
- Text: at least 4.5:1 against its ground (WCAG 1.4.3). Large text (24 px, or 18.66 px bold) at least 3:1.
- Marks that carry meaning (control borders, focus rings, chart marks, icons without a label, the selected state): at least 3:1 (WCAG 1.4.11). Decorative marks are exempt but must not lower text contrast.
- Compute it, never judge by eye. Every new colour token joins the project's contrast check, or it is unchecked.
- Text over a graphic or photo: measure against the worst pixel (section 4.3).
- Secondary text on a coloured ground is tinted from that ground's hue, not plain grey.
- In this app: `node scripts/ci/token-contrast.mjs` (in `continent-app/`) checks every token pair at 4.5:1 for text and 3:1 for marks, and checks tints stay visibly apart. Minimum text size is 12 px.

### 8.2 Targets
- 44 px minimum for every target on every device (WCAG 2.5.8 asks 24 px; the project floor is higher). In this app: the `--tap` token is 44 px and `--tap-main` is 48 px; segmented buttons are 44 px high.

### 8.3 Focus
- Every interactive element shows a visible focus ring with at least 3:1 contrast; never `outline: none` without a replacement.
- Focus rings never animate.
- A sheet or dialog takes focus when it starts to open; a closing one is `inert` at once and focus returns to its trigger.
- A page change focuses the new page's heading.
- A removed row moves focus to the next row's same control.

### 8.4 Colour never alone
- Selected, on, changed, error and category states also carry a mark, a position, a shape or a word (WCAG 1.4.1).
- Run the grayscale test on every screen.
- In this app: kind colours always come with a pictogram and a word; the food wagon is told apart by its position and icon, not only its beige.

### 8.5 Motion and time
- Reduced motion shows the end state at once. This is stricter than some libraries: Motion's `reducedMotion="user"` still runs opacity and colour animations, so wrap every transition in a token function that returns `{ duration: 0 }`.
- Nothing moves on its own for more than 5 seconds without a pause control (WCAG 2.2.2).
- Undo toasts stay at least 6 seconds and pause while touched, hovered or focused (WCAG 2.2.1).
- If a surface is translucent, give it an opaque value under `prefers-reduced-transparency: reduce`.
- Test: emulate reduced motion, trigger a primitive, assert `document.getAnimations().length === 0`.

### 8.6 Screen readers and changing figures
- One polite live region in the app shell (`role="status"`, visually hidden) and one `announce()` helper that waits about 600 ms after the last call and announces only the latest message. A stepper pressed five times reads once: "3 people. Trip total €1,240, up €42."
- Never put `aria-live` on an animated figure; assistive tech would read the glyph churn.
- Selection state is announced by the control itself (`aria-pressed`, `aria-checked`, `aria-selected`); do not announce it again.
- Use `assertive` only for an error that blocked a submit.
- Decorative graphics are `aria-hidden`; meaningful graphics have a text equivalent next to them.
- Icon-only buttons have an accessible name.

### 8.7 The automatic floor
- axe: zero serious and zero critical findings on every touched screen. In this app: `scripts/verify_axe.mjs` in `continent-app/`.
- Zoom to 400 percent: no lost content, no horizontal scroll.
- Forced colours: graphics dropped, every control still visible.

---

## 9. The AI-slop catalogue (2026)

How to use it: scan a screenshot against every line. Two or more hits means the screen will read as generated. The fix is never "swap in the next default": if you land on cream and clay, or black and neon, you replaced one default with another.

Background: writers describe two waves. The first wave (purple gradients, Inter, three cards, glass) was widely banned in 2025; a second wave of replacement defaults appeared after that. One source attributes the second-wave list to an update of an AI design skill in September 2026; that attribution is unverified, the observations agree across sources. Also: any single item can be right in context. The tell is unexamined repetition.

The detector in one sentence: if you can swap the product's name and nothing else changes, it is slop; if the structure survives a name swap and a content swap, it is a template.

### 9.1 Layout
- **Stock page order** (centred hero, pill badge, two buttons, logo row, three cards, pricing, closing call): lead with the product's most characteristic element, such as a real result.
- **Three identical feature cards** with icon, heading and line: unequal modules shaped by content, or a table or sequence.
- **Everything in a rounded container with one soft shadow:** group with space, alignment and rules; rows for tabular data.
- **Cards inside cards:** one container level.
- **Everything centred:** left-aligned with deliberate asymmetry.
- **One spacing value and one radius everywhere:** a scale with big gaps between groups and small inside; radius by role.
- **Hero metric layout** (big number, small label, supporting stats): show the figure in context with its job.
- **Generic nav and footer** (logo left, centred links, button right; four link columns and social icons): shape them from the product's own structure.
- **Bento grid for its own sake:** a grid only when modules truly differ in importance.
- **Desktop shrunk to phone, or phone with features cut:** recompose per angle, keep every feature reachable.
- **Everything visible at once:** progressive disclosure; totals first, items on tap.
- **The same macrostructure on every screen:** a different composition per kind of screen, one system underneath.

### 9.2 Colour and surface
- **Purple or indigo to blue gradient,** often on headline text: a named palette with roles; no gradient text.
- **Cream ground, high-contrast serif and a terracotta or clay accent** (about `#F4F1EA` with about `#D97757`): derive colour from the product's own world.
- **Near-black with one acid green or vermilion accent,** cyan on dark, glow: same fix.
- **Pure black and pure white,** grey text on a coloured ground: tinted neutrals; text tinted toward its ground.
- **Aurora blobs, floating orbs, mesh washes:** a graphic with a rule and a meaning (section 4).
- **Glass and blur without purpose,** glowing borders: blur only on a fixed layer for a stated reason.
- **A thick coloured stripe on one side of a card** (the most cited sign of generated UI), and its cousin, a coloured top border on panels: mark with a plate, a hairline or a tint.
- **The same translucent shadow on every rounded rectangle:** one depth language; a border or a shadow, not both.

### 9.3 Type
- **Inter or the system font alone:** a deliberate pair with a role for each.
- **A serif display on every headline** (the 2026 reflex): a serif only where the voice calls for it.
- **One weight on the whole page:** hierarchy by weight and width.
- **Monospace as "technical" costume,** mono small-caps labels: mono only for true measurements.
- **A tracked all-caps eyebrow above every heading,** and meta strings joined by middle dots: a plain heading; separate facts with space or layout (eyebrows as a tell come from one source only).
- **One italic or coloured word in a headline;** 01, 02, 03 markers on content that is not a sequence: remove them.
- **Figures without tabular numbers,** misaligned digits: tabular figures, right-aligned.
- **Straight quotes, double hyphens for dashes, three dots for an ellipsis,** unbalanced wraps: real punctuation, `text-wrap: balance` on headings.
- **Reflex fonts** (per `impeccable`): Fraunces, Playfair, Cormorant, Lora, Newsreader, Syne, Space Grotesk, IBM Plex, Inter as display, DM Sans, Outfit, Plus Jakarta Sans, Instrument Sans. Use one only with a reason no other face satisfies.

### 9.4 Imagery and icons
- **Generic generated vector illustration,** 3D blobs, people at laptops, fake browser or phone frames: diagrams that explain, or real product screens.
- **Emoji as icons, mixed icon sets, large rounded icon tiles above headings:** one drawn set, one stroke.
- **Decorative sparklines or charts that carry no data:** remove, or show real data.
- **A sparkle icon for AI:** a plain word or tag.
- **Stock photos unrelated to the product, images as wallpaper behind text, placeholder photo services:** licensed, credited photos with one treatment; text never on a photo.
- **AI-generated photos of real places:** never.

### 9.5 Copy
- **Filler headlines** that fit any product ("Build the future of work"): a verb and a number.
- **Invented metrics, fake logo strips, placeholder names, round fake numbers:** every figure traces to data.
- **"Get started", "Submit", "Click here", "OK":** verb plus object ("Plan a trip here").
- **Vague or blaming errors; "No items yet" with no action:** what happened, what to do; name the space and give the action.
- **A heading followed by an intro that repeats it:** cut the intro.
- **Title Case Headings, "Oops!", exclamation marks on success:** sentence case, calm statements.

### 9.6 Motion
- **Fade-up on every section,** animate-on-scroll everywhere: one authored moment per screen; app screens have no entrance choreography.
- **Count-up statistics:** old to new, nothing in between.
- **Bounce or elastic easing on content:** springs without overshoot; a small overshoot only on the touched control.
- **Animating width, height, margin:** transform and opacity.
- **Heavy libraries or 3D for a still object, Lottie for simple effects, autoplay sound:** CSS first, then the platform animation API, then a library.
- **Animation soup:** small effects with no focus; pick one moment.
- **Hover lift on every card:** a colour change at most.

### 9.7 Components and code
- **Every button primary:** one primary per area.
- **A modal for everything:** inline panel, drawer, in-place edit.
- **Hover-only affordances:** a tap path for everything.
- **Missing loading, empty and error states:** design all of them (section 5.8).
- **Inline values instead of tokens, `z-index: 9999`, `width: 100vw` overflow:** tokens only; the z-index scale; `minmax(0, ...)` tracks.

### 9.8 Forbidden defaults (from the November 2026 house style plan)
Treat these as hard bans in this app and as a strong default for any product:
- The crew design list: purple to blue gradient, centred hero with two buttons, three identical feature cards, glassmorphism and blurred blobs, Inter or the system font alone, stock 3D or people-at-laptops illustration, emoji icons, fake logo strips, one big radius everywhere, filler copy.
- The 2025 to 2026 AI tells: cream ground with a serif display and terracotta accent, the dark neon gradient "tech" look, bento grids for their own sake, gradient text, a sparkles icon for AI, card inside card inside card, an eyebrow kicker above every heading, everything centred.
- Travel clichés: dotted world map, plane with a dashed trail, globe icon, polaroid stacks, handwritten "wanderlust" script, passport stamps as wallpaper, compass rose logo.
- In this app only: the old "Lagoon" look as a whole (warm grey ground, white rounded cards, a clone of a big rental site's structure). The umber brown itself stays, by owner rule, inside the new system.

---

## 10. Verification and judging

### 10.1 Order of checks
1. **Mechanical checks, green before you look.** Lint, tests, build, the design lint, the contrast script, axe, docs checks. In this app, in `continent-app/`: `npm run lint`, `npm test`, `node scripts/ci/design-lint.mjs`, `node scripts/ci/token-contrast.mjs`, the matching `scripts/verify_*.mjs`, `scripts/verify_axe.mjs`, the fast build from `CLAUDE.md`; at the root the two docs checks. The design lint fails on hex colours outside `:root`, gradients, literal shadows, missing outlines, em dashes, middots, banned words, marquee or parallax, literal font sizes, radii, z-index and motion values. It is baseline-based: it fails only when a violation count rises.
2. **DOM checks over screenshots wherever a script can assert it.** Horizontal scroll, overflow, target sizes, focus order, the number of running animations under reduced motion, haptic calls (stub `navigator.vibrate` in a touch context: one call with `10` for a chip tap, none for a scroll, `[10, 60, 14]` for a save), honest figures (record every value of a total during a change; only the old and new values may appear).
3. **Screenshots at three angles:** 390 x 844, 820 x 1180 (and 1180 x 820 for main screens), 1440 x 900, plus the width sweep. Capture states too: empty, loading, error, long translation, reduced motion. Screenshots go in the run folder and are never committed.
4. **Look once, batched.** All angles together, one critique pass, one batch of fixes, one confirm round, stop.
5. **A fresh judge.** Someone (or a new agent session) who did not see the work being made scores screenshots plus code against the rubric. Never from a description. A clean detector scan is a floor, not proof.
6. **Report two lists:** "checked, with evidence" (a ratio, a grep, a `file:line`, a screenshot) and "not verified". A tick without evidence is not a finding.

### 10.2 Rubric template
Score each criterion 0 to 5. Multiply by the weight. "Hard" criteria must reach their pass mark whatever the total. The total maximum is 135.

| # | Criterion | What a 4 looks like | Weight | Pass at |
|---|---|---|---|---|
| 1 | Ownable and custom | With the logo hidden, a screen is recognisably this product: at least three signature elements from the product's own world, including a background graphic system; nothing from the forbidden defaults; no screen could pass for a template | 3 | 4 |
| 2 | Clear and minimal | Each screen's job and main action obvious in 5 seconds at phone and desktop; clear reading order; dense data scannable; decoration never competes with figures; no redundant text | 3 | 4 |
| 3 | One coherent system | Every screen uses the same tokens, components, motifs, motion and voice; no per-screen styles; graphics follow one rulebook | 3 | 4 |
| 4 | Craft | Spacing, type, alignment and states finished; loading, empty and error designed; no layout shift; no visual bugs from 360 to 1440 | 2 | 4 |
| 5 | Accessibility (hard) | AA for every text and mark pair, 44 px targets, focus visible, reduced motion shows the end state, colour never alone, axe serious and critical 0 | 2 | 4 |
| 6 | Honest numbers and copy (hard) | Every figure through the one formatter and traceable to data; copy rules met (no banned words, no dashes as pauses, sentence case); every supported language | 2 | 4 |
| 7 | Reusable documentation | The design docs let a fresh session make on-style work for any screen without the run's context; precise values, do and don't, examples | 2 | 4 |
| 8 | Fits the codebase, checks green | Tokens in the token file, shared kit used, design lint no new violations, tests, lint, build and docs checks green | 1 | 3 |
| 9 | Feels alive | Every selection, toggle, add, save, step and screen change has a designed, consistent response from one interaction system; it confirms what changed and never delays the task; reduced motion shows the end state | 3 | 4 |
| 10 | Every size, three angles (hard) | Its own layout at phone, tablet and desktop; screenshots at 390, 820, 1180 and 1440 look deliberate; sweep 360 to 1920 shows no horizontal scroll, broken grid or orphan; touch and pointer both work | 3 | 4 |
| 11 | Every function intact (hard) | Nothing the product does today is missing or changed: every feature, control, filter, flow step, setting and data field works as before; only look, layout, motion and wording changed; tests green. In a prototype: every control of today's screen is present | 3 | 5 |

Calibrate criterion 1 before scoring: write what a 2 and a 4 look like for this product (section 3.4 has this app's calibration). For a small task, score only the criteria the task touches.

### 10.3 Review questions for the judge
- What is this screen's one job, and did I see it in 5 seconds?
- What is the dominant element? Is it the right one?
- Which three signature elements are visible? Where in the product's world does each come from?
- Which slop lines (section 9) does it hit?
- Does every selection, toggle, add, save, step and screen change map to one primitive? Is there exactly one signature moment?
- Does anything move a figure the user did not change?
- Which text sits closest to a graphic, and what is its measured contrast?
- Is any function of the old screen missing?

---

## 11. Pre-ship checklist

Answer each line yes or no. Every no needs a fix or a written reason in the report.

1. Does each touched screen have one named job, one main action and one dominant element, visible at 390 px?
2. Do all figures sit on a flat ground, in tabular figures, aligned, with the unit said once?
3. Does every euro (or other money) go through the one formatter, and does every figure trace to real data?
4. Is every text and mark pair measured at 4.5:1 for text and 3:1 for marks, including text near graphics at the worst point?
5. Are all targets at least 44 px, focus visible, and tab order the same as reading order?
6. Does the grayscale test pass (colour never the only carrier)?
7. Are at least three signature elements from the product's world visible, and nothing from the forbidden defaults?
8. Do background graphics follow the rulebook: real source, aria-hidden, under budget, absent behind small text and figures, dropped in forced colours?
9. Are loading, empty, error, missing value and long translation states designed?
10. Is redundant text cut (no unit sentences, no sublines the context gives), with one name per object?
11. Does the copy pass: verb plus object on buttons, sentence case, no em or en dashes, no middots, no banned words?
12. Are only tokens used (no literal colour, size, radius, shadow, z-index or duration), with one container level and one primary action per area?
13. Does every interaction map to a primitive, with one signature moment per screen, and only user-changed figures moving old to new?
14. Do haptics fire only on touch commits, through the kit, with a setting, never on navigation or `pointerdown`?
15. Does reduced motion show the end state with zero running animations?
16. Were screenshots taken at 390, 820, 1180 and 1440, and did the sweep from 360 to 1920 show no horizontal scroll?
17. Do touch and pointer both work, with no hover-only path?
18. Is every function of the old screen still present and working, with tests and verify scripts green?
19. Did a fresh judge score it from screenshots and code, and is every hard criterion at its pass mark?
20. Did token changes update `DESIGN.md` in the same commit?
