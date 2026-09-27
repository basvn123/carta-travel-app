# T053 Tighten the CSP once Wikimedia hosts are unused

## Task ID

T053

## Date

2026-09-28

## What changed

The Content-Security-Policy img-src directive was amended to permit cdn.carta-europetravel.com in both vercel.json (Vercel/production) and public/_headers (Cloudflare Pages), keeping the two CSP definitions identical. The comment block in _headers was updated to reflect the current state: cdn.carta-europetravel.com is now added to img-src, data.carta-europetravel.com awaits T054 (R2 data shards), and the six Wikimedia and Geograph hosts remain in the list until every direct hotlink to them is replaced with CDN derivatives.

A headless verification harness (scripts/verify_csp.mjs) was written to load the app with the CSP applied and collect securitypolicyviolation events across the five layer pages (beaches, lakes, mountains, trails, cycling) and the Journeys trips index. The harness runs three test cycles: with the current CSP (before), with the CDN host added (after), and with an experimental CSP that removes the six Wikimedia and Geograph hosts to measure how many violations would result from that removal.

The honest finding: the precondition for removing those six hosts is not met. T052 documented that all but 124 of 27,748 records across the three main layers (beaches, lakes, mountains) lack derived CDN copies, because no full derive run has happened (there are no R2 credentials on this machine and the CDN domain does not resolve). Every such record still requests its photograph from Wikimedia or Geograph in both the picture srcset and the img fallback. Dozens of other surfaces (layer cards, region pages, country briefs, POI thumbnails, hero images, trip guides, day drafts and the admin panel) still hotlink them regardless of layer flags. Removing those hosts from the CSP now would render production blank. So this task does what can ship now: add the CDN host, update the comment to document the blockers plainly, and provide a verification tool that will show when removal becomes possible.

## Files touched

All paths relative to the repository root.

**App repo (continent-app/), code commit:**

**Modified:**
- continent-app/vercel.json (added https://cdn.carta-europetravel.com to img-src)
- continent-app/public/_headers (added CDN host to img-src, updated comment block to describe T054 and T052-f blockers)

**Created:**
- continent-app/scripts/verify_csp.mjs (headless harness to measure CSP violations)

**Root repo, report commit:**

**Created:**
- Execution/P3/T053-csp-tighten.md

**Modified:**
- Execution/_OPEN.md (rows T053-a and T053-b added, T052-b closed)

**Deleted:**
- None

## Commands run

```bash
cd C:/Users/Gebruiker/Documents/Portfolio/Travel\ App
git checkout -b p3-csp-tighten
cd continent-app
git checkout -b p3-csp-tighten
npm run build                          # clean dist/ for testing
node scripts/verify_csp.mjs            # run verification harness
cd ..
# Create and stage report
```

## Config and secrets set

No environment variables or secrets. Two new Vite build flags are not needed for this task: VITE_PICTURE_LAYERS and VITE_IMG_BASE (already set by T052 and unused by the CSP or the verification harness).

## Before/after measurements

The CSP amendment adds one domain to img-src (cdn.carta-europetravel.com) and makes no other changes. CSP enforcement overhead is immeasurable.

CSP violation counts (the verification harness measures how many securitypolicyviolation events fire for each configuration):

| Configuration | beaches | lakes | mountains | trails | cycling | journeys | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| Current CSP (before amendment) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| With CDN host added (after amendment) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Without Wikimedia/Geograph (experimental) | 249 | 251 | 253 | 188 | 188 | 188 | 1,317 |

Blocked origins in the experimental run: upload.wikimedia.org 1,306, thumb.wikimedia.org 9, s2.geograph.org.uk 2. Each page rendered between 94 and 127 img elements; with the hosts allowed it made 10 to 42 image requests (lazy loading holds the rest back), with the hosts removed every candidate is refused at once, so the blocked count exceeds the allowed count. This is the measurement that shows why the six hosts stay: today every photo on these pages still comes from Wikimedia or Geograph, because no derive run has published anything to the CDN.

One caveat on the last three columns. The trails, cycling and journeys hashes the harness uses render the same view (identical element and request counts on every run), so those columns measure one landing view three times rather than three distinct trips pages. The done condition names the trips pages, and they are not yet covered; the hash routes for a trail page, a cycling tour and a journey need to be taken from their own harnesses (verify_trail_page, verify_cycling, verify_journeys) when the removal gate is worked. This is folded into row T053-a.

The harness refuses to report a pass vacuously: a page that requested no image and blocked none prints a warning and is marked vacuous, because the first version of this harness did exactly that and reported zero violations for all three configurations.

## What broke and how it was fixed

| What broke | Why | Fix |
|---|---|---|
| The first run of verify_csp.mjs reported 0 violations for every configuration, including the one with the six hosts removed | The local server's request handler read the command-line CSP argument, not the policy passed to each run, so all three runs were served the default policy. Two and a half seconds was also too short for the lazy page chunk to request its photos | The orchestrating session made the policy a per-run variable the server reads, lengthened the wait to eight seconds, counted img elements and image requests per page, and made a run with no images at all print a warning and mark the page vacuous. The rerun produced the table above |
| The blocked-resource list printed example.com for every entry | The directive and URL were split on the first two colons, which cut https:// in half | Split at the first colon only and aggregate by origin |

## What is still open

The removal gate for the six Wikimedia and Geograph hosts from img-src cannot be closed until two conditions are met, both described in Execution/_OPEN.md:

1. Row T052-f: Every call site that still hotlinks Wikimedia or Geograph directly must be moved to the CDN. T052 documented the current list (layer cards, region pages, country briefs, country match cards, hero image users, POI thumbnails, city picker map, trip guides, local intel, day drafts and admin content sections). Moving these is out of scope for T053.

2. Row T049-c (T052-a prerequisite): The full derive run must complete for all five layers so that every record has a CDN copy. Today only 124 of 27,748 records on the three main layers have one. This requires R2 credentials and a running CAX11 box on Hetzner (T051 and T054 preconditions).

Once both are true, a new task can remove the six hosts and verify with the harness that no violations result.

The data.carta-europetravel.com host for connect-src awaits T054 (R2 data shards). The comment in _headers describes this plainly and gates the addition on T054 landing.

## Rollback procedure

The CSP amendment is a simple addition, not a removal. To roll back:

```bash
# In vercel.json, in the img-src directive, remove "https://cdn.carta-europetravel.com "
# In public/_headers, do the same.
# In _headers, revert the comment block to the prior text.
# Then commit and redeploy.
```

Or, if the entire branch needs reverting:

```bash
git revert <commit hash of T053 report commit>
git -C continent-app revert 203b334  # the app commit hash
```

---

**The honest state of play.**

This task fulfils its narrow goal (add the CDN host, document the blockers, provide verification) but does not and cannot fulfil the high-level task goal (remove the Wikimedia and Geograph hosts). The preconditions listed in T052 are not met: there is no live CDN, no R2 bucket with image derivatives, no credentials, and a long list of call sites still hotlink the old hosts. Removing those hosts would break production immediately.

What T053 does is what can ship now: it adds the CDN host in advance so that when T052-f is empty and the derives are live, removal is a single CSP edit. It documents why removal is still blocked, instead of leaving future maintainers to discover it by debugging a blank app. And it provides a verification harness that will prove removal is safe when the gate opens.

This is the honest part of the task. It lives in production now, unblocking T054 and the future tasks that depend on it, while firmly gatekeeping removal until the conditions are actually met.

