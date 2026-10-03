# T159: Who this is not for, on every page type

## Task ID

T159 (mind-map number T163). Branch p10-m1-not-for in both repos.

## Date

2026-10-03

## What changed

Seven page types now carry a plain block of at most two lines that start "Not for you if ...": mountain, beach, lake, trail, cycling (route and tour), published trip and curated journey. The block sits near the top, after the head and before the photograph or the facts. It is dim paper with a hairline above and below, no icon and no colour.

The lines are not hand written. lib/notFor.js holds an ordered rule list per kind, and each rule reads a field the page already shows: the hazard list on mountains and lakes, the surface, water class, services and size on beaches, the swim verdict, the road-walk reason, grade, ascent and length on trails, the bike class, paved share, safety score and climb per km on cycling, transport, stops and season on trips, car requirement, difficulty and family flag on journeys. The first two rules that fire are shown. So when a field changes in the data, the sentence changes with it and cannot drift. The thresholds are my choices and are named in that file: road share 15 percent or more, climb 800 m or more, length 20 km or more, cycling climb 12 m per km or more, unpaved share over 30 percent, safety under 5, trip with four or more stops.

A place that trips no rule still shows one line: "Not for you if you need today's conditions. Carta shows the usual picture, not what is happening now." That is true of everything Carta shows, which is why it may stand in. I chose it over hiding the block, because a block that silently vanishes reads as "nothing to warn about", and this app cannot say that. The cost is that a quiet place shows a generic line, which a later task could replace with per-place content.

The shared component is src/components/NotFor.jsx and the style is .notfor in src/styles/23-places-pages.css. Strings are notfor.* in src/i18n/en.js. Other locales do not carry these keys and fall back to English, the same as the existing mtn., lake. and beach. strings do.

The brief says "every page type" in the session note but "all five destination sections and every trip" in the done condition. I followed the done condition. The city destination page (DestinationPage.jsx) is not covered, see open items.

## Files touched

Modified (app repo, continent-app):
- src/browse/MountainPage.jsx, BeachPage.jsx, LakePage.jsx, TrailPage.jsx, CyclePage.jsx, TripPage.jsx, JourneyPage.jsx (one import pair and one block each, TripPage also a small derived value)
- src/i18n/en.js
- src/styles/23-places-pages.css

Created (app repo):
- src/lib/notFor.js
- src/components/NotFor.jsx

Root repo: this report and the register rows only.

## Commands run

git commit in wt/T159-app on p10-m1-not-for. npx eslint on the nine touched code files (no errors; one existing unused-variable warning in LakePage.jsx, monthWord, not mine). A throwaway node script called notForLines with ten sample records and printed the keys; it was deleted afterwards.

## Config and secrets set

None.

## Before/after measurements

Not measured, with one count. Page types showing a not-for block: before 0, after 7 (mountain, beach, lake, trail, cycling, trip, journey). Source: the NotFor call sites in src/browse.

## What broke and how it was fixed

No issues in the code. One slip: my first edit script rewrote CRLF files with LF line endings and showed as a whole-file diff on TripPage.jsx. I reverted that file and redid every edit with a helper that keeps the file's own line endings, and confirmed the final diff is 283 added lines and nothing removed.

## What is still open

The check at 380 px and on desktop was not done. The worktree has no layer data (no app_data.json, no mountains, beaches, lakes, trails, cycling, trips or journeys wire files), so no page could be opened, and I did not start Vite on a machine with under 1 GB free. The rules were exercised on sample records and the lint is clean, but nobody has seen the block rendered. The CSS is two plain rules with no fixed widths, so it should wrap at 380 px, but that is a belief, not a check.

The city destination page is not covered, and the destinations spec 4.5 item 3 is written for the five sections. Strings exist only in English. The thresholds above are judgement calls the owner may want to move.

## Rollback procedure

Revert the single app commit on p10-m1-not-for (git revert, or do not merge the branch). Nothing else depends on it: no data, schema or migration changed.
