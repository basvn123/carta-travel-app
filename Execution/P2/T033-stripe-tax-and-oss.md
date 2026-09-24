# T033: Confirm Stripe Tax and set an OSS threshold monitor

## Date

2026-09-24

## What changed

The threshold now has a number attached to it. Before this task the tax
configuration was correct and entirely unwatched: automatic tax was on, the
billing address was required, and nothing anywhere recorded where a buyer was
or what they paid, so the one figure that decides whether Carta has to register
for VAT in twenty-six other countries could not be computed at all. After this
task the webhook records the buyer's country, the amount actually charged and
the currency against every sale, and an admin RPC turns that ledger into a
figure per calendar year against the 10,000 EUR limit, with the previous-year
rule already applied.

Three pieces. Migration 026 adds `buyer_country`, `amount_cents` and
`currency` to `pass_grants`, adds `eu_member_states()` and
`admin_oss_threshold()`, and replaces `grant_pass` with a nine-argument version
that writes the three columns. The stripe-webhook function reads
`customer_details.address.country`, `amount_total` and `currency` off the
completed session and passes them down. `continent-app/src/auth/admin.js` gains
a one-line binding so the RPC is reachable from the app when a later task wants
to draw it.

The half of the task that mattered most could not be done from here and was not
faked. Confirming that Stripe Tax resolves rates in test mode requires a Stripe
key, and T030 established there is none: no secrets on the live project,
neither billing function deployed, no Stripe CLI and no key anywhere on this
machine. That confirmation is written up below as a Dashboard procedure with
the exact figures to expect, and it is the first thing still open.

The static audit of the tax configuration found one real gap and it is not in
the code. `tax_behavior` lives on the Stripe Price object, not in
`checkout/index.ts`, and nobody has decided which way it is set. That single
field decides whether 6.99 EUR is what a buyer pays or what a buyer pays before
tax, and the two readings differ by 1.47 EUR on a Belgian sale. The unit
economics document already assumes one of them. Nothing in the repository can
enforce it.

## How tax resolution works, and why each piece sits where it does

Two separate mechanisms, and it is worth being clear that they solve different
problems. Stripe Tax decides the rate on one transaction. The threshold monitor
decides which country's rate applies at all.

Carta sells an electronically supplied service to consumers. For that kind of
supply the default rule puts the place of supply in the customer's member
state, which taken literally would mean a VAT registration in every country
anyone buys from. Article 59c of the VAT Directive gives a small supplier an
exemption: while total cross-border business-to-consumer supplies of telecom,
broadcasting and electronic services to other member states stay at or below
10,000 EUR, the place of supply stays in the supplier's own member state, which
for Carta is Belgium. So today, at zero sales, every sale is a Belgian sale
carrying the Belgian rate, whoever buys it.

`automatic_tax: { enabled: true }` with `billing_address_collection: 'required'`
is the correct pairing for this and is already in `checkout/index.ts`. The
address is required rather than automatic because for digital goods the rate
follows the customer, and Stripe cannot resolve a rate it has no country for.
Leaving automatic tax on from day one costs 0.5 percent per transaction, which
the unit economics already books as 0.03 EUR on a Trip Pass, and buys the thing
that matters: the day the threshold is crossed, Stripe starts charging the
right country's rate on the transaction that crossed it, instead of that day
being an incident somebody discovers in an audit.

What automatic tax does not do is tell anyone the crossing happened. That is
the gap this task closes, and it is closed twice on purpose.

Stripe Tax has its own threshold monitoring and it is the authoritative source,
because it sees each transaction's tax treatment and not merely its amount. It
is also a Dashboard feature, which means it only speaks to somebody who is
logged in and looking. A threshold nobody looks at is not a monitor. So the
same figure is computed a second time from our own ledger, where it can be
read by an admin panel, a SQL query or a future scheduled check without anybody
opening Stripe. If the two ever disagree, Stripe is right and ours is the thing
that said to go and look.

The three columns sit on `pass_grants` for the same reason the consent columns
from T032 do. `pass_grants` is the permanent per-sale ledger, one row per
Checkout Session, never overwritten. A threshold is a sum over historical
sales, so it has to be computed from a table that keeps every sale.
`entitlements` holds only a user's current state and is rewritten by their next
purchase, so a country column there would be destroyed by the next sale and
could never answer where a given buyer was when they paid for a given pass.

