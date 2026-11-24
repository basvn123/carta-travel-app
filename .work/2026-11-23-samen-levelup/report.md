# Report: Vrienden (was Samen) and the kring tool (G16, decision 0017)

**Status: done (2026-11-24). The owner said yes; merged into main as `e33fc4c9c1`, pushed and shipped with `node scripts/ship.mjs --live`. Migration 078 is still an owner step.**

**Result (version 3, 2026-11-24):** The owner said v2 felt like puzzle pieces. Vrienden is now one timeline:
- a face strip with Jij first, and a sticky status line ("n wachten op jou");
- Nu, then each month, then Zonder datum, on one spine with date plates;
- one card grammar (3:2 photo, faces, title, one fact, one action);
- on desktop, a sticky left column (status, Nu, roster) and a 3-across month grid.

The 0-friend page follows My trips: Uitnodigen plus "Bekijk een voorbeeld", which fills the real page with example data under the ExampleBar, and nothing is saved.

Three judge rounds ran on v3:
- v3-1: FAIL;
- v3-2: FAIL, 3.50;
- v3-3: FAIL, 3.85, on one defect (the Nu spine crossed the first month head from 768 to 1099 px).

That defect is fixed in `805a187d60`, and a new verify rule now catches it. The three-loop cap is reached, so there is no fourth judge. The branch has 67 commits after `68a04020ce` (68 files, +6230 / −441), not pushed.

**Below, version 2 as first built.** The kring tool, Jij, invite and links are unchanged in v3. The v2 page layout is replaced by the timeline.

The tool lets a private group:
- propose trips;
- vote up or down;
- see the days most members can go;
- compare each member's flight;
- pick and make the trip.

Judge 3 passed it with every criterion at 4, after two failed rounds whose fixes are all in.

## What the traveller gets
- **The page:**
  - The name **Vrienden** in six languages, with one people glyph; the door shows its word from 1100 px.
  - The head: "Uitnodigen" and your own face, which opens Jij.
  - **Wie gaat waarheen:** a rail of friends' next trips with a day countdown.
  - **Te doen** as a deck of cards.
  - **Samen onderweg:** lanes with the overlap in saffron.
  - **Vrienden** as photo cards.
  - **Kringen**, then the existing group trips.
  - **Gedeeld** opens the exact list or the co-planned trip.
  - **Rekeningen** on one axis.
  - On desktop, two columns; one column when the left one would be empty.
- **Jij:** your handle, what friends see (the privacy switches) and the milestones as filling rings. It replaces the lock button.
- **Invite:**
  - a sheet on a phone (share, link, QR, find by name) and a popover on desktop;
  - a guest sees "@handle nodigt je uit", and the handle is held through Google sign-in (`holdFriendHandle`).
- **Kring tool:**
  - overview (static ring, steps);
  - Stemmen (arrows, live re-sort);
  - Datums (heat calendar, the best window in saffron, ranges per member, home airport);
  - Vluchten (fares from the swept files, "Nog geen prijs", the fairest proposal framed);
  - Gekozen (a stamp, and "Maak de reis" opening Plan with the members as co-planners);
  - New kring;
  - `#circle=` links.
- **Links from the rest of the app:**
  - the place page's Friends here faces;
  - "Stel voor in kring" on a place;
  - Bewaard shared-list members;
  - Account.

  Four links were skipped, each with its reason in decision 0017.
- **Jouw Europa:** the compass rose is replaced by four ruled rows, N, O, Z and W.
- **Place names:** in the reader's language, cached across openings, so nothing flashes in English.

## Checks
- **verify_vrienden** (new):
  - 360 of 360 cells (12 variants, 360 to 1440 px, six languages) on the judge 1 fix build;
  - 180 of 180 in nl, de and fr on the final build `f003b7bc12`;
  - it checks: overflow, clipped text, 44 px targets, photos sharp at 2x, equal photo tops and heights per row, one saffron mark, axe, CLS, no first-paint motion, and no English place names in Dutch.
- **verify_mytrips:** 27 cells and 36 cells, 0 fail, before the last polish. The last polish did not touch My trips.
- **circles tests:** 12 of 12. **i18n and header tests:** 41 of 41.
- **css-routes** clean, **design-lint** 0 new, **eslint** 0 errors, **docs checks** OK.
- No CRLF in any committed file. The i18n diff is keys only: 708 insertions.
- **npm test:** 2496 tests, 2440 pass, 43 fail.
  - 32 of the failures are "transport invoke timed out".
  - The files re-run alone fail with the same timeout.
  - `passMoment` fails the same way on main (8 pass, 1 timeout loading `en.js`).
  - The shared machine is overloaded; a clean run is not verified.

