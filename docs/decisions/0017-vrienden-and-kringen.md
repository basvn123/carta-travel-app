---
status: accepted
date: 2026-11-23
decided-by: the owner, with Claude
run: .work/2026-11-23-samen-levelup/
---

# 0017 · Vrienden and kringen: Samen renamed, people first in ink and photo, private kringen

## Context
The friends page was called Samen (Together). The name did not say what was inside, three different people glyphs stood for one idea, and the page still wore white cards and beige fills from before decision 0016. The owner asked for it "mooi geïntegreerd, smooth, foto's scherp, alles goed gealigned, duidelijk wat de tab doet", more graphic, and for a tool to propose trips in a group, vote up and down, find the dates of most overlap and compare flights.

## Options considered
1. **A. People first** (one page: who goes where, to do, overlaps, friends as photo cards).
2. **B. Plans first** (to-do rows and a handle-only guest card).
3. **C. Atlas** (a map plate with friends' trips).

The hierarchy critic ranked A, B, C; brand A, C, B; accessibility B and A safest.

## Decision
We chose **A with B's to-do rows and guest card and C's plate only where it carries a fact**, then a second version with one graphic idea a section and the kring tool. Owner answers (2026-11-23):
- The name is **Vrienden** in all six languages (Friends, Freunde, Amis, Amigos, Amici); the route `?tab=together` stays.
- **Kringen are private**, by invitation only, accepted friends of the owner.
- **Milestones live on Jij**, as rings that fill.
- **The compass rose in Jouw Europa goes**: four ruled rows (supersedes that line of 0016).

What it means in the app:
- One people glyph (`HouseIcon.people`); a person-plus only on Uitnodigen, always with its word. The door shows its word from 1100 px.
- Saffron marks one thing a screen: the soonest overlap with a friend, or the kring's best date window.
- Figures draw in only after the traveller acts; never at the app's first paint, never with reduced motion; the ring never spins.
- The invite stays the existing `#friend=` link (no migration); the handle is held through sign-in.
- Kringen are migration 078 with a down file; fares come only from the swept flight files, never estimated ("Nog geen prijs").

## Consequences
- Every existing function stays: requests, join asks, coplan invites, votes, overlaps, group trips (055), settle up, friends, friend page, privacy (now in Jij), milestones, add by handle, link, QR and share.
- The owner applies migration 078 (`docs/owner/supabase-migrations.md`); until then there is no Kringen section.
- Phase 2: public kringen (moderation and reporting), a tracked invite that befriends on sign-up (a migration), the remaining cross-app links (ROADMAP G16).
- Undo: `git revert` of the `p15-vrienden` commits; `078_circles_down.sql` if 078 was applied.

## Links built
- A friend's face on the place page (Friends here) opens that friend in Vrienden; Stel voor in kring on the place page.
- In Bewaard, a shared list's people (the faces button) open each member in Vrienden.
- Vrienden's Gedeeld opens Bewaard on that exact shared list, and a co-planned trip opens in Plan.
- Account's Vrienden row; My trips' friends line (as before).

## Not done
- **Explore card faces ("Sam went")**: the faces sit inside the card's own link, and a second control inside it is a nested interactive element. The place page carries the link instead.
- **Today, "Wie gaat er mee"**: the crew there is names typed on the trip (`tripCrew.js`), not Carta accounts, so there is no friend to open.
- **Uitgaven, "Verrekenen"**: the Uitgaven page counts one trip's spending on the device; Settle up works on a group trip's ledger (058). The two are not linked by any id, so the link would open the wrong ledger or none.
- **Shared trip view, "Voeg @handle toe"**: the read-only share projection carries no owner handle (by design, migration 009 whitelists what leaves), so there is no handle to add.
