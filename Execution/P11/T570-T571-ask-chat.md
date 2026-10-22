# T570-T571: Ask Carta as a chat (the Kayak structure), and answers that guide the trip

Batch of two tasks (CLAUDE.md, "Batches"), one batch branch `p11-ask-chat` in the root repo and in `continent-app/` (off `p11-ask-motion`), one commit per task, one end check in the browser, this one report. Date: 2026-10-22.

The owner showed Kayak's "Vraag AI" and asked for:
- its structure: one small button that opens a separate chat panel you can close; sessions you can see and continue; "You're in Brussels" with sample questions; visible searching while it works; a flight card with the airlines and the price;
- more than Kayak: where to stay, what to do and planning the trip;
- every output linked into the app;
- top-notch and space-efficient on desktop and phone, run through impeccable;
- as cheap as possible, with the local model to come later (row T564-a).

Impeccable ran as the design process. Its context loaded and resolved to `continent-app/`, so it missed the root PRODUCT.md and DESIGN.md, which were read directly. The surface brief is Operate mode, the category standard at full craft. The craft floor was read before the UI edits, and the detector ran once over the finished files with no findings. carta-design wins where the two differ.

---

## T570: the chat panel, its chats and its door

### What changed

Ask Carta is no longer a field on the page. It is one small "Ask Carta" button: in the app header on desktop, and sharing the Filters row in two equal halves on a phone.

**The panel** (`AskChat.jsx`, loaded on the first press, 29.6 KB JS and CSS):
- Desktop: a 420 px column docked on the right under the settings line, so From, Dates, People and Lifestyle stay visible. From 1024 px the Explore list makes room beside it. It is not modal; Escape closes it. The button shows the selected state while it is open.
- Phone: a full-screen sheet with a focus trap. It lands on its heading, so the keyboard does not cover the questions.
- The head row holds Your chats (clock), the title, New chat (pencil) and Close.

**Empty state**, laid out from the bottom up like Kayak:
- "Where to next?", then "You're in Brussels (BRU)" from the settings origin.
- Three questions to ask: "Cheapest places in {next month}" plus the examples. "Show more" reveals the rest.

**Composer**, held at the foot:
- An auto-growing field (Enter sends, Shift+Enter adds a line) and a send button that turns brown once there is a question.
- The typing hint from T569 runs in the empty field.
- One line under it: "Written by AI from Carta's figures. It can be wrong."

**Chats** (`lib/ask/sessions.js`):
- Every conversation is kept on this device (localStorage, newest first, at most 30 chats of 40 turns), grouped Today, Last 7 days and Older. Each can be reopened or deleted.
- A turn keeps its question and its checked written answer. Reopening redraws the facts from the catalogue and does not ask the model again, so history costs nothing.

**Removed:**
- The T568 bar under the chips: `AskBar.jsx` deleted, the `bar` branches taken out of `AskSearch.jsx` and `AskSearchFull.jsx`, `.ask-bar` CSS back to its pre-T568 state.
- Plan's start page keeps its old field (row T568-b).

**Design rules:** carta-design and DESIGN.md now name the chat in the Ask Carta exception:
- typed suggestions, with the drawn caret only while the field has no focus;
- the work shown as steps, with one pulsing brown dot for the live step;
- arrivals at `--dur-2` and `--dur-3`, staggered by at most 120 ms.

### Files touched

**Created:** `continent-app/src/browse/ask/AskChat.jsx`, `AskChatButton.jsx`, `useTypedHint.js` (moved from AskBar), `marks.jsx` (three drawn marks; the craft floor bans text glyphs as icons), `continent-app/src/lib/ask/sessions.js`, `continent-app/src/styles/76-ask-chat.css`

