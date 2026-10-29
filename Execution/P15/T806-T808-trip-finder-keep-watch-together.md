# T806 to T808: keep, watch and decide together (batch TF4)

## Shared header

**Date.** 2026-10-29.

**Batch.** TF4 of the trip finder plan (Help me choose results, roadmap 2.25): keep and skip (T806), if it gets cheaper (T807), decide together (T808). The owner asked for it in chat on 2026-10-29: "When t3 has committed start T4, and run it fully, afterwards commit and push and deploy". No queue prompt was written for TF4. The scope is the plan's own three rows (the plan artifact from earlier in this session):
- **T804 in the plan, Keep and skip:** a heart on cards, and skip hides a trip for these answers, stored with the existing saved trips.
- **T805 in the plan, If it gets cheaper:** saved totals against the next sweep, with the drop shown in Kept trips and on the Plan home.
- **T806 in the plan, Decide together:** a shortlist shared through co-planner sharing; each person keeps or skips, and the trips both kept rise to the top.

Done when (the plan): **kept trips live in My trips, a saved total that later drops shows the drop on return, and a shared shortlist shows who kept what.**

**Task numbers.**
- **Taken:** T806 to T808.
- **Why the plan's numbers moved:** the plan's T804 to T806 shifted up. SW2 (flights to August) took T804 and T805, so T806 was the next free number.
- **How it was checked:** `git log --all` of the root repo stops at T805, as does every worktree's `Execution/` folder (`git worktree list`: 12 worktrees). The SW2 memory says "next free T806".

**Branch.** `p15-trip-finder-together`, cut from TF3's tip `2a854799e` once TF3's report was committed and the tree was clean, in worktree `.claude/worktrees/travel-app-ui-refinements-5e0525`. Here `continent-app/` is a plain folder of the root repo, so every commit is a root commit.

**Commits.**
- `e32b0def2`: the TF3 and SW2 queue prompts, untracked until now.
- `6ed778904`: T806.
- `0872001f0`: T807.
- `b89190a2c`: T808.
- `a7e266c8c`: T806 end check fix.
- `31531b08b`: T807 end check fix.

**Checks.**
- **Per task:** `npx eslint` on the touched files. It reports no errors; the 5 warnings it prints are older lines in `App.jsx` and `SavedTripsPanel.jsx`.
- **Design lint:** `node scripts/ci/design-lint.mjs` has 32 new violations, before and after, none in this batch's files. That is the same count TF1 to TF3 reported. One `raw-button` in `PlanHome.jsx` came up during the batch; it became a link.
- **`npm test`:** 954 tests, 947 pass, 2 fail. The failures are the known T792-b pair (rankTier "lite record", wireSplit "published split"). The new `tests/recommendKept.test.mjs` passes 9 of 9.

