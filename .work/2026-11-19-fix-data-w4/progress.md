step 1: replay_poi_rules.py written, before snapshot: rows 157775, must-sees 11161, Square without word 3769 (33.77%), research hits 274, banned highlights 358, banned festival rows 3
step 2/3: classify_poi in normalize_poi_kinds.py (desc, name words, wikidata flags), same-wiki dedupe key, tests/test_poi_kinds.py 12 tests pass, C-10 rate fix in test_poi_labels
step 4: is_highlight_ok (build_dossier), is_festival_ok (pipeline/festival_filter.py) used in slim_event, build_dossier festivals, derive_do; landmarks keep _types; 7 tests pass
