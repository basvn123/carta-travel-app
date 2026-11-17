# Account rules (reference)

Covers My trips, Account, Together, sign in, the pass and pricing, the paywall, the Ask Carta chat, settings, the first run, and empty and error states. The look rules below were written by the account lane of the house style run (2026-11); the product rules after them bind as before. `DESIGN.md` and the carta-design `SKILL.md` win where this file is silent.

## Look (house style, account lane 2026-11)

**Account's own look: a ledger.** Section heads at `--text-lead` 800 in ink over paper panels with control-radius corners (`--radius-control`) and one hairline edge (`1px solid var(--border)`), no shadow (written records, not floating cards); row icons in second ink; the identity card's counts are headline figures; the face is the person as Together draws them (paper with an ink outline, never umber); the plan on the identity card wears the umber mark plate, because the plan is the traveller's own choice. The rail shows from 769 px (a tablet is two panes).

**One row language for every secondary surface.** The FAQ, Your data, Together's lists and the settings are paper panels of hairline rows; in Account they are the ledger panels above (`--surface`, `--radius-control`, `1px solid var(--border)`, no shadow), elsewhere in this area paper on `--radius-sheet` with `--elev-1`. A row is `.ac-row` (56 px: icon, label, value, chevron). A form a row opens sits in place under it, on the same paper, and arrives with the reveal (`hs-reveal`); it never becomes a second card or a tinted box. Fields read exactly like the kit `Field` (1.5 px `--edge`, 8 px, 16 px text, the 3 px focus ring), whether they are the kit part or an older `.auth-field`, `.acct-handle-row` or `.report-input` (the older classes and ids stay: scripts pin them). Buttons are the kit's: one primary per view, secondary on paper with an ink edge, quiet for text actions, danger only for Delete forever.

**Sign in and the gate.** A paper dialog with the dialog shadow (`--elev-3`); on a phone it rises from the foot as a sheet (`hs-sheet-in`), on wider screens it scales in (`hs-dialog-in`). The wordmark slot as in the header (a blaze and the name in the plate face), never the old compass logo. Sign in or Create account is the kit `Segmented`. A refused submit shakes the form once (`hs-shake`) with the warn haptic, and the error is danger words with a round "!" mark, never a tinted slab. The gate has one primary (Sign in); Create account is the secondary; Continue with Google the third; guest and privacy are quiet.

**Errors and notices.** An error is `--danger` text in words, with focus or a mark, never a side stripe (the report sheet's old left border is gone). A success line is ink on the beige wash (`--select-bg`, `--select-ink`) with its tick and a 44 px close. No green anywhere in these screens: a positive mark is umber (`--action`), a done step an umber tick.

**My trips.** The unit is said once: a label before the focal card's figure ("A day, a person €147") and once in the head of each section of rows (Upcoming, Planning); rows print the figure alone and keep the unit for screen readers only. "Ready for the trip" is part of the card under a hairline, not a sunken card in the card: the four-part bar and the step marks are the umber paint, the steps keep their words (done, 1 of 2). No eyebrow above a heading (Today's "day 4 of 6" follows the place name). Spent today uses the formation's paint (food beige with its edge, getting around umber, the rest the control grey) and always its legend words. The empty tab is the waiting path: a dashed blaze, the space's icon, the name and one action.

**Together.** No dark slab: "Plans that meet" is a paper card; your days are paper with an ink outline, a friend's the stone tint with ink words, the shared days a dashed umber outline. No umber or beige for a person (umber means "chosen"): you are paper with an ink outline, friends wear neutral-ramp fills, always with the name. The "You and Sam" map: both ink, you paper with an ink edge, them the control grey, each with its legend word and count. A poll is hairline rows inside its card (no boxes), the vote share a beige fill behind the row, the chosen option the row wash; an over-budget option says so in second ink ("€745, over budget"), the budget itself once in the Budget panel. Each view arrives as a pushed view (`hs-route-in` on `.tg-route`, keyed by view and subject); menus, inline forms, notices and errors reveal.

**Pass and pricing.** The pass sheet is a sheet on a phone and a dialog from 769 px. The two plans are leg plates as radios: paper in a 1.5 px edge, the chosen one with the umber edge, the umber 50 wash and the tick that springs in; the price is the loudest line (`--text-headline`, 800). Equal weight, the free plan never dimmed. The Pass moment is one paper card: the two lists on the same paper split by one hairline (no Lagoon or umber tinted columns), umber ticks for the pass, ink ticks for free, the foot under a hairline. The /pricing title is a page title (`--text-headline`), not a total figure.

**AI.** The boxed "AI" tag (`components/AiTag.jsx`, `.ai-tag`) stands for AI everywhere these screens show it: the chat title, the Ask door, the credit chip, the written-by-AI mark, Account's Carta bot plans and AI rows, the booking reader. Never a sparkle. Sending a question is a commit (confirm haptic on touch). A trip card inside Carta's answer is a section of the bubble under a hairline, not a card in a card.

