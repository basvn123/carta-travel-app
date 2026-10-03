# T319: legal and privacy copy matches the code

## Task ID

T319 (register rows T300-b, T300-c, T268-c, T273-b; also T315-c and T315-d, and T270-a folded into one owner review). Branch p1-legal-copy in the root repo and in continent-app.

## Date

2026-10-03

## What changed

The privacy policy, the Terms of Service and the export hint now describe what the code does, and the Article 30 record exists as a file. All of the wording is a proposal: the owner approves or edits it in one review (row T319-a). It is in the components already, so the branch ships it unless the owner changes it first.

The privacy policy (`src/components/PrivacyPolicy.jsx`, English only like the other legal texts) had five statements the code contradicts and eight things it did not disclose. The contradictions: "nothing personal leaves your device" without an account (the host sees the IP, and a signed-out reader of a guide is counted by a hash of the IP, 045); "That is all" after listing email, name and trips (profiles, friends, shares, co-planners, passes, AI usage, feedback and reports are stored too, per the export keys in 048); "a short-lived server cache (24 hours)" (parse-booking only reads `ai_plan_cache` rows for 24 hours; nothing ever deletes them); analytics "retained for 90 days ... automatically deleted" (022 prunes at 180 days and nothing calls the prune); and deletion removes "everything stored with it" (feedback and reports keep their text and reply email with the account id set to null, 017 and 037). The new text says each of these as it is. The analytics section now says the sign-up, active-user and top-destination counts are computed from the account and trip rows themselves (017 reads `auth.users` and `trip_plan_stops`), and that the one event record, the pass offer log, is kept for 180 days and then deleted. That sentence is true only once the prune runs, so row T319-b asks for a migration that prunes on write, as 040 does, pasted right after 022; 022 is not live, so no event exists yet that the sentence could be wrong about.

The eight new disclosures: Cloudflare as host (Pages and R2, T293); Stripe, what Carta sends it (`customer_email`, `client_reference_id` in `checkout/index.ts`) and keeps (amount, currency, billing country, fee, consent, 025 to 044), and its own controller role; the servers the browser fetches from directly, taken from the CSP in `public/_headers` (CARTO and OpenStreetMap tiles, Wikimedia, Geograph, flagcdn.com, Google Fonts, foto-webcam.eu) and Overpass from `cityResearch.js`; render crashes kept 90 days with no message, stack or page (047); the guide view counter's two-day salted hash (T268-c, 045 line 764); the launch counters as daily totals that are not personal data (T315-d, 048); what the export file holds (T315-d, schema 3); and a legal basis for the AI features. The legal basis table grew from three rows to six: contract for what a traveller sends the AI features (there is no consent step, which T022 wrongly claimed), contract plus legal obligation for passes (the billing country is kept for the VAT One Stop Shop threshold, 026), and legitimate interest for the failure records and view hashes. The two em dashes at about line 127 are gone. The date reads 3 October 2026.

The Terms section "Every figure is an estimate" (`src/components/TermsOfService.jsx`, T273-b) no longer describes flight fares as Carta's estimates built from published fares with carrier and freshness notes. It now says Carta does not price flights, that a flight counts in a total only when the traveller types what they paid and that Carta does not check that figure, and describes ground fares as the per-kilometre, per-country and per-mode model calibrated on observed prices (`docs/ESTIMATION.md` line 17). The next paragraph adds one sentence: a total leaves the flights out unless the traveller entered a fare. The section names no data source, so it does not widen T098-a (Numbeo); it points at the screen, which names the source.

`account.exportHint` in all six locales (T315-c) now names day plans, profile, friends and co-planners, passes and purchases, AI use and the account history instead of trips, stops and pass offers.

`docs/ARTICLE30.md` is the new record (T300-b). It lists 19 processing activities, each with the table and migration it lives in, the lawful basis and the retention as the code enforces it, then the seven recipients, the rights and how each is met, the security measures, the six errors in T022's draft, and the open points before the owner signs. Two facts in it are new findings, not taken from the source reports: `ai_plan_cache` rows are never deleted (T319-c), and every page view loads six font families from Google Fonts (T319-d). T018 calls Stripe an independent controller in its body and a joint controller in its open items; the record uses the first and T319-a asks the owner to settle it against Stripe's DPA.

## Files touched

**Modified (app, continent-app):**
- src/components/PrivacyPolicy.jsx
- src/components/TermsOfService.jsx
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (account.exportHint only)

**Created (root):**
- docs/ARTICLE30.md
- Execution/P1/T319-legal-copy-matches-code.md

**Modified (root):**
- Execution/_OPEN.md (T268-c, T270-a, T273-b, T300-b, T300-c, T315-c, T315-d closed by T319; T319-a to T319-d added)

No migration, no CSS, nothing in rule 4's list.

## Commands run

From the app worktree, Git Bash. Edits were made with Python scripts that keep each file's CRLF endings and the locale files' BOM (the i18n script was written with the Write tool, because a heredoc ate its backslashes).

```
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
npx eslint src/components/PrivacyPolicy.jsx src/components/TermsOfService.jsx
node scripts/ci/banned-terms.mjs
node scripts/ci/design-lint.mjs
# dev server, config outside the repo (wt/vite.t319.mjs, vite imported by file URL), Supabase URL and anon key from the main checkout's .env as environment
npx vite --config ../vite.t319.mjs --port 5204 --strictPort --host 127.0.0.1
OUT=<scratchpad>/shots node <scratchpad>/t319_legal_probe.mjs     # scratch Playwright probe, not committed
PORT=5204 node scripts/verify_data_export.mjs
```

