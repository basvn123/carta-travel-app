# The toolkit for a professional Viantra logo

Research run `.work/2026-11-26-logo-toolkit/` (crew:research, 4 explorers, 3 critics). Date 2026-11-26. Feeds ROADMAP K1 and decision 0018. Not legal advice.

## The answer
No tool on the market makes a trademark-ready logo on its own, and no Claude skill has a proven designer-grade process. What works, according to every source that tested it: **AI for many fast concepts, a render step so Claude can see what it drew, strict small-size and one-colour tests, and a person who finishes the vector and the type.** For Viantra that means:
1. **Connect one image generator:** Recraft's official MCP (the only Claude-reachable tool that returns SVG from a prompt; quality unproven in neutral tests). Ideogram's MCP is the second choice, for wordmark ideas.
2. **Install two skills:** `rampstackco/logo-design` (the checklist) and, with its push step switched off, `neonwatty/logo-designer-skill` (the concept and preview loop).
3. **Build a small local toolchain:** `@resvg/resvg-js` and Playwright to render, `svgo` to clean, `fonttools` (installed) to outline the wordmark, `vtracer` only if a concept arrives as an image.
4. **Pay a person for the finish:** vector clean-up and kerning, with a written rights assignment. That finish is also the legal step: a logo merely picked from AI output is probably not protected by copyright in the EU.
5. **Lead with a wordmark,** and keep the name risk (Viantro) separate: a new picture does not reduce it.

## What the evidence says

