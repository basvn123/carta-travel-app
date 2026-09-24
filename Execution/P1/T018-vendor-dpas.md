# T018: Confirm vendor DPAs, especially Gemini

## Date

2026-09-23

## What changed

Nothing in the codebase. This was a verification task: read the published data processing terms for every vendor that touches traveller personal data, confirm each one is in force for Carta, and write down where it lives so the next person does not have to find it again. Four DPAs were confirmed against the vendors' own published text rather than summaries. Two of the four turned up something that needs a decision.

The task named Cloudflare as a vendor. Carta does not use Cloudflare. A search across `continent-app/src`, `continent-app/vercel.json`, `continent-app/package.json`, `supabase/` and `pipeline/` returns no match for the string at all. The hosting vendor is Vercel, which is what Legal.md names in the GDPR section and what `continent-app/vercel.json` and the deploy notes confirm. Vercel was verified in Cloudflare's place. If Cloudflare is ever put in front of the app as a CDN or WAF it terminates TLS for every request and becomes a processor, so it would need its own row before that switch, not after.

The Gemini finding is the one worth reading carefully, because the good news in the `passes.mjs` billing-posture header is confirmed and is slightly stronger than that comment claims. Google's Gemini API Additional Terms, effective 23 March 2026, split data handling between Unpaid and Paid Services. Under Unpaid Services, Google "uses the content you submit to the Services and any generated responses to provide, improve, and develop Google products and services and machine learning technologies", and human reviewers may read and annotate API input and output. Under Paid Services, Google "doesn't use your prompts (including associated system instructions, cached content, and files such as images, videos, or documents) or responses to improve our products, and will process your prompts and responses in accordance with the Data Processing Addendum for Products Where Google is a Data Processor." The carve-out then says: "If you're in the European Economic Area, Switzerland, or the United Kingdom, the terms under 'How Google uses Your Data' in 'Paid Services' apply to all Services, including Google AI Studio and unpaid quota in the Gemini API, even though they are offered free of charge."

That carve-out extends the whole Paid Services data section, not just the training sentence. Three things follow for Carta. Traveller prompts are not used to train Google's models on either quota. The human-review provision belongs to the Unpaid Services section and so does not reach an EEA developer. And the Cloud Data Processing Addendum is the instrument that governs the processing, which means Carta's Article 28 contract with Google exists by way of the Cloud DPA rather than a separate Gemini-specific document. Carta qualifies for the carve-out on establishment, being a Belgian sole trader, and separately meets the Paid Services definition anyway: the terms make Gemini API access a Paid Service "only when accessing the API through a Cloud Project associated with an active billing account", and `passes.mjs` already requires `GEMINI_API_KEY` to belong to a billing-attached project for the EEA use restriction. Both routes land in the same place, which is the safe outcome. The belt-and-braces point is that the billing account is what makes the Paid Services status independent of Google's reading of where Carta is established, so it should not be detached to save money. That is the substance of T028.

The one thing the Gemini terms do not give is data residency. The app calls `generativelanguage.googleapis.com` (see `supabase/functions/plan-day` and `suggest-city`), which is the Gemini Developer API. That surface has no regional endpoint and no location parameter, so prompts are processed globally and data leaves the EU. Residency is a Vertex AI feature, and moving to it would mean changing the endpoint, the auth model from an API key to service-account credentials, and the billing arrangement. Transfer is lawful under the Cloud DPA's Standard Contractual Clauses, so this is a disclosure and accuracy question rather than a legality question, but the privacy policy currently says the AI features "send what you give them to Google's Gemini service for processing" without saying that processing happens outside the EU. It names Supabase as EU-hosted in the same paragraph, which invites the reader to assume the same of Gemini. That gap is the sharpest open item here.

Vercel produced the second finding. Its DPA is clear about who it covers: "This Addendum applies to Vercel's Processing of Personal Data as a Processor under the Agreement for Customers who are on Enterprise and Pro plans." Carta is on the Hobby tier, recorded as €0 in the cost baseline in `Execution/P0/T011-performance-and-cost-baseline.md`. On a plain reading there is no Article 28 contract covering Vercel's processing today. The exposure is narrower than it first looks, because the app is a static SPA on Vercel: accounts, saved trips and every other identifiable record live in Supabase, and Stripe handles payment data. What Vercel processes is request metadata, chiefly IP addresses in edge logs, which is still personal data under the GDPR. The fix is an upgrade to Pro rather than a migration, and it should be priced into the launch checklist alongside the ToS work.

Supabase and Stripe were both clean. Supabase's DPA is Version 1, 1 August 2026, incorporates the EU Standard Contractual Clauses in Schedule 2 across the EU, UK and Swiss frameworks, and is accepted by agreeing to the Terms of Service with no separate signature, since "acceptance of the Agreement shall have the same effect as signing the SCCs". Its sub-processor list is published and carries 30 days' notice of changes. Stripe's DPA was last updated 18 November 2025, forms part of the Stripe Services Agreement automatically, and relies on its Data Transfer Addendum plus Data Privacy Framework certification. Stripe is worth one note for the Article 30 record in item 10: it acts as processor for data handled on Carta's behalf and as an independent controller for fraud detection and compliance, so it is not a pure processor and should not be described as one.

