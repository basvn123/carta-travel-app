# T024 Move off Vercel Hobby to Cloudflare Pages

## Task ID

T024

## Date

2026-09-23

## What changed

The app still serves from Vercel. What changed is that everything needed to move it
is now written down, committed and machine-checked, and the one thing standing in the
way is measured rather than assumed.

The task could not finish as specified, for a reason the task itself anticipated. The
DONE WHEN asks for the app to serve from Cloudflare Pages on the production domain.
Cloudflare Pages refuses any deployment over 20,000 files. A production build of this
app is 52,132 files. That is not close to the ceiling, it is 2.6 times past it, so a
Pages deploy today would be rejected on upload and the production domain would be
left pointing at nothing. The task's own DEPENDS ON clause covers this case, and so
does step 6 of the architecture document's migration order, which says to move the
data shards to R2 first because that alone clears the ceiling and makes Pages a small,
safe move. T054 has not run. `Execution/P3/` is empty.

So this task did the half that is not blocked, and made the blocked half impossible to
get wrong. Three files now describe the Cloudflare deployment completely:
`public/_headers` carries every caching and security rule that `vercel.json` carries
today, `public/_redirects` carries the apex-to-www redirect that `vercel.json` did
*not* carry, and `wrangler.toml` records the project and build settings. A fourth,
`scripts/check-pages-limits.mjs`, fails a build whose output would be rejected by
Pages and prints the per-directory breakdown that says what to move to fix it.

`vercel.json` is deliberately untouched and still in place. Production keeps serving
from it until the cut-over, and on the day of the cut-over it is the rollback.

Two findings came out of the verification that were not in the brief and that change
what the next person should do.

The first is about the terms violation this task exists to fix, and it makes the case
stronger than §5.5 states. §5.5 rests the argument on affiliate links. Vercel's fair
use guidelines list "affiliate linking is the primary purpose of the site" as an
example of commercial use, and that example does not squarely fit Carta, where the
Travelpayouts and Omio links are incidental to a travel app rather than its purpose.
But the examples are not the rule. The governing definition is "any Deployment that is
used for the purpose of financial gain of anyone involved in any part of the production
of the project", and its first listed example is "any method of requesting or processing
payment from visitors of the site". Carta has Stripe checkout wired through
`src/lib/checkout.js`, and P2 is a whole phase of billing work. The violation is real,
and it rests on payments first and affiliate links second. Stating it that way matters,
because someone reading only §5.5 might reasonably conclude the affiliate example does
not apply and that the move is optional. It is not.

The second finding is a constraint on the destination that the architecture document
does not mention. Cloudflare's self-serve subscription agreement, §2.2.1(h), prohibits
free-tier customers from processing or collecting personal or business credit card
information on a web property receiving Free Services. Carta is fine today, and by
design rather than by luck: `checkout.js` asks an Edge Function for a session URL and
redirects the browser to Stripe's own hosted page, so card data never touches the Carta
origin. But that is a live tripwire. The day anyone embeds a card field, a Stripe
Elements form or any other in-page payment collection, Carta moves from complying with
Cloudflare's free tier to breaching it, and the project would have traded one terms
violation for another. Keep checkout redirecting offsite, or budget for a paid plan.

## Files touched

All paths are relative to the repository root. The app files are in `continent-app/`,
which is its own git tree; they are committed on branch `p1-cloudflare-pages` there.

**Created:**
- `continent-app/public/_headers` — the Cloudflare translation of the `vercel.json` header rules
- `continent-app/public/_redirects` — the apex-to-www 308
- `continent-app/scripts/check-pages-limits.mjs` — the deploy-limit gate
- `continent-app/wrangler.toml` — Pages project and build settings
- `Execution/P1/T024-cloudflare-pages-migration.md` — this report

**Modified:**
- `continent-app/package.json` — adds the `check:pages` script

**Deleted:**
- None. `continent-app/vercel.json` stays until the cut-over, as the rollback.

Three other files show as modified in the app tree (`src/components/PrivacyPolicy.jsx`,
`src/data/attribution.js`, `src/styles.css`). They are not this task's work; they were
already modified when it started and were left unstaged.

## How the pieces work

### The header translation

`vercel.json` has eight header rules; `_headers` has twenty-five stanzas. The count
differs because of a syntax difference, not a policy difference. Vercel matches with a
regex and so can write `/(fares|reach)/(.*)` or a six-way alternation over the root JSON
files. Pages matches a path with a trailing wildcard and has no alternation at all, so
each of those collapsed rules is expanded to one stanza per path. The expansion is
mechanical and the resulting cache policy is identical, rule for rule.

