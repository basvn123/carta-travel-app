# T043: The margin dashboard

## Task ID

T043

## Date

2026-09-24

## What changed

`CARTA_UNIT_ECONOMICS.md` is a model. It asserts a blended contribution of
EUR 6.85 per purchase and then hangs the whole commercial strategy on that one
figure: the EUR 0.17 a visitor is worth, the conclusion that paid acquisition
cannot work at any plausible conversion rate, the ranking of the seven levers
in section 4, the decision that destination coverage is the customer
acquisition strategy rather than a data quality project. Until this task,
nothing had ever checked that number against a sale, and nothing could have.
The admin panel could show one AI figure after T042 and no money at all.

Migration 031 adds `admin_margin(p_months_back)`, one owner-gated RPC that
computes the same five lines the document computes, from the ledgers the
product already writes, for one calendar month in Europe/Amsterdam. The admin
panel gained a section that lays those lines out in the document's own order
and prints the difference against EUR 6.85 in cents and in percent.

The interesting decision is what to do about the three lines the schema cannot
observe. Sales are real: `pass_grants` carries one row per purchase with
`amount_cents` from `session.amount_total`, which migration 026 added and which
is the amount actually charged rather than the price we intended to charge. AI
units are real: `ai_usage` has counted them since 007. But nothing records the
VAT Stripe computed, nothing records the fee on the balance transaction behind
the charge, and nothing records what Google billed for a grounded search. Three
of the five lines therefore have to be modelled.

The rule the whole thing follows is that a number you cannot source has to
carry its source. Every modelled figure returns a `basis` field and the panel
prints it in the line itself, not in a footnote. The VAT row says whether it
applied 21 percent Belgian or each buyer state's rate and why. The Stripe row
names the percentage and the fixed fee it used. The AI row says the units are
observed and the price is modelled, and prints the per-unit price it used. A
modelled VAT figure presented like a measured one is worse than no figure,
because it invites somebody to file it.

VAT follows the Article 59c posture that migration 026 documents rather than a
flat assumption. While cross-border EU B2C sales stay at or under EUR 10,000
the place of supply is Belgium and every sale carries 21 percent whoever bought
it; once the threshold is breached the rate follows the buyer's member state.
`admin_margin` runs the same two-year test `admin_oss_threshold` runs and
switches branch on it, so the two functions can never disagree about which
world we are in. Prices are treated as VAT inclusive, which is what T033
concluded and what section 3.1 assumes in its first line. The tax is backed out
of the gross, not added to it: on a 699 sale at 21 percent the VAT is
699 x 2100 / 12100, and getting that backwards overstates it by 25 cents a sale.

The Stripe fee is applied per sale rather than to the month's gross, which
matters more than it looks. The fixed EUR 0.25 is the entire reason section 3.4
says every point of mix shift toward the Year Pass is free margin. Summing
gross first and applying one blended rate would erase the one effect the
document asks you to watch.

Infrastructure needed somewhere to live, and T016, which was to set up
bookkeeping and a cost ledger, is an owner task that has not happened. There is
no ledger artefact anywhere in the repository. So this task defines the
contract rather than waiting for it: `public.infra_ledger`, keyed by month and
line item, integer cents, EUR, with a `source` column that is either `model` or
`actual`. It is a table rather than a static JSON file for one reason, that the
owner has to be able to record a Hetzner invoice from the admin panel without a
commit and a deploy. It is seeded with the Tier 0 figures section 2.1 gives,
EUR 9.50 plus the EUR 1.00 domain, for the current month and the eleven before
it, every row marked `model`.

A month reports `reconciled` only when every line item in it came off an
invoice. Not a majority, not "mostly": one modelled row is enough to make the
total a model, and reconciling a dashboard against our own model would prove
only that the model equals itself. That is why the reconciliation line on the
panel reads "not invoiced" today rather than showing a zero difference, and it
is the honest state of the thing. The instrument is built and the reconciliation
is visible as a line; it cannot be satisfied until T016 puts real bills in the
ledger.

The seeded test month tells us something worth writing down. Net receipts came
to EUR 7.323 per purchase against the document's EUR 7.32, and AI cost to
EUR 0.471 per purchase against its EUR 0.47. The revenue side of the model is
exactly right. The entire EUR 0.88 gap in contribution is the infrastructure
allocation: section 3.1 allocates EUR 0.12 a purchase at about 300 payers a
month, and the seed has ten. That is not an error in the model, it is the model
being read at a volume it was not written for, and it is the first thing this
instrument would have told the owner in a real month.

## Files touched

**Created:**
- `supabase/migrations/031_margin_dashboard.sql`
- `Execution/P2/T043-margin-dashboard.md`

