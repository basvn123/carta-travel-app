# T062: Split AdminPage.jsx into domain modules

## Task ID

T062

## Date

2026-09-28

## What changed

`continent-app/src/admin/AdminPage.jsx` was one component of 2,033 lines. The
plan in "Carta BackEnd.md", Phase 5, calls it 1,347 lines; that figure predates
T042 and T043, which added the AI usage, cache hit rate and margin sections. It
is now 151 lines and does three things only: it shows the lock until the owner
re-authenticates, it draws the top bar with the six tabs, and it picks which view
goes in the body. Everything else moved into 24 files under
`continent-app/src/components/admin/`.

Nothing a user or the database can observe changed. The same RPCs are called
with the same arguments at the same moments, and every class name and i18n key
is where it was. The admin harness was instrumented in a scratch copy to dump the
page's HTML at 24 points through its run, on a build from before the split and a
build from after it, and all 24 dumps are byte-identical.

### How the split works

Each tab is two files: a view and a hook. The view (`UsersList.jsx`,
`ConfigManager.jsx` and so on) is pure render. It receives one object and
destructures it, and the JSX inside is the old JSX moved across with its
indentation shifted and nothing else. The hook (`useUsersList.js`,
`useConfigManager.js` and so on) holds that tab's state, its effects and its
actions, again moved line for line out of the old component.

The hooks are called in the shell, not inside the views, and this is the one
design decision in the task that is not obvious. The page only mounts the tab
that is showing. If a view held its own state, every visit to a tab would
remount it, reset it and refetch it. The old page loaded everything once at
unlock and kept it: a half-typed site notice survived a look at the audit log,
and the user search survived opening an account and coming back. Keeping the
hooks in the shell keeps that behaviour exactly. It also gives the domains one
place to talk to each other, which they do: an action on an account reloads the
user list, the stats tiles and the audit trail; marking a feedback row refreshes
the analytics; a feedback row can open its sender's account. Those links are the
arguments passed between hook calls in the shell, so they are visible in one
screen of code rather than buried in a view.

The hooks are called in the same order the old component's single unlock effect
fired its RPCs: margin, then the overview figures, the audit trail, feedback,
content overrides, site_config, and last the user list. React runs effects in
call order, so the network sequence at unlock is unchanged. Anyone adding a hook
should keep that in mind; the order is not load-bearing for correctness today,
but the admin RPCs are rate-limited per caller and a harness that counts calls
would notice.

One domain is still outside the new folder. The Content tab renders
`src/admin/ContentSection.jsx`, which this task was not allowed to touch. Its
override list now comes from `useContentOverrides.js` in the new folder.

### Where each piece went

The prompt named four files. Four more tabs or parts of tabs did not map onto
those names and each got its own file. The Feedback tab is mapped to
`ModerationQueue.jsx`. It is the only triage queue the product has, with the
new, open and done statuses a queue needs, but it is a feedback inbox, not the
DSA content moderation queue Phase 2 of the plan describes. That is written at
the top of the file and is an open item below.

| Old place in AdminPage.jsx | New file(s) |
|---|---|
| Users tab | `UsersList.jsx`, `useUsersList.js` |
| One account in full (`renderDetail` and its actions) | `UserDetail.jsx`, `useUserDetail.js` |
| Site tab (maintenance, notice, flags) | `ConfigManager.jsx`, `useConfigManager.js` |
| Audit tab, and the recent-activity strip on the overview | `AuditLog.jsx` (exports `AuditLog` and `RecentAudit`), `useAuditLog.js` |
| Feedback tab | `ModerationQueue.jsx`, `useModerationQueue.js` |
| Overview tab | `Overview.jsx`, `useOverview.js` |
| Margin dashboard (T043) | `Margin.jsx`, `useMargin.js` |
| AI usage (T042) | `AiUsage.jsx` |
| Cache hit rate (T039) | `CacheHitRate.jsx` |
| Model fallbacks (inline JSX before) | `AiModelFallbacks.jsx` |
| Paywall funnel | `PaywallFunnel.jsx` |
| Four-week bar chart | `Sparkbars.jsx` |
| Re-auth lock | `AdminLock.jsx` |
| Missing-tables warning | `MissingTables.jsx` |
| Content tab's override list | `useContentOverrides.js` |
| Date formatting and account naming | `format.js` |
| RPC error code to sentence | `useErrText.js` |

