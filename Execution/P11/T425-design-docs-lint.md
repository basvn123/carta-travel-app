# T425: design docs from the built system, and the migration lint (roadmap 1.2)

## Task ID

T425

## Date

2026-10-13

## What changed

The written design system now describes what ships. DESIGN.md was rewritten in place by the impeccable documenter brief (run in a general-purpose agent, because the harness has no impeccable agent type) into the DESIGN.md format: YAML frontmatter with colours, type, radius, spacing and components; then overview, a new "Where to adjust the style" section for the owner's hand tuning (which file holds what, the live preview at `/?styleguide`, the checks to run after a change), colours, type, layout, elevation, shapes, the kit with variants, states and when to use each, the money rules, do's and don'ts, and a history of what Lagoon retired. Its sidecar `.impeccable/design.json` records the same system for impeccable's tools. The carta-design skill was rewritten for Lagoon (411 lines; closes T419-c). DIRECTION.md and COMPONENT_ROLES.md carry a pointer saying where Lagoon supersedes them. The design lint gained five rules that meter the migration: `raw-button` (767 at baseline), `font-size-literal` (2,269), `radius-literal` (1,074), `legacy-token` (6,145) and `money-literal` (77), with a `--meter [path]` flag that prints what is left per file; the self-test seeds and catches all sixteen rules. `Roadmap/1.2-migration-handoff.md` gives the next session the order, files, recipe and traps for T426 to T435. The segmented control met the 44 px touch floor and the radius scale, two defects the documenter found.

## Files touched

**Modified (root):**
- DESIGN.md (rewritten in place)
- .claude/skills/carta-design/SKILL.md (rewritten)
- docs/design-v6/DIRECTION.md, docs/COMPONENT_ROLES.md (Lagoon pointers)
- Execution/_OPEN.md (T419-c and T423-d closed; rows T425-a to T425-e)

**Created (root):**
- .impeccable/design.json (force-added; the folder is otherwise impeccable's gitignored working space)
- Roadmap/1.2-migration-handoff.md
- Execution/P11/T425-design-docs-lint.md

**Modified (app, mirrored in root):**
- continent-app/scripts/ci/design-lint.mjs (five rules, the meter)
- continent-app/scripts/ci/design-lint.baseline.json (10,473 known, by rule)
- continent-app/scripts/ci/fixtures/design-lint/good/src/clean.css (roles instead of legacy names)
- continent-app/src/styles/04-ui.css (segmented: --tap on touch, --radius-sm)

**Created (app):**
- continent-app/scripts/ci/fixtures/design-lint/bad/src/t425.jsx, bad/src/styles/t425.css (seeded violations)

## Commands run

```
node scripts/ci/design-lint.mjs --self-test       (18 seeded violations across 16 rules, clean fixture silent)
node scripts/ci/design-lint.mjs --update-baseline (10,473)
node scripts/ci/design-lint.mjs --meter
node scripts/ci/token-contrast.mjs                (29 pairs, 0 under)
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| impeccable doctor: DESIGN.md has no colors, typography section | reported | resolved (frontmatter and sections in the DESIGN.md format) |
| Design docs describing the shipped look | DESIGN.md partly, skill not at all | DESIGN.md, design.json, skill, pointers in DIRECTION and COMPONENT_ROLES |
| Lint rules | 11 | 16 |
| Migration meter at baseline | none | 767 raw buttons, 2,269 font sizes, 1,074 radii, 6,145 legacy token reads, 77 money literals |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Two lint regexes lost their `\b` | A shell heredoc turned `\b` into a backspace byte | Byte-level replace from a script file |
| The clean fixture would trip the new legacy-token rule | It used `--accent`, `--bg-card`, `--mono` | Moved to `--action`, `--surface`, `--font` |
| The documenter saw 9,565 "new" violations | It ran before the baseline was written | Baseline written; 0 new |

## What is still open

T425-a: the skill rewrite made a call the owner should confirm: the cheapest pin in view becomes the best-value sun marker instead of teal (the code still draws it teal). T425-b: the receipt footer tint was `--accent-bg`, now the same teal tint as selection; the receipt migration picks a distinct quiet tint. T425-c: the kit's positive status chip (green tint, green text) sits against the T380 "status, not green" rule; the skill scopes it to a short data label, and the owner may prefer ink plus a dot. T425-d: `02-base.css` still sets body type with literals and reads legacy names; the shell migration moves it onto roles. T425-e: the per-surface migration T426 to T435 runs in another session from `Roadmap/1.2-migration-handoff.md`.

## Rollback procedure

Revert the T425 commits in both repos. The lint baseline then returns to the 141-entry version, and the docs to their T421 text.
