# Ask Carta logic (ASK)

How a typed question becomes a facts answer, which places it shows, and when a written answer from an open model may stand beside it. Main code: `continent-app/src/lib/ask/`, `continent-app/src/browse/ask/AskChat.jsx`, `continent-app/src/browse/ask/AskTurn.jsx`, `continent-app/functions/api/ask.js`, `continent-app/functions/api/ask/answer.js`, `pipeline/ask_index_layer.py`, `continent-app/scripts/build-ask-bm25.mjs`. HANDBOOK pointer: "### Ask Carta" (docs/HANDBOOK.md). Last verified against the code: 2026-11-06 (T1132).

IDs are catalogue IDs only for now: the `// LOGIC: <ID>` / `# LOGIC: <ID>` tags in code and `scripts/docs/logic_check.py` are the second half of ROADMAP B3 and not yet done. Line numbers are as of 2026-11-06 and will drift; the constant name is the stable handle.

## Rules

### ASK-001 Ask is free
- Decides: whether asking costs the traveller anything from their Pass allowance.
- Rule: no paywall gate and no `ai_consume` call on any Ask path; the only limits are the shared server caps (ASK-026, ASK-028) and the on-device switch (ASK-036).
- Constant: none (no `usePaywall` or quota call in `continent-app/src/browse/ask/AskChat.jsx`, `AskTurn.jsx` or `functions/api/ask/answer.js`)
- Test: no test

### ASK-002 Question type
- Decides: which kind of answer the traveller gets (a list, a budget list, a month table, one place, a side by side, a route).
- Rule: types `find`, `near`, `budget`, `when`, `about`, `compare`, `plan`, chosen in this order: a plan cue wins, then two places joined by "or"/"vs" (at most 2 words between) is `compare`, then one place with a "when" cue is `when`, one place with an "about" cue is `about`, a total budget is `budget`, else `find`. A `find` with a place and nothing else but a month becomes `about` ("Annecy in August"); a `find` around a place becomes `near`. Read in six languages (`LANGS` = en, nl, de, fr, es, it).
- Constant: `LANGS` in `continent-app/src/lib/ask/intent.js:27` = ['en','nl','de','fr','es','it']; type order in `intent.js:369` to `intent.js:427`
- Test: `continent-app/tests/askIntent.test.mjs` :: "golden set: question type and slots"
- Test: `continent-app/tests/askIntent.test.mjs` :: "held-out set: question type and slots"

### ASK-003 Money in a question: per day or total
- Decides: whether "80 euros" filters places by daily cost or prices a whole trip.
- Rule: a figure of 20 or more (up to 5 digits, "1,500" and "1.5k" kept whole) is money. It is per day when a per-day phrase follows it, or when it is under 300 with no "total" cue; otherwise it is a total. A per-day figure of 200 or more with a "total" cue anywhere is a total. A per-day figure is rounded up to the next guided step, capped at the top step.
- Constant: `BUDGET_STEPS` in `continent-app/src/lib/ask/intent.js:28` = [40, 60, 80, 100, 130]
- Constant: thresholds in `intent.js:329` (>= 20), `intent.js:339` (< 300), `intent.js:344` (>= 200); `budgetStep` in `continent-app/src/lib/guidedSearch.js:584`
- Test: `continent-app/tests/askIntent.test.mjs` :: "golden set: question type and slots"
- Test: `continent-app/tests/askIntent.test.mjs` :: "tokenize keeps 1,500 and 1.500 whole and caps the length"

### ASK-004 Trip length and seasons in words
- Decides: how many days a plan or budget answer prices, and which months "summer" means.
- Rule: "two weeks"/"fortnight" = 14 days, "a week" = 7, "long weekend" = 3, "weekend" = 2; "N nights" = N + 1 days, "N days" = N. Seasons: summer 6 to 8, winter 12 to 2, spring 3 to 5, autumn 9 to 11. "Late/early/mid" before a month is dropped.
- Constant: `WEEKS` in `continent-app/src/lib/ask/intent.js:51`; `SEASONS` in `intent.js:116`; nights rule in `intent.js:316`
- Test: `continent-app/tests/askIntent.test.mjs` :: "golden set: question type and slots"