The amount is stored rather than joined from `plan_tiers.price_cents`, and that
was a deliberate change of source. T030 established that `price_cents` is
decorative: no code path reads it, so it records what we intended to charge
rather than what was charged. A VAT figure has to be built from real amounts,
including any future discount, coupon or price change, and `amount_total` is
the only number that knows about those. The currency is stored beside it
because a sum across currencies is meaningless, so the RPC reports which
currencies are present rather than quietly adding cents to cents.

`eu_member_states()` is a function rather than a table because the list changes
once a decade and a table would need RLS, a policy, a seed and its own
migration to correct. Belgium is deliberately inside the list and excluded by
the caller, so the list stays a plain statement of fact about the EU rather
than a statement about where Carta happens to be established. The United
Kingdom is absent, which is the reason for writing the list down at all: a
British buyer is a non-EU sale that does not count towards the threshold, and
that is exactly the kind of thing a hand-written query gets wrong. Greece is GR
and not EL, because Stripe reports GR.

`admin_oss_threshold()` returns a row per calendar year rather than one total
because the rule needs two years. The threshold is breached for a given year if
that year or the one before it exceeded 10,000 EUR, and `breached` on each row
already applies that test so no caller has to re-derive it. It follows the
shape of the other admin reporting functions: SECURITY DEFINER so it can read a
table the caller has no policy for, guarded by `admin_guard('read')` from
migration 015 on entry, and returning jsonb with an `error` key on refusal so
the client helper promotes it to a thrown Error like every other RPC. Nothing
is logged, because `admin_guard`'s rate limit counts rows in the audit log and
logging a dashboard read would eventually rate-limit the dashboard.

It also returns two integrity counts, `unknownCountry` and `unknownAmount`,
and those are not decoration. A sale with no country cannot be placed on either
side of the border and a sale with no amount cannot be valued, so if either is
non-zero the total is a floor and not the answer. A monitor that reports a
comfortable figure without saying how much of the ledger it could not read is
worse than no monitor.

One safety property runs through the whole write path. A grant must never fail
over a reporting field, because the customer has already paid. So the country
is normalised and validated inside `grant_pass` rather than trusted from the
caller, and anything that is not a plain two-letter code becomes NULL, counted
as a hole rather than silently placed on one side of the border. The local test
for this sent a country of `deu`, which stored NULL and still granted the pass.

## The static audit of the tax configuration

Everything below was read, not exercised, because nothing is deployed.

`automatic_tax: { enabled: true }` is set, correctly. This is what makes Stripe
resolve the rate per transaction instead of applying a fixed one.

`billing_address_collection: 'required'` is set, correctly, and is not
optional for this product. Without an address Stripe Tax has no country to
resolve against for a digital supply. The existing comment in the file says
exactly this and is accurate.

`tax_behavior` is not set in code, and cannot be: it lives on the Stripe Price
object. This is the one unresolved decision and it is a pricing question rather
than a tax question. Inclusive means the Price's 699 is the gross: a Belgian
buyer pays 6.99 EUR, of which 1.21 EUR is the 21 percent Belgian VAT and 5.78
EUR is net, and a German buyer at 19 percent also pays 6.99 EUR while Carta
keeps slightly more of it. Exclusive means the 699 is the net: a Belgian buyer
is charged 8.46 EUR at the till and a German buyer 8.32 EUR, so the advertised
price is not the price and every member state shows a different total. Section
3.1 of CARTA_UNIT_ECONOMICS.md already assumes inclusive, and says so
explicitly in its first line, "Gross (VAT inclusive) 6.99", with VAT subtracted
from that figure rather than added to it. Inclusive is also what a consumer
price display in the EU is expected to be. So inclusive is almost certainly
right, but it is a field on an object nobody in this repository can read, and
if it is set to exclusive the unit economics model is wrong by 1.21 EUR a sale
and the app displays a price nobody is actually charged.

`customer_update` is not set. It does not need to be for the current flow,
because the session is created fresh with `customer_email` and no reusable
Customer object, so there is no saved address to keep in sync. It would matter
the moment a Customer is created and reused across purchases, which is not how
this checkout works today. Worth knowing rather than worth changing.

