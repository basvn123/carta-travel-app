# T161: Suitability strip pinned under the hero

## Task ID

T161 (mind-map number T165)

## Date

2026-10-03

## What changed

Nothing was built. The session gate for this task said the strip may only be built if the carta-design skill or DESIGN.md already has a written rule for it, and neither does. The task therefore stops at a proposed rule, recorded as an owner row in the register, and this report carries the reasoning. No app code, CSS or strings were touched, and the continent-app worktree was not used.

## Why the gate did not pass

The spec (Trips/carta-trips-enhancement-spec.md, C1) asks for a semi-transparent strip over the lower third of the hero with exactly three values: a difficulty meter, a style of one or two words, and the total cost in mono. Each part of that collides with a gap or a ban in the written design.

First, the strip is a translucent fill laid over a photograph. DESIGN.md defines opaque tokens only. Its alpha values exist solely inside the three shadows. The skill bans gradients "of any kind" and DESIGN.md says there is no gradient in the product, and the usual way to make text over a photo legible is a scrim, which is a gradient. No document says whether translucency is allowed, what colour or alpha it may use, or how text contrast is guaranteed when the photo underneath is unknown. The 4.5:1 floor cannot be proven against an arbitrary image.

Second, there is no difficulty meter in either document. The only meter-like device is the ochre rating fill (`--rate`), which is reserved for ratings and "never for actions". Whether difficulty may reuse it, or needs its own shape, is a design decision nobody has written down.

Third, the skill's rule on text over photography is silent. It says no AI photographs and licensed imagery only, but not where text may sit on one.

Under CLAUDE.md, a design question without a written rule goes to a separate task instead of being decided inside this one. The skill was rewritten by T325 and DESIGN.md was checked; neither covers the case.

## Proposed rule (for the owner to accept, change or refuse)

A suitability strip is allowed on a hero image under these conditions. It is a solid `--paper` fill at full opacity, not a translucent one, so contrast is a fixed 4.5:1 or better regardless of the photo. It sits flush against the bottom edge of the hero, not floating over the lower third, and is square to the hero's width with `--radius` of zero at the top corners. This departs from the spec's "semi-transparent" and "over the lower third" wording on purpose: the product has no alpha fill and no gradient, and a solid band under the photo keeps both bans intact while still being visible before any scroll. It carries exactly three values in fixed order: difficulty, style, total cost. Difficulty is drawn as five small squares, filled in `--ink` up to the level and outlined in `--ink-mute` beyond it, never in `--rate` or `--accent`, with the level also written as a word for screen readers. Style is one or two words from tags in the body face. Total cost is in the mono face with the currency, using the same euros-a-day or total formatting the rest of the trip page uses. On a phone it stays one row of three cells. A trip with no value for any of the three shows an em-dash-free placeholder word, "Unrated", "Mixed" or "Price on request", so the count stays three on every trip.

If the owner prefers a true translucent overlay as the spec says, the rule instead needs a named token (for example `--paper-glass` at a stated alpha), a stated minimum photo-darkness guarantee or a backdrop-blur allowance, and an explicit exception to the no-gradient rule. That is a larger change to DESIGN.md and is not proposed here.

## Files touched

**Created:**
- Execution/P10/T161-suitability-strip.md

**Modified:**
- Execution/_OPEN.md (two rows appended)

**Deleted:** none.

## Commands run

Read-only checks of the skill, DESIGN.md, PRODUCT.md and the spec with grep and sed, then the report and register rows written in the root worktree wt\T161 on branch p10-c1-suitability-strip.

## Config and secrets set

None.

## Before/after measurements

Not measured. The done condition (three values on every trip) belongs to the build, which did not happen.

## What broke and how it was fixed

No issues.

## What is still open

The owner must decide the rule above (T161-a). Once it is written into DESIGN.md and the skill, the build is a small task: one component on the trip page hero, reading difficulty, tags and total cost from the existing trip record, plus a check that every one of the 253 curated trips renders exactly three values. That is T161-b. The block on the strip is the rule only; the spec's other C-items are unaffected.

## Rollback procedure

Revert the single commit on p10-c1-suitability-strip, or delete the branch. No code, data or schema changed.