**Modified (app):**
- `continent-app/src/auth/admin.js`
- `continent-app/src/admin/AdminPage.jsx`
- `continent-app/src/styles.css`
- `continent-app/scripts/verify_admin_panel.mjs`

**Modified (execution):**
- `Execution/_OPEN.md`
- `Execution/P2/_OPEN-gemini-billing.md`

## Commands run

Root repo:

```
git checkout -b p2-margin-dashboard
git add supabase/migrations/031_margin_dashboard.sql
git commit -m "T043: Add the margin dashboard RPC and the infrastructure ledger"
```

App repo:

```
git checkout -b p2-margin-dashboard
git add src/admin/AdminPage.jsx src/auth/admin.js src/styles.css scripts/verify_admin_panel.mjs
git commit -m "T043: Surface the margin dashboard in the admin panel"
```

SQL verification, on a throwaway container for the same reason T042 used one:
the local 5432 server rejects every credential a session has, which is T036-c.
Docker needs the PATH prepend on this machine. `MSYS_NO_PATHCONV=1` is set, and
`docker cp` still rewrote the Windows source path and failed, so the files went
in on stdin instead, which works and is simpler:

```
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"
export MSYS_NO_PATHCONV=1
docker run --rm -d --name carta-t043 -e POSTGRES_PASSWORD=t043 -p 55433:5432 postgres:16-alpine
docker exec carta-t043 psql -U postgres -c "create role anon; create role authenticated; create role service_role;"
docker exec -i carta-t043 psql -U postgres -q -v ON_ERROR_STOP=1 < fixture.sql
docker exec -i carta-t043 psql -U postgres -q -v ON_ERROR_STOP=1 < supabase/migrations/031_margin_dashboard.sql
docker exec -i carta-t043 psql -U postgres -q -v ON_ERROR_STOP=1 < seed031.sql
docker exec carta-t043 psql -U postgres -At -c "select jsonb_pretty(public.admin_margin(1));"
docker rm -f carta-t043
```

The fixture is a minimal stand-in for the parts of the live schema 031 reads:
`auth.users`, `auth.uid()`, `site_config`, `plan_tiers`, `entitlements`,
`pass_grants` with the 025 and 026 columns, `ai_usage`, `ai_daily_total`,
`eu_member_states()` copied from 026, and an `admin_guard(text)` that returns
whatever a `test_guard_err` config key holds so the refusal path can be
exercised without a second fixture. It is a scratch file, not committed, and
rebuilding it takes a few minutes from the column lists in 007, 014, 025 and
026.

The seed is one full closed calendar month at the document's own 70/30 mix so
the comparison is like for like: seven Trip Passes at 699 and three Year Passes
at 1499 across six member states, AI use near the section 3.1 typical figures
of 8 plans and 5 grounded on a Trip Pass and 20 and 12 on a Year Pass, plus
three rows the function must handle rather than count: one sale with no amount,
one charged in GBP, and one in the current month that a closed-month read must
not see.

App verification, from `continent-app/`:

```
npx eslint src/admin/AdminPage.jsx src/auth/admin.js
npm run build
node scripts/verify_admin_panel.mjs
```

## Config and secrets set

None. The RPC reads two optional `site_config` keys, `ai_cost_plan_cents` and
`ai_cost_ground_cents`, neither of which exists and neither of which needs to.
They fall back to the 1 cent and 5 cent figures from section 2.2. They are
configurable precisely because T041-c already records that the EUR 0.05 figure
does not match Google's published price, so correcting it should be an
`admin_set_config` call and not a migration.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Money figures visible in the admin panel | 0 | 19 across five groups | +19 |
| Lines of the unit economics model instrumented | 0 of 5 | 5 of 5, two observed and three modelled | +5 |
| Infrastructure spend recorded anywhere | nowhere | `infra_ledger`, 12 months seeded, 84 rows | new |
| Contribution per purchase computable | no | yes, against EUR 6.85 with the gap in cents and percent | new |
| `verify_admin_panel.mjs` checks | 28 | 29 | +1 |
| Vite build | passes | passes, 2m 12s | no change |
| eslint on the two changed app files | 0 errors | 0 errors, 0 warnings | no change |

On the seeded container, `admin_margin(1)` for the last closed month returned:
10 valued sales, 7 Trip at EUR 48.93 gross and 3 Year at EUR 44.97, EUR 93.90
gross in total; VAT EUR 16.30 at the Belgian 21 percent with `basis`
`belgium_21` and `ossBreached` false; Stripe EUR 4.38 with `basis` `modelled`;
net receipts EUR 73.23; AI 116 plan units at EUR 1.16 and 71 ground units at
EUR 3.55 for EUR 4.71; infrastructure EUR 8.79 across seven ledger lines, all
seven `model`, `reconciled` false, EUR 0.879 a purchase. Contribution
EUR 59.73 for the month, EUR 5.97 per purchase.

