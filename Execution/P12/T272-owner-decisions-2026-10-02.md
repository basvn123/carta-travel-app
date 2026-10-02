# T272: Owner decisions of 2026-10-02

**Task ID:** T272
**Date:** 2026-10-02
**Branch:** p12-owner-decisions (root and continent-app)

## What changed

The owner answered the open decisions the three overnight waves raised. This task records them, closes their register rows, and makes the two small product changes they called for.

Flights. Carta does not price flights. A traveller who has a fare types in what they paid, and only then does a full-trip total include a flight, as their own figure. PRODUCT.md now says this in "What Carta is" and in "The one rule the numbers follow", and its voice example no longer quotes a flight-priced count. The FAQ question "Does Carta price flights?" is removed from the account panel and from all six locales; the FAQ has 13 questions and verify_account_panel.mjs expects 13. This closes T201-a and T201-c (PRODUCT.md and the FAQ no longer contradict each other).

The surfaces that still show the frozen fare snapshots as estimates (Explore, the planner flight rows, the Destinations city-day card; T256 put the tilde and "est." on them) contradict the decision. Removing them is a real UI task, not a copy change, so it is raised as T272-a instead of being rushed here.

Routing. Own track on Carta's own MapLibre map, as T177 recommended. Closes T177-a; T177-b (build the track wire and the JourneyPage map) is now unblocked.

Mobile. Both: the web app stays the product, and store apps follow. This overrules T246's recommendation to stay web-only, so T247 (App Store) and T248 (Play Store) are no longer gated on T246. T246's own order applies when they start: Android first as a TWA on a business Play account, iOS after, with in-app purchase at the small-business 15% rate. Their prerequisites are owner steps (T272-b). Closes T246-a.

Prerendered pages. Served from R2 behind one Pages Function, as T205 proposed, so the Pages bundle stays under the 20,000-file ceiling. Closes T205-a; T221 can follow it.

"Most popular" badge. Fixed: the featured pass tier now reads "Recommended" (Empfohlen, Recomendado, Recommandé, Consigliato, Aanbevolen). "Most popular" claimed a purchase history that does not exist; checkout has never been live. Closes T197-c.

Designs. The owner delegated both to the orchestrator. The first-run trip result in docs/FIRST_RUN_RESULT.md is approved as written, so T099 builds to it (closes T187-a; T187-b, the five-person test, stays with the owner). The month strip from T087 is approved as built: it uses DESIGN.md tokens only (--green on a tint of itself over --bg-card for good months, --ink-mute with a 1px strike for avoid months) and adds no colour, so it stays within the shipped system; a rule for it belongs in DESIGN.md when the P7 layer pages adopt it (T087-b). Closes T087-c.

## Files touched

PRODUCT.md, Execution/_OPEN.md, this report. In continent-app: src/auth/AccountPanel.jsx, src/components/PassModal.jsx, the six src/i18n files, scripts/verify_account_panel.mjs.

## Commands run

npm run lint (0 errors), npm test (100 of 100), verify_account_panel.mjs against a Vite dev server on 5213 (OK, 13 FAQ entries), verify_plan_tiers.mjs (OK).

## Measurements

FAQ entries 14 to 13. Locale keys removed: account.faq2Q and account.faq2A in six files. pass.mostPopular renamed to pass.recommended in six files. No other number moves.

## What broke

Nothing. sed rewrote two CRLF files as LF on the first pass; they were converted back before the commit so the diff carries only the two changed lines.

## What is still open

T272-a: remove the frozen fare estimates from every surface (Explore cards and map pins, the planner flight rows, the Destinations city-day card, the receipt) and keep a flight in a total only when the traveller entered it. This touches the cost engine and several screens, and T058's flight-cost contract in docs/SCHEMA.md changes with it.

T272-b (owner): the store accounts the mobile decision needs: an Apple Developer Program membership (EUR 99 a year), a Google Play developer account (a business account avoids the 12-tester closed test; it needs the entity from T014), and a way to build iOS from Windows (a Mac or a hosted macOS builder).

## Rollback

git revert the T272 commit in each repo. The FAQ question and the "Most popular" label come back exactly as they were; the register rows reopen by reverting the register edit.
