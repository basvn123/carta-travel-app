# P8 digest

5 task reports folded on 2026-11-03 (T1034). Each entry keeps what changed and what broke; the full report, commands, files and rollback are in git under the tag `archive/execution-full-2026-11-03` (command under each entry). Open items live in `Execution/_OPEN.md`.

### T126 Image brief and vision-scoring prompt (2026-10-02)

The image brief now exists in two forms that mirror each other. `docs/IMAGE_BRIEF.md` is the human document: per section, what the hero answers and what the gallery answers, the six hard rejects that already stood, and the two new ones (a signpost or trail marker as the subject, and an image taken more than 2 km from the feature unless it is framed as "seen from"). `pipeline/photos/vision_prompt.py` is the same brief as a scoring prompt for a vision model, with a builder, a parser for the reply, and a small code rule for distance. The one design choice worth knowing is how the 2 km rule is enforced.

Full: `git show archive/execution-full-2026-11-03:"Execution/P8/T126-image-brief.md"`

### Execution Report: T130 (2026-10-02)

Recorded the explicit exclusion of Google Street View as a source for view-direction imagery on Destinations pages. No code or configuration was changed. The decision was documented to prevent future re-proposals and to establish policy reasoning that will guide implementation when synthetic view rendering is built. Google Street View was evaluated for the 17,600 trail cards and 740 mountain cards that require facing-the-right-way photography. The Static API accepts heading, pitch and field-of-view parameters, and the free metadata endpoint is available, but the terms of service prohibit pre-fetching, indexing, storing or caching anything except place and panorama IDs.

Full: `git show archive/execution-full-2026-11-03:"Execution/P8/T130-excluded-imagery-sources.md"`

### Execution Report: T132 (2026-10-02)

Verified that no s2maps.eu cloudless Sentinel-2 tiles or Esri World Imagery are currently in use in the Carta codebase. The map infrastructure uses CartoDB's Voyager basemap style exclusively, which ships CartoDB's own raster tiles. No layer, pipeline stage or app component references the restricted tile sources identified in the licence audit.

Full: `git show archive/execution-full-2026-11-03:"Execution/P8/T132-sentinel-licence-check.md"`

### T142: Embed webcams live, never store the frames (2026-10-03)

The destination page can now show a "Live views" fold with the foto-webcam.eu player inside an iframe. The picture comes from their server to the traveller's browser, so Carta never fetches, stores or caches a frame. The fold reads `dossier.webcams`, an array of `{ provider, id, label, location }`. Today no dossier carries that field, so no page changes. With the field present, only entries with provider `fotowebcam` and a plain id (letters, digits, hyphen, underscore) render. Anything else is skipped, and a page with no usable entry draws nothing. The first version of this task (a Haiku session) embedded three providers on guessed addresses and wrote their terms from memory.

Broke: Guessed embed addresses / The first version never read the provider documentation. `/webcam/{id}/live/1024/` redirects to the camera page, not to a player / Use the documented `/webcam/{id}/?frame=1`; Right edge of the player clipped at 380 px / The player is about 320 px wide, the card 311 px / 8 px bleed each side under 400 px viewport width; Who...

Full: `git show archive/execution-full-2026-11-03:"Execution/P8/T142-webcam-embeds.md"`

### T333: the photo and track upload path, with the legal shape (2026-10-07)

A walker can now open a trail page, choose a photo or a GPX track of that walk, and see on their own device what Carta removes before anything is sent: the place a photo was taken, its camera and date details, and everything within at least 500 m of where a track starts and ends, together with its times, heart rate and device data. They then pick who else may reuse it (Carta only, CC BY 4.0 or CC BY-SA 4.0), say how they want to be credited, tick a separate box if OpenStreetMap may use a track, and tick the licence grant.

Broke: The GPX length assertion failed (3,225 m, expected under 3,000) / The bound was written for the wrong fixture length: 39 steps of about 111 m is 4.3 km before about 1 km is hidden / Bound corrected to 3,000 to 3,500 m; The in-page probe threw `unsupported` / `fetch('/@fs/...')` outside the app root was refused by Vite and returned HTML / The fixtur...

Full: `git show archive/execution-full-2026-11-03:"Execution/P8/T333-upload-path.md"`
