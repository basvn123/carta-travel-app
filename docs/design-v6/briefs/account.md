# My trips, account, sharing, passes, guides and admin: design brief

T379, design wave V1, 2026-10-08. Surface key `account`. This brief is what V3 (structure), V4 (visual and dynamic) and V5 (harden and polish) build the surface from. It changes no code. carta-design and DESIGN.md win over everything here; anything this brief proposes that carta-design does not cover is listed in part 7 and waits for T380 (V2) to accept or reject it.

App paths are written from the app repo root (`src/...`). Screenshots are outside both repos in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\account\` and are named `V1-<view>-<width>.jpg`; the build waves save their "after" set under the same view names.

## Session plan (committed before the work)

1. Setup: impeccable context from the root worktree with `src/components/PassModal.jsx` as the target; read critique, audit, shape and operate; pick the mode.
2. Walk My trips (empty and `?savedmock`), a saved trip, sharing and co-planners, the shared trip view, past trips and memories, Account (profile, friends, FAQ, language, data export), sign in, sign up, reset password, the pass modal and paywall (`?paymock`), guides and the upload form, the install hint and the admin page, at 380 and 1280 px, cold and returning; save at most eight before screenshots.
3. Inventory every view, state and control the surface draws, with its file and a verdict (keep, move, merge, remove, rework).
4. Critique: design review and detector run as two isolated sub-agents, then synthesis; a short technical audit from the eight existing harnesses.
5. The traveller's job on this surface, against `docs/design-v6/TRIP-PLANNING-RESEARCH.md` (My trips and sharing, Account).
6. Shape: three numbered build lists (V3, V4, V5), each item with files, impeccable command and done check, and a target-state control table.
7. Needs a rule: every proposal carta-design does not yet cover, one line each, for T380.

## 1. Setup and mode

`impeccable context --target src/components/PassModal.jsx` ran from the root worktree and loaded PRODUCT.md and DESIGN.md (the target path does not exist in the root worktree, which holds no app files; the context does not depend on it). It reported no surface brief, no automatic detector hook, and the autonomy directive. That directive asks for one probe of the question tool; this run is unattended and the owner told every session to proceed (owner instruction 2026-10-07), which is the directive's "the user tells you to proceed" case, so no question was asked and every choice below that impeccable would have asked about takes the option that keeps Carta's palette, type and identity. Read: `reference/critique.md`, `audit.md`, `shape.md`, `operate.md`.

Mode: Operate, with a Read pocket (the FAQ, the statement of reasons) and one Persuade moment (the pass modal). The traveller comes here to do something with what they already found: open the next trip, compare the shortlist, share a plan, set a default, buy a pass when a gate asks. Success is a task completed, which is Operate's definition, and operate.md's rules fit: "the tool should disappear into the task", one vocabulary across screens, every component with its states. It is not Persuade as a whole: the account is not a sales page, and the walk shows the hub leaning that way is a fault (part 4). The pass modal is the one place where Persuade's job (decide and act) applies, and carta-design's plan-card rules already govern it. The admin page is the owner's tool, Operate in its purest form, and is held to consistency only.

## 2. The walk

Walked on the shared dev server (`http://127.0.0.1:5199`, the main checkout, app commit `3b3e5a8`) with Playwright from a scratch script outside both repos, one browser at a time. Storage was seeded as the harnesses seed it (guest mode, home and welcome seen, language English). "Signed in" means a stub session in the key supabase-js reads and every Supabase call answered locally, the method of `scripts/verify_account_panel.mjs`; the stub said "2 of 3" plans left, so that figure on the screenshots is the stub's, not the free tier's (2 for life, `src/lib/pricing.js`:73-82). Ten sessions shared the server: two My trips views at 1280 px timed out on the first pass and were walked again, and the guides deep link (`#guide=guide-1`) at 380 px never opened the gallery within three minutes. The guides, upload, feedback sheet and admin views are therefore described from the code (part 3) and not measured; the admin page cannot be reached at all without an admin account or the harness's stubs.

Screens saved (eight, the cap), in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\account\`:

| View | 380 | 1280 | What it shows |
|---|---|---|---|
| mytrips-planned | V1-mytrips-planned-380.jpg | V1-mytrips-planned-1280.jpg | `?savedmock`, Planned: the next trip, its moderation notice, friends' trips |
| mytrips-visited | V1-mytrips-visited-380.jpg | | Visited: record map, ledger counters, "Alongside your friends" |
| account-hub | V1-account-hub-380.jpg | V1-account-hub-1280.jpg | Signed in: profile card, pass card, invite, Lifestyle |
| passes | V1-passes-380.jpg | V1-passes-1280.jpg | The pass modal from "See passes" |
| signin | V1-signin-380.jpg | | The sign-in modal from the account page |

As the traveller in the research (a hiker on a budget, phone first, mid-plan or returning):

Cold start, phone, empty device. My trips opens on Planned with two invitations, signed out "Sign in" and "Open the Day planner", both filled with the accent: two primaries in one view on both widths (walk.json `accentInView`). The page has no visible title on the phone; the sr-only h1 says "My trips".

With saved trips, phone. The first screen is the tab row (Favorites, Planned, Visited, with counts), "Your upcoming journeys" with an accent-filled count badge, and one trip: a full-width photograph of Lisbon with "Portugal", "Lisbon, Porto" and "29 Oct → 4 Nov 2026" set on the photo over a gradient shade, a mono "In 21 days" chip and a 32 px "..." in its corner. Under the photo, "Plan its days in the Day planner". Then the moderation notice, larger than the trip it belongs to, then "From your friends" with another accent count badge and another photo card. No figure anywhere: not what the trip costs, not what a day there costs, not whether that moved since it was saved. Share is the second item of the "..." menu, and only when signed in. On desktop the same card spans 960 px of photo; the selected tab is ink-filled in the left rail (V1-mytrips-planned-1280), and the header calls the page "Saved trips".

Visited. The record map (blank tiles on the shared server, not counted), then two stat cards, "Visited countries 3 / 43" and "Visited cities 3 / Cities visited", which is carta-design's never-do item 2 (a row of stat counters as a hero device), then "Alongside your friends". Every visited card has a 28 px "Add who came" and a 32 px "..." (walk.json under-44 labels).

Returning visit. The page reopens on the last tab used, measured as Visited at both widths after a reload (walk.json `mytrips-return`), because the tab is remembered in `carta.savedTripsTab` (STP:713-722). A traveller who last looked at their record comes back to their record, not to the next trip; for the returning audience PRODUCT.md names, Planned (the next trip) is the right landing whenever an upcoming trip exists.

Account, signed in. Phone: a tracked 10 px "Account" label, the profile card, then "Your pass" with an accent icon, the Free tier, "What a Trip Pass adds" with three ticks ("Unlimited day plans (fair use 60)"), "€6.99 once, 30 days" and a full-width accent "See passes", then a pink invite card "Plan the next one together", then Lifestyle with its value in accent. The traveller's settings start on the third screen; the first two sell. Desktop: a nine-row rail (Overview, Profile details, Friends; Send feedback, Common questions, Privacy policy, Terms of service, Imprint, Data sources), every row drawn as a filled pill, the selected one ink-filled; the header avatar is an accent-filled disc (V1-account-hub-1280). The Profile spoke carries two accent primaries ("Save changes", "Update password") at both widths and 12 to 13 controls under 44 px in a fine-pointer context.

Passes. On a phone the modal opens on the heading, the lead, the withdrawal waiver and the Free card; the recommended Trip Pass and its button are below the first screen (V1-passes-380). On desktop three equal cards, the Trip Pass with the accent border and "Recommended" badge, one accent "Get this pass", which follows carta-design. The prices are in Fraunces, not mono, and the small "once, 30 days" under them inherits Fraunces at about 11 px. The Year Pass says "Costs the same as 2 Trip Passes": €14.99 against two at €6.99, €13.98 (`yearPassTripsEquivalent()` floors 1499 / 699, `src/lib/pricing.js`:139-144). That is a figure stated wrongly on the page that sells.

Sign in. Opening sign-in from the account page closes the account page first: the modal sits over Destinations (V1-signin-380). The close is a grey disc with a letter "x" hanging off the card's corner; the tabs are 25 px high; the password placeholder is eight dots, which reads as a filled field; the submit is ink-filled, while the account page's submits are accent.

Shared view (`?sharemock=1#shared=...`). Opens straight into the trip with no gate, which is right. It has no h1 at either width, and its only action, "Price your own trip", is 41 px.

Measured on the walk (scratch script; controls are visible `button`, `a[href]`, `[role=tab]`, `summary`, `input`, `select` and `textarea` inside the view's root; "under 44" counts any side below 44 px in Playwright's default context, which is a fine pointer, so it overcounts against the 32 px fine-pointer allowance and V5 must re-measure with `hasTouch`):

| View | Width | Controls | Under 44 | Accent fills (in view) | Sideways scroll |
|---|---|---|---|---|---|
| My trips, empty, signed out | 380 / 1280 | 5 / 2 | 0 / 2 | 2 (2) / 2 (2) | 0 / 0 |
| My trips Planned, `?savedmock` | 380 / 1280 | 11 / 8 | 3 / 4 | 1 (0) / 1 (0) | 0 / 0 |
| My trips Favorites | 380 / 1280 | 10 / 7 | 3 / 4 | 1 (1) / 1 (1) | 0 / 0 |
| My trips Visited | 380 / 1280 | 14 / 16 | 8 / 13 | 0 / 0 | 0 / 0 |
| Account hub, signed in | 380 / 1280 | 16 / 10 | 0 / 1 | 1 (1) / 1 (1) | 0 / 0 |
| Account hub, signed out | 380 / 1280 | 15 / 9 | 0 / 1 | 1 (1) / 1 (1) | 0 / 0 |
| Profile spoke | 380 / 1280 | 18 / 17 | 13 / 12 | 2 (1) / 2 (1) | 0 / 0 |
| FAQ spoke | 380 / 1280 | 16 / 15 | 1 / 0 | 0 / 0 | 0 / 0 |
| Pass modal | 380 / 1280 | 4 / 4 | 4 / 4 | 1 (0) / 1 (1) | 0 / 0 |
| Sign-in modal | 380 / 1280 | 8 / 8 | 7 / 8 | 0 / 0 | 0 / 0 |
| Shared trip view | 380 / 1280 | 3 / 6 | 1 / 6 | 0 / 0 | 0 / 0 |
| One guide (`#guide=guide-1`) | 1280 | 8 | 8 | 0 | 0 |

Every view except the shared view and the guide had two `h1` elements in the document (three on the signed-out views), against carta-design's one per view. No view scrolled sideways at 380 px.

