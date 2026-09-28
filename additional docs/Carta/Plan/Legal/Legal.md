## **The headline correction**

Your mind map is more pessimistic than your codebase. Several of these are already done. And one item on your list is built on a factual error that would cost you real work if you acted on it.

**The Ryanair item is the error.** You wrote "keep harvesting quietly, switch to an affiliate feed, or model fares so you're publishing estimates." Look at data\_licenses.md and your own roadmap: you already made that decision. The roadmap says *"you publish modelled and measured estimates with provenance, and you do not republish any operator's live prices. That sentence is now simply true."* The estimation layer, the fare-provenance UI and the calibration work landed months ago. This is not an open decision constraining your monetization branch. It is a closed decision that needs a paragraph in the Terms of Service describing it. Downgrade from "NEW, decide now" to "write one paragraph."

One nuance worth keeping: *Ryanair v. PR Aviation* (CJEU C-30/14, 2015\) actually went **against** the database-right argument. The Court held that where a database is not protected by copyright or *sui generis* database right, the owner may restrict use by contract. So the exposure is contractual ToS, not IP. You never accept their ToS (no login, no clickwrap), which is the weakest possible form of that claim, and you publish derived estimates rather than their prices. You are in a defensible position. Keep the polite rate limits and keep the "estimate, not a quote" framing visible on every fare surface.

---

## **Required Documents**

**Privacy Policy — DONE.** PrivacyPolicy.jsx is genuinely good. It names Supabase, Gemini, OSRM, Nominatim, the 24-hour cache, the excluded PII fields. That specificity is what regulators want and most apps never write. Two gaps: it has no *lawful basis* table, and it does not name a retention period for the analytics events your admin panel reads.

**Terms of Service — MISSING, and this is your real blocker.** You have live Stripe checkout in checkout.js and a paid-tier system. Selling access in the EU without terms is the item that actually bites. Must cover: what a pass buys, the 14-day withdrawal right under the Consumer Rights Directive and the waiver for immediate digital access, refunds, the estimates disclaimer, that you are not a travel agent and do not sell travel, liability limits, and governing law (Belgian).

**Cookie Policy — NOT YET NEEDED.** No analytics libraries in the codebase. Supabase auth and Stripe set strictly-necessary cookies, which are exempt from consent under ePrivacy Art 5(3). You genuinely do not need a banner today. The moment you add Plausible or Sentry, you do. Your roadmap already says this.

**Imprint — MISSING, mandatory, cheapest thing here.** EU e-Commerce Directive Art 5 plus Belgian Code of Economic Law. Needs: legal name, geographic address, email, VAT number if registered, and the trade register number. An address is required, which for a sole trader means a real one. If you do not want your home address public, this is the argument for registering the business properly before launch.

---

## **App Store Requirements**

**Not live work.** No Capacitor, no React Native, no Expo in package.json. This is a PWA. Everything in this branch is theory until you decide to wrap it.

That said, your code already anticipates it: AuthContext.jsx:183 cites guideline 5.1.1(v) for deletion and the privacy policy cites 5.1.1(i). So if you do wrap it, account deletion and in-app policy access are already satisfied. The remaining work would be Privacy Nutrition Labels and an age rating, both forms, both an afternoon.

**Decide the mobile strategy first.** Your roadmap flags this as the gate. Do not do store work before that decision.

---

## **Play Store Requirements**

Same gate. One thing worth knowing now because it changes your timeline: the **closed testing requirement** (12 testers, 14 continuous days) applies to personal developer accounts created after November 2023\. That is a two-week minimum on the calendar before you can even apply for production. If Android is in the plan, this is the long pole. Registering as a business account avoids it.

---

## **Licensing**

**Mostly done, with a real tail.** data\_licenses.md is a per-source ledger with a documented rule that new collectors must add a row, and attribution.js is derived from it and rendered in the Account panel. This is better than most funded startups manage.

Your mind map's licence list is also slightly off. Inside Airbnb, Eurostat and GeoNames are credited. WorldClim is retired (replaced by NASA POWER). Overture is credited. So the "one /attributions page listing all of them" already exists, it is just inside Account rather than at a public URL.

**"Close 11 missing licence credits" is stale.** The follow-up list shows items 2, 6, 7 and 8 resolved. What is genuinely still open:

