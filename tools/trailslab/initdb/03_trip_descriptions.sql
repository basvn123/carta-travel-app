-- Generated trip descriptions, written by pipeline/trails/describe.py, which
-- also applies this file idempotently at runtime, because initdb scripts only
-- run against an empty volume (same pattern as 02_trip_repairs.sql).
--
-- description_md is OUR text: Claude rewrites a facts block assembled from the
-- staged row (ODbL tags, computed metrics, portal agreement, catalogue
-- anchors). Wikivoyage is passed to the model as signal only and never quoted,
-- so nothing here inherits its CC BY-SA share-alike obligation. Every stored
-- description has a matching description_grounding row in validation_runs
-- holding the sentence-to-source-field map the verification pass produced.
--
-- described_at is set on every successful write, so a re-description after a
-- geometry or metric change is visible without diffing the text.

ALTER TABLE trips ADD COLUMN IF NOT EXISTS description_md text;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS described_at timestamptz;
