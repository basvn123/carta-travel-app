# Home rules (reference)

> Look rules for these screens are rewritten by the home lane of the house style run (2026-11). Until then the look comes from `DESIGN.md` and the carta-design `SKILL.md`; the rules below are the product rules these screens keep (what they show, what each control does, how numbers behave). They bind.

Covers the home page (`src/browse/home/`) and the marketing surfaces, including the site footer.

Numbers and money, fabricated social proof (never), photography licensing, copy and the quality floor: see shared-product-rules.md. The free sentence and /pricing: see account.md.

## Where Home sits (T496)

Home is behind the logo on desktop and a "How Carta works" row in Account on a phone. Budget search is not on Home (T506; the owner places Home). The home page dropped the free sentence (owner 2026-10-31, T959).

## The home page exception v2 (T462, owner 2026-10-17; T606, T618, T620, T621, 2026-10-23)

The home page is the one surface that persuades rather than operates, so it may move on its own (values and tokens in DESIGN.md "Home page exception v2"). What it shows:

- **A film, not a carousel of claims.** The hero is a film of real places that fills the first screen and the window's whole width at every size, under the app header (T621), crossfading as one continuous cut: no progress bars, no pills, no control on it. Each shot is a licensed clip (T618), its credit kept in `homeDemo.js`, a still only as fallback. It moves only on screen and in a visible tab; reduced motion stands it still. The owner chose no pause control (T620, 2026-10-23), which leaves WCAG 2.2.2 open (register T620-a). The film's clips carry no credit on the page (owner, T621; the Pexels License asks for none); every other credit sits on the caption line under its picture.
- **Words on the film** (T620, owner after Mindtrip and Komoot): the slogan, one line and Ask Carta's field, whose "Ask Carta" is the page's one primary (T621).
- **The app is shown by recordings of the app.** Each story panel plays a clip from `scripts/record_home_clips.mjs` (the running app through real links, recorded in all six languages) in a phone frame, never a coded copy of the app and never a click that did not happen. A clip plays only in view, one at a time, and moves the story on when it ends.
- **Tabs may move on by themselves** until the first touch, click or focus; the question in a voices tab types itself out (Ask Carta's typing).
- **One drawing that means something:** the story's trip drawn on its country, the line drawing itself once, the towns and the total arriving after it.
- **Labels on photographs** (the route card's towns and total) are short.
- Still binding on the home page: nothing tied to the scroll position, no parallax, no count-up, no marquee, one primary, 44 px targets, a reduced-motion branch. No other surface takes this exception.

## The site footer (T594, T596)

The site footer ends every page-like tab's scroll: the mark, Explore, Plan, Carta and Legal link columns, the year. No controls, no store badges, absent in map views. No positioning sentence (T596).
