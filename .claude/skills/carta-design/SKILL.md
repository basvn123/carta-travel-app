---
name: carta-design
description: Carta's design language and way of working, distilled from what the owner approved. Use for any change a traveller sees in Carta (continent-app): a screen, a section, a component, a colour, motion, copy, a recording of the app, or the home page. Always pairs with the impeccable skill. Warm, human, clean, compact, dynamic, honest about money.
---

# Carta design

Carta plans a whole trip in Europe in one place, with what each day really costs. "A cheap flight is not a cheap trip": Carta adds the bed, the food and every day there. The traveller counts money, so trust in the numbers is the product. The design has to feel **warm and human, clean, compact, dynamic, and honest**.

This skill is the owner's taste, written down. It says what to aim for, how to build it and how to check it. For app surfaces it does not cover in detail (Explore, maps, receipts, the planner, money formatting edge cases, dialogs), read `references/app-rules.md`. Token values live in `continent-app/src/styles/01-tokens.css` (mirrored in `assets/tokens.css` and `DESIGN.md`).

## 1. Design freedom, and what still binds

The owner has said it twice: "you have full freedom", "you can ignore the design rules". Look rules (two base colours only, no gradients, no illustration, quiet motion) are **defaults, not bans**. Go further wherever it makes a screen more modern, clean and visually top notch: colour worlds, a soft gradient or glow, richer motion, bolder type, more depth. Say in the task report what departed from the defaults and why.

What still binds, because it protects the traveller:

- **Accessibility.** Text contrast 4.5:1 (3:1 large), 44 px touch targets, visible focus, `prefers-reduced-motion` honoured, colour never the only carrier, real `<a>` and `<button>`, keyboard paths for everything a pointer can do.
- **Honest numbers.** Every euro through `formatMoney()`. No made-up figures, no fake social proof. A missing figure is `NotYet` or the section hides; never a guessed number. The flight price is Google Flights', never Carta's own.
- **Honest claims.** A sentence must match the data. Example: food per person does not move with the number of people, so "food moves with your people" is wrong; "how you like to eat" is right.
- **Copy rules.** No em or en dashes anywhere (code, copy, docs, reports). Six languages through i18n keys (en, nl, de, fr, es, it). Plain words.
- **Licensed photography** with its credit; never AI-generated photos of places.

## 2. Always use impeccable

Every design task runs through the **impeccable** skill. It is the craft engine; this skill is the brand.

1. **Context first.** Run `impeccable context --target <file>` once per session (launcher in the impeccable skill folder). Then read the surface brief for the area (`impeccable surface-brief read <path>`, e.g. `continent-app/.impeccable/surfaces/continent-app-src-browse-home.md`).
2. **Pick the command.** `polish` to refine, `animate` for motion, `layout` for spacing and rhythm, `distill` to strip and compact, `bolder` or `delight` for wow, `critique` or `audit` to evaluate, `clarify` for copy. Name the mode: the home page is **Persuade**, app screens are **Operate**.
3. **Read `reference/craft-floor.md`** right before editing UI. It holds the quality floor (contrast, depth, spacing, type, motion, states, browser surfaces).
4. **Detector after.** When the UI is finished, run `impeccable detect --json <changed files>` once and fix what it finds.
5. **Bounded verification.** Build fully, inspect once at desktop and phone together, fix everything in one batch, confirm once more, stop. No open-ended polishing loops.

## 3. What the owner liked

These were praised or asked for directly. Treat them as the north star.

- **The home page v3** ("I absolutely love it"):
  - a full-bleed film with the slogan words lifting in;
  - the deep umber "real cost" panel rising over the film;
  - the proof that the flight is a small share of the week;
  - the tour of the app shown with real recordings;
  - a hands-on "Try it".
- **One coherent composition.** "It needs to still be one coherent top part." Sections share one card, one shadow, one type scale, one set of springs and one set of cost colours. Never a different style per section.
- **Blend in cleanly.** Nothing floats detached under a card. A row of pills sitting loose under the proof card was the thing to fix: fold such ideas into the object they explain.
- **Compact.** "The user doesn't want to scroll too much." Five stacked feature sections (3,500 px) became one stage (1,180 px).
- **Dynamic, with a wow.** "More dynamic, more clean, more wow feeling", "bring it to the next level". Motion that means something: things add up, light up, follow the clip.
- **Show what you can do.** Capabilities must stand out and be felt, not listed flatly.
- **Human and warm.** Warm grounds, duotone icons, soft depth, plain sentences.
- **Up to date recordings.** Every chapter plays a recording of the app as it is today, in every language.
- **Fewer words.** The "Planning is free. A Trip Pass adds exports..." sentence was removed from home.

## 4. The look

