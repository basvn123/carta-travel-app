# Owner procedure: secrets rotation and MFA (T1059, ROADMAP C2 and N3)

The inventory is `docs/security/SECRETS.md`. Never paste a secret value into a chat, a report or a commit.

Done by the owner and recorded on 2026-11-12 (owner sweep): the leaked `carta-r2-admin` token rolled and the audit log checked (T1059-a, also T291-b and T1046-b), MFA on every account that offers it (T1059-b; Travelpayouts offers none), the critical keys rolled (T1059-c) and the billed keys rolled with Gemini split into a production key and a pipeline/CI key (T1059-d).

## 1. Give GitHub Actions its secrets (T153-b, T235-a)

On 2026-11-12 the repository had no Actions secrets at all, so the uptime check skips its database probes and the golden-set live run cannot start. Claude's permission rules do not let it write secrets into GitHub, so this is yours. In Git Bash, in the Carta folder:

1. `gh secret set CARTA_SUPABASE_URL --body https://ntssxktaduxzpsmejwyv.supabase.co`
2. `supabase projects api-keys --project-ref ntssxktaduxzpsmejwyv`, copy the `anon` value, then `gh secret set SUPABASE_ANON_KEY` and paste it when asked. (The anon key is public by design.)
3. `gh secret set GEMINI_API_KEY` and paste the **pipeline/CI** Gemini key (the one in the laptop `.env`), not the production key in Supabase. It costs nothing by itself: only a manual `golden-set` run with `live=true` calls Gemini.
4. Check: `gh secret list` shows the three names. `gh workflow run uptime.yml`, wait a minute, then `gh run list --workflow uptime.yml -L 1` shows `success`.

Do not add `CARTA_SUPABASE_SERVICE_KEY` to GitHub: the uptime pipeline check is the only reader, and a narrow read path will replace it (ROADMAP C6). `ALERT_WEBHOOK_URL` is optional; GitHub already emails you when a scheduled run fails.

## 2. Before Stripe goes live (T1059-e)

Stripe test keys are fine until launch. When you switch to live mode (the other live-mode steps are in `docs/owner/stripe.md`):

1. Stripe Dashboard, live mode, Developers, API keys, Create restricted key. The Edge Functions call only these, so give only these rights (2026-11-12, from `supabase/functions/`): Checkout Sessions **Write**, Customer portal **Write**, Subscriptions **Write**, PaymentIntents **Read**. Everything else None. If a test purchase fails with a permission error, Stripe names the missing right in the error.
2. `supabase secrets set STRIPE_SECRET_KEY=<restricted live key> STRIPE_WEBHOOK_SECRET=<live webhook signing secret>`. Nowhere else: not `.env`, not GitHub.
3. Check: one small real purchase passes and is refunded; `supabase secrets list` shows both names.

## Afterwards

Roll the critical and billed keys once a year (the order is in `docs/security/SECRETS.md`), and at once when a key is pasted somewhere it should not be or someone with access leaves. Write the date in the inventory's "Last rotated" column.