## Files touched

**Created:**
- Execution/P1/T018-vendor-dpas.md

No application, pipeline or configuration files were modified.

## Commands run

```
git checkout -b p1-vendor-dpas
git add Execution/P1/T018-vendor-dpas.md
git commit -m "T018: confirm vendor DPAs, record URLs and dates"
```

Verification that Cloudflare is absent from the codebase:

```
grep -ril "cloudflare" continent-app/src continent-app/public/*.json \
  continent-app/vercel.json continent-app/package.json supabase pipeline
```

## Config and secrets set

None. `GEMINI_API_KEY` must continue to belong to a Google Cloud project with an active billing account, which is a pre-existing requirement documented in `supabase/functions/_shared/passes.mjs` and unchanged by this task.

## The register

| Vendor | Document | URL | Version or date | How it is accepted | Transfer mechanism |
|---|---|---|---|---|---|
| Supabase | Data Processing Addendum | https://supabase.com/legal/customer-resources/data-processing-addendum | Version 1, 2026-08-01 | Automatic with the Terms of Service | SCCs, Schedule 2 (EU, UK, Swiss) |
| Stripe | Data Processing Agreement | https://stripe.com/legal/dpa | Last updated 2025-11-18 | Automatic, part of the Stripe Services Agreement | Data Transfer Addendum plus EU-US Data Privacy Framework |
| Vercel | Data Processing Addendum | https://vercel.com/legal/dpa | Updated 2026-03-17, effective 2026-03-31 | Automatic, but Enterprise and Pro plans only | SCCs, Schedule 3; UK IDTA, Schedule 5 |
| Google (Gemini) | Gemini API Additional Terms | https://ai.google.dev/gemini-api/terms | Effective 2026-03-23 | Automatic on API use | Via the Cloud DPA below |
| Google (Gemini) | Cloud Data Processing Addendum | https://cloud.google.com/terms/data-processing-addendum | Current version as retrieved 2026-09-23 | Automatically incorporated into the Cloud agreement | SCCs, Appendix 3 |

Sub-processor lists, all of which carry change notifications worth subscribing to: Supabase at https://supabase.com/legal/customer-resources/subprocessor-list (30 days' notice), Stripe at https://stripe.com/service-providers/legal (30 days' notice), Vercel at https://security.vercel.com (five-day objection window).

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Vendor DPAs confirmed with URL and date | 0 | 4 | +4 |
| Vendors processing personal data with no DPA in force | unknown | 1 (Vercel, Hobby tier) | resolved to a number |
| Gemini training on traveller prompts | unverified | confirmed no, on both quotas | — |

The middle row is the honest form of this measurement. Before the task the answer was not zero, it was unknown; the task's value was converting an unknown into a specific, actionable number.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Task named Cloudflare as a vendor | Carta uses Vercel; Legal.md names Vercel, the prompt did not | Verified Vercel in its place and recorded why |
| Vercel DPA does not cover Carta | The DPA is scoped to Enterprise and Pro plans; Carta is on Hobby | Not fixed here, it needs a paid plan. Raised below |
| Gemini residency assumed from the billing posture | The `passes.mjs` header covers training and billing but is silent on residency | Confirmed separately: the Developer API has no regional endpoint |

## What is still open

Three items, none of which this task was scoped to change.

The Vercel plan is the one with a deadline attached to it. Carta is on Hobby, the DPA covers Pro and above, and the app processes IP addresses in request logs. This should be resolved before launch, not after, and it is a billing change rather than an engineering one. It belongs with the launch checklist in Legal.md, near items 1 and 2.

The privacy policy does not say that Gemini processing happens outside the EU. The policy is otherwise specific and honest, and it names Supabase as EU-hosted two sentences earlier, which makes the silence read as an implied claim. T018 has just finished editing this component, so the sentence should be added as its own task against `continent-app/src/components/PrivacyPolicy.jsx` rather than folded into this one. The transfer is lawful under the Cloud DPA's SCCs; what is missing is the disclosure.

The Article 30 record in Legal.md item 10 now has its processor table ready to be lifted from the register above, with the caveat that Stripe is a joint controller for fraud and compliance purposes and must not be listed as a plain processor.

T035 should confirm that the Gemini billing account is attached and stays attached. This task establishes why that matters beyond the EEA use restriction: billing is what makes Paid Services status hold on its own terms, independent of any argument about where Carta is established.

One caveat carried over from Legal.md. This is a documentation exercise, not legal advice. The Vercel plan gap is the item worth putting in front of a Belgian lawyer alongside the Imprint and the Terms of Service, because it is the one where the contract that should exist currently does not.

## Rollback procedure

```
git reset --hard HEAD~1
```

The task created one Markdown file and changed no code, data or configuration. Reverting the commit removes the report and leaves the system exactly as it was. Nothing was deployed, no secret was rotated, and no vendor agreement was signed or altered, since all four DPAs are accepted automatically by continued use of the services.
