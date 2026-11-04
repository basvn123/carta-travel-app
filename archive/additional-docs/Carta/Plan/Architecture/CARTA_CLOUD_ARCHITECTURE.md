# Carta: cloud architecture and cost model

**Replaces `Cost-Efficient App Architecture Plan.md`.** Written against the actual
repository (`app_data/`, `continent-app/`, `pipeline/`, `docs/`) as of 2026-09-18,
not against a generic geospatial stack.

Target: cheapest possible baseline, with a named upgrade trigger at every layer so
nothing has to be rebuilt to grow.

---

## 1. What the previous plan got wrong

The old document is a well-researched essay about a **different application**. It
optimises for a runtime that Carta does not have, and it never mentions the two
things that actually constrain Carta. Before anything else, the corrections:

| Claim in the old plan | Reality in this repo |
|---|---|
| Runtime needs PostGIS + Martin serving dynamic vector tiles | Production serves **static JSON from a CDN**. `vercel.json` whitelists `*.cartocdn.com` for basemap tiles. There is no Martin, no production PostGIS. The PostGIS/Valhalla lab is a **build-time** tool (`tools/trailslab`), per `1.CARTA.md`. |
| Ship basemaps as PMTiles on R2 | Carta does not self-host a basemap at all — it rents Carto's. Self-hosting a basemap is a *new cost and a new job*, not a saving. PMTiles is the right answer for a different layer (see §5). |
| Migrate to MapLibre Tile (MLT) format | `package.json` pins `maplibre-gl ^4.7.1`. MLT shipped Jan 2026 and has no decoder in that line. You cannot adopt a tile format before you own a tile. Premature. |
| Migrate the client to WebGPU | MapLibre GL JS 4.x has no WebGPU backend; it is roadmap, not release. Not actionable in 2026. |
| Valhalla and OSRM RAM sizing drives VPS choice | Correct analysis, wrong scope: Valhalla runs **weekly, offline, to produce trail geometry**. It never serves a user request. It should never be always-on. |
| **Hetzner CPX32 at €13.99/mo** (TCO table) | Contradicts its own comparison table (€35.49) two pages earlier. €13.99 is the pre-June-2026 price. **The "~€15.50/month total" is not real.** |
| ARM compute | Not mentioned once. This is the single largest compute saving available to you (§6). |
| Images | Not mentioned once. This is your largest delivery surface and your stated priority (§4). |
| The 115 MB `app_data.json` | Not mentioned. This is your actual scaling cliff (§5). |

**The 80 GB diagnosis is directionally right but misattributed.** What ships is tiny.
`1.CARTA.md` puts the core wire at 5.2 MB. The 80 GB is entirely build-time residue:
OSM `.pbf` extracts, DEM tiles, the CLIP embedding cache (`cache/photos/emb`), the
WSL2 `ext4.vhdx` that never shrinks, `node_modules`, and — visible right now in
`app_data/` — **five separate ~110 MB copies of the master dataset**
(`app_data.json`, `.pre_transit_copy`, `.wave2`, `.pre_accom_v16`, `.backup`) plus a
`backups/` directory. That is a *housekeeping and build-host* problem, not a "migrate
the application to the cloud" problem, and it is far cheaper to fix than the old plan
assumes.

---

## 2. The shape of the system

Carta is not one system. It is three, with different cost curves, and the whole
optimisation follows from separating them:

```
  ┌─ BUILD (weekly, offline, heavy, invisible to users) ──────────┐
  │  run_pipeline.py · 26 collectors · fare harvests · Valhalla   │
  │  trail lab · Planetiler · CLIP photo engine · 80 GB of raw    │
  │  Cost driver: CPU-hours and bulk storage. Latency: irrelevant.│
  └───────────────────────────────────────────────────────────────┘
                              ↓ publishes immutable artifacts
  ┌─ WIRE (static, immutable, cache-forever) ─────────────────────┐
  │  app bundle · data shards · image derivatives · pin tiles     │
  │  Cost driver: egress and request count. Latency: everything.  │
  └───────────────────────────────────────────────────────────────┘
                              ↓ read by
  ┌─ LIVE (tiny, per-user, stateful) ─────────────────────────────┐
  │  Supabase auth · saved trips · edge functions (Gemini)        │
  │  Cost driver: MAU. Already near-zero standing cost.           │
  └───────────────────────────────────────────────────────────────┘
```