## 3. Inventory

One row per view, state, control and visual setting. Read from the code (three read-only sub-agents, then checked against the walk); line numbers are the app repo at commit `3b3e5a8`. Verdicts: keep, move, merge, remove, rework. Where a row says "rework" the target is in the V3 to V5 lists in part 6. Abbreviations: STP `src/auth/SavedTripsPanel.jsx`, TSP `src/auth/TripSharePanel.jsx`, STV `src/auth/SharedTripView.jsx`, FTP `src/auth/FriendTripPanel.jsx`, PTF `src/auth/PastTripForm.jsx`, TMV `src/auth/TripMemoryView.jsx`, IH `src/auth/InstallHint.jsx`, AP `src/auth/AccountPanel.jsx`, FS `src/auth/FriendsSpoke.jsx`, FB `src/auth/FriendBadges.jsx`, AM `src/auth/AuthModal.jsx`, AG `src/auth/AuthGate.jsx`, RP `src/auth/ResetPasswordScreen.jsx`, MN `src/auth/ModerationNotice.jsx`, PM `src/components/PassModal.jsx`, GP `src/community/GuidesPanel.jsx`, GS `src/community/GuidesStrip.jsx`, RG `src/community/ReportGuide.jsx`, UF `src/community/UploadForm.jsx`, RPB `src/components/ReportProblem.jsx`, ADM `src/admin/AdminPage.jsx`, `admin/` `src/components/admin/`. CSS: c16 to c42 are `src/styles/16-auth.css` and so on; c23, c24, c25 are `23-places-pages.css`, `24-destination-workspace.css` and `25-feature-pages.css`, which today carry a large share of this surface's rules.

### Views and states

| View or state | What it is | File | Verdict |
|---|---|---|---|
| My trips page | Full page on the phone (bottom nav), left rail and column on desktop (header) | STP:1376-1870, c17, c25:85-221 | rework (V3 1, 2) |
| My trips, fresh device | Planned tab first, two empty shelves | STP:1503-1622 | rework: one invitation, one primary |
| My trips, signed out | Shortlist works; account shelves become sign-in invitations | STP:1461-1467, 1508 | keep the logic, rework the copy ("find them back") |
| My trips, accounts not configured | Information line, no action | STP:1464 | keep |
| My trips, loading | Card skeletons | STP:1468, 1508 | keep |
| My trips, error | One sentence and Try again on Favorites and Planned; raw `e.message` and no retry on Visited | STP:1470, 1510, 1760 | rework Visited to the StateBlocks error |
| `?savedmock` | Fixture: three places, four plans, three friend trips, one moderation notice | STP:62-93 | keep (verify seam) |
| Past trip form | Inline sheet under the record heading | PTF:342-810 | rework (V3 6) |
| Memory view | Read-only record of a past trip, owner, friend and reader | TMV:42-176 | keep, V4 imagery |
| Share panel | Under a card, signed in only | TSP:263-369 | rework (V3 4) |
| Shared trip view | Full takeover from `#shared=` | STV:67-136 | rework (Escape, focus, "to") |
| Shared view, failed and gone | Two buttons; one-line explanation | STV:77-92 | keep |
| Friend trip panel | Expands a friend's card | FTP:76-119 | keep; "to" hard-coded |
| Full-screen record map | Portal dialog from Visited | STP:1690-1715 | rework: focus trap, aria-modal |
| Install hint | One line and one secondary under the tabs, phone browser, after a save | IH:16-97 | keep (carta-design rule, T362) |
| Account page, signed in | Hub with profile card, pass card, invite, Lifestyle, Language, Help | AP:778-965 | rework (V3 7) |
| Account page, signed out | Sign-in card, then Lifestyle, Language, Help | AP:829-834 | keep |
| Account, auth not configured | Top card renders nothing | AP:835 | rework: one line saying accounts are off |
| Profile spoke | Profile, Security, Session, Your data, Danger zone | AP:968-1364 | rework (V3 8: split) |
| Friends spoke | Handle, requests, invites, friends, trips shelf, milestones, guides strip | FS:281-516, FB | rework (V3 9) |
| FAQ spoke | 14 questions in four groups | AP:1381-1414 | keep; fix faq13A |
| Feedback spoke and sent state | Kind chips, message, send | AP:1436-1488 | rework copy (stale "Send by email") |
| Data sources spoke | Credits list | AP:1420-1432 | keep, rename (clashes with "Your data") |
| Legal modals | Privacy, Terms, Imprint | `src/components/PrivacyPolicy.jsx`, `TermsOfService.jsx`, `Imprint.jsx` | keep; scrim token (V5) |
| Pass modal | Three plan cards, per-reason heading | PM:18-188 | rework (V3 10, V4 6) |
| Pass modal, checkout loading and error | "Opening checkout..." and an amber box | PM:32-44, 162-176 | rework: "..." to an ellipsis character, one sentence |
| `?paymock` | Forces paid, so gates never open | `src/hooks/usePaywall.jsx`:98-110 | keep (seam) |
| Sign-in modal | Sign in, create account, forgot | AM:85-224 | rework (V3 11) |
| Sign-in notice | "Almost there" and reset-sent | AM:135-141 | keep |
| Auth gate | Full screen after sign-out | AG:16-49 | rework: focus, links to 44 px |
| Reset password screen | Recovery takeover | RP:41-93 | rework: same password field as the account (reveal, checklist) |
| Email-confirmed toast | Bottom toast after the signup link | `src/App.jsx`:1354, c16:392-424 | rework: reduced-motion branch |
| Moderation notice | DSA statement under a moderated plan card | MN:111-220 | keep |
| Guides gallery | Slide-over list, filter chips, one guide view | GP:267-351 | rework (V3 12) |
| Guides loading, error, empty, gone | Skeleton; one sentence and Try again; "Publish a trip"; "not published any more" | GP:119-331 | rework "gone" (a network error lands there too) |
| Guides strip | Count and All guides, on Explore and Friends | GS:36-57 | keep |
| Report guide form | Inline DSA notice form | RG:109-203 | keep |
| Upload dialog | Modal with scrim and focus trap | UF:168-314 | keep; signed-out state needs a sign-in action |
| Feedback sheet (Report a problem) | SheetShell on item pages | RPB:61-121, c42 | keep; wrong error for a bad email |
| Admin lock | Re-auth card | `admin/AdminLock.jsx`:33-68 | keep, consistency fixes (V5) |
| Admin page | Eight tabs, owner metrics, consoles | ADM:121-221, `admin/*` | consistency only (V5 8) |
| Admin content editor | Fixed overlay dialog | `admin/ContentSection.jsx`:491-634 | rework: aria-modal, own Escape, focus trap |

### My trips: shell and Favorites

| Control | What it does | Where | File | Verdict |
|---|---|---|---|---|
| "My trips" | Opens the page | Phone bottom nav | `src/components/BottomNav.jsx`:89-97 | keep |
| "Saved trips" | Opens the same page | Desktop header | `src/components/AppHeader.jsx`:97-105 | rework: one name, "My trips" |
| Close "x" | Closes the page | Panel head, phone; 38 px; a letter x | STP:1393 | remove (the nav closes the page, as the account page already does by hiding its cross) |
| Sr-only h1 "My trips" | Heading for assistive tech | Panel | STP:1392 | rework: a visible h1 (V3 1) |
| Rail label "Saved trips" | Labels the desktop rail | Desktop | STP:1380-1387 | merge into the visible h1 |
| Tabs Favorites, Planned, Visited, with counts | Switch shelf, remembered in `carta.savedTripsTab` | Rail on desktop, tile row on phone (drawn twice) | STP:1355-1403, c25:121-221 | rework: order Planned, Favorites, Visited stays; selected state ink-fill not accent tick (V3 2) |
| Install hint "Add to home screen" | Prompts install | Under the tabs, phone | IH:92 | keep |
| Install hint dismiss "x" | Dismisses forever | Same | IH:93 | keep, icon glyph not a letter (V5) |
| "Your shortlist" with count pill | Heading of starred items | Favorites | STP:1418, c17:36 | rework: count pill not accent-filled |
| Shortlist group titles | Places, Walks and so on | Favorites | STP:1439 | keep |
| Shortlist row | Opens the place or layer page | Favorites | STP:359-395 | keep; add the day cost (V3 3) |
| Star (remove from shortlist) | Un-stars at once | Row end, 38 px wide | STP:381-392 | rework: undo toast instead of no confirmation; star is `--accent` today, keep (an action), 44 px |
| "Browse the map" (shortlist empty) | Goes to Destinations | Favorites | STP:1429-1434 | merge with the other "Browse the map" (one target) |
| "Sign in" (account shelf) | Opens sign-in | Favorites, signed out | STP:1461-1467 | keep, only primary in view |
| "Try again" | Reloads saved trips | Favorites error | STP:1470 | keep |
| "Browse the map" (account empty) | Goes to the map tab | Favorites | STP:1472-1478 | merge (same label, different target today) |
| Fav card | Opens the trip on the map | Two-column grid | STP:263-317 | rework: price line, no gradient shade, 12 px radius (V3 3, V4 2) |
| Fav card flag badge | Country | Card corner, raw rgba | STP:277-281 | keep, token fill (V5) |
| Fav card "Saved {date}" | Date saved, in mono | Card foot | c17:1433 | rework: the word in `--ui`, the date in mono |
| Bookmark (remove) | Opens the in-card question | Card corner, 28 px | STP:298-305 | rework: 44 px, `--danger` on the confirm only |
| Card overlay Keep and Remove | Confirms removal | Covers the card; Remove accent-filled; no focus move | STP:306-314 | rework: Remove in `--danger`, focus into the question, Escape keeps |

### My trips: Planned

