# T126 Image brief and vision-scoring prompt

## Task ID

T126 (mind-map number T125).

## Date

2026-10-02

## What changed

The image brief now exists in two forms that mirror each other. `docs/IMAGE_BRIEF.md` is the human document: per section, what the hero answers and what the gallery answers, the six hard rejects that already stood, and the two new ones (a signpost or trail marker as the subject, and an image taken more than 2 km from the feature unless it is framed as "seen from"). `pipeline/photos/vision_prompt.py` is the same brief as a scoring prompt for a vision model, with a builder, a parser for the reply, and a small code rule for distance.

The one design choice worth knowing is how the 2 km rule is enforced. A model cannot see the distance, it is metadata, so code computes it and hands the figure to the prompt. The model only reports whether the image is explicitly a "seen from" shot. The final reject is made by `apply_distance_rule()`, so a model that ignores the number cannot let a far image through. An unknown distance does not reject, and the result records `distance_known: false` so a later step can tell the check was blind.

The prompt is a new file and not an edit to `relevance.py`. That file is the CLIP veto, a different mechanism from a vision-model prompt, and another session was working in the photo pipeline. Nothing existing imports the new module yet, so there is no behaviour change in any run. Wiring it into scoring is the next task's job.

The spec names a Haiku vision pass. That is the Claude API, which this project may not use. The prompt is model neutral and nothing in it imports an SDK; a Gemini vision model takes it unchanged.

## Files touched

**Modified:**
- Execution/_OPEN.md (register rows appended)

**Created:**
- docs/IMAGE_BRIEF.md
- pipeline/photos/vision_prompt.py
- Execution/P8/T126-image-brief.md

**Deleted:**
- none

## Commands run

python pipeline/photos/vision_prompt.py   (self-test: prompt builds for all five sections, parser clamps and fences, distance rule rejects at 3000 m and passes when seen_from or unknown)

## Config and secrets set

None.

## Before/after measurements

Not measured. The task writes a brief and a prompt; it does not move a number. The accuracy of the prompt against the labelled set is a measurement for the scoring task.

## What broke and how it was fixed

No issues.

## What is still open

The prompt is untested against a real model. Measuring it on the labelled evaluation set (precision on rejects at least 0.95) belongs with the scoring task. The evaluation set is lake-only, so the other four sections have no labels yet and the per-section answers_hero scores cannot be checked until some are added.

The wiring has two decisions in it. Whether a P18 image may be vetoed on the two new rejects is a product call, because P18 is a person stating the image depicts the item. And the caller must supply distance_m from the image and feature coordinates; nothing computes it yet.

## Rollback procedure

Delete docs/IMAGE_BRIEF.md and pipeline/photos/vision_prompt.py, drop the register rows, and revert the commit. Nothing imports the module, so nothing else changes.
