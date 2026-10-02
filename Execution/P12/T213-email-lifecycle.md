# T213: Email and lifecycle

## Task ID

T213

## Date

2026-10-02

## What changed

Nothing in the app. This task is a design: it decides which emails Carta sends, when, what each says, and on what lawful basis, so that whichever sending route the owner picks (T070-d) the build is a matter of wiring. No migration, no Edge Function and no string was added, because the route is undecided and the task asked for a decision on scope, not a build.

The decision in one paragraph. Carta sends transactional and legally required email only, and none at launch beyond what the stack already does, until the route exists. The first build is a short list of nine messages in three groups. Account mail (the Supabase Auth messages that already exist). Money mail (the receipt, which Stripe can send itself, and the Trip Pass ending notice at day 25). Moderation mail (the DSA notifier receipt, the notifier decision, the owner's statement of reasons and the complaint outcome). There is no newsletter, no welcome sequence, no abandoned checkout email, no saved trip reminder at launch and no marketing of any kind. The one email with an economic case is the day 25 notice, and it is built so that its facts are a service message and its offer is a consented message, which is the only way the most valuable email can also be the one the owner never has to defend to a regulator.

The economic case comes from `additional docs/Carta/Plan/Finance/CARTA_UNIT_ECONOMICS.md`, Lever 5: the Year Pass carries a typical contribution of 11.04 euros against 4.94 euros for the Trip Pass, and that file says to fire the `expiring` soft gate at day 25 of a Trip Pass with a credit style upgrade offer and not to add a subscription.

## What exists today

Three facts shape everything below, each checked in the file named.

First, Carta has no route to send mail to a user. `Execution/P4/T070-moderation-statements.md` says so plainly: the Edge Functions are checkout, stripe-webhook, plan-day, parse-booking and suggest-city (confirmed by listing `supabase/functions`), and Supabase Auth mail is for sign in only. `supabase/email-templates/` holds one checked in template, confirm-signup; the other Auth messages (password reset, magic link, email change) live only in the Supabase dashboard if they were ever customised. `supabase/config.toml` sets `email_sent = 2` per hour and notes that the setting requires custom SMTP, so until SMTP is configured the Auth route cannot carry launch day signup volume at all.

Second, Supabase Auth SMTP is not a transactional route. Custom SMTP only changes who sends the Auth messages. It cannot send a receipt, a moderation notice or a pass reminder. The master register (`Execution/_OPEN-MASTER.md`, T070-d row) records the leaning as "Supabase Auth SMTP through an EU provider", which is the right provider choice but not enough on its own. Any email beyond the Auth set needs a sender that Carta's own code calls, which means an Edge Function using the same provider's API or SMTP. The recommendation below uses one provider for both.

Third, the pass data needed for day 25 exists. `public.entitlements` (`supabase/migrations/007_passes.sql`) holds `tier`, `expires_at` and `stripe_customer_id`, and a pass whose `expires_at` passes resolves back to free without any sweep. The Trip Pass lasts 30 days and the Year Pass 365 (`periodDays` in `continent-app/src/lib/pricing.js`). The in-app twin of the day 25 email is the `expiring` soft gate in `GATES` in `continent-app/src/hooks/usePaywall.jsx`, and the banner that opens it, `PassExpiryBanner` in `AnnouncementBar.jsx`, starts at 7 days left (`EXPIRY_DAYS = 7`). `daysLeft` rounds up, so day 25 of a 30 day pass is 5 days left. The email at day 25 therefore lands two days after the banner first appears for anyone who opens the app. That is fine, because the email exists for the traveller who has not opened the app, but the copy must not claim the banner has already said it.

## The scope decision

Is there email beyond transactional? Not at launch. The reasoning is one test applied to each candidate: does a traveller expect this message because of something they did, and would Carta be worse without it. Account confirmation, a receipt, the end of a paid pass and a legal notice all pass. A welcome email, a newsletter and a win back sequence fail, because nobody asked for them and each needs a consent flow, an unsubscribe system and a deliverability reputation that a one person product does not need yet. Carta's own acquisition constraint (`docs/GTM-ACQUISITION-CONSTRAINT.md`) already says the launch runs on search, community and the product itself, not on a list.

The saved trip reminder is deferred, not rejected. A reminder that a trip starts in seven days is useful to the traveller, and the strongest version is one the traveller switches on per trip, which makes it a requested service. But it needs a per trip toggle, a date field on saved plans the sender can read, a time zone rule and the same sending route, and it has no economic case, so it waits for the route and for evidence that people want it.

## The emails

Nine messages, in build order. The basis column is the GDPR Article 6 ground. The three grounds Carta already states are in `continent-app/src/components/PrivacyPolicy.jsx` (T017: contract, legitimate interest, consent). Legal obligation, Article 6(1)(c), is not in that table yet and the receipt and moderation rows need it, so adding it is part of the build.

| Id | Message | Sent when | Basis | Unsubscribe |
|---|---|---|---|---|
| E1 | Confirm email, reset password, magic link, email change | The traveller asks | Contract, 6(1)(b) | No, it answers a request |
| E2 | Receipt | A Trip Pass or Year Pass is paid | Contract, 6(1)(b), and legal obligation for the invoice record, 6(1)(c) | No |
| E3 | Trip Pass ending, the facts | Day 25 of a Trip Pass | Contract, 6(1)(b), a notice about the thing they bought | No, one message per pass |
| E4 | Trip Pass ending, the offer line | Inside E3, only for travellers who consented | Consent, 6(1)(a) | Yes, one click |
| E5 | DSA notice received | A guide report is filed with an email | Legal obligation, 6(1)(c) (DSA Art. 16(4)) | No |
| E6 | DSA notice decided | The moderator decides the report | Legal obligation, 6(1)(c) (DSA Art. 16(5)) | No |
| E7 | Statement of reasons | A guide is taken down | Legal obligation, 6(1)(c) (DSA Art. 17) | No |
| E8 | Complaint outcome | The owner's complaint is decided | Legal obligation, 6(1)(c) (DSA Art. 20) | No |
| E9 | Saved trip reminder, deferred | The traveller switched it on for that trip | Contract, 6(1)(b), a service they requested | Yes, the per trip toggle and one click |

E4 is not a separate email. It is one extra paragraph inside E3, shown only when the traveller has given consent to offers by email. E9 is not built at launch.

The lawful basis reasoning for E3 and E4 is where care is needed. A notice that a paid pass is about to end, with the date and what happens to the traveller's trips, is information about a contract in force, so the contract basis covers it and no consent is needed. A line that invites the traveller to buy a Year Pass is direct marketing, and under the ePrivacy rules on electronic mail that needs prior consent, with a narrow exception in the directive for a business's own similar products offered to its own customers, provided an opt out was offered when the address was collected and in each message. Whether Belgium's implementation of that exception lets Carta put the offer line in E3 without consent is a legal question I could not settle from the repository, and I am not asserting an answer. The design therefore does the safe thing by default: E3 carries facts only, and the offer line appears only for travellers with a recorded consent. If counsel confirms the exception applies, the consent condition on the offer line is removed and nothing else changes, because the unsubscribe path built for consent also satisfies the opt out the exception demands.

Where consent is collected: two places, both unticked. At checkout, Stripe Checkout can collect agreement to promotional email through `consent_collection.promotions`, which sits next to the `terms_of_service: 'required'` the checkout function already sets (`supabase/functions/checkout/index.ts`, line 118). I did not verify that option's availability for Carta's account and countries, so the build checks Stripe's documentation first. And in the account panel, a labelled switch "Email me about passes", off by default, which also serves as the withdrawal control. Consent must be as easy to withdraw as to give, so the switch and the one click link in the email write the same flag.

## What each message says

Voice follows `PRODUCT.md`: an instrument, not a brochure; plain, specific, verb first; sentence case; no terminal punctuation on subject lines and buttons; no em dashes or en dashes; none of the banned words. Visual design follows carta-design and `DESIGN.md`, not the existing confirm-signup template, which uses Georgia, a warm paper background and 12px rounded corners that do not come from `styles.css`. The build restyles E1 from the locked tokens and the wordmark and does not copy that template. Email clients ignore custom properties, so the build inlines the values read from `:root` in `continent-app/src/styles.css` and records the mapping in `DESIGN.md`. Mono is used only for dates, ids and amounts. At most one filled button per message.

The drafts below are English. Each ships in all six languages with the app (en, de, es, fr, it, nl), chosen from the profile language, falling back to English.

E2, receipt. Stripe can send this itself, which removes a message Carta would otherwise have to build, template in six languages and get right for VAT. Recommended: switch on Stripe's customer receipt emails and set the invoice footer to carry Carta's imprint address and the VAT line. The receipt then carries the VAT figure from Stripe Tax, which Carta cannot reproduce more reliably. I could not check the dashboard, so it is an owner step (T213-c). If the owner prefers a Carta branded receipt later, the Edge Function route can send one from the webhook, keyed on the Stripe session id the webhook already stores as `last_session_id`, so a replayed webhook cannot send it twice.

E3, Trip Pass ending, facts only.

Subject: Your Trip Pass ends on 24 October

Body: Your Trip Pass ends on 24 October, in 5 days. After that your account goes back to the free plan. Your saved trips stay exactly as they are. What changes is the allowance: the free plan has 2 day plans for the life of the account, and the Trip Pass had 60. Open My trips to see what you have saved.

Button: Open My trips

Footer: You are getting this because you bought a Trip Pass on carta-europetravel.com. It is a single notice about that pass, so there is nothing to unsubscribe from. Carta, [imprint address].

The allowance figures are the `aiPlans` values in `pricing.js` (2 for free, 60 for trip, 300 for year). The build reads them from `TIERS` and never types them, so the email cannot drift from the price table. The date is formatted per locale with `Intl.DateTimeFormat`.

E4, the offer line, inside E3 and only with consent.

Line: A Year Pass is EUR 14.99 and lasts 365 days, so it covers a second trip and a third without another purchase.

The wording comes from the "two trips and it pays for itself" framing in Lever 5, with the price read from `TIERS` through `formatPrice`. The credit style offer in the unit economics note, a reduction for the Trip Pass already paid, is a pricing decision that needs its own Stripe price or coupon and an owner figure. Until that is decided the line carries the plain Year Pass price (T213-g). Footer addition: You are getting this offer because you asked for emails about passes. Turn it off in one click: [link].

E5, DSA notice received. Sent at once, only if the reporter left an email.

Subject: We received your report

Body: We received your report about the guide "[title]" on [date]. Your reference is [id]. A person at Carta will read it and decide. We will write to you again when we have decided. This message does not mean we agree or disagree with the report.

E6, DSA notice decided.

Subject: We decided on your report [id]

Body: We decided on your report about the guide "[title]". Decision: [we took the guide off the public guides, or we did not take the guide down]. Reason: [the moderator's reason, in their words]. [If taken down: the guide's owner can contest this decision.] If you disagree, reply to this message or write to [support address]. You can also use an out of court dispute settlement body or go to court. After this message we delete the email address you gave us.

The last sentence is the retention rule proposed in `Execution/_OPEN-MASTER.md` for T068-g (reports kept 12 months, email cleared on decision). It is the owner's decision, and the sentence appears only if it is taken. Art. 16(2) also expects the notifier's name and a good faith statement; that is T068-d, an owner decision about the form, and it does not change the emails.

E7, statement of reasons. This is a copy of the in-app statement that `ModerationNotice.jsx` already shows, which carries the Art. 17(3) fields (what, why, the source, that no automated means were used, the date, the redress, `contest_until`). The email must not be a second, shorter version that could disagree with it, so it is generated from the same `moderation_statements` row.

Subject: We took your guide off the public guides

Body: On [date] we took "[title]" off the public guides. Your trip is kept and nothing was deleted. Reason: [the moderator's reason]. This came from [a report we received, or our own review]. No automated means were used to decide this. You can contest this decision until [contest_until] from My trips, free of charge. You can also use an out of court dispute settlement body or go to court.

Button: Read the statement and contest

The notifier is never named in E7, matching the in-app statement (T070 report).

E8, complaint outcome.

Subject: We decided on your complaint

Body: We reviewed your complaint about "[title]". Outcome: [we put the guide back in the public guides, or we kept our decision]. Reason: [the moderator's answer]. [If put back but not republished because it changed: the guide was not republished because it changed after we took it down; you can publish it from My trips.]

E9, saved trip reminder, deferred. Draft only, so the next person has the shape. Subject: Your trip to [place] starts in 7 days. Body: the saved plan, the day count and a link to the plan. Sent only for a trip where the traveller pressed "Remind me", and each reminder carries a one click link that turns the reminder off for that trip.

## Consent and unsubscribe handling

Consent is stored, not inferred. One row per traveller per consent kind, with the state, the time it changed, where it was given (checkout or account panel) and the policy version shown, so a consent can be proven and a withdrawal respected. A migration is needed and none was allowed in this task, so it is described and not written: a table such as `email_consent(user_id, kind, granted, changed_at, source, policy_version)`, with RLS letting a traveller read and change only their own row and a service role read for the sender. Account deletion cascades the rows, as it does for `entitlements`.

Unsubscribe works without signing in. Every consent based message carries a signed link (an HMAC over the user id, the consent kind and an expiry) that opens a page on the app and flips the flag on one click, and the message carries the `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers (RFC 8058) so mail clients show their own button. The link takes effect on a single request, never asks the traveller to log in, and is honoured immediately. The sender checks the flag at send time, not at queue time, so an unsubscribe between queuing and sending still wins.

Service and legal messages (E1, E2, E3, E5 to E8) carry no unsubscribe link, because they are not marketing and offering one would imply the traveller could opt out of a legal notice. Their footer says why the traveller is receiving them instead.

## How sending should be built, on either route

Whichever route the owner chooses, one provider carries both the Auth SMTP and the lifecycle sends, hosted in the EU, with a signed data processing agreement checked the way `Execution/P1/T018-vendor-dpas.md` checked the others, and SPF, DKIM and DMARC set on the sending domain before the first message. Candidates the owner could weigh, none verified by me: Brevo and Scaleway Transactional Email (French companies), Mailjet, Postmark and Resend (which offers an EU region but is a US company). The choice is the owner's.

The lifecycle sends go through one new Edge Function, `send-mail`, called only from other server code (the stripe-webhook function for E2 if Carta sends its own, a scheduled sweep for E3, a follow up from the moderation functions for E5 to E8) and never from the browser. It reads a queue table, `email_outbox(id, user_id, kind, dedupe_key, payload, send_after, sent_at, error)`, with a unique index on `(user_id, kind, dedupe_key)`. The dedupe key for E3 is the entitlement's `expires_at`, so a pass sends once, a renewal that moves `expires_at` earns a fresh notice and a retried sweep sends nothing twice. A scheduled job (pg_cron or a scheduled Edge Function; I did not check which the Supabase plan allows) enqueues E3 for every Trip Pass with `expires_at` between 4 and 5 days away, and drains the queue. The sender logs failures to the row and never logs the body of a message. It does not call the Claude API, and none of these messages needs AI at all.

The existing Auth templates stay on Supabase and move to the chosen provider through the dashboard SMTP setting, which is an owner step.

## Files touched

**Created:**
- Execution/P12/T213-email-lifecycle.md

**Modified:**
- Execution/_OPEN.md (rows T213-a to T213-g appended)

No application, migration or pipeline file was touched.

## Commands run

Reading only, plus the two writes above and the commit. No build, no dev server, no database.

## Config and secrets set

None. The build will need a provider API key or SMTP credentials as a Supabase secret (never committed) and a signing secret for the unsubscribe links.

## Before/after measurements

Not measured. The task promised a decision, not a number. The only figures quoted are 11.04 and 4.94 euros typical contribution (CARTA_UNIT_ECONOMICS.md, Lever 5), the price table values in `pricing.js` and `email_sent = 2` in `supabase/config.toml`, each read from the file named. No conversion rate for the day 25 email is claimed, because none exists; the first send is the first data. `paywall_events` already logs the `expiring` gate (T265), so the build should compare the share of Trip Pass holders who buy within 5 days with and without the email.

## What broke and how it was fixed

No issues.

## What is still open

The route decision is the only blocker and it is the owner's: one EU provider for Auth SMTP plus an Edge Function sender, which this design recommends, or Auth SMTP only, which cannot carry anything but Auth mail (T213-a). The scope is recommended, not approved: nine messages, no marketing at launch, and whether to ask Belgian counsel about the existing customer exception before deciding if the offer line needs consent (T213-b). Stripe receipts need a dashboard check (T213-c). Building E1 to E8 is a task for after the route exists; it needs a migration for `email_consent` and `email_outbox`, a legal obligation row in the privacy policy basis table and an Article 30 entry for the new processor (T213-d). The provider, its DPA and the DNS records are the owner's (T213-e). The moderation emails need the recipient's language, which `content_reports` does not store and which I did not find in `010_profiles.sql` (T213-f). The credit style Year Pass offer needs an owner price (T213-g). T068-d and T070-d stay open, because their emails are designed here but not decided or built; T068-g and T070-g (retention) stay open and feed E6.

## Rollback procedure

```
git -C "C:/Users/Gebruiker/Documents/Portfolio/wt/T213" reset --hard HEAD~1
```

The commit adds one report and appends rows to the register, so a revert removes both and nothing else.