* Belgian operators (SNCB, De Lijn, STIB, TEC): verify per-operator terms, then add rows  
* Hostelworld and LiteAPI: blocked on partner agreements, and the stay tiers ship on fixtures until then, so nothing is being displayed uncredited  
* Per-file Wikimedia credit on POI thumbnails: the TASL data ships, nothing renders it. This is the sharpest open one because CC BY-SA on a displayed photo owes its own author line.  
* Commercial-scope risks: Ferryhopper, OpenSky, Numbeo, and the GFDL/GPL photos

**ODbL share-alike is the one to take seriously.** Section 12 exists as a produced-work vs database-extract table, which is the right analysis. The GPX export in CyclePage.jsx:47 already reasons about it correctly. Worth one focused re-read before launch.

---

## **Copyright**

**Trademark check is sensible, registration is optional.** A EUIPO search for "Carta" in class 39 and 42 costs nothing and takes ten minutes. Expect hits: *carta* means "map/paper/card" in several European languages, which makes it descriptive and hard to register, and also means someone else's mark is less likely to be enforceable against you. The risk you are checking for is an identical mark in travel services. Registration is €850 and not launch-blocking.

**Map tile attribution — check it renders.** CARTO and OSM are in attribution.js, but basemap credit conventionally belongs *on the map*, not only in a settings panel. Worth confirming the MapLibre attribution control is visible and not styled away.

---

## **Data Acquisition Risk**

Covered above. Reframe as: write the estimates paragraph into the ToS, keep the rate limits, keep provenance visible. Not a strategic decision.

---

## **GDPR**

**Erasure — DONE.** Full flow in AccountPanel.jsx:553, reauth-gated, backed by migration 005\.

**Export — MISSING.** Art 20 portability. Half the work is banked: same auth gate, same tables, JSON instead of DELETE. Small job.

**Lawful basis — MISSING, and it is a writing task not a build task.** Contract for accounts and saved trips, legitimate interest for the admin analytics, consent for location. Write it into the policy.

**DPAs — needs checking, not building.** Supabase, Vercel, Stripe and Google (Gemini) all publish standard DPAs that you accept by using the service. Confirm each and keep a note of where. Gemini is the one to read properly: check whether your tier trains on your inputs, and whether data leaves the EU. Your privacy policy already tells users not to upload sensitive documents, which is honest, but the DPA question is separate.

**Records of processing (Art 30\) — probably exempt, worth one page anyway.** Under 250 employees exempts you unless processing is regular, which yours is. One page, cheap insurance.

**DPO — correct, not needed.** You are right.

**Consent banner — not yet.** See Cookie Policy above.

---

## **The to-do list, ordered by what actually blocks launch**

| \# | Item | Status | Effort |
| ----- | ----- | ----- | ----- |
| 1 | Imprint page | Missing, legally mandatory | 1 hour |
| 2 | Terms of Service | Missing, blocks live payments | Half a day |
| 3 | Lawful-basis \+ retention into privacy policy | Missing | 1 hour |
| 4 | GDPR export | Missing, erasure done | Half a day |
| 5 | Per-file Commons credit on POI thumbnails | Data ships, nothing renders | Half a day |
| 6 | Confirm DPAs, especially Gemini | Unverified | 1 hour |
| 7 | Verify map attribution control is visible | Unverified | 15 min |
| 8 | Belgian operator terms | Open ledger rows | 1 hour |
| 9 | EUIPO search | Not done | 15 min |
| 10 | Article 30 record | Probably exempt | 1 hour |
| 11 | Ryanair decision | **Already made** | Fold into \#2 |
| 12 | Cookie banner | **Not needed yet** | Defer |
| 13 | Store requirements | **Blocked on mobile decision** | Defer |
| 14 | Privacy policy, account deletion | **Done** | — |

Roughly two days of work stands between you and being legally launchable, and almost none of it is the store or scraping work your map treats as the big items.

One caveat: I am not a lawyer and this is not legal advice. Items 1 and 2 are the ones where a Belgian lawyer reviewing your draft for an hour is worth the money, because they are the ones with personal exposure attached.

Want me to draft the Imprint and Terms of Service components to match the existing PrivacyPolicy.jsx pattern?

&nbsp;