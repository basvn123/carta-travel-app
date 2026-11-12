# Owner procedure: Accounts, mailboxes and programme sign-ups (T1072, ROADMAP A3)

Accounts in your name, mailboxes, affiliate programmes and store accounts: only you can create them. Each step says how to know it worked. When a step is done, delete it here (docs/decisions/0003-open-items-owner-steps-and-roadmap.md).

Rows: 6.

## Steps

1. **T213-e: let Resend send as carta-europetravel.com.** Provider decided 2026-11-12 (owner sweep): Resend, which already sends the Auth mail (T1084); one provider, one DPA. On 2026-11-12 the domain had no SPF, DKIM, DMARC or MX record.
   1. Resend Dashboard, Domains, Add domain `carta-europetravel.com` (region EU). Accept the DPA under Settings, Legal if you have not.
   2. Copy the records Resend shows into Cloudflare, DNS, Records (proxy off). Add DMARC too: TXT `_dmarc` with `v=DMARC1; p=quarantine; rua=mailto:<your address>`.
   3. Back in Resend, press Verify. It worked when the domain shows Verified. Then make a sending-only API key and `supabase secrets set RESEND_API_KEY=<key>` (never in `.env` or GitHub).
2. **T216-a: create support@carta-europetravel.com.** Cloudflare, Email, Email Routing, enable it (it adds the MX records), then Routing rules, Create address `support` forwarding to your inbox. Add `hello` the same way if it is not there yet (`CONTACT` in `continent-app/src/lib/contact.js` already shows `hello@carta-europetravel.com`, and on 2026-11-12 the domain had no MX record, so mail to it bounces). Send yourself a test mail to each. Then tell a session "T216-a done": it changes the one line `SUPPORT_EMAIL` in `continent-app/src/lib/contact.js` (T1108) to the support address.
3. **T218-d: get the outage mails.** Subscribe your address (Subscribe to updates, email) on status.supabase.com, www.cloudflarestatus.com and status.stripe.com. Stripe and Supabase mail webhook failures and usage warnings to the account e-mail: check in each account's profile that it is an inbox you read. It worked when each page sends a confirmation mail that you click.
4. **T272-b: store developer accounts, only when you choose to build store apps.** Apple Developer Program (99 USD a year) and a Google Play developer account (business, after the T014 company exists). Building iOS from Windows needs a cloud Mac build (for example EAS Build). T247 and T248 start after these.
5. **T475-a: two affiliate programmes.** Sign up for Flix on Awin and Trainline on Partnerize, as the Carta business. It worked when each shows "approved" and gives a tracking id; tell a session the ids and it adds the links next to Omio (roadmap 4.23).
6. **T1060-c: claim the social handles** once the name is decided: @cartatravel on X and TikTok (looked free), and check Instagram while signed in. Use the shared owner e-mail and turn on two-step login on each at once.