Facts were read with grep over `supabase/migrations/`, `supabase/functions/`, `index.html`, `public/_headers` and `src/`. No database, no build, no push.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Privacy policy statements the code contradicts | 5 | 0 | -5 |
| Data flows in the code the policy did not mention | 8 | 0 | -8 |
| Legal basis table rows | 3 | 6 | +3 |
| Em dashes in PrivacyPolicy.jsx | 2 | 0 | -2 |
| Terms sentences that describe Carta flight fares | 2 | 0 | -2 |
| Kinds of data named in account.exportHint (schema 3 has 20 keys) | 3 | 8 | +5 |
| Article 30 record: errors (T300 count) | 6 | 0 | -6 |
| Article 30 record: processing activities listed | 6 | 19 | +13 |
| Article 30 record: recipients listed | 5 | 7 | +2 |
| Locale files that parse | 6 | 6 | 0 |
| banned-terms.mjs violations | 0 | 0 | 0 |
| design-lint.mjs new violations | | 0 (548 of 548 in baseline) | |

| Scratch probe on ?legal=privacy and ?legal=terms, 380px and 1360px | | 73 of 73 | |
| verify_data_export.mjs (Account panel, desktop and 380px) | | all checks passed | |

The probe opened each text by its URL at both widths and checked: the title; no em dash, middot or banned word; every new phrase present and every removed claim gone; the new date; no sideways scroll; the modal inside the viewport and scrolling inside itself; the six-row table inside the modal; that the cross closes it and strips the parameter; no page errors. I looked at the screenshots of the rewritten sections at both widths. verify_data_export.mjs ran against the same dev server and covers the profile spoke where account.exportHint shows, including its 380px check.


## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first i18n script did not compile | A Bash heredoc ate the backslashes in the regex (the known heredoc trap) | Wrote the script with the Write tool and matched the line by its prefix instead of a regex |
| Vite would not load the session config | The config in wt/ imported 'vite' from a folder with no node_modules | Imported vite by its absolute file URL, as T315 did |
| The first probe run timed out on its first page load | The dev server's cold dependency bundling under the other sessions' load took over three minutes | Raised the probe's timeouts and ran it again |

## What is still open

T319-a (user). One review of everything above: the privacy policy as a whole, the Terms section, the six export hints, the Stripe role wording, the Supabase region (the record says EU from the policy; T319 did not re-read the Dashboard), and the signature on docs/ARTICLE30.md. It carries T270-a (the two paragraphs T270 wrote) and T315-d (the counter and export sentences), whose rows are closed into it. The 180-day sentence should be approved after T319-b lands.

T319-b (next task, before the 022 paste). 022's `prune_paywall_events(180)` is called by nothing; no migration was allowed here. The fix is a migration that makes `paywall_event` delete events older than 180 days in batches on every write, the way `log_edge_error` does in 040, and a line in stage 2 to paste it right after 022.

T319-c (next task). `ai_plan_cache` keeps every row for ever; the functions only stop reading a row after 24 hours (parse-booking) or 7 days (plan-day). A parse row can hold booking references. Add a prune, then change the policy's "older cache entries are not yet deleted automatically" to the real period.

T319-d (next task). `index.html` loads Instrument Sans, IBM Plex Mono, Fraunces, Plus Jakarta Sans, Inter Tight and JetBrains Mono from fonts.googleapis.com, so every page view sends the visitor's IP to Google. The policy now says so. Self-hosting removes the transfer; it needs the CSP in `public/_headers`, a rule 4 file, narrowed by a task that holds the exception. T199 (wave 8, merged into app master while this task ran) resolved it: the fonts are self-hosted from `public/fonts`, Google Fonts is gone from `index.html` and the CSP, so a follow-up commit on this branch took Google Fonts out of the policy and docs/ARTICLE30.md and marked T319-d closed by T199.

Not new rows, but true and worth knowing: several sentences describe migrations that are not pasted yet (the export download needs 024 and is complete only at 048; the failure records need 040 and 047; the view counter needs 045; the counters need 048). They become true at each paste in stage 2, and nothing they describe happens before it. The Cloudflare DPA (T300-j), the pass_grants cascade (T217-d) and the retention of reports and statements (T068-g, T070-g) stay with their own rows; docs/ARTICLE30.md lists them as open points before signing.

## Rollback procedure

Nothing is applied to any database and nothing is pushed. Revert the T319 commit in continent-app (`git -C continent-app revert dac9b3b`) and the T319 commit in the root repo (`git revert` the commit that adds this report), or drop the p1-legal-copy branches before merge. The revert puts back the old policy (with its five contradictions), the old Terms section, the old export hint, deletes docs/ARTICLE30.md, and reopens the seven closed rows.

## Carta-design check

1. No hex value added. 2. No colour, serif, gradient or shadow; no CSS changed. 3. `--flag` not touched. 4. No mono text added. 5. No button added. 6. Every new heading is an existing one; no em dashes, no middots, no banned words in the new text (the probe checks all three). 7. Removed: the stale analytics claim and the flight fare paragraph.
