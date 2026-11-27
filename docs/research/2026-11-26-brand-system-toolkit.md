# Viantra brand system: tools, method and plan (K1)

Research run `.work/2026-11-26-brand-system/` (crew research playbook), 2026-11-26. Status: final draft, with the owner's 178 saved Instagram posts read (section 7).

## The answer in one paragraph
Keep the style in the files you already have and make them easier to steer, rather than adding a design-token build tool: plain CSS tokens in `continent-app/src/styles/01-tokens.css`, with one new layer of named brand roles, documented in `DESIGN.md`. Write a short new `BRAND.md` that owns the strategy (promise, positioning, voice, name, logo and colour story) and links to `PRODUCT.md` (users and rules) and `DESIGN.md` (the look) instead of copying them. Build the positioning with April Dunford's components and end in one "only" sentence; lead with the cost of a day, because no competitor page we could read shows it, and drop "everything in one app", which four of six competitors already say. For the work itself use the project's own house style skill with impeccable in refinement mode, two strategy skills from rampstackco as question lists, and dembrandt as an audit tool; skip the design skills that bring their own fonts and palettes. Your saved reels add three to that set: Emil Kowalski's motion skills, a marketing teardown skill for the competitors and Anthropic's design-critique (section 7); motion, imagery and customisation are in section 6b. Before any page changes, the owner takes four decisions (section 5), then we go page by page in the order in section 6, starting with what a first visitor sees.

## 1. Making the style easy to change

| Tool | What it does | Verdict for Viantra |
|---|---|---|
| Plain CSS custom properties with a role layer | Raw colours at the bottom, roles like `--color-action` above them, components use roles only. A theme is an attribute on `html` (web.dev, 2025-12-11). | **Use.** Already how the repo works. Add brand roles so a brand change edits a handful of lines. |
| OKLCH colours, `color-mix()`, relative colour | Shades derived from one brand colour in the CSS itself, no build (web.dev, same page). | **Use** for new brand roles; keep hex fallbacks, because the contrast and mirror checks read the first `:root` block only (`01-tokens.css:31-32`). |
| W3C Design Tokens format (DTCG) | First stable version 2025.10, announced 2025-10-28 (w3.org). | **Later.** Only worth it if a second consumer needs the tokens (Figma, a native app). |
| Style Dictionary, Tokens Studio, Figma variables | Build a token file into CSS and other platforms (styledictionary.com, tokens.studio). | **Skip.** One platform, one owner, no Figma file. |
| Google's DESIGN.md format | Tokens in front matter, then a fixed section order; still tagged alpha (google-labs-code/design.md spec; Google blog, April 2026). | **Borrow the section order** when DESIGN.md is tidied; don't depend on its linter yet. |
| Radix Colors scale (as a model) | 12 steps per colour, each with a job: backgrounds, states, borders, solids, text (radix-ui.com). | **Use the naming idea**, not the package. |
| oklch.com | OKLCH picker and converter with sRGB fallbacks, by Evil Martians (oklch.com, fetched 2026-11-26). Free in the browser. | **Use** as a hex to OKLCH lookup. |
| Adobe Leonardo | "Generate colors based on a desired contrast ratio" (github.com/adobe/leonardo, Apache-2.0, fetched 2026-11-26). Free; npm package `@adobe/leonardo-contrast-colors`. | **Maybe**, to derive a ramp from a locked brand colour. |
| Huetone | "Accessible color systems with predictable contrast ratios" (github.com/ardov/huetone, MIT, fetched 2026-11-26). Free. | **Maybe**, to eyeball a ramp. |
| Harmonizer | OKLCH plus APCA palettes "with perceptually consistent lightness and contrast", web app and Figma plugin (evilmartians.com/opensource/harmonizer, fetched 2026-11-26). Licence and cost not stated. | **Maybe**, as a second opinion. |
| Contrast rule | WCAG 3 has not chosen a contrast method; APCA left the 2023 draft (adrianroselli.com, 2026-04). | **Keep WCAG 2 ratios** as the pass rule (as `token-contrast.mjs` does); APCA is a second look. |
| Utopia fluid type | Type that scales smoothly between two screen widths with `clamp()`; "not a product, a plugin, or a framework", free calculators (utopia.fyi, fetched 2026-11-26). | **Maybe**, as its own step: it changes every screen. |

