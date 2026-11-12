# Owner procedure: Translation review by native readers (T1072, ROADMAP I8)

Claude wrote the German, Spanish, French, Italian and Dutch text. A script has checked it and Claude has proofread it: no keys are missing, the stripped accents the scans found are restored (more may remain), French uses vous everywhere, and the shortlist has one word per language (owner sweep 2026-11-12, `docs/i18n/review.md`). The part only a person can do is a native reader's sense of whether the text sounds natural. There is one step per language. Each step replaces the 46 per-task rows (T165-c to T505-e), T156-b and T158-c from owner-checks, and the walkthrough rows T1196-a, T1208-g, T1215-d, T1212-a, T1156-b and T1108-b. When a language is read, delete its step (docs/decisions/0003-open-items-owner-steps-and-roadmap.md).

How to do one language (about two hours):
1. Run the app (`cd continent-app && npm run dev`) or open the preview. Pick the language under Account, Preferences, Language.
2. Go through these screens in order, worst first: Plan a trip (wizard), a trip page, a place page with its "Not for you" lines, Ask Carta, Help and FAQ, the AI page, Press, then Explore, a trail page, a beach page and My trips.
3. Note each wrong or stiff line as `key: better text`. To find a line's key, search the language file `continent-app/src/i18n/<lang>.js` for the text.
4. Also read your language's labels and synonyms in `pipeline/taxonomy/carta_taxonomy.yaml` (search terms; they show on no screen, T1215-d).
5. Give the list to a Claude Code session ("apply these nl fixes and mark nl reviewed"). It applies them, checks the `prerender.*` keys and `scripts/prerender/strings.mjs` for that language, and adds the language to REVIEWED in `continent-app/scripts/prerender/langs.mjs`, so the next prerender indexes those pages (T1212-a). Then delete the step.
6. Done when every screen in the list has been read and the session has applied the fixes.

Rows: 5.

## Steps

1. **I8-nl** Dutch: you read it yourself. Start with `support.*` (an early draft, T1108-b), the 14 `why.place.*` lines (T1208-g), the `aiPage.*` text (T1156-b), the interest labels (T1215-d) and the 11 strings under "Fix these first" in `docs/i18n/review.md` (T1196-a).
2. **I8-de** German: a native German reader. Register is du.
3. **I8-fr** French: a native French reader. Register is vous (decided 2026-11-12). Also check that "Demander à Carta" works as the name of the Ask button.
4. **I8-es** Spanish: a native Spanish reader. Register is tú.
5. **I8-it** Italian: a native Italian reader. Register is tu. Also check the gender-neutral `notfor.*` lines that were rewritten on 2026-11-12.

## Moved from unsorted.md (owner sweep 2026-11-12)

| ID | Item | Order |
|---|---|---|
| T1131-c | Review the Dutch press strings (`press.*`, `support.pressLink` in nl.js); de, es, fr, it fall back to English. Replace the screenshot slot (`PRESS_SCREENSHOT`, today the site OG image) with a real product screenshot |  |