### ASK-005 Question length
- Decides: how much of a long question is read.
- Rule: the parser, the retriever and the dense endpoint read the first 200 characters; the wire pack refuses a question over 200.
- Constant: `MAX_QUESTION_CHARS` in `continent-app/src/lib/ask/context.js:28` = 200; slice in `intent.js:146` and `retrieve.js:77`
- Test: `continent-app/tests/askIntent.test.mjs` :: "tokenize keeps 1,500 and 1.500 whole and caps the length"
- Test: `continent-app/tests/functionGuards.test.mjs` :: "parseAskQuery checks the question, the lists and the unknown words"

### ASK-006 Follow-up binds to the last place
- Decides: whether "Where to stay there?" is answered about the place of the previous answer.
- Rule: a question that names no place, is not `budget`, and either points back ("there", "daar", "dort", "là", "allí", "lì") or asks nothing of its own (no vibe, area, country, near, budget, nb, nocar, quiet or warm facet) becomes `about` that place (`when` and `plan` keep their type); its unknown words are dropped.
- Constant: `BACK`, `OWN`, `KEEPS_PLACE` in `continent-app/src/lib/ask/followup.js:20` to `:26`
- Test: `continent-app/tests/askChat.test.mjs` :: "a follow-up that points back or asks nothing of its own binds to the last place"

### ASK-007 A place outside Europe is named, not replaced
- Decides: whether "a trip to Dubai" gets "Carta does not cover Dubai" instead of a Balkan week.
- Rule: with no known place, near or country, an unknown word right after "to/in/naar/nach/à/a/para/per/verso" (not a verb such as "stay") is the destination; following capitalised unknown words join it ("New York"). Skipped when the turn points back to a previous place.
- Constant: `BEFORE`, `VERBS` in `continent-app/src/lib/ask/outside.js:14` and `:20`
- Test: `continent-app/tests/askChat.test.mjs` :: "a destination outside Carta's Europe is named, a European one is not"

### ASK-008 Which sources are searched per question type
- Decides: whether passages about sights, trails and highlights can back an answer.
- Rule: find, near, budget: dest + highlight; plan: dest + highlight + trail; about: highlight + sight + trail; when: highlight; compare: highlight + sight. Up to 12 place ids and the country go along as filters; up to 5 unknown words go to the lexicon.
- Constant: `SOURCES` in `continent-app/src/lib/ask/retrieve.js:30`
- Test: no test

### ASK-009 Sparse search in the browser
- Decides: exact names and words always count, even when the vector misses them.
- Rule: MiniSearch BM25 over `bm25.json`, terms OR-combined, prefix match for terms over 3 letters, fuzzy 0.2 for terms over 5 letters; the first 60 distinct destinations form one ranked list.
- Constant: `continent-app/src/lib/ask/retrieve.js:93` (prefix > 3, fuzzy 0.2 > 5) and `:94` (slice 60)
- Test: `continent-app/tests/askRetrieve.test.mjs` :: "recall@10 on GOLDEN: rules alone, then hybrid"

### ASK-010 Dense search on the Function
- Decides: which places and passages match the meaning of the question.
- Rule: the question is embedded (potion-multilingual-128M, 256 dims); per source the top k1 = max(200, 10 x k) rows by sign bits are re-scored in int8 and the best k kept, after the country and place filters. Hits per source: dest 50, highlight 24, sight 16, trail 12, beach 10, lake 10, journey 8, peak 8, country 4 (10 for any other).
- Constant: `PER_SOURCE` in `continent-app/functions/api/ask.js:29`; k1 in `ask.js:98`
- Test: `continent-app/tests/askEmbed.test.mjs` :: "askScore: two stages keep the best k, filter rows out, break ties by row"
- Test: `continent-app/tests/askRetrieve.test.mjs` :: "/api/ask: filtered dense hits and lexicon matches"

