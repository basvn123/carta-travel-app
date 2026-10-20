# T472: navigation, pass and price display, audited and written into the roadmap

## Task ID

T472

## Date

2026-10-20

## What changed

The owner brought three things: a mission statement to reuse wherever Carta explains itself, a paragraph on how travellers decide, and an external UX audit of carta-europetravel.com with eighteen pain points. The audit's points are the navigation, the pass, the fixed defaults, what the price includes, the price display, the planners, the phone, speed, offline and sharing.

The mission now sits in PRODUCT.md under "Mission": the owner's Dutch text, an English rendering and a short form. The decision paragraph is the first section of a new `user_knowledge.md` at the repo root.

The audit was checked against the code and against the live bundle of 20 October. The result is a new plan file, `Roadmap/1.15-navigatie-pass-prijsweergave.md` (Dutch, like the roadmap). It also added fourteen rows to `Roadmap/Carta roadmap.md`:
- phase 1: 1.15 to 1.18
- phase 2: 2.18 to 2.21
- phase 4: 4.18 to 4.21
- phase 5: 5.11 and 5.12

The audit points that T469 and T471 already plan (local transport and tickets, the card and receipt mismatch, the Google Maps link, the empty day) got no new row; the plan's table points to their rows.

To make the roadmap usable as the working plan, it now opens with three things:
- the mission
- a table of the four plan files and the rows each one owns
- a "Begin hier" section with this week's work and every open owner decision, each with the week it is needed by

Two other changes to the roadmap:
- **Phase 4 runs one week longer** (to W11, 21 March) because it now holds 21 rows. Phase 5 starts in W12; 5.1 and 5.2 move one week; the launch date is unchanged.
- **Row 1.1 and block 3 are marked done.** V1 to V6 have been live since 13 October.

PRODUCT.md got two corrections:
- The second "What Carta is" paragraph said the day figure includes local transport. It does not: `costIndex.js` sums stay and food.
- A paragraph now states plainly what is free and what is paid, since the audit assumed Carta is 100% free.

No app code changed.

The audit was partly out of date:
- **Removed on 17 October (T462):** the methodology blocks ("Three reasons to trust a figure", "What Carta covers, and where it is thin", "Catalogue of 7 Jun 2026"), the "nightsBed price" run-on and the doubled "est.". All of them lived in the old home page and the old receipt. The live bundle of 20 October no longer contains them.
- **Wrong about the navigation:** desktop shows six tabs plus two buttons, not seven items. The phone already groups the two planners under one plus button.

These points are real and still live:
- **The price copy contradicts itself.** `home.ch2` and the FAQ say local transport is included; the destination page says it is excluded.
- **"Get a pass" sits in the header at every width**, before the traveller has done anything.
- **The card price ignores the dates**, even though the settings bar exists.
- **New: four countries share one placeholder bed price.** Moldova, Romania, Kosovo and Albania all carry exactly €48 a night for a home for four at country level. That is why Brezovica, Mirusha and Valbona match to the cent across two countries.

## Files touched

**Modified:**
- PRODUCT.md (Mission section; day figure scope corrected; free and paid paragraph)
- Roadmap/Carta roadmap.md (header, plan table, Begin hier with decisions, phases 4 and 5 dates, rows 1.1, 1.3a, 1.15 to 1.18, 2.18 to 2.21, 4.18 to 4.21, 5.6, 5.11, 5.12, 5.1 and 5.2 weeks, block 3, week plan)
- Execution/_OPEN.md (rows T472-a to T472-j)

**Created:**
- Roadmap/1.15-navigatie-pass-prijsweergave.md
- user_knowledge.md
- Execution/P11/T472-nav-pass-price-roadmap.md

## Commands run

```
git switch -c p11-nav-price-ux
curl -sL https://carta-europetravel.com/ and each /assets/*.js, grepped for the old methodology strings and "Bed, food and local transport"
python -I (read continent-app/public/app_data.json: accommodation.level counts, entire_home_night_eur per country at country level)
```

## Config and secrets set

None.

## Before/after measurements

Not measured. This task plans; the rows it adds carry their own done conditions. For the record, the figures the plan relies on, read on 2026-10-20:

| Fact | Value |
|---|---|
| Destinations with a city-level bed price | 1,000 of 3,868 (25.9%) |
| Destinations with a country-level bed price | 2,868 |
| Countries at exactly €48 a night (country level) | Moldova, Romania, Kosovo, Albania |
| Old methodology strings in the live bundle | 0 |
| "Bed, food and local transport" in the live bundle | 1 (i18n chunk) |

## What broke and how it was fixed

No issues.

## What is still open

Seven owner decisions, each with a proposal in the plan's "Te beslissen" table and the week it is needed by in the roadmap's "Begin hier":
- **T472-a:** three places in the navigation, with Destinations folded into Explore.
- **T472-b:** the pass name.
- **T472-c:** saving a trip without an account.
- **T472-d:** whether sharing and co-editing become free. This changes what the pass gives, so it is needed before payments go live (5.6).
- **T472-e:** the buffer line.
- **T472-f:** 48 px primary actions. This is a token change in `styles.css` and DESIGN.md.
- **T472-g:** day bands above the clock.

Three items for the next task:
- **The live price copy contradiction**, roadmap 1.16: `home.ch2` at `en.js:36`, `account.fq.dayA` at `en.js:6912` and the other five languages.
- **The €48 placeholder in four countries**, roadmap 2.21. The source of the country bed figure should be traced in the pipeline before anything is changed.
- **`FirstRunReceipt`**, roadmap 1.16. It is no longer mounted but still carries `receipt.notIn`, `cost.stayNational` and the old seasonal `priceReceipt`. It should be removed, or made the one receipt.

## Rollback procedure

Revert the commit on branch `p11-nav-price-ux` (`git revert <sha>`), or delete the branch before it merges. No data, schema or deploy is involved.
