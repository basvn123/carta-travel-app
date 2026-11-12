# Owner procedure: Accounts, mailboxes and programme sign-ups (T1072, ROADMAP A3)

Third-party accounts, mailboxes, affiliate programmes and store accounts.

Steps are the open register rows with Owner `user` that belong to this system, in register order: the Order column first, then task number. A row's own wording says what it waits on ("after", "before"); that is repeated beside the step. Nothing here is new: each step is a row, and the task report named in the row has the detail. When a step is done, delete it here (docs/decisions/0003-open-items-owner-steps-and-roadmap.md).

Rows: 6. Register rows point back here.

## Steps

1. **T213-e** (register order: after T213-a): Choose the provider, accept its DPA (checked as in T018) and set SPF, DKIM and DMARC on carta-europetravel.com before the first send; store the key as a Supabase secret
2. **T216-a** (register order: mailbox first, constants after): Create the mailbox support@carta-europetravel.com (alias forwarding to the owner, send-as enabled, phone notification on), then switch the CONTACT constant in Imprint.jsx, TermsOfService.jsx, PrivacyPolicy.jsx and AccountPanel.jsx to it; see docs/SUPPORT.md
3. **T218-d**: Subscribe the owner address to status.supabase.com, www.cloudflarestatus.com and status.stripe.com, and confirm Stripe webhook failure emails and Supabase usage emails reach a read inbox
4. **T272-b**: The mobile decision (web app and store apps) needs an Apple Developer Program membership, a Google Play developer account (business, after the T014 entity) and a way to build iOS from Windows; T247 and T248 start after these
5. **T475-a**: Owner step: sign up for the Flix (Awin) and Trainline (Partnerize) affiliate programmes, so every trip leg gets a real-price link next to Omio (whose production link is T315-b); roadmap 4.23
6. **T1060-c**: Claim the social handles (@cartatravel looks free on X and TikTok; Instagram needs a check signed in) once the name is decided