### ASK-011 Lexicon words fill empty facets
- Decides: whether a word the rules could not place ("chilled") still narrows the answer.
- Rule: each unknown word (3 to 40 letters, at most 5) is matched to the nearest lexicon phrase; accepted only at cosine 0.62 or more. A match fills a slot the question left empty: vibe, sort by cost, nocar, quiet, or a close-by extra.
- Constant: `LEX_MIN` in `continent-app/functions/api/ask.js:31` = 0.62; `slotsFrom` in `continent-app/src/lib/ask/retrieve.js:61`
- Test: `continent-app/tests/askRetrieve.test.mjs` :: "lexicon slots fill only what the question left empty"

### ASK-012 Dense search gives up fast
- Decides: how long the traveller waits for the vector half before the answer stands on BM25 and the rules.
- Rule: the browser aborts `/api/ask` after 1200 ms; a missing index, offline or slow half is simply left out.
- Constant: `DENSE_TIMEOUT_MS` in `continent-app/src/lib/ask/retrieve.js:28` = 1200
- Test: no test

### ASK-013 Fusion of the two searches
- Decides: the relevance order of places fed to ranking.
- Rule: reciprocal rank fusion, score = sum of 1 / (k + rank + 1) over every list a place is in.
- Constant: `RRF_K` in `continent-app/src/lib/ask/retrieve.js:27` = 60
- Test: `continent-app/tests/askRetrieve.test.mjs` :: "rrf: a place high in either list ranks high"

### ASK-014 Dense answers are cached an hour
- Decides: how long a repeated search reuses the same dense hits.
- Rule: `/api/ask` answers carry `cache-control: public, max-age=3600`.
- Constant: `HOLD` in `continent-app/functions/api/ask.js:28` = 3600
- Test: no test

### ASK-015 Find ranking weights
- Decides: the order of places in a find answer.
- Rule: score = weighted sum of relevance 1 / (1 + rank / 10), vibe score / 100, best month score / 100, quality / 10 and the traveller's taste fit; a weight with nothing to read (no retrieval, no vibe, no month, no taste) is shared out over the others in proportion.
- Constant: `W` in `continent-app/src/lib/ask/rank.js:40` = { rel 0.1, vibe 0.25, month 0.1, rating 0.15, fit 0.15 }
- Test: `continent-app/tests/askRetrieve.test.mjs` :: "recall@10 on GOLDEN: rules alone, then hybrid"

### ASK-016 Cheapest and near overrides
- Decides: "cheapest" and "near X" questions put cost or distance first.
- Rule: sort by cost replaces the score with 1 / (1 + dayEur / 50); a near question blends score x 0.5 + 0.5 / (1 + km / 15).
- Constant: `continent-app/src/lib/ask/rank.js:118` and `:121`
- Test: no test