Weak spots: Tokens Studio's price and Style Dictionary v5's release state come from third parties.

## 2. Claude skills and MCPs

The house style skill (`.claude/skills/carta-design/`, decision 0012) wins over every other design source and fixes the palette, fonts, radii and bans (`SKILL.md:24-31, 63-71`). A skill is only useful if it accepts that.

All free unless noted; "installed" means already on this machine.

| Skill or MCP | What it does | Install, licence | Verdict |
|---|---|---|---|
| impeccable 4.5.0 | Craft engine: `init`, `document`, `extract`, `critique`, `clarify` (copy), `polish`, `audit`. Its own rule: "The brief wins" (`~/.claude/skills/impeccable/SKILL.md:5,25`). | Installed. `npx impeccable install` (github.com/pbakaus/impeccable, Apache-2.0, fetched 2026-11-26) | **Use**, always in refinement mode; its redesign mode can replace DESIGN.md (`SKILL.md:26`). |
| rampstackco brand-discovery | Four dimensions (audience, needs, competitors, positioning territories), asks for 5 to 8 customer interviews (SKILL.md read 2026-11-26). Tessl score 72 (tessl.io review). | `npx skills add rampstackco/claude-skills --skill brand-discovery --agent claude-code` (skills.sh) | **Use as a question list** for BRAND.md, not as an answer machine. |
| rampstackco creative-direction | An aesthetic brief on four axes; Tessl overall 67, "a tight framework with four well-defined axes" (tessl.io review, "reviewed 1 month ago", fetched 2026-11-26). | Same repo | **Maybe**, fed the house style. |
| rampstackco brand-voice | Voice and tone. Not read. | Same repo | **Maybe.** Read before use. |
| dembrandt MCP | "Extract any website's design system in one command"; exports DTCG and DESIGN.md; 4.1k stars (github.com/dembrandt/dembrandt, fetched 2026-11-26). | Installed. `npm install -g dembrandt`, `dembrandt install-browser`; MIT | **Use** once on Viantra to find drift between the site and `01-tokens.css`, and on 3 to 5 competitors for reference. |
| web-design-guidelines | Reviews UI code against Vercel's Web Interface Guidelines: accessibility, focus, forms (Vercel, `~/.claude/skills/web-design-guidelines/SKILL.md:3`). | Installed; source repo not verified | **Use** as the last check per page. |
| awwwards MCP | Award sites, motion "DNA", design briefs; an independent project, not Awwwards itself; some tools for personal, non-commercial use (github.com/INSANE0777/awwwards-mcp, fetched 2026-11-26). | Installed. `claude mcp add awwwards -- npx -y awwwards-mcp`; MIT | **Maybe**, for the boot reveal (section 6b), as inspiration only. |
| taste-skill v2 | Art direction for marketing pages; its installed description ends "Not for dashboards or app screens" (`~/.claude/skills/taste-skill/SKILL.md:3`). | Installed. MIT (github.com/Leonxlnx/taste-skill) | **Skip as a builder.** At most a read-only lens on the home page. |
| soft-skill, minimalist, gpt-taste, stitch-skill, redesign-skill, genjutsu `paint`/`bunshin` | Each brings its own fonts, palettes or layouts (their own skill text, not run). | Installed | **Skip as builders.** |
| logo-design, brandkit, recraft | Logo and brand boards. | Installed | **Skip.** Gate V is signed off. |

No independent report shows any skill writing good brand strategy; every quality claim above is the maker's. The owner's library (`C:\Users\Gebruiker\library`) does not exist.

