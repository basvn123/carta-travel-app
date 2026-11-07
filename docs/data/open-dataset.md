# Open dataset (ROADMAP K8, T1176)

How the CC BY 4.0 export works and what stays out. Code in `scripts/open_data/`, datasheet in `scripts/open_data/DATASHEET.md`, tests in `tests/test_open_dataset.py`.

## Rule

A column is exported only when the licence of its source in `pipeline/config/sources.yaml` is in `OPEN_LICENCES` (CC-BY-4.0, CC0-1.0, public domain, US Government work). A derived source (kind `derived`) takes the licences of its inputs, recursively, so one share-alike input closes it. ODbL, CC BY-SA, per-file, site-terms and vendor-terms sources never qualify. Adding a column means adding a `FIELDS` entry with its source id and an attribution line; the test fails otherwise.

## What is in

Place identity (GeoNames), population and settlement class, Eurostat tourist nights per km2 and crowding tier, EEA bathing water class, NASA POWER monthly high and rain. 39 columns, one row per wire destination.

## What is out

Ratings, beauty, taste, activities, prices, accommodation, transport, tolls, images, guide text and designations. See "Left out" in the datasheet.

## Publishing (owner steps)

Nothing is published by CI. The owner reviews the output, creates the GitHub repo, uploads the files and posts. The Show HN draft is `Execution/P15/T1176-show-hn-draft.md`; post it only once the free part needs no signup.