| Control | What it does | Where | File | Verdict |
|---|---|---|---|---|
| "Your upcoming journeys" with count | Shelf heading | Planned | STP:1503 | keep, count pill neutral |
| "Plan your first trip" | Goes to the Trip planner | Planned empty | STP:1512-1518 | keep as the one primary |
| "Open the Day planner" | Goes to the Day planner | Day plans empty | STP:1616-1622 | rework: secondary (two accent fills today) |
| "Sign in" (Planned, signed out) | Opens sign-in | Planned | STP:1321-1328 | keep, then the day-plans CTA is secondary |
| Journey card | Opens the plan in the planner | Stack | STP:519-576 | rework: total for the traveller's inputs, what changed since saved, no shade gradient (V3 3, V4 2) |
| When chip "In 12 days" | Countdown | Photo corner, mono labels | STP:1150-1156 | rework: number in mono, words in `--ui` |
| Dates line | Date range | Card caption | STP:545 | keep |
| More "..." | Opens the card menu | 32 px, no arrow keys | STP:175-184 | rework: 44 px, menu keyboard (V5) |
| Menu "Edit" | Opens the planner in edit mode | Menu | STP:1536 | remove (the card tap does the same) |
| Menu "Share this trip" | Opens the share panel | Menu, signed in | STP:1238 | keep, also as a visible button on the card (V3 4) |
| Menu "Remove" | Asks first | Menu, `--accent` text | STP:198-208 | rework: `--danger` |
| ConfirmRow Keep and Remove | Confirms trip deletion | Replaces the card; 28 px; accent | STP:217-226 | rework: `--danger`, 44 px, focus |
| "Planned with {who}" | Co-planned line | Under the card | STP:1548 | keep |
| Footer "Plan its days in the Day planner" | Opens the Day planner | Card foot, 38 px | STP:1554-1560 | keep, 44 px |
| Moderation notice | Statement and contest | Under the card | MN | keep |
| "From your friends" shelf | Friends' trips, read only | Planned | STP:1575-1609 | move to Friends only (V3 9), or keep one line linking there |
| Friend journey card | Expands the friend trip | Same | STP:1586-1603 | keep in Friends |
| Day plans shelf, compact card | Opens the day plan | Planned | STP:230-257, 1612-1651 | keep |

### My trips: Visited, past trip form and memory

| Control | What it does | Where | File | Verdict |
|---|---|---|---|---|
| Record mini map | Countries painted, pins toggle memories | Visited top | STP:1660-1682 | keep, V4 motion on pin |
| "See the map bigger" | Opens the full map | Map corner, 30 px | STP:1672 | rework 44 px |
| Full map "Close the map" | Leaves | Full map bar, 32 px | STP:1703 | rework 44 px, focus return |
| Ledger "Visited countries" and "Visited cities" | Counts | Visited | STP:652-690 | keep; city pill to a hairline row |
| "Alongside your friends" | Counts beside friends | Visited | STP:592-646 | move to Friends (V3 9) |
| "+ Add a past trip" (header) | Opens the form | Record heading, 26 px | STP:1735-1742 | keep as the one entry, 44 px |
| "Add a past trip" (empty) | Opens the form | Record empty | STP:1763-1768 | keep only when the list is empty (it is then the one entry) |
| Visited card | Toggles the memory | Record | STP:1779-1866 | keep |
| Menu "Edit this trip" | Opens the form with the memory | Menu | STP:1795 | keep; remove the duplicate in TMV |
| Menu "Open the Trip planner" | Opens the planner | Menu | STP:1801 | keep |
| Menu "Share this trip", "Remove" | As on Planned | Menu | STP:1807, 1815 | as Planned |
| Crew strip "Add who came along" | Who came | Under each card | STP:412-513 | keep; initials in `--ui` |
| Crew "+" | Opens the popover, 28 px, rotates without reduced-motion | Crew strip | STP:447-455 | rework 44 px, reduced motion |
| Crew friend chip, name input, "Add" | Adds a person; input has no label | Popover | STP:462-489 | rework: label the input |
| Crew remove "x" | Removes at once, 18 px, renumbers the ledger | Popover | STP:497-504 | rework: undo, 44 px |
| Memory footer "See this trip" | Toggles the memory | Card foot | STP:1193-1204 | remove (duplicates the card tap); the summary moves into the card caption |
| TMV rating chip "8 / 10" | Rating, ochre | Memory | TMV:78-84 | keep |
| TMV "What it cost" receipt | Self-reported spend | Memory | TMV:144-166 | keep; receipt rules (V4 4) |
| TMV "Edit this trip" | Opens the form | Memory foot, 30 px | TMV:169-173 | remove (menu has it) |
| PTF place list, nights steppers "-" "+" | Splits nights, 24 px | Form | PTF:349-378 | rework 44 px |
| PTF place remove | Drops a place, 20 px | Form | PTF:369 | rework 44 px |
| PTF city search and results | Catalogue search, Enter adds | Form | PTF:381-408 | keep; placeholder "for example Salzburg" |
| PTF "Look up anywhere" | Geocodes | Form, 28 px | PTF:421 | keep, 44 px |
| PTF First day, Last day | Dates | Form | PTF:430-452 | keep |
| PTF name input | Trip label | Form | PTF:460 | keep |
| PTF folds Who came, How you travelled, Where you slept, What it cost, How it was, Photographs | Optional detail | Form | PTF:474-795 | rework: keep the folds as step two behind "Add details" (V3 6) |
| PTF Adults, Children steppers | Counts, 24 px, aria "Adults -1" | Fold | PTF:481-497 | rework 44 px, aria "Fewer adults" |
| PTF companion inputs, trash, "+ Add a name", friend chips | Crew | Fold | PTF:498-556 | rework: labels, 44 px |
| PTF mode toggles (7) | Leg mode, 32x30 px | Fold | PTF:104-124 | rework 44 px |
| PTF stay name, kind select | Stay | Fold | PTF:587-616 | keep |
| PTF currency select, six amounts, live total | Spend | Fold | PTF:625-658 | keep; currency select in `--ui` |
| PTF rating 1 to 10 | Rating, 28 px, ochre | Fold | PTF:669-682 | rework 44 px (wraps to two rows on a phone) |
| PTF story, highlights, "+" | Text | Fold | PTF:683-738 | rework labels |
| PTF photo grid, cover star, remove, caption, "Add photos" | Photos, 22 px buttons | Fold | PTF:741-795 | rework 44 px |
| PTF error | Save error in `--accent` | Foot | PTF:799 | keep accent (an alert), one sentence |
| PTF "Cancel", "Add to my record" | Close, save; ink-filled save, 32 px | Foot | PTF:802-807 | rework: save is the view's one accent primary, 44 px |

### Sharing

| Control | What it does | Where | File | Verdict |
|---|---|---|---|---|
| "Who can see this trip": Only me, My friends, Anyone | Visibility, optimistic; Anyone publishes to the gallery in one tap | Share panel top, 30 px | TSP:265-281 | rework: Anyone asks once, 44 px (V3 4) |
| Visibility sub-line and errors | Explanation | Same | TSP:281, 188-195 | keep |
| Co-planner rows, "Remove" or "Cancel" | Removes an editor at once | Share panel | TSP:113-131 | rework: undo or confirm |
| "Pick a friend" select, "Ask" | Invites a co-planner | Share panel, 36 px | TSP:134-152 | keep, 44 px |
| Scope cards "Where and when", "The whole trip" | Link scope | Share panel | TSP:288-305 | keep |
| Lifetime "7 days", "30 days", "No end date" | Expiry, 28 px | Share panel | TSP:307-323 | rework 44 px |
| "Make a link" | Creates and copies | Share panel, accent | TSP:327-330 | keep as the panel's primary |
| Link row "Works for 6 more days" | Status, all in mono | Share panel | TSP:339-346 | rework: number only in mono |
| "Copy" | Copies a link, 28 px | Link row | TSP:347-354 | keep, 44 px |
| Withdraw (trash) | Revokes at once, 25 px | Link row | TSP:355-363 | rework: confirm, 44 px |
| Shared view "Try again", "Price your own trip" | Retry, leave | STV | STV:77-131 | keep; "Price your own trip" is the view's one primary (accent) |

### Account hub and spokes

| Control | What it does | Where | File | Verdict |
|---|---|---|---|---|
| Header avatar "Account" | Opens the page | Desktop bar | `src/components/AppHeader.jsx`:20-39 | keep |
| Bottom nav "Account" | Opens the page | Phone | `src/components/BottomNav.jsx`:99-107 | keep |
| Header "Friends" | Opens Friends | Desktop bar, signed in | `src/components/AppHeader.jsx`:137-146 | keep (shell brief owns it) |
| Header "See pricing" or "Get a pass" chip | Opens the pass modal | Desktop bar | `src/components/AppHeader.jsx`:115-124 | keep (shell) |
| Close "x" | Hidden at every width | AP:800 | remove (dead) |
| "Account" overline, h1 on phone | Page title; no visible h1 on desktop | AP:801-805 | rework: one visible h1 per spoke |
| Back "Account" | Back to hub, phone, 30 px | AP:807 | rework 44 px |
| Rail rows Overview, Profile details, Friends, Admin | Spokes, about 36 px | Desktop rail | AP:751-754 | rework 44 px on coarse pointers (32 on fine is allowed) |
| Rail rows Send feedback, Common questions, Privacy policy, Terms of service, Imprint, Data sources | Help spokes and modals | Desktop rail | AP:755-760 | keep; rename Data sources to "Where the numbers come from" |
| Profile card | Door to profile | Hub top | AP:820-828 | keep; show the saved emoji |
| "Sign in" | Opens the sign-in modal | Signed-out card, accent | AP:833 | keep |
| "Your pass" card with balance | Tier and plans left; no loading state | Hub | AP:845-858 | rework: skeleton until known, plural "days" |
| "What a Trip Pass adds" ticks and price | Upsell, green ticks | Pass card | AP:861-879 | rework: ticks in `--ink-soft`, names the next tier honestly |
| "See passes" or "Extend my pass" | Opens the pass modal | Pass card, accent | AP:880-882 | keep as the hub's one primary |
| Invite "Share Carta" | Native share or copy, 40 px | Invite banner | AP:896-899 | rework 44 px, copy failure said |
| "Lifestyle" row with value in accent | Opens the Lifestyle panel | Hub | AP:907-917 | keep (the one Lifestyle door); value in `--ink-soft` |
| Language tiles (6) | Sets the language | Hub grid | AP:925-940 | keep; radio semantics, 6 px radius |
| Phone help menu rows (7) | Same as the rail | Hub bottom, phone | AP:945-965 | merge with the rail list (already one NAV list); add a Friends row on the phone |
| "Edit avatar" | Toggles the emoji picker, 28 px | Profile head | AP:978-988 | rework 44 px |
| Emoji options (12) | Pick the avatar, 40 px | Profile head | AP:989-1002 | rework 44 px |
| Name, Handle, Email inputs | Edit profile | Profile | AP:1009-1094 | keep; field marks not green |
| "Save changes" | Saves profile, accent | Profile | AP:1097 | keep as Profile's primary |
| Password fields with reveal (40 px), checklist, meter | Change password | Security | AP:1130-1195 | rework: meter "fair" not ochre; reveal 44 px |
| "Forgot current password?", Not now, Send the link | Reset arm and send | Security | AP:1140-1158 | keep; link 44 px |
| "Sign out of every other device" | Opt-in sweep | Security | AP:1196 | keep |
| "Update password" | Saves password, accent (second primary on the page) | Security | AP:1208 | rework: secondary, or split the spoke (V3 8) |
| "Email me a link" | Google-only set-password | Security | AP:1217 | keep |
| "Sign out" | Signs out | Session | AP:1236-1244 | keep |
| "Download my data", password confirm, Cancel, Download | GDPR export | Your data | AP:1250-1312 | keep; move above Session (V3 8) |
| "Delete my account", Keep my account, Delete forever | Deletion with re-auth, `--danger` | Danger zone | AP:1318-1363 | keep |
| Success banners and their 26 px "x" | Password updated, export done | Profile | AP:1110-1123, 1264-1277 | rework 44 px, `--ink` text with a status dot not green text |
| Friends "Copy" handle, "Invite a friend" | Copy, share link, 32 px | Friends top | FS:296-307 | rework 44 px |
| "Accept", Decline "x" | Requests; accent on every row | Waiting on you | FS:317-322 | rework: Accept secondary when more than one row |
| "Join", decline invite | Co-plan invites, accent | Asked to help plan | FS:342-357 | as above |
| "Cancel" request | Withdraws | Waiting on them | FS:371 | keep, 44 px |
| Info toggle "How friends work" | 24 px | Friends heading | FS:382-391 | rework: InfoDot (carta-design rule) |
| "@their_handle", "Look up", "Ask" | Add a friend | Friends | FS:403-429 | keep |
| "Remove" friend | Unfriends at once | Friend row | FS:438-444 | rework: confirm or undo |
| "Show a trip to your friends" | Goes to My trips | Friends shelf empty, 34 px | FS:459-466 | keep, 44 px |
| Friend trip row with "New" chip in ochre | Expands the trip | Friends shelf | FS:474-496 | rework: "New" in ink, not `--rate` |
| Milestone badges (5) and detail | Earned badges in ochre | Friends foot | FB:94-140 | keep (ochre as a measure of progress is borderline: needs a rule, part 7) |
| Guides strip "All guides" | Opens guides | Friends foot | GS:54 | keep |
| FAQ questions (14) | Accordion | FAQ | AP:1389-1399 | keep; faq13A says "a month" for a lifetime allowance |
| FAQ "Send feedback" | Goes to feedback | FAQ foot | AP:1408-1413 | keep |
| Feedback kind chips (3) | Kind, 36 px | Feedback | AP:1453-1466 | rework 44 px, radio keys |
| Message textarea | Text | Feedback | AP:1467 | keep |
| "Send by email" | Writes to the database, mail only as fallback | Feedback | AP:1480 | rework label "Send" and the note |
| "Send another" | Resets | Sent state | AP:1446 | keep |