One behavioural difference between the two platforms is worth knowing, because it is
the kind of thing that produces a bug nobody can explain. Vercel applies the first
matching rule for a given header name. Pages applies every matching rule, and when two
matching rules set the same header name, it joins the two values with a comma rather
than letting the more specific one win. A `Cache-Control` set on both `/poi/*` and `/*`
would therefore emit two comma-joined caching policies on every POI shard, and what a
CDN does with that is not something to find out in production.

The layout avoids this rather than relying on it. The `/*` stanza sets only the six
security headers and deliberately sets no `Cache-Control`, so it cannot collide with
the per-path rules above it. There is a comment in the file saying so. If a default
cache policy is ever wanted, it belongs in each path, not in `/*`.

Current usage is 25 rules against a limit of 100, and the longest line is the CSP at
1,024 characters against a limit of 2,000. Both have room, but the CSP is the line to
watch, because P3 adds hosts to it.

### The CSP, and why it is unchanged

The CSP moves across byte for byte. §5.5 describes two amendments, and neither is made
here, on purpose.

Adding `cdn.carta-europetravel.com` to `img-src` and `data.carta-europetravel.com` to
`connect-src` would permit two hosts that do not exist yet, since the R2 bucket and its
custom domains are T044. Permitting a host that serves nothing costs nothing but buys
nothing, and it makes the CSP claim something untrue about the system.

Removing `upload.wikimedia.org`, `thumb.wikimedia.org`, `commons.wikimedia.org` and the
four `geograph.org.uk` hosts would be actively destructive today. Every photograph in
the app is currently a Wikimedia hotlink — T011 measured that the LCP element is an
image on all six page-and-device combinations it profiled, and every one of those
images comes from those hosts. Removing them before the image ladder ships would blank
every photograph in the application.

The order is: add the new hosts when they exist, migrate the images, verify nothing
still hotlinks, then remove the old hosts. That is three separate P3 tasks, and the
comment in `_headers` says so, so the next person does not do it in the wrong order.

### The redirect, and the one that is deliberately absent

`_redirects` has exactly one rule: apex to www, 308. It is here because it is the piece
of the current configuration most likely to be lost in a migration. It is not in
`vercel.json` — it is a Vercel dashboard domain setting, so reading the repository would
never reveal it. It was found by requesting the apex and reading the response. Both the
`<link rel="canonical">` and the `og:url` in `index.html` declare the www host, so
losing this rule would split the site across two hostnames and duplicate every crawled
URL.

There is no SPA catch-all, and that is a decision rather than an omission. The app is a
single client-rendered URL: every route lives in the hash or the query string, and the
source only ever reads `window.location.pathname` and writes it back unchanged. Nothing
needs a rewrite. Adding the reflexive `/* /index.html 200` would mean every missing data
shard answers 200 with the HTML shell instead of a clean 404, so a stale or mistyped
shard path would be parsed as JSON, fail somewhere far from the cause, and cost a
debugging session. This project has already paid for that lesson once. The comment in
the file records it, so the catch-all does not get added back by reflex when path
routing eventually lands.

### The limit gate

`scripts/check-pages-limits.mjs` walks a built tree and fails if it would be rejected
by Pages, checking both hard limits: 20,000 files per site and 25 MiB per file. It
ignores `_headers`, `_redirects`, `_routes.json` and `_worker.js`, because Pages does
not count those and a number that cannot be compared to what the deploy reports is not
useful.

The reason it prints a per-directory table rather than just a verdict is that the
number on its own is not actionable. A rejected deploy tells you the count; it does not
tell you which directory caused it. The table is sorted by file count, so the top rows
are the directories worth moving to R2.

It is wired as `npm run check:pages` and is deliberately *not* in `npm run ci`. It fails
today, by design, and adding a known-red gate to CI trains people to ignore CI. It
should be added to the `ci` script as part of T054, in the same change that makes it
pass. That is the moment it starts protecting something.

The gate currently fails, and that failure is the point. It is the dependency on T054
in machine-checkable form: nobody now discovers the file ceiling by watching a
production cut-over fail.

## Commands run