Three small edits were unavoidable where code crossed a new file boundary, and
they are the only lines that are not a straight move. The lock calls
`onUnlock()` where it called `setUnlocked(true)`. The two places in the account
actions that refreshed the stats tiles, and the one in the feedback action that
refreshed analytics, now call `refreshStats()` and `refreshAnalytics()` from
`useOverview`, which run the same RPC with the same keep-the-old-figure-on-error
behaviour. The feedback row's "open user" button calls `onOpenUser(id)`, which
the shell defines as the same two calls it made before.

The PaywallFunnel doc comment used to sit above CacheHitRate, where an earlier
edit had stranded it. It now sits above PaywallFunnel.

### How the move was done

Nothing was retyped. A scratch Python script read the pre-split file from git,
sliced each piece out by line range, shifted indentation where JSX moved from
deep inside the old render to the top of a new one, and wrote the new files with
hand-written glue only: imports, signatures, the destructuring line, and a short
header comment per file. The script also listed every non-blank line of the old
file that no new file used. The only lines on that list were the old import
block and the old `useAuth()` destructuring, both of which were split across the
new files by hand.

## Files touched

All paths from the repo root. The app files are committed in both repos.

**Modified:**
- `continent-app/src/admin/AdminPage.jsx`

**Created:**
- `continent-app/src/components/admin/AdminLock.jsx`
- `continent-app/src/components/admin/AiModelFallbacks.jsx`
- `continent-app/src/components/admin/AiUsage.jsx`
- `continent-app/src/components/admin/AuditLog.jsx`
- `continent-app/src/components/admin/CacheHitRate.jsx`
- `continent-app/src/components/admin/ConfigManager.jsx`
- `continent-app/src/components/admin/Margin.jsx`
- `continent-app/src/components/admin/MissingTables.jsx`
- `continent-app/src/components/admin/ModerationQueue.jsx`
- `continent-app/src/components/admin/Overview.jsx`
- `continent-app/src/components/admin/PaywallFunnel.jsx`
- `continent-app/src/components/admin/Sparkbars.jsx`
- `continent-app/src/components/admin/UserDetail.jsx`
- `continent-app/src/components/admin/UsersList.jsx`
- `continent-app/src/components/admin/format.js`
- `continent-app/src/components/admin/useAuditLog.js`
- `continent-app/src/components/admin/useConfigManager.js`
- `continent-app/src/components/admin/useContentOverrides.js`
- `continent-app/src/components/admin/useErrText.js`
- `continent-app/src/components/admin/useMargin.js`
- `continent-app/src/components/admin/useModerationQueue.js`
- `continent-app/src/components/admin/useOverview.js`
- `continent-app/src/components/admin/useUserDetail.js`
- `continent-app/src/components/admin/useUsersList.js`
- `Execution/P4/T062-admin-component-split.md`

**Modified (register):**
- `Execution/_OPEN.md`

`continent-app/scripts/verify_admin_panel.mjs` did not need to change: it
selects by class and role, and none of those moved.

## Commands run

Branches, in both repos:

```
git checkout -b p4-admin-component-split
git -C continent-app checkout -b p4-admin-component-split
```

Baseline, from `continent-app/`, before any source file changed:

```
npm run build
node scripts/verify_admin_panel.mjs
```

The split itself was the scratch script `split.py` in the session scratchpad,
run once. Then, from `continent-app/`:

```
npx eslint src/admin/AdminPage.jsx src/components/admin/
npm run build
node scripts/verify_admin_panel.mjs
```

For the DOM comparison, a copy of the harness in the scratchpad had a `dump()`
call added after each screenshot and at the start of each numbered step, writing
the `.adminpage` element's outerHTML to a JSON file. It was run against a build
of the old `AdminPage.jsx` (restored temporarily with
`git checkout HEAD -- src/admin/AdminPage.jsx`, then put back) and against a
build of the split. The copy is not committed and the harness file is unchanged.

Commits:

```
git -C continent-app add src/admin/AdminPage.jsx src/components/admin/
git -C continent-app commit            # cb9d82f
git add continent-app/src/admin/AdminPage.jsx continent-app/src/components/admin/
git commit                              # f8ff1d734
git -C continent-app add src/admin/AdminPage.jsx
git -C continent-app commit            # c8538c4, line endings only
```