### Sign in, passes

| Control | What it does | Where | File | Verdict |
|---|---|---|---|---|
| AM close "x" | Closes, 38 px | Modal | AM:99 | rework 44 px icon |
| AM tabs Sign in, Create account | Mode, 26 px | Modal | AM:106-123 | rework 44 px |
| "Continue with Google" | OAuth | Modal and gate | `src/auth/GoogleButton.jsx`:28-45 | keep |
| Name, Email, Password, Confirm | Inputs; no reveal, length-only check | Modal | AM:144-194 | rework: share the account's password field |
| "Forgot password?", "Back to sign in" | Mode links, 12 px text | Modal | AM:196-218 | rework 44 px box |
| AM submit | Sign in or create; ink-filled | Modal | AM:208 | rework: accent, the modal's one primary |
| Gate "Sign in", "Create an account", "Continue without an account", "Privacy policy" | Choice after sign-out | Gate | AG:31-47 | rework: one primary, links 44 px |
| Reset "Update password", "Cancel", "Continue" | Recovery | RP | RP:49-87 | rework as AM |
| PM close "×" | Closes, counts a dismissal, 30 px | Pass modal | PM:89 | rework 44 px |
| PM heading per reason, lead, current line | Names the moment | Pass modal | PM:20-99 | keep; plural days |
| PM waiver and "Read the terms of service" | Withdrawal notice | Above the cards | PM:112-118 | keep, link 44 px |
| Plan cards Free, Trip (recommended), Year | Equal weight, accent border and badge on Trip | Grid, one column under 720 px | PM:120-171 | keep the rule; rework the price face to `--mono`, Free as "€0.00" through Intl |
| Feature ticks | Limits; "Unlimited (fair use 60)" | Cards | PM:138-155 | rework: plain numbers ("60 day plans in 30 days") |
| "Get this pass" (Trip) | Checkout, accent | Trip card, 38 px | PM:156-163 | keep, 44 px |
| "Get this pass" (Year) | Checkout, outline | Year card | PM:156-163 | keep |
| "Your current plan" | Marks the current tier | Free card | PM:164-168 | keep |
| PM notes VAT, no subscription | Fine print | Foot | PM:177-183 | keep |

### Guides, upload, feedback sheet

| Control | What it does | Where | File | Verdict |
|---|---|---|---|---|
| Guides close "x" | Closes, 38 px, raw rgba | Panel head | GP:272 | rework 44 px, icon |
| "Everywhere", country chips | Filter, 30 px pills | Gallery | GP:294-313 | rework 44 px (32 on fine pointer) |
| "Try again", "Publish a trip" | Error retry, empty action | Gallery | GP:321-331 | keep |
| Guide card | Opens a guide; 14 px radius; months in mono | List | GP:44-76 | rework radius, show the guide's day cost (V3 12) |
| "All guides" (two copies) | Back to the list | Guide view | GP:123, 139 | merge into one back control, 44 px |
| "Copy link" | Copies the guide URL, 34 px, silent failure | Guide view | GP:152 | rework 44 px, say failure |
| Guide map, stops, story, highlights | Content | Guide view | GP:158-227 | keep |
| "Report this guide", form fields, "Send report", "Cancel" | DSA notice | Guide foot | RG:118-203 | keep; success tick not green |
| Upload "Add a photo or track" | Opens the dialog | Trail and stub pages | UF:290 | keep |
| Upload close "x", Photo or GPS track, file input, licence radios, credit, ticks, terms link, "Send for review", "Cancel", "Close" | Upload flow | Dialog | UF:168-314 | keep; signed-out state gains "Sign in"; success tick not `--status-success` as an icon on text |
| Feedback sheet "Report a problem", kind radios, message, email, "Send report" | Item feedback | Item pages | RPB:61-121, c42 | keep; correct the bad-email error |

### Admin (consistency only)

| Control | What it does | Where | File | Verdict |
|---|---|---|---|---|
| Lock "Back to the app", "Open admin tools" | Leave, open the tools (ink primary, 8 px radius) | Lock card | `admin/AdminLock.jsx`:55-65 | rework radius 6 |
| Tab bar (8) with count badges | Sections, 38 px, accent active | Sticky bar | ADM:127-153 | rework: active ink-fill, badge neutral |
| Close "x" | Leaves admin | Bar | ADM:150 | keep |
| Missing-tables banner in ochre | Warning | Every tab | `admin/MissingTables.jsx` | rework: amber tokens, not `--rate` |
| Owner cards (hard-coded English) | Metrics | Overview | `admin/*.jsx` | keep English (owner tool), sentence case |
| Sparkbars | Daily counts, no values shown | Several cards | `admin/Sparkbars.jsx` | rework: peak and last value under the bars |
| Users search, table, chips, Export CSV, Show more | Accounts | Users | `admin/UsersList.jsx` | keep; retry not `--danger` |
| User detail, pass control, support buttons, notes, danger zone | One account | Detail | `admin/UserDetail.jsx` | keep; confirm password-reset email |
| Content console and editor | Overrides | Content | `admin/ContentSection.jsx` | rework editor dialog; Revert confirms |
| Guides, Reports, Complaints, Feedback, Site, Audit | Queues and config | Tabs | `admin/*.jsx` | keep; kind chips not `--danger` or `--green`; flag switch not green; two primaries on Site |

### Visual settings

