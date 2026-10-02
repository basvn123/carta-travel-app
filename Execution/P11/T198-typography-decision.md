# T198: Decide the typography conflict, explicitly

## Task ID

T198 (mind-map number T194). Branch p11-typography-decision in both repos.

## Date

2026-10-02

## What changed

Carta's type is now a written decision rather than three documents that disagree. DESIGN.md carries one paragraph under Type: Fraunces for display, Plus Jakarta Sans for everything else, JetBrains Mono for measured facts, always through the tokens `--display`, `--ui` and `--mono` and never by name. Cormorant Garamond (the research note), Instrument Sans and IBM Plex Mono (the carta-design skill body) are rejected by name. The design lint enforces it with a ninth rule, `font-literal`.

The three sources and what each said. `additional docs/Carta/Plan/Frontend Design/Frontend Design Tools Research.md` (lines 87 to 89 and 131 to 133) recommends Cormorant Garamond as a display serif with Plus Jakarta Sans for operational data. `.claude/skills/carta-design/SKILL.md` teaches Instrument Sans and IBM Plex Mono (lines 86 and 87), says "No serif face anywhere" (line 101) and lists a serif display face as the second thing never to do (line 187), while its own banner of 2026-07-28 (lines 8 to 12) says the shipped app runs Fraunces, Plus Jakarta and JetBrains Mono. `Trips/carta-trips-enhancement-spec.md` section G4 (line 158) repeats "no serif face" and says the design system wins. `continent-app/src/styles.css` lines 87 to 89 define the three tokens with Fraunces, Plus Jakarta Sans and JetBrains Mono, and DESIGN.md (T195) already recorded them.

The decision is the shipped state, for three reasons written into DESIGN.md. Every planner, PDF template and map label is already set in these three faces, so any other pick is a repaint with no product reason behind it. Fraunces at display sizes is the one serif the app uses, in the one role where a serif carries the destination-name voice without turning the page into a brochure; the skill's "no serif anywhere" line was written against the cream-and-clay homepage that was reverted, not against Fraunces. Plus Jakarta Sans is the only face all three sources agree on. The research note's suggestion is therefore closed, and the skill body's type section is retired; T325 rewrites that body (register row T195-a already points there and stays open).

How the lint enforces it. `scripts/ci/design-lint.mjs` scans every `.css`, `.js`, `.jsx` and `.mjs` file under `src`. For every line with a `font-family:` or JSX `fontFamily:` declaration it takes the value, strips a trailing `!important` and surrounding quotes, and requires it to be exactly `var(--display)`, `var(--ui)`, `var(--mono)` or `inherit`. Anything else, a quoted face, a generic family, a different variable, is a `font-literal` violation with the offending value as the detail. Inside the `:root` block of a stylesheet a second check fires when any custom property other than `--display`, `--ui` or `--mono` names a typeface (a quoted family followed by a comma, or a generic keyword such as `serif` or `system-ui`), so the research note's `--font-display: "Cormorant Garamond", serif` cannot enter through a new token either. The check runs in JavaScript too because the PDF and export templates carry their own stylesheets as strings, and that is where a stray face would otherwise hide.

The fixtures prove it. `fixtures/design-lint/bad` now seeds a `:root { --font-display: "Cormorant Garamond", serif; }`, a `font-family: 'Cormorant Garamond', serif` and a JSX `fontFamily: 'Instrument Sans, sans-serif'`; `fixtures/design-lint/good` gains a `:root` with the three real tokens and rules that use `var(--display)`, `var(--mono)` and `inherit`. The self-test requires all nine rules to fire on bad and nothing on good. The baseline grew by exactly one key: `src/lib/tripExport.js` line 187, a print stylesheet that sets `'Segoe UI', system-ui, ...` for the exported trip HTML. It is recorded as known debt (row T198-b), not fixed here, because that file is outside this task's scope.

Two things the read turned up and left alone. `continent-app/index.html` line 42 still requests Instrument Sans and IBM Plex Mono from Google Fonts alongside the three faces in use; nothing in `src` references them, so they are dead weight on every first paint. T199 (self-host fonts) owns the font request and should drop them (row T198-a). The workflow `.github/workflows/design-lint.yml` needed no change: it runs the self-test and then the lint, and both commands are unchanged.

## Files touched

Modified, in the app repo (continent-app):
- scripts/ci/design-lint.mjs
- scripts/ci/design-lint.baseline.json
- scripts/ci/fixtures/design-lint/bad/src/seeded.css
- scripts/ci/fixtures/design-lint/bad/src/seeded.js
- scripts/ci/fixtures/design-lint/good/src/clean.css

Modified, in the root repo:
- DESIGN.md
- Execution/_OPEN.md

Created, in the root repo:
- Execution/P11/T198-typography-decision.md

Read only: continent-app/src/styles.css, continent-app/index.html, the research note, the trips spec, the carta-design skill, Execution/P11/T196-design-lint-in-ci.md.

## Commands run

From the app worktree (wt/T198-app, branch p11-typography-decision from master):

```
node scripts/ci/design-lint.mjs --self-test
node scripts/ci/design-lint.mjs --root scripts/ci/fixtures/design-lint/bad --baseline scripts/ci/fixtures/design-lint/empty-baseline.json
node scripts/ci/design-lint.mjs
node scripts/ci/design-lint.mjs --update-baseline
node scripts/ci/design-lint.mjs
git diff scripts/ci/design-lint.baseline.json
```

The third command exited 1 with one new violation (tripExport.js:187); the fourth wrote the baseline; the fifth exited 0 with 551 found, 551 in the baseline, 0 new. The diff of the baseline shows one added key and the total 550 to 551, nothing else.

The wave row lists this task as root only, but the linter lives in the app repo, so the app worktree was created by hand with `git -C continent-app worktree add wt/T198-app -b p11-typography-decision master` (no node_modules junction and no public data were needed: the lint has no dependencies and no dev server ran).

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Design lint rules (design-lint.mjs self-test list) | 8 | 9 | +1 |
| Seeded violations caught by the self-test | 8 | 11 | +3 |
| Baseline total (design-lint.baseline.json) | 550 | 551 | +1 |
| font-family declarations in continent-app/src (grep `font-family\s*:`) | 706 | 706 | 0 |
| Of those not set through a type token | 1 | 1 (baselined) | 0 |
| Documents giving a different display face | 3 (research, skill body, DESIGN.md) | 1 decision in DESIGN.md | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The seeded `:root { --font-display: ... }` did not fire | The token check was anchored to the start of the line, and the one-line fixture puts the property after the brace | The match now starts at line start, `{` or `;` |
| styles.css line 4022 `font-family: var(--mono) !important` was flagged | The value test did not allow the suffix | `!important` is stripped before the token test |

## What is still open

Two rows. T198-a: index.html still loads Instrument Sans and IBM Plex Mono from Google Fonts, which the decision rejects and no stylesheet uses; T199 drops them when it self-hosts the fonts. T198-b: tripExport.js line 187 sets a Segoe UI stack in the exported trip's print stylesheet; it is in the baseline and should move to the tokens (or declare the three faces it can embed) when that file is next touched, after which the baseline is regenerated smaller. T195-a stays open as before: T325 rewrites the carta-design skill body and its tokens.css to this decision.

## Rollback procedure

Revert the app commit on p11-typography-decision (the lint, baseline and fixtures return to the T196 state) and the root commit (DESIGN.md loses the decision paragraph, the report and the two register rows). Nothing else depends on either.
