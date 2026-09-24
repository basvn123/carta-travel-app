# Execution Report Template

Use this template for every task completion report. The shape is fixed so 150 reports remain comparable and searchable.

## Task ID

T001, T002, etc. One per report.

## Date

YYYY-MM-DD when the work shipped.

## What changed

One paragraph: the real change, not the task description. What is different about the system or data now? Avoid restating the requirement; instead explain the outcome. Include before/after figures if the task implies a measurement.

## Files touched

Structured list of all files modified, created or deleted. Group by category (pipeline, app, tests, data) to make scanning faster.

**Modified:**
- file path

**Created:**
- file path

**Deleted:**
- file path (if any)

## Commands run

The exact bash or PowerShell commands that made the change, in order. Include data refreshes, pipeline runs, schema migrations, or deploys. This is what you would repeat to undo and redo the work.

## Config and secrets set

Any environment variables, database credentials, API keys, feature flags or settings files changed. Record both the key and the value (redacted if sensitive). This catches "it works for me but not in CI" problems.

## Before/after measurements

One table with columns: Metric, Before, After, Delta. Only include metrics the task implies. Example:

| Metric | Before | After | Delta |
|---|---|---|---|
| Highlights modal share | 87.2% | 12.4% | −74.8pp |
| Highlights SD | 0.063 | 0.168 | +0.105 |

If the task had no measurable outcome, write "Not measured" and move on — do not invent metrics.

## What broke and how it was fixed

Bugs discovered during implementation or testing. One row per bug: what failed, the root cause, and how it was resolved. If nothing broke, write "No issues."

| What | Cause | Fix |
|---|---|---|
| Rating changed for metro | Quantile mapping inverted | Ensure descending rank |

## What is still open

Incomplete work that belongs to this task but was blocked or deferred. Link to the next task that depends on it. If nothing is open, write "None." Every item named here also becomes one row in `Execution/_OPEN.md` (see CLAUDE.md, "Every open item also goes into the register"); the row is the pointer, this section is the argument.

## Rollback procedure

The exact steps to undo this work if it goes wrong after shipping. Use the commands listed earlier; you are just reversing them. If rollback is impossible (e.g., a data model change that is already live), state that plainly.

---

## Notes on filling this template

- Write in plain prose. No bullet-point walls, no bold scattered mid-sentence, no emoji.
- Numbers and measurements are required only when the task specification implies one. If a task is "add a component", there may be no before/after metrics — that is fine.
- The "Files touched" section should let someone clone the repo and compare the exact changes without running the task again. Use relative paths from the repo root.
- Commands should be copyable. If they depend on environment setup, note that separately in the config section.
- The report is for the next person who inherits this task, or who has to debug it six months later. Write as if briefing them on how the system works and why it was built this way.
