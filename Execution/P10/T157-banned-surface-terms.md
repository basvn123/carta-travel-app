# T157 · Banned surface terms lint

## Task ID

T157

## Date

2026-10-02

## What changed

A new CI lint script `scripts/ci/banned-terms.mjs` was created to enforce the banned-from-the-surface rules in sections 4.3 (carta-destinations-enhancement-spec.md) and C8 (carta-trips-enhancement-spec.md). The script scans all i18n language files (en.js, de.js, fr.js, es.js, it.js, nl.js) read-only and identifies technical terms that must not appear in user-facing text: sac_scale, NUTS3, GLO-30, ODbL, OSM relation, raw OSM tag names (e.g., name:en, type=), and abbreviations like f.g.

The lint identified 10 violations in the current i18n catalog, all found in credit/attribution strings (dest.routesCredit and cycle.sourceNote keys across six language files). These strings reference "Copernicus GLO-30" and "ODbL" as attribution, which according to spec section 4.3 should live only in the collapsed "Where this comes from" footer row, not in surface copy. The script is report-only and does not wire into the build; it exits cleanly on any violations found.

## Files touched

**Created:**
- continent-app/scripts/ci/banned-terms.mjs

**Modified:**
- None

**Deleted:**
- None

## Commands run

```powershell
# From continent-app directory
node scripts/ci/banned-terms.mjs
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Notes |
|---|---|---|---|
| Lint coverage | No automatic check | 7 language files scanned | Identifies banned terms in all i18n strings |
| Violations found | Unknown | 10 | ODbL (6), GLO-30 (4) in attribution strings |

## What broke and how it was fixed

No issues. The script ran cleanly and identified existing violations in the i18n catalog that predate this task. No code was modified, only scanned.

## What is still open

The 10 violations in the i18n strings (all in dest.routesCredit and cycle.sourceNote keys) must be addressed. According to section 4.3 of the spec, ODbL and GLO-30 should appear only in the collapsed "Where this comes from" attribution footer, not in plain surface copy. The next task must either:

1. Move these technical attribution strings to a new collapsed footer section in the detail page template (following the spec's "honest without being in the way" principle), or
2. Rewrite the credit strings in plain language that does not name the technical datasets (e.g., "Elevation from satellite data and open mapping" instead of "Copernicus GLO-30").

The script is ready to run on any future i18n changes to prevent new violations.

## Rollback procedure

Delete `continent-app/scripts/ci/banned-terms.mjs` and revert the commit in the app worktree. The script makes no changes to the app's behavior or data, only adds a read-only linting tool, so no rollback of app state is needed.

```powershell
cd "C:\Users\Gebruiker\Documents\Portfolio\wt\T157-app"
git revert HEAD  # or: git reset --hard HEAD~1
```

---

## Implementation notes

The script uses straightforward regex matching on a list of banned terms plus OSM tag name patterns. It parses i18n files line-by-line to extract string values and checks each one against the banned set. The output groups violations by term and shows context around each match.

The violations found are all in multilingual credit/attribution strings. These strings currently live in the i18n files and are rendered inline in card descriptions; the spec's rule "Provenance and licences live in a collapsed 'Where this comes from' row" suggests they should be moved out of the i18n layer into a separate component that handles technical attribution without cluttering the surface copy.

The script exits with code 0 (success) whether violations are found or not, keeping it report-only and suitable for integration into a CI pipeline once any blocking violations are resolved.
