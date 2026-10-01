# T259: Gemini billing attached, budget set, key rotated

## Task ID

T259

## Date

2026-10-01

## What changed

The Google Cloud project behind GEMINI_API_KEY now has a paid billing account, which is the compliance step the Gemini API Additional Terms of 2026-03-23 require for users in the EEA, Switzerland and the UK. A EUR 50 monthly budget with alerts at 50, 90 and 100 percent watches that project. The key was rotated the same day: the old key appeared in full in a session screenshot, so the owner deleted it, created a new one in the same project and set it as the GEMINI_API_KEY secret on the live Supabase project, and a signed-in day plan on the live site came back normally. All of this was done by the owner in the Google Cloud console, AI Studio and the Supabase Dashboard; the session only checked the evidence and recorded it. This closes T035-a and T036-a.

The one surprise is that the key does not live in the project the billing page first pointed at. There are two Google Cloud projects, both named Carta. The key's project is gen-lang-client-0445365032 (project number 607937794997), the project AI Studio created when the key was first made on 2026-08-11. The other, carta-503222, was the only project on the first linked-projects screenshot and holds nothing Carta uses. AI Studio shows the key's project on billing account ...2847, which is 01E8C1-122012-6A2847, under the name Carta-Revolut, Tier 1, Prepay, and the budget's project picker lists both projects under that account. The budget was first saved with no project ticked (the whole billing account) and was then narrowed to gen-lang-client-0445365032 only.

## Files touched

**Modified:**
- Execution/_OPEN.md (T035-a and T036-a closed by T259; T259-a and T259-b appended)

**Created:**
- Execution/P2/T259-gemini-billing-proof.md
- Execution/P2/evidence/T259/1-billing-account-linked-projects.png
- Execution/P2/evidence/T259/2-ai-studio-key-project.png
- Execution/P2/evidence/T259/3-ai-studio-project-billing-tier.png
- Execution/P2/evidence/T259/4-budget-scope.png
- Execution/P2/evidence/T259/5-budget-list.png

The two screenshots that showed the old key in full were left out of the repository on purpose. Screenshot 2 shows only the key's last four characters, and that key no longer exists.

## Commands run

None from the session against Google or Supabase. gcloud is not installed on this machine, so `gcloud billing projects describe` was not run; the CLAUDE.md procedure accepts a console screenshot instead, and screenshots 1 to 3 are that evidence. If gcloud is installed later, the equivalent check is:

```
gcloud billing projects describe gen-lang-client-0445365032
```

It should show billingEnabled true and billingAccountName billingAccounts/01E8C1-122012-6A2847. Note the project: describing carta-503222 would prove nothing about the key.

## Config and secrets set

- Supabase project ntssxktaduxzpsmejwyv, Edge Function secret GEMINI_API_KEY: replaced with a new key from gen-lang-client-0445365032 (value not recorded). The old key ending ti8A is deleted.
- Google Cloud budget "Carta Gemini Usage Cap": alerts only (no spend cap), monthly, EUR 50 specified amount, thresholds 50, 90 and 100 percent, scope gen-lang-client-0445365032, credits and savings boxes left at their defaults.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Key project on a paid billing tier | not shown | Tier 1, Prepay, account ...2847 | attached |
| Budgets covering the key's project | 0 | 1 (EUR 50 monthly) | +1 |
| Live day plan with the new key | not run | works | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first billing evidence pointed at the wrong project | Two projects share the display name Carta, and the linked-projects page listed only carta-503222 | Read the key's project from AI Studio (gen-lang-client-0445365032) and matched its billing tier to account ...2847 |
| Budget first covered the whole billing account | No project ticked in Scope | Ticked gen-lang-client-0445365032 only and saved |
| API key exposed in a screenshot | The AI Studio key details dialog shows the full key | Owner rotated the key in the same project and deleted the old one; a live day plan confirmed the new secret |

## What is still open

T259-a. Both projects are called Carta, and the budget list shows only the display name, so it is easy to rotate a key into or point a budget at the wrong one. Renaming the key's project to something like Carta Gemini and shutting down or renaming carta-503222 removes the trap. Owner step.

T259-b. AI Studio reports the billing tier as Prepay. Whether a Cloud budget counts spend drawn from a prepaid balance, and what plan-day returns when that balance runs out (most likely a 429 the app already turns into its fallback, but unverified), are both unknown. Read the budget once the AI Studio monthly spend is above zero and compare the two figures. Owner step.

T035-c (migration 006's header still says the project must never have billing) stays open and is now plainly wrong. The procedure in P2/_OPEN-gemini-billing.md continues at T041-b and T036-b; nothing in this task changes its order.

## Rollback procedure

Nothing here should be rolled back: removing billing puts the app out of line with the Gemini terms for European users. If the budget must go, delete it in Billing, Budgets and alerts. If the new key misbehaves, create another key in gen-lang-client-0445365032, set it as GEMINI_API_KEY in the Supabase secrets and delete the bad one; the old ti8A key cannot be restored. The repository change is a report, two register edits and five images, reverted with `git revert` of the T259 commit.