**Motion.** Account's pane changes and Together's views use the Route primitive; in-place forms, banners, the avatar picker and the forgot step use Reveal; pass plans and avatars press and spring back on the tick; reduced motion shows every end state at once.

Numbers and money (the pass price in cents), errors and empty states copy ("When the AI is off, say it is off"), the bottom slot and undo, inline confirms (deleting an account, publishing to the gallery, withdrawing a public link), loading, dialogs and the quality floor: see shared-product-rules.md. The install hint in My trips: see brand.md. The settings line: see explore.md.

## The free sentence

"Planning is free. A Trip Pass adds exports, more saved trips and more AI plans." One key (`pass.freeSentence`), in exactly five places (the home page dropped it, owner 2026-10-31, T959): the FAQ, the pass sheet, Account's Your plan, /pricing and its meta text. Never "100% free".

## Where the pass shows (T488, T497)

The pass is never in the header or the bottom nav; it appears only at the moment something paid is tapped, in Account and on /pricing, with the Trip Pass listed first and preselected.

## Plan cards

Equal weight; the recommended plan is marked with a "Recommended" chip and keeps the same ground. Never dim the free plan. State limits as plain numbers.

## My trips, Account and the pass screens (T503)

A trip on My trips carries one price: what a day costs a person, in whole euros, with the unit said once ("A day, a person") and never under every card (owner 1.8; house style 2026-11); the party's total belongs to the receipt in Plan. A trip kept without an account says where it is ("Saved on this device") in one short line under its card, with "Sign in" as a quiet small button, offered only as the way to have it on a second device, never as a condition. The Visited band carries the countries (the figure, the flags, Edit or Add in the same cell, the names as a list for screen readers); there is no second list of countries, and with nothing on the record the band is that one cell and its Add, never a row of zeros. "See all prices" is a quiet link (`--tap` high) to `/pricing` at the foot of the pass sheet (Account's Your plan dropped it, owner tick T503-g, 2026-11-12; the pricing page stays), never a second primary; following it from the sheet closes the sheet first. Where the numbers come from (`/about/numbers`) is a link row in Account's help menu and desktop rail; the method and the counts live on that page and nowhere else. The pass price itself stays in cents, the amount charged.

My trips in the nav carries the star count only (T496). Language and currency live in Account, not in the settings line. On a phone, Home is a "How Carta works" row in Account.

On a list of dated plans the first upcoming one may be one size larger (a focal card), never a bento.

Earned milestones read as earned, locked ones as locked; "New" is an outline chip.

## Ask Carta (T569, T570, T583, T584, T595)

Ask Carta is a chat (`src/browse/ask/`): one "Ask Carta" door (since T595, 2026-10-22: a field-like door in Explore's overview, and nowhere else; none in the header, none on Plan) opens a panel docked right under the settings line on desktop, the list making room beside it, and a full-screen sheet on a phone. The chat's head and foot stand on the panel's ground; the field is the one object at the foot (T584). The field has no placeholder.

The Ask Carta exception (T569, owner 2026-10-22: "I like some animation"; T570 moved it into the chat). A chat may show that it is working and what to ask by moving:

- **Typed suggestions.** While the chat's field is empty, it types out its suggested questions one at a time, holds each, erases it and types the next, around and around. Typing and erasing are timed per letter (about 45 ms and 18 ms), the hold about 1.8 s. A drawn caret blinks only while the field has no focus; with focus the browser's own caret stands in. It stops at once on a typed letter, pauses while the tab is hidden or the field is out of view, is `aria-hidden`, and under `prefers-reduced-motion: reduce` does not run at all.
- **The work as steps.** While an answer is made, its real stages show as a short list (reading the question, looking through the places, checking flights from the home airport, writing the answer): done steps take a tick, the working step has one dot that pulses because it is live. Steps name real work, never a made-up delay.
- **Typing, then the words** (T583, owner 2026-10-22). While Carta makes an answer, a typing bubble shows (three dots pulsing in turn), `aria-hidden`, with "Carta is writing" for screen readers. It lasts the real wait, at least 750 ms, so a cached answer never snaps in; past 2.5 s the real steps replace it, never both. The answer then appears word by word (about 30 ms a word, always under 1.5 s), the words to come holding their place unseen so the bubble never grows. Under reduced motion, or in a chat reopened from the list, nothing waits and the text shows at once.
- **Arrivals.** The panel slides in once, a question and each part of its answer fade in, and suggestions arrive with a stagger of at most 120 ms.

One answer is at most three short sentences in a warm, plain voice, three places as compact rows with one "More places", and one question ("Got one in mind?") with the places and "Not yet" as quick replies. The trip card waits for the traveller's pick. No counts of matches, no "In short", no method line per answer: the one disclaimer under the field is the whole pedigree. Carta's turns and the traveller's are told apart.

These are the only loops outside the home page; a loop on any other surface is a defect. One primary per view: in a chat, only the newest answer's Plan this trip.

## First run

The start dialog on the first Explore visit (T585): see explore.md, Explore v6.