## 3. Positioning and voice method

**Method.** April Dunford's five positioning components: competitive alternatives (what customers use today instead), unique attributes, value, target customers and market category (Mind the Product, 2025-01-22, a secondary source; aprildunford.com was not read). The repo already holds most answers (`PRODUCT.md:132-134`, `docs/brand/POSITIONING.md`); what's missing is choosing the market category and ordering the claims. Close with one "only" sentence after Marty Neumeier: "every brand on the planet should be able to say what it's the only one of", in the form "the only [category] that [difference]" (danmall.com, 2018-05-02, a secondary source). The Value Proposition Canvas maps customer jobs, pains and gains against what the product relieves and creates (strategyzer.com, fetched 2026-11-26): use it as a checklist only. StoryBrand's seven-part story (customer as hero, a guide, a plan, a call to action, failure and success) is from memory: storybrand.com did not list the parts on 2026-11-26. Use it only to order the home page.

**Voice.** `PRODUCT.md` Voice (lines 77-89) already works: a metaphor (trail sign, receipt), rules, banned words, a vocabulary table. It lacks tone that shifts with the moment (error, first visit, payment), which Mailchimp's guide builds on (styleguide.mailchimp.com), and before/after example pairs.

**BRAND.md format.** caiopizzol/brand.md proposes four layers: Strategy, Voice, Visual, optional Governance (github, 42 stars, young). Fits, kept short.

## 4. The market

Home pages read on 2026-11-26:

| Product | Leads with | Shows a day cost? |
|---|---|---|
| Polarsteps (EN and NL) | "One travel app for all your adventures" / "Eén reisapp voor al je avonturen" | No |
| Wanderlog | "One app for all your travel planning needs" | No (a budget tracker exists, not verified) |
| Komoot | "Explore beyond the map" | No |
| Rome2Rio | "Discover how to get anywhere" | No |
| Mindtrip | "Travel that gets you." | No |
| Layla | "AI travel assistant that plans and books." | No |
| Roadtrippers | "Plan your trip, automagically" | No |
| Interrail NL, Trainline NL, NS International, ANWB | Discounts, tickets, "Alles voor je vakantie" | No |

Not readable: Omio, Google Travel, TripIt, Lonely Planet, Holiday Pirates NL.

What this means:
- **"One app for everything" is taken.** Viantra's current line "plans the whole trip in one place" (`PRODUCT.md:27`) sits in that crowd.
- **The cost of a day is not on any page we read** (about 14 pages). Cost lives in guides and calculators (Hostelz, Travelvalley about EUR 100 a day, BNNVARA about EUR 45 a day), so the fight is in search, through place pages, not on a home page.
- This is an absence on 14 pages, not proof. Check Wanderlog's budget feature and Nomad List before it goes into public copy.
- **Keep the claim to what the number covers:** bed and food, not "the flight" (`POSITIONING.md`; local transport is not in the day figure).

Three candidate lines (the owner decides, none final):
1. "The only Europe trip planner that shows what each day costs, bed and food, before you book."
2. "A cheap flight is not a cheap trip. Viantra prices the days there, then plans them." (already the hero, `home.title`)
3. "Walk somewhere new in Europe and know what the days cost: trails, transport and a real daily price in one plan." (narrowest, hikers first)

## 5. What the current docs say, and four owner decisions

Findings (`explore-repo-audit.md`):
- **Positioning is in three places with three wordings:** `PRODUCT.md:27,134`, `POSITIONING.md:17`, `index.html:32`. Their competitor lists differ too.
- **The house style's brand reference is out of date:** `.claude/skills/carta-design/references/brand.md` still makes the blaze the mark on icons, PDFs and share cards; the signed-off mark is now Gate V.
- **The skill folder and its references still say Carta:** shared-product-rules 12 times, home 9, account 8, explore 8.
- **Name leftovers:** `DESIGN.md:437,443` "Ask Carta", `PRODUCT.md:35` the old domain, and the boot animation in `index.html:81` spells C-a-r-t-a.
- **The terracotta is fenced off:** `--brand-mark #b5532c` sits in the tokens (`01-tokens.css:117`), but DESIGN.md says "umber is the only paint" (`:307`). At 4.3:1 on stone it is below the 4.5:1 text bar (4.96:1 on white passes).
- **"Brown and saffron" has no token behind it.**
- **The home page is off:** `homeVisit.js:17` `HOME_OFF = true` (owner, 2026-11-22), so a first visitor lands on the map.

