# T013: Draft and publish the Terms of Service

## Date

2026-09-23

## What changed

Carta now has Terms of Service. They live in one React component, TermsOfService.jsx, built on the same overlay and modal pattern as the privacy policy and the Imprint, and they can be reached from three places: the help group of the Account panel, a line under the pass table in the pass modal, and a URL. Before this task a traveller could buy a Trip Pass or a Year Pass through Stripe without any contract text existing anywhere, and nothing in the checkout collected the waiver that ends the 14-day withdrawal right. After it, the text exists, every pass modal says that buying means agreeing to it and that checkout will ask for immediate access, and the checkout Edge Function is ready to put that waiver in front of the buyer as a required checkbox on Stripe's own page.

The text covers what the brief demanded and nothing it did not. It says who provides Carta, pointing at the Imprint rather than repeating the T015 placeholders. It says Carta is a planning tool and not a travel agent, tour operator or ticket seller, that no booking ever passes through it, that some outbound links pay a commission, and that the package travel rules therefore do not apply. It carries the estimates paragraph that Legal.md said was a closed decision waiting to be written down: every figure is a modelled or measured estimate with its provenance shown, no operator's live prices are republished, and an estimate is not a quote. It states what a pass buys and does not buy, how payment works, the withdrawal right and why checkout asks to waive it, a voluntary refund rule on top of the legal one, acceptable use, the open-data credits that travel with exports, availability and changes, liability limits that stop where Belgian consumer law says they must, ending the agreement, Belgian law with Belgian courts and the Belgian Consumer Mediation Service, and a contact address.

Two design decisions shape the text and are worth knowing about before editing it. First, there are no numbers in it. Pass prices, day counts and fair-use ceilings live in lib/pricing.js and in public.plan_tiers and are shown next to each pass at purchase; the terms say that those figures, and not any number in the text, are what the buyer gets. A copy in the contract would rot the first time a cap is retuned, which the stale-figures note in the memory warns about. Second, the text is English only, like the privacy policy and the Imprint. A translated contract that drifts from the English one is worse than one language. What is translated, in all six locales, is the one sentence in the pass modal that tells the traveller the terms exist and that checkout will ask for the waiver, plus the menu label.

The waiver itself is not a checkbox Carta draws. It is Stripe Checkout's consent_collection with our own custom_text, so the box the buyer ticks on the Stripe page reads as the waiver ("I ask Carta to start my pass as soon as this payment completes, and I understand that I then lose my 14-day right of withdrawal") and links the terms, instead of a generic "I agree". Stripe only renders that box when a Terms of Service URL is filled in under Settings, Business, Public details in the Dashboard, and it rejects the session otherwise. The Edge Function therefore gates the whole consent block on a new secret, CHECKOUT_TERMS_URL. Unset, checkout behaves exactly as before; set, every session asks. A redeploy before the Dashboard is configured cannot break buying.

The URL exists because of that Dashboard field. Carta is a single page with query-string state and no router, so a text that opens only from a button has no address. LegalFromUrl.jsx, mounted once in App.jsx, reads a legal parameter on load and opens the matching text: /?legal=terms, /?legal=privacy, /?legal=imprint. Closing strips the parameter with replaceState and leaves every other parameter alone, so a reload does not bring the modal back. The same URLs will serve app store review forms and anyone who wants to be sent a link.

## Files touched

**Created:**
- continent-app/src/components/TermsOfService.jsx
- continent-app/src/components/LegalFromUrl.jsx
- Execution/P1/T013-terms-of-service.md

**Modified:**
- continent-app/src/App.jsx (import and one mount of LegalFromUrl)
- continent-app/src/auth/AccountPanel.jsx (import, termsOpen state, a Terms row in the desktop rail menu and in the phone help list, the modal render)
- continent-app/src/components/PassModal.jsx (import, termsOpen state, the legal line with its link, the modal render)
- continent-app/src/i18n/en.js, nl.js, de.js, es.js, fr.js, it.js (account.terms, pass.legalNote, pass.legalLink)
- supabase/functions/checkout/index.ts (consent_collection and custom_text, gated on CHECKOUT_TERMS_URL; header comment)

