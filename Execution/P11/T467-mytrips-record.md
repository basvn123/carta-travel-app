# T467: My trips, the Visited figures

## Task ID

T467

## Date

2026-10-17

## What changed

The owner found the figures band on My trips' Visited tab ("Countries, Cities, Trips, Nights away") not optimised and not how they want it. It was four equal cells with a label over a number. At 360 px the four cells were about 80 px each, and the longest labels (German "Nächte unterwegs", French "Nuits en voyage") had no room.

Market research (the T464 research agent) looked at how travel-stats apps show a traveller's own figures:

- **Been** leads with a hero pair: "20 Countries" beside a ring with "10% World".
- **Visited** shows goal rings.
- **Polarsteps** puts story stats beside the counts.

All three lead with one figure rather than a row of equal ones, and they make the countries visible as flags or on a map.

The band now leads with the countries as its hero: the figure at headline size, then up to eight of their flags, with "+n" for the rest. Cities, trips and nights away follow as the supporting three.

- **Desktop:** the hero takes two parts of four on one line.
- **Phone:** the hero takes the whole first row and the three figures share the second, so no label is squeezed.

The band has no denominator ("12 of 44"). A share of Carta's catalogue would be a catalogue count, which carta-design keeps off the page. A share of "Europe" depends on whose list of countries it is. The figures are computed exactly as before (`visitedRecord()` in src/lib/myTrips.js is untouched), and the year filter still narrows them.

## Files touched

**Modified (app repo):**
- src/auth/mytrips/MyTripsTabs.jsx (the band)
- src/styles/70-mytrips.css (the band on desktop and phone)
- scripts/verify_saved.mjs (the countries figure is read as a number, since its cell now also draws flags)

**Created (root repo):**
- Execution/P11/T467-mytrips-record.md
- Execution/P11/T467-shots/

## Commands run

```
cd continent-app
CARTA_PORT=5210 node scripts/verify_saved.mjs
node scripts/ci/design-lint.mjs
npm test
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Width of a figures cell at 390 (phone) | about 88 px, four across | hero full width; three cells about 118 px | +30 px a cell |
| Countries figure size | 16 px (text-lead) on a phone | 28 px (text-headline) | +12 px |
| Countries shown as flags in the band | 0 | up to 8, then "+n" | |
| verify_saved | all pass | all pass | 0 |
| Design lint, new violations | 0 | 0 | 0 |

## What broke and how it was fixed

No issues.

## What is still open

T467-a: the owner sees the band on a real phone and confirms the hero-and-three form.

T467-b: the "Countries" section right under the band repeats the flags with names. Now that the band shows the flags, the section could fold into it, with the Edit control on the band. That is a further step for the owner to decide, not taken here.

## Rollback procedure

In the app repo: `git revert -m 1 <merge of p11-mytrips-record>`. In the root repo, revert the report commit.
