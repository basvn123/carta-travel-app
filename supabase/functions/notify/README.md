# notify, Carta's opt-in emails

Two emails, both off until the traveller turns them on in Account,
Preferences, Emails:

- **Trip reminders.** Seven days before a trip's first dated stop, one email
  naming the places and the date. Sent by a daily pg_cron run (migration 060).
- **Price drops on saved places.** When a saved place's day price falls
  clearly (at least 5 euros and at least 10 percent below the price recorded
  when it was saved). Carta's day prices are computed in the browser from the
  traveller's own settings, so the page notices the drop and asks this
  function to send it; the function checks the switch and rate limits: one
  price email a day, one place at most once a week, five places an email.

Every email carries a one-click unsubscribe link (and the
`List-Unsubscribe` and `List-Unsubscribe-Post` headers) handled by this
function. Nothing is sent twice: each email is claimed in `email_log` before
it goes out and the claim is released only when the send fails.

The email provider is Resend (HTTP API). No Anthropic service is involved.

## Setup (owner)

1. Paste `supabase/migrations/060_email_prefs.sql` in the SQL editor. Look for
   `email prefs self-check passed`.
2. In Resend, verify the sending domain (`carta-europetravel.com`: the SPF
   and DKIM records Resend lists) and create an API key with send access.
3. Set the secrets:

   ```
   supabase secrets set RESEND_API_KEY=re_...
   supabase secrets set NOTIFY_FROM="Carta <trips@carta-europetravel.com>"
   supabase secrets set NOTIFY_SECRET=<a long random string, e.g. openssl rand -hex 32>
   # optional, where the email links go
   supabase secrets set APP_URL=https://www.carta-europetravel.com
   ```

4. Deploy without the gateway's JWT check (the cron call and the unsubscribe
   link carry no session; the function checks each door itself):

   ```
   supabase functions deploy notify --no-verify-jwt
   ```

5. For the daily reminders: Database, Extensions, enable `pg_cron` and
   `pg_net`; in Vault create `notify_url`
   (`https://<project-ref>.supabase.co/functions/v1/notify`) and
   `notify_secret` (the same value as `NOTIFY_SECRET`); then paste 060 again.
   It prints `notify reminders scheduled daily at 07:41 UTC through pg_cron`.

Until `RESEND_API_KEY` and `NOTIFY_FROM` are set the function answers
`{ "sent": 0, "code": "not_configured" }` and sends nothing.

## Secrets

| Secret | Required | Meaning |
| --- | --- | --- |
| `RESEND_API_KEY` | yes | Resend API key with send access. |
| `NOTIFY_FROM` | yes | The sender, e.g. `Carta <trips@carta-europetravel.com>`, on a domain verified in Resend. |
| `NOTIFY_SECRET` | yes | Signs the unsubscribe links (HMAC-SHA256) and authorises the cron call (header `x-notify-secret`). Changing it voids the links in emails already sent. |
| `APP_URL` | no | Where the email links open. Default `https://www.carta-europetravel.com`. |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are set
by the platform.

## Requests

| Door | From | Body or query |
| --- | --- | --- |
| `POST` | pg_cron, header `x-notify-secret` | `{"job":"reminders"}` |
| `POST` | the page, the traveller's session | `{"kind":"price","items":[{"key":"dest:LIS","city":"Lisbon","was":62,"now":51}]}` |
| `GET` or `POST` | the unsubscribe link | `?u=<user id>&k=trip|price|all&t=<token>` |

The pure rules (what is due, send once, the token, the words in six
languages) are in `logic.mjs`, tested by `continent-app/tests/notify.test.mjs`
(`npm test`).
