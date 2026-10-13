# The image brief

What a Carta photograph is for, per section, and what is refused outright. This is the one statement that every selection and scoring step reads. The vision-scoring prompt in `pipeline/photos/vision_prompt.py` is this document turned into text for a model, and the two must change together. Source: carta-destinations-enhancement-spec.md, part 2.1.

## The rule

Every image answers "what will I see", not "what does it look like". A photograph of a mountain is not the view from that mountain. A photograph of a trail sign is not what you see at kilometre 6. The second kind is what makes someone want to go, so it is the kind we score for.

## What the hero and the gallery answer

The hero is the one image on the card and at the top of the page. The gallery answers the complementary question, so the two never repeat each other.

| Section | The hero answers | The gallery answers |
| --- | --- | --- |
| Mountains | What you see from the summit | What the mountain looks like from the valley, the hut, the last 100 m |
| Trails | The best viewpoint on the route, looking outward | Three named moments along the way, in walking order |
| Cycling | The surface under the tyre with the landscape beyond | The two or three named features the route passes |
| Beaches | The beach along its length from water level, so the entry and the sand can be read | The view from the beach outward, and the walk down to it |
| Lakes | The shore looking across the water, so the colour and the far side are visible | The swimming entry, the shore path, the view from above |

Two cases need a sentence each. A mountain card may still use the mountain's own profile from a distance when no summit view exists, but that image is then a gallery image, not the hero. A cycling photograph whose road surface contradicts the route data (tarmac on a route that is mostly gravel) is worse than none, so the surface in frame must be plausible for the route.

## Hard rejects

An image with any of these as its main subject is refused whatever else it shows, and no section can waive them.

1. Animals or plants in close-up.
2. Vehicles.
3. Interiors.
4. Maps and diagrams.
5. Satellite or aerial-map imagery.
6. Identifiable people as the main subject.
7. A signpost or trail marker as the subject. A sign visible at the edge of a good view is fine; a sign that the photograph is about is not.
8. An image taken more than 2 km from the feature, unless the image is explicitly framed as "seen from" (a view of the feature from a named vantage point, as the caption or the filename says so).

Items 1 to 6 are the rules that already stood. Items 7 and 8 are new in T126.

## How the two new rejects are enforced

Rule 7 is a judgement about the picture, so the model makes it and reports `subject_is_marker`.

Rule 8 is two judgements. The distance is not in the picture, it is in the metadata, so code computes it and the prompt is handed the figure. The model only decides the framing question, whether the image is explicitly a "seen from" shot, and reports `seen_from`. The decision is then made by `apply_distance_rule()` in the module, not by the model, so a model that ignores the distance cannot let a far image through. When the distance is unknown the image is not rejected on this rule, and the result carries `distance_known: false` so a later step can see that the check was blind.

## Output the scorer must produce

One JSON object per image. The fields are fixed so the scoring tasks after this one can store them without a parser per section.

subject: a few words for the main subject.
reject: one of the reject codes below, or null.
answers_hero: 0 to 5, how well the image answers the hero question for its section.
answers_gallery: 0 to 5, how well it answers the gallery question.
seen_from: true when the image is explicitly framed as a view of the feature from elsewhere.
subject_is_marker: true when a signpost or trail marker is the subject.
note: one short sentence for the review queue.

Reject codes: animal_plant_closeup, vehicle, interior, map_diagram, satellite, person_subject, marker_subject, too_far.

## Where this sits in the pipeline

The free filters run first (size, shape, evidence tier, the CLIP veto in `relevance.py`). The vision pass sees only what survives them. Like the CLIP veto, it should not override a P18 image on the old hard rejects, because P18 is a person stating the image depicts the item. Whether it may override P18 on the two new rejects is a decision for the wiring task, noted in the report.

Runtime and pipeline AI is Gemini only. The spec names a Haiku pass; that is not available to this project, and the prompt is written model-neutral so any Gemini vision model takes it unchanged.

## Changing the brief

Edit this document and `vision_prompt.py` in the same commit, and bump `PROMPT_VERSION` in the module so cached scores can be told apart. A change to a hard reject needs a measurement against the labelled set in `evalset.py` before it ships.