| Setting | Today | File | Verdict |
|---|---|---|---|
| Card shades over photos | Two gradients (`.fav-card-shade`, `.uptrip-shade`) | c17:1367, 1512 | remove: a solid `--paper` caption band under the photo |
| Card radius | 14 px on My trips, guide cards and the share panel; 18 px on the pass card | c17, c25:301, c12:757 | rework to 12 |
| Control radius | 8, 9, 10 px and 999 px pills in the account shell (`.account-shell` forces 10) | c24:5919-5933 | rework to 6 |
| Raw rgba | About 25 in c17, plus scrims in c16 and c12 | c17, c16:115, c12:748 | rework to tokens; scrim `--ink` at 28 percent |
| Count pills | Accent-filled | c17:36 | rework to ink outline |
| Tab selected state | Ink-filled (measured `rgb(43, 52, 70)`), plus an accent bar above every phone tile's icon; two harnesses still assert the old accent | c25:186, `scripts/verify_saved.mjs`:108 | keep ink-fill, remove the accent bars (rule 6) |
| Section labels | 10 px with .14em tracking | c21:683, c24:5876 | rework to 12 px `--ui` 600, no tracking |
| Error colour | `--accent` on `--accent-bg` | c16:326-333 | keep (alerts are accent's job), one sentence each |
| Success colour | `--green` text and ticks | c16:347, c21:1034 | rework: ink text with a `--status-success` dot |
| Password meter | weak `--danger`, fair `--rate`, strong `--green` | c21:840-885 | rework: needs a rule (part 7) |
| Motion | About ten transitions without a reduced-motion branch | c17, c25:181, c16:392 | rework (V5 3) |

## 4. Critique and technical audit

Method: dual-agent. Assessment A (design review from the screenshots and the source) and Assessment B (the detector and the design lint) ran as two isolated sub-agents; A never saw B's output. The browser overlay was not injected: one shared dev server and a laptop short on RAM, so B ran the CLI scan only.

### Design health score (Nielsen, 0 to 4)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | A returning traveller cannot see what a trip costs or what changed; no saved card carries a figure (STP:519-576) |
| 2 | Match with the real world | 3 | Plain mostly; "Carta bot plans" and "fair use 60" are internal words (V1-passes-1280) |
| 3 | User control and freedom | 2 | Withdrawing a live share link is one tap on a 25 px icon, no confirm, no undo (TSP:355-363) |
| 4 | Consistency and standards | 2 | Three close glyphs; "My trips" and "Saved trips" for one page; pass price mono on the hub, Fraunces in the modal; accent submits in the account, ink submits in the sign-in modal |
| 5 | Error prevention | 3 | Trip removal, export and deletion are guarded; link revoke, un-friend and co-planner removal are not |
| 6 | Recognition rather than recall | 3 | Tabs carry counts; every card action hides behind a 32 px "..." on the photo |
| 7 | Flexibility and efficiency | 2 | No sort, filter or search on My trips; radio groups and the language listbox take no arrow keys |
| 8 | Aesthetic and minimalist design | 2 | The hub's first two screens are profile, upsell and invite; the moderation card outweighs its trip |
| 9 | Error recovery | 2 | `.auth-error` has no role=alert (AM:206, TSP:332); six raw `err.message` paths; checkout errors render below the fold on a phone |
| 10 | Help and documentation | 3 | FAQ one tap away; no InfoDot on "fair use" or "Carta bot"; faq13A states the free allowance wrongly |
| | Total | 24/40 | Acceptable |

### Design specificity

Assessment A: half authored. The type, the palette and the voice are Carta's (Fraunces on trip names, mono dates, honest moderation copy, a friends ledger that refuses to rank). The structure is generic: photo-hero cards with gradient scrims, a stat-counter hero on Visited, an account hub that leads with an upsell and an invite banner. The two things Carta is, the receipt and the measured figure, are absent from My trips.

Assessment B: the detector scanned 48 files (the 21 named surface files and all 27 in `src/components/admin/`) and found one item, `broken-image` at STP:325, a false positive (the text `<img>` inside a JSDoc comment; the real image at STP:337-348 has src, srcSet, alt, size and lazy loading). Net 0 true findings. The design lint reports 213 violations, all baselined, 0 new; 10 baselined entries sit in this surface's CSS (17-saved-trips: 5 shadow literals, 2 gradients; 21-chat-passes: 1 shadow literal; 22-account-admin: 2 `outline: none`).

Where they agree and differ: the detector's silence is the expected result for drift that lives in CSS values (raw rgba, radius, the accent on a count) and in structure (no figure on a card), which a markup scan does not read; the lint catches the two gradients A named. Nothing the detector found contradicts A.

### Cognitive load

Four of eight checks fail (high): single focus (commerce competes with settings on the hub), visual hierarchy (the accent is spent on the phone pass chip, "See passes", the invite tint, count badges and section icons, while My trips' real next step, "Plan its days", is a grey footer row), chunking and minimal choices. Decision points over four options: the desktop account rail (9 rows, all filled pills), the phone help menu (6 to 7 rows), the language grid (6, acceptable as a picker), and the share panel (3 visibility + 2 scope + 3 lifetime = 8 options plus the co-planner block, mixing "who sees it in Carta" with "a link anyone can open").

### Priority issues

1. [P1] Saved trips carry no figure and no "what changed". PRODUCT.md names the returning traveller who wants to see what changed, and the numbers are Carta's only asset; the journey card has a title, cities and dates over a photo and nothing else. Fix: V3 3 now (the current day cost at the traveller's lifestyle), the delta after T379-c. Command: `shape`, then `layout`.
2. [P1] Unguarded one-tap removals on small targets: withdraw a link (25 px), remove a co-planner, un-friend, remove a crew name (18 px), publish as "Anyone". Fix: V3 4 and 5 (inline confirm or undo, 44 px). Command: `harden`.
3. [P1] The account hub leads with commerce and the accent is spent everywhere. Fix: V3 7 (settings before the pass card), rule 5 (neutral counts), the phone pass chip to the secondary-chrome rule DESIGN.md already holds (shell brief), section icons `--ink-soft`. Command: `quieter`.
4. [P1] A wrong figure on the pass modal ("Costs the same as 2 Trip Passes", €14.99 against €13.98) and a wrong allowance in the FAQ ("plans a month" for a lifetime two). Honest numbers are a locked rule, and both are live today (register row T379-e). Fix: V3 10. Command: `clarify`.
5. [P2] Chrome drift: three close glyphs, a 30 px pass close, off-token scrims (`rgba(26,26,26,.36)` and `.42` with blur, `rgba(15,23,42,.45)` in admin), the pass price in Fraunces, gradients on cards, 14 and 18 px card radii, a forced 10 px control radius in the account shell. Fix: V4 1, V5 2. Command: `polish` and `typeset`.

### Persona red flags

Casey (phone, one thumb): the card "..." is 32 px over the photo corner, crew "+" 28 px, link revoke about 25 px; on the pass modal the recommended buy button is below the first screen; the next trip and its moderation notice fill the first screen, so only one trip is visible.

Sam (screen reader, keyboard): auth and share errors are not announced; the password placeholder of eight dots reads as a filled field; the radio groups and the language listbox take no arrow keys; two buttons both named "Get this pass"; close buttons announce a letter "x"; the full record map and the shared trip view trap no focus and the shared view ignores Escape.

Jordan (first-timer): "Carta bot plans", "fair use 60" and "Live web search (40)" are unexplained; the share panel asks visibility, scope and lifetime before saying what a link does; "Saved trips" and "My trips" name the same place.

### Minor observations

"Visited cities 3" is captioned "Cities visited". The card photo zoom runs 0.35 s (c17:1500), over the 300 ms cap, and several transitions animate colour and background. The share panel's "Make a link" and "Copy" use 999 px radii, which carta-design keeps for status chips and round icon buttons.

### Questions to consider

Questions skipped: unattended run; the owner told every session to proceed (2026-10-07). The two questions Assessment A raised are recorded for T380 instead: should My trips open on the receipt of the next trip, with what moved since it was saved, rather than on a postcard photo; and does the account hub need a pass card at all for a free traveller, or would the plans-left count beside the Day planner's own button sell the pass more honestly at the moment it matters.

### Technical audit (existing harnesses)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 2 | About 40 controls under 44 px (part 3); errors without role=alert; two dialogs without a focus trap; unlabelled crew and highlight inputs; two h1 per view |
| 2 | Performance | 3 | Images lazy with srcSet (STP:337-348); the record map and friend maps are lazy; not measured further, no metric on this surface is promised |
| 3 | Responsive | 3 | No sideways scroll at 380 or 1280 on any walked view; targets and the pass modal's fold order are the gaps |
| 4 | Theming | 2 | Two gradients, about 25 raw rgba in c17, off-token scrims, radius drift, accent on counts and on the avatar; 10 baselined lint entries |
| 5 | Implementation integrity | 3 | Detector 0 true findings; one token system used throughout, with drift in values rather than structure |
| | Total | 13/20 | Acceptable |

Harnesses, run as a "before" reading only (slow shared server, not a product verdict): `verify_paywall` (static, no browser) passed: 10 gates, 18 keys in 6 locales, 3 events agreeing with migration 022. `verify_saved` (run with `CARTA_PORT=5199` from the scratch folder, so its screenshots stayed outside both repos) failed on exactly one line, "the selected tab is rgb(43, 52, 70), not the accent", with every other check passing (4 printed ok lines, ledger and empty-shelf checks as expected). `verify_trip_share` does not read `CARTA_PORT`, tried to start its own `vite preview` and stopped at "vite preview never came up" (no built dist, by design in V1). Two harnesses encode a value that no longer exists: `scripts/verify_saved.mjs`:108 and `scripts/verify_account_panel.mjs`:248 assert the pre-T363 accent `rgb(224, 90, 71)` on the selected tab, while the selected tab is ink-filled `rgb(43, 52, 70)` (`--ink-fill`), which is what carta-design asks of an active toggle; both fail that line today (register row T379-f). The other five (`verify_account_panel`, `verify_friends`, `verify_past_trip`, `verify_guides`, `verify_admin_panel`) need either a built preview or ten minutes each on the shared server and were not run in V1; V3 to V5 run all eight as their done checks.

## 5. The traveller's job here

The traveller in `docs/design-v6/TRIP-PLANNING-RESEARCH.md` comes to this surface in two moods. Mid-plan, they have found a few places and fear losing them: Carnegie Mellon's tab study says people keep tabs open because "as soon as something went out of sight, it was gone", and Expedia's path-to-purchase study counts 141 pages over 45 days, 25 on the day of booking. Returning, they are PRODUCT.md's second secondary audience: "returning users with a saved trip who want to see what changed since last time". Around those two moods sit the account chores (sign in once, set the defaults, buy a pass when a gate asks), sharing with the people they travel with, and the record after the trip.

What they need first, on opening My trips: the next trip, with its dates, the countdown and what it costs for their inputs now. Today a first visit opens Planned on that card (the default tab, STP:716), a returning visit reopens whichever tab was last used (part 2), and the card carries no figure at all: a saved place stores destination, city, dates and choices and no price (`src/auth/tripStorage.js`:13-24), and neither the favourite card nor the journey card prints one. The only money on the whole surface is a past trip's self-reported spend (TMV:144-166). For a product whose PRODUCT.md says the central act is "comparing dense pricing matrices", My trips is the one screen with no numbers. Two unused strings promise them ("Single places saved from the map with their dates and prices", "flights and stays priced", `src/i18n/en.js`:1176, 1207).

Second: the shortlist, compared. The research's second order of need is "is it good in my month"; the shortlist is where the undecided 59% (TTG Asia on Expedia) park the candidates. Each row should carry the day cost at the traveller's lifestyle, the same figure Explore shows, so the shortlist is a comparison and not a bookmark list.

Third: hand the plan to the people coming along and keep the record. The research asks for "a read-only share link and co-planners with edit rights", which exist, and "after the trip, keep the record (route, days, what it cost) without public feeds or follower counts", which also exists. Both are buried: Share is the second item of a 32 px "..." menu and appears only when signed in; the record's form opens six folds of optional detail with 20 to 28 px controls.

What is missing. A price on every saved item, and "what changed since you saved: price moves in measured figures, with the old and new figure and the capture date" (research, My trips and sharing): nothing stores the figure at save time, so the delta needs a data change before it can be designed (register row T379-c). A note per saved item: none exists. The account does not store the defaults every screen prices from: Lifestyle is a link-out and Language is a picker, but the home airport, group size and stay tier live only in the URL and local storage (`src/lib/urlState.js`), and the language is not part of the synced settings (`src/hooks/useAccountSync.js`:108-112), so "the same saved state on phone and laptop" (research, Account) holds for trips and not for settings (register row T379-d). There is no currency setting (everything is EUR, `src/lib/pricing.js`:122), which is honest but unsaid. There is no data freshness page; the closest is "Data sources", a credits list whose name clashes with "Your data".

What sits in the wrong place. Friends' trips sit in the middle of Planned (STP:1575) and "Alongside your friends" in Visited (STP:592), while the Friends spoke has its own shelf of the same trips (FS:448): the traveller's own plans share a page with other people's. The Profile spoke holds five jobs (profile, security, session, data export, deletion) and two accent primaries. On a phone, Friends has no row on the Account hub (AP:945-965); its only door is a 38 px icon-only button in the top bar (`.header-friends-btn`, c24:4643), with the icon in `--accent` (c24:4979). The same page is "My trips" on the phone and "Saved trips" on desktop.

What sends them elsewhere. Signing in from My trips closes My trips first (`src/App.jsx`:1281), so the traveller lands back on the map after the modal. A favourite card opens the trip on the map rather than the destination page, where the receipt is. Editing a plan opens the Trip planner, which is right, but "Edit" and tapping the card do the same thing. The pass modal's figures are right but the feature lines say "Unlimited day plans (fair use 60)", which the traveller has to decode, and the FAQ tells a free traveller they get their plans "a month" when the free allowance is two for the life of the account (`src/i18n/en.js`:643 against `src/lib/pricing.js`:73-82).

## 6. The plan (impeccable shape)

Shape, Phase 3, written without the interview: the run is unattended and the owner told every session to proceed (owner instruction 2026-10-07). Assumptions are marked where they matter. Brief in shape's terms:

1. Job and audience: the hiker on a budget, phone first, mid-plan or returning; Operate mode.
2. Outcome and proof: on opening My trips the next trip and its current cost are on the first screen; every saved item carries a figure; sharing is one visible action.
3. Selected direction: refinement of the incumbent (impeccable's "Refinement preserves"): the paper, ink and one terracotta accent, Fraunces only for the page title and destination names, mono for every figure. The structural thesis is "My trips is a ledger of the traveller's plans": priced rows and cards, in date order, with one primary per tab.
4. Scope: My trips, sharing, the shared view, the record, Account and its spokes, sign-in, passes, guides and upload; the admin page for consistency only. Untouched: the receipt, Lifestyle panel, planners and every other surface's files.
5. States: empty, signed out, loading, error, one to many trips (the mock holds four plans and three places; a real traveller may hold dozens: the list must stay a list, not a grid of heroes).
6. Interaction: no new modal; share stays inline under the card; confirmations are inline arm-then-confirm; undo for low-risk removals (needs a rule, part 7).
7. Constraints: six languages for every new string; 44 px targets; reduced motion; no data or schema change inside a design wave (the "since you saved" delta is a register row).

Every item below names the files, the impeccable command that guides it and the check that says it is done. New CSS goes into `src/styles/69-v6-account.css` (created by T380), never into the shared files, unless OWNERSHIP.md says otherwise.

### V3: structure, information and flow

1. One name and a visible title. "My trips" on both widths (`nav.saved` becomes the same words in six catalogues), a visible h1 in `--display` at the head of the page, the dead close crosses removed (STP:1393, AP:800). Files: STP, `src/i18n/*.js`, `src/components/AppHeader.jsx` (string only; the shell brief owns the bar, coordinate through OWNERSHIP.md). Command: `clarify`. Done: both widths show "My trips" and one visible h1; verify_saved finds the page by either label until its selector is updated with a comment.
2. One primary per tab, and the tab order that matches the job. Planned stays first and opens on the next trip, and a returning visit lands on Planned whenever an upcoming trip exists instead of the last tab used (today it reopens Visited, part 2); the day-plans empty CTA becomes a secondary; count pills become neutral; "Browse the map" goes to one place (Destinations). Files: STP, `src/styles/69-v6-account.css`. Command: `distill`. Done: the walk script counts at most one accent-filled control in the viewport on every tab, signed in and out (today two on Planned when empty, see part 2).
3. A figure on every saved item. Shortlist rows, favourite cards and journey cards show the day cost at the traveller's lifestyle from `src/lib/costIndex.js`, the figure Explore and the destination page already show, in `--mono` with its pedigree word (measured or est.). Journey cards add the trip's ground total for its nights where the planner has priced it. No delta yet (T379-c). Files: STP, `src/lib/costIndex.js` (read only, imported), `src/styles/69-v6-account.css`, six catalogues for the labels. Command: `shape` then `layout`. Done: every card in `?savedmock` shows a figure or the honest placeholder "Not priced yet"; the figures match Explore's for the same place and lifestyle.
4. Share as a visible action, and the share panel in the traveller's order. A secondary "Share" button on every planned and visited card for a signed-in traveller (signed out it says "Sign in to share"); the panel reads top to bottom: make a link (scope, lifetime, Make a link), the links that work, then who can edit, then who can see it in the gallery; "Anyone" asks once ("Show this trip in the public guides?"); withdrawing a link asks once. Files: STP, TSP, `src/auth/coplanners.js` (read only), `src/styles/69-v6-account.css`, six catalogues. Command: `clarify` and `harden`. Done: verify_trip_share passes; a scripted walk reaches "Make a link" in two taps from My trips.
5. Destruction looks like destruction. Every confirm button that erases is `--danger`; low-risk removals (un-star, crew name, co-planner withdraw) get an undo line instead of nothing, if T380 accepts the rule (part 7, 1). Files: STP, TSP, FS, `src/styles/69-v6-account.css`. Command: `harden`. Done: no accent-filled control erases anything; each removal can be undone or was confirmed.
6. The past-trip form in two steps. Where and when first (places, nights, dates, name), then "Add details" opens the six folds; the save is the view's accent primary; "Add a past trip" has one entry point at a time. Files: PTF, STP, `src/styles/69-v6-account.css`. Command: `distill` and `onboard`. Done: verify_past_trip passes; a trip can be saved after the first step.
7. The Account hub in the traveller's order. Profile or sign-in, then "Your trip settings" (Lifestyle row, plus read-only rows for the home airport and group size with a link to where each is changed), then Language, then Your pass (with a skeleton until known), then Help; Friends gets a hub row on the phone. Files: AP, `src/styles/69-v6-account.css`, six catalogues. Command: `layout` and `clarify`. Done: verify_account_panel passes (selectors updated with comments where the order moved); the phone reaches Friends from the hub.
8. Split the Profile spoke. Profile (name, handle, email, avatar), Sign-in and security (password, sessions, sign out), Your data (download, delete); one primary per spoke; rename "Data sources" to "Where the numbers come from". Files: AP, `src/styles/69-v6-account.css`, six catalogues. Command: `distill`. Done: no spoke has two accent fills; verify_account_panel and the data export harness pass.
9. Friends holds everything social. Friends' trips leave Planned and "Alongside your friends" leaves Visited; both live in the Friends spoke, with one line on Planned ("2 friends shared trips with you", linking there) when there are any. Files: STP, FS, `src/styles/69-v6-account.css`. Command: `distill`. Done: verify_friends passes; Planned shows only the traveller's own plans.
10. Passes in plain numbers. Feature lines state the allowance as a number and a period ("60 Carta bot day plans in 30 days"), the price in `--mono` through Intl (Free as "€0.00"), the plural for days, faq13A corrected to "for the life of the account", and the Year Pass line stated truly (today "Costs the same as 2 Trip Passes" for €14.99 against €13.98; either "€1.01 more than 2 Trip Passes" or "Costs less than 3 Trip Passes", a copy call the build wave makes from `src/lib/pricing.js`, not a new figure). On the hub, the pass card shrinks to one status line with "See passes" and moves below the settings (V3 7). Files: PM, AP, `src/lib/pricing.js` (`yearPassTripsEquivalent`, read or adjusted), `src/i18n/*.js`. Command: `clarify`. Done: verify_paywall passes; no "Unlimited" in the pass strings.
11. One sign-in door. The sign-in modal, the reset screen and the account's password fields share one password field (reveal, checklist); the submit is the modal's accent primary; signing in from My trips returns to My trips. Files: AM, RP, AP, AG, `src/App.jsx` (the one line that closes My trips before sign-in; the shell brief owns App.jsx, coordinate). Command: `harden`. Done: verify_account_panel passes; after sign-in from My trips, My trips is open.
12. Guides that say what they are. One back control; a network failure says so instead of "not published any more"; the upload dialog's signed-out state offers "Sign in". Files: GP, UF, `src/community/guides.js` (read only), six catalogues. Command: `harden`. Done: verify_guides passes, including its gone and error paths.
13. Feedback copy that matches the code. "Send" instead of "Send by email", the note rewritten; the item feedback sheet shows its own message for a bad email. Files: AP, RPB, six catalogues. Command: `clarify`. Done: verify_account_panel's feedback step passes with the new label.

### V4: visual and dynamic (within the palette)

1. Photographs without shades. The favourite and journey cards keep their photograph and lose the two gradients; the caption sits in a solid `--paper` band under the photo, as the suitability strip does (needs a rule, part 7, 4). Files: STP, `src/styles/69-v6-account.css` (overrides `.fav-card-shade`, `.uptrip-shade`). Command: `quieter` then `layout`. Done: design lint gradient count for c17 goes from 2 to 0 (baselined today); impeccable detect clean.
2. The next trip as the page's focal point. On Planned, the first upcoming trip is one wider card (photo, title in `--display`, countdown number in `--mono`, dates, the figure from V3 3, Share and Plan its days); the rest are rows. Files: STP, `src/styles/69-v6-account.css`. Command: `layout` and `bolder`. Done: at 380 px the next trip and its figure fit the first screen.
3. Shared-element transition from a card to the planner, reusing the transitions built in an earlier wave (keep what they built); skeletons that match the card shapes. Files: STP, the existing transition helper. Command: `animate`. Done: reduced-motion jumps; the keyboard harness still reports 20 of 20.
4. The record's receipt with a cost bar. The memory view's "What it cost" follows the receipt rule and carries the cost bar (carta-design: one stacked bar, ink ramp, above the lines). Files: TMV, `src/styles/69-v6-account.css`. Command: `visualize`. Done: the bar's segments sum to the total; no accent in the bar.
5. Photographs in the memory as a track. The memory's photographs run as a horizontal track with Previous and Next and a mono position, on the day-track mechanics (needs a rule, part 7, 9). Files: TMV. Command: `animate`. Done: arrow keys move one photo; every photo reachable without a swipe.
6. The pass modal as a comparison. The three plan cards keep equal weight and the recommended border; under them, one row per allowance across the three plans (day plans, live searches, period, price), the way NN/g describes comparison tables for five or fewer options (needs a rule, part 7, 8). Files: PM, `src/styles/69-v6-account.css` (the pass half of c21 is overridden there). Command: `layout`. Done: at 380 px two plans side by side scroll sideways inside the table only; no page scroll.
7. Touch feedback and micro-interactions on every card, share copy ("Copied" in place for 2 s), the countdown chip changing to "Underway now" on the day, the star filling on save with a 150 ms scale under reduced-motion guard. Files: STP, TSP, `src/styles/69-v6-account.css`. Command: `delight` within carta-design's motion rules. Done: every transition under 300 ms with a reduced-motion branch.
8. The record map: countries filled in the ink ramp, the selected trip's pins in `--accent` and the rest in ink, numbered by trip date, not coloured per trip. Files: STP, `src/map/tokenColors.js` (read only). Command: `colorize` within the palette. Done: greyscale screenshot still separates selected from the rest.
9. Account hub tiles: the pass card's balance as a mono figure with a word ("2 of 2 Carta bot plans left") and a plain 8 px bar in the ink ramp. Files: AP. Command: `visualize`. Done: no green tick in the pass card.

### V5: harden, adapt and polish

1. Touch targets. Every control on the surface reaches 44 px on a coarse pointer (32 px allowed on a fine pointer). The inventory lists about 40 controls under 44 today (steppers 24 px, crew remove 18 px, bookmark 28 px, AM tabs 26 px, rail rows 36 px). Files: c16, c17, c21, c22, c40, c42 through `src/styles/69-v6-account.css`. Command: `adapt`. Done: the walk script's under-44 count on a coarse-pointer 380 px context is 0.
2. Tokens. Card radius 12, control radius 6 (the account shell's forced 10 px goes), the about 25 raw rgba values in c17 become tokens, both scrims become `--ink` at 28 percent, section labels 12 px without tracking, success text in ink with a status dot. Files: c12 (pass card), c16, c17, c21, c22, c24 (account-shell overrides), c25 (guide cards) through the v6 file. Command: `polish`. Done: design lint 0 new; baselined shadow and gradient entries in c17 and c21 drop.
3. Motion. A reduced-motion branch on every transition the inventory found without one (`.saved-card`, `.saved-card-more`, `.saved-card-footer`, `.saved-empty-cta`, `.fav-card-mark`, `.uptrip-card`, the crew controls, `.saved-map-expand`, `.savedmap-full-close`, `.saved-cat`, the email-confirmed toast). Command: `animate` (audit side). Done: verify_quality_floor passes for the surface.
4. Focus and dialogs. The full record map gets `aria-modal` and `useFocusTrap`; the shared trip view closes on Escape; card menus take arrow keys and move focus in; confirm rows move focus to their first button and Escape keeps; the admin content editor gets `aria-modal`, its own Escape and a trap. Files: STP, STV, `admin/ContentSection.jsx`. Command: `harden`. Done: keyboard harness 20 of 20; a scripted tab walk reaches every control.
5. Language. Hard-coded "to" (STV:102, 117; FTP:114), `en-GB` dates (STP:930), "day(s)", raw `err.message` in six places (AP:472, 550, 627, 667; AM:51, 79; GB:38), and the two-sentence errors (`account.errGeneric`, `auth.errGeneric`, `friends.unavailable`, `pass.errGeneric`, `pass.errNetwork`, `moderation.errGeneric`) go through i18n keys in one sentence. Files: STV, FTP, STP, AP, AM, `src/auth/GoogleButton.jsx`, six catalogues. Command: `clarify` and `harden`. Done: a German walk shows no English word on the surface.
6. Widths. 360, 380 and 390 px with no sideways scroll on every view; the pass modal's table scrolls inside itself. Command: `adapt`. Done: the walk script's hscroll is 0 at all three.
7. Harness updates. `scripts/verify_saved.mjs`:108 and `scripts/verify_account_panel.mjs`:248 assert the pre-T363 accent `rgb(224, 90, 71)` on a selected tab, which is already ink-filled; both assert `--ink-fill` (part 7, 6), with a comment saying why. This can go first in V3 so the done checks run green. Command: `audit`. Done: both pass.
8. Admin consistency. Active tab ink-fill, count badges neutral, ochre warning banner to the amber tokens, feedback kind chips off `--danger` and `--green`, flag switch off green, Site tab one primary, Revert and password-reset email confirm, Sparkbars print the peak and the last value. Files: ADM, `admin/AdminLock.jsx`, `admin/MissingTables.jsx`, `admin/FeedbackInbox.jsx`, `admin/ConfigManager.jsx`, `admin/ContentSection.jsx`, `admin/UserDetail.jsx`, `admin/Sparkbars.jsx`, `admin/UsersList.jsx`, the admin half of c22. Command: `polish`. Done: verify_admin_panel passes twice back to back.
9. Detector and seven questions. `impeccable detect --json` over every changed file, 0 true findings; carta-design's seven questions answered in the V5 report. Command: `polish`.

### Target-state controls

Every button and control on the surface after V5. Kind: P primary (accent fill, at most one in view), S secondary (`--rule` border), D destructive (`--danger`), T toggle or tab (`--ink-fill` when on), L link, I input. "Gone" means removed or merged. Size is 44 px on a coarse pointer for all of them.

| Where | Control | Kind | Target | Wave |
|---|---|---|---|---|
| Nav | My trips (phone and desktop, one name) | T | "My trips" on both | V3 1 |
| My trips | Close "x" | gone | the nav closes the page | V3 1 |
| My trips | Planned, Favorites, Visited tabs with counts | T | ink-fill when on, neutral count chips | V3 2, rule 6 |
| My trips | Install hint "Add to home screen", dismiss | S, icon | unchanged, icon glyph | V5 2 |
| Planned | Next trip card | card | larger focal card with figure, countdown, Share, Plan its days | V4 2, rule 13 |
| Planned | Journey card (tap opens planner) | card | caption band, figure | V3 3, V4 1 |
| Planned | Share (on card) | S | new visible button | V3 4 |
| Planned | More "..." | icon | Open the Trip planner, Share, Remove; arrow keys | V5 4 |
| Planned | Menu Edit | gone | the card tap does it | V3 2 |
| Planned | Menu Remove, Keep, Remove | D | inline confirm, `--danger` | V3 5, rule 2 |
| Planned | Plan its days in the Day planner | S | unchanged, 44 px | V5 1 |
| Planned | Plan your first trip | P | the empty tab's one primary | V3 2 |
| Planned | Open the Day planner (empty) | S | demoted from accent | V3 2 |
| Planned | Sign in (signed out) | P | one primary | V3 2 |
| Planned | Friends' trips shelf | gone | one line linking to Friends | V3 9 |
| Planned | Moderation Read the statement, Contest this decision, Send complaint, Cancel | S, P | unchanged | none |
| Favorites | Shortlist row (opens the page) | row | adds the day cost | V3 3 |
| Favorites | Star on a row | icon | removes at once with an undo line | V3 5, rule 1 |
| Favorites | Fav card | card | figure, caption band, opens the destination page | V3 3, V4 1 |
| Favorites | Bookmark, Keep, Remove | icon, D | 44 px, `--danger` confirm | V3 5 |
| Favorites | Browse the map (two) | P | one, to Destinations | V3 2 |
| Favorites | Sign in, Try again | P, S | unchanged | none |
| Visited | Record map, pins | map | ink ramp, accent selected | V4 8 |
| Visited | See the map bigger, Close the map | icon, S | 44 px, focus trap and return | V5 1, 4 |
| Visited | Add a past trip | S, or P when the list is empty | one entry at a time | V3 6 |
| Visited | Visited card (toggles memory) | card | unchanged | none |
| Visited | Memory footer "See this trip" | gone | summary moves into the caption | V3 6 |
| Visited | Menu Edit this trip, Open the Trip planner, Share, Remove | menu | unchanged, Remove `--danger` | V3 5 |
| Visited | Crew "+", friend chips, name input, Add, remove | icon, S, I | 44 px, labelled input, undo on remove | V3 5, V5 1 |
| Visited | Alongside your friends | gone | moves to Friends | V3 9 |
| Memory | Edit this trip (in the memory) | gone | the menu has it | V3 6 |
| Memory | Photo track Previous, Next | S | new, if rule 9 | V4 5 |
| Past trip form | City search, results, Look up anywhere | I, row, S | unchanged, 44 px | V5 1 |
| Past trip form | Place nights steppers, place remove | icon | 44 px | V5 1 |
| Past trip form | First day, Last day, trip name | I | step one | V3 6 |
| Past trip form | Add details (opens the folds) | S | new | V3 6 |
| Past trip form | Adults, Children, companions, friend chips, mode toggles, stay, currency, six amounts, rating 1 to 10, story, highlights, photos | I, T | step two, 44 px, labelled | V3 6, V5 1 |
| Past trip form | Cancel, Add to my record | S, P | save is the accent primary | V3 6 |
| Share panel | Scope cards, lifetime chips | T | unchanged, 44 px | V5 1 |
| Share panel | Make a link | P | first in the panel | V3 4 |
| Share panel | Copy, Withdraw | S, D | withdraw asks once | V3 4, rule 2 |
| Share panel | Pick a friend, Ask, Remove or Cancel co-planner | I, S | undo on remove | V3 4, rule 1 |
| Share panel | Only me, My friends, Anyone | T | Anyone asks once | V3 4, rule 2 |
| Shared view | Try again, Price your own trip | S, P | Escape leaves; "to" translated | V5 4, 5 |
| Account | Header avatar, bottom nav Account | T | unchanged (shell) | none |
| Account | Close "x" | gone | dead today | V3 1 |
| Account | Back to Account (phone) | S | 44 px | V5 1 |
| Account | Rail and hub rows (Overview, Profile, Sign-in and security, Your data, Friends, Admin, Send feedback, Common questions, Privacy policy, Terms of service, Imprint, Where the numbers come from) | row | one list, Friends on the phone, Profile split | V3 7, 8 |
| Account | Profile card, Sign in | row, P | unchanged | none |
| Account | Lifestyle row | row | in "Your trip settings", value in `--ink-soft` | V3 7 |
| Account | Home airport, group size rows | row, L | new, read-only with a link to where each is changed | V3 7 |
| Account | Language tiles | T | radio semantics, 6 px | V5 2 |
| Account | See passes or Extend my pass | P | the hub's one primary | none |
| Account | Share Carta | S | 44 px | V5 1 |
| Profile | Edit avatar, emoji options | S, T | 44 px | V5 1 |
| Profile | Name, Handle, Email, Save changes | I, P | one primary on the spoke | V3 8 |
| Security | Password fields, reveal, Forgot current password, Not now, Send the link, Sign out of every other device, Update password, Email me a link, Sign out | I, S, P | own spoke, Update password the one primary | V3 8 |
| Your data | Download my data, Cancel, Download | S | own spoke with deletion | V3 8 |
| Your data | Delete my account, Keep my account, Delete forever | D | unchanged | none |
| Friends | Copy handle, Invite a friend | S, P | Invite is the primary only when the list is empty | V5 1 |
| Friends | Accept, Decline, Join, decline invite, Cancel request, Remove friend | S, D | no accent per row; Remove asks once | V3 9, rule 2 |
| Friends | How friends work | InfoDot | replaces the 24 px toggle | V5 4 |
| Friends | Look up, Ask | S | unchanged | none |
| Friends | Friend trip rows, Show a trip to your friends | row, S | "New" in ink | rule 11 |
| Friends | Milestone badges | T | ink, not ochre | rule 11 |
| Friends | All guides | S | unchanged | none |
| FAQ | 14 questions, Send feedback | T, S | unchanged; faq13A fixed | V3 10 |
| Feedback | Kind chips, message, Send, Send another | T, I, P, S | "Send" | V3 13 |
| Sign in | Close, tabs, Continue with Google, fields, Forgot password, Back to sign in, submit | icon, T, S, I, L, P | submit accent, shared password field, 44 px | V3 11 |
| Gate | Sign in, Create an account, Continue without an account, Privacy policy | P, S, L | one primary, links 44 px | V3 11 |
| Reset | Update password, Cancel, Continue | P, L | shared password field | V3 11 |
| Pass modal | Close | icon | 44 px | V5 1 |
| Pass modal | Read the terms of service | L | 44 px | V5 1 |
| Pass modal | Get this pass (Trip), Get this pass (Year), Your current plan | P, S, label | price in mono, plain numbers | V3 10 |
| Pass modal | Comparison table | table | new, if rule 8 | V4 6 |
| Guides | Close, Everywhere, country chips | icon, T | 44 px (32 on fine pointer) | V5 1 |
| Guides | Guide card, back (one), Copy link | card, S | one back control | V3 12 |
| Guides | Report this guide, form, Send report, Cancel | S, I, P | unchanged | none |
| Guides | Try again, Publish a trip | S, P | unchanged | none |
| Upload | Add a photo or track, close, kind, file, licence, credit, ticks, terms, Send for review, Cancel, Close | S, I, P | signed-out state gains Sign in | V3 12 |
| Feedback sheet | Report a problem, kind, message, email, Send report | L, I, P | bad-email message | V3 13 |
| Admin | Lock buttons, tabs, badges, close, all section controls | various | consistency list in V5 8 | V5 8 |

### Every file the build waves touch

Owned by this surface (OWNERSHIP.md, written in V2, is the authority from then on):

- Components: `src/auth/SavedTripsPanel.jsx`, `src/auth/TripSharePanel.jsx`, `src/auth/SharedTripView.jsx`, `src/auth/FriendTripPanel.jsx`, `src/auth/PastTripForm.jsx`, `src/auth/TripMemoryView.jsx`, `src/auth/InstallHint.jsx`, `src/auth/AccountPanel.jsx`, `src/auth/FriendsSpoke.jsx`, `src/auth/FriendBadges.jsx`, `src/auth/AuthModal.jsx`, `src/auth/AuthGate.jsx`, `src/auth/GoogleButton.jsx`, `src/auth/ResetPasswordScreen.jsx`, `src/auth/ModerationNotice.jsx`, `src/components/PassModal.jsx`, `src/community/GuidesPanel.jsx`, `src/community/GuidesStrip.jsx`, `src/community/ReportGuide.jsx`, `src/community/UploadForm.jsx`, `src/admin/AdminPage.jsx`, and in `src/components/admin/`: `AdminLock.jsx`, `MissingTables.jsx`, `FeedbackInbox.jsx`, `ConfigManager.jsx`, `ContentSection.jsx`, `UserDetail.jsx`, `UsersList.jsx`, `Sparkbars.jsx`, `Overview.jsx`, `PipelineHealth.jsx`.
- Styles: `src/styles/69-v6-account.css` (new, created and imported by T380; every new rule goes here), and read for overrides `src/styles/16-auth.css`, `17-saved-trips.css`, `21-chat-passes.css` (the pass half), `22-account-admin.css`, `40-upload.css`, `42-feedback.css`.
- Strings: `src/i18n/en.js`, `de.js`, `es.js`, `fr.js`, `it.js`, `nl.js`.
- Harnesses (assertions updated with a comment, never deleted): `scripts/verify_saved.mjs`, `verify_account_panel.mjs`, `verify_trip_share.mjs`, `verify_friends.mjs`, `verify_past_trip.mjs`, `verify_paywall.mjs`, `verify_guides.mjs`, `verify_admin_panel.mjs`.

Shared with other surfaces, to be settled in OWNERSHIP.md before V3 (register row T379-b):

- `src/components/ReportProblem.jsx`: styled by this surface's `42-feedback.css` but rendered on the destination, trail, beach, lake, mountain, cycle, journey and trip pages.
- `src/components/AppHeader.jsx` and `src/components/BottomNav.jsx` (the "Saved trips" label, the Friends button, the pass chip, the avatar fill) and `src/App.jsx` (sign-in closing My trips, line 1281): the shell brief's files.
- `src/styles/23-places-pages.css`, `24-destination-workspace.css`, `25-feature-pages.css`, `14-filters-panels.css` and `12-guided-trip.css`: they carry a large share of this surface's rules today (the share panel, the friends rows, the account shell overrides, the guide cards, the panel close, the pass card shell). V3 overrides them from `69-v6-account.css` rather than editing them.
- `src/lib/pricing.js` (`yearPassTripsEquivalent`) and `src/lib/costIndex.js` (read for the saved-card figure).

## 7. Needs a rule

Each line is a proposal carta-design does not cover today, with the rule proposed. T380 (V2) accepts or rejects each one (register row T379-a); an item in part 6 that depends on a rejected rule is skipped.

1. Undo line. A low-risk removal (un-star, a crew name, withdrawing a co-planner ask) happens at once and shows one line at the foot of the view, "{Thing} removed" with a secondary "Undo" button, for 6 s or until the next action; never for anything a server cannot restore, never for an account, a trip plan or a public link, which keep the inline confirm.
2. Inline confirm. Anything that erases a trip, a link or an account, or makes something public, arms in place: the row is replaced by one sentence and two buttons, the safe one first, focus moves to the safe one, Escape keeps; the erasing button is `--danger`, the publishing one `--ink-fill`. No modal.
3. Price on a saved card. A saved item shows one figure, the day cost per person at the traveller's lifestyle, in `--mono`, with the same pedigree word the Explore card uses; never a figure stored at save time shown as if current. When a "since you saved" delta exists (T379-c), it is a second line in words and figures, "€4.20 less a day than on 3 Oct", `--green` when lower, `--ink` when higher, never `--accent` or `--danger`.
4. Caption band under a photograph. On a card with a photograph, text never sits on the photo; it sits in a solid `--paper` or `--bg-card` band flush under it, as the suitability strip does. The two gradient shades on My trips go. (Extends the suitability strip rule from trip heroes to every photo card.)
5. Count chip. A count next to a heading or tab is `--ui` 12 px `--ink-soft` in a `--rule` outline chip, 999 px radius, never accent-filled; accent is for actions.
6. Selected tab and rail row. A selected tab, segment or rail row is `--ink-fill` with `--on-fill` text, on every surface, and nothing else marks it (no accent bar above the icon). This restates carta-design's "active toggle" for navigation and lets the harnesses at `scripts/verify_saved.mjs`:108 and `scripts/verify_account_panel.mjs`:248 assert one value.
7. Success line. A confirmation ("Profile updated.", "Link copied") is `--ink` text with a 6 px `--status-success` dot before it, never `--green` text and never a green tick on chrome; `--green` stays for good news in data.
8. Plan comparison. The pass modal may carry one comparison table under the plan cards: plans as columns, one row per allowance, figures in `--mono`, the recommended column marked only by the card's existing accent border above it, two columns visible on a phone with the table scrolling inside itself.
9. Photo track. A run of photographs in a record or guide may use the day track's mechanics (snap, Previous and Next, mono position, arrow keys, no autoplay), labelled by caption instead of by day.
10. Password strength. The meter is three steps drawn in the ink ramp (`--kind-village`, `--kind-city`, `--ink`) with the word ("Weak", "Fair", "Strong") beside it; never `--danger`, `--rate` or `--green`, because none of the three is destruction, a rating or good news in data.
11. Milestones and "New". Friend milestones are progress, not a rating: earned badges in `--ink` with the name, locked ones in `--ink-mute` outline; the "New" marker on a friend's trip is a `--rule` outline chip in `--ink`. `--rate` stays for ratings only.
12. Section label. A label above a group of controls is `--ui` 12 px weight 600 `--ink-soft`, sentence case, no letter-spacing; the 10 px tracked labels on Account and My trips go.
13. Next trip card. On a list of dated plans, the first upcoming plan may be drawn one size larger than the rest (a single focal card, not a bento): photo, caption band, countdown, figure, two secondaries. The rest are rows.

## Direction check (T380, V2)

What `docs/design-v6/DIRECTION.md` changes in this plan. All thirteen rules are accepted, two as amended. Rule 1 (the undo line) is widened into the house undo rule: a plan, a saved trip and a co-planner ask are undone the same way as a star, for six seconds, while the app holds the object; the inline confirm of rule 2 is kept only for the account, publishing to the gallery and withdrawing a public link, so V3-5's "Remove" on a planned trip becomes an undo toast rather than an inline confirm. Rule 5 (the count chip) takes the shell's form, `--mono` 11 px `--ink` on `--paper-dim`, because a count is a measured number; the `--rule` outline version is not built. Rule 4 is the house caption band, rule 6 the house selected state (both harness assertions in V5-7 assert `--ink-fill`), rule 7 is merged with the outdoor pages' status containers into "status, not green", rule 9 is the house photo track and rule 13 the focal card. The star's 150 ms scale in V4-7 becomes `--dur-1`, the copied-in-place confirmation follows the status rule, and every transition in V5-3 takes a token. OWNERSHIP.md gives this surface `src/auth/`, `src/community/`, `src/admin/`, `src/components/admin/`, `PassModal.jsx`, `useFavoriteItems.js`, `usePaywall.jsx`, `useEntitlement.js`, `useAccountSync.js`, `useIsAdmin.js`, `pricing.js`, `favorites.js`, `16-auth.css`, `17-saved-trips.css`, `22-account-admin.css`, `40-upload.css` and `42-feedback.css`; `ReportProblem.jsx` is shell's (its rules in 42 stay until shell asks for them or overrides from `60-v6-shell.css`), `AppHeader.jsx`, `BottomNav.jsx` and `App.jsx` are shell's (the "My trips" label is `nav.saved` under shell's prefix; it and the sign-in line are hand-offs to T381), and the account rules living in `12`, `14`, `23`, `24` and `25` are overridden from `69-v6-account.css` and moved there under OWNERSHIP.md rule 5 (row T379-b closed by this assignment).