**Palette.** One warm brown does action and selection (`--action`, umber 600). Saffron (`--sun-400`) marks best value and the flight. Lagoon teal (`--lagoon-600`) is food and "fits". The grounds are warm paper (`--surface-page`) and mist (`--home-ground-mist`, umber 100); the deep umber (`--home-ground-deep`) carries the real-cost act. Ink is blue-grey (`--text`), never black.

- **Cost colours, everywhere a cost is drawn:** flight `--sun-400`, bed `--action`, food and drink `--lagoon-600`.
- **Tones** (a colour world per item, from tokens only):
  - sun: `--sun-400`, ink `--sun-800`, ground `--sun-100`
  - lagoon: `--lagoon-600` / `--lagoon-700` / `--lagoon-100`
  - umber: `--umber-600` / `--umber-700` / `--umber-100`
  - mist: `--umber-500` / `--umber-800` / `--umber-50`
  - sea: `--lagoon-700` / `--lagoon-800` / `--lagoon-50`

**Type.** Figtree only, tabular figures. Heavy display for showcase headings (`--text-showcase`, weight 800, -0.035em, `text-wrap: balance`). Chapter titles `--text-feature`. Big totals `--text-total` and `--text-display`, weight 800, tight tracking. Home sections may open with a small uppercase kicker in `--action` (the owner kept these on the home page).

**Icons.** Phosphor, duotone weight (`ICON = { weight: 'duotone', size: 22 }`), `currentColor`. They read warm, not technical.

**Shape and depth.**
- Cards and panels `--radius-stage` (28 px); photos `--radius-card` (16 px); pills round.
- The soft umber shadow that makes cards feel lifted and warm:
  `0 1px 2px color-mix(in srgb, var(--umber-800) 6%, transparent), 0 24px 60px -28px color-mix(in srgb, var(--umber-800) 28%, transparent)`
- One elevation per object: a border or a shadow, not both.

## 5. Patterns that worked

**The Carta card** (proof, Try it): white `--surface`, `--radius-stage`, the soft umber shadow, `overflow: hidden`, built in bands:
1. The main content (bars, a ruler, a figure).
2. Supporting lines (what each part is, what moves it).
3. A **foot strip** on `color-mix(in srgb, var(--home-ground-mist) 55%, var(--surface))`, holding one bold sentence and a note on the left and the one primary button on the right (full width on a phone).

**The cost bar.** One full-width bar split into segments with 3 px gaps, rounded outer ends, the share printed inside a segment when it is wide enough (white text; ink on saffron). What a competitor leaves out is drawn as an empty dashed track (`2px dashed var(--umber-200)`), so the missing part is visible, not only absent.

**Cost lines.** A 40 px icon tile tinted from its cost colour (`color-mix(... 14 to 22%, var(--surface))`), the label with a caption saying what moves it, the figure and its share on the right. Three columns on desktop, stacked receipt lines on a phone.

**The stage** (the tour):
- **Desktop:** a column of chapters as tabs on the left with the open chapter's panel under it; one large phone (292 px) on a tinted ground with a soft radial glow on the right.
- **Phone:** a row of tab pills, the stage, then the panel.
- **The panel:** title, three capability lines, then the door ("Ask Carta" with an arrow).
- **While the clip plays:**
  - The lines light up as the clip reaches them, at a third and two thirds.
  - The newest lit line also appears as a white note pill beside the phone.
  - Each tab has a timer bar that fills with its clip.

**The price ruler** (Try it): the budget figure set large, then a slider whose track holds a dot per place at its own price. Saffron is best value, teal fits, hollow is over. The native range input sits on top for keys and screen readers. Under it, photo cards at 4:3 with the name and price on one line. Over-budget places keep some colour (`saturate(.35)`, opacity .7) and say how much over ("€5 over"). Never full greyscale.

**Buttons.** One primary per view, with an arrow that nudges 3 to 4 px on hover. Links that only navigate are links.

## 6. Motion

Use the **Motion** library (`motion/react`) through the home kit `src/browse/home/motionKit.jsx`:

- **Springs:** `SPRING.quick` (0.2 s), `SPRING.surface` (0.32 s), `SPRING.reveal` (0.64 s), all bounce 0. A small bounce (0.25 to 0.45) is fine for tiny arrivals such as a note pill or a ruler dot.
- **Building blocks:** `MaskedText` for headings whose words lift in once, `Reveal` for blocks that rise once, `HomeMotion` at the root (LazyMotion, reduced motion follows the user).

One **signature moment per section**, each one meaning something:

- **Things add up.** A total counts up from a meaningful start (the flight's price) to the week's total, once, in the money format, with a fixed-width ghost so nothing shifts.
- **Things grow in order.** Bar segments grow from the left, about 140 ms apart; the lines that explain them arrive as each segment lands.
- **One sheen.** A light sweep crosses the finished bar once, never looping.
- **Things light up on cue.** Capability lines light in step with the recording.
- **Crossfade, never jump.** A clip change is a short fade and settle (`scale 1.04` to `1`); the frame never moves.

Rules:
- Nothing loops except a recording the visitor chose.
- Nothing is tied to scroll position; things arrive once.
- Under reduced motion everything is already there: totals shown, all lines lit, no autoplay.
- **No pause or play icons** (owner decision). Something that moves by itself plays through once and is controlled by its own tabs: a tap takes over for good, and pointer or focus on the tabs holds it. Note the WCAG 2.2.2 trade-off in the report.
- Nothing plays in a hidden browser tab or off screen.

## 7. Recordings of the app

The app is shown by **real recordings of the app**, never mock-ups. `continent-app/scripts/record_home_clips.mjs` records each chapter in all six languages at a 390 x 844 phone (2x), written to `public/home/clips/<lang>/<id>.mp4` and `.webp` (546 x 1182).

- **Record the screen the copy promises.** Together means the group trip with members, a shared budget and Settle up, not the hub.
- **Start clean.** Wait for the target view's own element, scroll to the top, then record. Never open on a half-loaded or wrong page.
- **Scroll the right container.** Glide the chat (`.ac-body`), the place page (`.pt-scroll`), the trip page (`.tpg-body`) or the day drawer, never the page behind a sheet.
- **No fixture artefacts.** Hide test-only states a traveller never sees, such as the seam's moderation notice in My trips.
- **Check every clip.** Make a frame strip with ffmpeg (first, middle, late) and look at it before shipping.
- **Size budget:** each clip 20 KB to 1.6 MB, enforced by `tests/home.test.mjs`. The tour plays `TOUR_CLIPS` (`src/lib/homeDemo.js`).
- **How to run:** `npx vite --port 5203 --strictPort` with `VITE_E2E_SEAMS=1` (never `npm run dev`), then `node scripts/record_home_clips.mjs --port=5203 [--lang=..] [--only=..]`. Record the home page's own clip last, after code edits, so hot reload cannot disturb it.

## 8. Copy

- Plain, warm, specific, short. A heading carries a verb or a number: "The flight is 18% of what the week costs.", "From a question to the day you go", "Where your budget goes furthest".
- Say what moves a number: "Your airport and your dates", "How you stay, and who shares", "How you like to eat".
- Sentence case, no terminal punctuation on labels and buttons.
- Banned: seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy. No em or en dashes.
- Every new string in all six catalogues (`src/i18n/*.js`), same placeholders. Retire unused keys and add them to the retired list in `tests/home.test.mjs`.
- No euro sign in a string; templates take `{price}` from `formatMoney()`.

## 9. Compactness targets

- A home section is at most about 1.3 viewports on desktop and about 1.5 on a phone.
- Fold a second explanation into the first object instead of adding a row under it.
- Floor: 360 px wide with no horizontal scroll; design the phone first.

## 10. How a design task runs

1. **Read** `PRODUCT.md` and `DESIGN.md` (repo root), this skill, and run impeccable context (section 2).
2. **Research in parallel.** For a real redesign, launch research agents, one per section plus one that audits the code or recordings. Give each the brand, the files and the complaint, and ask for one concrete spec with heights at 1440 and 390. Build from their specs.
3. **Measure before.** Record section heights at 1440 and 390 on live production.
4. **Build** with impeccable's craft floor in mind, Motion for movement, tokens for every value.
5. **Check once, batched.** Use the dev server at 1440 x 900 and 390 x 844, with screenshots only where the look is the point. Data from the production host is blocked by CORS on localhost: mirror the few files needed into a scratch `public/_tmp/` folder, rewrite their URLs with an init script, then delete it. Run `impeccable detect`, `npx eslint` on the touched files and `npm test`.
6. **Report.** Follow CLAUDE.md: task numbers, one commit per task, the report with before and after heights, and register rows for anything open.

## 11. Never

- Pause or play icons on home motion.
- A loose row of pills or a second CTA floating under a card.
- Tall stacked feature sections, or capabilities as a flat list with no motion or proof.
- Full greyscale to say "not for you"; dim gently and state the gap in euros.
- Stale or fallback recordings, or a clip that opens on the wrong screen or shows test fixtures.
- A claim the data does not support, a guessed figure, or a flight price shown as Carta's.
- Em or en dashes, a hex in a component, a font other than Figtree.
- Shipping without checking both 1440 and 390.

## 12. Before you ship

1. Does the section read as part of one coherent page (same card, shadow, type, springs, cost colours)?
2. Is it more compact than before, measured at 1440 and 390?
3. Is there one meaningful motion moment, and does reduced motion show the full state?
4. Does every figure come from data through `formatMoney()`, and does every sentence match the data?
5. Contrast, focus, 44 px targets, keyboard paths?
6. All six languages, no dashes, no banned words?
7. Did impeccable's detector run clean, and is there one thing left to remove?