The old plan's mistake was putting BUILD-shaped technology (PostGIS, Martin, Valhalla
servers) into the WIRE tier and paying for it 730 hours a month.

**The rule: nothing that can be precomputed is allowed to hold a running process.**

---

## 3. Target architecture

```
                         ┌──────────────────────────────┐
  users ──────────────►  │  Cloudflare (free plan)      │
                         │  ├ Pages   app shell + JS/CSS│
                         │  ├ CDN     cache everything  │
                         │  └ custom domains            │
                         └───────┬──────────┬───────────┘
                                 │          │
                    cdn.carta…   │          │  data.carta…
                         ┌───────▼──────────▼───────────┐
                         │  Cloudflare R2  (zero egress)│
                         │  ├ img/{hash}/{w}.avif       │  ← §4
                         │  ├ data/ wire shards, JSON   │  ← §5
                         │  ├ tiles/ pins.pmtiles       │  ← §5
                         │  └ archive/ pbf, DEM, dumps  │  ← §6
                         └───────▲──────────────────────┘
                                 │ publishes (rclone/aws-cli)
         ┌───────────────────────┴──────────────────────┐
         │  Hetzner CAX11  (arm, €5.99) — always on     │
         │  cron, orchestrator, fare harvests, API jobs │
         │                                              │
         │  ┌ spawned on demand, destroyed after ─────┐ │
         │  │ CAX41 (16 vCPU / 32 GB arm, €0.056/h)   │ │
         │  │ Valhalla tiles · Planetiler · CLIP      │ │
         │  │ sweep · libvips image transcode         │ │
         │  └─────────────────────────────────────────┘ │
         └──────────────────────────────────────────────┘

  Supabase (free → Pro at trigger)  ← auth, saved trips, edge functions
  Basemap: keep Carto hosted tiles  ← see §5.4 before changing this
```

Five components. Two of them are free.

---

## 4. Images — the part that matters most to you

### 4.1 What you have now

The master wire alone contains **42,919 unique image URLs**, of which 42,264 point at
`upload.wikimedia.org` / `thumb.wikimedia.org`. `1.CARTA.md` reports 80,457 POIs
carrying photographs, and the beach/lake/mountain/trail layers add galleries on top,
so the real corpus is in the **80k–150k unique originals** range. Every one is
hotlinked, and every one is requested at a hardcoded `500px-` width.

Four problems, in order of severity:

1. **No format negotiation.** Every image is a JPEG. AVIF at equivalent perceptual
   quality is roughly 3× smaller. You are paying 3× the bytes on the single most
   bandwidth-heavy surface in the app.
2. **One fixed width for every context.** A 500px JPEG is simultaneously too big for a
   list thumbnail and too small for a hero. There is no `srcset`, so phones download
   desktop bytes.
3. **You do not control the origin.** Wikimedia's cache behaviour, its TTFB from your
   users' regions, and its tolerance for a commercial product hotlinking it at scale
   are all outside your control. Wikimedia's own guidance discourages hotlinking at
   volume. A throttle on their side is a visible outage on yours.
4. **Latency is unbounded and unmeasurable.** You cannot put an SLO on someone else's
   CDN.

### 4.2 The design

**Pre-generate derivatives once. Never transform at request time.**

```
  harvest (already exists: pipeline/photos/commons.py, geograph.py)
     │  polite: 2 workers, 0.4 s pacer, maxlag=5, contact UA  ← keep exactly as-is
     ▼
  originals → ephemeral disk on the build box (not kept)
     │
     ▼  libvips, 16 arm cores
  derivatives, content-addressed by sha1 of the source file title:
     img/{ab}/{cd}/{sha1}/320.avif    ~15 KB   list thumbnails, map popups
     img/{ab}/{cd}/{sha1}/640.avif    ~45 KB   cards, gallery strip
     img/{ab}/{cd}/{sha1}/1280.avif  ~150 KB   hero, lightbox
     img/{ab}/{cd}/{sha1}/320.webp    ~20 KB   fallback
     img/{ab}/{cd}/{sha1}/640.webp    ~60 KB   fallback
     ▼
  R2 bucket, Cache-Control: public, max-age=31536000, immutable
     ▼
  Cloudflare CDN at cdn.carta-europetravel.com  →  zero egress cost, edge-cached
```

