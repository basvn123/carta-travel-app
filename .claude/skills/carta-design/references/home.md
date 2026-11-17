# Home rules (reference)

> The product rules below (what these screens show, what each control does, how numbers behave) bind. The look is in "The look (house style 2026-11)" at the end, written by the home lane of the house style run; `DESIGN.md` and the carta-design `SKILL.md` win where they say more.

Covers the home page (`src/browse/home/`) and the marketing surfaces, including the site footer.

Numbers and money, fabricated social proof (never), photography licensing, copy and the quality floor: see shared-product-rules.md. The free sentence and /pricing: see account.md.

## Where Home sits (T496)

Home is behind the logo on desktop and a "How Carta works" row in Account on a phone. Budget search is not on Home (T506; the owner places Home). The home page dropped the free sentence (owner 2026-10-31, T959).

## The home page exception v2 (T462, owner 2026-10-17; T606, T618, T620, T621, 2026-10-23)

The home page is the one surface that persuades rather than operates, so it may move on its own (values and tokens in DESIGN.md "Home page exception v2"). What it shows:

- **A film, not a carousel of claims.** The hero is a film of real places that fills the first screen and the window's whole width at every size, under the app header (T621), crossfading as one continuous cut: no progress bars, no pills, no control on it. Each shot is a licensed clip (T618), its credit kept in `homeDemo.js`, a still only as fallback. It moves only on screen and in a visible tab; reduced motion stands it still. The owner chose no pause control (T620, 2026-10-23), which leaves WCAG 2.2.2 open (register T620-a); if this film stays live, a small text Pause button is added (T1128-b, 2026-11-12). The film's clips carry no credit on the page (owner, T621; the Pexels License asks for none); every other credit sits on the caption line under its picture.
- **Words on the film** (T620, owner after Mindtrip and Komoot): the slogan, one line and Ask Carta's field, whose "Ask Carta" is the page's one primary (T621).
- **The app is shown by recordings of the app.** Each story panel plays a clip from `scripts/record_home_clips.mjs` (the running app through real links, recorded in all six languages) in a phone frame, never a coded copy of the app and never a click that did not happen. A clip plays only in view, one at a time, and moves the story on when it ends.
- **Tabs may move on by themselves** until the first touch, click or focus; the question in a voices tab types itself out (Ask Carta's typing).
- **One drawing that means something:** the story's trip drawn on its country, the line drawing itself once, the towns and the total arriving after it.
- **Labels on photographs** (the route card's towns and total) are short.
- Still binding on the home page: nothing tied to the scroll position, no parallax, no count-up, no marquee, one primary, 44 px targets, a reduced-motion branch. No other surface takes this exception.

## The site footer (T594, T596)

The site footer ends every page-like tab's scroll: the mark, Explore, Plan, Carta and Legal link columns, the year. No controls, no store badges, absent in map views. No positioning sentence (T596).

## The look (house style 2026-11)

Home is the house style at full voice: the same tokens, kit parts and motion as every screen, one size up in type. Files: `src/styles/61-v6-home.css` (page, hero, plans, close, footer from home), `62-home-story.css` (the lazy story sections), `63-home-g14.css` (the flagged G14 home), `94-waitlist.css`.

Page order and what leads each section:

| Section | Leads with | Look |
|---|---|---|
| Hero | the slogan | film edge to edge, one even tint; words at the lower left on the header's own line (never centred); slogan `--text-hero` 800, the accent words in beige `--umber-200` (never sun yellow); the line `--text-lead`/`--text-title` 600; Ask Carta's paper field (`--radius-panel`), its button the page's one primary with the boxed `.ai-tag` (no sparkle); on a phone the field above a full-width button, above the bottom nav |
| Boarding pass | the flight figure | a paper ticket (`--radius-panel`, `--elev-2`, it floats on the film); route in `--text-figure` with `HouseIcon.flight` on a hairline; the stub carries the getting-there wagon look (outlined umber pill, mode glyph, figure); shown after Ask on every width |
| The week | the band's headline | the page's one umber band (`--umber-800`, white type, beige accents); its head carries the kit `ReliefBand` of the story place's own peaks with their printed heights (a strip above the title on a phone, beside it after the cut from 768; zone ground transparent, shade a deeper umber; nothing drawn without a measured peak); two chapters told in words (label with the `CostRow` glyph, one line in `--text-headline`, `--text-display` from 1024), no amounts; the paper cost post (sticky from 768) carries every figure once: the day as `Formation size="lg" weighted` (no go wagon: the Flight line prints the fare), the week's `CostRow` lines without per-night subs, Rounding only when the printed lines do not add up, one `Plate variant="total"` with `Figure still` |
| The flight's share | the headline with the share | two bars on one scale in the formation's colours (getting there outlined, bed solid umber, food beige), the flight site's rest a dashed track; every figure whole from the first paint; a legend list; the door secondary |
| Tour | the tabs and the phone | tabs on a hairline with the umber paint bar that fills with the clip (vertical on the left edge from 1024); house icons, Ask with the AI tag; the clip in an ink (`--plate`) phone on a `--surface-sunken` card; lit rows in ink with a beige dot; "Also in Carta" as one quiet line, no chips |
| Try it | the budget figure | the ruler as a short route: hairline track, umber paint to the budget at route weight, places as stop discs (filled when they fit, a best-value ring), the thumb a paper disc with an umber ring; cards with photo, name and the place's `Formation weighted` (under 768 the day figure takes its own line in every card); over budget fades only the photo; the budget figure is `Figure still` |
| Plans | the three prices | rows on a phone with each list behind one fold (`home.planWhat`), three columns from 769 with lists open and an ink top rule (umber on the featured plan); title beside the columns from 1024 |
| Close | the question | a full-width `--surface-sunken` band, title and field side by side from 1024 |
| Waitlist | the field | quiet `--text-headline` title, paper field, a secondary submit (Ask Carta is the one primary); a refused submit shakes once (`.hs-shake`), done arrives with `.hs-reveal` on a beige note |
| Footer | the columns | the shared footer; from home its legal links take 44 px targets |

Motion, one meaningful moment per section: the film's cut; the slogan's words lift once; the band builds in order (from 768 each chapter lights up and paints its post line with a 2 px umber stroke as it reaches the middle of the view; on a phone the lines paint one beat apart when the post comes into view; the wagons couple in; the plate settles once both lines are painted; no figure moves); the share's bars draw once; the tour's paint bar fills and the blaze paints on the chosen tab (`.hs-paint`); the floating notes hug the phone (offset 104 px, 160 px from 1440, never wider than their side); the budget figure follows the thumb, a card that comes within the budget lifts once on the house tick spring, the best-value card carries the blaze, the disc under the thumb steps aside, and a `haptic('tick')` lands on release with a new value. Sections rise 24 px as they arrive. No parallax and no scroll-linked transforms (this file's home exception). No count-up anywhere, nothing tied to the scroll position, sections arrive once (16 px rise). Reduced motion: every arrival starts at its end state (`Reveal` and the Try cards pass `initial={false}`), the film stands still.

Do: real figures only, through `formatMoney()` or the kit's `Money`/`Figure`; one primary; one total plate; the house springs from `src/lib/motionTokens.js` (the home's `motionKit.jsx` re-exports them).
Don't: eyebrow kickers (the `home.*Kick` keys stay in the catalogues, unrendered), tone grounds per chapter, gradients or glows, Phosphor icons, a primary on any door but Ask Carta.

G14 (`?home=g14`, flag off): the same parts on stone: no uppercase kicker, the day as a paper post with the formation's colours, the share card as a paper panel.
