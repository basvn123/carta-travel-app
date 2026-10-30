# T895 to T900: plan your days, the Carta bot as a chat, all days and one day

## Task ID

T895 to T900, one batch (CLAUDE.md "Batches"), branch `p15-plan-days`.

## Date

2026-10-30

## Shared header

The owner sent five screenshots:

- the day rhythm sheet ("How do you like your mornings?", 1 of 7);
- the Carta bot form ("Plan day 1 in Corfu with the Carta bot");
- three views of one day in Corfu.

They asked for research on four things:

- whether the questions are the right ones, and whether "who plans" should come first;
- a real chatbot in place of the form, in the spirit of Explore's Ask Carta and Mindtrip;
- how the day page and a days overview should be set up, on desktop and on a phone;
- a fix for the Plan tab, which sometimes cannot reach the Plan overview.

They also asked that the small help lines under questions go. They judged the artifact "Plan Your Days" (https://claude.ai/artifact/DfTu9hF4mqWrZViMDp5XBm): "I love it go".

**Research behind the design, in the artifact:**

- **Questions:** Wonderplan, Layla and Tripadvisor ask who is going, interests, budget and dates. Gemini plans from a sentence, and Wanderlog's Auto-fill asks nothing.
- **Fewer questions:** SurveyMonkey and Inntopia show that each extra question and page costs completions.
- **Path first:** Iyengar's configurator study supports putting the easy, path-setting choice first.
- **Chat:** Mindtrip puts a chat beside a map. NN/g says a bot should state what it can do. The ChatGPT, Gemini and Claude apps pin the field at the bottom and show suggestions only when the chat is empty.
- **Days:** Wanderlog, Stippl, Polarsteps and TripIt all have a days overview. TripIt's "Go now" says when to leave.
- **Navigation:** NN/g recommends breadcrumbs plus local navigation.

**The owner's open decisions, defaulted as the artifact proposed:**

- **Carta plans every day:** fills all empty days in turn. This is the existing queue from T823.
- **Times:** clock times stay. The detail switch on the day keeps "parts of the day" for those who want it.
- **The bot:** keeps its free-account rule.

**How it was checked.** Each task ran static checks: eslint on the touched files, `npm test` and design-lint. This session has no app data (no catalogue, no POI shards, no Supabase), so the whole DayPlannerTab with a real trip could not run.

The end check was one throwaway harness (`continent-app/__t901/`, deleted, never committed). It rendered the new components with the real CSS:

- `DaysPrompt`, both screens;
- `DayCrumbs`, `DayPills` and `DayStart`, filled and empty;
- `DayBotChat`, docked in the real `day-ws is-desk has-bot` grid on desktop and as a sheet on a phone, with a mocked planner answer.

Playwright drove it at 390x900 and 1440x900. The checks: no page errors, no console errors, no horizontal overflow. The chat greeted the traveller, a suggestion sent the ask, and the answer card appeared with Add to Day 1, copy, try again and the four quick changes.

**What the harness did not cover:** DayPlannerTab itself with a trip, TripDaysOverview, and the planner's real Gemini answer. Those need app data (T899-a).

## T895: the Plan tab and the breadcrumb

### What changed

Plan in the header or the bottom nav now always opens the Plan overview (`planstart`). Before, it stayed on any view already inside Plan (App.jsx `goTo`), which was the dead end.

A day inside a trip wears `DayCrumbs`: Plan / the trip / Day N (or All days), then the previous and next day and Share. On a phone the trip name gives way first. A standalone day plan keeps its PageBar.

### Files touched

- **Modified:** `continent-app/src/App.jsx`, `planner/DayPlannerTab.jsx`, `styles/planners.css`, i18n (3 keys)
- **Created:** `planner/days/DayCrumbs.jsx`, `styles/planners/89-plan-days.css`

### Commands run

eslint, design-lint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Taps from a day to the Plan overview | not possible with the tab (it stayed on the day) | 1 (the tab or the breadcrumb) | the dead end is gone |

### What broke and how it was fixed

- **Raw buttons:** design-lint flagged the raw `<button>` in the breadcrumb, so it now uses the kit `Button`.

### What is still open

- The trip page (TripPlannerTab) has no breadcrumb of its own yet (T895-a).

### End check screens

The day at 390 and 1440, with the breadcrumb.

### Rollback procedure

`git revert` the T895 commit.

## T896: Plan your days asks how first

### What changed

`DaysPrompt` now opens on "How do you want to plan your days?", with three ways:

- **Carta plans every day:** goes on to one more screen, "Your days", filled from the trip:
  - "What do you want more of?": seven chips, which are the plan-day moods, pre-ticked from the trip's likes;
  - Pace;
  - Days start;
  - "Keep in mind": short walks, a rest after lunch, keep it cheap, festivals and events.
- **Plan with the Carta bot:** opens the first day with the bot.
- **I'll plan them myself:** opens All days.

The eight screens before it are gone: "Plan your days?", six rhythm questions, then "Who plans".

`tripSettings` changes:

- new fields `rhythm.goals` and `rhythm.keep`, and `daysHow` now also accepts `bot`;
- `dayAiPreset` sends the goals as moods (up to 3, the Edge Function's own list);
- short walks cap the steps at 8,000 and avoid hills;
- a rest and a low spend go to the planner as words;
- "Festivals and events" turns on the events search.

The every-day queue carries `avoidHills` and `wantEvents` too.

### Files touched

- **Modified:** `planner/flow/DaysPrompt.jsx` (rewritten), `planner/flow/tripSettings.js`, `planner/TripPlannerTab.jsx`, `planner/DayPlannerTab.jsx`, `styles/planners/89-plan-days.css`, i18n (31 keys)
- **Tests:** `tests/tripSettings.test.mjs` (1 test)

### Commands run

eslint, design-lint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Screens before the days open (plan myself) | 8 | 1 | -7 |
| Screens before the days open (Carta plans) | 8 | 2 | -6 |

### What broke and how it was fixed

- **Card names:** a long way name ran into the card edge at 1440. It now wraps. End check fix.

### What is still open

- The trip settings gear (TripSettingsSheet) still edits the old rhythm questions. It does not show goals or Keep in mind (T896-a).

### End check screens

Both screens at 390 and 1440.

### Rollback procedure

`git revert` the two T896 commits. Saved settings with `goals`, `keep` or `daysHow: 'bot'` normalise away under the old code.

## T897: All days leads with the days

### What changed

`TripDaysOverview` now opens on the trip's name and "N days, M planned". While any day is empty it offers "Fill N empty days", which starts the every-day queue, or opens the bot for a guest.

Each day is a row with its own colour at its edge. "Fill this day" opens the Carta bot on that day; before, DayPlannerTab never passed it. The money tiles and the ideas follow the days instead of leading.

### Files touched

- **Modified:** `planner/days/TripDaysOverview.jsx`, `planner/DayPlannerTab.jsx`, `styles/planners/89-plan-days.css`, i18n (3 keys)

### Commands run

eslint, design-lint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

Not measured.

### What broke and how it was fixed

Nothing found statically.

### What is still open

- **Map coloured by day:** the artifact's whole-trip map in day colours needs TripMap to take a colour per stop (T897-a).
- **Not checked in a browser:** with no app data, this screen was not seen (T899-a).

### End check screens

Not reached in the harness (see the shared header).

### Rollback procedure

`git revert` the T897 commit.

## T898: one day, the day first

### What changed

A day inside a trip now opens in this order:

1. **Breadcrumb** (T895).
2. **The days as chips:** All days first, then every day, an empty day marked with a ring. This replaces the switcher and the "All days" link.
3. **Start your day:**
   - when to leave (the day's start);
   - the first stop and when it is reached;
   - the town's usual high that month (`taste.tmax_by_month`, said as "Usual high");
   - the tickets the day holds;
   - the day's cost a person;
   - the bed it ends at.

   An empty day says "Nothing planned yet" and offers "Let Carta plan this day" and "Add a place".
4. **The timeline and the kit**, as before.
5. **About {town}:** the town guide, which led the day before (photo, line, seven questions), is now one closed block at the end. It drops the questions the data cannot answer instead of saying "Not available yet".

The "From the trip" line goes. A standalone day plan keeps its switcher.

### Files touched

- **Modified:** `planner/DayPlannerTab.jsx`, `planner/days/DayTownGuide.jsx` (`folded`), `styles/planners/89-plan-days.css`, i18n (14 keys)
- **Created:** `planner/days/DayStart.jsx` (DayStart, DayPills)

### Commands run

eslint, design-lint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| What leads the day page | the town's photo and seven guide questions (two empty) | Start your day and the timeline | the day is no longer below the fold |

### What broke and how it was fixed

- **Leave chip colour:** it used the sun "best" tone. It is now neutral, because that yellow means best value. End check fix.

### What is still open

- **What to bring:** the artifact's "Bring" line has no data behind it and was not built (T898-a).
- **Toolbar:** the artifact's Notes and Share toolbar was not built; the day kit and exports keep their place under the timeline (T898-b).

### End check screens

Start your day (filled and empty) and the chips at 390 and 1440.

### Rollback procedure

`git revert` the two T898 commits. `DayTownGuide` without `folded` renders as before.

## T899: the Carta bot as a chat

### What changed

`DayBotChat` replaces `AiDayPlanModal` on the day.

- **Where it sits:**
  - from 1280 px, a 400 px column left of the day, with the map staying;
  - from 1024 px, over the map;
  - on a phone, a full-screen sheet with a focus trap.
- **Empty chat:** it greets with the day and its facts, and offers three asks that fit (an empty day or a planned one).
- **Each answer:**
  - the planner's own sentence and the day as a card (time, name, why);
  - Add to Day N and Change something;
  - copy and try again;
  - the four quick changes under the newest answer only.
- **The field:** sits at the foot. Enter sends; Shift+Enter starts a new line.
- **Under the hood:**
  - same `runAi` and `plan-day` Edge Function;
  - the first ask plans the day, later asks change it (`refine`, `prevStops`, `refineToken`);
  - same failures, passes and built-in fallback;
  - "Fill this day" and "Let Carta plan this day" start the chat on their ask.
- **Signed out:** one line, Sign in, and the built-in planner.
- **On a desktop:** the chat stays open after Add.
- **New icon:** `CopyIcon`.

### Files touched

- **Modified:** `planner/DayPlannerTab.jsx`, `components/Icons.jsx`, `styles/planners/89-plan-days.css`, i18n (24 keys)
- **Created:** `planner/days/DayBotChat.jsx`

### Commands run

eslint, design-lint, `npm test`.

### Config and secrets set

None. No Anthropic API: the planner stays on Gemini (plan-day).

### Before/after measurements

Not measured.

### What broke and how it was fixed

- **Field outline:** design-lint flagged `outline: none` on the field. It is now a transparent outline, and the form keeps the visible ring.

### What is still open

- **Not seen with real data:** the chat with a real trip and the real planner (T899-a).
- **The old components:**
  - `AiDayPlanModal.jsx` is no longer used by the app, but `scripts/ai/*` and `verify_day_workspace.mjs` still use it, so it stays until those scripts move;
  - the standalone day planner's guided chat (`CartaChatPlanner`, the landing "chat" step) is not converted to `DayBotChat`;

  both are in T899-b.

### End check screens

The chat at 390 (sheet) and 1440 (docked), empty and answered.

### Rollback procedure

`git revert` the T899 commit. The modal comes back.

## T900: no help lines under questions

### What changed

Six help lines go:

- the five `helpKey` lines in the plan flow's questions: priority, where you are, until when, "Pick up to three" and "Carta asks how you like your days";
- the line over the named places.

The desktop side column ("Why we ask" of T894's plan) keeps its role. Empty and error states such as "No match" stay, because they are states, not help.

### Files touched

- **Modified:** `planner/flow/questions.js`, `planner/flow/QuestionScreen.jsx`

### Commands run

eslint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Help lines rendered under plan flow questions | 6 | 0 | -6 |

### What broke and how it was fixed

Nothing.

### What is still open

Nothing.

### End check screens

The question screens are unchanged except for the missing line.

### Rollback procedure

`git revert` the T900 commit.
