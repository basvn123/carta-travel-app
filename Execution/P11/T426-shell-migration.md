# T426: the app shell on the Lagoon kit (roadmap 1.2 migration, surface 1 of 9)

## Task ID

T426

## Date

2026-10-13

## What changed

The shell is the first surface moved onto the Lagoon kit and roles. Seven of the twelve raw buttons in the shell components now come from the kit. In the header, "Get a pass" and Friends are kit secondaries (`Button` size sm). Friends shows the selected tint while its panel is open, and "Get a pass" reads the same on every width instead of swapping between two labels. The phone plus is a kit `IconButton` on the surface tone: a white disc with one border edge, which settles T422-c. The sheet close is a kit `IconButton`. In the settings line, the dates popover's "Leave / Return" pair is the kit `Segmented` with its lifted thumb, "Use Carta's dates" is a kit secondary, and the language list is six kit filter chips with a tick on the chosen one.

The three shell stylesheets (`10-shell.css`, `60-v6-shell.css`, `02-base.css`) now meter zero: no pre-Lagoon token names, no font-size literals and no radius literals. The CSS changed in three ways:

- **Role renames.** Every legacy name was renamed to its role. The renames hold the same values, so these lines look the same as before.
- **Corrections a rename would have got wrong.**
  - Popovers, the drive prompt and the bottom bar sat on the page grey (`--paper`). They now sit on `--surface`.
  - Floating objects that carried both a border and a shadow keep only the shadow: the origin, settings and map-guide popovers, the plan chooser and the drive prompt.
  - The dialog family moved to `--radius-sheet` and `--elev-3`, the phone Lifestyle sheet included. Closes are round.
  - Focus rings read `--focus`.
  - The plan-in-progress dot had gone white on the new light tint, so it was invisible on the active desktop tab. It now takes `--select-ink` there.
  - The map guide's dark-filled dismiss is a secondary, and its pill is a quiet surface pill.
  - The selected origin uses the one selected state.
  - The origin search field is 16 px so iOS does not zoom.
- **Type moved onto the scale.** Body type in `02-base.css` reads `--text-body` and `--leading-body`, which closes T425-d. Literal sizes moved to the nearest step. The bottom nav labels and the My trips count were the visible changes: from 10.5 to 11 px and from 11 to 12 px.

Five buttons stay raw by decision, set out under "What is still open".

## Files touched

**Modified (app, mirrored in root):**
- continent-app/src/components/AppHeader.jsx (pass and friends on the kit Button)
- continent-app/src/components/BottomNav.jsx (plus on the kit IconButton)
- continent-app/src/components/SettingsLine.jsx (Segmented, Button, Chip in the popovers)
- continent-app/src/browse/SheetShell.jsx (close on the kit IconButton)
- continent-app/src/styles/02-base.css (body type and focus on roles)
- continent-app/src/styles/10-shell.css (roles, scales, popovers on surface, plus rule trimmed to the kit)
- continent-app/src/styles/60-v6-shell.css (roles, scales, dialog family on sheet radius and elev-3, settings popovers rewritten for the kit, T426 block for the header buttons)
- continent-app/scripts/ci/design-lint.baseline.json (shrunk)

**Modified (root):**
- Execution/_OPEN.md (T422-c and T425-d closed; rows T426-a to T426-e)

**Created (root):**
- Execution/P11/T426-shell-migration.md

## Commands run

```
node scripts/ci/design-lint.mjs --meter <file>      (before and after, per shell file)
node <scratchpad>/mig.mjs  10-shell 60-v6-shell 02-base   (legacy name to role, px size to --text-*, px radius to --radius-*)
node <scratchpad>/fix10.mjs, fix60.mjs                    (hand corrections listed above)
node scripts/ci/design-lint.mjs                     (0 new)
node scripts/ci/design-lint.mjs --update-baseline
node scripts/ci/design-lint.mjs --self-test         (18 seeded violations across 16 rules, clean fixture silent)
node scripts/ci/token-contrast.mjs                  (29 pairs, 0 under)
npx vite build && npx vite preview --port 5231 --strictPort
node <scratchpad>/shots.mjs                         (390 x 844 touch and 1440 x 900, English and German: base, dates popover, language popover, plus chooser)
node scripts/verify_quality_floor.mjs t426 --port=5231 --only=explore
```

