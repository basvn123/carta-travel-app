# T195: Write PRODUCT.md and DESIGN.md as the durable context

## Task ID

T195 (mind-map number T191; T195 is used everywhere).

## Date

2026-10-01

## What changed

The repo root now carries two files that every session is told to read before touching anything a traveller sees. PRODUCT.md states the audience (people counting money, budget travellers inside Europe), the operational context (reading many prices at once and finding the cheapest honest option for fixed inputs), the provenance rule the numbers follow, the brand voice as it already exists in the carta-design skill, and the accessibility constraints the shipped app actually enforces (44 px tap floor, AA contrast with the ratios written next to the tokens, visible focus, focus traps on modals, reduced motion, six languages, single light theme). DESIGN.md records all 47 custom properties of the `:root` block in `continent-app/src/styles.css` with their exact values and the one job each has: the paper and ink ramp, terracotta for actions and the live route, ochre for ratings as a measure, teal for hidden gems and nothing else, green for good news in data, danger for destruction only, the three faces and the mono rule, the eight-step spacing scale, `--tap`, the three layout variables and the three shadows. CLAUDE.md gained a section that points to both files and fixes the ownership: `styles.css` is the source of truth, DESIGN.md is its record, and a task that changes a token updates DESIGN.md in the same commit.

The pattern comes from the Frontend Design Tools Research document (the Impeccable PRODUCT.md and DESIGN.md convention): an agent with no persistent product and design truth reinvents the brand every session, so the truth is written once and read first. The research document's own suggestions on colour and type (OKLCH ramps, Cormorant Garamond, a Mediterranean blue primary, Tailwind v4) were not adopted. The session note was explicit that the shipped `:root` and the carta-design banner of 2026-07-28 are the decided state, so DESIGN.md is a transcription of what ships, not a proposal. The research document is cited as the reason for the pattern only.

One conflict is recorded rather than resolved. The carta-design SKILL.md banner says Fraunces, Plus Jakarta Sans, JetBrains Mono, alabaster and terracotta are current; the body of the same file still teaches the reverted cool-grey Timetable palette, Instrument Sans, IBM Plex Mono and "no serif anywhere", and `assets/tokens.css` ships those old values. DESIGN.md says plainly that the banner and DESIGN.md win on colour and type and that T198 owns the explicit typography decision. The skill file was not edited because the task does not name it.

Six pre-existing em and en dashes in CLAUDE.md were replaced while the file was open, because the no-dash rule is a hard rule everywhere and the file is now the entry point to PRODUCT.md, which states that rule.

## Files touched

**Modified:**
- CLAUDE.md (new section "Read PRODUCT.md and DESIGN.md first"; six dashes replaced)
- Execution/_OPEN.md (three rows appended)

**Created:**
- PRODUCT.md
- DESIGN.md
- Execution/P11/T195-product-and-design-context.md

No files in the app repo (`continent-app/`) were changed. The task has no app worktree.

## Commands run

Reading only, from the main checkout, never written to:

```
sed -n '/^:root/,/^}/p' continent-app/src/styles.css
grep -c "var(--display)|var(--mono)|var(--ui)" continent-app/src/styles.css
awk 'NR<13 || NR>109' continent-app/src/styles.css | grep -o "#[0-9a-fA-F]\{6\}\b\|#[0-9a-fA-F]\{3\}\b" | wc -l
python -c "import json; d=json.load(open('app_data/app_data.json')); print(len(d['destinations']))"
```

Verification, in the worktree. The script parses the `:root` block, strips comments, and compares every `| --token | value |` row in DESIGN.md against it, then lists any shipped token the document omits:

```
python - <<'EOF'
import re
css=open(r"...\continent-app\src\styles.css",encoding="utf-8").read()
root=css[css.index(":root {"):]; root=root[:root.index("\n}")]
root=re.sub(r"/\*.*?\*/","",root,flags=re.S)
ship={k:" ".join(v.split()) for k,v in re.findall(r"(--[\w-]+):\s*([^;]+);",root)}
doc=open("DESIGN.md",encoding="utf-8").read()
rows=re.findall(r"^\| `(--[\w-]+)` \| `([^`]+)` \|",doc,flags=re.M)
bad=[k for k,v in rows if ship.get(k)!=v]; missing=[k for k in ship if k not in dict(rows)]
print(len(ship),len(rows),bad,missing)
EOF
```

Result: 47 shipped, 47 documented, no mismatches, nothing missing. A dash scan over PRODUCT.md, DESIGN.md and CLAUDE.md returned zero U+2014, U+2013, U+00B7 and U+2022 characters.

Git:

```
git -C "C:\Users\Gebruiker\Documents\Portfolio\wt\T195" add PRODUCT.md DESIGN.md CLAUDE.md Execution/P11/T195-product-and-design-context.md Execution/_OPEN.md
git -C "C:\Users\Gebruiker\Documents\Portfolio\wt\T195" commit
git -C "C:\Users\Gebruiker\Documents\Portfolio\wt\T195" show --stat
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Durable context files at the repo root (PRODUCT.md, DESIGN.md) | 0 | 2 | +2 |
| References to them from CLAUDE.md | 0 | 1 section, both named | +1 |
| `:root` tokens in styles.css recorded in DESIGN.md with the exact shipped value | 0 of 47 | 47 of 47 | +47 |
| Hex literals outside `:root` in styles.css (context, not moved by this task) | 378 | 378 | 0 |
| Em or en dashes in CLAUDE.md | 6 | 0 | -6 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Heredoc write of PRODUCT.md failed with "unexpected EOF while looking for matching quote" | The Bash tool mangles backticks inside a quoted heredoc (same family as the known backslash trap) | Wrote the three markdown files with the Write tool and used python for the register append |
| DESIGN.md first said primary buttons use `--paper` text on the accent | Assumed from the skill; the shipped rules use `#fff` on `.crash-btn.primary` and the ink fill | Corrected to "white text" before commit |

## What is still open

The carta-design skill body contradicts its own banner and now DESIGN.md. Its colour table, type section, "never do this" items 1 to 3 and `assets/tokens.css` describe the reverted Timetable look. A reader who skips the banner will paint a Carta surface blue and grey in Instrument Sans. T198 decides the typography conflict explicitly; after that the body should be rewritten and `tokens.css` replaced with the shipped `:root` or deleted. Register row T195-a.

DESIGN.md says never to hardcode a hex outside `:root`, and 378 hex literals in styles.css already break that rule (the most frequent are a second red `#b3402a` and several greens that are not tokens). T191 (design tokens and CSS modules) owns the migration; DESIGN.md records the count and the date so the next sync can measure the drift. Register row T195-b.

`continent-app/index.html` loads Instrument Sans, IBM Plex Mono and Inter Tight from Google Fonts although none of them is a token face (Inter Tight appears only as a fallback name in `--ui`). T199 self-hosts fonts; it should drop the unused families at the same time. Register row T195-c.

The catalogue figure in PRODUCT.md (3,868 destinations on 2026-10-01) is dated on purpose and the text says to read `meta` rather than copy it. `docs/1.CARTA.md` and the skill still say 1,570 and PLAN.md says 3,038; those are their own tasks' stale figures and were not touched.

## Rollback procedure

```
git -C "C:\Users\Gebruiker\Documents\Portfolio\wt\T195" revert <commit>
```

or, before merge, drop the branch `p11-product-design-docs`. The task created no data, no config and no app-repo change, so reverting the one root-repo commit restores the previous state completely. The three register rows should then be marked closed or removed in the same revert.
