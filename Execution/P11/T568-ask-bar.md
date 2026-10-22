# T568: Ask Carta as a question bar in Explore's main panel

## Task ID

T568 (branch `p11-ask-bar` in the root repo and in `continent-app/`)

## Date

2026-10-22

## What changed

The owner asked for Ask Carta (the RAG answer panel, T550 to T566) to leave the app header, where its field was cut to "Ask Carta: a plac...", and sit under the filters in the main panel. They wanted it cleaner and more dynamic, with no example text in the field. On Explore, at every width, Ask Carta is now a real field under the filter chips (`AskBar.jsx`), not a button dressed as one. It has a visible "Ask Carta" label with the spark (the word is read but not drawn under 480 px), the placeholder "Type your question" and an Ask button. Typing and pressing Enter or Ask asks at once, and the answer panel opens directly under the field at the field's width. Before, it opened as a fixed 760 px popover hung from the header. Ask is the brown primary only while a new question is typed. Once answered it reads "See answer" as a secondary, so the panel's own primary stays the view's one. A clear control forgets the question, as the old trigger's did. On a fine pointer, a "/" key hint shows and "/" anywhere on the page focuses the field. Under the field are four questions to ask. The first two are built from the top two places in the list now, so they follow the filters: with Island on they read "Corfu or Santorini" and "When is the best time for Corfu". Two examples fill the rest. On a phone they are one row that scrolls sideways. The header slot is no longer used by Explore. The Plan start page keeps the old trigger and its example placeholder; that was not in this task. Research on how other AI search surfaces show this (sources below) shaped three choices: Kayak's Ask AI runs beside live results rather than replacing them, suggested prompts nudge toward full questions, and the conversation must not crowd out the results. carta-design rules out the common rotating or typewriter placeholder, because nothing may loop, so the dynamic part is the context-built suggestions instead.

Sources: https://stellagent.ai/insights/kayak-ask-ai-travel-planning, https://cloud.google.com/retail/docs/conversational-commerce-ux-guide, https://www.framer.com/marketplace/components/prompt-bar/

## Files touched

**Created:**
- `continent-app/src/browse/AskBar.jsx`

**Modified:**
- `continent-app/src/browse/AskSearch.jsx` (the `bar` door: a question typed before the panel's chunk loads becomes its seed)
- `continent-app/src/browse/AskSearchFull.jsx` (renders AskBar when `bar`; panel width from the field)
- `continent-app/src/browse/ExploreTab.jsx` (no header portal; the field under FilterChips; `askPlaces` from `listed`)
- `continent-app/src/styles/75-ask.css` (the bar's rules, tokens only)
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (`ask.barPlaceholder`, `ask.seeAnswer`, `ask.sug.compare`, `ask.sug.when`; the "when" phrasing copies each language's `ask.ex.when`, which the parser already reads)

## Commands run

```
git -C continent-app checkout -b p11-ask-bar; git checkout -b p11-ask-bar
npx eslint src/browse/{AskBar,AskSearch,AskSearchFull,ExploreTab}.jsx
npm test                                   # 630 pass, 0 fail
node scripts/ci/design-lint.mjs            # only the pre-existing bagFees.js money-literal
node scripts/ci/token-contrast.mjs         # 0 under the floor
ASK_ROOT=<continent-app> ASK_OUT=<scratch>/dist-t568 npx vite build --config ../../wt/vite.t558.mjs
node scripts/css-routes.mjs --check <scratch>/dist-t568/assets   # 2319 selectors, none overridable
```

## Config and secrets set

None.

## Before/after measurements

Not measured. The task promises no number.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Two brown primaries on screen after an answer ("See answer" in the bar, "Plan this trip" in the panel) | The bar's button was primary whenever the field held text | Primary only for a new, unasked question |
| The panel opened right-aligned and half over the suggestions | `useAnchoredSheet` hung it from the whole bar at 760 px | The ref is the form; the panel takes the field's width, measured on every open path (bar, door seed, requestOpen) |
| design-lint `outline-none` on the input | The visible ring is drawn round the field (`:has(:focus-visible)`) | The input keeps `outline: 2px solid transparent`, which forced-colours mode still draws |

End check, in Chrome at 1280 and about 500 px wide: the bar sits under the chips. The suggestions change with the Island filter. A suggestion asks and opens the answer ("Rome, Venice, side by side."). "/" then a typed question and Enter answers ("3 places match Island, May, ..."). There is no horizontal scroll. The written paragraph shows "did not load" on the dev server because `/api/ask` runs only on Pages; that predates this task.

## What is still open

- T568-a: carta-design's Field rule says a placeholder shows a real example. The owner asked for no example text in this field, so "Type your question" is a neutral prompt. The skill should record this exception, or the owner should name the words. Owner: user.
- T568-b: the Plan start page (`PlanAsk.jsx`) still uses the old trigger with the example placeholder "Plan 7 days in Tuscany for food and wine". Whether it takes the same bar is a separate task. Owner: next task.

## Rollback procedure

`git -C continent-app revert <T568 app commit>` and `git revert <T568 root commit>`. That brings back the header portal and the old trigger. No data or schema is involved.
