# T1111: design direction for owner approval

Roadmap item: **G1** (session S27). Branch `p15-s27-design-direction`.

## Date

2026-11-06

## What changed

Carta now has a written design direction, `docs/design/direction.md`, a draft for the owner to approve. It sets out what Carta looks and feels like: warm, compact and dynamic, with money always drawn honestly on one umber card. It has a table of what changes from today, and the signature moves: the umber cost card, a shared motion kit, type, radius and depth, and imagery. It also lists what stays locked, and how G2, G3, G5, G6 and G8 (sessions S37, S38, S40, S41, S43) each follow from it. It describes three screens from today's dev server, each as a before and a target after. The owner is asked to settle three decisions: (a) the plan tab's arc card gives way to the place page's trip card (T1026-c); (b) totals count up only on the home page and settle in place everywhere else, which squares the skill's count-up with DESIGN.md's Tabular Rule; (c) the 28 px stage radius on the app's cost card. Nothing binds until the owner signs it off. The carta-design skill is not edited before then, so it never carries a rule the owner has not approved (row T1111-b). No app code changed.

## Files touched

- Created: `docs/design/direction.md`, `Execution/P15/T1111-design-direction.md`
- Modified: `docs/README.md` (one tree row for `design/`), `ROADMAP.md` (G1 status only), `Execution/_OPEN.md` (rows T1111-a to T1111-d appended)
- Not committed: `Execution/P15/T1111-shots/*.png` (gitignored)

## Commands run

- `cd continent-app && npm ci`
- `node scripts/sync-data.mjs --split-only`: builds the gitignored `public/boot.json` and `public/dest/` from the shipped `public/app_data.json`. The cloud checkout has no `app_data/app_data.json`, so `predev` keeps the old file, and without a boot index the app shows "We couldn't load Carta's travel data".
- `npm run dev -- --port 5227 --strictPort`, then Playwright scripts in the scratchpad: home, Explore, Plan home and the place page `#dest=FCO`, at 390 x 844 and 1440 x 900.
- `python -I scripts/docs/check_entry_points.py`

## Config and secrets set

None.

## Before/after measurements

Not measured: the task writes a document and promises no number. The doc quotes the debt figures from ROADMAP G2, G6 and G8 as its "today" column.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Dev server showed the load error screen | `public/boot.json` and `public/dest/` missing in the cloud checkout; `predev` skips the split when `app_data/app_data.json` is absent | `sync-data.mjs --split-only` on the shipped `public/app_data.json` |
| Place and card photos are grey | The container cannot reach upload.wikimedia.org | Noted in the doc; not an app fault |
| The impeccable launcher would not run (permission denied) | File mode in the checkout | Read PRODUCT.md and DESIGN.md directly, as the skill allows |

## Screens checked

- Home, 390 and 1440: hero film with the slogan; the tour's recording on the phone. No page errors.
- Explore, 390: rails of photo cards, Score, ink price line, grey tiles (no Wikimedia).
- Plan home, 390: headline, two buttons, a fanned deck of trip cards with grey images.
- Place page Rome, 390 and 1440: umber trip card at €2,355 for 2 people, 7 nights, with train and car rows and stay chips; the selected "Overview" tab is an ink filled pill, which the direction flags against the No Slab Rule.
- Not seen: the plan tab's arc card, which needs a saved trip (row T1111-d).

## What is still open

- T1111-a (owner): approve the direction or say what to change, including its three decisions. G3 (S38) and G5 (S40) wait on this.
- T1111-b: after approval, fold the decisions into the carta-design skill and DESIGN.md (G1 asks for the skill update too).
- T1111-c (owner): G-R1 to G-R3 research has not run. The direction rests on what the owner approved before, the code and the audit, and will be revised where the research disagrees.
- T1111-d: capture the plan tab's arc card before G3 replaces it.

## Rollback procedure

`git revert` of the T1111 commit. Nothing is one-way. The generated `public/boot.json` and `public/dest/` are gitignored local files.

## Owner steps (for the checklist)

- [T1111-a] Approve the design direction | G3 (umber cost card) and G5 (motion) are waiting on it, and it sets the look for G2, G6 and G8 | open docs/design/direction.md; read sections 1 to 5 (one page); answer the three decisions in section 7 (plan tab follows the place trip card, count-up only on home, 28 px radius on the app cost card); reply "approved" or list the changes to Claude | docs/design/direction.md
- [T1111-c] Run the design research G-R1 to G-R3 | the direction was written without the benchmark, the premium-feel note and user testing, and they may change it | run the 6-product teardown (G-R1) and the principles note (G-R2); run 5 short interviews and one unmoderated test on the live app (G-R3); hand the findings to a session to revise the direction | ROADMAP.md (Track G research)
