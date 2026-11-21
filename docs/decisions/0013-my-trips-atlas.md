---
status: accepted
date: 2026-11-21
decided-by: the owner, with Claude
run: .work/2026-11-21-my-trips-tab/
---

# 0013 · My trips as one atlas: examples behind a button, prices you follow

## Context
My trips (Trips, Saved, Your Europe) looked like three unrelated pages. Its empty states were generic, and most of its memories and stats stayed hidden until a trip was finished. The owner wanted it custom, clean and worth showing friends, with a better map, examples instead of empty pages, and a way to follow prices.

## Options considered
1. **Atlas:** one Carta map runs through all three sub-tabs.
2. **Credencial:** travel papers, with a ticket and a stamp book of 43 countries.
3. **Logbook:** one big figure per sub-tab over ruled ledgers.

## Decision
We chose **Atlas**, with four ideas taken from the other two (the country sheet, slots in the real shape, ledgers, one hero figure on Your Europe), because only it answered "a better map" and made the tab one place. Two owner reviews then set these rules:
- **Say less:** no helper lines and no visible map summaries.
- **White only for what floats.**
- **The trip plate is umber and shows only the figure.** The unit follows the traveller's own Prijzen tonen choice through one compact control.
- **An empty tab has one action plus "Bekijk een voorbeeld".** That opens an example mode under one Voorbeeld pill, and examples are never counted.
- **The map takes Explore's colours,** with countries filled by first-visit year.
- **Saved gets Volgen:** followed prices, each with the history Carta measured.
- **Your Europe uses graphics:** year bars, months, logged cost, extremes, a trip log of the traveller's own grades, and a year card studio with the traveller's own photo.
- **Jouw smaak moves to the Style Studio.**

## Consequences
- **Good:**
  - every state is designed;
  - phone, tablet and desktop each get their own layout;
  - the traveller sees what the tab grows into without fake personal numbers.
- **Bad or costs:**
  - one new store (`account_things` kind `watch`, migration 076, an owner step);
  - Saved loads MapLibre when it opens;
  - the cost chart shows only logged spend, because Carta's estimate is not like for like with it.

## How we'll know it works
- Travellers who open My trips with nothing in it press "Bekijk een voorbeeld" and then save or plan something.
- Share images from the year card studio are made.
- No reports of figures that disagree with Plan or Explore.

## More information
- Run report: `.work/2026-11-21-my-trips-tab/report.md`.
- Proposals and critiques: in the run folder.
- Rules: `docs/HANDBOOK.md` "My trips atlas", `.claude/skills/carta-design/references/account.md`.