**Fast build and measure.**
- **Build:** `wt/vite.t806.mjs` (a copy of t802's, cache `.vite-t806`, port 5806), about 9 s.
- **Measure:** `wt/t806-measure.mjs` (a copy of t802-measure.mjs).
- **"Before":** TF3's own after-build `wt/dist-t802-after`, measured with the same script.
- **Outputs:** `wt/t806-measure-before.json` and `wt/t806-measure-after.json`.

| Measure (NOPUBLIC build) | Before (TF3 tip) | After | Delta |
|---|---|---|---|
| Modulepreloads in index.html | 37 | 37 | 0 |
| First-paint JS bytes | 1,360,723 | 1,361,747 | +1,024 |
| Plan tab first-load JS bytes (first paint, the Plan chunks and their static imports) | 2,876,375 | 2,883,953 | +7,578 |
| Finder chunk (FindingTrips) | 64,005 | 70,469 | +6,464 |
| Bytes only the finder reaches | 64,005 | 73,140 | +9,135 |
| `npm test` tests / pass | 945 / 938 | 954 / 947 | +9 / +9 |

What the Plan tab's 7.6 KB is:
- **keptStore:** a chunk of its own (Plan home, trip page and My trips read it).
- **TripFlow:** the one-shot hand-off.
- **PlanHome:** the drop line.
- **The English strings** those screens name.

The first build grew by two preloads: SheetShell and the data host's config module. The bundler split each into a chunk of its own once `TogetherSheet` and a separate `keptDrops` module had chunks of their own. This is the TF2 gotcha. Both were moved into the finder's chunk, and the preloads are back at 37 (see T807 and T808, "What broke").

**End check.** One browser round on the merged batch.
- **Build and server:** the NOPUBLIC build `wt/dist-t806-after`, served by `wt/t797-serve.mjs` on port 5806.
- **Script:** `wt/t806-walk.mjs`. Playwright, `serviceWorkers: 'block'`, the sweep file and `/api/flights` routed to the T795 fixtures, clipboard permission granted.
- **Widths:** 390 px and 1440 px.
- **Result:** 58 of 58 checks pass, with no page errors and no console errors.
- **Evidence:** screenshots in `wt/t806-shots/`; results in `wt/t806-walk.json`.

The round found two defects. Both were fixed and re-walked:
- On a phone, the Kept trips rows ran off the right edge.
- On a phone, the Plan home's drop line cut off the drop.

**The deploy** the owner asked for follows this report. It is the owner's rows T792-a and T803-f, carried out at their request. The deploy facts go in the commit that closes those rows, because a report is never edited after it is closed.

---

## T806: keep and skip

### What changed
Every priced trip card now ends in one row: **Keep** (a heart, a toggle with `aria-pressed`, brown and filled when kept), **Skip**, and the Compare tick.

**Keep.** Keep stores the trip on the device in `lib/recommend/keptStore.js` (`carta.keptTrips.v1`). A kept trip is a snapshot of the card as it stood. It holds:
- the name and photo
- the country, nights, month, dates and party
- the total a person and for the group
- the plan "Plan this trip" would hand over (`planOf`)
- the swept flight it was priced with (`kept.js keptRecord`, used by T807)

Keeping a trip again moves it to the top. The list holds at most 24 trips.

**Skip.** Skip hides the trip for this answer set (`carta.tripSkips.v1`, keyed like the compare ticks, the newest 12 answer sets). Focus moves to the next card's total. A line under the list says "Skipped for these answers: 1" and offers "Show them again".

**Kept trips in My trips.** The trips sit at the top of My trips' Shortlist tab (`auth/mytrips/KeptTrips.jsx`). Each row has the photo, name, country with flag, nights and month, and the total a person. A row's actions are **Plan this trip** and **Remove**:
- **Plan this trip** holds the kept plan in session storage for two minutes and opens the Plan tab.
- **TripFlow** picks the plan up and starts the planner on it. This is the same hand-off as the finder's own Plan this trip (T801), and in the walk Finish equals the kept card's total: 900.31 against 900.

When there are kept trips but no shortlisted places, the shortlist's empty state is not drawn under them.

**Where the trips are stored.** The plan said kept trips are "stored with the existing saved trips". The shortlist (`favorites`) holds keys only, while a kept trip must carry its total, flight and plan. So kept trips have their own device store and are shown inside the shortlist's tab. Account sync is row T806-a.

### Files touched
**Created:**
- `continent-app/src/lib/recommend/keptStore.js`: the device store. It holds keep, unkeep, skips, the one-shot plan, `useKept`, `useKeptDrops`, the My trips tab hint, and this device's number per shared shortlist.
- `continent-app/src/lib/recommend/kept.js`: the record and the watched flight. It also carries T807's `dropOf`, `biggestDrop` and `dropsFor`.
- `continent-app/src/lib/recommend/together.js`: T808's, committed here because KeptTrips imports it.
- `continent-app/src/auth/mytrips/KeptTrips.jsx`: also carries T807's drop line and T808's Decide together button.
- `continent-app/tests/recommendKept.test.mjs`

**Modified:**
- `continent-app/src/planner/finder/TripCard.jsx`: the `keep` prop and the actions row.
- `continent-app/src/planner/finder/TripsForYou.jsx`: `useSkips`, keep and skip, the hidden line.
- `continent-app/src/planner/finder/finderHooks.js`: `keepRecordOf`.
- `continent-app/src/planner/flow/TripFlow.jsx`: `takePlan` on arrival.
- `continent-app/src/auth/SavedTripsPanel.jsx`: KeptTrips in the Shortlist tab.
- `continent-app/config/recommend.json`: `kept.dropMin`, read by T807.
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js`: `tf.keep.*` and `tf.tog.*` in six languages.
- `continent-app/src/styles/87-trip-finder.css`: `.tff-acts`, `.tff-keep`, `.tff-skip-one`, `.tff-hidden`, and the `.tff-tog*` styles.
- `continent-app/src/styles/70-mytrips.css`: `.mt-kept*`.

### Commands run
```
node --test tests/recommendKept.test.mjs
npx eslint <touched files>
node scripts/ci/design-lint.mjs
npm test
```

### Config and secrets set
- **Config:** `config/recommend.json` gains `"kept": { "dropMin": 10 }`, the smallest drop worth a line, in euros a person (T807).
- **Device storage keys:** `carta.keptTrips.v1`, `carta.tripSkips.v1`, `carta.together.me` (localStorage) and `carta.finderPlan.once` (sessionStorage).
- **Secrets:** none.

### Before/after measurements
In the shared header.

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| All six language files stopped parsing (16 test files failed as a whole) | The insert script took the file's first CRLF as its line ending; the next CRLF after the anchor was the closing `};`, so the new keys landed after it | Moved the keys inside, each with its anchor line's own ending; all six import again |
| End check: on a 390 px phone, Kept trips' Plan this trip and Remove ran off the right edge, with Decide together cut | The shortlist's row card puts the actions beside the price | Kept rows have their own layout, with the actions on a row under the facts (`a7e266c8c`) |

### Screens and states for the end check (all checked)
- **Trips for you:** Keep on two cards, Skip on a third, the hidden line, "Show them again".
- **My trips → Shortlist:** Kept trips, Remove, Plan this trip into the planner and Finish.
- **Widths:** 390 px and 1440 px.

### Seven questions (carta-design)
1. **Tokens only:** yes. Brown is used for the kept selection (`--select-ink`) and for the primary Plan this trip; there are no hex values.
2. **One face, Figtree:** yes.
3. **Brown only for action or selection:** yes. Kept and the primary action are brown; Skip is `--text-2`.
4. **Sun yellow only for best value:** none is used.
5. **No text on photos:** yes.
6. **Missing figures:** a kept trip keeps its own figures. A total that left the flight out keeps "a person"; no figure is invented.
7. **Copy:** short, no banned words, no dashes. "Keep", "Skip", "Skipped for these answers: 1", "Show them again".

### What is still open
- **T806-a:** kept trips and skips live on the device only. They are not in the signed-in account's `user_settings`, so another browser or phone does not see them. Carry them in the account sync (`useAccountSync`), merged by trip id.
- **T806-b:** a Plan this trip from My trips lands only when the Plan tab shows its empty trip page (TripFlow). With a trip that already has stops open, the held plan is dropped after two minutes and the traveller sees their open trip instead. This case was not walked. Decide whether the kept plan should replace the open trip, ask, or open a new one.

### Rollback procedure
`git revert a7e266c8c 6ed778904`.

T807 and T808 import `kept.js`, `keptStore.js` and `together.js` from this commit, so revert all three tasks together (newest first): `git revert 31531b08b a7e266c8c b89190a2c 0872001f0 6ed778904`.

There is no data or schema change. A traveller's device keeps the localStorage keys, which nothing reads after a revert.

---

## T807: if it gets cheaper

### What changed
A kept trip watches one thing: its flight. Stay, food and getting around are modelled per month and do not move between sweeps.

**What is stored.** At keep time, `kept.js` looks the same flight up in the swept file the trip was priced with: the gateway, the trip's days, the paying seats and the bag rule (`roundTripNear`). It stores that as `flight.then`.

**How a drop is found.**
- The Plan home and My trips load the newest swept file of each home airport and look the flight up again.
- They compare like with like. `then` is the same lookup, never the card's figure, so a drop is always the sweep's own movement.
- A drop of at least €10 a person (`kept.dropMin`) counts. A rise, a gone flight or another home airport's file counts as nothing.

**What the traveller sees.**
- **In Kept trips:** the new total a person, and "€60 less than when you kept it" in `--good-ink`.
- **On the Plan home:** one line under the actions, in the resume card's shape: "Cheaper since you kept it / €60 less a person: Prague and Český Krumlov". It shows the biggest drop only. It is a link (`tabHref('trips')`) that opens My trips on the Shortlist tab.

The Plan home stays one screen with no scroll at 390 × 844 and 1440 × 900.

A trip with no flight to watch is kept but never shows a drop. That covers the traveller's own flight, driving, no dates, no gateway, or no swept file at keep time.

The sums (`kept.js dropsFor`) load through the finder's chunk (`FindingTrips.jsx` re-exports them), and only for a traveller who has a kept trip with a flight. The Plan home hands `loadFlightFile` in.

### Files touched
**Modified:**
- `continent-app/src/planner/flow/PlanHome.jsx`: the drop line, `onOpenKept`.
- `continent-app/src/planner/flow/PlanFlow.jsx`: `onOpenKept` (the tab hint, then My trips).
- `continent-app/src/planner/finder/FindingTrips.jsx`: re-exports `dropsFor` and `TogetherSheet`.
- `continent-app/src/styles/86-plan-flow.css`: `.pf-open-drop`.
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js`: `pf.home.cheaper` and `pf.home.cheaperBy` (the end check fix `31531b08b`).

