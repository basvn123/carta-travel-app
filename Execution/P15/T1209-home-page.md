# T1209: Home page G14, behind a flag (S125, ROADMAP G14)

## Date

2026-11-07

## What changed

Carta has a second, compact home page built for ROADMAP G14, behind the flag `HOME_G14` in `continent-app/src/browse/home/homeVariant.js`, which is off until the owner approves the design direction (T1111-a). Every visitor still gets today's home (v3); `?home=g14` previews the new one for the tab's session and `?home=v3` goes back. The G14 home says the promise in one line ("A cheap flight is not a cheap trip", the mission's short form), gives Explore and a sample trip (the Triglav hut to hut week, `#journey=si-hiking-triglav-hut-to-hut`) one tap each, shows one real day (Bled this calendar month, a person, the bed and the food and drink from the price engine at the traveller's Lifestyle, on the umber cost card of the direction draft, €154 on the local data in November) and carries the K3 waitlist with a referral link: one fixed link for everyone, `/?utm_source=waitlist_share&utm_medium=referral`, which the K12 channel counts already count as referral, so no person is tracked. Its chunk is 1.8 KB plus 1.4 KB CSS gzip and loads only when chosen; the entry chunk grew 704 bytes gzip (the flag and the route). First load on the measured stand-in: today's home LCP 10,880 ms before and 10,848 ms after (flag off, unchanged), the G14 home 10,716 ms. Both are held by the shell's wait for the catalogue (row T1209-d), so H12's LCP target is not met yet.

## Research

One method was chosen: the referral mechanism for K3. A research subagent compared three options (2026-11-07):

| Option | Personal data | Effort | Measures | Dark pattern risk |
|---|---|---|---|---|
| 1. One shared link, `utm_medium=referral`, counted in aggregate by K12 | None, no id in the link | Half a day, client only | Referral visits per day | None |
| 2. Own per-subscriber random codes, counted after double opt-in | A pseudonymous link between two people: notice, legal basis, retention | 1 to 2 days, migration and legal docs | Referrals per person | Low if the referrer sees only a count |
| 3. Hosted service (Viral Loops, GetWaitlist, Waitlister, Prefinery, LaunchList) | Emails and ids to a mostly US vendor, third-party scripts | Fast, but duplicates the `waitlist` Edge Function and Resend | Per person, dashboards | High (leaderboards and "move up" jumps are the default) |