### ASK-017 What warm means
- Decides: which places count as warm.
- Rule: a day high of at least 20 C in a month asked about; with no month, next month (today's month + 1).
- Constant: `WARM_C` in `continent-app/src/lib/ask/rank.js:32` = 20
- Test: `continent-app/tests/askChat.test.mjs` :: "warm in a month keeps the warm places and lets the month's best list go"

### ASK-018 Loosening a thin answer
- Decides: which asked-for facet is let go when fewer than 3 places fit.
- Rule: while hits < 3, drop the next present facet in the order quiet, budget, warm, month, nb, nocar, vibe; a warm question drops month before warm. The loosened facets are recorded but no longer said in the answer (T583).
- Constant: `RELAX` in `continent-app/src/lib/ask/rank.js:97`, `RELAX_WARM` in `rank.js:101`; threshold in `rank.js:180` (3)
- Test: `continent-app/tests/askChat.test.mjs` :: "warm in a month keeps the warm places and lets the month's best list go"
- Test: `continent-app/tests/askChat.test.mjs` :: "a loosened filter is no longer said in the answer"
- Test: `continent-app/tests/askAnswer.test.mjs` :: "golden questions: answer facts and the facts-only answer"

### ASK-019 How many picks, kept apart
- Decides: how many places an answer leads with and that two rows of one town never both show.
- Rule: at most 6 picks; a row is skipped when it is the same city in the same country (two airports) or within 3 km of a pick already kept.
- Constant: `PICKS` in `continent-app/src/lib/ask/rank.js:34` = 6; `samePlace` in `rank.js:167`; `LIMIT` in `continent-app/src/browse/ask/AskTurn.jsx:42` = 6
- Test: no test

### ASK-020 Budget answer order
- Decides: the order of places in a total-budget answer.
- Rule: places that fit or are tight (inside the budget with or without the buffer); in season first, then vibe score / 10 + Score + fit x 2, minus 1 point per 300 km from the home town when not flying; the home town itself is left out.
- Constant: `continent-app/src/lib/ask/rank.js:218` to `:222`
- Test: `continent-app/tests/askAnswer.test.mjs` :: "golden questions: answer facts and the facts-only answer"

### ASK-021 Plan answer shape
- Decides: how many stops a "plan me" answer routes.
- Rule: days default 7; stops = 1 up to 3 days, 2 up to 5, 3 up to 8, 4 up to 12, else 5; stops at least 20 km apart; a named place is put first; nights = days - 1 (at least 1).
- Constant: `continent-app/src/lib/ask/rank.js:285` to `:304`
- Test: `continent-app/tests/askAnswer.test.mjs` :: "golden questions: answer facts and the facts-only answer"

### ASK-022 Comparisons and verdicts are written by code
- Decides: which "cheaper", "drier", "best match" claims the written answer may make.
- Rule: for a compare, up to 3 pairs: day cost, score, rain and day high in the month; for a list (find, near, plan), Carta's order and the cheapest, priciest, highest scored, warmest and driest of the first 6; for a budget, fits within or over the budget per pick; for a when, the driest and warmest month and that crowd data is yearly. At most 6 such notes.
- Constant: `comparisonNotes` in `continent-app/src/lib/ask/context.js:84`; cap `context.js:196` (6)
- Test: `continent-app/tests/askGenerate.test.mjs` :: "budget verdicts and when notes are written by code"
- Test: `continent-app/tests/askGenerate.test.mjs` :: "comparisons must cite a code-made comparison note; estimates keep their tilde"

### ASK-023 The notes pack
- Decides: everything the model may say.
- Rule: order: the lead, the code comparisons, one fact row per pick (first 6), table rows (when and compare) while under 10 notes, honesty notes while under 9, then retrieved passages only about a pick or about no one place. Each note cut at 300 characters, at most 14 notes, answer at most 380 tokens. A pack with another prompt version, an unknown language, an empty or over-long note or question is refused.
- Constant: `MAX_NOTES` = 14, `MAX_NOTE_CHARS` = 300, `MAX_ANSWER_TOKENS` = 380, `PROMPT_VERSION` = 4 in `continent-app/src/lib/ask/context.js:24` to `:29`
- Test: `continent-app/tests/askGenerate.test.mjs` :: "wire packs are checked before anything runs"

### ASK-024 Which back end writes
- Decides: whether the written answer comes from the traveller's own device or Carta's server.
- Rule: the on-device model when it is switched on and loaded, else `POST /api/ask/answer`; the server gets 12000 ms to send its first piece, then the facts answer stands alone.
- Constant: `FIRST_TOKEN_MS` in `continent-app/src/lib/ask/generate.js:30` = 12000
- Test: `continent-app/tests/askGenerate.test.mjs` :: "writeAnswer uses the on-device model first when it is ready"
- Test: `continent-app/tests/askGenerate.test.mjs` :: "writeAnswer says why when the server cannot write"

### ASK-025 Server model chain
- Decides: which open model writes on the server.
- Rule: `@cf/qwen/qwen3-30b-a3b-fp8`, then `@cf/meta/llama-3.2-3b-instruct` if the first throws; temperature 0.2, streamed.
- Constant: `MODELS` in `continent-app/functions/api/ask/answer.js:50`; temperature `answer.js:133` = 0.2
- Test: `continent-app/tests/askGenerate.test.mjs` :: "answers, caches, settles the count, and stops at the cap"

### ASK-026 Daily Neurons cap
- Decides: when the written answer stops for the day and only the facts answer shows.
- Rule: a KV counter `n:<UTC date>` (kept 2 days); the worst case (input tokens at 1 token per 3.5 characters plus 380 output tokens, priced on the first model) is booked before the call and settled to the real cost after; refused with `429 cap` when used + worst > 9000.
- Constant: `CAP` in `continent-app/functions/api/ask/answer.js:45` = 9000; booking `answer.js:122` to `:124`
- Test: `continent-app/tests/askGenerate.test.mjs` :: "answers, caches, settles the count, and stops at the cap"
- Test: `continent-app/tests/askGenerate.test.mjs` :: "every golden question's pack fits about 400 free answers a day"

### ASK-027 No counter, no model
- Decides: that a missing binding can never run up a bill.
- Rule: without the `AI` binding `503 off`; without the `ASK` KV binding `503 nocap` (the client reads it as off).
- Constant: `continent-app/functions/api/ask/answer.js:88` to `:89`
- Test: `continent-app/tests/askGenerate.test.mjs` :: "no counter, no model: the Function refuses without the ASK binding"

### ASK-028 Body size and request rates
- Decides: when a busy or abusive caller is turned away.
- Rule: an answer body over 8192 bytes is `413 size`; 8 answers a minute per IP and 60 searches a minute per IP, counted per isolate and by the `RATE_LIMIT` binding when the account has one (a failing binding never blocks).
- Constant: `MAX_BODY` = 8192 and `RATE` = 8 in `continent-app/functions/api/ask/answer.js:47` to `:48`; limiter `max: 60` in `continent-app/functions/api/ask.js:35`
- Test: `continent-app/tests/functionGuards.test.mjs` :: "the answer route refuses an oversized body with no content-length, and a missing binding first"
- Test: `continent-app/tests/functionGuards.test.mjs` :: "the limiter counts per key inside its window and lets the window pass"

### ASK-029 Written answers are cached a week
- Decides: that the same question with the same notes is answered once.
- Rule: key `a:g<GUARD_VERSION>:` + SHA-256 of [prompt version, language, lower-cased question, notes]; kept 7 days; only what the output guard let out is stored, and nothing when it withdrew the answer. A cached answer passes the guard again.
- Constant: `CACHE_TTL` in `continent-app/functions/api/ask/answer.js:46` = 7 x 24 x 3600; `packKey` in `continent-app/src/lib/ask/context.js:251`
- Test: `continent-app/tests/askGenerate.test.mjs` :: "answers, caches, settles the count, and stops at the cap"
- Test: `continent-app/tests/aiGuard.test.mjs` :: "a guarded Ask answer is cached as shown, and a cached answer passes the guard again"

### ASK-030 Every sentence is checked
- Decides: which model sentences the traveller sees.
- Rule: a sentence shows only once finished ("9.1" and "est. a day" do not end it) and only if it cites at least one existing note, every figure in it is in a note or the question, it names no catalogue place (4+ letters, capitalised) missing from the notes and question; `<think>` blocks, markup and dashes are removed.
- Constant: `makeChecker` in `continent-app/src/lib/ask/verify.js:97`
- Test: `continent-app/tests/askGenerate.test.mjs` :: "the checker drops invented figures, places and uncited sentences"
- Test: `continent-app/tests/askGenerate.test.mjs` :: "sentences split on end marks, never inside 9.1 or est."

### ASK-031 Verdicts need a code note; estimates keep "~"
- Decides: that the model cannot invent "cheaper" or drop an estimate mark.
- Rule: a comparing or judging word in six languages (except season phrases such as "best months") must cite a code comparison note or a note that makes the same comparison; a figure the notes give only with "~" must keep it.
- Constant: `COMPARE` and `NOT_A_VERDICT` in `continent-app/src/lib/ask/verify.js:72` and `:83`
- Test: `continent-app/tests/askGenerate.test.mjs` :: "comparisons must cite a code-made comparison note; estimates keep their tilde"

### ASK-032 Withdrawal of the written answer
- Decides: when the whole written answer is taken away and only the facts answer stays.
- Rule: withdrawn when no sentence passes or more than 30 percent fail (sentences dropped by ASK-033 count too).
- Constant: `WITHDRAW` in `continent-app/src/lib/ask/verify.js:21` = 0.3; `continent-app/src/lib/ask/generate.js:128` to `:132`
- Test: `continent-app/tests/askGenerate.test.mjs` :: "the checker drops invented figures, places and uncited sentences"
- Test: `continent-app/tests/askAgree.test.mjs` :: "the live failure: a note-named place without a card never reaches the traveller"

### ASK-033 Answer and cards agree
- Decides: that the written answer never praises a place the traveller cannot see, or another place's price.
- Rule: with the first 3 picks as cards, a sentence fails when it names a catalogue place with no card, puts a figure beside a place that no cited note about that place (or about no one place) carries, or names a month no cited note or the question names. For find, budget, when, plan and near the places must be named in card order, or the written answer is withdrawn; a compare keeps the asked order.
- Constant: `SHOWN_PLACES` in `continent-app/src/lib/ask/reply.js:14` = 3; `RANKED` in `continent-app/src/lib/ask/agree.js:20`
- Test: `continent-app/tests/askAgree.test.mjs` :: "answer and cards agree: ${q}"
- Test: `continent-app/tests/askAgree.test.mjs` :: "a text that reorders a ranking is withdrawn, a comparison keeps the asked order"
- Test: `continent-app/tests/askAgree.test.mjs` :: "a figure from another place's row is dropped"

### ASK-034 Short reply and its pace
- Decides: how long the written reply is and how it appears.
- Rule: at most 3 sentences, note marks removed; words revealed at 30 ms each, faster so the whole reply ends in about 1.4 s, never under 8 ms a word; the typing bubble shows at least 750 ms; past 2500 ms the real steps show instead. With no written answer, one line names the places.
- Constant: `MAX_SENTENCES` = 3, `MIN_TYPING_MS` = 750, `SLOW_MS` = 2500 in `continent-app/src/lib/ask/reply.js:15` to `:19`; `revealPace` in `reply.js:55`
- Test: `continent-app/tests/askChat.test.mjs` :: "the reply keeps three sentences, drops note marks, and paces the reveal"

### ASK-035 Cards and starters on screen
- Decides: how many place cards and suggested questions show first.
- Rule: 3 cards, "more places" adds 3 at a time up to the 6 picks; 3 of 7 starter questions show until "more".
- Constant: `SHOWN_PLACES` in `continent-app/src/lib/ask/reply.js:14` = 3; `SHOWN` = 3 and `START` in `continent-app/src/browse/ask/AskChat.jsx:40` to `:41`
- Test: no test

### ASK-036 On-device model
- Decides: whether the traveller can get a private, offline written answer.
- Rule: opt in only (`carta.ask.onDevice.v1` = "1"); needs WebGPU with shader-f16 and, when the browser reports it, at least 4 GB of memory; loads only after a click. Default Qwen 2.5 1.5B (about 845 MB), alternative Gemma 2 2B (about 1429 MB) via `VITE_ASK_MODEL`; context window 4096; files from Carta's data host.
- Constant: `OPT_IN_KEY` in `continent-app/src/lib/ask/onDevice.js:41`; `MODELS` in `onDevice.js:61`; memory check `onDevice.js:148`; `DEFAULT_MODEL_BASE` in `onDevice.js:44`
- Test: `continent-app/tests/askOnDevice.test.mjs` :: "isSupported is false without navigator.gpu"
- Test: `continent-app/tests/askOnDevice.test.mjs` :: "opt-in persists in localStorage under carta.ask.onDevice.v1"
- Test: `continent-app/tests/askOnDevice.test.mjs` :: "generate rejects when the model is not loaded, and nothing loads on its own"

### ASK-037 Chats kept on the device
- Decides: how many chats and turns a traveller keeps, and how the history groups them.
- Rule: newest first, at most 30 chats of at most 40 turns (the oldest turns go); an empty chat is never kept; the title is the first question cut at a word near 60 characters with "..."; history groups: today, the last 7 days, older.
- Constant: `MAX_CHATS` = 30, `MAX_TURNS` = 40, `TITLE_MAX` = 60 in `continent-app/src/lib/ask/sessions.js:18` to `:21`; week `sessions.js:79`
- Test: `continent-app/tests/askChat.test.mjs` :: "a chat's title is its first question, cut at a word"
- Test: `continent-app/tests/askChat.test.mjs` :: "an empty chat is never kept, and the list is capped"
- Test: `continent-app/tests/askChat.test.mjs` :: "chats group into today, the last 7 days and older"

### ASK-038 Device and account chats merge
- Decides: which copy of a chat survives on a signed-in traveller's devices.
- Rule: the newer side wins; an account tombstone removes the device copy unless the device changed it later; a chat only on the device is uploaded.
- Constant: `mergeChats` in `continent-app/src/lib/ask/sessions.js:98`
- Test: `continent-app/tests/askChat.test.mjs` :: "device and account chats merge: newer wins, tombstones delete, device-only chats go up"

### ASK-039 Index passages
- Decides: what text a written answer can quote and which place it belongs to.
- Rule: each passage is 1 to 3 whole sentences, at most 300 characters (a long first sentence cut on a word), with dashes rewritten ("to" between prices, hyphen in ranges, comma in prose); a passage without a destination attaches to the nearest destination in its country within 25 km.
- Constant: `MAX_TEXT` = 300 and `NEAR_KM` = 25.0 in `pipeline/ask_index_layer.py:76` to `:77`; `clip` in `ask_index_layer.py:224`; `_DASH` in `ask_index_layer.py:247`
- Test: no test

### ASK-040 Size budget of the browser index
- Decides: whether highlights are searchable in the browser or only on the server.
- Rule: if the BM25 file is over 400 KB gzipped, it is rebuilt from dest + lexicon only.
- Constant: `BUDGET_GZIP` in `continent-app/scripts/build-ask-bm25.mjs:26` = 400 x 1024; `FALLBACK` in `build-ask-bm25.mjs:29`
- Test: no test

## Rules with no test

ASK-001, ASK-008, ASK-012, ASK-014, ASK-016, ASK-019, ASK-035, ASK-039, ASK-040

## HANDBOOK disagreements

| HANDBOOK says | Code does | Where |
|---|---|---|
| Responses of `/api/ask` are "edge cached for 1 hour (`HOLD` = 3600)" | Sends `cache-control: public, max-age=3600`, a browser and shared cache header; no edge cache API is used | `continent-app/functions/api/ask.js:28`, `:122` |
| Rate: 8 answers a minute per IP, per isolate (best effort) | Also asks the `RATE_LIMIT` binding first when the account has one; `/api/ask` search has its own 60 a minute limit the HANDBOOK does not name | `continent-app/functions/api/ask/answer.js:56`, `continent-app/functions/_lib/guard.js:68`, `continent-app/functions/api/ask.js:35` |
| On-device runs "WebLLM 0.2.85" | The package is 0.2.85 but the model libraries are pinned at `v0_2_84/base` | `continent-app/src/lib/ask/onDevice.js:51`, `continent-app/package.json:33` |