**Modified:**
- `continent-app/src/browse/ExploreTab.jsx` (the header slot again; `askTrip`; the button in place of the bar)
- `AskSearch.jsx` (back to 9330a0a)
- `AskSearchFull.jsx` (`AskAnswer` exported with an `afterWritten` slot; the written answer's heading id from `useId`, since a chat shows many)
- `src/i18n/{en,nl,de,fr,es,it}.js` (44 `askChat.*` keys each; `ask.seeAnswer` removed)
- root `.claude/skills/carta-design/SKILL.md` and `DESIGN.md` (the Ask Carta exception rewritten for the chat)

**Deleted:** `continent-app/src/browse/AskBar.jsx`

### Before/after measurements

| Metric | Before (T568 build) | After | Delta |
|---|---|---|---|
| Eager JS (index-*.js) | 788,016 B | 786,812 B | -1,204 B |
| Eager CSS (index-*.css) | 733,883 B | 731,751 B | -2,132 B |
| Chat chunk on first press (AskChat js+css) | none | 29,639 B | new, lazy |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| 133 existing `chat.*` strings (the planner's bot) deleted from all six languages | My i18n script dropped every line starting `"chat.` before adding the new ones | Restored the six files from git (no other uncommitted change was in them); the new keys live under `askChat.*` |
| Class names `.chat-send`, `.chat-input`, `.chat-row`, `.chat-field` already belonged to the planner's bot | Same prefix | Every class of the new chat is `ac-*`; nothing else in src uses `ac-` |
| The `...chat` rest parameter was renamed to `...ac` by the class rename | Regex on `.chat` hit the spread | Fixed by hand; lint caught it |
| ci:css-routes: `.trip-total-bar.is-bar` could be overridden | The button reused `is-bar` and `is-header` | Renamed `ac-in-bar` and `ac-in-header`; check passes, 2319 selectors |
| Two carets, the hint's and the browser's, in the focused field on desktop | The hint ran in a focused field | The drawn caret shows only without focus |
| Phone keyboard covered the start questions | The focus trap focused the field | The phone lands on the heading (`tabIndex=-1`) |
| design-lint `raw-button` (3) and `outline-none` (1) | Plain buttons for a start row, a chat row and send | Kit `Button`s; the outline rule dropped |
| Follow-up arrows sat above the text line | The mark was inside the label | Passed as `iconStart` |

### What is still open

- T570-a: chats live on this device only. Keeping them in the account (Supabase, so they follow a traveller to a second device) is an owner decision about storing questions.
- T570-b: "You're in Brussels (BRU)" is text. Changing the origin from the chat needs the settings line's origin picker to open from outside it, which it cannot yet.
- T570-c: the button is on Explore only (its header slot, while Explore is the tab). A global Ask Carta (Plan, My trips, place pages) needs the catalogue rows Explore holds lifted to the app shell.

### Rollback

`git -C continent-app revert <T571> <T570>`, in that order, since T570's panel imports T571's turn. Then `git revert <root T570-T571 commit>`. Chats in browsers stay in localStorage under `carta.ask.chats.v1` and are inert without the code.

---

## T571: what an answer says and where it leads

### What changed

Each question is a turn (`AskTurn.jsx`). It runs useAsk's stages for that turn alone (parse, hybrid search, facts, words, the written answer checked sentence by sentence). While they run, the real stages show as steps: "Reading your question", "Looking through Carta's places", "Checking flights from Brussels (BRU)", "Writing the answer". Done steps get a tick; the live one pulses.

**The trip card**, for the first place of a find, near, budget, plan, about or when answer:
- **Flight:** Kayak's card in Carta's grammar: BRU → OPO, the dates, the airline marks and the price a person return. It opens to the two flight rows (times, stops, "Google Flights, checked") and the one Google Flights link that says prices may have changed. It reads the month asked about, else, beyond the sweep window, the traveller's dates, and always prints the dates it found.
- **Where to stay:** the bed and the food a person, at the traveller's Lifestyle, both marked est.
- **What to do:** the place's own activities list, the one its page shows.
- **Actions:** Open {place}, and Plan this trip (a plan answer hands over its whole route). Plan this trip is the primary only on the newest turn.

**Links into the app:**
- Every place row opens its page.
- A find answer offers "Show all N places", which applies the facets to Explore.
- Up to three follow-ups sit under the newest answer: the best time for the first place, the first two compared, "Plan 7 days in {place}". All are phrasings the parser reads.

**Places outside Europe** (`lib/ask/outside.js`): a destination the parser does not know, named right after to, naar, nach, à, a, en or in, is said plainly. "Carta covers Europe, and Dubai isn't in it yet. Carta can't plan or price the stay there yet." Then come a link to search Google Flights for that place on the traveller's dates, and two follow-ups ("Warm in November, cheapest first", a budget question). Before, the owner's Dubai question was answered as "7 days, 3 stops: Valbona Valley, Mavrovi Anovi, Rila Monastery".

**Warm before the month** (`rank.js`): a question asking for warm now gives up the month's best list before it gives up warmth. "Warm in November, cheapest first" went from "3855 places match Cheapest first" (both relaxed: Balkan mountains) to "47 places match Warm, Cheapest first" (Cyprus, the Peloponnese, Madeira, Crete, all 20 °C or more that month).

### Files touched

**Created:**
- `continent-app/src/browse/ask/AskTurn.jsx`
- `continent-app/src/browse/ask/AskTripCard.jsx`
- `continent-app/src/lib/ask/outside.js`
- `continent-app/tests/askChat.test.mjs` (6 tests: chats saved, loaded, capped, grouped and safe on bad storage; outside places in three languages and three refusals; warm before the month)

**Modified:**
- `continent-app/src/lib/ask/rank.js` (`RELAX_WARM`)

### Commands run

```
npx eslint src/browse/ask/ src/lib/ask/ src/browse/ExploreTab.jsx src/browse/AskSearchFull.jsx
npm test                                   # 636 pass, 0 fail (630 before the batch; the ask golden set still passes)
node scripts/ci/design-lint.mjs            # no finding in touched files (bagFees.js, verify.js, Logo.jsx, ReceiptCard.jsx, compose.js predate it)
impeccable detect --json src/browse/ask src/styles/76-ask-chat.css   # []
ASK_ROOT=<continent-app> ASK_OUT=<scratch>/dist-t570 npx vite build --config ../../wt/vite.t558.mjs
node scripts/css-routes.mjs --check <scratch>/dist-t570/assets      # 2319, none overridable
```

### Before/after measurements

| Question (owner's test and two more) | Before | After |
|---|---|---|
| "I want to plan a trip to dubai in november, the cheapest way possible..." | 7-day route in Albania, North Macedonia, Bulgaria | Carta covers Europe, not Dubai; Google Flights link; two follow-ups |
| "Warm in November, cheapest first" | 3855 places, warm and month dropped | 47 places at 20 °C or more in November, cheapest first |
| "Plan 7 days in Porto in May" | no trip card | BRU → OPO 21 to 28 Nov, €198 a person return, beds ~€56 est., food ~€41 est., three things to do, Plan this trip |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The trip card said "No flight found" to Porto while the row under it showed "Flight from €133" | The card read May; the sweep does not reach May yet; the row reads the November dates | The card falls back to the traveller's dates and prints them |
| ci:css-routes: `.sig .mstrip-cells` no longer items-only | Sorting POIs by `.sig` put the word "sig" in the chat chunk, and the check reads class names as words in JS | What to do reads the place's own activities list (what its page shows), falling back to the shard by rating, so the chunk never names it |

End check, desktop at 1366 px and phone at 390 px with touch emulation, on the merged batch. Screens: Explore with the panel closed and open; the empty state; the Dubai question; a find answer with steps, the written answer and the trip card; a plan answer on the phone with the flight card; Your chats; the phone row. No horizontal scroll at 390. The written answer came from the Pages preview through the T569 dev proxy.

### What is still open

- T571-a: a follow-up is a new question. The chat does not carry context yet ("and where to stay there?" does not know "there"). The next step is to carry the last turn's place into a question that names none.
- T571-b: Where to stay is Carta's bed estimate, not concrete stays. When live stays (branch p11-live-stays-2) land, the card can link the cheapest real stays.
- T571-c: a month beyond the sweep window shows the traveller's dates instead. A live /api/flights search for the asked month would answer exactly, at the cost of more Worker requests.
- T571-d: outside Europe, Carta only links to Google Flights. Whether Carta should ever cover a few non-European destinations is the owner's call.
- T571-e: Marco de Canavezes shows a portrait of a man as its photo (catalogue image QA, seen in the end check).
- T571-f: the written answer joined "with51" without a space in one sentence. The join in generate/verify needs a look.
- T571-g: features to choose next, all free or nearly:
  - thumbs up and down on an answer (Kayak has them), kept on the device;
  - voice input through the browser's speech API;
  - share a chat as a link;
  - "Save these places" to My trips from an answer;
  - a day plan inside the chat through the existing Gemini plan-day function;
  - the local model (row T564-a) as the writer, to bring the per-answer cost to zero.

### Rollback

As T570: revert T571's app commit first (T570's panel imports AskTurn, so T570 cannot stand alone without it), then T570, then the root commit. `rank.js` reverts to the old relax order on its own.
