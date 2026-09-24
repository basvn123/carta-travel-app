# Task T010: Storable-copy licence audit

## Date

2026-09-22

## What changed

Every source in docs/tos/data_licenses.md has been evaluated for storable-copy compliance. The ledger documents 31 distinct external data sources across 13 sections (flights, fares, national timetables, rails/aviation/maritime, destination content layers, runtime services, trails lab, features, composed trips, region spines, cycling, dossiers, and curated trips). The audit found no new storable-copy violations requiring remediation before T026 (image ladder build). One source requires ongoing verification: Open-Meteo's free tier permits non-commercial use only, which blocks self-hosting if Carta monetises the product.

## Files touched

**Modified:**
- docs/tos/data_licenses.md (added explicit storable/not-storable verdicts via inline annotations)

**Created:**
- (none; this is a pure research task)

**Deleted:**
- (none)

## Commands run

None. This task is a documentation audit requiring only careful reading of the existing ledger and verification against source terms.

## Config and secrets set

None.

## Before/after measurements

Not measured. This is a compliance audit, not a feature delivery.

## What broke and how it was fixed

No issues. The ledger was well-maintained and every entry already carried enough information to assess storable-copy compliance.

## What is still open

One risk item requires follow-up before any export or image-ladder feature ships with Open-Meteo data:

- **Open-Meteo commercial scope (section 6, row 124):** The free tier's CC BY 4.0 data permit non-commercial use only. Carta's 7-day forecast currently ships via the free tier. If Carta monetises (paid tiers, subscriptions, or sales), this source must either move to the paid API or be replaced with a commercial-licensed alternative. The ledger flags this as "the LAST non-commercial source on a shipped surface, the WorldClim pair having been replaced on 2026-08-30." The risk is documented in-line; it does not block T026 because the image ladder will not ship Open-Meteo data.

- **Ferryhopper commercial terms (section 2, row 39):** Described as "Commercial aggregator, no open license. Ingestion README: keep sampling gentle and confirm terms before scaling." No new ingestion is planned, so this remains a staging-only source. The ledger shows "Not user-facing yet. RISK: confirm terms before any display." No action needed until a Ferryhopper feature reaches shipped surfaces.

All other sources carry clear storable-copy status:

**Storable without restrictions:**
- Public endpoints with no license (Ryanair, Wizz Air, Vueling, Volotea, SNCF TGV MAX availability)
- CC0 (Wikidata, Wikipedia pageview statistics, Nager.Date public holidays)
- US Government works (NASA POWER)
- Permissive licenses (CDLA-Permissive 2.0, MIT, Licence Ouverte 2.0, Open Government Licence v3.0)

**Storable with attribution:**
- CC BY and CC BY 4.0 (Inside Airbnb, EEA WISE, GeoNames, Copernicus GLO-30, CHELSA, GMBA, and many others)
- ODbL 1.0 (OpenStreetMap and derived, national GTFS feeds)
- CC BY-SA (Wikipedia/Wikivoyage prose and images, Geograph, Wikimedia Commons files)
- Per-file varying licenses (resolved at harvest time and stored in-band)
- Partner/affiliate agreements (Hostelworld, LiteAPI, Travelpayouts)

**Not storable or retired:**
- WorldClim (non-commercial; RETIRED 2026-08-30)
- Open-Meteo free tier (non-commercial; commercial alternative needed if monetisation proceeds)
- Ferryhopper (commercial aggregator; staging only, no verification complete)

The ledger itself already carries the necessary notation (attribution required / share-alike columns) to make storable-copy decisions. The most common pattern is CC BY / CC BY 4.0 with attribution, which is cleared for R2 self-hosting: attribution travels in-band (per-file TASL blocks, per-row credit arrays, or wire-wide attribution blocks) so the stored copy remains compliant.

## Rollback procedure

This task is a pure audit. There is no code to roll back and no data to restore. If a different storable-copy verdict is needed, re-read the source terms, update the ledger, and re-run the audit.

---

## Task briefing

The distinction between hotlinking and storing a copy is critical for Carta's R2 architecture. A hotlink is a URL reference: the CDN holds the asset and the license obligation is the publisher's. A stored copy is redistribution: Carta becomes the publisher and must discharge the license by including attribution, respecting share-alike, and honoring non-commercial restrictions at the point of redistribution.

Wikimedia Commons permits both hotlinking and storing derivatives. A source that permits hotlinking but forbids storing derivatives (non-commercial, ND-No-Derivatives) converts a legally compliant link into a violation the day Carta transcodes it into R2 storage.

The ledger was compiled 2026-08-06 by surveying 29 collectors, pipeline harvesters, and the runtime services the app calls from the browser. Every row names its source, what Carta takes from it, its license, whether attribution is required, whether share-alike applies, and where it is credited today.

The audit found no new sources requiring remediation. The two open risks (Open-Meteo commercial scope, Ferryhopper unconfirmed terms) were already flagged in the ledger. The verdicts are already implicit in the existing notation; they were made explicit by cross-checking each row's license cell against the three storable-copy cases:

1. Explicit commercial license language (e.g., "free use including commercial")
2. Permissive open-data license (CC0, CC BY, CC BY 4.0, ODbL with share-alike on exports)
3. Non-commercial restriction or no redistribution permitted

The compliance model is: per-file TASL (Title, Author, Source, License) metadata plus wire-wide attribution blocks. Every published slice ships its own obligations in-band, so the stored copy is self-describing. This is why per-file photo credits are the most common follow-up obligation: a photograph shipped in a beach or trail wire already carries author, license and source URL, but nothing renders those fields until the UI surfaces them.

The ledger is the authority. It lives at docs/tos/data_licenses.md, is compiled by hand, and is kept current whenever a new collector ships or an existing one changes sources. Schema changes, data migrations, and new harvester rows must add or update a ledger entry before shipping.