The second app commit exists because the script sliced lines from the inner
repo's blob, which stores `AdminPage.jsx` with CRLF endings, and joined them
with LF glue. The first commit therefore stored the file with mixed endings.
`c8538c4` puts it back to all CRLF, as it was before the split. The new files are
stored LF, which is what `core.autocrlf=true` does to any new file. The root repo
normalises everything to LF, so it had nothing to mirror for that commit.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| `AdminPage.jsx` lines | 2,033 | 151 | minus 1,882 |
| Files under `src/components/admin/` | 0 (folder did not exist) | 24 | plus 24 |
| Largest admin file | `AdminPage.jsx`, 2,033 | `Margin.jsx`, 329 | |
| `verify_admin_panel.mjs` checks passing | 29 of 30 | 29 of 30 | none |
| Page HTML at 24 harness checkpoints | | byte-identical to before | |
| eslint on the touched files | | 0 errors, 0 warnings | |
| `npm run build` | passes | passes | |

The one failing check is step 11, "the non-admin hub changed shape". It failed
identically on the pre-split build, it concerns the account hub rather than the
admin page, and it is already registered as T042-d.

The harness's screenshots were compared pixel by pixel. They are not usable as
a strict gate, because several are taken while a CSS transition is still
running: two runs of the same pre-split build differ from each other on six of
the twelve images, always in the same places (a nav button's hover fade, the
flags save button, the margin month selector, the content editor). Across the
split, those same six differ and nothing else does, apart from five pixels on
one tile corner of the overview that differ by one colour step in anti-aliasing
while the HTML is identical. The DOM dump is the comparison this report relies
on.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first app commit stored `AdminPage.jsx` with mixed line endings | The slicing script read the inner repo's CRLF blob and joined with LF | Rewrote all 25 files with CRLF in the working tree; committed the one file whose stored form changed (`c8538c4`) |
| The first draft of the shell dropped the `{section === 'feedback' && (` line | An off-by-one in a slice range | Caught reading the script before it ran; range corrected |
| `PaywallFunnel.jsx` imported `../hooks/usePaywall.jsx` | The moved import kept its old relative depth | Rewritten to `../../hooks/` by the script |

## What is still open

The task number collides. Another session wrote
`Execution/P3/T062-uncommitted-work-and-queue-runner.md` and register rows
T062-a and T062-b for unrelated work, while `_ORDER.md` gives T062 to this
split. This report is in `P4/` as `_ORDER.md` says and its rows start at
T062-c, but two reports now share one number, which breaks the "number makes
each report findable" rule in CLAUDE.md. Whether to renumber one of them is the
owner's call.

`ModerationQueue.jsx` holds the feedback inbox. The name comes from the plan,
which means the DSA notice-and-action queue of Phase 2. When T068 to T070 build
that, they should decide whether content reports join this view as a second
queue or get their own file and the feedback inbox is renamed back to what it
is. Doing either now would be guessing at a design those tasks own.

`src/admin/ContentSection.jsx` is still in `src/admin/` while every other admin
view is in `src/components/admin/`. Moving it was outside this task's files. It
is a one-line import change in the shell plus the move.

Three comments moved with their code and are now slightly stale, because
changing them would have meant editing moved lines: `AiUsage.jsx` and
`Margin.jsx` both still say "Kept self-contained so T062 can lift it into its
own module unchanged", and the shell's header still says the page has "four
sections" where it has had six for some time. Harmless, and worth fixing in the
next task that edits those files.

The harness screenshots are captured mid-transition and differ from run to run,
so a future refactor cannot use them as a before-and-after check without doing
what this task did by hand. Having the harness emulate reduced motion, or save
the DOM next to each screenshot, would make them a real gate. That is a change
to `verify_admin_panel.mjs` this task was not allowed to make for that reason.

## Rollback procedure

Nothing outside the app source changed, so a revert is the whole rollback and
there is no data or config to restore.

App repo:

```
git -C continent-app revert c8538c4 cb9d82f
```

Root repo, the code commit and then the report commit:

```
git revert <report commit> f8ff1d734
```

Or, to take only the source back while keeping history, in either repo:
`git checkout p3-reduce-poi-payload -- src/admin/AdminPage.jsx` in the app repo
(or `git checkout p3-mobile-paint-tiles -- continent-app/src/admin/AdminPage.jsx`
in the root) and delete `src/components/admin/`. The old file is
self-contained, so restoring it alone is enough; the new folder is then unused.