The four decisions, in this order:
1. **Palette.** Decided 2026-11-27 by the owner: **(b)**. The logo keeps #b5532c; the one main action per screen takes terracotta at #a54a26; links and chosen states stay umber; the two are never the only signal between states. Options were: (a) Terracotta stays logo-only and umber stays the one paint; (b) terracotta becomes a second accent (needs a darker step for text: #a54a26 reaches 5.07:1 on stone and 5.82:1 on white, computed 2026-11-26). Watch out: terracotta and umber 600 have almost the same lightness (1.17:1 between them), and the darker text step #a54a26 has the same lightness as umber 600 (1.00:1), so next to each other they differ by hue alone, which colour-blind travellers may not see. A second accent must therefore never be the only thing that tells two states apart; (c) saffron gets a token as the second accent (no saffron colour exists in the tokens yet, so its contrast is not computed).
2. **Front door.** Decided 2026-11-27 by the owner: **the home page comes back on, on desktop only**; phones keep landing on the map until the mobile home page is fixed and optimised. The desktop gate and the redesign land together in page pass 1, so the old page never shows. The question was: turn the home page back on as the brand's front door, or keep the map first and carry the promise on the map's first screen, the place pages and the share cards.
3. **Market and lead claim.** Decided 2026-11-27 by the owner, from a wider set of lines written after the owner set PRODUCT.md's voice rules aside for this step: the category is a Europe trip planner to explore with, for everyone (interests, self-planners and road trips, fully planned trips, budget travellers; owner correction the same day: "not only for the cheap"), with the cost of a day as what sets it apart, and the voice is direct, a bit cheeky, "you do the fun part, we do the sums". The owner's lines and where each goes:
   - Home headline: "Tell us what you love. We'll show you Europe." (owner, same day, after widening the audience; "Tell us your budget. We'll show you Europe." moves to the budget filter and budget ads)
   - Home line under it, page title and share description: "Your way through Europe, priced."
   - Tagline (logo lockup, footer, social bio): "Wander more, worry less."
   - Map first screen (where phones land) and place pages: "Choose where. We'll tell you what it costs."
   - Hook for ads, social posts and the step after a flight is chosen: "Booked the €19 flight? Good. Now the hard part." (the fare in an ad must be a real one)
   - Five-second test (step C2): the home headline against the €19 hook.
   - Later, once a whole-trip budget exists: "Where can €500 take you?"
   The voice rules in PRODUCT.md are rewritten in step B to fit this voice. The question was: which category Viantra competes in and which candidate line leads.
4. **Master language.** Decided 2026-11-27 by the owner: **English first**; the other five languages follow it, with a native speaker reading the Dutch so it sounds written, not translated. The question was: write the brand in Dutch first (launch market NL and BE, `POSITIONING.md:52-60`) or in English first.

## 6. The plan

**Step A: the four decisions.** One sitting, with short visual options for 1 and 2.

