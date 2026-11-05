# Owner procedure: Legal, tax and brand (T1072, ROADMAP A3)

Reviews, registrations and wording only you or a qualified person can sign off. ROADMAP I1 (sole trader, late registration) and I-R4, I-R5 decide the route.

Steps are the open register rows with Owner `user` that belong to this system, in register order: the Order column first, then task number. A row's own wording says what it waits on ("after", "before"); that is repeated beside the step. Nothing here is new: each step is a row, and the task report named in the row has the detail. When you finish a step, tell a session the row id; it moves the row to `Execution/_OPEN-CLOSED.md`.

Rows: 26. Register rows point back here.

## Steps

1. **T575-b** (register order: 2): The privacy policy should say that, signed in, Ask Carta's questions and answers are kept in the account and appear in the export
2. **T1048-a** (register order: 2): Do research I-R4 (registering late, admin and VAT yourself) and I-R5 (do-it-yourself legal) before P4, decide I-f (yearly plan as a non-renewing 12-month pass), and retire T015, T033-g and the lawyer-review rows in the A3 triage (ROADMAP I1)
3. **T1052-a** (register order: 2): Stop scraping Google Flights before the first paid sale (after measuring Aviasales Data API coverage in P1), and review decision I-g (keep scraping beds, or option C) before applying to the Booking.com affiliate programme in P4 (ROADMAP I16)
4. **T032-e**: The Article 16(m) classification (digital content, not service) in the terms is unreviewed by anyone qualified
5. **T033-g**: T015, the accountant's VAT answer, does not exist as a file; the Belgian registration must match it
6. **T206-c** (register order: before T206-b): A CC licence alone does not let an upload flow into OpenStreetMap (CC BY 4.0 needs the OSMF waiver, CC BY-SA is incompatible); Legal confirms the wording of a separate OSM permission tick against the OSMF cover-letter and waiver template before the upload form is built or anything is said to the OSM community
7. **T216-b** (register order: after T216-a): After a month of keeping the two-day answer time, decide whether the Terms contact paragraph should state it instead of 30 days
8. **T300-a** (register order: before launch): The EUIPO trademark search for "Carta" was never run (T022 wrote a guess; Legal.md line 100 says Not done); search classes 9, 39 and 42 on euipo.europa.eu and record the result in Legal.md
9. **T300-e** (register order: before stage 10): Commercial-terms gates found in T010 and T021 with no row: Ferryhopper, OpenSky and Numbeo terms forbid or limit commercial use; decide per source (licence, replace, drop) before the first sale; Open-Meteo is already stage 10.4
10. **T300-h** (register order: after T014): The Imprint (T012) still has placeholders for the registered entity (name, number, address) that only T014 can fill
11. **T310-a**: 22 ledger rows carry the storable verdict `Verify` (their licence cell says verify, or terms are agreement-bound): confirm the terms before a stored copy of those sources ships
12. **T319-a** (register order: after T319-b for the 180-day sentence): The owner approves or edits the legal wording T319 wrote, as one review: PrivacyPolicy.jsx (what an account holds, Cloudflare, Stripe and its controller wording, the servers the browser fetches from, the AI cache, crashes, guide view hashes, launch counters, what stays after deletion, the six-row legal basis table with contract for the AI features and legal obligation for the VAT country, the pass offer log at 180...
13. **T333-f** (register order: before uploads go live): The Terms promise account holders 30 days' notice by email before a change takes effect; the new upload section is such a change, so the notice must go out at least 30 days before uploads go live, which needs the email route of owner step J6
14. **T336-a** (register order: after T207-a): Approve or rewrite the courtesy note and the co-announce paragraph in docs/LAUNCH-OUTREACH-DRAFTS.md, fill the placeholders once D is set, and send by hand (notes at D after the posts are up, co-announce question in the D-21 partner emails); nothing has been sent
15. **T336-b** (register order: before D): Decide which of CARTO, OpenTripMap, Open-Meteo and Exchange Rate API receive a courtesy note, and read UNESCO's terms of use (marked verify in attribution.js) before any note goes to it; confirm /about/numbers on the Pages deploy first (T318-a)
16. **T365-c** (register order: before the first takedown that cites the rule): Legal review (J4) of the draft 'Public guides: the content rule' in TermsOfService.jsx (items c1 to c7, the only terms grounds 051 accepts), the good-faith wording on the report form, and the Terms date moved to 7 October 2026
17. **T401-h**: The legal bodies (Imprint, Privacy policy, Terms of service) are English prose only; translating them needs a legal read, so only their close label and dialog behaviour were done
18. **T461-b** (register order: before T460-a goes live): Publish the Imprint's business details (T015: legal name, address, KBO/BCE number); the page says registration is in progress, and EU e-Commerce Art 5 needs them before passes sell
19. **T461-c**: The privacy policy, terms and imprint stay English only in all six languages; translating them is a product and legal call
20. **T461-d**: The Terms say some outbound links earn a commission while PRODUCT.md says Carta takes no commission on travel; one of the two has to change
21. **T461-i**: The legal body follows the 68ch --measure token (about 95 characters a line; detector line-length x63); tightening it is a token call
22. **T516-a**: Airline logos are copied from Google's static flight logo host into R2 data/airlines/; check the terms (ledger row google_airline_logos says Verify)
23. **T518-c**: Google's terms do not allow automated reading of Google Flights pages; the owner accepted the risk on 2026-10-21 (ledger row google_flights_fli says Verify); revisit before launch
24. **T519-a**: Review the Terms of Service paragraph on flight prices (continent-app/src/components/TermsOfService.jsx): Google Flights' price when checked, not an offer, bags as estimates
25. **T641-a**: Confirm commercial terms of the Swiss national timetable (opentransportdata.swiss) and verify Delcomar and any bus feed, then set licence_verified in pipeline/transit/feeds.json
26. **T1060-a**: Run the TMview, EUIPO and BOIP searches for carta in classes 9, 39 and 42 (queries in docs/brand/POSITIONING.md) and decide: keep Carta (class 39, word plus logo) or switch before any brand spend