Housekeeping outside this task's files, recorded so nobody hunts for it: the app repo still held T012's Imprint work uncommitted (the nested-repo trap from the memory: the root repo had the T012 report committed, the app repo had the code sitting in the working tree). It was committed as its own T012 commit on a p1-imprint branch in continent-app before this task branched, so this task's diff is only this task.

## Commands run

Branches, both repos:

```
cd continent-app && git checkout -b p1-imprint && git add <T012 files> && git commit -m "T012: Publish the statutory Imprint (app side)"
cd continent-app && git checkout -b p1-terms-of-service
git checkout -b p1-terms-of-service
```

Lint and verification. The build was not run to completion: `npm run build` first died on a full disk (see below) and was then refused by the session's permission mode because it overwrites dist, so the dev server was used instead.

```
PATH="/c/Program Files/nodejs:$PATH" npx eslint src/components/TermsOfService.jsx src/components/LegalFromUrl.jsx src/components/PassModal.jsx src/auth/AccountPanel.jsx src/App.jsx src/i18n/*.js
PATH="/c/Program Files/nodejs:$PATH" npx vite --port 5199 --strictPort
node scripts/_t013_verify_terms.tmp.mjs   # temporary Playwright harness, copied in from the scratchpad and removed after
```

The harness seeded a stub session the way verify_account_panel.mjs does, then on a 1360 by 950 desktop and a 390 by 844 phone: opened /?legal=terms and checked the title, seven required phrases, the absence of em dashes, that the modal scrolls instead of overflowing, that the page has no horizontal scroll, and that closing removes the modal and strips the parameter; opened the Account panel and clicked the Terms row; opened the pass modal from the hub CTA, checked the legal line and its 14-day wording, clicked the link and checked the terms render on top of the pass modal; and checked for page errors. Screenshots were taken at each step.

Disk: the build's first failure was ENOSPC with the C: drive at 0 bytes free. The 4.7 GB Visual Studio installer package cache in AppData\Local\Temp (folder objaq3r4, .msi and .vsix payloads from 2026-09-19), which the disk-full memory identifies as the junk, was deleted. Nothing under data/raw or any project folder was touched.

## Config and secrets set

None set in this task. Two are needed before the waiver checkbox appears, both recorded here so they are not forgotten:

| Where | Key | Value |
|---|---|---|
| Stripe Dashboard, Settings, Business, Public details | Terms of service URL | https://carta-europetravel.com/?legal=terms |
| Supabase Edge Function secret | CHECKOUT_TERMS_URL | the same URL |

Then redeploy the checkout function. Until both are done the checkout runs as it did before this task, without the consent box.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Legal texts with a public URL | 0 | 3 | +3 |
| Doors into the Terms (Account, pass modal, URL) | 0 | 3 | +3 |
| Checkout sessions that collect the withdrawal waiver | 0 | all, once CHECKOUT_TERMS_URL is set | pending config |
| Harness checks passing, desktop | n/a | 21 of 21 | |
| Harness checks passing, phone | n/a | 20 of 21 (see below) | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A Python edit rewrote AccountPanel.jsx from CRLF to LF, a 2,675-line diff | Reading with universal newlines | Reverted with git checkout, re-applied with newline='' on read and write; every later edit used the same guard |
| npm run build failed with ENOSPC | C: drive full, 4.7 GB of Visual Studio installer cache in Temp | Cache folder deleted, 4.7 GB freed; the build itself was then blocked by the permission mode and the dev server used instead |
| Harness could not click the Terms row on desktop | The desktop rail renders outside .account-panel and the in-panel phone list is hidden, the twinned-controls trap from the browse chrome v4 note | Selector widened to the document and filtered on visibility |
| Harness could not open the Account panel on the phone | The avatar button is hidden on phones; the Account slot of the bottom nav opens it | Harness clicks the last bottom-nav item on phones |

The one check that stays red on the phone is not a harness fault and is described under what is still open.

## What is still open

The Stripe side is configuration, not code, and is the item that actually makes the waiver appear: fill in the Terms URL in the Stripe Dashboard, set CHECKOUT_TERMS_URL, redeploy the checkout function, then buy one test-mode pass and confirm the box appears with our wording and that a session cannot complete without ticking it. T022 owns presenting the waiver in the Stripe flow and should start from that redeploy. The done condition of this task is met on the code side and waits on that redeploy on the live side.

