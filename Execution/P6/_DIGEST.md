# P6 digest

5 task reports folded on 2026-11-03 (T1034). Each entry keeps what changed and what broke; the full report, commands, files and rollback are in git under the tag `archive/execution-full-2026-11-03` (command under each entry). Open items live in `Execution/_OPEN.md`.

### T099: I1, price the trip on the trip page (2026-10-07)

The destination page and the trip page now show a priced, itemised total the moment they open, before the visitor is asked anything. It is the first-run receipt that `docs/FIRST_RUN_RESULT.md` designs and the owner approved on 2026-10-07 (T362, rows T211-d and T211-a). The task text asked for flights, a cabin bag and transfers from the remembered airport; the session notes override that, because Carta prices no flights (T272, T273). So the receipt carries the lines Carta does stand behind: the stay, for every night and every person, and food and drink, each with its provenance in a second row, plus one flight line that exists only when the traveller types what they paid.

Broke: The footer read "A week later would be" the same total / With no other stay tier measured in the town, the footer fell back to the week after, and the bed season is read per month, so a week inside the same month changes nothing / The footer steps to four weeks later when the week after does not move the total, and names it as such (`receipt.footer...

Full: `git show archive/execution-full-2026-11-03:"Execution/P6/T099-price-the-trip.md"`

### T100: I3, a party-size control, and two people no longer assumed silently (2026-10-07)

The first-run receipt from T099 now has a People cell as the first field of its input strip, before Stay and the two dates. It is a select from 1 to 12 people. Changing it reprices the receipt at once, writes `choices.group_size` (the same field the planner and the `g` URL parameter use), and counts as the visitor's first act, so `carta.firstResultSeen` is set. The default is now two. It used to be seven: `App.jsx` started `group_size` at 7, and `useAppData.js` then copied `meta.defaults.group_size`, which is 7 in the generated `public/app_data.json`. Per session rule 5 the data was not touched.

Full: `git show archive/execution-full-2026-11-03:"Execution/P6/T100-party-size.md"`

### T101: I2, break the seven-day assumption (2026-10-07)

Every curated trip now exists at two lengths, the week as written and a short version, and the trip page says which one it is pricing. The owner decided on 2026-10-07 (T362, runbook block A) that the two lengths are the short version and the week, as spec I2 says, so no ten-to-fourteen-day variant was built; that is register row T101-b. The short version is the trip's three or four best days with a total of their own. It is four days, and three when the trip is rated Demanding or harder (difficulty 4 or 5), because a hard route is not four days of effort. Of the 253 trips, 199 get four days and 54 get three, counted from `continent-app/public/journeys/journey/*.json` by `tripLengths`.

Broke: A second trip in the browser check opened already on the short version / The length is remembered per viewer on purpose, so the check's shared browser context carried it over / The check clears `carta.tripLength` before each trip; the behaviour is the design; `JourneyPage.jsx` showed every line changed after a scripted edit / The index holds CRLF f...

Full: `git show archive/execution-full-2026-11-03:"Execution/P6/T101-trip-lengths.md"`

### T102: I4, show the rail alternative (2026-10-03)

A journey page now ends its budget receipt with a "By train instead" block: a rough one-way fare per person, a door to door time, the departure city, and an "est" mark. It sits below the receipt and outside the total, because the total is a week of on-the-ground costs and the train is only a way to get there. Carta does not price flights, so the block is not a flight comparison. It says whether rail is a real option from where the traveller starts and what it roughly costs. The figure is not new maths.

Broke: fr.js failed to parse / An unescaped apostrophe in the French note, and a bash heredoc eats backslashes / Reworded the sentence to avoid the apostrophe; fr.js diff showed 8,000 lines / A sed -i pass changed its line endings / Restored the file and redid the edit with a script that keeps the endings

Full: `git show archive/execution-full-2026-11-03:"Execution/P6/T102-rail-alternative.md"`

### T103: I5, a price-by-month row under the weather row (2026-10-03)

The month strip on a journey page now has a second row under the weather row, aligned to the same twelve columns, showing which months are cheaper or dearer to stay. Under it sits one line naming the place the curve belongs to and the source, and when a month is both good by weather and cheap by price, a second line names it. That overlap, and the places where the two rows disagree, is what the task was for. Carta does not price flights (T272), so the row is ground cost only, and it is narrower than the task text hoped. Journeys carry no monthly price of their own.

Broke: Price row cells did not line up with the weather row / The weather row has an info button that narrows its grid / A spacer of the button's width at the end of the price row; "0 km away" read oddly / Distance printed even when the curve is the trip's own city / Under 5 km the sentence names the place only; French catalogue failed to parse / An apost...

Full: `git show archive/execution-full-2026-11-03:"Execution/P6/T103-price-by-month.md"`
