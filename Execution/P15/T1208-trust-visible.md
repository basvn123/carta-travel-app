# T1208: Trust made visible (ROADMAP G9, round 3 session S124)

## Date

2026-11-07

## What changed

Places now say why they fit a traveller, with evidence, and the place page says when its prices were refreshed. Every place card (Explore's rail cards, the list and map cards, the tile) carries up to two "why this place" chips, and the place page a "Why this place" section. A chip shows only with evidence on both sides. The place side is a taxonomy node (F1) from its own listing, or a tagger tag with its quote. The traveller side is a Yes in "Your taste" (F3) on that node or a broader one, or a picked like that maps to it. A Not me hides the node and all under it. Confidence is said in two words, never a percent: "Strong evidence" from 0.75 (the tagger's filter threshold), "Likely" from 0.6 (its profile threshold). A card chip under 0.75 reads "City (likely)". Under the day price the page says "Prices refreshed 7 Jun 2026". The date is the oldest `_asof` of the `costs` and `accommodation` blocks (T1143). Past 90 days it adds "they may have moved since", which today's shipped wire (built 2026-06-07) does. All 14 new strings are in six languages.

The logic lives in `lib/why.js` and `lib/asOf.js`. The taxonomy map loads on demand, so a traveller with no taste pays nothing for it. The main chunk grows 1.6 KB gzip; the My trips chunk shrinks 5.9 KB, because the map left it.

Before this task no card or page explained a fit with evidence, and no figure carried a date. On the fixture data (the shipped wire, with Yes on Castle and City and Not me on UNESCO), 27 cards carry chips at 390 px and 36 at 1440 px (9 and 18 of them on the first screen).

## Research

A research subagent compared the options for the three choices this task makes. Links are the subagent's.