`tax_id_collection` is not set, which is correct, and it should stay off. Carta
is a consumer product. Turning it on invites a VAT number, and a supplied VAT
number moves the sale to a business-to-business reverse charge, which changes
the invoice, removes the sale from the threshold count and creates an
obligation to validate the number and report the supply. All of that for a
customer type the product does not serve. Leaving it off means every sale is
treated as B2C, which is also the conservative direction for the threshold:
counting a business sale as consumer makes the figure too high and warns too
early rather than too late.

Before this task the webhook stored nothing at all about where the customer
was. It read the user id, the tier, the customer id and, since T032, the
consent. The country was sitting on the session object it already had in hand
and was being thrown away. That is what changed.

## The interaction with T015

`Execution/P1/T015-vat-treatment.md` does not exist. The P1 folder runs T012,
T013, T017 through T029, with no T015, so the accountant's VAT answer has
either not been obtained or not been written up. Migration 014 through 017 are
the admin migrations, which is a coincidence of numbering and not the missing
report.

This task therefore proceeds under a stated assumption, and the assumption is
the conservative one: Carta may be under the Belgian small-enterprise VAT
exemption, and nothing here depends on whether it is. The reason the monitor is
correct either way is worth spelling out, because it is the thing most likely
to be misread later. The small-enterprise exemption is domestic. It means no
VAT is charged on Belgian sales below the Belgian turnover limit. It does not
exempt cross-border business-to-consumer supplies of electronic services from
the separate EU-wide 10,000 EUR threshold rule, which is a place-of-supply rule
and not a registration-relief rule. A supplier can therefore be exempt at home
and still obliged to register for the One Stop Shop the moment cross-border
sales pass 10,000 EUR. So the monitor counts the same thing under either
treatment, and `buyer_country <> 'BE'` is doing real work: Belgian sales are
excluded because they are domestic, whatever their VAT treatment turns out to
be.

What the exemption does change is what Stripe should charge on a Belgian sale
today, and that is not a code question. Stripe Tax resolves nothing at all
until an origin address and a Belgian registration are configured under
Dashboard, Tax. With no registration configured Stripe has nowhere to place the
supply and will return no tax on every session, which looks identical to a
correct zero-rated small-enterprise sale and is not the same thing. That
distinction is why the Dashboard procedure below asks for the tax amount on a
Belgian test session specifically: it is the check that separates "configured
and correctly zero" from "not configured".

## Files touched

**Created, root repo:**
- supabase/migrations/026_oss_threshold.sql
- Execution/P2/T033-stripe-tax-and-oss.md

**Modified, root repo:**
- supabase/functions/stripe-webhook/index.ts

**Modified, continent-app repo:**
- continent-app/src/auth/admin.js

`supabase/functions/checkout/index.ts` was read and deliberately not changed.
Its tax configuration is already correct and the one thing that is wrong is not
in it: `tax_behavior` is a field on the Stripe Price object and cannot be set
from here. Its VAT comment is accurate as T013 left it.

No UI was added, and that was a judgement call worth recording. The existing
`adminpage-tile` band in `AdminPage.jsx` would hold the figure cleanly and
needs no new design, so the reason for stopping short is not design. It is that
the tile would read zero until real sales exist, that it needs a title, a hint
and six locale keys to say anything, and that T034 is already going to be
editing the same component for the paywall funnel in an app repo which another
session is holding with roughly thirty-seven uncommitted modifications. Adding
a second editor to that file for a figure nobody can yet read buys a merge
conflict and no information. The RPC binding is in place so T034 can draw it in
one line if it wants to, and the SQL query below covers the meantime.

The app repo's uncommitted work from the other session was left alone. Nothing
was stashed, reset or checked out there, and the commit names its one file
explicitly. `src/auth/admin.js` and `src/admin/AdminPage.jsx` were both clean
in that repo before this task, so the addition touches nothing that session is
working on.

## Commands run

