# T460 critique, after (2026-10-16)

Method: dual-agent, as before (`assessment-a-after.md`; `assessment-b-after.md` and `audit-after.md`). Frames and measurements: `../T460-shots/after/` (built preview, guest, free and Trip Pass holder, 360, 390, 820 and 1440 px, English and German).

| | Before | After |
|---|---|---|
| Critique (Nielsen, /40) | 22 | 26 |
| Audit (/20) | 10 | 15 |
| Audit issues P0, P1, P2, P3 | 0, 5, 8, 3 | 1, 3, 5, 6 |

The panel is one decision on one phone screen (717 of 844 px), with about 106 words, one primary that names the amount, and two lines of small print. Every before finding was addressed; the before P0 dead ends (paying travellers out of plans, a guest's choice lost at sign-in) are fixed.

## The fix batch after the critique and audit

- **P0.** The panel opened under the destination page and the day-plan dialog. It now takes the z 320 layer again; probed on top at 390 and 1440 px.
- **P1.** A cancelled yearly plan with time left offers "Keep my yearly plan" instead of a second subscription. 053 refuses a second live yearly plan.
- **P1.** The waiver consent is written onto the first grant whichever Stripe event arrives first.
- **P1.** The cancel route in Account is T461's (row T460-e); the billing calls behind it are in place.
- **P1.** A subscriber's small print names the renewal. A Trip Pass running out opens on the Trip Pass, and the yearly card says the days carry over.
- **P2.** An incomplete first payment is not a live plan. Checkout reuses the Stripe customer. The ticks are decorative, the Terms link is brown, the small print is `--text-2`. "1 day left". The unavailable line in plain words.

Left for the owner or later: legal review (T460-b), price calls (T460-d), the app-wide CheckIcon label (T460-g), Deno types (T460-h), and the FAQ line (T460-f, T461).
