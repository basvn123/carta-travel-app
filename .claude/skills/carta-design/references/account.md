# Account rules (reference)

> Look rules for these screens are rewritten by the account lane of the house style run (2026-11). Until then the look comes from `DESIGN.md` and the carta-design `SKILL.md`; the rules below are the product rules these screens keep (what they show, what each control does, how numbers behave). They bind.

Covers My trips, Account, Together, sign in, the pass and pricing, the paywall, the Ask Carta chat, settings, the first run, and empty and error states.

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