```
git checkout -b p2-stripe-tax-and-oss p2-withdrawal-waiver
cd continent-app && git checkout -b p2-stripe-tax-and-oss   # from its own HEAD

# local stack, with 018 to 023 held aside as in T031 and T032
export PATH="/c/Users/Gebruiker/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH"
mv supabase/migrations/{018,019,020,021,022,023}_*.sql <scratchpad>/held/
supabase start -x realtime,storage-api,imgproxy,studio,logflare,vector,supavisor,mailpit,postgres-meta
supabase functions serve --no-verify-jwt --env-file <scratchpad>/t033.env

# six local test buyers, then eight HMAC-signed checkout.session.completed
# deliveries carrying DE, DE, BE, US, GB, no address, a replay and a malformed
# country
python <scratchpad>/send_t033.py

# the RPC, as a non-admin and then as an admin
docker exec -i supabase_db_Travel_App psql -U postgres -d postgres

# idempotency: 026 re-applied over itself, then one more signed event
docker exec -i supabase_db_Travel_App psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f - < supabase/migrations/026_oss_threshold.sql
python <scratchpad>/one.py

supabase stop --no-backup
mv <scratchpad>/held/*.sql supabase/migrations/

cd continent-app && npx eslint src/auth/admin.js
```

Nothing was run against the live project. No `supabase db push`, no live query,
no secret set, no function deployed.

The held-aside trick is carried straight from T031 and T032 and is still
needed: migration 018 line 93 uses a POSIX regex repetition bound of `{5,600}`
and Postgres caps that count at 255, so `supabase start` refuses the whole
folder. All six files were restored afterwards and
`git status --porcelain supabase/` shows only this task's two files, which is
the proof.

Two local notes for whoever runs this next. `set local role` and
`set local request.jwt.claims` do nothing outside a transaction block, so a
psql call that impersonates an admin has to wrap them in `begin; ... commit;`
or the RPC returns `forbidden` and the run looks like a bug in the guard. And
`supabase functions serve` started in the background under this harness died
after the first batch of requests; the batch completed first, so the evidence
is intact, but the one post-idempotency event needed the server restarted.

## Config and secrets set

None set. No new secret is needed by this task: the webhook reads the country
and the amount off the event payload it already receives, and the RPC reads the
database. Everything outstanding is Dashboard configuration, listed under what
is still open.

Migration 026 must be pasted into the Supabase SQL editor by hand, per the
standing rule. The order matters here in a way it did not for 025. Apply 026
BEFORE redeploying the webhook. The RPC is called with named arguments, so a
webhook carrying `p_buyer_country` against a database that still has only the
six-argument `grant_pass` does not fall back, it fails to find the function.
The resulting 500 makes Stripe retry, so no sale is lost once the migration
lands, but a paying customer holds no pass until it does.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Columns on pass_grants holding the VAT record | 0 | 3 | +3 |
| grant_pass overloads | 1, six arguments | 1, nine arguments | signature replaced |
| Functions answering the threshold question | 0 | 2 | +2 |
| Local test sales recorded with a buyer country | 0 | 6 of 8 | +6 |
| Local cross-border EU B2C total, 2026 | no such figure | 2,897 cents of 1,000,000 | 0.3 percent |
| Local distinct cross-border member states | no such figure | 2 | |
| Live cross-border EU B2C total | 0 cents, nothing sold | 0 cents, nothing sold | none |
| Live pass_grants rows | 0 | 0 | none |
| Stripe secrets set on the live project | 0 of 5 | 0 of 5 | none |
| Stripe Tax registrations configured | unknown, unreadable | unknown, unreadable | none |
| Price tax_behavior | unknown, unreadable | unknown, unreadable | none |

The live figures do not move because nothing was deployed, no secret was set
and nothing has ever been sold. What moved is the local evidence and the code.

The local evidence in full. Eight HMAC-signed `checkout.session.completed`
deliveries through the running webhook. Two German sales at 699 and 1499, which
are the only two that count; one Belgian sale at 699, excluded as domestic; one
United States sale, excluded as non-EU; one British sale, excluded as non-EU,
which is the case a hand-written member state list gets wrong; one session with
no address at all, which stored NULL and was counted as a hole rather than as a
zero; a replay of the first German session carrying a different country and a
different amount, which returned `{"ok": true, "replay": true}` and left the
stored FR and 9999 unwritten, so the original DE and 699 survived; and a
malformed country of `deu`, which stored NULL and still granted the pass. Then
one further French sale after the migration was re-applied over itself, to show
the webhook still works across a re-run.

Then the RPC. Called as a plain authenticated user it returns
`{"error": "forbidden"}`. Called as an admin, on the seven rows before the
French sale, it returned 2,198 cents for 2026 across one country, which is
exactly 699 plus 1499 and nothing else. After the French sale it returned this,
which is the "after" figure:

```
thresholdCents  1000000
currentYear     2026
currentCents    2897
currentPct      0.3
breached        false
years           [ { year 2026, cents 2897, sales 3, countries 2, pct 0.3, breached false } ]
unknownCountry  2
unknownAmount   1
currencies      [ { currency eur, sales 7 } ]
```

2,897 cents is 699 plus 1499 plus 699, the three cross-border EU sales, across
Germany and France. The Belgian, American and British sales are absent from it,
which is the whole point of the query. The two unknown-country rows and the one
unknown-amount row are reported rather than hidden.

The previous-year rule was tested separately, because it cannot be observed
from one year of data. A synthetic 2025 sale of 1,200,000 cents to a Dutch
buyer was inserted, and the RPC then marked 2026 as `breached: true` at 0.3
percent of its own limit, which is correct: a year that follows a breach is
itself breached. That row was deleted afterwards and the figures above are from
the clean state.

Migration 026 was applied twice in a row with `ON_ERROR_STOP=1` and succeeded
both times, leaving exactly one nine-argument `grant_pass` and no stale
overload.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The RPC returned `forbidden` even for a user in admin_users | `set local role` and `set local request.jwt.claims` are silently ignored outside a transaction block, so `auth.uid()` resolved to nothing | Wrapped the impersonation in `begin; ... commit;`. Not a code bug, but it looks exactly like one |
| A post-idempotency event returned 502 | `supabase functions serve` started in the background exited after the first batch of eight requests | Restarted it for the single remaining event. The batch had already completed, so no evidence was lost |
| The webhook header first claimed a nine-argument call would fall back to the six-argument overload | It would not: the RPC is called with named arguments, so the call fails to resolve rather than degrading | Corrected the comment to state the deploy order instead, migration first, and to say what the failure looks like |

## What is still open

Confirming that Stripe Tax resolves rates in test mode, which is the part of
this task's title that could not be done. It needs a Stripe key and there is
none on this machine or on the live project. The procedure is below.

The `tax_behavior` decision on both Price objects. Nothing in this repository
can read it or set it, and it is the field that decides whether 6.99 EUR is the
price or the pre-tax price. Section 3.1 of CARTA_UNIT_ECONOMICS.md assumes
inclusive. If it is exclusive, that model is wrong by 1.21 EUR a sale and the
app shows a price nobody pays. Check it and, if it is exclusive, either change
it or open a task to correct the economics document and the displayed prices.

Switching on Stripe's own threshold monitoring, under Dashboard, Tax. That is
the authoritative monitor and the one this task's RPC is only a backstop for.
Stripe's monitoring watches thresholds per jurisdiction and surfaces a
registration prompt in the Dashboard when a threshold is approached or crossed;
it also emails the account when it thinks a registration is needed. Both
behaviours are Dashboard settings and neither can be verified from here, so
confirm the email actually arrives at an address somebody reads rather than at
whatever the account was created with.

Migration 026 has not been applied to the live project. It was run end to end
locally, including over itself, and is written to be pasted into the SQL
editor. Apply it before redeploying the webhook, for the named-argument reason
in the config section.

No UI shows the figure. Until one does, the query to run in the SQL editor is
`select public.admin_oss_threshold();` as an admin, or, service-role and
without the guard:

```sql
select date_part('year', granted_at)::int as yr,
       sum(amount_cents) as cents,
       round(sum(amount_cents)::numeric / 10000, 1) as pct_of_threshold,
       count(*) as sales,
       count(distinct buyer_country) as countries
  from public.pass_grants
 where buyer_country is not null
   and buyer_country <> 'BE'
   and buyer_country = any (public.eu_member_states())
 group by 1 order by 1 desc;
```

That figure is a floor unless `select count(*) from public.pass_grants where
buyer_country is null or amount_cents is null` returns zero, which is why the
RPC reports both counts and why a raw query should be paired with them.

Nothing checks the figure on a schedule. The monitor is a number that can be
read, not a thing that speaks. A sensible next step, and a small one, is a
weekly job that calls the RPC and raises something visible when `currentPct`
passes a warning level well below 100, say 70, since a registration takes time
to obtain and the useful warning is the one that arrives before the crossing
rather than after it. Stripe's own email covers this if it is switched on and
if it goes somewhere read, which is the cheaper route and the reason this is
filed rather than built.

