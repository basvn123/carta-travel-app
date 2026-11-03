# T{n}: {title}

Report template. Keep the headings so reports stay searchable; keep each section as short as the truth allows. Plain prose, no emoji, no em dashes. A report is never edited after its task closes; a later fix gets its own report.

## Date

YYYY-MM-DD when the work shipped.

## What changed

One paragraph: the outcome, not the task description. What is different about the system or data now, with before and after figures if the task implies one. This paragraph is what the phase digest keeps, so make it stand alone.

## Files touched

Modified, created and deleted paths, relative to the repo root (prefix `continent-app/` for the app repo). Group them when there are many.

## Commands run

The commands that made the change, in order (pipeline runs, migrations, deploys), copyable.

## Config and secrets set

Keys and values changed (redact secrets), or "None".

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|

Only metrics the task implies. Otherwise "Not measured".

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|

Or "No issues". Gotchas the next session would otherwise rediscover go here; the digest keeps this table too.

## Screens checked

Which screens and widths the browser check covered and what was seen. Screenshots stay out of git.

## What is still open

Each item, with the reasoning. Every item is also one row in `Execution/_OPEN.md`. Or "None".

## Rollback procedure

Normally `git revert <commits>` in each repo touched. Say plainly if anything is one-way (live data, an applied migration).