```bash
# Establish the before state: which host serves production, and what it returns.
curl -sS -D - -o /dev/null https://carta-europetravel.com/      # 308 to www, server: Vercel
curl -sS -D - -o /dev/null https://www.carta-europetravel.com/  # 200, all 6 security headers

# Branch, in the app tree (continent-app is its own git repo).
cd continent-app && git checkout -b p1-cloudflare-pages

# Build, and confirm _headers and _redirects survive the copy into dist byte for byte.
npx vite build
cmp public/_headers dist/_headers
cmp public/_redirects dist/_redirects

# The authoritative file count is the deploy tree, not public/.
node scripts/check-pages-limits.mjs dist     # FAIL: 52,132 files
node scripts/check-pages-limits.mjs public   # FAIL: 52,089 files

git add public/_headers public/_redirects scripts/check-pages-limits.mjs \
        wrangler.toml package.json
git commit
```

The build was run as `npx vite build` rather than `npm run build`, which skips the
`prebuild` step (`scripts/sync-data.mjs`) and reuses the wire already in `public/`.
That is why this report's 52,132 differs by two files from T011's 52,134, which ran the
full build. The difference is noise in the wire, not in the method, and it does not
affect any conclusion.

## Config and secrets set

None, and none could be. Neither `wrangler` nor the `vercel` CLI is installed in this
environment and there are no `CLOUDFLARE_*` or `CF_*` credentials present. Every step
that touches an account — creating the Pages project, adding the custom domain, moving
DNS, downgrading or cancelling the Vercel plan — is in the runbook below rather than in
this report's command list, because none of it could be executed or verified from here.

