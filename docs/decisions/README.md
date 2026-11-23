# Decisions

Each file here records one decision that still matters, so nobody has to guess later why Carta is built or run this way.

- **Name:** `NNNN-short-title-with-dashes.md`, numbered in order.
- **Format:** context, options considered, decision, consequences, how we'll know it works (crew template: `adr.md` in the crew document-run skill).
- **Changing your mind:** don't edit an old decision. Write a new one, and set the old one's status to `superseded by NNNN`.
- **Who writes them:** a crew run writes one when it made a lasting choice. The owner can write them by hand too.
- **Product and feature rules** (formulas, thresholds) live in `docs/HANDBOOK.md` and `docs/logic/`, not here. Research behind a choice lives in `docs/research/`.

## Index
| # | Decision | Status | Date |
|---|---|---|---|
| [0001](0001-adopt-crew.md) | Run all Claude work through crew | accepted | 2026-11-11 |
| [0002](0002-run-history-in-work-index.md) | Run history in `.work/INDEX.md`, reports committed | accepted | 2026-11-11 |
| [0003](0003-open-items-owner-steps-and-roadmap.md) | Open items: owner steps in `docs/owner/`, follow-ups in `ROADMAP.md` | accepted | 2026-11-11 |
| [0004](0004-lean-always-loaded-context.md) | Keep the always-loaded context lean | accepted | 2026-11-11 |
| [0005](0005-runtime-ai-on-gemini.md) | Runtime AI on Gemini, never the Claude API | accepted | 2026-09-23 |
| [0006](0006-design-rules-are-defaults.md) | Design rules are defaults; the owner's taste binds (look rules superseded by 0012) | accepted | 2026-10-30 |
| [0007](0007-register-business-late.md) | Register the business late, as a sole trader | accepted | 2026-11-04 |
| [0008](0008-priorities-docs-security-ui.md) | Documentation, security and UI come first | accepted | 2026-11-04 |
| [0009](0009-launch-plan-fast-track.md) | Launch plan: the fast track, opening 9 March, campaign 4 May 2027 | accepted | 2026-11-12 |
| [0010](0010-legal-posture-diy.md) | Legal posture: digital-service pass, self-review instead of a lawyer | accepted | 2026-11-12 |
| [0011](0011-travel-styles.md) | Travel styles: one switchable "how you travel" for the whole app | accepted | 2026-11-13 |
| [0012](0012-house-style.md) | The house style: Waymark, in Line's colours, rounder | accepted | 2026-11-15 |
| [0013](0013-my-trips-atlas.md) | My trips as one atlas: examples behind a button, prices you follow | accepted | 2026-11-21 |
| [0014](0014-spend-on-device.md) | Uitgaven: one page, a Reiskas split, capture on the device without AI | accepted | 2026-11-22 |
| [0015](0015-my-trips-journey-line.md) | My trips speaks the map's language: the journey line, the wish hatch, past trips under the map | accepted | 2026-11-22 |
| [0016](0016-my-trips-ink-and-photo.md) | My trips in ink and photo: larger photos, line and ink controls, no beige | accepted | 2026-11-22 |
| [0017](0017-ai-cheapest-layer-first.md) | AI: cheapest layer first, proven by paired tests | accepted | 2026-11-19 |
