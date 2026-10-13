# T417: design system plan (roadmap 1.2)

## Task ID

T417

## Date

2026-10-13

## What changed

The owner's roadmap now lives in the repo at `Roadmap/Carta roadmap.md`, and the plan for roadmap item 1.2 (one design system) is written next to it in `Roadmap/1.2-design-system-plan.md`. The plan rests on a measured inventory of the app as it is today: about 230 distinct button styles (the roadmap's "89" counted class families with "btn" in the name), 22 of 773 buttons going through the shared `Button`, 52 font sizes, 48 radii, 16 percent of spacing on tokens, about 40 card components, 12 money helpers and 5 estimate notations. It also explains why the app reads as black: the selected state is slate `--ink-fill` on 142 rules and about 90 older rules fill controls in near-black `--ink`. Three owner decisions were taken in this session: a new visual world through impeccable's direction round rather than a refinement; whole euros on cards and cents on receipts, with symbol placement following the locale; and the roadmap folder on main. The plan sets out three token layers with a compatibility layer, so the re-skin lands in one revertible commit, a component kit in `src/components/ui/`, one `formatMoney` and `<Money>`, a `?styleguide` page as the "one place", new design-lint rules, and the task sequence T418 to T425 onward with owner checkpoints. No app code changed.

## Files touched

**Created:**
- Roadmap/Carta roadmap.md (copy of the owner's roadmap export of 2026-10-13; two middots replaced by commas under the house rule)
- Roadmap/1.2-design-system-plan.md
- Execution/P11/T417-design-system-plan.md

**Modified:**
- Execution/_OPEN.md (rows T417-a to T417-c)

## Commands run

```
git switch -c p11-design-system-plan
mkdir -p Roadmap
cp "C:/Users/Gebruiker/Downloads/Carta roadmap (2).md" "Roadmap/Carta roadmap.md"
sh C:/Users/Gebruiker/.claude/skills/impeccable/scripts/impeccable context --target continent-app/src/styles.css
sh C:/Users/Gebruiker/.claude/skills/impeccable/scripts/impeccable detect --json src   (in continent-app; returned [])
```

The inventory itself was read-only grep and regex passes over `continent-app/src`.

## Config and secrets set

None.

## Before/after measurements

Not measured; this is a plan. The baseline it records (section 1 of the plan) is the "before" that T418 confirms on the running app and the final task of 1.2 measures against.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `impeccable context` found no PRODUCT.md or DESIGN.md | It resolves the project root to `continent-app/`, its own git repo, while both files sit at the repo root | Read directly this session; a lasting fix is T417-b |
| Static `impeccable detect` over `src` returned no findings | The detector reads rendered pages and HTML; JSX plus a 44k-line stylesheet gives it nothing to judge | Run it by URL against the dev server in T418 |

## What is still open

T417-a: the owner approves or corrects the plan before T418 starts. T417-b: impeccable's context loader cannot see the root PRODUCT.md and DESIGN.md from `continent-app/`; T419 must make it load them before the direction round, or every impeccable command runs without product truth. T417-c: the estimate notation (one of the five in use) is chosen in T418 from the audit, so `formatMoney` has one form to enforce. The untracked `impeccable/` folder at the repo root duplicates `.claude/skills/impeccable/` and was left alone; the owner decides whether it stays.

## Rollback procedure

`git switch main && git branch -D p11-design-system-plan`. Nothing outside this branch changed.