Against the assumption that is a difference of minus EUR 0.88, minus 12.8
percent. The breakdown matters more than the headline. Net receipts per
purchase came to EUR 7.323 against the document's EUR 7.32, and AI cost per
purchase to EUR 0.471 against its EUR 0.47. Both match to the cent. The whole
gap is the infrastructure line, which the document allocates at EUR 0.12 a
purchase assuming about 300 payers a month while the seed has ten, so each of
them carries EUR 0.879 instead. The model's arithmetic is confirmed and its
volume assumption is the only thing the seed disagrees with.

Eleven behaviours were checked besides the happy path. The months-back argument
clamps: minus 5 returns 0, 9999 returns 36, null returns 1. Offset 0 returns
the month in progress with `closed` false and only the one current-month sale,
so the month boundary holds and the closed-month read does not leak into it. An
empty month returns null for every contribution field rather than zero, because
"there were no sales" and "we made nothing per sale" are different statements.
A guard returning `forbidden` makes the whole call return `{"error":
"forbidden"}` and nothing else. Inserting an EUR 11,000 cross-border sale
flipped `ossBreached` to true and `basis` to `buyer_country`, and VAT on the
seeded month moved from EUR 16.30 to EUR 12.59, which is correct: the seeded
buyers sit in states rating 19 to 23 percent rather than all at Belgium's 21.
Removing that sale put it back to EUR 16.30. Setting `ai_cost_ground_cents` to
2.8 moved AI cost from EUR 4.71 to EUR 3.15 and reported `groundPrice` 2.8.
`admin_set_infra_cost` writing a real Hetzner figure of 612 with source
`actual` moved the infrastructure total to EUR 8.92 and `actualRows` to 1 while
`reconciled` stayed false with six modelled rows left, and flipping all seven to
`actual` turned `reconciled` true. The writer refuses bad input with named
errors: `bad_item`, `bad_amount`, `bad_source`. Re-running the whole migration
produced only skip notices and, importantly, left the corrected `actual` row at
612 rather than resetting it to the seeded 599, which is what the seed's
`on conflict do nothing` is there for.

No live figures were read. Nothing has been applied to `ntssxktaduxzpsmejwyv`,
and the section renders nothing on the live project until 031 is pasted,
because the render is gated on the RPC answering without an error.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `docker cp` failed with "GetFileAttributesEx C:\c:" | Git Bash rewrites the Windows source path even with `MSYS_NO_PATHCONV=1`, which only covers the container side | Piped the files in on stdin with `docker exec -i psql` instead, which needs no path translation at all |
| The first draft summed gross for the month and applied one Stripe rate to it | Simpler to write, and wrong: it erases the fixed EUR 0.25 dilution that is the whole of section 3.4 | Fee is computed per sale inside the aggregate, so the Year Pass keeps its advantage |
| The first draft added VAT to the gross | Prices are VAT inclusive, so the tax is already in the amount | Backed out with rate over 10000 plus rate, with a comment saying what the mistake costs |

Step 11 of `verify_admin_panel.mjs`, "the non-admin hub changed shape", still
fails. It fails identically on a clean tree, it concerns the account hub rather
than the admin panel, and T042-d already owns it. Nothing in this task touches
those files and nothing here was done about it.

## What is still open

Migration 031 has to be pasted into the Supabase SQL editor by hand. There is
no Edge Function redeploy behind it, unlike 028, 029 and 030, because nothing
in the request path writes to anything 031 adds: it is a pure read over ledgers
that already exist, plus one owner-writable table. So the paste is the whole
deployment and it can happen at any point in the sequence, which is why its row
sits after the T042 pair rather than interleaved with it.

The reconciliation cannot be completed in this task and was never going to be.
T016 is an owner task, no ledger artefact exists anywhere in the repository, and
the figures in `infra_ledger` are the ones `CARTA_UNIT_ECONOMICS.md` models
rather than bills anybody has read. The instrument is built, the reconciliation
is a visible line on the dashboard with the ledger figure, the dashboard figure
and the difference, and it reads "not invoiced" until the ledger holds real
amounts. Closing it means the owner entering one real month of invoices through
`admin_set_infra_cost` and then reading the line. That is registered as T043-c
and owned by the user, with the ledger contract itself as T043-b so the
bookkeeping task knows what shape to fill.

Three modelling gaps are worth naming, in the order they would cost money.

The Stripe fee is the largest. Stripe knows the real fee on every charge and
this schema does not store it. The documented 1.5 percent plus EUR 0.25 is
applied instead, and card origin is unknown so the buyer's billing country
stands in for it. A German traveller paying with an American card is charged at
2.9 percent by Stripe and modelled at 1.5 percent here, a gap of about EUR 0.10
on a Trip Pass. Closing it means the webhook expanding the payment intent to
its balance transaction and storing `fee` on `pass_grants`, which is a change to
the checkout function and a column, and belongs in a task that owns those
files. Registered as T043-d.