`Execution/P1/T015-vat-treatment.md` does not exist, so the accountant's VAT
answer is unwritten. This task does not depend on it, for the reason given
above, but two things do. Whether Stripe should be charging Belgian VAT at all
today depends on the small-enterprise exemption, and the Belgian registration
configured in the Dashboard has to match whatever that answer is.

Rows written before 026 carry NULL in all three columns and must not be
backfilled. There are none on the live project today, so this is only a rule for
later: a country guessed from a card BIN or from an IP address is a fabricated
tax fact, and NULL counted as a hole is the honest answer.

## The Dashboard procedure, for confirming tax resolution in test mode

Run this once keys exist. It is the confirmation this task could not make.

First, the origin address. Dashboard, Settings, Tax, and set the origin address
to Carta's Belgian establishment. Stripe Tax resolves nothing without it,
because it cannot decide whether a sale is domestic or cross-border with no
origin to compare against.

Second, the registration. Dashboard, Tax, Registrations, and add Belgium.
Until at least one registration exists Stripe Tax returns no tax on every
session, which on a Belgian test sale looks exactly like a correct zero-rated
small-enterprise sale and is not the same thing. Add only Belgium: while the
threshold is uncrossed the place of supply is Belgium for every EU buyer, and
adding other member states early tells Stripe to charge their rates, which is
wrong and would also make the threshold monitoring meaningless.

Third, the Price objects. Product catalogue, open the Trip Pass Price and the
Year Pass Price, and confirm `tax_behavior` on each. Inclusive is what the unit
economics assumes and what an EU consumer price should be. If a Price was
created without a tax behaviour, Stripe treats it as unspecified and the
Checkout session will fail to compute tax rather than guessing, which is the
better failure but still a failure.

Fourth, switch on threshold monitoring under Dashboard, Tax, and confirm the
notification address is one somebody reads.

Then two test checkouts, from a fresh account and not the owner account, which
holds a manual year pass to 2126 and makes every expiry assertion meaningless.
Buy a Trip Pass with a German billing address, then another with a Belgian
one, and read `total_details.amount_tax` on each session.

With the threshold uncrossed and only a Belgian registration configured, both
sessions should carry the Belgian rate, because the place of supply is Belgium
for both buyers. On an inclusive Price at 699, expect `amount_total` 699 and
`amount_tax` 121 on both, the 21 percent Belgian rate inside a gross of 6.99
EUR. On an exclusive Price, expect `amount_total` 846 and `amount_tax` 147 on
both. The German session showing 19 percent rather than 21 means a German
registration has been added when it should not have been, and the threshold
monitor is then measuring a rule that is no longer being applied. Either session
showing `amount_tax` 0 means Stripe Tax is resolving nothing, which is the
origin address or the registration, not the code.

Then confirm the record landed, which is what this task built:

```sql
select session_id, buyer_country, amount_cents, currency, consent_tos
  from public.pass_grants order by granted_at desc limit 2;
```

The German row must read DE and the Belgian row BE, both with the amount the
session charged. Then `select public.admin_oss_threshold();` as an admin, which
should report one cross-border sale, the German one, with the Belgian one
absent. If both appear, the `<> 'BE'` exclusion is not working and the figure
is overstated. If neither appears, the country is not arriving and
`unknownCountry` will say so.

## Rollback procedure

Nothing is live, so rollback is entirely local.

The webhook and the admin binding revert with the branches. In the root repo,
`git checkout p2-withdrawal-waiver && git branch -D p2-stripe-tax-and-oss`,
which also removes migration 026 and this report. In `continent-app`, the same,
which restores `src/auth/admin.js` and leaves the other session's uncommitted
work untouched. Nothing was built, so there is no `dist` to rebuild.

If migration 026 has already been pasted into a database, the down section in
the migration's own comment block reverses it in three steps and the order
matters: restore the six-argument `grant_pass` from 025 first so the deployed
webhook keeps working, then drop the two functions, then drop the index and the
three columns. Dropping the two functions is harmless and reversible at any
time. Dropping the columns is not: they hold the only record of where each
buyer was and what they paid, which is the evidence a VAT threshold figure is
built from and the evidence a tax authority would ask for. Export `pass_grants`
first if any real purchase has happened, and on a live database with sales on it
treat the column drop as one-way.
