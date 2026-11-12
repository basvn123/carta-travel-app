# Owner procedure: Google, Gemini billing and Search Console (T1072, ROADMAP A3)

Google Cloud billing, Gemini keys and the Search and Bing webmaster properties. When a step is done, delete it here (docs/decisions/0003-open-items-owner-steps-and-roadmap.md).

Owner sweep 2026-11-12: T205-f (Search Console, Bing, IndexNow) and T200-g (field Core Web Vitals) moved into `docs/owner/search-console.md`, which now holds every search step.

## Steps

1. **T259-b** (needs a Google login): once the Cloud budget shows non-zero spend, open Google AI Studio, Billing, and Google Cloud Billing, Budgets & alerts. Read two things and write them into this step: whether the budget's spend includes the prepaid Gemini credit (Prepay Tier 1), and what `plan-day` answers when the prepaid balance is 0 (Supabase, Edge Functions, plan-day, Logs: look for a 429 or 403 from Gemini on the day the balance ran out).