**Step B: the three documents** (one commit each, owner reads each):
- **`BRAND.md` (new, root, about 2 pages).** Promise and the "only" sentence, who it is for (one paragraph), positioning against today's alternatives, voice and tone by moment with before/after pairs, the name story (0018), the logo (Gate V, `continent-app/brand/viantra/`), the colour story, the tagline, boilerplates (store, press, one line). It links to PRODUCT and DESIGN. `POSITIONING.md` folds into it and keeps only the market and name-check record.
- **One home for voice.** BRAND.md owns voice and tone. `PRODUCT.md:77-89` keeps only the banned words and the vocabulary table, because code mirrors those rules (`stripDashes` in `continent-app/src/lib/format.js`, `copyProblems` in `continent-app/scripts/og/check.mjs:50-75`). Code mirrors them, it does not read the file, so a change to the rules is changed in both places.
- **One competitor list.** The two lists (`PRODUCT.md:134`, `POSITIONING.md:40-48`) are merged once, in BRAND.md, starting from what travellers use today (spreadsheets, Booking, Skyscanner, Google Maps), then the products.
- **`PRODUCT.md`.** Stays the truth on users, jobs, number rules, principles, banned words and vocabulary. It loses the positioning text and the domain line, and links BRAND.md. Its positioning sentence is typed a second time in `continent-app/scripts/explainer/numbers.mjs:5-7`, which "must match it": both change in the same commit.
- **`DESIGN.md`.** Stays the authority on the look and keeps its structure. Gets the decided palette step and brand roles, the Gate V rules, "Ask Viantra", and the section order tidied towards Google's format. impeccable `document` output is only diffed against it, never written over it.
- **The house style skill.** Rename to a Viantra name, update `references/brand.md` for Gate V, clear the Carta mentions, and make it point at BRAND.md. CLAUDE.md names the skill, so it changes in the same commit.
- **Doc checks.** BRAND.md is added to `ROOT_FILES` in `scripts/docs/check_entry_points.py:37` and to the "Docs: what to read for what" table in `docs/project-map.md` (line 116, which still says "who Carta is for").

**Step C: tokens.** Add the brand role layer in `01-tokens.css` (OKLCH with hex fallback), keep the contrast check green, and run dembrandt on the live site to find drift.

**Step C2: test the lead line before page 1 is signed off.** Two hero variants (the two strongest candidate lines from section 4) on Lyssna's free plan: 15 responses from people you recruit yourself, free (lyssna.com/pricing). Send it to 15 Dutch speakers from your network. Buy panel answers only if the result splits; the panel price per response is unknown until Lyssna's own estimator shows it. Ask one native speaker per language how "Viantra" sounds.

