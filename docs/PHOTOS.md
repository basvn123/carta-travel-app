# The photo engine

Every photograph on a beach, lake or mountain card, end to end: how a file
earns its place (relevance), how the best one comes to lead (beauty), and
how to run, extend and audit the machinery. Written in the shape of
`BEACHES.md`, per 02-PHOTO-ENGINE.md.

## What changed, and why

The relevance gate (evidence tiers in `pipeline/lakes/lake_images.py`,
shared by beaches and mountains) was the only selection step. Two
photographs that passed it became the row's photographs, in evidence
order, and evidence order surfaced an apartment block for Laguna Beach, a
beach-bar facade for Langevelderslag, a litter bin for Fuussefeld and fog
for Burfelt. All four passed the gate honestly. Relevance is necessary
and not sufficient.

The engine keeps the gate exactly as it is and adds everything after it:
a zero-shot rejector for the junk that carries the right name, a beauty
rank over what survives, season awareness, dedupe, and composition rules
for the hero and the gallery. It also widens the funnel: Geograph for GB
and IE, more Wikidata view properties, deeper Commons category walks.

Burfelt and Fuussefeld were fixed by the first re-rank of the existing
caches. Langevelderslag and Laguna Beach cannot be: every file in their
caches is a building (a pavilion, a hotel, a "Humorhall"), so they need
the wider funnel of a re-harvest, or they fall to the map card. That is
briefs 03-05's work, running on this machinery.

## The chain

```
pipeline/photos/
  relevance.py     the CLIP zero-shot rejector. Runs AFTER the evidence
                   gate, can veto, never admit, P18-exempt. Owns the
                   shared evidence-tier vocabulary (p18 title viewcat
                   category name geo street).
  technical.py     cheap hard rejects first: size floors (hero 800,
                   gallery 500), fixed-width Laplacian blur reject,
                   card-crop shape via lake_images, water fraction
                   re-exported.
  aesthetics.py    ViT-L/14-quickgelu embeddings (openai weights, and
                   the -quickgelu name matters: the LAION head was
                   trained through QuickGELU), cached forever under
                   cache/photos/emb/. LAION improved-aesthetic-predictor
                   head (Apache-2.0). NIMA hook, see open items.
  season.py        month preference per category; month from EXIF, then
                   Commons metadata, then filename dates; overcast probe
                   written and DISABLED until the labelled set clears it.
  dedupe.py        pHash buckets (imagehash, numpy DCT fallback), then
                   CLIP-cosine clusters. A gallery is one image per view.
  selection.py     the beauty score and the hero and gallery rules; the
                   photo_rank_v1 model block every layer export embeds.
                   (Named selection.py, not select.py: a module named
                   select shadows the stdlib and breaks any socket user
                   in-process. Found the hard way.)
  rescore.py       re-ranks a layer's cached galleries without
                   re-harvesting: fetches only the already-published
                   thumbnails, scores, vetoes, dedupes, reorders, writes
                   the rich cache. The exports respect its order.
  fill_authors.py  the attribution repair: Artist, then Attribution,
                   then Credit; AttributionRequired waives PD and CC0;
                   an unfillable CC file stops shipping.
  commons.py       category recursion depth 2, geosearch at the API's
                   real ceiling (10..10000 m, 500 files), maxlag=5 on
                   bulk jobs.
  geograph.py      GB+IE funnel: bulk dumps -> local sqlite for
                   discovery, keyed syndicator for pixels. CC BY-SA.
  mapillary.py     existence proof only, evidence tier street, which can
                   never lead a card.
  wikidata_views.py  P4640 panoramic, P8592 aerial, P5252 winter
                   (mountains only), P3451 nighttime (deprioritised),
                   all entering at tier p18.
  takedown.py      ledger + wire scrub: one image out of everything we
                   publish, in minutes, permanently.
  review.py        the human queue on 127.0.0.1:8012 (FastAPI, inline
                   page, append-only ledger with an actor). Decisions
                   reorder the caches AND label the eval set.
  evalset.py       the ~800-image labelled set every threshold answers
                   to; `stats` prints the margin sweep.

continent-app/scripts/verify_photo_contract.mjs   the data-side gate
pipeline/verify_skip_flags.py                     task zero's regression
```