Content addressing means the path never changes for a given source file, so
`immutable` is honest, re-runs are idempotent, and a rescore that reorders a gallery
rewrites only a small JSON — never an image.

In the app:

```html
<picture>
  <source type="image/avif" srcset="{base}/320.avif 320w, {base}/640.avif 640w, {base}/1280.avif 1280w" sizes="...">
  <source type="image/webp" srcset="{base}/320.webp 320w, {base}/640.webp 640w">
  <img src="{base}/640.avif" width=… height=… loading="lazy" decoding="async" alt="…">
</picture>
```

You already store dimensions (`pipeline/apply_image_dims.py`), so emit `width`/`height`
on every `<img>`. That kills layout shift and is free.

Three more free wins:
- `<link rel="preload" as="image">` the single above-the-fold hero, nothing else.
- `fetchpriority="high"` on that hero; `loading="lazy"` on everything below.
- A ~24-byte inline blurhash/LQIP per hero, carried in the wire, as the placeholder.

### 4.3 Why not on-the-fly transformation

Cloudflare Image Transformations bills **$0.50 per 1,000 unique transformations**.
100,000 images × 3 widths = 300,000 unique transforms = **$150 in the first month**,
recurring whenever the set changes. Pre-generating the same ladder on hardware you are
already paying for costs **$0** and is faster on first hit, because there is no
cold-transform penalty. Cloudflare Images' own storage/delivery tier ($5 per 100k
stored + $1 per 100k delivered) is worse still for a catalogue this size.

On-the-fly transformation is correct for user-uploaded images of unknown dimension. It
is the wrong tool for a fixed, pipeline-owned catalogue.

### 4.4 What it costs

| Corpus | AVIF only | + WebP fallback | R2 storage/mo |
|---|---|---|---|
| 50,000 images | 10.0 GB | 13.8 GB | **$0.21** |
| 100,000 images | 20.0 GB | 27.7 GB | **$0.41** |
| 150,000 images | 30.0 GB | 41.5 GB | **$0.62** |
| 250,000 images | 50.1 GB | 69.1 GB | **$1.04** |

Upload cost: 100,000 images × 5 objects = 500,000 Class A writes — **inside R2's
1M/month free tier**. Egress from R2 through Cloudflare: **$0.00 at any volume.**

Bandwidth, assuming ~12 images per pageview at the 640 width plus wire:

| Pageviews/mo | Egress | Cloudflare + R2 | Bunny.net | Vercel Pro |
|---|---|---|---|---|
| 10,000 | 8.5 GB | $0 | $0.08 | included |
| 100,000 | 85 GB | $0 | $0.85 | included |
| 500,000 | 424 GB | $0 | $4.24 | included |
| 2,000,000 | 1.7 TB | **$0** | $16.98 | ~$105 overage |

**Self-hosting your entire photo corpus costs under $1/month and removes your largest
external dependency.** This is the highest-return change in the whole document.

### 4.5 Two obligations that come with it

- **Attribution follows the pixels.** `docs/tos/data_licenses.md` and
  `src/data/attribution.js` already carry the credit lines, and `credit.owes_credit`
  already gates export. Keep that gate: a self-hosted CC BY-SA file with no author is
  the same violation it was when hotlinked, only now it is unambiguously *your* copy.
- **`takedown.py` must reach R2.** The ledger currently scrubs the wire. Extend it to
  issue the R2 delete, or the "one image out of everything we publish, in minutes,
  permanently" guarantee quietly stops being true the day you start self-hosting.

### 4.6 Build cost of the first transcode

~100k originals: download is the constraint, not CPU. At your existing 0.3 s thumbnail
pacer with 2 workers that is ~4 hours; AVIF encoding of 3 widths on 16 ARM cores runs
behind it comfortably. Call it **one 6-hour CAX41 run ≈ €0.35**, then incremental
forever, keyed by `rank_v` and the content hash exactly as the photo engine already
does.

