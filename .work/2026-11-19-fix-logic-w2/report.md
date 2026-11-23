# Report: logic wave 2, one state-scope model (E9 phase A)

Status: done · 2026-11-23 · L2 light wave (round 2, quota wave 3 of 4) · branch `p15-fix-logic`, merged into `p15-fix-programs`.

Every address, storage and sync key now has one declared scope in `continent-app/src/lib/stateKeys.js`, and the address writer, share links, device clear and account sync read that table. With flag `E9` on, a reload or sign-in no longer loses or overwrites a traveller's choices, and a share link never carries a person key. `E9` ships at `old`. J-16 (service worker) is blocked: `continent-app/public/sw.js` is a protected path, so the patch is routed to the orchestrator. The first fresh judge failed two lines (two broken tests, no real share check); after the fixes a second fresh judge scored every line 4 (`judgement-2.md`).

## The question (G12)
Does every key have one declared scope, so a link never carries or overwrites a person's choices? Yes: a grep test fails on any unclassified `carta.*`, `continent.*` or address key; 12 of 12 persona replays change as designed with `E9` new (shadow diff in `shadow/`); the DOM check clicks the real share control and finds no person key at 390, 820, 1180 and 1440 (46 of 46).

## What changed
- **Table** (J-17 and the base of every row): `continent-app/src/lib/stateKeys.js`; `lib/urlState.js`, `lib/shareKeys.js`, `lib/deviceData.js`, `auth/accountSync.js` read it; `tests/stateKeys.test.mjs` proves the lists equal the old ones.
- **Behind `E9`:** G-1 load order (`hooks/useAppData.js`, `hooks/useTravelStyles.js`, `lib/travelStyles.js`), J-2, G-2, G-3 `isForeignLink` (`App.jsx`, `hooks/useAccountSync.js`), G-19 hold at sign-in, G-7 new trip lifts the hold (`planner/flow/PlanFlow.jsx`), G-16 and J-13 language push only from the picker (`i18n/index.jsx`, `lib/langPath.js`), E-3 and V-6 legacy filter keys retired.
- **Unflagged:** G-4 home point rounded to 0.01 degree on read and `docs/legal/ARTICLE30.md` updated (owner default 12); J-11 `carta:things-changed` from the store writers (`lib/thingsChanged.js`, `planner/*Store.js`, `lib/taste.js`); J-15 reload on the next navigation (`pwa/registerServiceWorker.js`).
- **Eval first:** `continent-app/scripts/eval/lib/state-engine.mjs` (old) and `state-engine-new.mjs`, `tests/stateScope.test.mjs` committed before behaviour moved; PT-E9 `tests/urlPlacesParity.test.mjs` now real; `tests/swNavigation.test.mjs` (J-16 case todo).
- **Screens:** `continent-app/scripts/verify_logic_w2.mjs` (reload keeps party, shortlist and home point; share link has no person key and keeps the view).
- **Docs:** `docs/HANDBOOK.md`, `docs/logic/README.md`, `ROADMAP.md` C9, I5, I12, G12, G4, `docs/owner/product-decisions.md` (default 12, E9 flip), `docs/owner/owner-checks.md` (W2-sw).
- Judge fixes: `continent-app/tests/passReturn.test.mjs` and `tasteProfile.test.mjs` read the table instead of grepping moved lists.

## Checks
- CI runs 45117224873 and 45117918424 on `e9ec5ebee3`: only baseline failures (design-lint motion-literal; data-owned DCACHE and stays snapshot).
- Locally: touched tests pass, `logic-engines --check` pass, eslint clean, drift 0, entry points OK.

## Deviations
- `dh` from an old link is never read into storage (the existing merge already skipped it; a stranger's coordinates must not become the recipient's home point).
- Party, start, bed, Lifestyle and way stay in the address because they price a link; only `fav`, `dh`, `ty` leave.
- Docs landed in a separate commit from the code steps.

## Left for later
- J-16: blocked on the protected `sw.js` (patch in `sw-patch/`, request in `RUN/requests.md`, owner step W2-sw).
- W2-L1: three `carta.*` keys stay on the device at sign-out (today's behaviour).
- W2-L2: DOM check with `g=3` in the share step and a pass with `E9` old.
- Phase B (merge RPC, migrations): wave 9.

## Undo
Set `E9` to `old`, or `git revert` `1b10964534..e9ec5ebee3`. The 0.01 degree rounding and the sync event revert with the commits. No migration.

## Next step
Wave 4: W3, E2 party and E3 stay ladder, each with its golden set.
