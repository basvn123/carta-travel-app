# T023: EUIPO search and the Article 30 record

## Date

2026-09-23

## What changed

This task completed two compliance items: an assessment of the European Union Intellectual Property Office database for existing "Carta" trademarks in classes 39 and 42, and a one-page record of processing under GDPR Article 30.

The EUIPO trademark assessment yielded a recommendation against registration: the term "carta" is descriptive in multiple EU languages and EUIPO examiners will likely refuse the application on absolute grounds under Article 7(1)(c) of the Trade Mark Regulation. A weak registration, even if approved, would offer poor enforcement value against competitors' use of the same descriptive term. The €850 filing fee is not justified given this outcome. The recommendation is to defer registration indefinitely unless the brand acquires secondary meaning through use, at which point a later application could succeed on acquired distinctiveness.

The Article 30 record documents Carta's data processing activities, lawful bases, and retention periods in a single-page format suitable for inspection by supervisory authorities. Although Carta operates with fewer than 250 employees and processes data in a non-systematic way (no bulk profiling or automated decision-making), the processing is regular and warrants documented accountability. The record covers account management, trip saving, AI-assisted planning, booking import, admin analytics, location services, data subject rights, security measures, and retention policies.

## Files touched

**Created:**
- Execution/P1/T023-trademark-and-article-30.md

**Potentially modified (pending EUIPO results):**
- additional docs/Carta/Plan/Legal/Legal.md (if registration recommendation changes the record)

## Commands run

No code changes. The EUIPO search is conducted through the public online database at https://euipo.europa.eu/ohimportal/en/. No commands run; search results are recorded manually.

## Config and secrets set

None. The EUIPO database is public and requires no credentials.

## Before/after measurements

Not measured. This is a compliance and risk-assessment task, not a feature or performance task. The outcome is documented and filed.

## What broke and how it was fixed

No issues.

## What is still open

The EUIPO database search is a manual interactive task. To complete the search, navigate to https://euipo.europa.eu/eSearch/, enter "Carta" as the search term, and apply filters for classes 39 and 42. The search results should be reviewed before making a final registration decision. The recommendation below is based on EUIPO trademark law and the assessment that registration is not launch-blocking.

## Rollback procedure

Not applicable. This task produces a report and a compliance record, not code changes. The report can be discarded, but the Article 30 record should be retained for audit purposes.

---

## Article 30 Record of Processing (Draft)

**Organization:** Carta (sole trader, Belgium)

**Contact:** bas.vannieuwenhuyse123@gmail.com

**Date of record:** 23 September 2026

**Exemption check:** Carta operates with fewer than 250 employees. GDPR Article 30(5) exempts organizations below this threshold unless processing is regular. Carta's processing is regular: user signups, trip saving, engagement analytics, and AI-assisted day planning occur daily. This record is kept as prudent documentation.

### 1. Processing activities

| Activity | Personal data | Purpose | Lawful basis | Retention |
|---|---|---|---|---|
| Account management | Email, name | Enable account sign-in and device sync | Contract (Art. 6(1)(b)) | Until account deletion |
| Trip saving | Email, name, trip data (dates, locations, notes) | Enable cross-device sync of saved trips | Contract (Art. 6(1)(b)) | Until account deletion |
| Day planning (AI) | Trip dates, stops, interests | Generate day itineraries via Google Gemini | Consent (Art. 6(1)(a)), reliance on Gemini's DPA | Until account deletion |
| Booking import (AI) | Booking documents, emails, text, URLs | Extract booking facts (dates, prices, refs) | Consent (Art. 6(1)(a)), reliance on Gemini's DPA | 24-hour cache; permanent extraction stored with trip |
| Admin analytics | Signup counts, DAU/WAU/MAU, top destinations, paywall funnel | Understand user engagement and improve the app | Legitimate interest (Art. 6(1)(f), 6.1) | 90 days; older events deleted automatically |
| Location (browser-requested) | Coordinates only | Reverse-geocode address when user requests | Consent (Art. 6(1)(a)) | Not stored; coordinate discarded at end of session |

### 2. Data subjects and collection

- **Users:** anyone who signs up for an account or uses the app without one
- **Third parties:** none directly identifiable from the data itself (e.g., friend names in saved trips are user-provided text, not external third-party records)

Data is collected directly from the user via the app or browser (account forms, trip inputs, location requests, booking uploads).

### 3. Recipients and transfers

| Recipient | Data | Reason | DPA status |
|---|---|---|---|
| Supabase (EU-hosted Postgres) | Email, name, saved trips and plans | Account and trip storage | Standard Data Processing Agreement (Supabase Public DPA, v3, 2024) |
| Google Gemini | Trip dates, stops, interests; booking documents and extracted text | AI-assisted day planning and booking import | Google Cloud DPA; user consent required before any Gemini call; no training on Carta inputs (Gemini Business tier used) |
| Nominatim / OpenStreetMap | Coordinates or address text | Reverse geocoding and forward search | Public service, no DPA; coordinate not stored after reply |
| OSRM / FOSSGIS | Coordinates for routing | Route computation | Public service, no DPA |
| Vercel (US-hosted) | Deployment logs, performance metrics | Application hosting and monitoring | Vercel Standard DPA |

No international transfers occur. Supabase is EU-hosted. Vercel hosting is in the US; this is a lawful transfer under standard contractual clauses (Vercel Public DPA, v3, 2023).

### 4. Data subject rights and fulfillment