---

## 5. The wire — your actual scaling cliff

### 5.1 The problem

`app_data/app_data.json` is **115 MB across 3,868 destinations**. `sync-data.mjs`
strips `activities.items_full` and `image.hires` and shards POIs per destination, which
is the right instinct and is why the core wire was 5.2 MB at 1,570 destinations. But
the core wire still grows **linearly with the catalogue**, and
`PRICEMAP_CHUNKS.md` targets 25,000 destinations. Extrapolated, that is a ~30 MB boot
payload. The map dies long before that.

A second, sharper limit: **Cloudflare Pages allows 20,000 files per site** (and 25 MiB
per file). Between `poi/` (3,868), `fares/`, `reach/` (286 origins), `region/`,
`destinfo/`, `dossier/`, and the ten layer directories, you are already within sight of
it, and 25,000 destinations blows straight through.

### 5.2 The fix: split the wire by access pattern, put shards on R2

| Tier | Contents | Size at 25k dests | Host |
|---|---|---|---|
| **Boot index** | id, lat, lon, country, flags, rating band — nothing else | ~1–2 MB | Pages |
| **Pin tiles** | the price-map geometry as PMTiles, built by tippecanoe | ~15–30 MB total, bytes fetched per viewport | R2 |
| **Per-origin fare slices** | already exists, already lazy | unchanged | R2 |
| **Detail shards** | POI, dossier, destinfo, region, layer pages | unchanged, already lazy | R2 |

Put `data.carta-europetravel.com` in front of the R2 bucket. That removes the file-count
ceiling entirely (R2 has no practical object limit), keeps the Pages deploy to a few
hundred build artifacts, and costs nothing extra because the bucket already exists for
images.

### 5.3 PMTiles — right idea, wrong layer

The old plan was correct that PMTiles is the cloud-native answer, and wrong about what
to put in it. Do **not** self-host a basemap. Do put **your own destination pins** in a
PMTiles archive once the catalogue passes roughly 5,000 destinations:

- Build from the destination GeoJSON with `tippecanoe`, on the same box, weekly.
- Ship **identity and geometry only** — `id`, name, country, static flags.
- **Keep price out of the tile.** Price depends on origin airport, dates and group size;
  baking it in would multiply the archive by every permutation. Join client-side from
  the per-origin fare slice by destination id — which is exactly the pattern
  `fareFile.js` already implements. The tile carries where the pin is; the slice
  carries what it costs.
- MapLibre reads it by HTTP range request straight from R2. No tile server, no running
  process, no per-request cost.

This is the one place the old plan's technology recommendation survives intact — it
just belongs one layer up from where it was aimed.

### 5.4 Leave the basemap alone

Carto's hosted tiles cost you nothing today and are already in your CSP. Self-hosting a
Protomaps basemap adds a weekly Planetiler build, ~15 GB of storage, a style to
maintain, and an attribution surface — to replace something that is currently free and
working. Revisit only if Carto changes terms or you need custom cartography. If you do,
the build slots into the same ephemeral box and the same R2 bucket, so nothing in this
architecture has to change to accommodate it. **That option stays open at zero cost.**

### 5.5 Move off Vercel Hobby

Carta carries Travelpayouts and Omio affiliate links. That is commercial use, and
**Vercel's Hobby plan does not permit commercial use.** Two honest options:

- **Cloudflare Pages, free** — commercial use allowed, unlimited bandwidth, and it puts
  the app on the same edge as R2 and the images. **Recommended.** Your `vercel.json`
  headers map cleanly onto `_headers`; the CSP moves across unchanged except for adding
  `cdn.carta-europetravel.com` to `img-src` and `data.…` to `connect-src` (and you can
  then *remove* `upload.wikimedia.org` and the four `geograph.org.uk` hosts).
- **Vercel Pro, $20/mo** — if you value the DX enough to pay for it. Nothing else here
  changes.

At 2M pageviews the same traffic is $0 on Cloudflare and ~$105 on Vercel Pro.

---

## 6. Build and pipeline — cheapest, with a clean upgrade path

