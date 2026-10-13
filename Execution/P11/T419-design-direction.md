# T419: the new visual direction (roadmap 1.2)

## Task ID

T419

## Date

2026-10-13

## What changed

Carta has a chosen visual direction, recorded as an impeccable direction contract in `continent-app/.impeccable/surfaces/continent-app.md` and as a brand commitment in PRODUCT.md. The round ran on impeccable's decision page in three hands. The first, seeded (key b1a9897d, Operate mode), assigned "Field spec" (outdoor gear spec sheets) with "Platform" (rail passenger information) as impeccable's pick and six catalogue challengers (one competitive, five declined with named raises); the owner re-rolled toward safer with the steer "modern professional, simple, super clear, really dynamic, look at my other portfolio projects". The second hand (Waymark, Price tag, Survey sheet) took the discipline of the owner's Vitals project (one family with a width axis, blue-grey ink never black, status colour with a word, flat fields, no shadows); the owner re-rolled again: "look at planning apps and the web, it must suit a travel app, image friendly". After two re-rolls the owner named the references (Airbnb, Polarsteps, Wanderlog) and what was missing (a real app, warmer, premium polish, photography first). The third hand rendered the category standard at that craft level in three colourways, and the owner chose "Lagoon": white surfaces on a warm light grey, blue-grey ink, deep lagoon teal for actions and selection as a light tint, sun yellow for best value, one friendly sans, photo cards at 16 px corners, list and map side by side on desktop, trips as a timeline of days. T417-b is closed: impeccable reads PRODUCT.md and DESIGN.md when run from the repo root without a target inside `continent-app`, and the app-wide surface brief is addressed with the target `continent-app`.

## Files touched

**Modified:**
- PRODUCT.md (new section "Visual brand commitment")
- Execution/_OPEN.md (T417-b closed; rows T419-a to T419-c)

**Created:**
- Execution/P11/T419-design-direction.md
- continent-app/.impeccable/surfaces/continent-app.md (app repo)

Outside git: decision payloads in `.impeccable/decision/direction-r1.json` to `-r3.json` (gitignored).

## Commands run

```
impeccable context                                   (from the repo root, no target)
impeccable concept-seed --scope direction --mode operate
impeccable serve-question --start --payload .impeccable/decision/direction-r1.json
impeccable serve-question --wait --key 1e53b828      (three rounds)
impeccable concept-seed --scope direction --mode operate --from b1a9897d --reroll 1 --register safer
impeccable serve-question --update --key 1e53b828 --payload .impeccable/decision/direction-r2.json, then -r3.json
impeccable concept-seed --kind canon --from b1a9897d --scope direction --mode operate --register safer
impeccable surface-brief write continent-app <body>
```

## Config and secrets set

None. A trial `.impeccable/config.json` with `projectRoots` was written and removed; it did not change how a target inside the nested repo resolves.

## Before/after measurements

Not measured; a direction decision.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `impeccable context --target continent-app/...` finds no PRODUCT.md | `continent-app` is its own git repo, and discovery stops at the git root; `projectRoots` does not cross it | Run impeccable from the repo root without a target; brief targets use `continent-app` |
| `serve-question --start` piped into `tail` hung | The daemon kept the stdout pipe open | Read the URL from `.impeccable/questions/<key>.state.json` |
| No comps on the decision page | No image generation in this session | Code-led round: each card carried a wireframe of the Explore phone screen |

## What is still open

T419-a: figures in Lagoon are the sans with tabular figures, while PRODUCT.md (Accessibility, Numbers) says prices are set in `--mono`; the owner decides before T420 whether the separate mono face stays. T419-b: `impeccable doctor` reports PRODUCT.md as an older product-record schema (no Positioning, Operating Context, Evidence on Hand, Product Principles sections) and offers `init`, an interview that fills the gaps; the owner decides whether to run it. T419-c: the carta-design skill and DESIGN.md still describe the cream, Fraunces and terracotta world; T424 rewrites both from the built system, and until then the direction contract and PRODUCT.md's new section win where they disagree.

## Rollback procedure

Revert the T419 commits in both repos (root: PRODUCT.md, report, register; `continent-app`: the surface brief). No code depends on them yet.