Choice: option 1 now, option 2 later as a server step (row T1209-e); never a leaderboard or a "move up N places" counter (EDPB deceptive design guidance; it would also imply a scarcity Carta does not have). Web Share is missing on Firefox desktop and Chrome on Linux, so the clipboard fallback and a read-only field are required. Sources: [EDPB Guidelines 2/2023 on Art. 5(3)](https://edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en.pdf), [EDPB Guidelines 03/2022 deceptive design](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-032022-deceptive-design-patterns-social-media_en), [web.dev Web Share](https://web.dev/articles/web-share), [web-features: share](https://web-platform-dx.github.io/web-features-explorer/features/share), [Viral Loops pricing](https://viral-loops.com/pricing). The subagent could not fetch MDN or caniuse; the support data comes from search results.

The flag follows the pattern already in the repo (`costCardVariant.js`, T1122), so nothing else was chosen.

## Files touched

- Created: `continent-app/src/browse/home/homeVariant.js` (flag, preview, pure parts), `continent-app/src/browse/home/HomeG14.jsx`, `continent-app/src/styles/63-home-g14.css`, `continent-app/tests/homeG14.test.mjs`, `continent-app/scripts/verify_home_g14.mjs`, `docs/design/home-g14.md`, this report.
- Modified: `continent-app/src/App.jsx` (the home route picks the variant; the G14 chunk is fetched early when chosen), `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (17 `home.g*` keys each), `continent-app/scripts/verify_csp.mjs` (screen `home-g14`), `docs/HANDBOOK.md` (Home page), `ROADMAP.md` (G14 status), `Execution/_OPEN.md`.

## Commands run

```
cd continent-app && npm ci
node scripts/sync-data.mjs --split-only        # public/boot.json for the local harness (gitignored)
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
npm test && npm run lint && node scripts/ci/design-lint.mjs
CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node scripts/verify_csp.mjs --dist ../.fastbuild
CHROMIUM_PATH=... node scripts/verify_home_g14.mjs http://127.0.0.1:4199/   # a static serve of .fastbuild with public/ behind it
sh ../.claude/skills/impeccable/scripts/impeccable detect --json src/browse/home/HomeG14.jsx src/styles/63-home-g14.css
```

pytest was not run: no Python was touched and pytest is not installed in this container.

The first-load harness (a static gzip server over the fast build with `public/` as fallback, Playwright Chromium) lives in the session scratchpad, not the repo.

## Config and secrets set

None. The flag is a constant in code (`HOME_G14 = false`).

## Before/after measurements

Method: the fast build served locally with gzip, `public/` data behind it, Chromium at 390 x 844 DPR 3, Slow 4G (150 ms, 1.6 Mbit/s) and 4x CPU, cold cache. LCP is the last `largest-contentful-paint` entry. Supabase and Wikimedia are not reachable from the container, so the waitlist and the photos fail fast; the same for both sides.

| Metric | Before | After | Delta |
|---|---|---|---|
| Today's home (flag off), LCP median | 10,880 ms (3 runs, base `6b9ef6fa`) | 10,848 ms (3 runs) | none (the v3 film still) |
| G14 home (`?home=g14`), LCP median | not built | 10,716 ms (5 runs, 10,628 to 10,756) | 132 ms under today's home |
| G14 home, first build (lazy, priced in render) | | 12,680 ms (its text painted 2 s after the shell) | fixed, see What broke |
| Entry chunk, gzip | 280,732 B | 281,436 B | +704 B |
| Main CSS, gzip | 137,985 B | 137,985 B | 0 (G14 CSS loads with its chunk) |
| G14 chunk, gzip | | 1,808 B JS + 1,402 B CSS | |
| Bytes until 8 s after load | 1,421 KB | 1,423 KB (v3), 1,426 KB (G14) | +2 to +5 KB |
| G14 page height (scroll height, footer included) | | 1,947 px at 390, 1,788 px at 1440 | |
| design-lint new violations | 0 | 0 | 0 |
| CSP violations | 0 over 40 loads | 0 over 42 loads | 0 |
| INP | Not measured (needs a real phone, row T1209-b) | | |

The LCP of both homes is set by the shell: `App.jsx` shows the loading screen until the catalogue has loaded (`if (!data ...)`), and that ends at about 10.5 s on this profile. The G14 home is text-led, so it paints the instant the shell does; to reach H12's target the home has to paint before the catalogue (row T1209-d).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The G14 hero sat under the top bar on a phone and the site footer did not show | The page was in normal flow; today's home is an absolutely placed scroll box (`.hv-page`) and the footer only shows inside it | The root carries `hv-page hg-page` and reuses that box |
| Button links underlined | The global link underline; v3 resets it under `.hv-page` | Same reset under `.hg-page` |
| design-lint: radius, motion, shadow and gradient literals | Bar ends in px, a 140 ms stagger, the soft umber shadow and a radial glow written by hand | Bar rounded by its track (`--radius-pill`), stagger `--dur-1`, `--elev-3`, plain mist ground; the missing shadow token is row T1209-c |
| G14 text painted 2 s after the shell (LCP 12.7 s in 2 of 5 runs, 5.2 s reported in the others because the loading screen was the largest paint) | `React.lazy` suspends once even for a chunk already fetched, and the shell's first effects (pricing the catalogue) ran before its retry | App fetches the chunk at module load when G14 is chosen and draws the loaded module directly; the example card is priced in an idle callback after the first paint |
| Three tests fail locally (297 first paint bytes, 1351 and 1352 lite record) | They read `public/boot.json`, which `sync-data.mjs --split-only` wrote for the harness ("rank tier check FAILED on 27559 fields"); CI has no such file | Not mine to fix; with the file moved away all 1,983 tests pass (0 fail). Row T1209-h |

## Screens checked

The fast build with local data, Chromium: the G14 home at 390 x 844 (English), 360 x 800 (German) and 1440 x 900, top and the join section. Seen: the promise in two lines on a phone, the umber card with €154 (Lake Bled, November), bar and two lines, the foot strip button full width on a phone, the waitlist and the share card side by side on desktop and stacked on a phone, no horizontal scroll, all body controls 44 px or taller. Clicks: "See a sample trip" opens the journey page, "Open Lake Bled" opens the destination page, "Find a place" opens Explore, "Share Carta" copies the referral link (headless Chromium on Linux has no share sheet). `?tab=home` without the query still draws today's home. Screenshots in `Execution/P15/T1209-shots/` (gitignored).

## What is still open

- T1209-a (owner): the switch. After T1111-a, set `HOME_G14 = true` or keep v3; until then only `?home=g14` shows it.
- T1209-b (owner): the done condition asks for a real phone, and INP is only meaningful there.
- T1209-c: a token for the direction's soft umber shadow, so the card stops borrowing `--elev-3` (shared with G3's cost card).
- T1209-d: H12's LCP needs the home to paint before the catalogue arrives; today the shell holds every tab behind `!data`. That is a shell change outside this task's files.
- T1209-e: the server half of K3 referral (option 2 above), with its migration, privacy line and ARTICLE30 entry; never a leaderboard.
- T1209-f: the K12 weekly view should show `waitlist_share` and waitlist sign-ups by source `home_g14` (with T1109-b).
- T1209-g: the site footer's links are 32 px and 18 px tall on desktop, under the 44 px rule (SiteFooter, outside scope).
- T1209-h: the three tests that fail whenever a local `public/boot.json` exists.

## Owner steps (for the checklist)

- [T1209-a] Choose the home page | the G14 home is built but off; visitors see today's home until the flag flips | approve or amend docs/design/direction.md (T1111-a); open any page with ?home=g14 and then ?home=v3 on a phone and a desktop; set HOME_G14 = true in homeVariant.js or tell Claude to keep v3 | continent-app/src/browse/home/homeVariant.js, docs/design/home-g14.md
- [T1209-b] Check the G14 home on a real phone | G14's done condition and INP need a real device | deploy a preview; open it with ?home=g14 on your phone; tap Find a place, See a sample trip, Open Lake Bled and Share Carta and say what felt slow or wrong | Execution/P15/T1209-home-page.md

## Rollback procedure

`git revert` the T1209 commits on `p15-s125-home-page`. With the flag off nothing a traveller sees changes, so a revert is only needed to remove the code. Nothing is one-way.
