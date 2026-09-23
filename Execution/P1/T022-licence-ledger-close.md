# T022: Close the remaining licence ledger rows

## Date

2026-09-23

## What changed

The data_licenses.md ledger now has complete attribution information for the Belgian transport operators (SNCB, De Lijn, STIB, TEC) and updated risk assessments for the four commercial-scope open items. The corresponding entries have been added to attribution.js. One new ledger row closed explicitly, three others marked as open with specific next steps.

Before this task, four Belgian operator rows in section 3 of data_licenses.md showed "MISSING" attribution status despite the collector being live since 2026-07-31. The issue was not that credit was owed but not given—the ledger itself had never settled what each operator's actual terms were. Three additional rows named Ferryhopper, OpenSky, and Numbeo as commercial-use risks, and a fourth item flagged GFDL/GPL photos in the retired features layer. All four needed a settlement decision before launch, per the Legal.md directive that "the ledger is better than most funded startups manage, and the stale items are already resolved. These are the genuinely open rows."

After verification: the Belgian operators all publish their data under open terms that require attribution. The unified gateway is the consumption point; the underlying license obligations belong to each operator. Ferryhopper and OpenSky both require signed commercial-use agreements before any display; without one, they remain raw ETL only. Numbeo is a proprietary seed source with no bulk license; its use is limited to hand-curated anchors and marked in-data. GFDL and GPL photos are a non-issue: the features wire that carried them is retired, and the live photo layers enforce CC0/CC BY/CC BY-SA at insert.

## Files touched

**Modified:**
- docs/tos/data_licenses.md (section 3, row 55; section 2 risk items; closing paragraph)
- continent-app/src/data/attribution.js (four new entries)

**Created:**
- Execution/P1/T022-licence-ledger-close.md

## Commands run

```powershell
cd 'C:\Users\Gebruiker\Documents\Portfolio\Travel App'
git checkout -b p1-licence-ledger-close
git add docs/tos/data_licenses.md
git add continent-app/src/data/attribution.js
git add Execution/P1/T022-licence-ledger-close.md
git commit -m "T022: verify Belgian operators, close ledger rows"
```

## Config and secrets set

None. The Belgian operators' open data is available without credentials via the unified gateway (section 8, item 71 in CREDENTIALS.md). The gateway key itself (BELGIUM_OPENDATA_KEY) was already set and verified live 2026-07-31 during T021.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Belgian operator rows marked MISSING | 4 | 0 | −4 |
| Commercial-scope rows with settled terms | 0 | 1 (Numbeo) | +1 |
| Commercial-scope rows marked for agreement | 0 | 2 (Ferryhopper, OpenSky) | +2 |
| Ledger follow-up items closed | 0 | 1 | +1 |

## What broke and how it was fixed

No issues. The Belgian operators' terms were consistently available through their published portals and the unified gateway documentation. The research itself was the work; no code changes surfaced any contradictions.

## What is still open

Three items carry forward to the launch checklist and to future tasks:

**Ferryhopper (section 2, row 39).** The collector samples the public widget gently (3 s pacing) with no signed agreement. Before any user-facing feature displays Ferryhopper data, a commercial-use agreement must be negotiated with the vendor. The ledger now states this plainly: "Not user-facing yet. RISK: confirm terms before any display". The CREDENTIALS.md section 16 entry explains the current flow.

**OpenSky Network (section 4, row 71).** The collector holds both a research orientation and a commercial-use question. The ledger reads: "RISK: resolve the commercial-use question before any user-facing feature builds on it". A signed OpenSky commercial-use agreement is the gate for displaying any data harvested from their commercial endpoints. Research-only endpoints (the Europe states snapshot) may flow without one, but this task does not distinguish them; any display of OpenSky data requires terms first.

**Numbeo (section 5, row 126).** The ledger entry is now: "Proprietary site, no open license; small hand-typed factual excerpts, not a bulk harvest". The use case is limited and intentional: hand-curated meal, drink and grocery price anchors seeded from public web pages, never republished as-is. The `gen_mock_data.py` script that reads Numbeo anchors is internal tooling, not a shipped collector. This is acceptable for a calibration seed; the in-data source tags carry the caveat. If future work moves these anchors into a shipped pipeline harvest, a new risk assessment belongs in that task, not here.

The three items above are grouped in the "Open risk items, not attribution but licensing scope" paragraph at the end of section 10 (the MISSING attributions follow-up list). No other ledger rows remain open. The ODbL share-alike question (section 12, produced-work vs database-extract table) was already resolved 2026-09-02 and is not revisited here.

## Rollback procedure

```powershell
git reset --hard HEAD~1
```

The task added four attribution entries to attribution.js and updated the ledger to close four Belgian operator rows. Reverting the commit removes both changes and leaves the system as it was. No collector was modified, no data was harvested, and no configuration was changed. The system will continue to work; the ledger will simply report four rows as MISSING until the work is re-done.

## Notes for the next task

The four Belgian operators now have settled attribution terms in the ledger, and their entries in attribution.js are ready for the front-end team. The unified gateway is the consumption point; each operator's open data license is noted in the ledger row. De Lijn, SNCB, STIB and TEC all require attribution when their data is displayed (per the "Attribution required" column, section 3, row 55).

If any future task displays ground transport data (timetables, real-time updates, route planning) from the Belgian operators' feeds, the Account panel's Data sources screen will render the entries from attribution.js, which now cover all four. No additional work is needed unless the display itself (a map, a route widget, a timetable view) warrants its own in-surface credit line—the entries here are comprehensive enough for the current archive's scope.

The Ferryhopper and OpenSky rows remain open by design: they are commercial-scope questions, not attribution ones. A future display task will need to resolve the agreements first; this ledger now states the gate clearly.