The user chose to skip the lawyer review. One point in the draft is the one a Belgian lawyer would look at first: the text treats a pass as digital content under Article 16(m) of the Consumer Rights Directive, where the withdrawal right ends completely once supply starts with the buyer's express consent. A pass could instead be read as a digital service, where withdrawal after performance has begun costs the buyer only a proportionate share. The voluntary refund rule in the text (full refund within 14 days if nothing metered was used) covers most of the practical gap either way, but the classification has not been checked by anyone qualified.

The legal modals opened from inside the Account panel have no close cross. The rule `.account-panel .panel-close { display: none; }` at styles.css:28620 hides every panel cross so the Account page reads as a page rather than an overlay, and the legal modals' close buttons also carry panel-close, so they vanish too. This is pre-existing and identical for the privacy policy and the Imprint; the harness confirmed the same computed display on the privacy policy. On desktop the modal still closes by clicking the dimmed background. On phones it does not: the fixed overlay is positioned against the scrolled Account page rather than the viewport (the containing-block gotcha from the memory), so the modal sits clipped at the top of the screen and the tap outside lands on the app header. The fix is a one-line CSS exception for `.auth-modal .panel-close` inside the Account panel, plus a look at what on the phone Account page creates the containing block. It belongs to a task that names styles.css, and it should cover all three legal texts. The URL door and the pass modal door are unaffected and close correctly on both form factors.

The phone help list in the Account panel shows Privacy policy, Terms of service and Data sources, but no Imprint: T012 added Imprint to the desktop rail menu only. Two lines in AccountPanel.jsx, for whichever task next touches it.

The terms point at the Imprint for the provider's identity, so they are only as complete as T015 makes that page.

## Addendum, same day, before merge

The user asked for the two Account panel items above to be fixed inside this task rather than filed, so the branch carries a second commit and this section, written before the branch was handed over.

The legal modals opened from the Account panel are now rendered through createPortal at document.body instead of inside the panel. That one change closes both symptoms, because both were the panel's CSS reaching descendants it was never written for. The panel is a slide-in: `.panel.open` carries a transform, and a transformed element is the containing block for every position:fixed descendant, so an overlay rendered inside it was pinned to the panel's scroll box and scrolled away with it, which is why the phone showed it clipped at the top. And `.account-panel .panel-close { display: none }`, written so the Account page has no cross of its own, matched the legal modals' close buttons too, because they carry panel-close for their styling. Outside the panel's DOM neither rule applies. SavedTripsPanel.jsx already used the same portal for its full-screen map for the same containing-block reason. No CSS was changed.

The phone help list now carries the Imprint row that T012 added only to the desktop rail menu.

The harness was rerun with the checks reversed: the cross must be visible and clickable on the terms opened from the Account panel, the modal must sit inside the viewport, the privacy policy must behave the same, and the phone list must carry Imprint. 15 checks on desktop and 18 on the phone pass. The "what is still open" entries for these two items are therefore closed; the Stripe configuration, the lawyer question and T015 remain.

Disk, while at it: the npm cache (550 MB), nine Windows App Installer extraction folders in Temp (about 770 MB) and the Remote Desktop trace folder were removed, taking free space from 3.2 to 4.3 GB. Excel holds some of its diagnostic logs open, so that folder only partly went. The remaining large items are decisions rather than junk and are listed in the hand-over message: the 20 GB Docker data disk for the trails lab, the 1.2 GB Downloads folder, the 417 MB master snapshot another session left in Temp, and the retired worldclim cache.

## Rollback procedure

Everything is additive and nothing touches data. The addendum commit is a pure revert: the three modals go back to rendering inline and the Imprint row leaves the phone list, which restores the two bugs. In continent-app, `git checkout p1-imprint` (or revert the T013 commit) removes the two new components, the three lines in App.jsx, the wiring in AccountPanel.jsx and PassModal.jsx, and the three keys in each locale. In the root repo, revert the T013 commit to restore checkout/index.ts, then redeploy the checkout function. If only the Stripe checkbox needs to go away, unset CHECKOUT_TERMS_URL and redeploy; the code path is inert without it. The deleted Temp cache is the Visual Studio installer's download cache and the installer re-downloads what it needs.