The Pages project will need the same environment variables the Vercel project has:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TP_MARKER`,
`VITE_OMIO_TRACKING_LINK`, and `VITE_E2E_SEAMS` left unset in production. They are
documented in `continent-app/.env.example`. Values were not read and are not recorded
here.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Production host | Vercel | Vercel | unchanged, cut-over blocked |
| Vercel plan terms | Hobby, in breach | Hobby, in breach | unchanged, see What is still open |
| Files in `dist/` | 52,132 | 52,132 | unchanged, this task moves no data |
| Pages file ceiling | 20,000 | 20,000 | tree is 2.6x over |
| Files over the 25 MiB per-file limit | 0 | 0 | not a blocker |
| Deploy-limit check in the build | none | `npm run check:pages` | added, currently failing by design |
| Header rules under version control | 8, in `vercel.json` | 8 + 25, both hosts described | Cloudflare config added |
| Apex-to-www redirect under version control | no, dashboard only | yes, `_redirects` | recovered from the live response |
| `_headers` rules used | — | 25 of 100 | 75 spare |
| `_headers` longest line | — | 1,024 of 2,000 chars | the CSP |
| Monthly hosting spend | $0 | $0 | Hobby is free; the breach is terms, not cost |

Two numbers describe what the blocked work would achieve, both produced by running the
gate rather than by arithmetic on paper.

Moving `trails/` and `cycling/` to R2 takes the tree from 52,132 files to 17,325, which
passes, but with only 2,675 files of headroom. That is not enough to survive catalogue
growth: T009 projects roughly 340,000 files at 25,000 destinations. T054 should move
`region/`, `trips/`, `dossier/` and `poi/` as well, not just the two biggest.

Doing that was simulated by building a tree of everything that would remain. It is 791
files and 78 MiB, and the gate passes with 19,209 files of headroom. That matches the
architecture document's prediction that the Pages deploy becomes "a few hundred build
artifacts", which is a useful sign that the target design is sound.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The task cannot complete as specified | Pages refuses over 20,000 files; the build is 52,132 | Stopped before deploying, per the task's own DEPENDS ON clause and §8 step 6. Prepared the config, gated the ceiling, wrote the runbook. Confirmed with the user before proceeding this way. |
| `_headers` comment described the wrong merge rule | Assumed Pages resolves a header set twice by most-specific-wins, as Vercel does. It comma-joins the values instead. | Read the Pages documentation, corrected the comment, and confirmed there is no actual collision because `/*` sets no `Cache-Control`. The file's behaviour was always correct; the explanation of why was not, which is worse, because the next person would have relied on it. |
| §5.5's stated justification does not quite fit | Its affiliate-linking example requires affiliate links to be the site's primary purpose, which is not true of Carta | Read the actual Vercel clause. The governing definition is broader and Carta matches it on payment processing. Conclusion unchanged and strengthened; the reasoning in this report is the one to cite, not the example in §5.5. |
| Suspected CRLF corruption in the committed `_headers` | `core.autocrlf=true` on this machine, and git warned about line endings on every staged file | False alarm, but checked rather than assumed, because Cloudflare parses `_headers` line by line and a stray CR would break a rule silently. The committed blob contains zero CR bytes; git normalised on commit. An initial grep appeared to show a CR and was a false positive matching the letter "r" in "Cloudflare". |

## What is still open

The violation is still live. That is the honest headline of this report. Carta is in
breach of Vercel's Hobby terms today, it was in breach before this task, and it is in
breach after it. Nothing here changed the serving arrangement, and nothing could,
because the destination will not accept the deployment.

There is a decision to make about that gap, and it is the user's to make rather than
this task's. T054 is a twelve-hour task in a phase that has not started, so the breach
will persist for a while. Two ways to close it sooner: upgrade to Vercel Pro at $20/mo
as an interim, cancelling it after the cut-over, which is roughly forty dollars to make
the problem go away immediately; or accept the exposure and prioritise T054. The
exposure is not theoretical — Vercel's documented response to a fair-use breach
includes pausing the deployment — but the site has no users yet, so the cost of being
paused today is close to zero. T011 records that the whole system currently runs inside
free tiers with no revenue, which is the context that makes waiting defensible.

Blocked on T054 (`Execution/P3/T054-wire-shards-to-r2.md`), which must move enough of
the wire to R2 that `npm run check:pages` passes. Moving `trails/` and `cycling/` is
the minimum and leaves too little headroom; `region/`, `trips/`, `dossier/` and `poi/`
should go too.

Blocked on account access for every step in the runbook below. None of it can be done
from a Claude Code session.

Deferred deliberately, with the task that owns each:

The two CSP amendments in §5.5 belong to P3, in the order described above: add the R2
hosts in T044 when they exist, and remove the Wikimedia and Geograph hosts only after
the image ladder ships and nothing hotlinks them.

`npm run check:pages` should join `npm run ci` in T054, in the change that makes it pass.

A `.gitattributes` pinning `_headers` and `_redirects` to LF would remove the CRLF
question permanently rather than relying on `core.autocrlf` being set correctly on
every machine that ever commits. It is not created here because this task does not name
that file and the scope rule says not to create files it does not name. It is a
two-line change and belongs to whichever task next touches repository-wide config.

The `prebuild` step reads `app_data/` and `cache/` from the repository root, one level
above `continent-app/`. A Pages project with its root directory set to `continent-app`
still needs the repository root checked out, which a normal git integration gives it.
Worth knowing before debugging an empty wire on the first Pages build. It is recorded
in `wrangler.toml` as well as here.

## Cut-over runbook

Not executable from here. Written so the person with account access can follow it
without rediscovering anything. Do not start until `npm run check:pages` passes.

Create the Pages project against the repository, root directory `continent-app`, build
command `npm run build`, output directory `dist`. Set `NODE_VERSION` to match local.
Copy the five environment variables from Vercel, leaving `VITE_E2E_SEAMS` unset.

Deploy to the `*.pages.dev` URL first and verify there, before any DNS changes. Check
that the six security headers and the CSP come back on `/`, that `/assets/` returns the
immutable one-year cache, that `/poi/` and a layer path return their respective
policies, and that a deliberately missing shard path returns 404 rather than 200 with
HTML. Load the map, a destination page and a trip page, and confirm photographs render,
which is the check that the CSP survived intact.

Then add `www.carta-europetravel.com` as a custom domain on the Pages project, and move
the DNS record. Lower the TTL on the existing record a day ahead so the rollback is
fast. The apex redirect is handled by `_redirects` and needs the apex pointed at Pages
too.

Verify the same checks against the production hostname, including the apex 308.

Leave Vercel in place and untouched for a week. It is the rollback: repoint DNS and the
old deployment is still there and still correct, which is exactly why `vercel.json` was
not deleted in this task. After the week, downgrade or delete the Vercel project. The
task is only complete when that happens, because an idle Hobby deployment that still
serves the affiliate-carrying app is still the violation this task exists to end.

## Rollback procedure

Nothing is deployed, so there is nothing live to roll back.

To undo the repository changes, on the app tree:

```bash
cd continent-app
git checkout p1-gdpr-data-export   # or whichever branch was current
git branch -D p1-cloudflare-pages
```

The four new files exist only on that branch. `vercel.json` was never modified, so
production configuration is untouched either way, and the only change to an existing
file is one added line in `package.json`.

If the branch has already been merged, reverting the single commit is sufficient and
safe: deleting `_headers` and `_redirects` from `public/` changes nothing about the
Vercel deployment, which does not read them.

After the cut-over, rollback is the DNS change described in the runbook, which is why
the runbook says to keep the Vercel project alive for a week.