The drop logic itself is in `kept.js` and the My trips line is in `KeptTrips.jsx`, both committed with T806.

### Commands run
As T806, and the fast build:
```
PF_OUT=.../wt/dist-t806-after npx vite build --config wt/vite.t806.mjs
node wt/t806-measure.mjs <dist>
```

### Config and secrets set
`kept.dropMin` = 10 (written with T806).

### Before/after measurements
In the shared header. The walk sets a kept trip's `then` 120 dearer (two seats), and both screens show €60 less a person, with the total €900 → €840.

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| First build: 39 modulepreloads (TF3 37) | A `keptDrops.js` module that imported the flight loader, and `TogetherSheet` as a lazy chunk of its own, made rolldown split the data host config and SheetShell into chunks of their own, both preloaded on every page | The flight loader is handed in by the screen; the sums and TogetherSheet ride in the finder's chunk, which already carries the flight rules and SheetShell; back to 37 |
| End check: the Plan home's drop line read "Prague and Český Krumlov, €60 less a ..." on a phone | The name came first, and the line truncates | The price leads: "€60 less a person: Prague and Český K..." (`31531b08b`) |
| The walk found no drop line on the Plan home | The Plan tab opens on the trip in progress, not the Plan home (`?mode=new`) | Not a defect in this batch; the walk opens `?tab=plan&mode=new`; row T807-a |

