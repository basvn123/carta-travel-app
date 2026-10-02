# T276: Remove the Travelpayouts Drive script and its CSP hosts

## Task ID

T276 (register row T214-b, closed as a decision by T275, executed here)

## Date

2026-10-02

## What changed

The Travelpayouts Drive snippet is gone from continent-app/index.html. The Content-Security-Policy in vercel.json and public/_headers no longer allows emrldtp.com, www.travelpayouts.com or sentry.avs.io, and the script hash that matched the snippet is removed from script-src. No third-party script loads on any page now. The "no consent banner needed" position from T214 is true again. Affiliate links built in src/lib/affiliate.js are untouched: they are plain URLs with a marker and need no script.

Exact deletions in both config files (the same three edits in each CSP line):
- script-src: removed ` 'sha256-X2EKZ8Fy6+4YrR9ibDxyMwvkQEKFMxZEI1ZTK0zUIz0=' https://emrldtp.com`
- img-src: removed ` https://emrldtp.com` (after https://flagcdn.com)
- connect-src: removed ` https://emrldtp.com https://www.travelpayouts.com https://sentry.avs.io`

Nothing else was changed in those files. The data host was not added (owner's stage 5.3 step).

## Files touched

**Modified (app repo, branch p1-remove-travelpayouts):**
- continent-app/index.html (snippet and its comment deleted, 14 lines)
- continent-app/vercel.json (CSP value only)
- continent-app/public/_headers (CSP line only)

**Created (root repo):**
- Execution/P1/T276-remove-travelpayouts-drive.md

**Modified (root repo):**
- Execution/_OPEN.md (T214-b closed by T276, rows T276-a and T276-b)

## Commands run

```
python edit (three string deletions per config file, snippet block removed from index.html)
grep -n -i -E "emrldtp|travelpayouts|avs\.io" index.html vercel.json public/_headers
npm run build
node scripts/verify_csp.mjs --csp "<new vercel.json value>"
playwright load of dist at 380px and 1440px with the new CSP header on 127.0.0.1:5201
rm -rf dist
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Third-party scripts per page | 1 | 0 | -1 |
| Requests to emrldtp.com per page load (T056) | 8 | 0 (measured 0 at 380px and desktop) | -8 |
| Hosts in CSP for Travelpayouts | 3 | 0 | -3 |
| Script hashes in script-src | 1 | 0 | -1 |
| Third-party localStorage keys written | 3 | 0 (only continent.state.v1 present on a fresh load) | -3 |
| CSP violations (verify_csp, 6 pages) | 0 | 0 | 0 |

grep result: no emrldtp, travelpayouts or avs.io in index.html, vercel.json or src/ outside affiliate.js, carriers.js, omio.js and origins.js, which only mention Travelpayouts in comments about affiliate links and old fare tags. public/_headers line 3 is a comment about affiliate links.

## What broke and how it was fixed

No issues. Note: scripts/verify_csp.mjs does not read vercel.json despite its header comment. It holds hard-coded copies of the old CSP, so I ran it with --csp set to the new vercel.json value. Fixing the copies is outside this task (T276-a).

## What is still open

T276-a: update the hard-coded CSP copies in scripts/verify_csp.mjs and the emrldtp entries in verify script noise regexes. T276-b: returning visitors keep three old third-party localStorage keys, inert now; confirm the live header after deploy. T214-c (self-host Google Fonts) is unchanged.

## Rollback procedure

Revert the app commit on branch p1-remove-travelpayouts (git revert), or drop the branch before merge. That restores the snippet, the three hosts and the hash exactly. No data or schema is involved.
