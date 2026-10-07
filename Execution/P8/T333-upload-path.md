# T333: the photo and track upload path, with the legal shape

## Task ID

T333 (register rows T206-b and T068-h; mind-map task T141's legal shape)

## Date

2026-10-07

## What changed

A walker can now open a trail page, choose a photo or a GPX track of that walk, and see on their own device what Carta removes before anything is sent: the place a photo was taken, its camera and date details, and everything within at least 500 m of where a track starts and ends, together with its times, heart rate and device data. They then pick who else may reuse it (Carta only, CC BY 4.0 or CC BY-SA 4.0), say how they want to be credited, tick a separate box if OpenStreetMap may use a track, and tick the licence grant. The Terms of service carry a new section, "Photos and tracks you share", with the grant the destinations spec asks for: worldwide, non-exclusive, royalty-free, perpetual, irrevocable, transferable and sublicensable, a warranty and an indemnity from the uploader, and a promise of credit in place of a moral-rights waiver. What does not exist yet is the server half. Storing an upload needs a table, a private storage bucket and three functions, which is a migration, and this session was allowed none (051 belongs to T365). So a send on a real project answers "The upload did not send and nothing was stored", the same honest failure the guide report form gave before 037 was pasted. The migration is designed below and carried by row T333-a. Before this task there was no upload path at all (T206 report, "Upload paths with a licence choice: 0"); after it there is one, complete on the device and in the Terms, and inert on the server.

## How it works

### The privacy pass happens on the device

`src/lib/stripImageMeta.js` walks a JPEG or PNG file's own structure and copies only the parts that draw the picture. For a JPEG it keeps the start marker, the JFIF block, the ICC colour profile, Adobe's colour flag, the tables, the frame, the scans and the end marker, and drops EXIF and XMP (APP1), IPTC (APP13), every other APPn block (the MPF thumbnails phones write, maker blocks), comments, and anything after the end marker, which is where some phones append a second full image with its own EXIF. For a PNG it drops the text, EXIF and time chunks and anything after IEND. It reads the EXIF block far enough to say whether it had a GPS directory, so the form can say "the place this photo was taken is removed" only when that is true. A file it cannot walk is refused with `corrupt` or `unsupported`, never passed through.

The form does more than strip. `preparePhoto` in `src/community/uploads.js` decodes the photo with `createImageBitmap(file, { imageOrientation: 'from-image' })`, draws it on a canvas at most 2,560 pixels on the long side, and encodes a JPEG at quality 0.86. The orientation step matters because the EXIF orientation flag goes with everything else; without it a portrait photo would arrive on its side. A canvas never writes EXIF, but the result is stripped again anyway and the send is refused (`not_clean`) unless a second pass finds nothing. A photo under 800 pixels on its long side is refused as too small for a page. In the browser check, the test photo (EXIF with GPS, camera make and model, a date and a comment naming its owner) went in at 53,225 bytes carrying two metadata blocks and came out at 28,325 bytes carrying none, with no trace of "Exif", the camera name or the owner's name in the bytes.

`src/lib/gpxPrivacy.js` reads only the geometry of a GPX file (latitude, longitude, elevation, from track segments and routes) and writes a new file from that alone, so nothing it did not read can ride along: no times, no extensions (heart rate is health data), no waypoints, no names, no metadata block with the owner's name and email. Then it hides a circle around the first point and a circle around the last. Every point inside either circle is dropped wherever it falls, so a loop that passes the front door again in the middle is hidden there too, and the track is split at each gap so no straight line is drawn across a hidden circle. The radius is 500 m plus a random extra of up to 250 m, drawn once per upload. A fixed radius lets anyone find the centre from the shape of the gap across several uploads; a radius that differs each time does not. Both figures are this task's choice, not a published standard, and are named `PRIVACY_RADIUS_M` and `PRIVACY_JITTER_M`. A track that is wholly inside the circles is refused (`too_short`).

Both modules are plain ES modules with no imports, so they run unchanged in node (the tests), in the browser (the form) and in Deno, which is where the server half should run them again (see the migration design).

### The form

`src/community/UploadForm.jsx` is one secondary button, "Add a photo or track", inside "Where this comes from" on the trail page, the fold that already names every photo's source, because an upload is one more source. It opens a modal dialog, portalled to the body, with the scrim carta-design asks for (`--ink` at 28 percent, the page behind takes no clicks) and its own focus trap on top of the trail page's: focus moves to the close button, Tab stays inside, Escape closes the dialog and not the page, and focus returns to the door. Inside the dialog the send button is the one filled button in view.

The form follows the order of what the uploader decides: photo or track, the file (prepared at once, with a status line saying what was removed), who may reuse it, how to credit them, the OpenStreetMap tick for a track, and last the grant, so it is read after the choices it covers. The OpenStreetMap tick uses the owner's wording from block A of the owner runbook (T362), "OpenStreetMap may use this track under its contributor terms", with a line under it saying it is separate from the licence and that an unticked track stays out of OpenStreetMap. It appears only for a track. The grant reads "This is my own work or I have the right to share it, and I give Carta the licence set out in the terms of service", with a link to `?legal=terms` beside it. The photo hint says a photo in which someone can be recognised needs their consent, which is the warranty's third leg. Credit is required (2 to 80 characters) and is filled with the account's own name when the dialog opens empty.

Signed out, the dialog says that sharing needs an account, so Carta can credit the uploader and reach them about the upload, and offers nothing else. The warranty and the indemnity need somebody to give them. The form does not open the sign-in sheet itself, because App owns that modal and the paywall hook's comment explains why a second door into it is unwelcome.

`submitUpload` checks the same things the server will (`uploadProblem`), then calls `begin_upload`, uploads the blob to the private bucket `user-uploads` at the path it is given, and calls `finish_upload`. Every record carries `UPLOAD_TERMS_VERSION` and, for a ticked track, `OSM_TICK_VERSION`, both `2026-10-07`, so it is known which wording each grant was given under. A `?uploadmock` seam (compiled out of production, like `?guidesmock`) stands in for the session and the server so the form can be checked headlessly.

### The Terms

The new section sits between "Availability and changes" and "Liability". It says a person checks every upload, and that a decline or removal on the ground of illegality or the terms comes with the reasons and a way to ask again (the DSA statement of reasons and complaint route of T070). It grants the licence in the words above and says plainly what transferable and sublicensable mean. It promises removal on request or on account deletion, and explains that the licence is irrevocable so that what was rightly done under it before then stays lawful. It promises credit by the name given and says that nothing asks the uploader to give up moral rights, because a waiver is void in France, Germany, Spain and Italy. It describes the three-way choice and that a Creative Commons licence is granted to everyone and cannot be withdrawn for copies already made. It describes the OpenStreetMap box. It carries the warranty and an indemnity limited to "as far as the law allows this to be asked of a consumer", and the privacy pass and the report route. The "Last updated" date moved from 3 to 7 October 2026. The section's header comment marks the OpenStreetMap paragraph and the indemnity for the owner's legal review.

### The server half, designed

This is the migration row T333-a carries. It needs a new number after 051 and a paste by the owner.

A table `public.user_uploads`: `id` uuid, `owner` uuid references `auth.users` on delete cascade, `kind` ('photo' or 'track'), `layer` ('trail', 'beach', 'lake', 'mountain', 'cycle'), `item_id` text, `storage_path` text unique (`{owner}/{id}.jpg` or `.gpx`), `bytes`, `licence` ('platform', 'cc-by-4.0', 'cc-by-sa-4.0'), `credit` (2 to 80 characters), `osm_permission` boolean (null for a photo, checked), `osm_wording` and `terms_version` text, `granted_at`, `status` ('reserved', 'pending', 'published', 'declined', 'removed'), and the decision fields T070 uses for guides (who, when, the ground, the statement of reasons). RLS on; the owner may read their own rows; no client write policy at all.

A private storage bucket `user-uploads` with a 25 MB file limit and the three types the form sends (`image/jpeg`, `image/png`, `application/gpx+xml`). Its storage policies: insert only into the caller's own folder and only at the path of one of their own reserved rows; read for the owner, for an admin, and for anyone when the matching row is published, so the page can ask for a signed URL of a published upload without the bucket ever being public.

`begin_upload(...)` (security definer, empty search_path, authenticated only) answers `not_signed_in`, `bad_target`, `bad_licence`, `bad_credit` or `no_grant` (a terms version other than the current one counts as no grant), applies a daily limit per account under an advisory lock the way 037 does (`too_many`), writes a reserved row and answers `{ id, path }`. `finish_upload(id)` checks the caller owns the row and that the object exists, records its size and sets the row to pending. Reserved rows with no object after a day are swept.

The client pass can be bypassed by anybody who calls the storage API directly, so the server must not trust it. Before a row reaches the review queue, an Edge Function (Deno, never the Claude API) downloads the object and runs the same two modules on it: a photo that `isMetadataFree` rejects is stripped again and rewritten; a track is passed through `trimGpx` again, which cannot know where the first upload's circles were but does guarantee that the stored file carries geometry only and is hidden at its own ends.

Notice and action for uploads (the upload half of T068-h): `content_reports` gains `target_kind` ('guide', 'upload', 'byline') and `target_id`, with `plan_id` made nullable, and a `report_content(p_kind, p_target_id, p_reason, p_contact_email)` beside `report_guide` with the same validation, buckets and words. The admin side is `admin_decide_upload(id, action, ground, statement)` behind `admin_guard('write')`, writing the statement of reasons the way T070 does for guides, and a Reviews list in the admin page. Account deletion has to remove the folder `{uid}/` from the bucket in the same path that deletes the account. The down block drops the functions, the storage policies and the table, and empties and drops the bucket, in that order.

## Files touched

All paths from the repo root. App files are committed in the app repo (`continent-app/`).

**Created:**
- `continent-app/src/lib/stripImageMeta.js`
- `continent-app/src/lib/gpxPrivacy.js`
- `continent-app/src/community/uploads.js`
- `continent-app/src/community/UploadForm.jsx`
- `continent-app/src/styles/40-upload.css`
- `continent-app/tests/uploadPrivacy.test.mjs`
- `Execution/P8/T333-upload-path.md`

**Modified:**
- `continent-app/src/browse/TrailPage.jsx` (one import, the door in the sources slot)
- `continent-app/src/components/TermsOfService.jsx` (the new section, the date)
- `continent-app/src/styles.css` (one `@import` at the end of the list)
- `continent-app/src/i18n/en.js`, `de.js`, `es.js`, `fr.js`, `it.js`, `nl.js` (45 `upload.*` keys each, after `trails.kml`)
- `Execution/_OPEN.md` (rows T333-a to T333-f)

No migration, no data, no package dependency.

## Commands run

```
# app worktree C:\Users\Gebruiker\Documents\Portfolio\wt\T333-app, branch p8-upload-path
node --test tests/uploadPrivacy.test.mjs
python ../T333-shots/i18n_upload.py            # inserts the 45 keys, CRLF and BOM kept
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
npm run lint
npm test
node scripts/ci/design-lint.mjs
npm run build                                   # then dist/ and dist-data/ deleted
npx vite --config ../T333-shots/vite.t333.mjs   # port 5216, own cacheDir, stopped after the check
node ../T333-shots/shots.mjs                    # 380 px and 1280 px, screenshots in wt/T333-shots/
```

The helper scripts, the Vite config, the two fixtures (a 1600 by 1200 JPEG with GPS, camera and comment written by Pillow, and a 60-point GPX with times, heart rate, a home waypoint and an author) and the screenshots are in `C:\Users\Gebruiker\Documents\Portfolio\wt\T333-shots\`, outside both repositories.

## Config and secrets set

None. The `?uploadmock` seam is on only where `E2E_SEAMS` is (dev, or a build with `VITE_E2E_SEAMS=1`).

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Upload paths with a licence choice | 0 (T206 report) | 1 on the device; stores nothing until T333-a | +1 |
| Public licence choices offered to an uploader | 0 | 3 (Carta only, CC BY 4.0, CC BY-SA 4.0) | +3 |
| Terms grant words "transferable" and "sublicensable" (the "Your content" section granted store, process and display only) | absent | present | |
| Metadata blocks in the node JPEG fixture | 6 (EXIF with GPS, XMP, MPF, IPTC, comment, trailer) | 0 | -6 |
| Metadata blocks in the browser test photo, canvas path | 2 (EXIF with GPS, comment) | 0 | -2 |
| Bytes of the browser test photo | 53,225 | 28,325 | -24,900 |
| Points within 500 m of the start or end, GPX fixture (radius pinned at 500 m) | 12 of 60 | 0 of 48 | -12 |
| Times, extensions, waypoints, author in the GPX fixture | present | absent | |
| `npm test` | 259 passing | 270 passing, 0 failing | +11 |
| Keys per i18n catalogue | | +45 in each of six | +270 |
| Headless checks (shots.mjs, 380 px and 1280 px, signed in by seam and signed out) | | 61 of 61 | |
| `npm run lint` errors | 0 | 0 | 0 |
| design-lint new violations | 0 | 0 (196 in the baseline, 196 found) | 0 |

The before count for `npm test` is the after count less the eleven new tests in `uploadPrivacy.test.mjs`.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The GPX length assertion failed (3,225 m, expected under 3,000) | The bound was written for the wrong fixture length: 39 steps of about 111 m is 4.3 km before about 1 km is hidden | Bound corrected to 3,000 to 3,500 m |
| The in-page probe threw `unsupported` | `fetch('/@fs/...')` outside the app root was refused by Vite and returned HTML | The fixture bytes are passed into the page as base64 instead |
| "Send without the grant" showed the credit sentence | The form checks the credit before the grant, and the signed-in seam has no account name to fill it | The harness now checks both refusals in order; the form's order is kept |
| Clearing the credit field refilled it with the account name | The prefill was an effect on the credit value | The name is now filled once, when the dialog opens with the field empty |

## Carta-design: the seven questions

1. No hex value outside `:root`: `40-upload.css` uses tokens only, and the scrim is `color-mix(in srgb, var(--ink) 28%, transparent)`.
2. No gradient, no colour outside `DESIGN.md`, no second saturated hue. `--accent` appears on the send button and the focus rings, `--accent-bg` behind the error line.
3. No ochre, teal or `--danger` anywhere in the diff. `--status-success` colours the tick icon of the sent state and no text.
4. No mono at all. The figures in the status lines (sizes, metres, point counts) sit inside sentences, so they are `--ui` under the mono rule.
5. One primary in view. Closed, the door is a secondary. Open, the dialog's scrim covers the trail page, and its send button is the only filled button; Cancel and Close are secondaries.
6. The dialog title carries a verb ("Share a photo or track of this walk"), the door and the buttons are verb first ("Add a photo or track", "Send for review"). No em dash, no middot, no banned word in the diff or this report; design-lint found no new violation.
7. The candidate was the upload icon on the door. It stays, because the door sits among lines of credit text inside a fold and the icon is what marks it as an action there. The photo preview was the second candidate and stays too: it is the only confirmation that the right photo was picked. Nothing was removed, and no decoration was added beyond those two.

## What is still open

Uploads cannot be stored until the migration designed above exists: the table, the private bucket and its policies, `begin_upload`, `finish_upload`, the Edge Function that re-runs the privacy pass on the server, `report_content` with the target columns on `content_reports`, `admin_decide_upload` with its statement of reasons, the folder removal on account deletion, and the sweep of reserved rows. It needs the next free migration number after 051 and the owner's paste. Row T206-b stays open until it lands, because uploads do not work end to end yet; everything else that row lists (the grant, the attribution commitment, EXIF stripping, GPX trimming and the three-way choice) is built here. T333-a.

The owner decided the shape of the OpenStreetMap permission (T362, block A), and the wording still has to be checked by a lawyer against the OSMF waiver template before launch (owner step J4). The same review should read the new Terms section, above all the indemnity asked of a consumer, which Belgian consumer law may treat as unfair, and the pairing of "irrevocable" with the promise to remove on request. If the OSM sentence changes, `OSM_TICK_VERSION` in `uploads.js` changes with it; if the Terms section changes, `UPLOAD_TERMS_VERSION` does. This is the T206-c question answered in shape and not yet in wording. T333-b, before T333-a goes live.

Once the migration exists, the app needs the other half: published uploads shown on the trail page with their credit and licence, the report door on each one (the upload half of T068-h, through `report_content`), and the review list in the admin page that approves or declines with a statement of reasons. T333-c, after T333-a.

The door is on the trail page only. The beach, lake, mountain and cycling pages and the honest stub page T124 is building ("upload a GPX" in destinations spec 6.5) should mount the same `UploadForm` with their own `layer`. T333-d.

The privacy policy (`PrivacyPolicy.jsx`, outside this task's scope) does not mention uploads: what an upload record holds, that the device strips the file first, how long declined uploads are kept, and that a Creative Commons copy made by someone else survives removal from Carta. It needs a paragraph, read by the same J4 review. T333-e.

The Terms promise account holders 30 days' notice by email before a change takes effect. The upload section is such a change, so the notice has to go out at least 30 days before uploads go live, which needs the email route of owner step J6. T333-f.

Row T068-h stays open too. Its upload half is designed here and built by T333-a and T333-c; its other half, a notice path for the author byline in the guides gallery, is untouched, and nothing in this task's scope reaches it.

## Rollback procedure

Nothing was deployed and no migration was written, so rollback is git only. The app commit is 19db095 on `p8-upload-path`; the root commit carries this report and the register rows. Before merge, drop branch `p8-upload-path` in both repositories. After merge:

```
git -C continent-app revert 19db095
git revert <root report commit>
```

The app revert removes the door, the dialog, the two privacy modules, the stylesheet, the test file, the 45 keys in each catalogue and the Terms section together. Nothing else imports any of them. Reverting the Terms section alone is safe, but then the form's grant tick points at a section that no longer exists, so revert both together.
