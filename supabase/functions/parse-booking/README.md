# parse-booking

The "magic import" reader: a signed-in traveller drops booking confirmations
(PDF, photo, plain text) on a planned trip, and this function extracts two
structured lists with one Gemini call:

- `bookings`: confirmation code, total paid (EUR), printed manage-booking
  link, per reservation, which the client folds into the trip's booking rows.
- `activities`: plannable items from itineraries or guides, which land in the
  Activity Inbox for one-tap assignment to a trip day.

## Shape

```
POST /functions/v1/parse-booking      (user JWT required)
{
  files: [{ mime, data (base64), name }],   // pdf / png / jpeg / webp / txt
  text: "pasted confirmation text",          // optional
  url: "https://a-blog.example/salzburg",    // optional; any one input suffices
  context: { stops: [{ city, country, arrive, nights }], groupSize },
  lang: 'en'
}
-> { summary, bookings: [...], activities: [...], meta, pass }
-> { code: 'nothing_found', summary }        // documents held no trip facts
```

A `url` is fetched server-side BEFORE quota is spent (an unreachable link
fails free): HTML is stripped to text, a direct PDF link joins the document
files. SSRF guard: `safeFetchUrl` refuses private hosts by name, and
`fetchGuard.mjs` resolves every hop (A and AAAA, via `Deno.resolveDns`),
refuses any non-public address, and follows at most 3 redirects by hand,
re-checking each Location (T1211). fetch still does its own DNS lookup
after the check, a small rebinding window Deno cannot pin. Error codes mirror
plan-day: `auth`, `user_cap`, `global_cap`, `no_ai`, `nothing_to_parse`,
`url_unreachable`, `url_too_big`, `url_empty`, `ai_timeout`, `ai_error`,
`ai_bad_output`.

## Quota and cache

One import spends one unit of the same `plan` allowance a bot day costs
(`ai_consume` kind `'plan'`, migration 007): same magnitude of AI work, no
new migration, no second cap to tune. Failures refund. No grounding, ever:
the uploaded documents are the ground.

The response is cached in the shared `ai_plan_cache` table but read with a
**24 hour** validity (plan-day uses 7 days): the payload carries booking
codes from personal documents, so the cache stays a free retry after a
network blip rather than long-term storage of personal data. The prompt
additionally forbids traveller names, emails, phone numbers and addresses
in the output, and `sanitizeParsed` drops constructed URLs.

## Deploy

```
supabase functions deploy parse-booking
```

Secrets are project-wide and already set for plan-day (`GEMINI_API_KEY`,
optionally `GEMINI_MODEL` / `GEMINI_MODELS`, `AI_GLOBAL_DAILY_CAP`). No
migration needed. Probe without spending quota: POST with only the anon key;
`{"code":"no_ai"}` means the secret is missing, `{"code":"auth"}` means the
function is live (the key check precedes the auth check). Use curl.exe, not
Invoke-RestMethod, to see the body.

Optional gateway settings (T1137, `_shared/aiModels.mjs`), unset by default:
`AI_PARSE_BOOKING_PROVIDER` (`gemini`, `workers-ai` or `openai`),
`AI_PARSE_BOOKING_MODELS` (comma separated chain, max 6) and
`AI_PARSE_BOOKING_BASE_URL` (provider `openai` only, falling back to
`AI_OPENAI_BASE_URL`); the keys `AI_OPENAI_API_KEY` (provider `openai`) and
`CF_ACCOUNT_ID` with `CF_AI_TOKEN` (provider `workers-ai`); and
`AI_TRACE_LANGFUSE=on` with `LANGFUSE_HOST`, `LANGFUSE_PUBLIC_KEY` and
`LANGFUSE_SECRET_KEY` for the metadata only trace export (T1139). A provider
or model switch changes which model reads travellers' bookings: the owner's
call, with an eval run (`docs/ai/model-strategy.md`). The keys are listed in
`docs/security/SECRETS.md`.

## Place linking (T1215, not wired yet)

`logic.mjs` has `linkBookingPlaces(bookings, context, linking)`: each
booking gets a `placeId` from the shared place linker
(`continent-app/src/lib/linking/linker.js`), with the trip stops' countries
as context, or `null` when nothing links with confidence or `linking` is
null. `index.ts` does not call it yet: that needs the owner to choose how
the function loads the linker code (a relative import from `continent-app/`,
or a copy under `_shared/`) and its alias data (`search_index.json` and
`search/ask/lexicon.json`, about 315 KB, fetched once per cold start; the
16 MB `app_data.json` is not needed). Tests: `continent-app/tests/placeLinking.test.mjs`.

## Tests

Pure logic lives in `logic.mjs`, imported by both Deno and
`continent-app/scripts/ai/test_import_logic.mjs` (Node, no network).