### Screens and states for the end check (all checked)
- **Plan home** with a kept trip that got cheaper (`?mode=new`).
- **My trips:** Kept trips with the drop.
- **Widths:** 390 px and 1440 px.

### Seven questions (carta-design)
1. **Tokens only:** yes. The drop is `--good-ink`, the green the design system keeps for good-deal text.
2. **One face:** yes.
3. **Brown only for action or selection:** the drop line's icon tile is the resume card's own (`--action-tint`).
4. **Sun yellow only for best value:** not used. A drop is not "best value".
5. **No text on photos:** yes.
6. **Missing figures:** no drop is shown unless both lookups exist.
7. **Copy:** price first, no tilde, no "est.". "Cheaper since you kept it", "€60 less a person: …", "€60 less than when you kept it".

### What is still open
- **T807-a:** a traveller with a trip in progress never sees the Plan home's drop line, because the Plan tab opens on their trip, not the opening (`?mode=new`). Decide whether the trip page should carry it too.

### Rollback procedure
`git revert 31531b08b 0872001f0` removes the Plan home line. My trips' drop line is in T806's KeptTrips; see T806.

---

## T808: decide together

### What changed
**Starting a shortlist.** From two kept trips, Kept trips shows **Decide together**. It sends the shortlist as one link: `navigator.share` where there is one, else the clipboard ("Link copied. Send it to the people you travel with."), else a field with the link to copy by hand.