The migration and screenshot scripts lived in the session scratchpad and are not committed.

## Config and secrets set

None.

## Before/after measurements

Meter (`design-lint.mjs --meter`) over the shell files: AppHeader, BottomNav, SettingsLine, SheetShell, 02-base, 10-shell, 60-v6-shell.

| Metric | Before | After | Delta |
|---|---|---|---|
| Raw buttons | 12 | 5 | -7 |
| Font-size literals | 48 | 0 | -48 |
| Radius literals | 32 | 0 | -32 |
| Legacy token reads | 187 | 0 | -187 |
| Whole app: raw buttons, font sizes, radii, legacy reads | 767, 2,269, 1,074, 6,145 (T425) | 760, 2,221, 1,041, 5,958 | -7, -48, -33, -187 |
| Lint baseline total | 10,473 | 10,198 | -275, 0 new |

The quality-floor audit was run on the Explore screens, where the shell is seen: 5 phone screens at 380 x 800 and 4 desktop screens at 1280 x 850. Every floor check passes: no horizontal scroll, one h1 on each screen, at most one filled primary, no phone target under 44 px, no contrast failure, no motion under reduced motion. Desktop targets under 44 px (360) are reported for information only, pending owner rows T193-b and T335-b. There is no before run of this audit for comparison: the T418 baseline used impeccable's audit, not this one.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The state dot on the active desktop tab was invisible | It was `--on-fill` (white) from the dark-fill era, and the active tab is now the light tint | `--select-ink` |
| `02-base.css` turned LF | `sed -i` in Git Bash (known trap) | Rewritten as CRLF with node, edits re-applied |
| A bash heredoc failed on quotes | Shell quoting | Script written to the scratchpad with the file tool |
| Port 5206 in use | Another process holds it | Preview on 5231 |

## What is still open

- **T426-a, owner.** Five buttons stay raw: the header's My trips and account avatar, the bottom nav's My trips and Account, and the settings-line part. Each is a door in a navigation bar or a settings-line part, and the kit has no fitting piece. A kit Button would give them a button's look, which the Navigation and Settings line rules do not ask for. The two choices are:
  - The kit gains a `NavItem`: a link or a toggle with `aria-current` and the nav look.
  - My trips and Account get their own URL and become links, as the navigation rule asks of anything that changes the view. That second choice touches App.jsx and urlState.

  This is a design call without a written rule, so it is left to the owner.
- **T426-b.** The old `.header-pricing-btn`, `.header-pricing-label*` and `.header-friends-btn` rules in 16-auth, 23-places-pages, 24-destination-workspace and 26-shortlist-extras no longer match anything. Delete them in those surfaces' migrations (T428, T429, T434), because the files are outside this task.
- **T426-c.** `10-shell.css` still carries Explore's rules: the origin picker, the map guide, the kind rail and the drive prompt. They are on roles now, but their JSX (OriginPicker, MapGuide, the drive prompt) still draws raw buttons. T427 migrates that JSX and moves those rules to Explore's own lazy CSS.
- **T426-d.** The Explore List/Map toggle floating over the list is a dark-filled segmented control: an ink slab with white text, seen in every phone shot. It belongs to T427.
- **T426-e, owner.** No 1.3a sketch existed, so the shell followed the carta-design skill. The pre-Lagoon shell brief (T370) was used for behaviour only. The owner checks the shell on a phone against the 1.3a sketch when it is made.

## Rollback procedure

Revert the T426 commits in both repos: app repo `master` and root `main`, which mirrors `continent-app`. No data, schema or config changed. The lint baseline returns with the revert.
