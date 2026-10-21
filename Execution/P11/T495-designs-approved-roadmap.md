# T495: designs approved, roadmap brought up to date, decision sheet

## Task ID
T495

## Date
2026-10-21

## What changed
The owner approved the seven designs of the T484 to T492 batch ("roadmap: akkoord", 21 October). The roadmap rows 1.3, 1.3a, 1.3b, 1.3c, 1.3d, 1.4 and 1.15 now read "Klaar, goedgekeurd 21 okt", each with its document and task. The "Begin hier" paragraph now gives the state on 21 October and what comes next: answer the detail questions, then 1.3e, 1.5, 1.17, 1.18 and 1.19, with 2.18 waiting on the T488 answers. A line under the owner decisions records the approval. The open detail questions from the designs (55 rows owned by the user, T484-a to T492-g) are collected in one private decision sheet, https://claude.ai/artifact/UeUtVU7C7zXPQT5NwYXCZU. It has options per question (the design's proposal marked) and a note field. Answers save to the sheet's own store (collection `answers`, one document per row ID), which the next session reads back to apply them to the register and the roadmap.

The finish of T484 to T494 ran in this task's session. The root merge (`537b8efe4`) went to `main` after the five app files that differed only in line endings were checked out clean, and was pushed to GitHub. The `master` build (`npm run build:pages`, 163 files) was deployed to Cloudflare Pages as deployment `d52ff1a2`. A live probe found the T494 `--bottom-nav-h` token in the production CSS, and `/api/forecast` answers 200.

## Files touched
**Modified:**
- `Roadmap/Carta roadmap.md`
- `Execution/_OPEN.md` (one row)

**Created:**
- `Execution/P11/T495-designs-approved-roadmap.md`
- the decision sheet artifact (claude.ai, outside the repo)

## Commands run
```
git checkout -- <five EOL-only app files>; git checkout main; git merge --no-ff p11-design-batch; git push origin main
cd continent-app; npm run build:pages; npx wrangler pages deploy dist --project-name carta-app --branch main
curl -sL https://www.carta-europetravel.com/assets/index-CEhBjI9e.css | grep bottom-nav-h
node scratchpad/roadmap2.js   # roadmap statuses and Begin hier
```

## Config and secrets set
None. The sheet declares only the artifact `db` capability.

## Before/after measurements
Not measured.

## What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| The root merge refused to switch branches | Merging the app branch rewrote five shared app files with CRLF, which the root repo saw as modified | `git diff --ignore-cr-at-eol` was empty, so the five files were checked out clean before the merge |

## What is still open
T495-a: apply the owner's answers from the decision sheet to the register (close or reword each T484 to T492 row) and to the documents.

## Rollback
`git revert` this task's commit. Production: roll `carta-app` back to `4b860e73` in the Pages dashboard.
