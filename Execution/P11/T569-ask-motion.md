# T569: Ask Carta's typed suggestions, the rules changed for them, and the written answer on localhost

## Task ID

T569 (branch `p11-ask-motion`, off `p11-ask-bar`, in the root repo and in `continent-app/`)

## Date

2026-10-22

## What changed

The owner answered T568-a and asked for three things: no placeholder in the Ask Carta bar, rotating or self-typing prompts no longer banned ("I like some animation"), and the written answer working on localhost. The bar now has no placeholder. While it is empty and unfocused it types its four suggested questions out letter by letter (about 45 ms each), holds each for about 1.8 s, erases it (18 ms a letter) and types the next, with a blinking 2 px caret. The hint is `aria-hidden`, because the visible "Ask Carta" label names the field. It stops at once on focus or a typed letter, pauses while the tab is hidden or the bar is out of view (IntersectionObserver), and does not run under reduced motion. The suggestion buttons fade in at `--dur-2` when the list under them changes. The carta-design skill and DESIGN.md now say a placeholder is optional. Both gain an "Ask Carta exception" beside the home page one, so these are the only loops allowed outside the home page. For localhost, Vite's dev server proxies `/api/ask` (dense retrieval) and `/api/ask/answer` (the Workers AI writer) to the Pages preview, which has the AI and KV bindings. `ASK_PROXY` names another deploy. The answer therefore comes from the real model under the same free daily Neurons cap and the same per-address rate limit. Before this task the written answer on localhost always read "The written answer did not load".

## Files touched

**Modified:**
- `continent-app/src/browse/AskBar.jsx` (`useTypedHint`; no placeholder)
- `continent-app/src/styles/75-ask.css` (`.ask-bar-hint`, `.ask-bar-caret`, the suggestions' fade, reduced-motion branches)
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (`ask.barPlaceholder` removed)
- `continent-app/vite.config.js` (`server.proxy['/api/ask']`)
- `.claude/skills/carta-design/SKILL.md` (Field rule; "nothing loops" names the two exceptions; the Ask Carta exception)
- `DESIGN.md` (Field rule; the Ask Carta exception section)
- `Execution/_OPEN.md` (T568-a closed)

## Commands run

```
git -C continent-app checkout -b p11-ask-motion; git checkout -b p11-ask-motion
curl https://preview.carta-app.pages.dev/api/ask?q=...           # 200
curl -X POST -d '{}' https://preview.carta-app.pages.dev/api/ask/answer   # event: error, reason pack (validates)
npx eslint src/browse/AskBar.jsx
npm test                                     # 630 pass, 0 fail
node scripts/ci/design-lint.mjs              # only pre-existing hits (bagFees.js, verify.js), none in touched files
```

## Config and secrets set

`ASK_PROXY` (optional, dev only): the deploy the dev server hands `/api/ask` to. Default `https://preview.carta-app.pages.dev`. No secret.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Written answer on localhost ("Corfu or Santorini") | "did not load" | AI paragraph, 4 sentences, cited, checked | works |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| AskBar.jsx did not parse | A Python edit wrote a real newline into `lines.join('\n')` | The key joins with `'|'` |

End check in Chrome at 1280 px with Island on: the hint read "Corf", "Corfu or Santorini" (held), "", "When is " over 4 s. A suggestion asked through the proxy returned "Corfu is cheaper and has a slightly higher overall score than Santorini." with citations 2, 3 and the "Written by AI ... checked against Carta's figures" line. The page has no horizontal scroll.

## What is still open

- T569-a: the dev proxy points at the preview, which carries branch p11-ask-carta (b7acb178). Once production carries Ask (T565-b), point the default at production, or keep the preview current, so localhost does not answer from an older index. Owner: next task.

## Rollback procedure

`git -C continent-app revert 8482ca7` and `git revert <T569 root commit>`. The second restores the old rule text in the skill and DESIGN.md. No data or schema is involved.
