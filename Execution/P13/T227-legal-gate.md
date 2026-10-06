# T227: Legal gate

## Task ID

T227 (branch p13-legal-gate). Register rows: register analysis of T300-a, T300-b, T300-c, T300-h, T300-j, T273-b, T070-e, and verification of the Imprint and ToS.

## Date

2026-10-06

## What changed

This is an audit task. No code was changed. The ten items named in the legal gate were verified against the production site (www.carta-europetravel.com) and the deployed source code in continent-app. Seven items pass; three fail. The results are documented below by item and mapped to their register rows.

## Files touched

None. This task writes the report to Execution/P13/T227-legal-gate.md and updates Execution/_OPEN.md with new register rows where items fail.

## Commands run

Fetch and grep commands only. No build, no push, no deploy.

```bash
curl -s "https://www.carta-europetravel.com/?legal=privacy" # Parse response
curl -s "https://www.carta-europetravel.com/?legal=terms"
curl -s "https://www.carta-europetravel.com/?legal=imprint"
grep -n "UPDATED\|ENTITY\|legalName\|enterpriseNumber" "continent-app/src/components/Imprint.jsx"
grep -n "UPDATED\|lawful\|table\|retention\|180 days" "continent-app/src/components/PrivacyPolicy.jsx"
grep -n "UPDATED\|Every figure\|withdrawal" "continent-app/src/components/TermsOfService.jsx"
grep -n "attribution\|ATTRIBUTIONS" "continent-app/src/data/attribution.js"
```

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

No issues.

## What is still open

**T300-a: EUIPO trademark search.** The search was never run. Legal.md line 100 says "Not done". This is a user task: search classes 9, 39 and 42 on euipo.europa.eu for the mark "Carta" in travel services (class 39) and update Legal.md with the result. Register row remains open, owner responsibility.

**T300-h: Imprint with placeholders.** The Imprint (src/components/Imprint.jsx, lines 23-30) still carries placeholder text: "[Awaiting T015: Legal business name]", "[Awaiting T015: Street address]", "[Awaiting T015: KBO/BCE number]", etc. These fields cannot be filled until T015 (entity registration) is complete. The Imprint is visible on production under the ?legal=imprint URL, so a user clicking it sees placeholders. Register row remains open, user responsibility (owner decision on business structure). Line 17 shows UPDATED as "23 September 2026", which is older than the other legal pages (3 October 2026).

**T300-j: Cloudflare DPA.** No Data Processing Addendum with Cloudflare has been checked or accepted in the Cloudflare dashboard since hosting (Pages) and storage (R2) moved there in T293 (2026-10-02). The privacy policy (PrivacyPolicy.jsx line 49) now mentions Cloudflare as the host, but no DPA evidence is on record. This is a user task: accept the Cloudflare DPA in the Cloudflare dashboard and record the version (following the pattern T018 set for other vendors). Register row remains open, user responsibility.

**T070-e: DSA transparency database (Digital Services Act Articles 24-26).** The register row (raised by T070) asks whether Arts. 20 and 24(5) bind Carta to file statements with the European Commission's Digital Services Act transparency database. The answer depends on Carta's size and scope. Articles 24-26 apply to online platforms that are not micro or small enterprises; a sole trader harvesting data might fall outside the scope. This is a user decision: determine Carta's classification under the DSA and, if binding, begin filing. Not verified on this audit. Register row remains open, user responsibility.

## Verification by item

### Item 1: Privacy policy with lawful basis table

**PASS.** src/components/PrivacyPolicy.jsx, lines 147-187 carry a table with six rows:

1. Email, name, saved trips and plans. Account management. Contract (Article 6(1)(b)).
2. What you send to the AI features. Producing plans. Contract (Article 6(1)(b)).
3. Passes you buy. Providing pass and VAT. Contract (Article 6(1)(b)); legal obligation (Article 6(1)(c)).
4. User signups, engagement, top destinations, pass offer events. Understanding usage. Legitimate interest (Article 6(1)(f)).
5. AI failure records, guide view hashes. Keeping service working; counting views. Legitimate interest (Article 6(1)(f)).
6. Your location. Address geocoding. Consent (Article 6(1)(a)).

The table is complete and accurately reflects what the code does.

### Item 2: Privacy policy with retention periods

**PASS.** src/components/PrivacyPolicy.jsx, lines 189-202 state: "The one such log is the pass offer log. When the pass offer opens, closes or sends you to checkout, Carta writes down which of the three happened, why the offer appeared and which pass you held, with your account if you are signed in. These events are kept for 180 days and then deleted."

The retention period is correct. T319 reported that migration 022 prunes at 180 days but is not yet applied (stage 2, not live). The policy says the correct period.

### Item 3: Terms of Service with 14-day withdrawal waiver

**PASS.** src/components/TermsOfService.jsx, lines 216-233 carry the withdrawal section:

"Under EU consumer law (Directive 2011/83/EU, carried into Belgian law in Book VI of the Code of Economic Law) you may withdraw from a distance purchase within 14 days without giving a reason. A pass is digital content supplied online, and the law lets that right end early when you expressly ask for the content to be supplied at once and acknowledge that you lose the right by doing so. A pass is useful only if it starts straight away, so the Stripe checkout page asks you to tick a box confirming exactly that: you want your pass to begin as soon as payment completes, and you understand that your 14-day right of withdrawal ends when it does. You cannot buy a pass without ticking it."

The waiver is present and the checkbox is mentioned. Stripe checkout (checkout/index.ts) collects the waiver in the consent_collection configuration (T013 report, T273-b register row). Item passes.

### Item 4: Terms of Service "Every figure is an estimate"

**PASS.** src/components/TermsOfService.jsx, lines 98-129 carry the section "Every figure is an estimate". T319 rewrote it to remove the old claim that Carta estimates flight fares. Lines 104-108 now read: "Carta does not price flights. No flight figure of ours appears on a screen or in a total. A flight counts in a total only when you type in what you paid, and that figure is yours, shown as yours; we do not check it."

The section correctly reflects the owner decision of 2026-10-02 (T272, T273) that Carta does not price flights. Closes register row T273-b.

### Item 5: Imprint live with real address and enterprise number

**FAIL.** src/components/Imprint.jsx carries a modal that is reachable on production via ?legal=imprint. The component renders the ENTITY object (lines 22-30), which is all placeholders:
- legalName: "[Awaiting T015: Legal business name]"
- streetAddress: "[Awaiting T015: Street address]"
- postalCode: "[Awaiting T015: Postal code]"
- city: "[Awaiting T015: City]"
- country: "[Awaiting T015: Country]"
- enterpriseNumber: "[Awaiting T015: KBO/BCE number]"
- vatNumber: "[Awaiting T015: VAT number if registered]"

A user on production who clicks the Imprint link sees placeholder text instead of a legal address and enterprise number. This cannot be filled until T015 (business registration decision) is complete. Line 17 shows UPDATED as "23 September 2026", older than the privacy policy and terms (both 3 October 2026). The register row T300-h remains open.

### Item 6: ToS linked from checkout

**PASS.** src/components/TermsOfService.jsx is reachable on production via ?legal=terms (LegalFromUrl.jsx, line 7 shows the mapping). TermsOfService.jsx line 5 says the URL is "the address Stripe Checkout links to from its consent checkbox". Stripe checkout (checkout/index.ts) in the confirmation_url field points to ?legal=terms. The terms are live and linked.

### Item 7: Privacy policy carries lawful basis and data flows

**PASS.** PrivacyPolicy.jsx includes the following new disclosures added by T319:

- Cloudflare as host (Pages and R2), line 49.
- Stripe, what Carta sends it (customer_email, client_reference_id), what it keeps (amount, currency, billing country, fee, consent, migrations 025 to 044), and its role as a controller, lines 72-79.
- The servers the browser fetches from directly (CARTO and OpenStreetMap tiles, Wikimedia, Geograph, flagcdn.com, Google Fonts, foto-webcam.eu, Overpass), lines 62-69.
- Render crashes kept 90 days with no message, stack or page, line 104.
- The guide view counter's two-day salted hash, lines 113-119.
- Launch counters as daily totals (not personal data), lines 122-125.
- What the export file holds (schema 3), line 209.

The lawful basis table (lines 147-187) covers all these flows. Item passes.

### Item 8: Map attribution visible

**PASS.** src/browse/CyclePage.jsx, DestMap.jsx, ExploreMap.jsx, PointMap.jsx and TrailPage.jsx all set attributionControl: { compact: true } in their MapLibre initialization. The compact attribution control is rendered on the map and displays CARTO and OpenStreetMap credits. src/data/attribution.js exports ATTRIBUTIONS (lines 24 onwards), which is rendered in the Account > Data sources panel (src/auth/AccountPanel.jsx, line 5 imports it, lines following call it). Both the map control and the dedicated panel are visible. Item passes.

### Item 9: Article 30 record written

**PASS.** docs/ARTICLE30.md was created by T319 (T319 report, Files touched section). The file is the record of processing required by GDPR Article 30 and is signed by the owner in register row T319-a. Closes register row T300-b.

### Item 10: Per-file Commons credit on POI thumbnails

**FAIL.** The T319 report states (line 5 of the task description in the report): "Per-file Wikimedia credit on POI thumbnails: the TASL data ships, nothing renders it. This is the sharpest open one because CC BY-SA on a displayed photo owes its own author line." T300-c (raised by T300, see register) is also open: "Per-file Commons credit on POI thumbnails." The code does not render per-image attribution for Wikimedia Commons photos on POI cards. Migration 020 and the dossier layer ship the photo URIs and author names, but no UI component displays them. Closes T300-c as an open item on this audit and creates a new register row (T227-a) to track the outstanding work.

## Rollback procedure

None needed. This is a read-only audit task with no code changes. No rollback is required.

## Carta-design check

No visual changes. Not applicable.