VAT is second. The rate applied is the one the Article 59c posture implies,
which is the right rate if `tax_behavior` on both Stripe Prices is inclusive.
T033 established that nothing in this repository can read that setting and
concluded inclusive is almost certainly right. If it turns out to be exclusive
this line is wrong by the VAT amount on every sale, and so is section 3.1 of the
unit economics document. That is T033's open row and this dashboard inherits it
rather than adding a new one.

Third, `ai_usage` is keyed by entitlement period and not by day, so "AI units in
September" is a question that table cannot answer. What the RPC reports is units
on periods that opened inside the month, which for a Trip Pass is close and for
a Year Pass is not: one buyer's 300-plan allowance lands entirely in the month
they bought it. `ai_daily_total` carries the genuine daily series and is
returned beside it, but it does not separate plan from ground so it cannot be
priced. Both are on screen and the panel says which is which. Fixing it properly
means a day dimension on the spend, which is the same underlying gap T037-c
already records against the refund path, and it should be one task rather than
two.

One smaller thing. The infrastructure allocation divides by purchase count
because that is the method section 3.1 uses, and the point of this dashboard is
to test the document's arithmetic rather than improve on it. At low volume that
method produces a per-purchase share far larger than the document's EUR 0.12,
which is exactly what the seed showed. It is not wrong, but anyone reading a
small month should understand they are looking at fixed cost divided by a small
number, not at a margin problem.

## The seven carta-design questions

No hex value was written. The one new CSS rule sets `display`, `gap`,
`flex-wrap`, `margin`, and a font family and size that both come from existing
custom properties. Everything else in the section is existing `adminpage-*`
classes, which already resolve to the app's tokens.

No warm neutral, no serif face, no gradient and no shadow. Nothing new was
styled beyond a flex row.

`--flag` is not used in this section and appears nowhere on the admin page. It
was tempting: a margin dashboard has an obvious "this is the number that
matters" and the contribution figure is it. But `--flag` means "this is the
cheapest option" in a price product, and spending it on a back office tile
would weaken it everywhere it does that job. The contribution figure is carried
by position and by the sentence beneath it instead.

The mono rule holds. Every figure in the section is a measured fact and every
one is set in mono, through `.adminpage-tile b`, the `.mono` cell class and the
new `.adminpage-monthpick .mono`. Tier names and ledger item slugs are mono
because they are field values rather than prose. Every explanatory paragraph is
sans. Money goes through `Intl.NumberFormat` with two decimals and never
reaches the screen as a raw cent count, which the harness checks.

Two buttons were added and neither is primary. They are the month selector's
step controls, both `.adminpage-btn` secondary, so the one-primary rule is
untouched.

The headings carry numbers or a verb: "Margin, 2026-08", "Passes sold by tier",
"From gross to contribution", "AI units this month", "Reconciliation to the
ledger". There are no em dashes in the section, the RPC or the migration, no
middot or bullet separators, and none of the banned words appear. All five
files were scanned for the four banned characters and came back clean.

The thing removed: an earlier draft gave the contribution tile a coloured
up-or-down indicator against the EUR 6.85 assumption, using `--up` and
`--down`. It was wrong twice. Those two tokens mean a price moved in data, not
"good" and "bad" in chrome, and a margin below a modelled assumption is not by
itself a bad thing, since the seeded month was below it entirely because of
volume. The sentence beneath the tiles says the same thing with the reason
attached, which is what a reader actually needs.

## Rollback procedure

App repo: `git revert 90b3bf6`, or
`git checkout p2-ai-usage-telemetry -- src/admin/AdminPage.jsx src/auth/admin.js src/styles.css scripts/verify_admin_panel.mjs`.
The section is gated on the RPC answering without an error, so reverting the
app alone leaves a harmless unused RPC.

Root repo: `git revert bcf424214`. That removes the migration file and nothing
else.

Database, if 031 has already been applied:

```
drop function if exists public.admin_margin(int);
drop function if exists public.admin_set_infra_cost(date, text, int, text, text);
drop function if exists public.eu_vat_bp(text);
drop table if exists public.infra_ledger;
```

All four are in the down block at the end of the migration. The three functions
are a pure read and a guarded writer and dropping them is reversible at any time
by re-running the file. Dropping `infra_ledger` is not: it destroys any real
invoice figures the owner has entered, which once T016 is under way exist
nowhere else in this system. Export the table before that last line on any
database holding a row with `source` `actual`. Nothing else in the schema
depends on any of it, and no Edge Function reads or writes it, so there is no
deploy to coordinate with the rollback.