**Step D: page by page.** First impression first. For each page: copy (impeccable `clarify`), look (`critique` then `polish` through the house style, with `design-critique` as a second critic and Emil Kowalski's motion rules where something moves), the three-angle check (390, 820 and 1180, 1440), web-design-guidelines, then the owner signs off.
1. Boot screen and head tags (the C-a-r-t-a animation), then Home if it is back on.
2. The map's first screen: search placeholder, band, empty and loading states.
3. The place page and its receipt: the proof of the promise and the search landing.
4. Shared trip view and share cards: the second most common first contact.
5. Plan, trip, day plan and Ask.
6. Pricing and pass, sign-in and the e-mails.
7. My trips, settings, account.
8. 404, footer, legal, press kit.

**Step E: retest after the pages.** The same five-second test on the finished home or map screen, against the step C2 result.

**Step F: six languages, one voice.** Large projects keep one master guide and a glossary and style sheet per language, with the register (formal or informal "you") set per language (WordPress polyglots handbook). For Viantra: write the master voice in the language from decision 4, then one short sheet per catalogue (`continent-app/src/i18n/{en,nl,fr,de,es,it}.js`) with its glossary, its "you" form and its banned words. A small Node check in the repo flags banned words and dashes per language, the way Vale's `reject.txt` lists do for prose (vale.sh). Vale itself is only an option for the `.md` docs.

**SEO guard** (Google Search Central, site moves and title links, fetched 2026-11-26):
- Take a Search Console baseline before the first copy change.
- Change the tagline and page titles in a different batch from the domain move (K1-a), so a traffic drop can be traced to one of them; Google's advice is to change one thing at a time (move the domain, then change the layout) and to expect temporary ranking changes during a move.
- Keep the words people search for ("cost per day", "wat kost") in the new titles; keep the `{title} | Viantra` pattern (`scripts/og/check.mjs:140`).
- Keep the old domain's 301 redirects at least a year.
- Each of the six languages keeps its hreflang links to all the others and itself, plus `x-default`.

## 6b. Motion, imagery and customisation
- **Motion.** The boot screen (`index.html:81`, `styles/06-boot-splash.css`) spells C-a-r-t-a letter by letter. It becomes a short Gate V reveal: the arch draws, the V opens, the wordmark settles. The motion uses the existing tokens (`--dur-*`, `--ease-*`, `01-tokens.css:401-426`). The haptic tick stays as it is (`src/lib/haptics.js`). Under `prefers-reduced-motion` the mark simply appears; the style sheets already carry that rule (76 files in `continent-app/src/styles/`). The awwwards MCP may serve as inspiration for this one moment, nothing more.
- **Imagery.** Licensed photography only, no AI pictures of real places (house style); text never on a photo (`DESIGN.md:336`). The missing photo stays the world tint tile (`DESIGN.md:405`), drawn with the Gate V mark instead of the blaze if decision 1 retires the blaze as a brand sign.
- **Customisation.** The Style Studio (`src/browse/styles/StyleStudio.jsx`) sets a traveller's travel style (where you sleep and eat, what you spend), not the look. There is no user-facing theme. "Super customizable" therefore means customizable for you, the owner: the brand role layer (step C) lets one edit restyle every screen. A user-facing theme (dark mode, contrast) is a separate feature decision, not part of the brand work.

## 7. The owner's saved reels
Read 2026-11-26 in the owner's signed-in Chrome: 178 saved posts. About 40 of the 65 recent ones (2025-12 to 2026-11, most from October and November 2026) are about Claude, web design or app building. A sample of 20 of the 113 older ones (2018 to 2024) was all sport, humour and student life. Captions only; the videos were not watched. Per-reel table: `.work/2026-11-26-brand-system/report.md` (tracked); each tool checked at its source: `explore-reels-tools.md`.

**Tools the reels name, checked at the source (fetched 2026-11-26; no releases listed, last pushes 2026-10-28 to 2026-11-26 per the GitHub API):**

| Tool (saved from) | What it is | Install, licence | Verdict |
|---|---|---|---|
| Impeccable, Taste, Playwright (bernardrb_, stinisai, imaginetechz) | Already in section 2 | Installed | Confirms the choice: Impeccable builds, Taste is a lens, Playwright checks |
| Emil Kowalski's skills, incl. `apple-design` (imaginetechz, jesseeisenbart) | 19 design-engineering skills on animation and component feel; `apple-design` adapts WWDC motion principles to the web (github.com/emilkowalski/skills, 60k stars) | `npx skills@latest add emilkowalski/skills`; MIT | **Use** for the motion rules (boot reveal, sheets, haptic moments), copied into DESIGN.md through the house style. The reel's "17 principles" matches the skill's 17 numbered sections; section 16 lists Apple's eight design principles |
| reverse-engineer-marketing (stinisai) | "Growth teardowns of any company", one of 53 skills (github.com/coreyhaines31/marketingskills, 62.8k stars) | `npx skills add coreyhaines31/marketingskills -a claude-code`; MIT | **Use** for decision 3: teardowns of Polarsteps, Wanderlog and Komoot |
| design-critique, brand-voice, ux-copy (janm_ux) | Usability, hierarchy and consistency feedback, in Anthropic's `design` plugin (github.com/anthropics/knowledge-work-plugins, Apache-2.0) | `claude plugin marketplace add anthropics/knowledge-work-plugins`, then `claude plugin install design@knowledge-work-plugins` | **Use** design-critique as a second critic per page; the same marketplace's `brand-voice` plugin (by Tribe AI, not Anthropic) and the design plugin's `ux-copy` skill are worth a try for the voice step. Skip `design-handoff` |
| Awesome Design MD (stinisai) | DESIGN.md files taken from public sites (github.com/VoltAgent/awesome-design-md, 129k stars) | Copy a file; MIT | **Maybe**, as a section template for DESIGN.md; never copy a look |
| Unslop (volkan.js) | Finds vibe-coded tells and redesigns (github.com/heydamir/unslop, 22k stars) | `claude plugin install unslop --marketplace heydamir/unslop`; CC BY 4.0 | **Maybe**, audit only: it proposes its own direction, which the house style must overrule |
| Agent Reach (stinisai) | Lets an agent read YouTube, X and Reddit (github.com/Panniantong/Agent-Reach) | MIT | **Maybe**, YouTube only; Reddit and X need cookies and may break those sites' terms |
| Claude Design, Claude's motion feature (anjela.marketing, leadwithzoe) | Anthropic Labs design app, research preview since 2026-04-17 (anthropic.com) | Paid Claude plans | **Maybe**, for motion studies of the Gate V mark, owner-approved |
| "REA" (charliehills) | No skill by that name found; dembrandt does the same job | n/a | Skip |
| Motion Primitives, Watermelon UI, anime.js, Scrolltide (bendoescareer, hugomxnning) | Tailwind component kits, an animation engine, an inspiration site | MIT (anime.js, Motion Primitives) | Skip; anime.js only if CSS can't do the boot reveal. Coconut UI, Backlit UI and Bencho could not be identified |

**Ideas the reels teach (no tool):**
- **Two calm colours and one that pops, on the action only** (diego.a.does, 2026-11-07, e.g. cream and black plus burnt orange). That is decision 1's option (b): stone and ink, with terracotta only on the main action, in the darker #a54a26 where it carries text.
- **Give Claude real references, not adjectives, and keep them in a skill** (aiyana_creative 2026-11-22, anjela.marketing 2026-10-01). Step B adds reference screenshots and before/after pairs to the house style skill.
- **Five hero layouts:** split, full-bleed, orbit, gallery, wordmark (ose.builds, 2026-10-22). These are the options for decision 2; "wordmark", the new name set huge, suits a fresh name.
- **A 20 "AI tells" checklist** (muhammadalim_s, 2026-11-24; the list itself is sent by DM): compare it with the house style's AI-slop catalogue (`DESIGN.md:569`) if it turns up.
- **Bottom sheets with a light blur and small haptics feel premium** (mutazdotdev, 2026-11-14): the house sheet and haptic tick already do this; the blur stays out (no glass).
- **Product notes for later passes:**
  - A first-run walkthrough (guhmp4, 2026-11-08).
  - A short "building your plan" moment before a paywall (viralapplaunch, 2026-10-19).

**Not followed:**
- Ten reels from eight accounts hide their sources behind "comment X and I'll DM you": nuhushaik (3), divwitholly, julianxuofficial, brochbuilds, nateherkai, rishithakor.creates, uiux.build, raycfu.
- Commenting would post on the owner's behalf, so they stay a gap.

## Gaps and disagreements
- Section 3 rests on secondary sources (Mind the Product for Dunford, danmall.com for Neumeier); StoryBrand's seven parts are from memory; aprildunford.com and Neumeier's own pages were not read.
- Skill verdicts rest on the makers' own text.
- The white space rests on about 14 readable pages; Omio, TripIt, Lonely Planet and Google Travel were not read, and Nomad List, Budget Your Trip, Moovit, Reisroutes, Treinreiswinkel and Zoover were not checked.
- Most tool pages show no date; they carry the fetch date 2026-11-26.
- Lyssna panel prices and Maze prices come from third parties.
- The name read in five languages is a judgement, not a native check.
- The researchers disagreed on dembrandt on Viantra itself; settled here as a one-time drift audit.

## Sources
- W3C DTCG stable: https://w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/ (2025-10-28)
- Style Dictionary DTCG: https://styledictionary.com/info/dtcg/ ; Tokens Studio https://tokens.studio (fetched 2026-11-26)
- Google DESIGN.md spec: https://raw.githubusercontent.com/google-labs-code/design.md/main/docs/spec.md ; blog https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-design-md/ (2026-04)
- CSS colour themes: https://web.dev/articles/baseline-in-action-color-theme (2025-12-11)
- WCAG 3 contrast: https://adrianroselli.com/2026/04/wcag3-contrast-as-of-april-2026.html (2026-04)
- Radix scale: https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
- oklch tools: https://evilmartians.com/chronicles/exploring-the-oklch-ecosystem-and-its-tools (2025-05-28)
- Utopia: https://utopia.fyi/
- dembrandt: https://github.com/dembrandt/dembrandt
- rampstackco brand-discovery: https://github.com/rampstackco/claude-skills (SKILL.md read 2026-11-26); Tessl https://tessl.io/registry/skills/github/rampstackco/claude-skills/brand-discovery/review
- Dunford: https://www.aprildunford.com/obviously-awesome ; components https://www.mindtheproduct.com/deep-dive-how-to-position-your-product/ (2025-01-22)
- Neumeier onlyness: https://danmall.com/posts/onlyness/ (2018-05-02)
- Value Proposition Canvas: https://www.strategyzer.com/library/the-value-proposition-canvas (fetched 2026-11-26)
- StoryBrand: https://storybrand.com (fetched 2026-11-26, parts not listed)
- Colour tools (fetched 2026-11-26): https://oklch.com , https://github.com/adobe/leonardo , https://github.com/ardov/huetone , https://evilmartians.com/opensource/harmonizer
- Skills (fetched 2026-11-26): https://github.com/pbakaus/impeccable , https://github.com/Leonxlnx/taste-skill , https://github.com/INSANE0777/awwwards-mcp , https://tessl.io/registry/skills/github/rampstackco/claude-skills/creative-direction/review
- Six-language voice: https://vale.sh/docs/keys/vocab ; https://make.wordpress.org/polyglots/handbook/translating/glossaries-and-style-guides-per-locale/
- hreflang: https://developers.google.com/search/docs/specialty/international/localized-versions
- Reel tools (fetched 2026-11-26): https://github.com/emilkowalski/skills , https://github.com/coreyhaines31/marketingskills , https://github.com/anthropics/knowledge-work-plugins , https://github.com/VoltAgent/awesome-design-md , https://github.com/heydamir/unslop , https://github.com/Panniantong/Agent-Reach , https://www.anthropic.com/news/claude-design-anthropic-labs (2026-04-17)
- Mailchimp voice and tone: https://styleguide.mailchimp.com/voice-and-tone/
- brand.md format: https://github.com/caiopizzol/brand.md
- Competitors (2026-11-26): https://www.polarsteps.com , https://www.polarsteps.com/nl , https://wanderlog.com , https://www.komoot.com , https://www.rome2rio.com , https://www.mindtrip.ai , https://layla.ai , https://roadtrippers.com , https://www.interrail.com/nl , https://www.thetrainline.com/nl , https://www.nsinternational.com/nl , https://www.anwb.nl/vakantie
- Cost guides: https://www.hostelz.com/en/backpacker-budget/Europe , https://www.travelvalley.nl/reis/wat-kost-een-rondreis-door-europa , https://www.bnnvara.nl/3opreis/artikelen/budget-citytrip-goedkoopste-steden-europa
- Lyssna pricing: https://www.lyssna.com/pricing
- Google site moves: https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes ; titles https://developers.google.com/search/docs/appearance/title-link
- Repo: `PRODUCT.md`, `DESIGN.md`, `docs/brand/POSITIONING.md`, `.claude/skills/carta-design/`, `continent-app/src/styles/01-tokens.css`, `continent-app/src/lib/homeVisit.js`, `continent-app/index.html`
