"""The photo engine: relevance gates what enters, beauty ranks what stays.

Every shoreline layer already answers "is this photograph OF this place"
with the evidence-tier machinery in pipeline/lakes/lake_images.py, and that
gate is the best thing in the pipeline. What no layer answered was "which
of the survivors is the one to lead with": two photographs that passed the
gate became the row's photographs, in evidence order, and evidence order
surfaced an apartment block for Laguna Beach, a beach-bar facade for
Langevelderslag, a litter bin in bare woodland for Fuussefeld and fog for
Burfelt. Every one of those passed the relevance gate honestly. Relevance
is necessary and not sufficient.

This package is the ranking half, shared by every layer. The harvest half
stays per-layer, because the subject linkage differs; the scoring half
lives here, because a threshold that moves should move for every layer at
once.

    relevance.py   the CLIP zero-shot rejector that runs AFTER the
                   evidence gate. It can veto, never admit.
    technical.py   cheap hard rejects: resolution, blur, aspect, plus the
                   one pixel measure that earned its keep (water fraction,
                   re-exported from lake_images).
    aesthetics.py  CLIP ViT-L/14 embeddings, cached, feeding the LAION
                   aesthetic head. One embedding per image, reused by
                   relevance, aesthetics and dedupe.
    season.py      month preference per category, month read from EXIF or
                   Commons metadata, and the overcast probe.
    dedupe.py      pHash buckets, then CLIP-cosine clusters, so a gallery
                   of four is four views rather than four crops of one.
    selection.py      the beauty score, hero eligibility and gallery
                   composition rules, plus the model block a layer embeds
                   in its index.json.
    commons.py     the wider Commons funnel: category recursion, the
                   geosearch ceiling, maxlag on bulk jobs.
    geograph.py    Geograph Britain and Ireland, CC BY-SA, the systematic
                   grid-square corpus that fixes GB and IE.
    mapillary.py   existence proof only. Its photographs can never lead.
    wikidata_views.py  P4640 / P8592 / P5252, the community-picked view
                   properties beyond P18.
    takedown.py    pull one image out of every wire file and rebuild, in
                   under five minutes.
    evalset.py     the labelled evaluation set every threshold above is
                   tuned against. No labels, no tuning.

Licence line, non-negotiable: LAION improved-aesthetic-predictor and
idealo NIMA come from their own Apache-2.0 repositories. pyiqa /
IQA-PyTorch is NOT used anywhere in this package: it bundles MUSIQ,
CLIP-IQA and Q-Align under PolyForm Noncommercial.

ASCII clean, no em dashes, per project convention.
"""
