# T018: Add the lawful-basis table and retention periods to the privacy policy

## Date

2026-09-23

## What changed

The Privacy Policy component now includes two new sections that address the two gaps identified in Legal.md. First, a table under "Legal basis for processing" names the three legal grounds under GDPR Article 6 by which Carta processes personal data: Contract (Article 6(1)(b)) for email, name, saved trips and plans used for account management and sync; Legitimate interest (Article 6(1)(f)) for user signups, engagement, and destination analytics used to understand and improve the app; and Consent (Article 6(1)(a)) for location data shared only when the user explicitly requests address geocoding. Second, a new section called "Retention of analytics events" states that the analytics events the admin panel reads — daily signup counts, user engagement metrics (daily, weekly, and monthly active users), top destinations and countries, and paywall funnel data — are retained for 90 days and automatically deleted once older than that.

The policy was last updated on 22 July 2026 and now reads 23 September 2026. Both sections are written in plain language matching the policy's existing tone and specificity, and are placed in the flow between "Retention and deletion" and "Your rights" where they belong structurally: legal basis before retention periods before the user's remedies under the regulation.

## Files touched

**Modified:**
- continent-app/src/components/PrivacyPolicy.jsx
- continent-app/src/styles.css

## Commands run

```
git checkout -b p1-lawful-basis-and-retention
git add continent-app/src/components/PrivacyPolicy.jsx continent-app/src/styles.css
git commit -m "T018: add lawful basis table and retention periods to privacy policy"
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Legal gaps in privacy policy | 2 | 0 | −2 |
| Sections in privacy policy | 4 | 6 | +2 |

## What broke and how it was fixed

No issues.

## What is still open

None. The policy is complete on the code side and ready for testing in the app.

## Rollback procedure

```
git reset --hard HEAD~1
```

The changes are additive and pure content, with no database work or environment configuration. A revert removes the two new sections from the JSX, the four CSS rules for the table styling, and restores the update date to 22 July 2026.
