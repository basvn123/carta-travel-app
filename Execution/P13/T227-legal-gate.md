# T227: Legal gate

## Task ID

T227 (branch p13-legal-gate). Audit only. The first pass is commit 54cc9c9e6; this report replaces it in a fix commit on the same branch.

## Date

2026-10-06

## What changed

Nothing in the app or the database. The ten items of the legal gate were checked one by one, in source and, where a page can be loaded, on production (https://www.carta-europetravel.com, served by Cloudflare Pages since T293). The production checks were a headless Playwright page load with no sign-in and no form submits. A plain curl proves nothing here, because the site is a single page app and curl only returns the empty shell.

The result is 3 pass, 6 fail and 1 cannot-verify-here. The finding that matters most: production serves an older build than main. The privacy page on production is dated 2 October 2026, has a three-row lawful-basis table, keeps analytics 90 days and does not mention Stripe or the data export. The terms page on production is dated 23 September 2026 and has no "does not price flights" wording. Main carries the T319 rewrite of both, dated 3 October 2026 (PrivacyPolicy.jsx line 16, TermsOfService.jsx line 39). So several items below pass in source and fail on production until the next Pages deploy.

Verdicts, one per item of the task.

1. Imprint live with a real address and enterprise number: fail. continent-app/src/components/Imprint.jsx lines 22 to 30 hold only placeholders ("[Awaiting T015: Legal business name]", street, postal code, city, country, KBO/BCE number, VAT number). Production shows the same placeholders at /?legal=imprint, with "Last updated 23 September 2026". Only the owner can fix it, once the entity is registered (T014, T015). Register row T300-h.

2. ToS live and linked from checkout, with the 14-day waiver presented and recorded: cannot-verify-here. The terms page is live on production at /?legal=terms and its withdrawal section is there (heading "Your right to withdraw, and why checkout asks you to waive it", TermsOfService.jsx line 216). The checkout half cannot be seen because Stripe has never been live. How it is built: supabase/functions/checkout/index.ts has no confirmation_url field. It sets consent_collection { terms_of_service: 'required' } and custom_text.terms_of_service_acceptance (lines 117 to 127), a message with our waiver wording and a markdown link to the CHECKOUT_TERMS_URL secret. That block is off unless the secret is set (line 117), and Stripe rejects the session if the Dashboard Terms URL is empty (file header). The secret is planned as https://carta-europetravel.com/?legal=terms (_OPEN-MASTER.md line 1077) and is not set. Recording is built too: stripe-webhook/index.ts reads session.consent.terms_of_service (lines 111 to 116) and passes p_consent_tos and p_consent_terms_url to grant_pass (lines 183 to 186), which stores them on pass_grants through migration 025_withdrawal_waiver.sql (columns consent_tos, consent_at, consent_terms_url). Migration 025 is not applied, the webhook is not deployed and the secret is not set, so today nothing is presented and nothing is recorded. Verifying needs a Stripe test purchase after stage 10. Register rows T032-a, T032-b, T032-c and T030-b, all open.

3. Privacy policy carries the lawful-basis table and retention periods: fail on production, pass in source. In source, PrivacyPolicy.jsx has the six-row table (heading line 142, table lines 147 to 187) and states retention: account data until deletion (line 128 onward), AI failures and crashes 90 days and parse failures 30 days (lines 103 to 108), guide view hashes two days, pass offer events 180 days (lines 189 to 201, matching prune_paywall_events in migration 022 line 254). On production the page is the older text: three table rows and analytics kept 90 days. Two gaps remain in source as well: the AI cache is never deleted (T319-c) and the prune that makes the 180 days true is not scheduled (T319-b). Register rows T227-b (deploy), T319-a, T319-b, T319-c.

4. GDPR export and erasure both work: fail. Erasure is built: AuthContext.jsx line 188 calls supabase.rpc('delete_user'), defined in migration 005_delete_user.sql, reached from the Account panel (handleDeleteAccount, AccountPanel.jsx line 635). I did not call the live project, so I could not confirm 005 is installed there; it is an early migration and nothing in _OPEN-MASTER.md says otherwise. Export does not work live: AuthContext.jsx line 209 calls export_user_data, which migration 024_export_user_data.sql defines, and the _OPEN-MASTER.md stage 2 table (row 2) says 024 is not pasted, so the Account panel reports a missing function (AccountPanel.jsx line 620 handles that case). Migration 048, which widens the export, is not pasted either (T315-a). The function takes no user id and reads auth.uid(), which is the right design. No new row: the pastes are owned by the stage 2 table and T315-a.

5. DPAs confirmed and filed: fail. Execution/P1/T018-vendor-dpas.md records Supabase (DPA version 1, 2026-08-01), Stripe (DPA last updated 2025-11-18) and Google for Gemini (Gemini API Additional Terms effective 2026-03-23 plus the Cloud DPA), each with a URL and a date. It also records Vercel, whose DPA covers Pro and Enterprise only while Carta was on Hobby; Vercel is now the former host. Cloudflare, which now hosts the app (Pages) and the data (R2) per T293, is not on record: docs/ARTICLE30.md says "Not checked" for it. "Filed" here means URL and version in the T018 register, not a stored copy of each agreement. The public services the privacy policy names (OSRM, Nominatim, Overpass, CARTO, OpenStreetMap, Wikimedia, Geograph, flagcdn.com, foto-webcam.eu) receive only an IP address or a search text and have no DPA on record. Register row T300-j (open).

6. Map attribution visible: pass. Every MapLibre map in src sets attributionControl { compact: true } (CyclePage.jsx line 126, DestMap.jsx line 165, ExploreMap.jsx line 255, PointMap.jsx line 31, TrailPage.jsx line 369, CityPickerMap.jsx line 61, CountryPickerMap.jsx line 101, DayExploreMap.jsx line 52, TripMap.jsx line 245). On production, opening Explore and then Map rendered one .maplibregl-ctrl-attrib control whose text reads "© CARTO, © OpenStreetMap contributors". The Account panel Data sources list is built from src/data/attribution.js.

7. Per-file Commons credit on POI thumbnails: fail. The data ships (the ledger says 2,766 photos each with url, author, licence and licence_url, docs/tos/data_licenses.md line 307), but POI thumbnails render no author line. The only per-file credit I found for Commons photos is the destination gallery in DestinationPage.jsx lines 214 to 224: a small info link with the author and licence in a title and aria-label, and only when the photo has a page URL. That is not a visible credit line and it is not on POI thumbnails. The ledger itself still lists the gap as follow-up item 1 (data_licenses.md line 398) and as MISSING in rows 179 and 307. Register row T227-a (open, reworded here).

8. Licence ledger has no open rows: fail. The ledger is docs/tos/data_licenses.md, generated from src/ingestion/core/registry.py. Its follow-up list (from line 382) has three items still open: item 1 the Commons per-file credit (line 398), item 4 Hostelworld and LiteAPI display terms with the partner agreements pending (line 414), item 5 feeds marked Raw ETL only (line 416). Below it (line 430), three licensing-scope risks are still flagged: Ferryhopper, OpenSky and Numbeo. Eight rows carry MISSING in the credit column (lines 125, 126, 156, 179, 303, 305, 306, 307), and 22 rows carry the storable verdict Verify. Register rows T227-a, T227-c (new, for item 4, which had no row), T300-e (the three scope risks), T310-a (the 22 Verify rows).

9. Article 30 record written: pass. docs/ARTICLE30.md exists (written 2026-10-03 by T319). It is a draft for the owner to check and sign, and it records Cloudflare as unchecked. So it is written, not yet signed (T319-a, open).

10. Cookie banner only if analytics were added in T069: pass. No banner is needed and none exists. T069 is the takedown RPC (Execution/P4/T069-takedown-rpc.md) and added no analytics; the telemetry task is T071, whose report (Execution/P4/T071-error-telemetry.md, section "The cookie-consent question") records that nothing is stored on the device and no third-party script was added. index.html loads one script, the app bundle, and src holds no Sentry, Plausible or Google Analytics code. Re-check this item whenever a third-party script is added.

Named in the session notes but outside the ten items: T300-a (EUIPO search, a user task, Legal.md still says Not done) and T070-e (DSA transparency database, not verified here) stay open. T273-b and T300-c are closed by T319 and are not reopened. T300-c is the 90 versus 180 day retention row, not a Commons row.

## Files touched

**Modified:**
- Execution/_OPEN.md (T227-a reworded; T227-b and T227-c added)

**Created:**
- Execution/P13/T227-legal-gate.md

No app, supabase or pipeline file was changed.

## Commands run

Read-only. Source checks were grep and sed over continent-app/src, supabase/ and docs/ in the main checkout. Production checks were a throwaway Node script using the Playwright already in continent-app/node_modules, run from continent-app/ and then deleted, so nothing is left in either repo. It opened /?legal=privacy, /?legal=terms and /?legal=imprint on https://www.carta-europetravel.com, read the dialog text, and opened Explore then Map to read the attribution control. No sign-in, no form submit, no call to the live Supabase project.

## Config and secrets set

None.

## Before/after measurements

Not measured. The verdict count in "What changed" is the only figure, and it comes from this audit.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first report (54cc9c9e6) checked a list of its own instead of the ten items, and its counts disagreed with its own list | Written without the task text beside it | Rebuilt around the ten items with one verdict each |
| It said checkout has a confirmation_url field pointing at ?legal=terms | Not read from checkout/index.ts | Corrected in item 2 |
| It said it closed T300-c and cited "migrations 025 to 044" and "migration 020 and the dossier layer ship the photo URIs" | Unchecked | T300-c claim removed; the other two claims dropped because the files do not support them |
| It said the pages were re-verified on production | It used curl on a single page app | Redone with a headless page load, which showed production is behind main |

## What is still open

Item 1: the Imprint holds placeholders until the entity exists (T300-h, existing row).

Items 2 and 4: stage 10 for the waiver (T032-a, T032-b, T032-c, T030-b) and the stage 2 pastes of 024 and 048 (T315-a). All existing rows.

Item 3: production serves an older build than main, so the T319 privacy and terms text is not live. New row T227-b: deploy current main to Cloudflare Pages by direct upload, then reload the three legal pages. T319-a, T319-b and T319-c stay as they are.

Item 5: the Cloudflare DPA (T300-j, existing).

Item 7: the per-file credit on POI thumbnails (T227-a), reworded to say the destination gallery already has a title-only credit link and POI thumbnails have none.

Item 8: ledger follow-up item 4, Hostelworld and LiteAPI display terms, had no row; new row T227-c. The other open ledger items already have rows (T227-a, T300-e, T310-a).

Item 9: the owner signs docs/ARTICLE30.md (T319-a, existing).

## Rollback procedure

Revert the fix commit on p13-legal-gate with git revert. Nothing else was changed, so there is nothing to undo in the app, the database or production.
