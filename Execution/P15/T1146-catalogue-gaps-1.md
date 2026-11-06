# T1146: Catalogue gaps, part 1 (ROADMAP D15, round 2 session S62)

## Date

2026-11-06

## What changed

Carta has a reviewed-ready list for D6's 36 place gaps. `pipeline/catalogue_gaps.py` scores all 90,393 candidates (GeoNames cities500 settlements and Overture POI clusters, built offline by `build_place_candidates.py`) with the catalogue's own scorer and passes them through `promote_place_candidates.py`'s own gates and a D2 check, region gaps first. It writes one sheet per country in `docs/data/catalogue-gaps/` (37 sheets plus a README with counts per gap and per country) and a machine-readable `data/catalogue/d15/review.json`, whose per-country `approve` keys are in the shape `promote_place_candidates.py --approve` reads. On 2026-11-06 the list proposes 142 adds in 7 countries (DE 113, IT 13, ES 6, FR 4, PL 3, AT 2, SE 1), 440 more on a stretch list below today's worth floor (owner's call, never on the approve list), 9 merges and 3 merge reviews (Rhodes and Ródos among them), 0 removals and 249 fixes. Of the 807 places D6 called short, 142 are filled under today's rules, 582 with the stretch list, and 207 stay unfilled from these sources. Nothing in the master or the wire changed; S63 applies the list after the owner review.

## Research

Data sources: fixed by the brief (the caches the catalogue already uses; live Wikidata and Wikivoyage are owner runs), so the candidate universe is the existing coverage loop's (`build_place_candidates.py`): GeoNames cities500 (CC BY 4.0), Overture Places (CDLA-Permissive 2.0), the designation registry, Wikidata ids and pageviews from `cache/place_signals.json` (CC0). Both licences are already rows in `docs/tos/data_licenses.md`.

Selection method: reuse, not a new rule. The scorer (`score_place_candidates.score_candidate`, `cover_radius_km`) and the gates and constants of `promote_place_candidates.py` (`MIN_WORTH` 0.40, `MIN_SEPARATION_KM` 6, `ANCHOR_MAX_KM` 400, the district tests) are imported, so this list and the path S63 applies it through cannot drift apart.

Duplicate method, compared by a research subagent:

| Option | What it catches | Licence, version | Chosen |
|---|---|---|---|
| Shared id (GeoNames id, Wikidata QID), as Pelias concordance dedupe | any pair sharing an id | n/a | Yes, layer 1 |
| GeoNames alternate names (cities500 column 4) | exonyms: Rodos and Rhodes, Koln and Cologne, Bozen and Bolzano | CC BY 4.0, already in the cache | Yes, layer 2 |
| Unicode folding (stdlib `unicodedata`) plus a hand map for ß, ø, æ, ł | accents and case | PSF, stdlib | Yes |
| String similarity: stdlib `difflib` | spelling variants | PSF, stdlib | Yes, review only |
| rapidfuzz (ratio, Jaro-Winkler) | the same, faster, a proper metric | MIT, 3.14.6 | No: a new dependency for 3,868 rows; noted for part 2 |
| anyascii (Greek and Cyrillic to Latin) | names in other scripts | ISC, 0.3.3 | No: GeoNames alternate names already carry the Latin forms; the 2 non-Latin shipped names are flagged as fixes instead |
| Unidecode, text-unidecode | as anyascii | GPL-2+, Artistic or GPL | No: licence |

Thresholds: an alias or an exact folded match within 10 km is a merge, 25 km when either side has 300,000 people or more (Mapbox's settlement matching found matches beyond 10 km are usually a different place of the same name); similarity 0.90 or more within 5 km goes to review (no universal cut is published: reclin2 and the Lancaster toponym study both tune it, here on the test fixture). Sources: [Pelias concordance dedupe](https://github.com/pelias/api/pull/1606), [Who's on First go-dedupe](https://github.com/whosonfirst/go-dedupe), [Mapbox Wikidata settlement matching](https://www.openstreetmap.org/user/PlaneMad/diary/39846), [mapbox/wikimama](https://github.com/mapbox/wikimama), [Santos et al., toponym similarity](https://eprints.lancs.ac.uk/89481/1/Manusc_Combining_Multiple_String_Similarity_Metrics_for_Effective_Toponym_Matching.pdf), [reclin2 deduplication](https://cran.r-project.org/web/packages/reclin2/vignettes/deduplication.html), pypi pages of rapidfuzz, anyascii and Unidecode.

D2 per place: the rules in `scripts/quality/rules.yaml` gate shares over the whole catalogue, not single records. A field with a floor of 0.90 or more is one nearly every place carries, so one place without it is a defect; lower floors (designations, nature, guide, bathing water) are partial by design. A field one tier lacks on more than half its rows (the airport rows' blurb) is not required of that tier.

## Files touched

- Created: `pipeline/catalogue_gaps.py`, `tests/test_catalogue_gaps.py` (13 tests), `data/catalogue/d15/review.json` (generated), `docs/data/catalogue-gaps/README.md` and 37 country sheets (generated), this report.
- Modified: `docs/HANDBOOK.md` (new section "Catalogue gaps: add and prune places (D15)" and its contents line), `ROADMAP.md` (D15 status), `Execution/_OPEN.md` (rows T1146-a to T1146-h appended).
- Read only: `pipeline/build_place_candidates.py`, `score_place_candidates.py`, `promote_place_candidates.py`, `scripts/coverage/coverage_parity.py` (its NUTS loader is imported), `scripts/quality/rules.yaml`, `pipeline/wire_contract.py`.
- Generated, not committed: `data/derived/place_candidates.json` (gitignored, 68 MB).

## Commands run

```
git fetch origin && git checkout -b p15-s62-catalogue-gaps-1 origin/p15-round2
git lfs pull --include="cache/geonames_cities500.txt,cache/osm_settlements.json,cache/wikidata_sitelinks.json,cache/wikivoyage.json,cache/dest_pageviews.json,cache/place_signals.json"
git lfs pull --include="cache/overture_pois_eu.parquet"
pip install pyarrow pytest pyyaml ruff
cd pipeline && python -c "import build_place_candidates as b; from pathlib import Path; b.MASTER = Path('../continent-app/public/app_data.json').resolve(); b.main()"   # the master is not in the checkout; 39 s
python -I pipeline/catalogue_gaps.py      # 11 s
python -m pytest tests/test_catalogue_gaps.py -q
ruff check --select E9,F63,F7,F82,F pipeline/catalogue_gaps.py tests/test_catalogue_gaps.py
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| D6 place gaps with a worked list | 0 of 36 | 36 of 36 | +36 |
| Places short (D6) | 807 | 807 short; 142 on the add list (today's rules), 440 on the stretch list, 207 unfilled | |
| Countries with a review sheet | 0 | 37 | +37 |
| Adds per country (approve list) | 0 | DE 113, IT 13, ES 6, FR 4, PL 3, AT 2, SE 1 | +142 |
| Adds under promote's parent test as written | n/a | 16 (see What broke) | |
| Duplicate pairs found in the shipped catalogue | not measured | 9 merge, 3 review | |
| Shipped places failing D2 per place | not measured | 249 fix (85 no GeoNames row, 83 airports and 54 gems with no anchor airport, 27 no image, 2 names with no Latin form), 0 remove | |
| Generator run time | n/a | 11 s (plus 39 s for the candidate file) | |
| Generator tests | 0 | 13 passed | +13 |

Counts per gap (from `docs/data/catalogue-gaps/README.md`; Need is the shortfall left after the country's region gaps, Left is unfilled under today's rules):

| Gap | Scope | Short | Need | Added | Eligible | Left | Stretch | Left after stretch |
|---|---|--:|--:|--:|--:|--:|--:|--:|
| D6-001 | DE Germany | 196 | 178 | 95 | 95 | 83 | 83 | 0 |
| D6-002 | PL Poland | 92 | 92 | 3 | 3 | 89 | 52 | 37 |
| D6-003 | FI Finland | 62 | 62 | 0 | 0 | 62 | 22 | 40 |
| D6-004 | AT Austria | 48 | 48 | 2 | 2 | 46 | 46 | 0 |
| D6-005 | SE Sweden | 48 | 48 | 1 | 1 | 47 | 47 | 0 |
| D6-006 | NO Norway | 42 | 42 | 0 | 0 | 42 | 42 | 0 |
| D6-007 | RO Romania | 33 | 33 | 0 | 0 | 33 | 31 | 2 |
| D6-008 | BA Bosnia and Herzegovina | 14 | 14 | 0 | 0 | 14 | 3 | 11 |
| D6-009 | MD Moldova | 13 | 13 | 0 | 0 | 13 | 0 | 13 |
| D6-010 | LT Lithuania | 8 | 8 | 0 | 0 | 8 | 6 | 2 |
| D6-011 | FR FR10 Ile-de-France | 48 | 48 | 4 | 4 | 44 | 9 | 35 |
| D6-012 | IT ITH3 Veneto | 34 | 34 | 6 | 6 | 28 | 16 | 12 |
| D6-013 | ES ES70 Canarias | 22 | 22 | 0 | 0 | 22 | 0 | 22 |
| D6-014 | IT ITH1 Provincia Autonoma di Bolzano/Bozen | 18 | 18 | 7 | 7 | 11 | 9 | 2 |
| D6-015 | SE SE33 Övre Norrland | 15 | 15 | 0 | 0 | 15 | 5 | 10 |
| D6-016 | ES ES42 Castilla-La Mancha | 14 | 14 | 6 | 6 | 8 | 8 | 0 |
| D6-017 | DE DE40 Brandenburg | 9 | 9 | 0 | 0 | 9 | 9 | 0 |
| D6-018 | HR HR02 Panonska Hrvatska | 9 | 9 | 0 | 0 | 9 | 3 | 6 |
| D6-019 | DE DE80 Mecklenburg-Vorpommern | 8 | 8 | 8 | 8 | 0 | 0 | 0 |
| D6-020 | DE DEF0 Schleswig-Holstein | 8 | 8 | 1 | 1 | 7 | 7 | 0 |
| D6-021 | IE IE06 Eastern and Midland | 8 | 8 | 0 | 0 | 8 | 8 | 0 |
| D6-022 | GR EL64 Sterea Elláda | 7 | 7 | 0 | 0 | 7 | 7 | 0 |
| D6-023 | AT AT22 Steiermark | 5 | 5 | 0 | 0 | 5 | 5 | 0 |
| D6-024 | DE DE93 Lüneburg | 5 | 5 | 1 | 1 | 4 | 4 | 0 |
| D6-025 | NO NO0B Svalbard og Jan Mayen | 5 | 5 | 0 | 0 | 5 | 0 | 5 |
| D6-026 | AL AL02 Qender | 4 | 4 | 0 | 0 | 4 | 0 | 4 |
| D6-027 | DE DE23 Oberpfalz | 4 | 4 | 3 | 3 | 1 | 1 | 0 |
| D6-028 | HU HU32 Észak-Alföld | 4 | 4 | 0 | 0 | 4 | 2 | 2 |
| D6-029 | NL NL23 Flevoland | 4 | 4 | 0 | 0 | 4 | 2 | 2 |
| D6-030 | PL PL92 Mazowiecki regionalny | 4 | 4 | 0 | 0 | 4 | 3 | 1 |
| D6-031 | DE DE22 Niederbayern | 3 | 3 | 2 | 2 | 1 | 1 | 0 |
| D6-032 | DE DE73 Kassel | 3 | 3 | 3 | 5 | 0 | 0 | 0 |
| D6-033 | NO NO06 Trøndelag/Trööndelage | 3 | 3 | 0 | 0 | 3 | 3 | 0 |
| D6-034 | RS RS11 City of Belgrade | 3 | 3 | 0 | 0 | 3 | 2 | 1 |
| D6-035 | PL PL43 Lubuskie | 2 | 2 | 0 | 0 | 2 | 2 | 0 |
| D6-036 | SK SK01 Bratislavský kraj | 2 | 2 | 0 | 0 | 2 | 2 | 0 |
| All | | 807 | | 142 | | | 440 | 207 |

Merges: Rhodes `RHO` keeps over Ródos `gem:rodos` (same GeoNames place 400666), Lampedusa `LMP` over `gem:lampedusa`, Krk over Krk (Baška) is a review, Giglio Castello over Giglio (GeoNames alternate names), and five French and Italian pairs that are the same record twice with a `-fr` or `-it` slug suffix (Aubeterre-sur-Dronne, Moncontour, Montreuil-Bellay, Plombières-les-Bains, Brugnato, Seborga). Reviews: Chios and Chios (Mastic Villages), Elafonisos and Elafonisos (Simos Beach), Krk and Krk (Baška).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Only 16 adds on the first run, and "a district of None" as the top rejection | `promote_place_candidates.py` tests `norm_city(parent_city) in shipped_cities`; `norm_city(None)` is `""`, and two shipped cities fold to `""` (`gem:place` Мирковци, `gem:αργος` Άργος), so every candidate without a parent city is taken for a district | The D15 gate tests only a real parent; the two records are listed as fixes; promote itself is outside this brief, row T1146-b (S63 must fix it before `--approve`, which runs the same test) |
| 413 fixes on the first run, 247 of them airports | Airport rows carry no blurb by design; the floor is set over all rows | A field is required of a tier only when half that tier carries it (`TIER_SHARE`); 249 fixes |
| Chios (Mastic Villages) would merge into Chios | The bracketed qualifier is dropped by folding, so both resolve to one GeoNames place | A sure match where a name carries brackets goes to review |
| The master `app_data/app_data.json` is not in the checkout | 140 MB, kept out of git | The generator falls back to the wire; the candidate file was built with the wire patched in as master. On the box both read the master |
| GeoNames, Overture and signals caches were LFS pointers | Not fetched at clone | `git lfs pull` of the six files (reachable from the cloud) |
| A ruff fix turned the dash escapes in a test into literal dashes | ruff's unicode rewrite | The test uses `chr(0x2014)` |

## Screens checked

None: no screen changed. The README and the DE, GR and IT sheets were read in full.

## What is still open

- T1146-a (owner): review each country's add list (`docs/data/catalogue-gaps/<CC>.md`), strike what should not ship, decide on the stretch list (it lowers the worth floor from 0.40 to 0.30 for gap countries), and confirm the 3 merge reviews; this unblocks S63.
- T1146-b: `promote_place_candidates.py`'s parent test rejects every parentless candidate while a shipped city folds to an empty key; S63 fixes it (test only a non-empty parent) before running `--approve`, or 126 of the 142 approved adds are skipped.
- T1146-c: S63 applies the 9 merges and the owner's answer on the 3 reviews (keep the airport row, move members, guide and designations across, drop the other), each logged.
- T1146-d: 249 fixes: 137 places with no anchor airport (83 of them airport rows), 85 with no GeoNames row, 27 with no image, and the 2 names with no Latin form (`gem:place`, `gem:αργος`, whose slug `place` shows the same fault); they belong to the flights, place and imagery layers and the hand-corrections file.
- T1146-e (owner): `cache/place_signals.json` holds Wikipedia attention for 4,083 of 90,393 candidates, so most candidates are scored without it; run `harvest_place_signals.py` for the gap countries (Wikidata and Wikimedia pageviews, not reachable from the cloud), rebuild the candidates and rerun the generator.
- T1146-f: the registry's blind spots (`de_schoenste_doerfer`, `ro_cele_mai_frumoase`, `pt_aldeias_historicas`, `es_pueblos_bonitos`, `ch_plus_beaux`, `wallonie_plus_beaux`, `eu_cittaslow`) leave small designated places in gap countries unscored for designation; D15 part 2 or D7.
- T1146-g: 207 places stay short even with the stretch list (Canarias 22, Moldova 13, Bosnia and Herzegovina 11, Ile-de-France 35, Finland 40, Poland 37 and others): the OSM settlement and Wikidata register tracks (`pipeline/intake/`, network) or the D6 expectation (T1145-e) must answer them; D15 part 2.
- T1146-h: MAP.md does not name `pipeline/catalogue_gaps.py` or `docs/data/catalogue-gaps/`; MAP.md was outside this brief.
- After S63 applies the list, `scripts/coverage/coverage_parity.py` is rerun so the D6 lines close (existing row T1145-a).

## Rollback procedure

`git revert` of the T1146 commit. Nothing is one-way: the generator writes only its review list and sheets; no master, wire, schema or migration changed.

## Owner steps (for the checklist)

- [T1146-a] Review the D15 add list per country | nothing is added to the catalogue until I approve it, and S63 waits on this | open `docs/data/catalogue-gaps/README.md`, then each country sheet; strike any add that should not ship (or tell S63 which reserve to take instead); say yes or no to the stretch list (worth 0.30 to 0.40) per country; answer the 3 merge reviews (Chios, Elafonisos, Krk) | docs/data/catalogue-gaps/
- [T1146-e] Refresh Wikipedia attention for the gap countries | most candidates are scored without readership, so quiet but read places rank too low | on the box run `python pipeline/build_place_candidates.py`, then `python pipeline/harvest_place_signals.py --undesignated-top 20000` (the default measures only the top 2,500 register-less candidates; the script has no per-country option); then `python pipeline/build_place_candidates.py`; then `python -I pipeline/catalogue_gaps.py` and commit the new list | pipeline/harvest_place_signals.py