## Judging
| Round | Result | Below the bar |
|---|---|---|
| 1 (`judgement-1.md`) | FAIL | house fit 3, completeness 3: English place names, CRLF i18n files, links, the step figure, ring faces on the photo, the sharpness rule |
| 2 (`judgement-2.md`) | FAIL | clarity, house fit, phone and desktop, states 3: milestone icons, the empty desktop column, plurals, repeated text, the one-friend state |
| 3 (`judgement-3.md`) | PASS, all 4 | polish only: the English place-name flash, photo load gaps, QR top, the Rekeningen labels, the 3 van 3 ring, the rail wording. All fixed after. |
| v3-1 (`judgement-v3-1.md`) | FAIL | the first v3 build; 10 fixes (one count, the example that moves, Toon dagen, desktop holes) |
| v3-2 (`judgement-v3-2.md`) | FAIL, 3.50 | lone desktop cards, the 0-friend page, Nu slabs, 820 rows, title alignment, lanes at first paint, + Nieuw as a menu; all 6 fixed |
| v3-3 (`judgement-v3-3.md`) | FAIL, 3.85 (phone and desktop 3, the rest 4) | the Nu spine crossed the first month head from 768 to 1099 px; fixed in `805a187d60`, plus 4 optional polish items. Checks after: verify_vrienden 210 of 210 (nl, de, fr) and 15 of 15 (en, es, it, empty), eslint 0, css-routes clean, design-lint 0 new, 59 of 59 tests. Not re-judged (the loop cap). |

## Not verified
- Migration 078 against live Supabase.
- "Maak de reis" with a real database.
- `holdFriendHandle` through a real Google sign-in.
- Motion in a headed browser.
- A clean `npm test` on an idle machine.
- The v3-3 fix by a fresh judge (the loop cap); it is covered by the new verify rule.
- The once-per-visit entrance in a headed browser.
- Open polish: a rule under the Zonder datum head, different photos for the same city, mock data for the overlap panel.

## Owner steps
- Apply `supabase/migrations/078_circles.sql` (down file `078_circles_down.sql`), step 6 in `docs/owner/supabase-migrations.md`. Until then the Kringen section stays hidden and the rest works.

## Undo
`git revert` the merge. Migration 078 has a down file and only adds tables, so nothing existing changes.

## Files changed (`git diff --stat 68a04020ce..HEAD` in the worktree: 62 files, 4942 insertions, 397 deletions)
| File | Change |
|---|---|
| `supabase/migrations/078_circles.sql`, `078_circles_down.sql` | new: circles, members with home airport, proposals, votes of +1 or -1, availability, RLS |
| `continent-app/src/lib/circles/{rank,window,fairest}.js`, `continent-app/tests/circles.test.mjs` | new: pure logic and tests |
| `continent-app/src/auth/circles.js` | new: the API, with a missing-table fallback |
| `continent-app/src/together/home/VriendenHome.jsx`, `MeView.jsx`, `Invite.jsx`, `PlaceName.jsx`, `placeNameCache.js`, `ProposeInCircle.jsx`, `openVrienden.js`, `vrienden.js` | new: page, Jij, invite and place names |
| `continent-app/src/together/circle/{CircleView,NewCircle,Ring,circleMock,useCircleFares}.js(x)` | new: the kring tool |
| `continent-app/src/together/{TogetherPage,GroupTrips,Privacy,SettleUp,signals,useTogether,friendsMock}.js(x)` | wired into Vrienden |
| `continent-app/src/styles/91-vrienden.css` (new), `90-together.css`, `72-atlas.css`, `73-mytrips-ink.css`, `continent-app/src/styles.css` | styles; the compass rose rows |
| `continent-app/src/App.jsx`, `continent-app/src/lib/urlState.js`, `continent-app/src/auth/{AccountPanel,FriendBadges,friends,sharedLists}.js(x)`, `continent-app/src/auth/mytrips/{EuropeParts,SavedTab,SharedList,openList}.js(x)`, `continent-app/src/components/{FriendsWentHere,HouseIcons,Icons}.jsx` | routes, the friend hold, links, icons, compass |
| `continent-app/src/i18n/{nl,en,de,fr,es,it}.js` | Vrienden and kring keys, singular forms |
| `continent-app/scripts/verify_vrienden.mjs` (new), `continent-app/tests/headerPills.test.mjs` | checks |
| `DESIGN.md`, `ROADMAP.md` (G16), `docs/HANDBOOK.md`, `docs/project-map.md`, `docs/decisions/0017-vrienden-and-kringen.md`, `docs/decisions/0016-my-trips-ink-and-photo.md`, `docs/decisions/README.md`, `docs/owner/README.md`, `docs/owner/supabase-migrations.md` | docs |
| `.work/2026-11-23-samen-levelup/*` | the run folder |
