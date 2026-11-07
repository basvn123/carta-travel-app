# price-alerts

Price alerts (T1205, ROADMAP I17). A signed-in traveller saves an alert on a
place with the share its total must fall by (5, 10 or 20 percent) and gets
ONE email when it does. Migration 073 holds the tables;
`pipeline/price_alerts.py` prices the alerts on the box after each data
refresh; this function records the totals and sends through Resend (the I6
route). Double opt-in: no alert email goes out before the traveller clicks
the one confirmation link. Every email carries a one-click unsubscribe link
and the `List-Unsubscribe` and `List-Unsubscribe-Post` headers (RFC 8058).

## Setup (owner)

1. Paste `supabase/migrations/073_price_alerts.sql` in the SQL editor. Look
   for `price alerts self-check passed`.
2. Resend: the domain verified for I6 is enough; the sender below must be on
   it.
3. Secrets:

   ```
   supabase secrets set PRICE_ALERTS_FROM="Carta <alerts@carta-europetravel.com>"
   supabase secrets set PRICE_ALERTS_LINK_SECRET=<openssl rand -hex 32>
   supabase secrets set PRICE_ALERTS_BOX_SECRET=<openssl rand -hex 32, a different one>
   # RESEND_API_KEY is the I6 key, already set for notify
   ```

4. Deploy: `supabase functions deploy price-alerts --no-verify-jwt`.
5. On the box, in `~/.config/carta/env`: `PRICE_ALERTS_URL=https://<ref>.supabase.co/functions/v1/price-alerts`
   and `PRICE_ALERTS_BOX_SECRET=<the same value>`.
6. The flag, when the owner wants it live: `supabase secrets set PRICE_ALERTS_ENABLED=1`
   and build the app with `VITE_PRICE_ALERTS=1` (the alert control shows only then).

Until step 6 every POST answers `{"code":"off"}` and nothing is sent. The
links in emails already sent keep working with the flag off, so an
unsubscribe always goes through.

## Doors

| Door | From | Body or query |
| --- | --- | --- |
| `POST` | the page, the traveller's session | `{"job":"optin","lang":"nl"}` |
| `GET` or `POST` | a link in an email | `?a=confirm|unsub&u=<user id>&x=<expiry ms, 0 for unsub>&t=<token>` |
| `POST` | the box, header `x-alerts-secret` | `{"job":"open"}`, `{"job":"check","items":[{"id","eur"}]}`, `{"job":"purge"}` |

## Secrets

| Secret | Meaning |
| --- | --- |
| `RESEND_API_KEY` | the I6 Resend key with send access |
| `PRICE_ALERTS_FROM` | the sender, on the verified domain |
| `PRICE_ALERTS_LINK_SECRET` | signs the confirm and unsubscribe links; changing it voids links already sent |
| `PRICE_ALERTS_BOX_SECRET` | the box's header; the box never holds the service role key |
| `PRICE_ALERTS_ENABLED` | `1` turns the function on |
| `APP_URL` | optional, where the email button opens |

The pure rules (links, the drop rule, the payload check, both emails in six
languages) are in `logic.mjs`, tested by `continent-app/tests/priceAlerts.test.mjs`.
The database half is in `continent-app/scripts/admin/test_rls_policies.mjs`.
