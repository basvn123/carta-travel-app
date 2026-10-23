# T622 Explore head refinements (owner review 2026-10-23)

Renumbered from T620 at merge (2026-10-23): a parallel session took T620 for the home hero film 24 seconds earlier (Execution/P15/T620-home-hero-full.md). Every T620 in this report, its register rows and its code comments now reads T622.

## Task ID

T622

## Date

2026-10-23

## What changed

Explore and its six category tabs now open on one compact head, phone first. The phone settings line shows four equal buttons with an icon over one short word (When, From, Stay, Transport), where it used to show a sentence that cut off ("21 nov tot 28 nov, 7 ..."). The values are in each button's accessible name. On a desktop the When segment gets the widest share, so "21 Nov to 28 Nov, 7 nights" is no longer cut.

The six categories are the first thing under the settings line on every view, with no gap above them. On a desktop they are six equal, wider tabs at lead size across the full content width. On a phone all six sit side by side, icon over word, so the row never scrolls in either direction (before, "Meren" was half off screen).

The overview hero dropped the What select and the Where placeholder. "Where" is now a floating label that rests in the field and rises on focus or text. Ask Carta is a full pill beside the headline. On a phone there is no photograph and no credit. On a desktop a scenic Commons photograph (a daily pick from a short list of lakes, coasts and mountain villages, Zermatt today) sits in a shorter band with the search panel centred over it. The credit line under it carries a camera mark. The Map pill moved to the end of the quick chip row, and Countries is a chip there on every width.

Ask Carta names the town only ("You're in Brussels", never "(BRU)") and has a Change button that opens the From picker inside the chat. The pick sets the app's one From.

The category tabs read, top to bottom: the title (desktop), then the bar. The kind select keeps "Anything" but drops its visible "What" label. Where reads only "Where", and its near-me crosshair sits inside the field on every width; the separate "Summits near me" button is gone. On a phone Search is an icon joined to the Where box, so one clean field runs across the row. Next comes one filter row: All filters, Countries (Only these / All but these), Sort, the quick chips, then a Full list toggle at the end. Then the section's quick cuts ("A road to the summit" and the rest), moved up from below the rails. The By country rail is gone; its slot went back to the rails. On a phone the quick chips live in the All filters sheet, so the filter row never scrolls sideways, and the Map pill floats above the bottom nav as it does on Places.

Photos are sharper. A 4:5 story card crops a 3:2 photo, so it needs about 1.9 times the card's width. The srcset was capped at 640, which in practice served a 500 px photo upscaled about 2x on a retina phone. Story cards now allow up to 1280 with sizes that state the crop, and 4:3 tiles allow up to 960. The site footer shows only from 769 px; the home page keeps it on every width.

## Files touched

**Modified:**
- continent-app/src/components/SettingsLine.jsx (phone face: four buttons)
- continent-app/src/styles/60-v6-shell.css (phone settings buttons replace the sentence rules)
- continent-app/src/styles/77-settings-v2.css (desktop When gets 1.8 shares)
- continent-app/src/browse/ExploreTab.jsx (OverviewHero rewritten, tabs on top, scenic photo, chat town name)
- continent-app/src/styles/84-explore-overview.css (hero and category tabs)
- continent-app/src/browse/ask/AskChat.jsx (YoureIn with Change and the From panel)
- continent-app/src/styles/76-ask-chat.css
- continent-app/src/browse/DestinationsTab.jsx (head order, Full list, cuts on top, no By country, no near-me door)
- continent-app/src/browse/WhereBar.jsx (What label read only, "Where" placeholder, trail slot, Search word wrapper)
- continent-app/src/styles/83-where-bar.css (T622 head block)
- continent-app/src/components/CountriesControl.jsx (CountriesButton takes `size`)
- continent-app/src/browse/StoryRail.jsx, ExploreRails.jsx, SectionOpening.jsx, TripStylesRow.jsx, PhotoGallery.jsx, ExploreCards.jsx, RegionPage.jsx (image ladders)
- continent-app/src/styles/82-site-footer.css (footer hidden under 769 px outside home)
- continent-app/src/i18n/{en,nl,de,es,fr,it}.js (settings.stayShort, settings.wayShort, askChat.changeFrom, dtab.fullList)

## Commands run

```
npm ci                      (continent-app, the worktree had no node_modules)
cp boot.json, dest/, stays/ from the main checkout's public/ (git-ignored data, local only)
npx eslint <touched files>
npm test                    (650 pass, 0 fail, 5 skipped)
node scripts/ci/design-lint.mjs
impeccable detect --json <touched files>   (no findings)
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Story card photo width served (desktop, 237 px card) | 500 px | 960 px | +460 px |
| Overview hero photo width cap | 960 px | 1920 px | +960 px |
| Phone category tabs visible without scrolling (375 px) | 3.5 of 6 | 6 of 6 | +2.5 |
| Phone document width at 375 px, Beaches | 375 | 375 | 0 (no sideways scroll) |
| Desktop When value cut off (1440 px) | yes | no | fixed |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Phone Where field read "Town, regio" (owner, mid-task) | A long placeholder in a narrow box beside a separate Search box | Placeholder is the one word "Where"; Search joins the box at its right end |
| "Anything" cut to "Anythi..." on a phone | The kind select had 2/5 of a three-column row | Two columns, the select at least 120 px |
| A heredoc edit to ExploreTab did not apply | Bash heredoc quoting (the known gotcha) | Edits run from Python files in the scratchpad |

## What is still open

| ID | Item |
|---|---|
| T622-a | The desktop end check is DOM measurements only (tab widths, panel centred, When uncut, srcset widths): the Browser pane was too narrow and covered for a 1440 px screenshot. Look at /explore and one category tab at 1440 px. |
| T622-b | The owner's idea of one phone pane holding the categories and every filter was met halfway: the six categories fit as one static row and the quick chips moved into the All filters sheet. The categories are not inside the sheet; confirm with the owner. |
| T622-c | carta-design (Explore v6 to v8) still describes the hero band on every width, Map after Search, the near-me door in the head, the By country track, and the phone settings sentence. Rewrite those rules to match T622. DESIGN.md needs no change (no token moved). |
| T622-d | Places' focused view (after a See all) keeps its sideways scrolling tool row on a phone (xtools), which the owner dislikes elsewhere. |
| T622-e | The i18n key `where.placeholder` is no longer read; remove it in all six files. |

## Rollback

`git revert <T622 commit>`. No data or schema touched. The copied public/ data is git-ignored and local to this worktree.