### Generators Claude can drive
| Rank | Tool | How Claude reaches it | Output | Evidence and caveats |
|---|---|---|---|---|
| 1 | **Recraft** (V4/V4.1 vector) | Official remote MCP, OAuth: `claude mcp add --transport http recraft https://mcp.recraft.ai/mcp` ([remote server docs](https://www.recraft.ai/docs/mcp-reference/remote-server), 2026-11-26) | SVG, PNG | Only mainstream tool that returns SVG from a prompt and also vectorises. Whether it is truly vector-native is disputed on Hacker News; gwern called its vectoriser the best he tried but editability "not great" ([HN](https://news.ycombinator.com/item?id=42639391), Jan 2025). MindStudio calls the output "a starting point" ([2026-06-19](https://www.mindstudio.ai/blog/recraft-v4-1-brand-design-logos-svg-assets)). API price $0.08 per vector image ([pricing](https://www.recraft.ai/docs/api-reference/pricing)); MCP spends plan credits; on 2026-11-26 the pricing page showed a Black Friday offer, 40% off any yearly plan "from $6/month", until 2026-12-01 ([pricing page](https://www.recraft.ai/pricing)); prices move, so check on the day. |
| 2 | **Claude writing SVG itself** | Native | SVG | Good first sketches of simple geometric marks; fails on print-scale curves and lettering (cases below). Needs a renderer to see its own work. |
| 3 | **Ideogram** (incl. "Ideogram Vector") | Official remote MCP: `claude mcp add --transport http ideogram https://mcp.ideogram.ai/mcp` ([Ideogram](https://ideogram.ai/features/mcp/)) | PNG, SVG | Best known for text in images; no independent test of its Vector model found. |
| 4 | Raster models (Gemini image, GPT image) plus a vectoriser | API | PNG, then trace | A HN user made logos in Nano Banana, then vectorised with vectorizer.ai or Recraft ([HN](https://news.ycombinator.com/item?id=46793060), about Jan 2026). |
| Skip | SVGMaker MCP, Zoviz, LogoLoom as generator, Adobe, StarVector, OmniSVG | | | SVGMaker: no independent logo test. Zoviz: a paid logo maker with an MCP ([Zoviz](https://zoviz.com/blog/zoviz-mcp-server-claude)); as a template and stock-element tool (inferred from its category) it is weak for a trademark. Figma MCP (installed, needs sign-in): a hand-off tool for the finisher, not a generator. Adobe's Claude connector has no text-to-image generation ([Adobe staff, 2026-09-02](https://community.adobe.com/feature-requests-405/expose-firefly-generation-image-video-via-mcp-api-so-it-can-be-driven-from-claude-and-other-ai-agents-1637240)). OmniSVG needs 17 to 26 GB of GPU memory ([repo](https://github.com/OmniSVG/OmniSVG)); StarVector only traces images ([repo](https://github.com/joanrod/star-vector)). |

**Licence of output:** Recraft's free-plan images belong to Recraft and are not for commercial use; paid plans grant "full ownership and commercial rights" ([Recraft](https://www.recraft.ai/docs/plans-and-billing/commercial-rights-and-ownership), read 2026-11-26). Subscribe before generating anything you keep. Recraft's terms reportedly changed on 2026-08-24 and were not read; read them on the day. This is a contract right only: it creates no copyright the law does not give (see Legal).

### Claude's own SVG: what the cases show
| Case | What happened |
|---|---|
| [Android Authority, 2026-10-07](https://www.androidauthority.com/using-claude-logo-design-disaster-3717711/) | Four concepts came fast. Zoomed for print, edges were jagged; a curve never got smooth; Claude could not thicken the wordmark without losing its character; it stated wrong dimensions confidently; long prompting made it worse. The author lost two days; a designer then worked out the changes in about an hour (the article does not give the time to redraw). Model not named. |
| [Ciyo, 2026-09-23](https://ciyo.ai/blog/claude-opus-5-5-svg-logo) (a vendor) | A first try had a part floating off the body and seven ellipses merging into a blob at 32 px; one feedback round fixed it. A traced image-model logo had 3,908 paths, cleaned by hand to 8. |
| [note.com, 2026-09-26](https://note.com/kyo1m4181/n/nf36f22dcfb32?hl=en) | Image drafts, then Claude refined as SVG and checked favicon sizes; it caught gaps that vanish at 16 px. The author still wants a designer's polish. |
| Hacker News | Claude Code drew a usable extension logo ([2025-12-31](https://news.ycombinator.com/item?id=46442292)); Claude Design "mangled the SVG versions" of a user's logos ([2026-04-17](https://news.ycombinator.com/item?id=47809520)); "wonky logos" named as an LLM tell ([2026-05-18](https://news.ycombinator.com/item?id=48181083)); a developer of a 10,000-user app had Claude or Codex write the SVG line by line, changing it step by step, after online logo tools failed ([2026-05-07](https://news.ycombinator.com/item?id=48044149)); a vibe coder describes losing about 2 hours a project to palettes, ad-filled vectorisers and favicon resizing (a launch post for his own tool, [2026-02-05](https://news.ycombinator.com/item?id=46898280)). |

Pattern: simple flat marks work; curves at print scale, optical balance and lettering do not; every success rendered the result and had a person decide. Iterate on one SVG file rather than regenerating, which made the Android Authority result worse.

### Skills (what their files actually contain)
| Skill | Verdict | Why |
|---|---|---|
| [`rampstackco/claude-skills` logo-design](https://github.com/rampstackco/claude-skills) (MIT, pushed 2026-11-16) | **Install** | 10 steps; 3 architectures with 2 to 3 type options each; tests: silhouette without type, one colour, reverse, 16 px, 25 to 200% scaling, recall. "The output is decision material, not a finished logo." Markdown only, no tools. Install just this skill (and `brand-identity` for the colour and contrast part of BRAND.md), not the 110-skill pack. The README offers plugin bundles (`/plugin marketplace add rampstackco/claude-skills`) or copying `skills/` by hand and says each skill stands on its own ([README](https://github.com/rampstackco/claude-skills), read 2026-11-26): clone it and copy only `skills/logo-design` and `skills/brand-identity` into `.claude/skills/`. |
| [`neonwatty/logo-designer-skill`](https://github.com/neonwatty/logo-designer-skill) (MIT, 214 stars, pushed 2026-10-19) | **Install with care** | Interview, 3 to 5 concepts, refine, export; a `preview.html` with light and dark toggle and a favicon strip; rule: viewBox without fixed width and height. Risks in the [raw SKILL.md](https://raw.githubusercontent.com/neonwatty/logo-designer-skill/main/skills/logo-designer/SKILL.md): its concept subagents run with `bypassPermissions`, and an optional Phase 5 commits, pushes and opens a PR. Its README says to clone the repo and ask your agent to use the skill; copying `skills/logo-designer` into `.claude/skills/` should also work (untested). In this shared checkout: remove Phase 5 from the copy, read `scripts/export.sh` first, replace its export with our renderer. |
| [brand-md](https://github.com/thebrandmd/brand.md) (MIT, 42 stars) | Use as a template | A real but single-author spec (Strategy, Voice, Visual, Governance); no adopter found. Copy its layout for BRAND.md; the plugin is optional. |
| [LogoLoom](https://github.com/mcpware/logoloom) (MIT, 61 stars, pushed 2026-03-23) | Optional | Text-to-path, SVGO, a 31-file brand kit export. Runs `npx -y` on every start: pin a version. Our own toolchain does the same. |
| rknall svg-logo-designer, b1rdmania brand skills, anthropics canvas-design and brand-guidelines | Skip | No licence and abandoned after 2 days (rknall); needs bun and third-party image APIs (b1rdmania); wrong job (Anthropic's two). |
| Installed here: `brandkit`, `imagegen-frontend-web` | Not usable yet | Both assume an image-generation tool this session lacks; they become useful once Recraft or Ideogram is connected. `dembrandt` MCP (extracts competitors' colours, type and logos) and `carta-design` (the house style, to be rewritten for Viantra) are useful as they are. |

### What practitioners and pros do
- **Failures named most:** raster logos that do not scale or recolour; generic, kit-bashed marks; bad type; weak trademark position ([Creative Bloq, 2025-05-03](https://www.creativebloq.com/design/graphic-design/is-ai-giving-clients-impossible-expectations-of-designers), reporting r/graphic_design; [DEV](https://dev.to/techresolve/solved-please-stop-recommending-chatgpt-for-logo-design-5beg), undated opinion).
- **Source labels:** Toptal, 4over4, ManyPixels, Made Good Designs, Superside and Designshack below are design-service or vendor pages, mostly undated: read them as practice guides, not neutral evidence. The independent voices are the Hacker News comments and the Android Authority and note.com cases above.
- **The pro process:** a brief signed off first ([Toptal](https://www.toptal.com/designers/logo/guide-to-logo-development)); sketches before colour ([Studio Function](https://medium.com/studio-function/logo-design-guide-2-of-5-logo-design-3134507b00d7)); optical, not mathematical, letter spacing with hand kerning; a suite with clear space, minimum sizes and colour values ([4over4](https://www.4over4.com/content-hub/stories/brand-guidelines-checklist)).
- **Direction:** wordmark-led, distinctive type is the 2026 trend in vendor trend pages ([ManyPixels](https://www.manypixels.co/blog/brand-design/logo-design-trends)); Skift warns travel brands are "blanding" into sameness ([2025-12-19](https://skift.com/2025/12/19/why-travels-biggest-brands-are-becoming-dangerously-boring/)). A new brand without recognition is better served by a wordmark than a symbol alone ([Made Good Designs](https://madegooddesigns.com/travel-logo-design/)).
- **Cost of a person:** a design contest about $299 to $1,299 ([Superside](https://superside.com/blog/are-design-marketplaces-worth-it)); an experienced freelancer $1,500 to $10,000 ([Designshack 2025](https://designshack.net/articles/business-articles/how-much-does-logo-design-cost)). A targeted finish (vector and kerning only) is the cheap version; the Android Authority case gives no time or price for the finish itself.

### Production pipeline (Windows, untested here)
| Step | Tool | Command or note |
|---|---|---|
| Render so Claude can see | `@resvg/resvg-js` ([repo](https://github.com/yisibl/resvg-js), Windows x64 binary, Node 22) plus Playwright (installed) | In a scratch folder: `npm i @resvg/resvg-js`, render 16, 32, 48, 180, 512, 1024 px, then a contact sheet that Claude opens with its image reader. resvg and Chrome disagreeing points to an SVG feature to avoid. |
| Clean | `svgo` | `npx svgo@latest -i in.svg -o out.svg --config svgo.config.mjs`; keep `viewBox`, precision 2 to 3 ([svgo docs](https://svgo.dev/docs/preset-default/)); keep an unminified master. |
| Outline the wordmark | `fonttools` 4.54 (installed) | Converts glyphs to paths. It does **not** apply kerning: spacing is set by hand (or read with `uharfbuzz`). The repo already has static Overpass and Sofia Sans Extra Condensed TTFs from `continent-app/scripts/print-fonts/build_print_fonts.py`. |
| Vectorise a raster concept | `vtracer` | `python -m pip install vtracer` (0.6.15, cp311 win_amd64 wheel, [PyPI](https://pypi.org/project/vtracer/)). potrace only via its win64 zip and black-and-white input. No head-to-head test exists; a trace is a start, the curves get redrawn. |
| Icon files | Pillow (installed) | Multi-size `favicon.ico` with hand-tuned 16 and 32 px images ([Pillow docs](https://pillow.readthedocs.io/en/stable/handbook/image-file-formats.html)). |

**The render loop, tested on 2026-11-26** with `@resvg/resvg-js` 2.6.2 on this machine against the current `favicon.svg` (it rendered a 972 x 2124 sheet that Claude then read). In a scratch folder outside the repo, `npm i @resvg/resvg-js@2`, save as `sheet.mjs`, run `node sheet.mjs sheet.png a.svg b.svg`, then open `sheet.png`:
```js
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
const [out, ...files] = process.argv.slice(2);
const sizes = [16, 32, 48, 96, 180, 512], grounds = ['#ffffff', '#eef0ea', '#8c5a2b', '#1e2421'];
const pad = 16, gap = 12, cell = Math.max(...sizes), rowW = sizes.reduce((s, z) => s + z + gap, pad);
let y = pad, parts = [];
for (const f of files) {
  const src = readFileSync(f);
  for (const bg of grounds) {
    let x = pad;
    parts.push(`<rect x="0" y="${y - 6}" width="${rowW}" height="${cell + 12}" fill="${bg}"/>`);
    for (const z of sizes) { // each size rendered on its own, so small sizes show real pixel snapping
      const png = new Resvg(src, { fitTo: { mode: 'width', value: z } }).render().asPng();
      parts.push(`<image x="${x}" y="${y + (cell - z) / 2}" width="${z}" height="${z}" href="data:image/png;base64,${Buffer.from(png).toString('base64')}"/>`);
      x += z + gap;
    }
    y += cell + 12;
  }
  y += gap;
}
writeFileSync(out, new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${rowW}" height="${y}">${parts.join('')}</svg>`).render().asPng());
```
On the current Carta mark the sheet shows the problem found at the start of this work: at 16 px it is a small striped rectangle that reads like a flag.

**Tests every candidate must pass:** 16 and 32 px favicon; one colour, black on white and white on black; reversed; the wordmark at 120 px wide (the header); PWA maskable: mark inside a circle of radius 40% of the width ([web.dev](https://web.dev/articles/maskable-icon)); Android adaptive: 108 dp layers, mark 48 to 66 dp ([Android](https://developer.android.com/develop/ui/views/launch/icon_design_adaptive)); iOS: 1024 px square, unmasked, text only if essential ([Apple HIG](https://developer.apple.com/design/human-interface-guidelines/app-icons)). It must replace one for one the files in `continent-app/public` (favicon.svg, favicon.ico, icon-192, icon-512, icon-maskable-512, icon-maskable.svg, apple-touch-icon) and `continent-app/brand/store/`.

**Contrast, if umber stays** (computed here with the WCAG formula; 3:1 is the bar for a graphic): umber `#8c5a2b` on white 5.81, on the stone ground `#eef0ea` 5.06, white on umber 5.81: all pass. Umber on the ink `#1e2421` is 2.72 and **fails**: the dark version of the mark needs a lighter colour.

### Type and licence
- SIL OFL fonts may be used in a logo without further permission, and you remain the author of the derived graphic ([OFL FAQ 1.1, 1.1.1, 1.13](https://openfontlicense.org/ofl-faq/)). Overpass and Sofia Sans Extra Condensed are OFL (`docs/tos/fonts.md`).
- Google Fonts and Fontshare logo terms were only seen in search summaries; read the licence text in a browser and keep a dated copy before choosing such a face. Avoid "free for personal use" fonts and platform fonts.
- A wordmark in an unmodified stock face, and the UI face at that, is weak and easy to imitate: give it at least one custom detail and hand spacing.

### Legal (secondary sources; not legal advice)
- **The name is the risk, not the picture.** VIANTRA and VIANTRO share six of seven letters; when a mark contains a word, the word usually weighs most. A new logo does not fix this; the clearance search in decision 0018 does (inferred from general EUIPO practice; the 2026 Guidelines text was not read).
- **Trademark:** nothing found bars registering an AI-assisted logo: the EU trade mark regulation asks for a sign that distinguishes and can be represented, and lists grounds for refusal that do not mention authorship ([EUTMR, Art. 4 and 7](https://eur-lex.europa.eu/eli/reg/2017/1001/oj)); no EUIPO guidance on AI-made marks was found. Very simple logos can fail distinctiveness.
- **Copyright:** a Munich local court refused protection to three AI-generated logos on 2026-02-13, even with a 1,700-character prompt, because the software made the decisive choices ([CMS summary](https://cms.law/en/cze/publication/artificial-intelligence-and-copyright-case-tracker/germany-anonymous-creator-of-ai-generated-logos-and-operator-of-personal-website-v-anonymous-user-of-the-claimant-s-logos-on-his-own-personal-web)); Prague ruled the same for a DALL-E image in 2023 ([Merlin](https://merlin.obs.coe.int/article/10047)). No EU-level ruling exists yet, and no source says how much human work is enough. Keep sketches, prompts and edit history.
- **Image search before filing:** TMview and the WIPO Global Brand Database both search by image ([Intepat summary](https://www.intepat.com/blog/trademark-logo-image-search-euipo-wipo)); a clean result is preliminary, not clearance.

## The workflow
1. **Brief** (owner signs off): the context pack below, plus 3 words the mark must feel like.
2. **References:** pull Polarsteps, Komoot, Wanderlog and others with `dembrandt` into a board, so the mark is chosen against the category.
3. **Diverge:** 3 architectures (wordmark, lockup, letterform-as-symbol) times 2 to 3 type registers (rampstackco), from Claude SVG and Recraft; about 9 to 12 candidates on one preview page.
4. **See:** render every candidate to the contact sheet (16 px to 512 px, on stone, white, umber and ink); Claude reads the sheet before it judges anything.
5. **Test and cut:** run the test list; drop any candidate that fails more than two contexts; keep 3.
6. **Similarity check:** TMview and WIPO image search on the 3; search the word variants too.
7. **Owner picks one.** Refine that one SVG file; do not regenerate.
8. **Human finish:** brief a designer for vector clean-up and kerning only, with a written rights assignment.
9. **Produce:** outline, svgo, render the icon set, replace the app files, update `docs/tos/fonts.md`; then `BRAND.md`, `DESIGN.md` and the carta-design skill.

## The context pack Claude needs for the logo
1. The name and its story: decision 0018 (*via* + *tra*, "the way through", vee-AN-tra) and its two risks.
2. Audience and voice: `PRODUCT.md` (budget travellers and hikers first; precise and honest, never luxury).
3. Banned: `DESIGN.md` cliche list (compass rose, globe, plane with a dashed trail, passport stamps, handwritten "wanderlust") plus "wonky" AI tells.
4. Owner choices still open: does the umber brown stay, and does the trail blaze come along.
5. Where it must work: the test list above, the header at 360 px, the files it replaces.
6. Type rules: OFL or a read licence; outlined; hand-kerned; one custom detail.
7. Legal guardrails: no likeness to Viantro's logo; keep the process record.
8. The tools and how to see: the render command and contact sheet.

## Disagreements and gaps
- **Reddit could not be read:** the search tool, the page fetcher and the browser all block reddit.com. Reddit appears only second-hand (Creative Bloq). Hacker News was read directly through its search API.
- **Recraft's true quality** for a logo has no neutral, hands-on test; its rank reflects reach and format, not proven output.
- **"Human finish"** in this document means a person, not Claude plus scripts; only a person helps the copyright position.
- **vtracer vs potrace:** no comparison exists; test both on the real concept.
- Not read at source: Recraft's current terms, Ideogram's terms (free-tier commercial use is disputed), Google Fonts and Fontshare licence texts, the 2026 EUIPO Guidelines, neonwatty's `export.sh`.
- Many practitioner pages are undated vendor blogs; dated sources are named where they exist.

## Sources
Generators: [Recraft remote MCP](https://www.recraft.ai/docs/mcp-reference/remote-server), [Recraft pricing](https://www.recraft.ai/docs/api-reference/pricing), [Recraft rights](https://www.recraft.ai/docs/plans-and-billing/commercial-rights-and-ownership), [Ideogram MCP](https://ideogram.ai/features/mcp/), [MindStudio on Recraft V4.1](https://www.mindstudio.ai/blog/recraft-v4-1-brand-design-logos-svg-assets), [HN on Recraft](https://news.ycombinator.com/item?id=42639391), [HN logo workflow](https://news.ycombinator.com/item?id=46793060), [Adobe community](https://community.adobe.com/feature-requests-405/expose-firefly-generation-image-video-via-mcp-api-so-it-can-be-driven-from-claude-and-other-ai-agents-1637240), [OmniSVG](https://github.com/OmniSVG/OmniSVG), [StarVector](https://github.com/joanrod/star-vector)

Claude cases and HN: [Android Authority](https://www.androidauthority.com/using-claude-logo-design-disaster-3717711/), [Ciyo](https://ciyo.ai/blog/claude-opus-5-5-svg-logo), [note.com](https://note.com/kyo1m4181/n/nf36f22dcfb32?hl=en), [HN 46442292](https://news.ycombinator.com/item?id=46442292), [HN 47809520](https://news.ycombinator.com/item?id=47809520), [HN 48181083](https://news.ycombinator.com/item?id=48181083)

Skills: [rampstackco](https://github.com/rampstackco/claude-skills), [neonwatty](https://github.com/neonwatty/logo-designer-skill), [neonwatty SKILL.md](https://raw.githubusercontent.com/neonwatty/logo-designer-skill/main/skills/logo-designer/SKILL.md), [brand.md](https://github.com/thebrandmd/brand.md), [LogoLoom](https://github.com/mcpware/logoloom)

Practice: [Creative Bloq](https://www.creativebloq.com/design/graphic-design/is-ai-giving-clients-impossible-expectations-of-designers), [DEV](https://dev.to/techresolve/solved-please-stop-recommending-chatgpt-for-logo-design-5beg), [Toptal](https://www.toptal.com/designers/logo/guide-to-logo-development), [Studio Function](https://medium.com/studio-function/logo-design-guide-2-of-5-logo-design-3134507b00d7), [4over4](https://www.4over4.com/content-hub/stories/brand-guidelines-checklist), [ManyPixels](https://www.manypixels.co/blog/brand-design/logo-design-trends), [Skift](https://skift.com/2025/12/19/why-travels-biggest-brands-are-becoming-dangerously-boring/), [Made Good Designs](https://madegooddesigns.com/travel-logo-design/), [Superside](https://superside.com/blog/are-design-marketplaces-worth-it), [Designshack](https://designshack.net/articles/business-articles/how-much-does-logo-design-cost)

Pipeline and legal: [resvg-js](https://github.com/yisibl/resvg-js), [svgo](https://svgo.dev/docs/preset-default/), [vtracer](https://pypi.org/project/vtracer/), [Pillow](https://pillow.readthedocs.io/en/stable/handbook/image-file-formats.html), [web.dev maskable](https://web.dev/articles/maskable-icon), [Android adaptive](https://developer.android.com/develop/ui/views/launch/icon_design_adaptive), [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/app-icons), [OFL FAQ](https://openfontlicense.org/ofl-faq/), [CMS case tracker](https://cms.law/en/cze/publication/artificial-intelligence-and-copyright-case-tracker/germany-anonymous-creator-of-ai-generated-logos-and-operator-of-personal-website-v-anonymous-user-of-the-claimant-s-logos-on-his-own-personal-web), [Merlin](https://merlin.obs.coe.int/article/10047), [Intepat](https://www.intepat.com/blog/trademark-logo-image-search-euipo-wipo)
