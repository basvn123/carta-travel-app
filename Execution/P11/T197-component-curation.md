# T197: Curate components by role, not by library

## Task ID

T197 (mind-map number T193; T197 is used everywhere).

## Date

2026-10-02

## What changed

Carta now has a written rule for taking components from outside UI libraries, in `docs/COMPONENT_ROLES.md`. No component was adopted and no app file changed; the session note made this a document task, and the stack makes that the honest outcome rather than a shortcut.

The research document's model is copy-paste ownership: components land as source files you own, with no dependency tree. That holds for the code but not for its assumptions. Every library it names (shadcn/ui, Origin UI, which is now coss ui, Magic UI, Motion Primitives and Aceternity UI) is written for Tailwind, and most also pull in Radix or Base UI primitives and the `motion` package. shadcn/ui's current builds also target React 19 and pass `ref` as a plain prop, which React 18 does not forward. Carta is React 18.3 with five runtime dependencies, one hand-written stylesheet and no Tailwind, and this wave forbids adding a dependency. So in Carta "adopt" can only mean: read the reference component for its markup, keyboard model and ARIA, then write a plain React 18 component styled against the `:root` tokens. The document says that first, so nobody pastes a Tailwind component in and wonders why it renders unstyled.

The role map keeps the research document's split and ties each role to what Carta already has. shadcn/ui is the reference for primitives, where Carta has `Dropdown`, `DateField`, the pickers and `SheetShell` with `useFocusTrap`, but no shared button. Origin UI is the reference for the dense surfaces: the dual range slider in `FilterControls`, the filter sheets and rail, the five admin tables, the receipt. Magic UI is read for the pricing tier layout only, and for bento grids with care, because a bento of boxed tiles breaks carta-design's "lists get hairlines, objects get borders" rule; its shine borders, tickers and marquees are banned outright. Motion Primitives is read for timing and choice of what moves, rebuilt in CSS on transform and opacity under 300 ms, without the `motion` package. Aceternity stays out entirely, and the document maps each of its signature effects onto the numbered carta-design item it breaks (gradients, scattered scroll effects, 3D and glossy surfaces), so the refusal has reasons a maintainer can check rather than a taste call.

The re-skin contract is the part that matters most in six months. It translates a registry's Tailwind defaults into Carta's tokens line by line: neutral scale to the paper and ink ramp, primary to `--accent`, destructive to `--danger` for erasing only, radius to 6 px and 10 to 12 px, shadows to borders or the three `--shadow-*` tokens, ring focus to the accent outline, button heights up to `--tap`, every `dark:` variant deleted because the app is light-only, icons from `Icons.jsx`, strings through the six i18n catalogues, a provenance header with source and licence. The gate is the generic-pattern detector plus DESIGN.md's seven questions.

The detector the task's done condition names is "the T192 detector" in mind-map numbering, which is T196 in `_ORDER.md` ("Put a generic-pattern detector in CI"), not the repo's T192 (hook dependencies). T196 has not been built; `continent-app/scripts/ci/` holds only T157's report-only banned-terms lint. The done condition is therefore met vacuously, because zero components were adopted and so zero had to pass. The document says plainly that a gate over an empty set proves nothing, gives an interim grep checklist, and the register carries a row so the first real lift after T196 is its first real test.

Mapping the roles turned up three things that belong to other tasks, recorded below and in the register.

## Files touched

**Created:**
- docs/COMPONENT_ROLES.md
- Execution/P11/T197-component-curation.md

**Modified:**
- Execution/_OPEN.md (four rows appended)

No file in the app repo (`continent-app/`) was changed. The task had no app worktree; the app was read from the main checkout only.

## Commands run

Reading only, from the main checkout:

```
python Execution/_queue/xmind_prompt.py T196
grep -rl 'aria-modal' --include=*.jsx continent-app/src
grep -rl 'useFocusTrap' --include=*.jsx continent-app/src
grep -oE '^\.[a-z][a-z0-9-]*(btn|button)[a-z0-9-]*' continent-app/src/styles.css | sort -u | wc -l
grep -c '@keyframes' continent-app/src/styles.css
grep -c 'prefers-reduced-motion' continent-app/src/styles.css
grep -rn 'type="range"' --include=*.jsx continent-app/src
grep -rl '<table' --include=*.jsx continent-app/src
```

Two web searches confirmed the current state of shadcn/ui (Tailwind v4 and React 19 builds, `forwardRef` removed) and Origin UI (rebranded coss ui, on Base UI). In the worktree:

```
git add docs/COMPONENT_ROLES.md Execution/P11/T197-component-curation.md Execution/_OPEN.md
git commit
```

## Config and secrets set

None.

## Before/after measurements

The task promises one number: components adopted from outside libraries that pass the detector. The rest of the table is the baseline the document's role map rests on, recorded so a later lift can be measured against it. None of it moves in this task.

| Metric | Before | After | Delta |
|---|---|---|---|
| Components adopted from an outside library | 0 | 0 | 0 |
| Adopted components passing the detector (T196) | n/a, detector not built | n/a, detector not built | none |
| Runtime dependencies in continent-app/package.json | 5 | 5 | 0 |
| Distinct button class families in styles.css | 90 | 90 | 0 |
| `aria-modal` surfaces / of which use `useFocusTrap` | 13 / 8 | 13 / 8 | 0 |
| `@keyframes` / `prefers-reduced-motion` blocks in styles.css | 40 / 44 | 40 / 44 | 0 |

## What broke and how it was fixed

No issues. One naming trap is worth recording: the task's "T192 detector" is the mind map's number. In `_ORDER.md` T192 is the hook-dependency task and the detector is T196. `xmind_prompt.py T196` confirms the mapping.

## What is still open

The detector gate is vacuous until T196 exists. The first task that lifts a component after T196 lands has to run it on that component and report the result; until then the interim grep in `docs/COMPONENT_ROLES.md` stands in. Register T197-a.

`PassModal.jsx` and `planner/AiDayPlanModal.jsx` render `role="dialog" aria-modal="true"` with no `useFocusTrap` and no Escape handler in the component. PRODUCT.md says every `aria-modal` overlay traps focus and closes on Escape. This belongs to T190 (keyboard and map accessibility) or T186 (quality floor). Register T197-b.

The featured pass tier carries a "Most popular" badge (`pass.mostPopular`, in six catalogues). Checkout has never been live, so the claim has nothing behind it, and carta-design item 12 bans fabricated social proof; its plan-card rule asks for a recommended plan instead. Whether to relabel it "Recommended" or drop it is a product call. Register T197-c.

There is no shared button component; 90 class families each restate height, radius and colour. A `Button` primitive, read from shadcn/ui and re-skinned under the contract, is the most useful first lift, and it fits with T191's token work. Register T197-d.

## Rollback procedure

Revert the task's commit on branch p11-component-curation in the root repo (`git revert <hash>`), or do not merge the branch. Nothing in the app repo, the data or any database changed.
