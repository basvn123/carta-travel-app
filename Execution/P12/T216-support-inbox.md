# T216 support inbox and response commitment

## Task ID

T216 (mind-map M16). Branch p12-support-inbox, root repo only.

## Date

2026-10-02

## What changed

Carta now has a written support page, docs/SUPPORT.md. It fixes the address the legal documents should name, the response time Carta commits to, and four canned answers. Before this, the Imprint, the Terms, the Privacy Policy and the account panel all pointed at the owner's personal Gmail address through a CONTACT constant, the Terms promised an answer "within 30 days" and a refund answer "usually within a few working days", and nothing was written down for what to say.

The address chosen is support@carta-europetravel.com, a role mailbox rather than a person, so it can outlive any one reader. The mailbox does not exist yet and creating it is the owner's step. Until then nothing in the app changes, on purpose: this task names no app file, and switching four CONTACT constants to an address that does not receive mail would be worse than the Gmail address.

The commitment is a first human answer within two working days, a refund decision within three working days, and a finished export or deletion within seven days. The Terms promise less (30 days, a few working days), so the commitment can be kept and shown to be kept before it is printed anywhere. The page says to count slips weekly and to turn on an auto-reply on holiday.

The canned answers cover a refund (granted, refused, sale not found), a wrong price, account deletion and a data export. The wrong-price answer is built on the provenance chain: before replying, open the same screen and read the chip on the figure, which says estimate, observed on a date, or cached until a date, and answer in those words. The page notes that Carta no longer prices flights (T272), so a wrong flight price can only be a frozen estimate until T272-a removes them. The deletion and export answers point to the buttons in the account panel first, then give the by-hand route. The export button depends on migration 024, which is not applied live, and the page says so.

## Files touched

**Created:**
- docs/SUPPORT.md
- Execution/P12/T216-support-inbox.md

**Modified:**
- Execution/_OPEN.md (rows T216-a to T216-d)

No code, no migration, no app repo change.

## Commands run

```
git -C C:/Users/Gebruiker/Documents/Portfolio/wt/T216 add docs/SUPPORT.md Execution/P12/T216-support-inbox.md Execution/_OPEN.md
git -C C:/Users/Gebruiker/Documents/Portfolio/wt/T216 commit
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Monitored support address named by the legal documents | 0 (personal Gmail) | 0 until the mailbox exists (T216-a) | none yet |
| Written response commitment | 0 | 3 figures (2 days, 3 days, 7 days) | +3 |
| Canned answers | 0 | 4 topics, 8 texts | +8 |

## What broke and how it was fixed

No issues.

## What is still open

The mailbox must be created and monitored by the owner, and then the four CONTACT constants switched to it, which is an app task (T216-a). The Terms contact paragraph can state the two-day figure after a month of keeping it (T216-b). The canned answers should be sent once for real, or against a test purchase, and corrected where reality disagrees (T216-c). Migration 024 must be applied before the export button works, which the page depends on (T216-d).

## Rollback procedure

Delete docs/SUPPORT.md and this report, and remove rows T216-a to T216-d from Execution/_OPEN.md, or revert the commit. Nothing else was changed.
