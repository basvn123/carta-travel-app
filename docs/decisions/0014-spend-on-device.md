---
status: accepted
date: 2026-11-22
decided-by: the owner, with Claude
run: .work/2026-11-21-spend-capture/
---

# 0014 · Uitgaven: one page, a Reiskas split, and capture on the device without AI

## Context
Travellers logged spend in a small form on Today. It held euros only, had no split between friends, and the road spend never reached the cost chart or the year card. The owner wanted a Tricount-like split between friends ("Reiskas"), adding by speech or a receipt photo, "as simple as possible", and the trip page kept short.

## Options considered
1. **A. Keypad-first:** a compact door, a page with Vandaag and Reiskas, and an amount-first add sheet.
2. **B. Capture-first:** speech and photos lead; every input becomes a draft card you confirm.
3. **C. Reiskas-first:** a full-screen group kas with the balances first, Tricount-like.

A first draft read receipts with Gemini (a new `parse-spend` Edge Function).

## Decision
We chose **B as the base, in A's structure**:
- the trip page shows one quiet "Uitgaven" row;
- the page has two tabs, Vandaag and Reiskas, and one fixed add bar (mic, "+ Uitgave", camera).

Owner reviews then set these rules:
- **No AI in this flow.** The browser's speech recognition plus a local parser in six languages. Receipts are read on the device by Tesseract.js, which loads only when the camera opens. Nothing leaves the phone. This is a deliberate exception to "runtime AI is Gemini" (0005): there is no AI at all here.
- **Always "Klopt dit?"** before a spend is saved, whatever the source.
- **The money model:**
  - integer cents, with splits keyed by person id;
  - the odd cent goes to the payer;
  - `mineCents` mirrors your share into the personal ledger, so nothing counts twice;
  - "Alleen ik" never enters the kas;
  - old rows read as an equal split over the whole party.
- **Por instead of a QR:** a message with your pay link via WhatsApp, Bericht or Kopieer, a 48 h cooldown and one reminder.
- **The look:**
  - dark brown, never the light brown;
  - rows: name and your share, then the payer dot and the sharers;
  - Iedereen: a green plus and a red minus (`--owe`), a balance bar, and the winks "hou je geld maar bij!" and "betaalt de volgende!".

## Consequences
- **Good:**
  - logging takes 3 taps plus the digits;
  - speech and receipts work offline and privately;
  - road spend now feeds Your Europe and the year card.
- **Bad or costs:**
  - phase 1 is a local kas on one phone. Friends join by link in phase 2, which needs migration 077, an owner step;
  - "Betaal" waits for phase 2, because a local kas holds no payee link;
  - receipt reading needs the OCR model on R2 (an owner step). Until then a scan keeps the photo and asks for the amount;
  - the OCR reads English only, so accents are lost. Multi-language OCR is a G15 phase 2 note.

## How we'll know it works
- Travellers on a group trip log several spends a day, and the Reiskas ends at "Alles is rond".
