# T270: admin UI follow-ups

## Task ID

T270

## Date

2026-10-02

## What changed

Seventeen open rows from the admin and moderation work are now closed or have a stated reason for staying open. The admin page now shows what is waiting for a person: a count badge on the Reports and Content tabs, and two tiles on the Overview for new DSA reports and overdue overrides. The Overview also gets two cards, import parse failures (admin_parse_failures) and the VAT One Stop Shop figure (admin_oss_threshold). The Site tab lists every config key with a Public or Private switch (the 045 RPCs); the three keys the app reads signed out are locked public. The Guides tab loads 100 and has Show more. The Audit tab draws previous and new side by side. A refused feedback status change shows its reason. The diff viewer lists any patch field it does not know by name. ContentSection.jsx moved into components/admin. Orphan detection caches its catalogue read and has a Re-check button and a Copy list button. Stale comments in useSiteConfig.js, useUnpublishGuide.js, AiUsage.jsx and Margin.jsx were corrected. Two paragraphs were added to the privacy policy.

One bug was found and fixed on the way. fetchValidItemIds read the catalogue with a raw fetch and treated a failed read as an empty layer, so a failed fetch (or the data host move, which dataUrl handles) would have flagged every override in that layer as an orphan. A layer that cannot be read is now left out and counts as unknown, never as orphaned.

The privacy policy is one English component, not an i18n catalogue, so there are no six locales to translate for T071-b or the T018 sentence.

## Files touched

Branch p4-d2b-admin-ui in both repos.

**Modified (app, continent-app):**
- src/admin/AdminPage.jsx (badges, attention counts, errText to the feedback hook, new import path)
- src/auth/admin.js (adminParseFailures, paged adminListPublicGuides with a pre-045 fallback, OSS comment)
- src/components/PrivacyPolicy.jsx
- src/components/admin/AiUsage.jsx, Margin.jsx, useUnpublishGuide.js, src/hooks/useSiteConfig.js (comments only)
- src/components/admin/AuditLog.jsx, ConfigManager.jsx, useConfigManager.js, FeedbackInbox.jsx, useFeedbackInbox.js, useErrText.js, Overview.jsx, useOverview.js, PublicGuides.jsx, usePublicGuides.js, OverrideDiffViewer.jsx, useContentOverrides.js (comment)
- src/components/admin/ContentSection.jsx (moved, then orphan cache, re-check, copy list)
- src/lib/overrides.js (cached, dataUrl, unknown-layer-safe orphan detection)
- src/i18n/en.js (admin.* keys; the admin page is English only)
- src/styles.css (audit pair, key list, nav badge, attention tiles)
- scripts/verify_admin_panel.mjs (new checks, VERIFY_PORT, scoped the flag switch selector)
- scripts/verify_no_runtime_fares.mjs (path of the moved file in its allow list)

**Created (app):**
- src/components/admin/ParseFailures.jsx
- src/components/admin/OssThreshold.jsx

**Modified (root):** Execution/_OPEN.md. **Created (root):** this report.

## Commands run

    git -C wt/T270-app git mv src/admin/ContentSection.jsx src/components/admin/ContentSection.jsx
    # vite dev on 5201 with the two public VITE_SUPABASE_* values passed as environment
    VERIFY_PORT=5201 node scripts/verify_admin_panel.mjs
    npx eslint src scripts/verify_admin_panel.mjs

Commits used core.autocrlf=false so each file keeps its own line endings (some are CRLF, some LF).

## Config and secrets set

None. The harness stubs every RPC; the dev server was given the project URL and anon key from the main checkout's .env through the environment, not copied to a file. No dist/ was built.

## Before/after measurements

Not measured, apart from these counts from the harness: Guides first page 100 rows then 130 after Show more (stub of 130); Overview shows 2 attention tiles; the audit pair shows both OLD and NEW markers whole.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Whole-file diffs on the first commit | autocrlf rewrote CRLF blobs to LF | recommitted with core.autocrlf=false and restored each file's own endings |
| Harness never reached the admin row | dev server had no Supabase env | passed the two public VITE values through the environment |
| Section 9 of the harness would fail with the new key switches | selector .adminpage-switch matched more than the flag switch | scoped it to .adminpage-flags |
| Orphan detection flags every override if a layer fails to load | failed read stored as an empty Set | unread layers are omitted and treated as unknown |

The harness finishes with one failure, check 11 (the non-admin hub changed shape). It failed before this task and is the account-hub row in the D2 list; T270-c points at it.

## What is still open

Closed by T270: T062-e, T064-b, T065-d, T066-c, T067-e, T070-h, T068-b, T073-c, T074-b, T075-a, T075-b, T076-c, T033-e, T071-b, T268-d. T066-b and T067-b were already closed by T268; their UI halves are in T268-d.

Left open, with the reason:
- T032-d (refund exposure): nothing the admin page can call returns the count behind pass_grants_no_consent_idx, and no migration is allowed in this task. It needs a small admin_guard RPC in a later migration, then a tile.
- T068-h (report path for author bylines): a new report target needs a table change and an RPC, so a migration. Not a UI job.
- T075-c (detect orphans from the built wire): a pipeline-side decision, as the row says.

New rows: T270-a (owner approves the privacy wording), T270-b (the new cards need migrations 026, 042 and 045 pasted), T270-c (check 11), T270-d (no revert action on the Audit tab, and why).

T064-b asked for previous beside new and a decision on a gated revert. The decision is no revert for now: the RPCs cannot delete a config key that was new or empty an override note, so a button would work for some rows and not others.

The unlock sequence gained three calls (parse failures, OSS, new-report count). Each fails to null, so a project without 026, 042 or 045 simply shows no card.

## Rollback procedure

Nothing is applied to any database and nothing is pushed. Undo with `git revert` of the two T270 commits in continent-app (p4-d2b-admin-ui) and of the root commit, or drop the branches. The move of ContentSection.jsx reverses with the same revert. The _OPEN.md rows go back to open with the same revert.
