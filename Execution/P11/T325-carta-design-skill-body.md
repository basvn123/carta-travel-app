# Execution Report

## Task ID

T325

## Date

2026-10-03

## What changed

The carta-design skill body now teaches the decided state instead of the reverted cool-grey Timetable palette. Colour, type, layout, components, interaction, copy, the never list, the quality floor and the seven ship questions were rewritten from DESIGN.md as it stands on main (d39d55a0b) and from the T198 typography decision. The skill now says: warm alabaster paper, slate ink, one terracotta accent; Fraunces for display only, Plus Jakarta Sans for everything else, JetBrains Mono for measured facts; ochre for ratings, teal for gems, danger red for destruction only; three ink shadows and no gradients; focus ring in `--accent`. Carta does not price flights is stated in the product description, per the owner decision of 2026-10-02. The skill's assets/tokens.css was replaced by a copy of the current `:root` (no Google Fonts import, plus the focus and reduced-motion rules).

Where the skill actually lives: the prompt said the folder is at C:\Users\Gebruiker\.claude\skills\carta-design, outside both repos. It is not there. The only copy is tracked in the root repo at `.claude/skills/carta-design/`, so I edited it in my worktree on branch p11-carta-design-skill, never in the main checkout. Backup taken before any edit: `C:\Users\Gebruiker\.claude\skills-backup\carta-design-2026-10-03\` (the original is also in git history).

Sections of SKILL.md changed: the front banner (rewritten as a short rewrite note), What Carta is (flights no longer priced, no "1,570 destinations" figure), Colour (whole table and rules), Type (whole section), Layout (now Layout and spacing), Components (buttons, search strip, receipt, pins, plan cards, cards, new verdict chips), a new Interaction section, Copy (flight line added, middot ban), Never do this (cream, serif, terracotta and shadow bans removed, hardcoded-token item added), Quality floor (focus colour, tap size), Before you ship (questions aligned with DESIGN.md). Front matter kept unchanged. Why this file exists is shortened.

T191 is refactoring styles.css and its tokens this wave and may rename tokens, so the skill is written from DESIGN.md as of now. Row T325-a asks for a re-check after T191 merges.

## Files touched

**Modified:**
- .claude/skills/carta-design/SKILL.md
- .claude/skills/carta-design/assets/tokens.css
- Execution/_OPEN.md

**Created:**
- Execution/P11/T325-carta-design-skill-body.md

**Deleted:** none.

## Commands run

Backup with cp -r to the skills-backup folder; `git sparse-checkout add .claude` in the worktree; tokens.css built by extracting the `:root` block of continent-app/src/styles.css with awk; SKILL.md assembled from the old front matter plus the new body.

## Config and secrets set

None.

## Before/after measurements

Not measured. Checked instead: no em dashes in either file, and the skill body no longer mentions Instrument Sans, IBM Plex Mono or `--signal` except in the rewrite note.

## What broke and how it was fixed

The skill path in the prompt was wrong (see above); handled by working on the tracked copy. A first assembly script failed on shell quoting before running; nothing was written by it.

## What is still open

No screen was touched, so no browser check was needed. T195-b is left open: the skill half is done, but the 378 hex literals in styles.css belong to T191. Rows T325-a and T325-b record this. DESIGN.md still says "T325 rewrites the skill body"; I did not edit it (out of scope); a later DESIGN.md sync can reword it.

## Rollback procedure

Revert the commit on p11-carta-design-skill, or restore from `C:\Users\Gebruiker\.claude\skills-backup\carta-design-2026-10-03\`.