**What the link carries** (`#together=…`, `lib/recommend/together.js`):
- up to 8 trips, each with name, photo, country, nights, month, dates and total a person
- each person's keeps and skips, in the order people joined

People are numbers, never names. The hash never reaches a server.

**Opening a link.** The app reads the code at startup, strips it from the address bar and opens **Decide together**, a SheetShell. The sheet:
- tells the newcomer they are person 2 and how many people have picked
- lists the trips in decision order: the ones everyone kept first, then by keeps, then by fewest skips
- marks a trip everyone kept with "Everyone kept this" (`--good-ink` and a select border)
- labels the others "Kept by 1 of 2"
- gives each trip this person's Keep and Skip (toggles)
- offers **Send your picks**, which passes the link on with their picks in it and waits until they have picked one

This device's number in each list is remembered, so the person who started the list is still person 1 when the reply comes back. A broken link says "This link holds no shortlist. Ask for a new one."

**Why a link and not co-planner sharing.** The plan said "through co-planner sharing". Co-planners in this app share an account `trip_plans` row:
- a guest cannot take part
- the co-planner link needs migration 052, which is not applied (T434-a)
- there is no vote table, and there is no realtime anywhere

A link works for everyone today, with no migration. The trade-off is that the picks travel as the link moves, instead of syncing live. Row T808-a puts the choice to the owner.

### Files touched
**Created:**
- `continent-app/src/planner/finder/TogetherSheet.jsx`

**Modified:**
- `continent-app/src/App.jsx`: reads `#together=` once at startup, strips it, renders the sheet. The sheet loads lazily through the finder's chunk. App reads the hash by hand, so its first load carries none of `together.js`.

`together.js`, its strings and its styles were committed with T806.

### Commands run
As T806.

### Config and secrets set
None. Device key `carta.together.me` (keptStore.js).

### Before/after measurements
- **First paint:** +1,024 bytes. App's hash read and the lazy import.
- **Link size:** a two-trip link is 905 characters, photos included.

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| SheetShell became its own preloaded chunk (first build) | TogetherSheet as a lazy chunk of its own | It rides in the finder's chunk (`FindingTrips.jsx` re-export); see T807 |

### Screens and states for the end check (all checked)
- **Kept trips:** Decide together, then the copied link.
- **A second browser:** opens the link; checked that the sheet opens, the hash is gone, the newcomer is person 2, Send waits for a pick, keep and skip work, the both-kept trip rises with "Everyone kept this", the other reads "Kept by 1 of 2", and Escape closes the sheet.
- **A broken link.**
- **Widths:** 390 px and 1440 px.

### Seven questions (carta-design)
1. **Tokens only:** yes.
2. **One face:** yes.
3. **Brown only for action or selection:** Keep (selected), Skip (selected), the primary Send, and the agreed trip's select border.
4. **Sun yellow:** not used.
5. **No text on photos:** yes.
6. **Missing figures:** a trip whose total is unknown in the link shows no price line.
7. **Copy:** short; people are numbers ("You are person 2."); no banned words.

### What is still open
- **T808-a:** Decide together runs on a link, not on co-planner sharing as the plan said. Co-planners need an account trip and migration 052 (not applied), and there is no vote table. Decide whether picks should move to Supabase later (a votes table, with realtime or polling) or stay on the link.
- **T808-b:** a person who opens a shared shortlist cannot keep its trips into their own Kept trips, because the link carries no plan and no flight. Add "Keep the ones I kept", re-pricing each trip from its places and dates.

### Rollback procedure
`git revert b89190a2c` removes the sheet and the hash read. Links already sent then open the app without the sheet. `together.js` and the Decide together button are in T806.

---

## Open items written to `_OPEN.md`
T806-a, T806-b, T807-a, T808-a, T808-b, plus T808-c: the batch is on branch `p15-trip-finder-together`. The owner asked for merge, push and deploy in the same request, and they follow this report in the deploy commit, which closes T792-a, T803-f and T808-c.
