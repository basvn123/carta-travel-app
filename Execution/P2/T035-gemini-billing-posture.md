# T035: Attach billing to the Gemini project and prove the posture

## Task ID

T035

## Date

2026-09-24

## What changed

The three headers that carry Carta's Gemini billing posture now state how to
prove the posture, not only what the posture is. They already said the right
thing: that GEMINI_API_KEY must sit on a Google Cloud project with an active
Cloud Billing account, that this follows from the Gemini API Additional Terms
effective 2026-03-23, and that "Paid Services" is defined by the billing
account existing rather than by money changing hands. T034 and the migrations
before it had written that much. What none of them said was how a maintainer
checks it, which meant the claim could only be believed, never tested.

So each header now carries the verification command,
`gcloud billing projects describe PROJECT_ID` reading `billingEnabled: true`
and a `billingAccountName`, the console equivalent under Billing then Account
management, and the instruction to re-check after a key rotation, because a
rotated key can come from a different project and silently break compliance
without changing a line of code.

Two other things were added. First, the exact sentence from the terms that
makes the billing-account test explicit rather than inferred. The EEA clause
alone ("You may use only Paid Services when making API Clients available to
users in the European Economic Area, Switzerland, or the United Kingdom") tells
you that Paid Services are required, but not what makes a service paid. The
terms answer that separately: Gemini API access counts as a Paid Service when
it is reached through a Cloud Project with an active Cloud Billing account.
Without that second sentence the posture reads like an interpretation. With it,
the compliance test is a single boolean on a single project. The wording was
confirmed by fetching ai.google.dev/gemini-api/terms during this task, so both
quotes are verbatim.

Second, the plan-day header now says outright that the caps are a cost ceiling
rather than a billing impossibility, in the paragraph that introduces them,
rather than leaving the reader to infer it from the list that follows. This is
the sentence that makes T036 mandatory. Under the old unbilled posture an
over-quota call could not be charged because there was no account to charge, so
a leaky cap was a bug with no financial consequence. Under a billed project a
leaky cap is an invoice. The header should say that where the caps are
introduced, not three paragraphs earlier.

Nothing about runtime behaviour changed. No quota number, no code path, no
secret.

One inconsistency was found and deliberately not fixed. Migration 006's header
still says the Google project behind the Gemini key "must NEVER have a billing
account attached", which is the exact opposite of the current posture. 006 is
an applied migration and this task does not name it, so it was left alone; both
007 and passes.mjs now carry a line saying that sentence is superseded and
survives only as history. A future reader who greps for "billing" will hit 006
first, and will now find the correction two files later instead of a
contradiction with no resolution.

The console step itself could not be done here. Attaching a Cloud Billing
account is an owner action in the Google Cloud console, this session is
non-interactive, and gcloud is not installed on this machine, so the billed
state could not even be read, let alone changed. That is the whole of what is
still open, and it is recorded as T035-a with the exact commands.

## Files touched

**Modified:**
- supabase/functions/_shared/passes.mjs
- supabase/functions/plan-day/index.ts
- supabase/migrations/007_passes.sql

**Created:**
- Execution/P2/T035-gemini-billing-posture.md

## Commands run

```
git checkout -b p2-gemini-billing-posture
gcloud version            # not installed, so no billing state could be read
grep -rn "billing" supabase/functions supabase/migrations -il
git add supabase/functions/_shared/passes.mjs supabase/functions/plan-day/index.ts supabase/migrations/007_passes.sql Execution/P2/T035-gemini-billing-posture.md Execution/_OPEN.md
git commit
```

The terms were read with a web fetch of https://ai.google.dev/gemini-api/terms.
Both quotes in the headers are verbatim from that page, including the effective
date of March 23, 2026.

## Config and secrets set

None. GEMINI_API_KEY was not read, rotated or replaced. The billing account on
the Google Cloud project behind it was not changed, because that is a console
action reserved to the owner.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| In-scope headers stating the billed posture | 3 of 3 | 3 of 3 | 0 |
| In-scope headers giving a verification method | 0 of 3 | 3 of 3 | +3 |
| In-scope headers quoting the Paid Services definition | 0 of 3 | 3 of 3 | +3 |
| Files contradicting the billed posture | 1 (006) | 1 (006, marked superseded in 2 places) | 0 |
| Runtime behaviour changes | 0 | 0 | 0 |

The billing account state itself is not measurable from here. gcloud is not
installed, so there is no before or after figure for `billingEnabled`; that
measurement belongs to whoever closes T035-a.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Could not verify billing state | gcloud CLI not installed on this machine, and the prompt forbids changing billing state anyway | Recorded the exact read command in all three headers and raised T035-a for the owner |
| 006 header asserts the key project must never have billing | Written under the pre-2026-03-23 zero-billing posture and never revisited | Out of scope to edit; 007 and passes.mjs now name it as superseded |

## What is still open

The billing account is not attached, or at least this session cannot show that
it is. Everything in the repository now describes a billed project, and nothing
in the repository can make that true. Until the owner attaches a Cloud Billing
account to the Google Cloud project that issued GEMINI_API_KEY, the headers
describe an intention rather than a fact, and Carta is serving European users
from an API client that the Gemini API Additional Terms say must be on Paid
Services. That is T035-a, owned by the user, and it is the only blocking item.

The proof matters as much as the act. Attaching billing to some project is not
the same as attaching it to the right project, and the only thing tying
GEMINI_API_KEY to a project is where it was created. So the verification step
is to run `gcloud billing projects describe PROJECT_ID` against the project
that issued the key in use on the live Supabase instance, and to keep the
output. A console screenshot of Billing, Account management showing the project
under the linked account is equally good evidence.

The second item is a consequence of the first rather than a separate problem.
Once billing is attached the caps stop being a billing impossibility and become
the only thing standing between an abusive user and a real invoice. Nothing in
this task tested that they hold. T036 is the task that does, and it is now
mandatory rather than optional. That is T035-b.

Third, migration 006's header still contradicts the posture in prose. It is
marked superseded from two other files, which is enough for a reader following
the trail, but it is not enough for a reader who greps once. A future migration
or a documentation task should correct it in place. That is T035-c, low
priority, owned by a next task.

## Rollback procedure

Every change is a comment. Reverting is safe and has no runtime effect:

```
git revert <commit>
```

or, to drop the branch entirely before merge:

```
git checkout p2-paywall-funnel-instrumentation
git branch -D p2-gemini-billing-posture
```

If the billing account is attached and then needs to be detached, that is a
console action and it is not reversible from this repository. Detaching it
would also put Carta back outside the Gemini API Additional Terms for European
users, so it should not be done while the app is live.
