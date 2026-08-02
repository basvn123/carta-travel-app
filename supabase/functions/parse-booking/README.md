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
files, and `safeFetchUrl` refuses private hosts (SSRF). Error codes mirror
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

## Tests

Pure logic lives in `logic.mjs`, imported by both Deno and
`continent-app/scripts/ai/test_import_logic.mjs` (Node, no network).
