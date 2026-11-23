# Errors left, wave 3b

Grouped by root cause, biggest first.

1. **Region named in neither the catalogue text nor the gazetteer** (1 of 95 on the probe): "Natur in der Sächsischen Schweiz" (the catalogue says "Saxon Switzerland", the gazetteer has no such admin region). A region needs 3 catalogue mentions or a gazetteer admin region; one that has neither is still declined. Also true for any region with a foreign-language name the English text never uses. Backlog A2h: region names in six languages from the pipeline (GeoNames alternate names) into the catalogue.
2. **Parser does not resolve the region**, so the answer is a generic search not anchored on it: "Ruta por la Ribera del Duero" answers with a 7-day plan (Rome, Como, Bruges); "Castles of Transylvania" opens with Neuschwanstein. The scope is right (answered, not declined) but the answer is poor. A2h parser work.
3. **Gimmelwald in the set** (places-lacking 21 of 22): same as wave 3; the eval case scores it inaccurate although the scope test returns lacking (the case's expectation and nearest-country check). Not investigated further.
4. **Day counts and follow-ups** (19 and 17 cases, from wave 3): untouched, A2h.
5. **Word lists generalise poorly** (held-out harmful 0 of 16, off-topic 0 of 6): untouched, A2h.
6. Limits of the rule: a village the catalogue text names 3 or more times (and the gazetteer lacks) would be answered as a region; a village in the text under 3 times and a region named under 3 times are indistinguishable (Wengen 1, Murren 2 stay lacking; Rioja 1 and Masuria 1 are saved only by the gazetteer's regions).