You asked for cheapest possible with the option to upgrade. The answer is to stop
paying for idle capacity, because your pipeline is a **weekly batch job pretending to
be a server**.

### 6.1 Use ARM

This is the change the old plan missed entirely. Post-June-2026 Hetzner pricing:

| Plan | Arch | vCPU | RAM | NVMe | Traffic | €/mo |
|---|---|---|---|---|---|---|
| CPX32 *(old plan's pick)* | x86 | 4 | 8 GB | 160 GB | 20 TB | **35.49** |
| **CAX31** | Ampere arm64 | **8** | **16 GB** | 160 GB | 20 TB | **20.99** |
| **CAX41** | Ampere arm64 | **16** | **31 GB** | 320 GB | 20 TB | **40.99** |
| **CAX11** | Ampere arm64 | 2 | 4 GB | 40 GB | 20 TB | **5.99** |

CAX31 is **twice the cores and twice the RAM of CPX32 for 59% of the price.** For
embarrassingly parallel batch work — Planetiler, Valhalla tile cutting, libvips
transcoding, CLIP inference — ARM's weaker single-core is irrelevant and the core count
is everything.

*Check before committing:* Valhalla, Planetiler, PyTorch/OpenCLIP and libvips all ship
working arm64 builds, but confirm the specific container tags your pipeline pins. If one
dependency is x86-only, run that one task on a CX-line box and keep everything else on
ARM — the architecture does not care.

### 6.2 Split always-on from on-demand

**Always-on: CAX11, €5.99/mo.** Cron, `run_pipeline.py` orchestration, the 26
collectors, fare harvests (network-bound, not CPU-bound), publishing to R2. 4 GB is
ample for this.

**On-demand: CAX41 at €0.056/hour, destroyed after each run.** Valhalla tile builds,
Planetiler, the CLIP sweep, image transcoding. Driven by `hcloud` CLI from the CAX11:
create → cloud-init pulls the repo and the inputs from R2 → run → push artifacts to R2
→ delete.

| Heavy hours/month | Cost |
|---|---|
| 4 h | €0.22 |
| 8 h | €0.45 |
| 16 h | €0.90 |
| 30 h | €1.68 |

This also dissolves the constraint `PHOTOS.md` documents at length — "CLIP wants about
2.5 GB… free memory sat at 0.2 GB of 15.6", sessions standing down for each other,
`.rescore_hold` files as a memory-arbitration protocol. With 31 GB on a box that exists
for six hours, the contention simply stops existing. The hold file stays useful as a
*correctness* guard (don't rescore mid-rebuild); it stops being a *memory* guard.

**The upgrade path, in order, each a config change and not a migration:**
CAX11 → CAX31 always-on (€20.99) if harvests outgrow 4 GB → add a second CAX11 to
parallelise collectors → keep a CAX41 warm if build frequency ever justifies it.

### 6.3 The 80 GB

| Class | Example | Where | Cost |
|---|---|---|---|
| **Reproducible inputs** | OSM `.pbf`, DEM/GLO-30 tiles | R2 `archive/`, or re-download per run | ~$0.90/mo for 60 GB, or $0 |
| **Expensive derived caches** | `cache/photos/emb`, enrich caches | R2, **tarred per layer** — not as millions of small objects | ~$0.15/mo |
| **Master snapshots** | `app_data.*.json` history | R2, lifecycle rule → delete after 30–90 days | ~$0.05/mo |
| **Encrypted DB dumps** | `pg_dump -Fc` from Supabase | R2, 30-day lifecycle | ~$0.01/mo |
| **Pure garbage** | WSL2 `ext4.vhdx` slack, `node_modules`, `dist`, `du.exe.stackdump` | delete locally | $0 |

Two notes worth acting on:

- **Tar the embedding cache before uploading.** Millions of tiny objects turn R2's
  Class A pricing into a real bill and make every sync slow. One archive per layer,
  extracted onto the ephemeral box's local NVMe at the start of a run, re-tarred at the
  end.
- **`app_data/` currently holds five ~110 MB masters.** Keep one, push the rest to R2
  with a lifecycle rule, and reclaim ~400 MB locally in a single command.
- **If R2 ever feels awkward for bulk archival**, a Hetzner Storage Box gives 1 TB for
  roughly €3–4/mo with unlimited traffic and plain `rsync`/SFTP, and sits in the same
  datacentre as the build box. Use R2 for anything the *app* reads; Storage Box is a
  fine alternative for anything only the *pipeline* reads.

Once this lands, your laptop needs the repo and `node_modules`. Everything else is
`git clone` plus a pull from R2.

### 6.4 Database

Supabase free (500 MB, 50k MAU) covers auth and saved trips today. Note the free tier
**pauses a project after a week of inactivity** — for a live site with real traffic that
is not a practical risk, but it is the reason to move to Pro ($25) the moment Carta
matters to anyone but you. Nothing else needs a database: the catalogue is static, and
the PostGIS lab is build-time and belongs on the ephemeral box, where it costs nothing
when idle.

---

## 7. Cost model

### Tier 0 — cheapest workable baseline (recommended start)

| Component | Choice | $/€ per month |
|---|---|---|
| App shell + CDN | Cloudflare Pages (free) | **€0.00** |
| Image derivatives (100k imgs, 28 GB) | Cloudflare R2 | $0.41 |
| Data shards, pin tiles, archive (~90 GB) | Cloudflare R2 | $1.35 |
| R2 operations | inside free tier | $0.00 |
| Egress, all of it | Cloudflare | **$0.00** |
| Orchestrator, always-on | Hetzner CAX11 arm | €5.99 |
| Heavy builds, ~8 h/mo | Hetzner CAX41 on demand | €0.45 |
| Auth + saved trips | Supabase Free | €0.00 |
| Basemap | Carto hosted | €0.00 |
| Domain | ~€12/yr | €1.00 |
| **Total** | | **≈ €9.50 / $10.50 per month** |

Add an IPv4 address (~€0.60/mo) if you want one; IPv6-only plus Cloudflare in front
works and is free.

### Tier 1 — real traffic (≈50k–200k MAU)

Same architecture. Only two lines move:

| Change | Why | Delta |
|---|---|---|
| Supabase Free → Pro | no pausing, 8 GB db, backups, 100k MAU | +$25 |
| CAX11 → CAX31 | harvest concurrency, bigger catalogue | +€15 |
| **Total** | | **≈ €48 / $53 per month** |

Egress is still $0. That is the whole point of the design.

### Tier 2 — scale (500k+ MAU, 25k destinations)

| Change | Why | Delta |
|---|---|---|
| Pin tiles → PMTiles on R2 | boot payload stops growing with catalogue | €0 |
| Second CAX31 for collectors | pipeline wall-clock | +€21 |
| R2 growing to ~250 GB | bigger corpus | +$2.50 |
| Supabase compute add-on | connection load | +$10–60 |
| **Total** | | **≈ €80–130 / month** |

For comparison, the same workload on AWS with S3 egress at scale is a four-figure
monthly bill, essentially all of it data transfer. **The zero-egress decision is what
makes every tier above affordable, and it is the one thing the old plan got completely
right.**

---

## 7b. Does this hold at 200 GB?

Yes — but "200 GB" is four different numbers with four different cost curves, and only
one of them can actually hurt you. The whole point of §2's split is that bulk size stops
being a single scary figure.

### The decomposition

| Class | What grows | Where it lands | At 200 GB |
|---|---|---|---|
| **Cold archive** | OSM `.pbf`, DEM, snapshots, dumps | R2 `archive/` | $3.00/mo. Unbounded. No change needed. |
| **Image derivatives** | more destinations → more photos | R2 `img/` | $1.84/mo at 25k destinations. Linear, trivial. |
| **Derived caches** | CLIP embeddings, enrich caches | R2, **tarred** | ~$0.30/mo. See warning below. |
| **Hot working set** | what a build actually needs on local disk | build box NVMe | **the one real constraint** |
| **The wire** | what users download | Pages + R2 | **does not grow with any of the above** |

That last row is the important one. The boot payload is driven by *destination count*,
not by bulk storage, and §5.2 caps it structurally. You can go from 80 GB to 200 GB to
2 TB without a user downloading one extra byte. Bulk growth and page-speed growth are
fully decoupled in this design — that is what you are buying.

### Scaling from where you are now

Today: 3,868 destinations → 42,919 unique images in the master, a ratio of **11.1
images per destination**. Holding that ratio:

| Destinations | Unique images (incl. layer galleries) | Derivative corpus | R2/mo | Harvest wall-clock |
|---|---|---|---|---|
| 3,868 *(today)* | ~69,000 | ~19 GB | $0.29 | — |
| 10,000 | ~178,000 | ~49 GB | $0.74 | ~7.4 h |
| 25,000 *(your target)* | ~444,000 | ~123 GB | $1.84 | ~18.5 h |

So the full 25,000-destination catalogue puts **~123 GB of images plus ~60–80 GB of
archive and caches — right around 200 GB — and the storage bill is about $3/month.**
Storage is not the thing that bites.

### The three things that actually bite

**1. Local NVMe on the build box.** CAX41 gives 320 GB, which holds a 200 GB working set
today and will not hold it forever. When a single build needs more than the box's disk:

- Attach a **Hetzner Volume**: €0.044/GB/month, up to 10 TB, 16 per server. 200 GB =
  **€8.80/mo** — nearly 3× R2's price, so put only the genuinely *hot* working set there
  and leave everything else cold in R2.
- Or keep the box stateless and stream: pull the tar for the layer being built, extract
  to local NVMe, build, push, destroy. Costs wall-clock instead of money, and for a
  weekly job that is usually the better trade.

Either way this is an attach-a-volume decision, not a re-architecture.

**2. Object count, not byte count.** R2 has no practical object limit, but 444,000
images × 5 derivatives is **2.2 million objects**, and the embedding cache at one file
per image would add 444,000 more. Consequences:

- Initial upload is 2.2M Class A writes = **$5.49 one-off** (1M/month is free). Fine.
- But *never* store `cache/photos/emb` as loose objects. Tar it per layer. A sync that
  has to enumerate half a million tiny objects is slow, fragile and needlessly billed.
- Don't rely on `ls`/`ListObjects` to find anything. Content-addressed paths plus a
  manifest in the wire means you never list a bucket at all — you compute the path.

**3. Harvest wall-clock is your real ceiling.** ~18.5 hours at 25,000 destinations, and
that is bounded by your own politeness to Commons (2 workers, 0.3 s pacer), not by CPU
or money. You cannot buy your way past it and you should not try. The implication is
architectural: **incremental forever, never a full re-harvest.** Your photo engine
already has the mechanism — `rank_v` stamping plus content-addressed derivative paths
means a re-run pays only for what is genuinely new. Protect that property as the
catalogue grows; it is what keeps a 200 GB corpus maintainable by one person.

### Cost at 200 GB

| Component | €/$ per month |
|---|---|
| Cloudflare Pages | 0.00 |
| R2, 200 GB | 3.00 |
| R2 operations | 0.00 |
| Egress, all of it | 0.00 |
| CAX11 always-on | 5.99 |
| CAX41, ~16 h/mo heavy builds | 0.90 |
| Supabase Free | 0.00 |
| Domain | 1.00 |
| **Total** | **≈ €10.90 / month** |

Against Tier 0's €9.50 at 80 GB: **going from 80 GB to 200 GB costs you about €1.40 a
month.** That is the correct shape for this design, and it is the strongest argument for
adopting it.

### The one growth path that would break this

Everything above assumes the 200 GB is **static catalogue** — images, tiles, archives,
caches. All of it precomputed, immutable, cache-forever.

If instead 200 GB ends up in a **live transactional database** — per-user generated
content, live inventory, anything needing indexed queries over the whole set — none of
this applies. Supabase Pro tops out at 8 GB before storage overages at $0.125/GB, and
200 GB there is a fundamentally different and far more expensive system. Nothing in
Carta today points that way; the catalogue is static by design and the live tier is just
auth and saved trips. But it is the one direction that would require re-opening this
document rather than just resizing a line in it, so it is worth noticing early if the
product ever starts moving that way.

---

## 8. Migration order

Sequenced so that each step is independently valuable and independently revertible.
Nothing here requires a rewrite.

1. **Reclaim locally, free.** Delete `dist/`, `node_modules/`, `du.exe.stackdump`; push
   the four redundant `app_data.*.json` masters to R2; compact the WSL2 vhdx with
   `Optimize-VHD`. Expect tens of GB back in an afternoon. *Do this first — it buys
   breathing room for everything else.*
2. **Stand up R2.** One bucket, four prefixes (`img/`, `data/`, `tiles/`, `archive/`),
   two custom domains. Move the archive tier up. The laptop stops being the system of
   record.
3. **Move the pipeline to CAX11 + on-demand CAX41.** Port the Windows Scheduled Task to
   cron; verify each pipeline task on arm64 one at a time. The laptop stops being the
   build host.
4. **Build the image ladder.** Extend the photo engine with a `derive.py` stage:
   content-hash, libvips to 3 AVIF + 2 WebP, upload, and write the base path into the
   layer caches. Run it for **one layer** (beaches is the smallest) end to end before
   committing to the rest. Extend `takedown.py` to delete from R2 in the same change.
5. **Switch the app to `<picture>` + `srcset`.** Behind a flag, one layer at a time.
   Measure LCP before and after. Tighten the CSP once Wikimedia hosts are unused.
6. **Move data shards to R2**, then the app to Cloudflare Pages. Do the shards first —
   that alone clears the 20,000-file ceiling, and Pages becomes a small, safe move.
7. **Only when the catalogue passes ~5,000 destinations**: tippecanoe → `pins.pmtiles`,
   with price joined client-side.

Steps 1–3 are pure cost and risk reduction. Step 4–5 are the user-visible speed win.
Steps 6–7 are the scaling headroom, and neither is urgent today.

---

## 9. What to verify before you commit

Written so these are checks, not assumptions:

- **arm64 coverage.** Confirm working arm64 builds for every pinned container in the
  pipeline — Valhalla, Planetiler, and the torch/OpenCLIP stack are the ones to check
  first. One x86-only task is survivable; three would change the recommendation.
- **The real image count.** Walk `cache/<layer>/rich_*.json` — not `public/`. `PHOTOS.md`
  makes this exact point: the wire only contains what passed the gate, so counting there
  undercounts by construction. Size the corpus from the caches before budgeting storage.
- **AVIF sizes on your actual photographs.** The 15/45/150 KB figures are sound defaults
  for landscape photography at `cq-level` ~32, but encode 200 real files and measure
  before extrapolating to 100,000.
- **Current file count in `public/`.** `find continent-app/public -type f | wc -l`
  against the 20,000 Pages ceiling tells you how urgent step 6 is.
- **Wikimedia caching terms.** You are already relying on them; self-hosting derivatives
  is the compliant move, but re-read the licence ledger in `docs/tos/data_licenses.md`
  for anything that permits hotlinking while forbidding a stored copy. Geograph and
  Mapillary you have already cleared as storable; Commons is fine; anything else in the
  ledger deserves a second look before its bytes land in your bucket.

---

## Sources

- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing)
- [Cloudflare Images pricing](https://developers.cloudflare.com/images/pricing)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Hetzner price adjustment, 15 June 2026](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)
- [Hetzner CAX31 specs](https://sparecores.com/server/hcloud/cax31) · [CAX41 specs](https://sparecores.com/server/hcloud/cax41)
- [Hetzner Storage Box](https://www.hetzner.com/storage/storage-box/) · [Hetzner Cloud Volumes](https://www.hetzner.com/cloud/block-storage/) (€0.044/GB/mo, [checked Aug 2026](https://wz-it.com/en/blog/explained-and-set-up-hetzner-cloud-volumes/))
- [Vercel pricing](https://vercel.com/pricing)
- [Supabase pricing](https://supabase.com/pricing)
- [Bunny Storage pricing](https://bunny.net/pricing/storage/) · [Bunny CDN pricing](https://bunny.net/pricing/cdn/)
- Repository: `docs/1.CARTA.md`, `docs/PHOTOS.md`, `docs/PRICEMAP_CHUNKS.md`, `continent-app/vercel.json`, `continent-app/package.json`, `continent-app/scripts/sync-data.mjs`, `app_data/app_data.json`