## The beauty score (photo_rank_v1)

```
beauty = 0.45 aesthetic_norm      LAION head over the CLIP embedding
       + 0.20 commons_assessment  FP 1.0, QI 0.75, VI 0.6, none 0.0
       + 0.15 nima_norm           idealo NIMA, second opinion
       + 0.10 technical_norm      resolution + sharpness headroom
       + 0.10 season_fit          season.py's table
```

Components nobody measured are dropped and the weights renormalised
(invariant 6). The Commons assessment stays the anchor: the model ranks
the 95 per cent of files no human assessed, the assessment corrects the
model where a human did.

Hero rules: argmax(beauty) among hero-eligible tiers; P18 enters with a
+0.10 bonus and no longer wins automatically (the softened precedence
that took the observatory car park off Teide's slot); `geo` and `street`
can never lead; a row with nothing publishable ships the map-card code
(`{"k": "no_photo_map_card"}`) rather than a bad photograph. Gallery: up
to five more, one per dedupe cluster, near-ties spent on aspect and
season diversity.

The block ships in every layer's `index.json` under `model.photo_rank`
(invariant 2), and `rescore.py` writes `beauty`, `aesthetic`, `month`,
`phash`, `cluster` and `vetoed` onto the cached image records so exports
order without re-deriving anything (invariant 1).

## Running it

```
python pipeline/photos/rescore.py beaches            # re-rank a layer
python pipeline/photos/fill_authors.py               # attribution repair
python pipeline/photos/review.py                     # the queue, :8012
python pipeline/photos/evalset.py build              # refresh the set
python pipeline/photos/evalset.py stats              # margin sweep
python pipeline/photos/takedown.py add "<file>" --reason "..."
python pipeline/photos/geograph.py ingest gridimage_base.tsv.gz gridimage_geo.tsv.gz
node continent-app/scripts/verify_photo_contract.mjs # the gate
python pipeline/verify_skip_flags.py                 # task zero, forever
```

Order for a full refresh: rescore -> fill_authors -> the layer's export
-> verify_photo_contract. Rescore before fill: both write the rich
caches, and only ever run one writer per layer at a time.

**Rescore runs AFTER a layer rebuild, never beside one.** Learned on
2026-08-30, when a lakes sweep ran for eighteen CPU-hours next to five
other sessions rebuilding their layers, and was superseded before it
finished. Two independent reasons, and each is sufficient:

- A rebuild regenerates the rows being annotated. Photographs carried
  across unchanged keep their beauty fields (that is the enrich reuse
  block doing its job), but every newly picked image arrives unscored,
  so a sweep run mid-rebuild does work that has to be done again.
- CLIP wants about 2.5 GB. Alongside a harvest fleet, this box refused
  to load a second copy twice with `OSError 1455`, and free memory sat
  at 0.2 GB of 15.6. The sweep is the polite one to stand down.

Two mechanisms enforce it. A layer being rebuilt carries a hold file
(`cache/<layer>/.rescore_hold`, one line saying who and why) and rescore
refuses to start on it. And every scored image is stamped `rank_v`, so
a later pass skips what the current model version already did and pays a
thumbnail fetch only for pictures that are new. Bump
`selection.MODEL["photo_rank"]` whenever a weight, prompt or threshold
moves and the next pass rescores everything instead of trusting numbers
the old model produced.

## Costs and politeness

One CLIP embedding per image, cached by file title, reused by the
rejector, the aesthetic head and dedupe. Fresh scoring on this CPU box
runs a few seconds per image; a full-layer first pass is hours and every
later pass is minutes, because the cache only runs forward. Two workers
against a 0.4 s pacer on Commons remains the ceiling that never met a
429. Thumbnail fetches pace at 0.3 s. All bulk API calls carry maxlag=5
and a User-Agent with a contact address.

## Licences, and the trap that was avoided

LAION improved-aesthetic-predictor and idealo NIMA are Apache-2.0, pulled
from their own repositories. OpenCLIP is MIT/Apache. **pyiqa /
IQA-PyTorch is banned**: it bundles MUSIQ, CLIP-IQA and Q-Align under
PolyForm Noncommercial. Flickr was evaluated and rejected (delete-on-
request terms fail invariant 8); Geograph and Mapillary are CC BY-SA and
storable. Ledger rows for both are in `docs/tos/data_licenses.md`, and
`attribution.js` carries their credit lines.

## The evaluation set

`pipeline/photos/evalset/manifest.json`, about 200 heroes per layer
sampled by even stride across the publication order, labels filled by a
person (the review queue writes them as a side effect of every promote
and reject). The bars, from the brief: the rejector at or above 95 per
cent precision on rejects and 80 per cent recall on the known-bad set;
the overcast probe fires on bad heroes and not on good ones before
`season.CONDITION_ENABLED` flips.

## The margin, and how it was measured

`relevance.MARGIN` is 0.02 on evidence rather than by guess, as of
2026-08-30. 29 lake images were labelled by eye from contact sheets
(`contact_sheet.py` builds them, `label_sheet.py` records the verdicts)
across two deliberately enriched strata: everything the rejector vetoes,
which is the precision measurement, and the lowest scoring images it
lets through, which is where the misses live.

```
margin  reject-precision  subject-recall  vetoed
 0.000             1.000           0.812      13
 0.010             1.000           0.812      13
 0.020             1.000           0.812      13   <- kept
 0.030             1.000           0.750      12
 0.050             1.000           0.562       9
```

0.02 is the largest margin clearing both bars (0.95 precision, 0.80
recall), so it vetoes as cautiously as the recall bar allows; every
lower margin vetoes the same thirteen files, so loosening buys nothing.
All thirteen vetoes were correct: rock art, a trail signpost, apartment
blocks at dusk, a framed banner indoors, four churches and chapels, a
car wheel, a castle ruin, a village street.

Recall is measured over the SUBJECT class only. A foggy or drawn-down
photograph of the right lake is not something a subject classifier
should veto: the season term and the technical gate own those, and a
relevance model judging weather is exactly the failure mode this package
threw away three times in the lake layer. `evalset.py` splits the reason
codes on that line.

Two caveats worth keeping in view: the labels are model made
(`by: claude-vision` in the manifest, overruled by any human pass
through the review queue), and 29 images from one category is a small,
enriched sample rather than the 800 the brief asks for.

## Open items

- **22 photographs still owe a credit nobody can supply.** Measured
  2026-08-30 across the published lakes and mountains wires: of 42
  author-less files, the widened metadata request recovers 11 names and
  clears 9 as owing nothing, and the last 22 have no name in Commons at
  all. They stop shipping the next time `fill_authors.py` runs, which is
  after the layer rebuilds, per the sequencing rule above.
- **The waiver does not reach the wire.** Commons' AttributionRequired
  says 9 of those files owe no credit, `fill_authors.py` records that in
  the cache as `no_attribution_required`, and no export ships it, so
  `verify_photo_contract.mjs` still counts them as gaps. It is right to
  keep failing until a wire field carries the waiver: a licence with no
  name is a gap until something states otherwise.
- **More labels, and human ones.** 29 of 800 manifest rows carry a
  label, all lakes, all model made. The review queue writes labels as a
  side effect of reviewing, so the cheapest path to the full set is
  working the queue.
- **The three misses are prompt shaped.** No margin catches a wrecked
  car in a dry streambed, a cow pasture with no water in frame, or a
  lake view with three tourists' heads across the bottom. Growing the
  NEGATIVE list to name them is a model version change and needs its own
  sweep; the machinery for that sweep now runs from cache in a second.
- **NIMA weights.** The published checkpoint is Keras; this box runs
  torch. `aesthetics.py` loads `cache/photos/models/nima_mobilenet.pth`
  the moment a converted checkpoint lands, and renormalises without it.
- **Geograph ingest.** The client and sqlite index are written; the
  dumps (data.geograph.org.uk/dumps/) and a syndicator key
  (`CARTA_GEOGRAPH_KEY`) are an operator step. Same for Mapillary
  (`CARTA_MAPILLARY_TOKEN`).
- **Commons bot flag.** Would raise geosearch to 5,000 and titles-per-
  request to 500. An account action on Commons, not a code change.
- **The four-photo target.** `verify_photo_contract.mjs` reports it per
  layer and hardens when the funnel re-harvests land (briefs 03-05).
- **Langevelderslag and Laguna Beach.** Every cached candidate is a
  building; they wait on the wider funnel or the map card.
