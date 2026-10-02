# T196: Put a generic-pattern detector in CI

## Task ID

T196 (mind-map number T192). Branch p11-design-lint in both repos.

## Date

2026-10-02

## What changed

There is now a design lint that runs in CI and fails when a change adds one of the generic patterns carta-design and DESIGN.md ban. It is continent-app/scripts/ci/design-lint.mjs, run by a new workflow, .github/workflows/design-lint.yml, modelled on trip-validator.yml. It is not part of npm run ci, and no existing workflow or package.json script was touched.

The detector checks eight rules with plain line and block scans, no browser: a hex colour in a stylesheet outside the :root block, any gradient, a box-shadow or text-shadow that is not a --shadow token, a rule that sets outline none or 0 without a border-color or box-shadow in the same block, an em dash anywhere in src, a middot anywhere in src, a carta-design banned word (seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy) in src/i18n/en.js, and marquee or parallax in any source file. These come from the "never do this" list, the copy rules, the quality floor and the DESIGN.md token rules. Rules that cannot be decided by a text scan (three stat counters as a hero, numbered 01/02/03 markers, pastel tiles behind icons, AI photography, one primary button per view) are not covered and stay a review matter. The skill's older colour and type rules (cool greys only, no serif, no terracotta) are superseded by its own banner and DESIGN.md, so they are deliberately not enforced.

styles.css already holds hundreds of old violations, so the lint is baseline based. design-lint.baseline.json stores, for every rule, file and trimmed line text, how many times it occurs today. A run fails only when a key occurs more often than the baseline allows. Keying on line text rather than line number means moving code never trips it, while editing a line into a violation, or copying a violating line, does. Fixing old violations never fails the run; after a clean-up, run node scripts/ci/design-lint.mjs --update-baseline to shrink the baseline. The baseline must never be regenerated to admit new violations.

The done condition is proved with a fixture, not with src. scripts/ci/fixtures/design-lint/bad holds one seeded violation per rule, and good holds a compliant stylesheet that uses tokens, a focus-visible outline, and an outline none with a border-color replacement. node scripts/ci/design-lint.mjs --self-test requires every rule to fire on bad and nothing to fire on good, and exits 1 otherwise. The workflow runs the self-test first, so a green lint step cannot mean a broken detector. Run against bad with an empty baseline, the lint exits 1 and prints file, line and rule for each hit.

## Files touched

Created, in the app repo (continent-app):
- scripts/ci/design-lint.mjs
- scripts/ci/design-lint.baseline.json
- scripts/ci/fixtures/design-lint/empty-baseline.json
- scripts/ci/fixtures/design-lint/bad/src/seeded.css, seeded.js, i18n/en.js
- scripts/ci/fixtures/design-lint/good/src/clean.css

Created, in the root repo:
- .github/workflows/design-lint.yml
- Execution/P11/T196-design-lint-in-ci.md
- rows appended to Execution/_OPEN.md

## Commands run

From continent-app in the T196-app worktree: node scripts/ci/design-lint.mjs --self-test, then node scripts/ci/design-lint.mjs --update-baseline, then node scripts/ci/design-lint.mjs (0 new), then the same script with --root scripts/ci/fixtures/design-lint/bad --baseline scripts/ci/fixtures/design-lint/empty-baseline.json (exit 1).

## Config and secrets set

None. The workflow uses actions/checkout with a sparse checkout of continent-app/src and continent-app/scripts/ci, and setup-node 20. It triggers on push to main, pull requests and manual dispatch, filtered to src, the lint files and itself.

## Before/after measurements

Before, nothing checked these patterns. After, the baseline records the known debt, taken from design-lint.baseline.json (byRule).

| Rule | Known violations in src |
|---|---|
| hex-literal | 344 |
| shadow-literal | 129 |
| gradient | 24 |
| middot | 16 |
| outline-none | 14 |
| banned-word | 12 |
| em-dash | 11 |
| motion-effect | 0 |
| Total | 550 |

The 344 hex count is lower than the 378 quoted in row T195-b because this lint ignores hex inside comments and url() values; the two counts are different measures of the same debt. The self-test seeds 8 violations across 8 rules and catches all 8.

## What broke and how it was fixed

The outline rule first missed a one-line block such as .btn:focus { outline: none; }, because block text was only collected from the line after the opening brace. The scan now accumulates characters after the brace on the same line.

## What is still open

Four things. The 550 baselined violations are real debt and should be paid down by the component lifts; T197-a waits for the first lift, and after it the baseline should be regenerated smaller. Hex literals inside JavaScript (map paint colours, inline styles) are not scanned, since MapLibre cannot take a CSS variable, so a JS colour policy would be a separate decision. The rules that need judgement (stat counters, numbered markers, icon tiles, one primary per view) have no detector. Finally, the workflow has never run on GitHub: main is unpushed, and a sparse checkout of the nested app files assumes continent-app is tracked in the root repo as the other workflows do.

## Rollback procedure

Delete .github/workflows/design-lint.yml in the root repo, and delete scripts/ci/design-lint.mjs, scripts/ci/design-lint.baseline.json and scripts/ci/fixtures/design-lint in the app repo, or revert the two T196 commits. Nothing else depends on them.