| Question | Options | Choice and why |
|---|---|---|
| Confidence in words | IPCC likelihood terms ("very likely" is 0.9 and up, too strong for 0.75); ICD 203 and NATO estimative words ("likely" 55 to 80%); Kent's words ("probable" about 63 to 87%); raw percentages; three levels | Two levels: a plain label at 0.75 and up ("Strong evidence" on the page), "Likely" from 0.6. "Likely" fits 0.6 to 0.75 in ICD 203 and translates one to one in all six languages. No percentage: the noisy-OR score is not calibrated. Lay readers pull verbal terms toward 50% and barely tell neighbouring terms apart (Budescu et al. 2014, https://ideas.repec.org/a/nat/natcli/v4y2014i6d10.1038_nclimate2194.html; Mandel and Irwin 2021, https://doaj.org/article/89620c6e78f04fa38d71327aaaa1909d). So evidence carries the weight and the words stay coarse. |
| What a chip carries | "Because you watched X" (link back to the user); Google "About this result" (source one tap away, https://support.google.com/websearch/answer/11127743); Tintarev and Masthoff's aims, mainly transparency and scrutability | Label, plus the traveller's evidence and the place's evidence. On a card they are the label and a screen-reader line; on the page each sits on its own row. Cap 2 on a card (research: 2 to 3, strongest first; Carta cards are compact). "Not right?" on tap is open (T1208-e): a chip sits inside the card's link, so it cannot be a control. |
| Date formatting | `Intl.DateTimeFormat` (built in, 0 KB); date-fns or dayjs (a dependency plus locale files) | `Intl.DateTimeFormat` with `timeZone: 'UTC'` on a hand-parsed `YYYY-MM-DD`, so the day never shifts west of UTC. |
| Date wording | "checked on", "as of", "updated", "refreshed" | "Refreshed". `_asof` is the day the layer rebuilt the block, not the source's vintage (T1143-d). "Checked" and "as of" would claim more than that. |
| Staleness | per data type, set from the source's cadence (subagent defaults: prices 30 days, opening hours 6 months, places 12 months) | Prices: 90 days. Prices are rebuilt MONTHLY (`pipeline/config/sources.yaml`), so three missed runs. Past the limit a quiet "may have moved since" line shows; nothing is hidden. |

## Files touched

- Created (app): `continent-app/src/lib/why.js`, `continent-app/src/lib/asOf.js`, `continent-app/src/browse/WhyChips.jsx`, `continent-app/src/styles/80-why.css`, `continent-app/tests/why.test.mjs` (15 tests), `continent-app/scripts/verify_why_chips.mjs`.
- Modified (call sites): `continent-app/src/browse/PlaceOverview.jsx` (card layout), `continent-app/src/browse/ExploreCards.jsx` (tile), `continent-app/src/browse/ExploreRails.jsx` (the rail card, Explore's first screen), `continent-app/src/browse/DestinationPage.jsx` (the section after the key facts, the date under the price card in both its places).
- Modified (copy): `continent-app/src/i18n/{en,nl,de,fr,es,it}.js`, 14 `why.place.*` keys each, appended.
- Docs and register: `docs/HANDBOOK.md` (new section "Why this place and refreshed dates" and its contents line), `ROADMAP.md` (G9 status), `Execution/_OPEN.md` (rows T1208-a to T1208-h), this report.

## Commands run

```
git fetch origin && git checkout -b p15-s124-trust-visible origin/p15-round3
cd continent-app && npm ci
node --test tests/why.test.mjs
npx eslint <touched files>; npm run lint; npm test
node scripts/ci/design-lint.mjs
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs   # also on a base worktree of origin/p15-round3
CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node scripts/verify_csp.mjs --dist ../.fastbuild
node scripts/sync-data.mjs --split-only            # boot.json and dest/ for the dev server; removed afterwards
VITE_E2E_SEAMS=1 npx vite --port 5231 --strictPort --host 127.0.0.1
CARTA_PORT=5231 PW_CHROMIUM=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome SHOTS=../Execution/P15/T1208-shots node scripts/verify_why_chips.mjs
sh .claude/skills/impeccable/scripts/impeccable detect --json <touched UI files>
python3 -I scripts/docs/drift.py
```

## Config and secrets set

None. No wire field, config key or pipeline task added; no migration.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Cards with a "why this place" chip, fixture taste, phone (all / first screen) | 0 / 0 | 27 / 9 | +27 |
| Cards with a chip, fixture taste, desktop (all / first screen) | 0 / 0 | 36 / 18 | +36 |
| Cards with a chip, no taste set | 0 | 0 | 0 (no evidence, no chip) |
| Place page reasons with evidence and a confidence word (Edinburgh, fixture taste) | 0 | 2 (City, Castle; both Likely) | +2 |
| Figures on the place page with a refreshed date | 0 | 1 (the day price) | +1 |
| `why.place.*` keys per language | 0 | 14 in each of 6 | +84 |
| Main chunk `index-*.js`, gzip (raw) | 281,221 B (868,358) | 282,843 B (873,987) | +1,622 B (+5,629) |
| My trips chunk `SavedTripsPanel-*.js`, gzip | 50,555 B | 44,676 B | -5,879 B (the taxonomy map is its own 5,110 B chunk now, shared, on demand) |
| All CSS, gzip | 202,908 B | 203,329 B | +421 B |
| App unit tests in tests/why.test.mjs | 0 | 15 (suite: 1,990 run, 1,978 pass, 0 fail, 12 skipped) | +15 |
| design-lint new violations | 0 | 0 | 0 |
| impeccable detect on the touched UI | n/a | 0 (after removing a side-tab border it flagged) | |
| CSP on the fast build | 0 violations over 40 loads | 0 over 40 | 0 |
| Chip text contrast (`--lagoon-700` on `--lagoon-50`) | n/a | 6.13:1 | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Main chunk grew 7.5 KB gzip on the first build | `WhyChips` imported `lib/why.js`, which carries the 32 KB taxonomy map, into the Explore cards | `lib/why.js` loads on demand (once, shared). Cards ask for it only when the traveller has a Yes or a like; the page always. Main chunk delta is now +1.6 KB. |
| The dev server showed "We couldn't load Carta's travel data" | No `public/boot.json` or `public/dest/` in the container (sync-data needs the master dataset) | `node scripts/sync-data.mjs --split-only`, then a dev server restart (Vite served the new folder as HTML until then). Both were gitignored outputs I made, and I removed them afterwards. |
| 3 app tests failed after that (`catalogue.test.mjs` first paint, two `rankTier.test.mjs`) | They read the generated `boot.json` and `dest/_rank.json`; the split's rank-tier self-check had failed on 27,559 fields on this checkout's wire, so `_rank.json` was stale | Removed the generated files, and the tests pass (they skip without them). The rank-tier failure is in code this task does not touch: row T1208-h. |
| The verify script found chips but no visible card | Explore's first screen is the rail (`PlaceStoryCard`), not the list cards | Added the chips to the rail card. The script now asserts visible cards with chips. |
| A dashed left edge on a rounded page row looked broken; the detector flagged the side border | Design | Removed the side border. The row is a tinted block and its confidence word carries the level. |
| A "known for" row would have shown a node the traveller rejected | `knownFor` did not see the rejections | It takes the traveller's Not me set; unit test added. |

## Screens checked

The Explore first screen (rail cards), the Explore list cards (in the DOM) and Edinburgh's place page. Each at 390 x 844 and 1440 x 900, in English and Dutch, on the shipped wire, through `scripts/verify_why_chips.mjs`. All checks passed:
- no chip with no taste;
- at most two chips per card;
- never a rejected node;
- every chip set has a screen-reader line;
- every page row has a confidence word and both kinds of evidence;
- the date line is "Prices refreshed 7 Jun 2026, they may have moved since" (`data-asof` 2026-06-07);
- the Dutch rows read "Stad, Kasteel", with "Prijzen ververst op 7 jun 2026, ...";
- no horizontal scroll;
- no page errors.

Screenshots (not committed, `Execution/P15/T1208-shots/`) show the card chip, the page section and the date line under the price card. On the rail card the chip sits beside the country on the meta line.

The seven carta-design questions:
1. **Coherent.** Same tokens, radius and type scale. The pills follow the place-tag pattern, in lagoon, the palette's "fits" colour. The page section is a standard `PSection`.
2. **Compact.** A card adds one 22 px pill line beside the country, or nothing. On Edinburgh the page adds one section of two rows (about 150 px on a phone). Section heights before and after were not measured at 1440.
3. **Motion.** None added. The chips arrive with the card, and reduced motion is unaffected.
4. **Honest.** Every chip rests on data on both sides. No percent. The date is the block's own stamp, worded "refreshed", not "checked". No money figures were added.
5. **Accessible.**
   - Contrast 6.13:1.
   - The chips are text inside the card link, with a screen-reader sentence ("Why it fits you: ...").
   - "Likely" is a word plus a dashed edge, so colour never carries it alone.
   - Nothing new is focusable, so no new 44 px targets.
6. **Copy.** All six languages, no dashes, no banned words. Five of them were written by this session and still need a native read (T1208-g).
7. **Detector.** Clean after one fix. What is left to remove: "City (likely)" on a capital reads weak, and T1208-a fixes it at the data, not the UI.

Departures from the defaults: none.

## What is still open

Each item is a row in `Execution/_OPEN.md`.

- **T1208-a.** The app's taxonomy map has only the `categories`, `tags`, `likes` and `tripKinds` sources. Mapping.yaml also maps `place.class` and `place.designations`, so a listing tag here rests on fewer values than the tagger's: Rome reads "City (likely)" on one value where the tagger would have two. Add those sources to `scripts/taste/build_taxonomy_map.py` (T1152's generator, outside this task) and read them in `lib/why.js`.
- **T1208-b.** Tagger tags with their quotes are not on the wire (T1150-d), so "Known for" and quoted evidence show only on fixture data today. Once they are wired, pass them as `tagged` to `WhyPlace` and `WhyChips`.
- **T1208-c.** Opening hours have no stamped block (T1143-b covers only `app_data.json` blocks), so no "refreshed" date can be shown next to them yet.
- **T1208-d.** Entry rules have a date (`public/entry_rules.json` `generated_at`), but the screen that shows them reads `lib/entryRules.js`, outside this task's files. Show "refreshed {date}" there with the same helper (`lib/asOf.js` `formatDay`).
- **T1208-e.** The chips cannot be tapped (they sit inside the card's link), so the research's "Not right?" and source-on-tap are missing. The page rows could carry a Not me wired to `setVerdict`; that needs a written rule on chips as controls.
- **T1208-f.** "Refreshed" is the honest word while `_asof` is a build date. If T1143-d adds a source `_vintage`, show that date with "checked" or "as of" instead.
- **T1208-g.** The nl, de, fr, es and it strings were written by this session; the owner (or a native reader) should read the 14 `why.place.*` keys once.
- **T1208-h.** `node scripts/sync-data.mjs --split-only` on this checkout's `public/app_data.json` stopped its rank tier at "check FAILED on 27559 fields". That code was not touched here, and nothing was shipped from that run. Find out whether the provenance stamps (T1143) or the wire diet broke the lite and full parity.

## Owner steps (for the checklist)

- [T1208-g] Read the new "why this place" strings | five of the six languages were written by a session, and travellers read them on every card | open continent-app/src/i18n/{nl,de,fr,es,it}.js; grep "why.place."; fix any line that reads unnatural, keeping {node}, {like}, {text}, {list}, {label} and {date} | continent-app/src/i18n/*.js, Execution/P15/T1208-trust-visible.md

## Rollback procedure

`git revert` the T1208 commits on `p15-s124-trust-visible` (or on the branch they were merged into). Nothing is one-way: no wire, data, migration or config change.