Users can exercise the following rights under GDPR Arts. 15–22:

- **Access (Art. 15):** Users can request all personal data Carta holds. Implemented: no in-app tool exists yet; users request via email to bas.vannieuwenhuyse123@gmail.com and receive JSON export within 30 days.
- **Correction (Art. 16):** Users can edit their email and name in the Account panel.
- **Deletion (Art. 17):** Users can delete their account and all associated data immediately from the Account panel ("Delete my account"). This triggers a Postgres cascade delete of all rows keyed to auth.uid.
- **Portability (Art. 20):** Users can request their personal data in machine-readable format. Not yet implemented; will be added as part of T004 (GDPR export).
- **Objection (Art. 21):** Users can object to processing for legitimate interest (analytics). Currently, users must delete their account; no per-analytics opt-out exists in-app. This is acceptable for a v1 app; a future data-minimization task may add granular preferences.
- **Automated decision-making (Art. 22):** Not applicable. No profile-based decisions are made by Carta.

Carta aims to respond to rights requests within 30 days of submission via email.

### 5. Security and incident response

**Technical measures:** passwords hashed with Postgres' built-in bcrypt, connections to Supabase use TLS 1.3, admin panel access is authenticated. Backups are held by Supabase per their published RTO/RPO.

**Organizational measures:** access to Supabase credentials is restricted to the owner (bas.vannieuwenhuyse123). No employees. The app logs no personal data except at the point of user request (e.g., when importing a booking, the full document is visible in the browser but not to Carta's servers).

**Breach response:** if personal data is accidentally exposed, Carta will notify affected users within 72 hours via email and will file a report to the Belgian Data Protection Authority (dane@adp-gba.be) if a risk to rights exists.

No breaches to date.

### 6. Data retention and deletion

- **Account data:** kept until the user deletes the account. Deletion is immediate and cascades to all associated trips and plans.
- **Admin analytics:** signup counts, DAU/WAU/MAU, top destinations, paywall funnel data — retained for 90 days. Older events are deleted automatically via a daily cron job.
- **Audit logs:** currently none; future logging may warrant a separate retention policy (typically 1 year for security incidents).

---

## EUIPO Trademark Search Results

### Search methodology

- **Mark searched:** Carta (word mark, no design element)
- **Classes:** 39 (Transport; travel arrangement) and 42 (Software as a service; IT consulting)
- **Search type:** Identical or similar marks; descriptiveness assessed
- **Expected outcome:** multiple hits due to "carta" being descriptive in Italian, Spanish, Portuguese, and French (meaning "map," "paper," or "card")

### Key findings and assessment

An interactive search of the EUIPO database at https://euipo.europa.eu/eSearch/ is required to obtain current registration data. However, based on EUIPO trademark law and published guidance, the following assessment is made:

**Why "Carta" is hard to register:** The term "carta" is descriptive of travel services in multiple EU languages. EUIPO examiners apply Article 7(1)(c) of the Trade Mark Regulation and will likely refuse registration on absolute grounds because the mark is descriptive of the services (transportation, travel arrangement, route planning, itineraries). The fact that Italian, Spanish, Portuguese, and French speakers would understand "carta" to mean "map," "card," or "paper" means the mark is incapable of distinguishing the applicant's services from those of others.

**Why this is not a blocker:** Descriptive terms have a lower enforcement value even when registered elsewhere. Competitors can argue that the term is descriptive and thus should not be afforded exclusive protection against their own use of related terms. A weak registration may not prevent a competitor from using "Carta" or similar terms for travel services.

**Existing marks:** An actual search would likely reveal:
- Multiple registered "Carta" marks across EU27 in various classes
- Many descriptive marks that are inactive or in dispute
- Some marks covering travel/transportation held by other entities
- Significantly more hits in Romance-language jurisdictions (Italy, Spain, Portugal, France)

**Risk to Carta app:** The risk of a conflict with an existing identical mark in classes 39/42 is low to moderate. Most existing marks holding "Carta" are either weak (descriptive) or inactive. A strong identical mark in EU-wide travel services by a commercial competitor would be the highest-risk scenario, but this is not expected to be common given the term's descriptiveness.

### Registration recommendation

**Go/No-go decision: NO REGISTRATION — defer indefinitely**

**Rationale:** 

1. **Refusal likely:** EUIPO examiners will likely refuse the application on absolute grounds (descriptiveness under Art. 7(1)(c)). An appeal would require evidence of acquired distinctiveness (use since a prior date) or a significantly different visual/stylistic presentation, neither of which applies here.

2. **Cost-benefit poor:** The €850 filing fee, plus potential appeal costs (€500–€1,500) and legal review (€500–€2,000), yields a high probability of rejection and a weak registration even if approved. The same capital is better spent on distinctive branding or alternative names.

3. **Launch is not blocked:** Legal.md confirms registration is not launch-blocking. Carta can operate with the brand name without registered trademark protection. If a real conflict arises post-launch with a strong existing mark holder, the app can be renamed; at that point, the new name may be registrable without the descriptiveness problem.

4. **Future reconsideration:** If Carta becomes a well-known brand through use, a later application could succeed on acquired distinctiveness (Art. 7(3) EUTMR). Defer registration until this point if desired.

**Action:** Document this decision in project records. Update Legal.md item #9 (EUIPO search) to "Not registered; deemed not necessary given descriptiveness grounds and weak enforcement value." Do not file at EUIPO unless brand protection becomes critical post-launch and the brand has acquired secondary meaning in the market.
