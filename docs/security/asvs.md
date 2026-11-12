# ASVS 5.0.0 Level 2 checklist

ROADMAP C10, task T1164 (2026-11-07). Every OWASP ASVS 5.0.0 requirement in force at Level 2 (253: the 70 Level 1 and 183 Level 2 ones), walked against the code on branch `p15-round2` and marked **Met**, **N/A** or **Gap**. Every gap names its register row in `docs/owner/`.

Why 5.0.0 at L2: 5.0.0 (May 2025) is the current OWASP release, and its chapters on self-contained tokens (V9) and OAuth (V10) fit Supabase JWT auth better than 4.0.3. Level 2 is the level ROADMAP C10 and research item C-R2 name for an app that holds accounts and payments. The research is in `T1164`.

How to read a row: "Met" cites the control and, where one exists, the test that proves it. "Met" on a platform control (Supabase Auth, Cloudflare) means Carta relies on the platform and does not override it; where the platform value is a Dashboard setting nobody has verified, the row is a Gap instead. Requirement text is shortened to its first sentence; the full text is in the OWASP CSV (CC BY-SA 4.0): https://github.com/OWASP/ASVS/tree/master/5.0. Cite a row as `v5.0.0-V6.2.1`.

## Summary

| | Count |
|---|---|
| Met | 169 |
| N/A | 45 |
| Gap | 39 |
| Total | 253 |

| Chapter | Met | N/A | Gap |
|---|---|---|---|
| V1 Encoding and Sanitization | 17 | 10 | 0 |
| V2 Validation and Business Logic | 10 | 0 | 1 |
| V3 Web Frontend Security | 15 | 4 | 0 |
| V4 API and Web Service | 4 | 4 | 2 |
| V5 File Handling | 8 | 1 | 0 |
| V6 Authentication | 21 | 2 | 12 |
| V7 Session Management | 14 | 0 | 4 |
| V8 Authorization | 6 | 1 | 0 |
| V9 Self-contained Tokens | 6 | 1 | 0 |
| V10 OAuth and OIDC | 9 | 14 | 6 |
| V11 Cryptography | 13 | 0 | 1 |
| V12 Secure Communication | 8 | 1 | 0 |
| V13 Configuration | 8 | 0 | 5 |
| V14 Data Protection | 8 | 0 | 1 |
| V15 Secure Coding and Architecture | 12 | 0 | 1 |
| V16 Security Logging and Error Handling | 10 | 0 | 6 |
| V17 WebRTC | 0 | 7 | 0 |

Gaps by register row (the reasoning is in the T1164 report; rows not starting T1164 were already open):

| Row | Requirements |
|---|---|
| T1059-c | V11.1.1, V13.3.1 |
| T1071-a | V6.2.1, V6.2.3, V6.2.4, V6.2.12, V6.3.1, V6.6.3, V10.4.5 |
| T1071-c | V2.4.1, V6.3.1 |
| T1079-a | V2.4.1 |
| T1080-b | V15.2.1 |
| T1080-d | V15.2.1 |
| T1118-b | V14.2.4 |
| T1120-d | V16.3.4 |
| T1157-a | V2.4.1 |
| T1164-c | V13.2.2, V13.3.2 |
| T1164-f | V6.2.11 (partial, client side only), V6.3.3 (V6.1.2, V6.2.5 met 2026-11-12) |
| T1164-g | V6.6.2, V10.1.2, V10.2.1, V10.4.4, V10.4.6 |
| T1164-i | V16.2.1, V16.3.1, V16.3.2, V16.3.3, V16.4.3 |
| T1164-j | V6.5.5, V7.1.1, V7.3.1, V7.3.2, V7.5.2, V10.4.8 |
| T1164-m | closed by T1211 (V1.3.6, V15.3.2 met) |
| T1164-n | V4.3.1, V4.3.2 |
| T1211-a | V13.2.4, V13.2.5 |

Row T1164-h (the documents ASVS L2 expects) was closed by T1211 on 2026-11-07: `crypto-inventory.md`, `session-policy.md`, `data-classification.md`, `dependency-remediation.md`, `resource-heavy-features.md` and `log-inventory.md`. Seven of its nine requirements are now Met because the requirement is the document; V7.1.1 stays a Gap under T1164-j and V11.1.1 under T1059-c.

Re-walk this list when a chapter's code changes (new auth path, new upload type, new function), and in full before ROADMAP C11 (the external check). The auth tests behind many rows run in `npm test` (`continent-app/tests/edgeAuth.test.mjs`, `pagesAuth.test.mjs`); the header rows are checked by the ZAP baseline (`.github/workflows/zap.yml`).

## V1 Encoding and Sanitization

| ID | L | Requirement | Status | Evidence |
|---|---|---|---|---|
| V1.1.1 | 2 | Input is decoded or unescaped into a canonical form only once, it is only decoded when encoded data in that form is expected, and that this is done before pr... | Met | Query strings decoded once by URLSearchParams, bodies by one JSON.parse (`readJson`); validators in `functions/_lib/guard.js` refuse padded or encoded tricks (`functionGuards.test.mjs`). |
| V1.1.2 | 2 | The application performs output encoding and escaping either as a final step before being used by the interpreter for which it is intended or by the interpre... | Met | React escapes at render; JSON answers are built with JSON.stringify; SQL goes through PostgREST parameters. |
| V1.2.1 | 1 | Output encoding for an HTTP response, HTML document, or XML document is relevant for the context required, such as encoding the relevant characters for HTML... | Met | React JSX escaping everywhere; harvested text is rendered as text, never markup (`src/lib/journeys.js` note); CSP `script-src 'self'` as a backstop. |
| V1.2.2 | 1 | When dynamically building URLs, untrusted data is encoded according to its context (e.g., URL encoding or base64url encoding for query or path parameters). | Met | URLs built with URLSearchParams or fixed templates over validated values (`unsubUrl` in `notify/logic.mjs`, flights and forecast after `guard.js`). |
| V1.2.3 | 1 | Output encoding or escaping is used when dynamically building JavaScript content (including JSON), to avoid changing the message or document structure (to av... | Met | JSON only through JSON.stringify; no inline script (CSP has no `unsafe-inline` for scripts). |
| V1.2.4 | 1 | Data selection or database queries (e.g., SQL, HQL, NoSQL, Cypher) use parameterized queries, ORMs, entity frameworks, or are otherwise protected from SQL In... | Met | App, Edge and Pages code reach Postgres only through supabase-js / PostgREST parameters and plpgsql arguments. The 8 f-string SQL calls are local pipeline code on trusted input (row T1119-a). |
| V1.2.5 | 1 | The application protects against OS command injection and that operating system calls use parameterized OS queries or use contextual command line output enco... | Met | No OS command takes request input in the app, Edge or Pages Functions; Semgrep rules in `.semgrep/carta.yml` (T1119). |
| V1.2.6 | 2 | The application protects against LDAP injection vulnerabilities, or that specific security controls to prevent LDAP injection have been implemented. | N/A | No LDAP. |
| V1.2.7 | 2 | The application is protected against XPath injection attacks by using query parameterization or precompiled queries. | N/A | No XPath. |
| V1.2.8 | 2 | LaTeX processors are configured securely (such as not using the "--shell-escape" flag) and an allowlist of commands is used to prevent LaTeX injection attacks. | N/A | No LaTeX. |
| V1.2.9 | 2 | The application escapes special characters in regular expressions (typically using a backslash) to prevent them from being misinterpreted as metacharacters. | Met | Regexes built at runtime use constants or escape their input (`src/lib/ask/verify.js` escapes watch words; `gpxPrivacy.js` builds from fixed tag names). |
| V1.3.1 | 1 | All untrusted HTML input from WYSIWYG editors or similar is sanitized using a well-known and secure HTML sanitization library or framework feature. | N/A | No rich-text or HTML input anywhere; user text is plain text. |
| V1.3.2 | 1 | The application avoids the use of eval() or other dynamic code execution features such as Spring Expression Language (SpEL). | Met | No eval or new Function in `src` or `functions`; CSP allows only `wasm-unsafe-eval` (for WebAssembly), not `unsafe-eval`. |
| V1.3.3 | 2 | Data being passed to a potentially dangerous context is sanitized beforehand to enforce safety measures, such as only allowing characters which are safe for... | Met | Model input is scrubbed and fenced by the AI guard (`_shared/aiGuard.mjs`, T1117) before it reaches Gemini; suggest-city is the exception (row T1117-c). |
| V1.3.4 | 2 | User-supplied Scalable Vector Graphics (SVG) scriptable content is validated or sanitized to contain only tags and attributes (such as draw graphics) that ar... | Met | Uploads accept only image/jpeg, image/png and application/gpx+xml (bucket `allowed_mime_types`, migration 061); no SVG. |
| V1.3.5 | 2 | The application sanitizes or disables user-supplied scriptable or expression template language content, such as Markdown, CSS or XSL stylesheets, BBCode, or... | Met | No traveller-supplied Markdown, CSS or template is rendered; the Markdown libraries are used only in admin views over internal data. |
| V1.3.6 | 2 | The application protects against Server-side Request Forgery (SSRF) attacks, by validating untrusted data against an allowlist of protocols, domains, paths a... | Met (T1211) | parse-booking checks every hop of a user-given URL by name and by resolved address (A and AAAA; refused if any address is non-public or nothing resolves) in `parse-booking/fetchGuard.mjs`; `continent-app/tests/parseBookingSsrf.test.mjs`. Residual: fetch does its own DNS lookup after the check (TOCTOU), see T1211-a. |
| V1.3.7 | 2 | The application protects against template injection attacks by not allowing templates to be built based on untrusted input. | Met | Prompts are fixed templates with fenced data (`prompt.mjs`, `aiGuard`); no server-side template engine takes user input. |
| V1.3.8 | 2 | The application appropriately sanitizes untrusted input before use in Java Naming and Directory Interface (JNDI) queries and that JNDI is configured securely... | N/A | No JNDI. |
| V1.3.9 | 2 | The application sanitizes content before it is sent to memcache to prevent injection attacks. | N/A | No memcache. |
| V1.3.10 | 2 | Format strings which might resolve in an unexpected or malicious way when used are sanitized before being processed. | N/A | No printf-style format strings take user input (JS template literals only). |
| V1.3.11 | 2 | The application sanitizes user input before passing to mail systems to protect against SMTP or IMAP injection. | Met | Mail goes through the Resend JSON API; the recipient is the signed-in user email from Supabase Auth, never a header built from input (`notify`, `waitlist`). |
| V1.4.1 | 2 | The application uses memory-safe string, safer memory copy and pointer arithmetic to detect or prevent stack, buffer, or heap overflows. | N/A | Memory-safe languages only (JS, Python, SQL); no native code of ours. |
| V1.4.2 | 2 | Sign, range, and input validation techniques are used to prevent integer overflows. | N/A | As V1.4.1; numeric inputs are range checked anyway (`parseForecastQuery`, `MAX_AHEAD_DAYS`). |
| V1.4.3 | 2 | Dynamically allocated memory and resources are released, and that references or pointers to freed memory are removed or set to null to prevent dangling point... | N/A | As V1.4.1. |
| V1.5.1 | 1 | The application configures XML parsers to use a restrictive configuration and that unsafe features such as resolving external entities are disabled to preven... | Met | The only XML is GPX, parsed by regex in `gpxPrivacy.js` and by the browser DOMParser, neither of which resolves external entities. |
| V1.5.2 | 2 | Deserialization of untrusted data enforces safe input handling, such as using an allowlist of object types or restricting client-defined object types, to pre... | Met | Untrusted data is deserialized only with JSON.parse; no typed or native deserialization of request data. |

## V2 Validation and Business Logic

| ID | L | Requirement | Status | Evidence |
|---|---|---|---|---|
| V2.1.1 | 1 | The application's documentation defines input validation rules for how to check the validity of data items against an expected structure. | Met | Validation rules live in `functions/_lib/guard.js` and each Edge Function (whitelist blocks), described in the threat model sections 2 and 6 and in the HANDBOOK. |
| V2.1.2 | 2 | The application's documentation defines how to validate the logical and contextual consistency of combined data items, such as checking that suburb and ZIP c... | Met | Combined checks are written down with the validators: origin differs from destination, date inside the search window, tier and price must agree (`pass_can_buy`). |
| V2.1.3 | 2 | Expectations for business logic limits and validations are documented, including both per-user and globally across the application. | Met | Limits documented per user and globally: AI quotas and `AI_GLOBAL_DAILY_CAP` (HANDBOOK plan-day), rate limits (T1157), upload reservations (061), admin rate budget (051). |
| V2.2.1 | 1 | Input is validated to enforce business or functional expectations for that input. | Met | Positive validation: IATA regex, decimal lat and lon, real calendar dates, tier allow-lists, plan-day "whitelist everything" block. |
| V2.2.2 | 1 | The application is designed to enforce input validation at a trusted service layer. | Met | Every rule is enforced server-side: Pages Functions, Edge Functions and Postgres (RLS, RPC checks); client checks are convenience. |
| V2.2.3 | 2 | The application ensures that combinations of related data items are reasonable according to the pre-defined rules. | Met | As V2.1.2 (`parseFlightQuery` refuses the same airport; checkout asks `pass_can_buy` before Stripe). |
| V2.3.1 | 1 | The application will only process business logic flows for the same user in the expected sequential step order and without skipping steps. | Met | A pass is granted only by a signed Stripe event after checkout; an upload must be reserved (`begin_upload`) before a file is accepted and finished. |
| V2.3.2 | 2 | Business logic limits are implemented per the application's documentation to avoid business logic flaws being exploited. | Met | Quotas per tier (`ai_consume`), global caps, 20 upload reservations a day, admin budgets, enforced in Postgres. |
| V2.3.3 | 2 | Transactions are being used at the business logic level such that either a business logic operation succeeds in its entirety or it is rolled back to the prev... | Met | Grants and quota spends are single RPC transactions; failed AI calls refund the unit (HANDBOOK plan-day step 11). |
| V2.3.4 | 2 | Business logic level locking mechanisms are used to ensure that limited quantity resources (such as theater seats or delivery slots) cannot be double-booked... | Met | Grants are idempotent on session and invoice id (007, 053); uploads take an advisory lock on the overall cap (061). |
| V2.4.1 | 2 | Anti-automation controls are in place to protect against excessive calls to application functions that could lead to data exfiltration, garbage-data creation... | Gap (T1157-a, T1079-a, T1071-c) | Per-address limits exist (`guard.js`, T1157) but the durable bindings are not created yet and sign-up has no CAPTCHA. |

## V3 Web Frontend Security

| ID | L | Requirement | Status | Evidence |
|---|---|---|---|---|
| V3.2.1 | 1 | Security controls are in place to prevent browsers from rendering content or functionality in HTTP responses in an incorrect context (e.g., when an API, a us... | Met | `X-Content-Type-Options: nosniff` on every static answer and every API answer, JSON with an explicit Content-Type (`securityHeaders.test.mjs`, `functionGuards.test.mjs`). |
| V3.2.2 | 1 | Content intended to be displayed as text, rather than rendered as HTML, is handled using safe rendering functions (such as createTextNode or textContent) to... | Met | React renders text nodes; `journeys.js` avoids innerHTML for harvested text; the 11 innerHTML uses Semgrep found are constant SVG or escaped markup (T1119 baseline). |
| V3.3.1 | 1 | Cookies have the 'Secure' attribute set, and if the '\__Host-' prefix is not used for the cookie name, the '__Secure-' prefix must be used for the cookie name. | N/A | Carta sets no cookies: the Supabase session lives in browser storage and travels as a bearer header. |
| V3.3.2 | 2 | Each cookie's 'SameSite' attribute value is set according to the purpose of the cookie, to limit exposure to user interface redress attacks and browser-based... | N/A | As V3.3.1. |
| V3.3.3 | 2 | Cookies have the '__Host-' prefix for the cookie name unless they are explicitly designed to be shared with other hosts. | N/A | As V3.3.1. |
| V3.3.4 | 2 | If the value of a cookie is not meant to be accessible to client-side scripts (such as a session token), the cookie must have the 'HttpOnly' attribute set an... | N/A | As V3.3.1 (the storage choice is covered at V14.3.3). |
| V3.4.1 | 1 | A Strict-Transport-Security header field is included on all responses to enforce an HTTP Strict Transport Security (HSTS) policy. | Met | HSTS two years, includeSubDomains, preload on every static answer (`public/_headers`, seen in the T1164 ZAP run, pinned by `securityHeaders.test.mjs`). |
| V3.4.2 | 1 | The Cross-Origin Resource Sharing (CORS) Access-Control-Allow-Origin header field is a fixed value by the application, or if the Origin HTTP request header f... | Met | Edge Functions echo only app origins (`withCors`, T1079); Pages' default `Access-Control-Allow-Origin: *` on static answers is detached in `public/_headers` (T1211, checked on a local `wrangler pages dev`, to confirm on the preview with the ZAP preview job, T1164-a). |
| V3.4.3 | 2 | HTTP responses include a Content-Security-Policy response header field which defines directives to ensure the browser only loads and executes trusted content... | Met | CSP with `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, hashed styles (no `unsafe-inline` since T1090); `[[path]].js` refuses to serve a page without one. |
| V3.4.4 | 2 | All HTTP responses contain an 'X-Content-Type-Options: nosniff' header field. | Met | As V3.2.1. |
| V3.4.5 | 2 | The application sets a referrer policy to prevent leakage of technically sensitive data to third-party services via the 'Referer' HTTP request header field. | Met | `Referrer-Policy: strict-origin-when-cross-origin` on every static answer. |
| V3.4.6 | 2 | The web application uses the frame-ancestors directive of the Content-Security-Policy header field for every HTTP response to ensure that it cannot be embedd... | Met | `frame-ancestors 'none'` plus `X-Frame-Options: DENY`. |
| V3.5.1 | 1 | Verify that, if the application does not rely on the CORS preflight mechanism to prevent disallowed cross-origin requests to use sensitive functionality, the... | Met | No ambient credential: auth is a bearer header added by script, so a cross-site form or image cannot act as the traveller. |
| V3.5.2 | 1 | Verify that, if the application relies on the CORS preflight mechanism to prevent disallowed cross-origin use of sensitive functionality, it is not possible... | Met | Edge Functions refuse a foreign-origin preflight with 403 and need the bearer anyway (`withCors`, `edgeHttp.test.mjs`, `edgeAuth.test.mjs`). |
| V3.5.3 | 1 | HTTP requests to sensitive functionality use appropriate HTTP methods such as POST, PUT, PATCH, or DELETE, and not methods defined by the HTTP specification... | Met | State changes are POST (Edge Functions answer 405 otherwise); Pages API routes are read-only GETs. The e-mail unsubscribe link is a signed GET by design (RFC 8058 one-click also accepts POST). |
| V3.5.4 | 2 | Separate applications are hosted on different hostnames to leverage the restrictions provided by same-origin policy, including how documents or scripts loade... | Met | App on www, data on data., images on cdn., functions on the Supabase host; the admin view shares the app origin but has no privileges of its own (`src/auth/admin.js`). |
| V3.5.5 | 2 | Messages received by the postMessage interface are discarded if the origin of the message is not trusted, or if the syntax of the message is invalid. | Met | No message event listener in the app. |
| V3.7.1 | 2 | The application only uses client-side technologies which are still supported and considered secure. | Met | Modern React and MapLibre only; no plugins (CSP `object-src 'none'`); dependency audit in `supply-chain.yml` (T1080). |
| V3.7.2 | 2 | The application will only automatically redirect the user to a different hostname or domain (which is not controlled by the application) where the destinatio... | Met | No redirect takes its destination from the request: OAuth returns to `window.location.origin`, Stripe URLs come from the server. |

## V4 API and Web Service

| ID | L | Requirement | Status | Evidence |
|---|---|---|---|---|
| V4.1.1 | 1 | Every HTTP response with a message body contains a Content-Type header field that matches the actual content of the response, including the charset parameter... | Met | API answers set `application/json; charset=utf-8`; static types from Cloudflare by extension. |
| V4.1.2 | 2 | Only user-facing endpoints (intended for manual web-browser access) automatically redirect from HTTP to HTTPS, while other services or endpoints do not imple... | Met | HSTS preload plus `upgrade-insecure-requests`; the APIs are only called over HTTPS by the app. |
| V4.1.3 | 2 | Any HTTP header field used by the application and set by an intermediary layer, such as a load balancer, a web proxy, or a backend-for-frontend service, cann... | Met | The client address comes from `CF-Connecting-IP`, which Cloudflare sets and a caller cannot override (`clientIp` in `guard.js`). |
| V4.2.1 | 2 | All application components (including load balancers, firewalls, and application servers) determine boundaries of incoming HTTP messages using the appropriat... | Met | HTTP framing is handled by Cloudflare and the Supabase gateway; no custom proxy of ours. |
| V4.3.1 | 2 | A query allowlist, depth limiting, amount limiting, or query cost analysis is used to prevent GraphQL or data layer expression Denial of Service (DoS) as a r... | Gap (T1164-n) | The app uses no GraphQL, but the Supabase project exposes `graphql_public` (pg_graphql) by default (`supabase/config.toml`); live state not verified. |
| V4.3.2 | 2 | GraphQL introspection queries are disabled in the production environment unless the GraphQL API is meant to be used by other parties. | Gap (T1164-n) | As V4.3.1: introspection is on wherever pg_graphql is exposed. |
| V4.4.1 | 1 | WebSocket over TLS (WSS) is used for all WebSocket connections. | N/A | No WebSockets (`wss:` left connect-src in T1079). |
| V4.4.2 | 2 | Verify that, during the initial HTTP WebSocket handshake, the Origin header field is checked against a list of origins allowed for the application. | N/A | As V4.4.1. |
| V4.4.3 | 2 | Verify that, if the application's standard session management cannot be used, dedicated tokens are being used for this, which comply with the relevant Sessio... | N/A | As V4.4.1. |
| V4.4.4 | 2 | Dedicated WebSocket session management tokens are initially obtained or validated through the previously authenticated HTTPS session when transitioning an ex... | N/A | As V4.4.1. |

## V5 File Handling

| ID | L | Requirement | Status | Evidence |
|---|---|---|---|---|
| V5.1.1 | 2 | The documentation defines the permitted file types, expected file extensions, and maximum size (including unpacked size) for each upload feature. | Met | Migration 061 and threat model section 8: JPEG, PNG and GPX only, 25 MB per file, 10 MB per track, 20 a day. |
| V5.2.1 | 1 | The application will only accept files of a size which it can process without causing a loss of performance or a denial of service attack. | Met | Bucket `file_size_limit`, per-function body caps (`readJson`, 4 KB to 9 MB, T1079). |
| V5.2.2 | 1 | When the application accepts a file, either on its own or within an archive such as a zip file, it checks if the file extension matches an expected file exte... | Met | Bucket `allowed_mime_types` and a server-chosen extension (`.jpg` or `.gpx` in `begin_upload`). |
| V5.2.3 | 2 | The application checks compressed files (e.g., zip, gz, docx, odt) against maximum allowed uncompressed size and against maximum number of files before uncom... | N/A | No archive or compressed format is accepted. |
| V5.3.1 | 1 | Files uploaded or generated by untrusted input and stored in a public folder, are not executed as server-side program code when accessed directly with an HTT... | Met | Uploads live in the private Storage bucket and are served as files, never executed. |
| V5.3.2 | 1 | When the application creates file paths for file operations, instead of user-submitted filenames, it uses internally generated or trusted data, or if user-su... | Met | The path is generated by `begin_upload` (`{uid}/{id}.jpg|.gpx`), never from a filename. |
| V5.4.1 | 2 | The application validates or ignores user-submitted filenames, including in a JSON, JSONP, or URL parameter and specifies a filename in the Content-Dispositi... | Met | User filenames are ignored (V5.3.2). |
| V5.4.2 | 2 | File names served (e.g., in HTTP response header fields or email attachments) are encoded or sanitized (e.g., following RFC 6266) to preserve document struct... | Met | No user filename is ever served in a header. |
| V5.4.3 | 2 | Files obtained from untrusted sources are scanned by antivirus scanners to prevent serving of known malicious content. | Met (compensating control, T1211) | No signature scanner, by decision (T1211, row T1164-l): only two kinds are accepted and each is rebuilt, not passed through. A photo must sniff as JPEG or PNG by its magic bytes (`sniffImage`); `stripJpeg` and `stripPng` (`supabase/functions/_shared/stripImageMeta.js`) walk every segment or chunk, drop APP, text, EXIF and time blocks and every byte after EOI or IEND (the place polyglot payloads ride), and refuse anything that does not parse to the end. A track is read for its points only and written fresh by `writeGpx` (`gpxPrivacy.js`), so no element, entity or script of the upload survives. The bucket is private, a 061 mime check allows only image/jpeg, image/png and application/gpx+xml, and nothing is public until an admin publishes. A ClamAV-style scanner would add a service to run and update for two formats it mostly checks by signature; revisit if a third kind (PDF, HEIC, video) is ever accepted. |

## V6 Authentication

| ID | L | Requirement | Status | Evidence |
|---|---|---|---|---|
| V6.1.1 | 1 | Application documentation defines how controls such as rate limiting, anti-automation, and adaptive response, are used to defend against attacks such as cred... | Met | Rate limits and anti-automation are documented (threat model sections 2, 4, 6; T1157; `docs/owner/auth-settings.md`). |
| V6.1.2 | 2 | A list of context-specific words is documented in order to prevent their use in passwords. | Met (T1164-f) | The list is `CONTEXT_WORDS` ("carta") plus each name part and each e-mail local part of four characters or more (`contextWords` in `src/lib/passwordStrength.js`). |
| V6.1.3 | 2 | Verify that, if the application includes multiple authentication pathways, these are all documented together with the security controls and authentication st... | Met | Three pathways (password, magic link, Google) documented with their controls in the threat model section 4. |
| V6.2.1 | 1 | User set passwords are at least 8 characters in length although a minimum of 15 characters is strongly recommended. | Gap (T1071-a) | The app asks for 8 (`MIN_PASSWORD_LENGTH`), but the server floor is a Dashboard setting: 6 in local `config.toml`, 12 wanted (`docs/owner/auth-settings.md`), live not verified. |
| V6.2.2 | 1 | Users can change their password. | Met | Account panel, Sign-in and security (`AccountPanel.jsx`). |
| V6.2.3 | 1 | Password change functionality requires the user's current and new password. | Gap (T1071-a) | The form asks for the current password (`reauthenticate`), but the server only enforces it with "Secure password change" on, a Dashboard step. |
| V6.2.4 | 1 | Passwords submitted during account registration or password change are checked against an available set of, at least, the top 3000 passwords which match the... | Gap (T1071-a) | Leaked-password protection is a Dashboard setting, not verified. |
| V6.2.5 | 1 | Passwords of any composition can be used, without rules limiting the type of characters permitted. | Met (T1164-f) | No composition rules since 2026-11-12: `PASSWORD_RULES` in `src/lib/passwordStrength.js` is the length floor and the context check only (owner decision T1164-f). |
| V6.2.6 | 1 | Password input fields use type=password to mask the entry. | Met | Every password field is `type="password"` (9 fields). |
| V6.2.7 | 1 | "paste" functionality, browser password helpers, and external password managers are permitted. | Met | No paste blocking; `autocomplete` set so managers work. |
| V6.2.8 | 1 | The application verifies the user's password exactly as received from the user, without any modifications such as truncation or case transformation. | Met | The password is sent as typed (no trim or case change); Supabase Auth hashes it with bcrypt. |
| V6.2.9 | 2 | Passwords of at least 64 characters are permitted. | Met | Supabase Auth accepts up to 72 characters (bcrypt). |
| V6.2.10 | 2 | A user's password stays valid until it is discovered to be compromised or the user rotates it. | Met | No forced rotation. |
| V6.2.11 | 2 | The documented list of context specific words is used to prevent easy to guess passwords being created. | Partial (T1164-f) | Sign-up (`AuthModal.jsx`), reset (`ResetPasswordScreen.jsx`) and change password (`AccountPanel.jsx`) refuse a password that contains a context word (`tests/passwordRules.test.mjs`), but only in the app: Supabase Auth itself accepts any password over its length floor, so a direct `auth/v1/signup` call skips the check. Server side check (a password hook) is the ROADMAP C3 follow-up. |
| V6.2.12 | 2 | Passwords submitted during account registration or password changes are checked against a set of breached passwords. | Gap (T1071-a) | As V6.2.4. |
| V6.3.1 | 1 | Controls to prevent attacks such as credential stuffing and password brute force are implemented according to the application's security documentation. | Gap (T1071-a, T1071-c) | Supabase Auth rate limits are live Dashboard values, not verified; no CAPTCHA. |
| V6.3.2 | 1 | Default user accounts (e.g., "root", "admin", or "sa") are not present in the application or are disabled. | Met | No default accounts; admins are explicit rows in `admin_users`. |
| V6.3.3 | 2 | Either a multi-factor authentication mechanism or a combination of single-factor authentication mechanisms, must be used in order to access the application. | Gap (T1164-f) | MFA (TOTP) exists for the admin only; travellers sign in with one factor. L2 asks for MFA for every account. Owner decision T1164-f (2026-11-12): optional TOTP for travellers, not built yet (ROADMAP C3); optional MFA alone does not make this row Met. |
| V6.3.4 | 2 | Verify that, if the application includes multiple authentication pathways, there are no undocumented pathways and that security controls and authentication s... | Met | Anonymous sign-in is off (`enable_anonymous_sign_ins = false`); no undocumented pathway. |
| V6.4.1 | 1 | System generated initial passwords or activation codes are securely randomly generated, follow the existing password policy, and expire after a short period... | Met | Magic links and reset links are generated by Supabase Auth (CSPRNG) and expire. |
| V6.4.2 | 1 | Password hints or knowledge-based authentication (so-called "secret questions") are not present. | Met | No hints or secret questions. |
| V6.4.3 | 2 | A secure process for resetting a forgotten password is implemented, that does not bypass any enabled multi-factor authentication mechanisms. | Met | A reset gives an `aal1` session; the admin surface still needs `aal2` (`admin_guard`, 062). |
| V6.4.4 | 2 | If a multi-factor authentication factor is lost, evidence of identity proofing is performed at the same level as during enrollment. | Met | Only the owner has a second factor; its recovery is through the Supabase Dashboard account, itself under MFA (T1059-b). |
| V6.5.1 | 2 | Lookup secrets, out-of-band authentication requests or codes, and time-based one-time passwords (TOTPs) are only successfully usable once. | Met | TOTP and e-mail codes are single use in Supabase Auth. |
| V6.5.2 | 2 | Verify that, when being stored in the application's backend, lookup secrets with less than 112 bits of entropy (19 random alphanumeric characters or 34 rando... | N/A | No lookup secrets (recovery codes) are stored by Carta. |
| V6.5.3 | 2 | Lookup secrets, out-of-band authentication code, and time-based one-time password seeds, are generated using a Cryptographically Secure Pseudorandom Number G... | Met | TOTP seeds and codes are generated by Supabase Auth. |
| V6.5.4 | 2 | Lookup secrets and out-of-band authentication codes have a minimum of 20 bits of entropy (typically 4 random alphanumeric characters or 6 random digits is su... | Met | Six-digit codes (Supabase Auth). |
| V6.5.5 | 2 | Out-of-band authentication requests, codes, or tokens, as well as time-based one-time passwords (TOTPs) have a defined lifetime. | Gap (T1164-j) | Codes and links expire, but `otp_expiry = 3600` locally; ASVS wants 10 minutes for out-of-band codes. |
| V6.6.1 | 2 | Authentication mechanisms using the Public Switched Telephone Network (PSTN) to deliver One-time Passwords (OTPs) via phone or SMS are offered only when the... | Met | No SMS or phone sign-in. |
| V6.6.2 | 2 | Out-of-band authentication requests, codes, or tokens are bound to the original authentication request for which they were generated and are not usable for a... | Gap (T1164-g) | With the implicit flow a magic link is not bound to the browser that asked for it; PKCE binds it. |
| V6.6.3 | 2 | A code based out-of-band authentication mechanism is protected against brute force attacks by using rate limiting. | Gap (T1071-a) | As V6.3.1. |
| V6.8.1 | 2 | Verify that, if the application supports multiple identity providers (IdPs), the user's identity cannot be spoofed via another supported identity provider (eg. | Met | Google is linked to an existing account only by verified e-mail or by a signed-in `linkIdentity` (T946). |
| V6.8.2 | 2 | The presence and integrity of digital signatures on authentication assertions (for example on JWTs or SAML assertions) are always validated, rejecting any as... | Met | Supabase Auth verifies the Google ID token; every Edge Function verifies the user JWT with `auth.getUser()` (`edgeAuth.test.mjs`: forged, `alg: none`, expired refused). |
| V6.8.3 | 2 | SAML assertions are uniquely processed and used only once within the validity period to prevent replay attacks. | N/A | No SAML. |
| V6.8.4 | 2 | Verify that, if an application uses a separate Identity Provider (IdP) and expects specific authentication strength, methods, or recentness for specific func... | Met | The admin surface demands `aal2` (062), proved by `admin-rpc-security.yml` section 13. |

## V7 Session Management

| ID | L | Requirement | Status | Evidence |
|---|---|---|---|---|
| V7.1.1 | 2 | The user's session inactivity timeout and absolute maximum session lifetime are documented, are appropriate in combination with other controls, and that the... | Gap (T1164-j) | Documented in `session-policy.md` (T1211): access token 3600 s, refresh token rotation, and no inactivity or absolute limit today. Setting the two limits is a Dashboard decision (T1164-j). |
| V7.1.2 | 2 | The documentation defines how many concurrent (parallel) sessions are allowed for one account as well as the intended behaviors and actions to be taken when... | Met | `session-policy.md` section 3 (T1211): any number of devices by design; sign out of other devices and sign out everywhere (`AuthContext.jsx`); what a revoked session keeps (the access token to its expiry). |
| V7.1.3 | 2 | All systems that create and manage user sessions as part of a federated identity management ecosystem (such as SSO systems) are documented along with control... | Met | Google federation through Supabase Auth is documented in the threat model section 4. |
| V7.2.1 | 1 | The application performs all session token verification using a trusted, backend service. | Met | Tokens are verified by Supabase Auth and PostgREST; Edge Functions call `auth.getUser()` (`edgeAuth.test.mjs`). |
| V7.2.2 | 1 | The application uses either self-contained or reference tokens that are dynamically generated for session management, i.e. | Met | Signed short-lived JWT plus rotating refresh token. |
| V7.2.3 | 1 | If reference tokens are used to represent user sessions, they are unique and generated using a cryptographically secure pseudo-random number generator (CSPRN... | Met | Refresh tokens are random and issued by Supabase Auth. |
| V7.2.4 | 1 | The application generates a new session token on user authentication, including re-authentication, and terminates the current session token. | Met | Each sign-in issues a new session. |
| V7.3.1 | 2 | There is an inactivity timeout such that re-authentication is enforced according to risk analysis and documented security decisions. | Gap (T1164-j) | No inactivity timeout (Supabase "inactivity timeout" not set). |
| V7.3.2 | 2 | There is an absolute maximum session lifetime such that re-authentication is enforced according to risk analysis and documented security decisions. | Gap (T1164-j) | No absolute session lifetime ("time-box user sessions" not set). |
| V7.4.1 | 1 | When session termination is triggered (such as logout or expiration), the application disallows any further use of the session. | Met | Sign-out revokes the refresh token; the access JWT lives at most `jwt_expiry` (3600 s). |
| V7.4.2 | 1 | The application terminates all active sessions when a user account is disabled or deleted (such as an employee leaving the company). | Met | Account delete removes the auth user and its refresh tokens; an admin ban blocks refresh (access JWT at most an hour). |
| V7.4.3 | 2 | The application gives the option to terminate all other active sessions after a successful change or removal of any authentication factor (including password... | Met | "Sign out other devices" in the Account panel (`signOut({ scope: 'others' })`). |
| V7.4.4 | 2 | All pages that require authentication have easy and visible access to logout functionality. | Met | Sign out in the Account panel and menu. |
| V7.4.5 | 2 | Application administrators are able to terminate active sessions for an individual user or for all users. | Met | Admin ban per user; global sign-out by rotating the JWT secret in the Dashboard. |
| V7.5.1 | 2 | The application requires full re-authentication before allowing modifications to sensitive account attributes which may affect authentication such as email a... | Met | Password change, data export and account delete call `reauthenticate` first (`AccountPanel.jsx`). |
| V7.5.2 | 2 | Users are able to view and (having authenticated again with at least one factor) terminate any or all currently active sessions. | Gap (T1164-j) | Travellers can sign out every other device but cannot see a list of sessions (Supabase has no user-facing session list). |
| V7.6.1 | 2 | Session lifetime and termination between Relying Parties (RPs) and Identity Providers (IdPs) behave as documented, requiring re-authentication as necessary s... | Met | The Carta session is Supabase's, independent of the Google session, as documented in the threat model section 4. |
| V7.6.2 | 2 | Creation of a session requires either the user's consent or an explicit action, preventing the creation of new application sessions without user interaction. | Met | A session starts only from an explicit sign-in. |

## V8 Authorization

| ID | L | Requirement | Status | Evidence |
|---|---|---|---|---|
| V8.1.1 | 1 | Authorization documentation defines rules for restricting function-level and data-specific access based on consumer permissions and resource attributes. | Met | Row policies and admin tiers documented (threat model sections 5 and 11, migrations). |
| V8.1.2 | 2 | Authorization documentation defines rules for field-level access restrictions (both read and write) based on consumer permissions and resource attributes. | Met | Field rules are in the policies and RPCs (no client write to `entitlements` or `pass_grants`, public profile fields through views). |
| V8.2.1 | 1 | The application ensures that function-level access is restricted to consumers with explicit permissions. | Met | `admin_guard()` first in every admin RPC, discovered from pg_proc (`admin-rpc-security.yml`, 211 assertions). |
| V8.2.2 | 1 | The application ensures that data-specific access is restricted to consumers with explicit permissions to specific data items to mitigate insecure direct obj... | Met | RLS isolation fixtures for all 34 tables (`rls-policies.yml`, T1078); Edge Functions key every read and write to the token user (`edgeAuth.test.mjs` wrong-user cases). |
| V8.2.3 | 2 | The application ensures that field-level access is restricted to consumers with explicit permissions to specific fields to mitigate broken object property le... | Met | As V8.1.2. |
| V8.3.1 | 1 | The application enforces authorization rules at a trusted service layer and doesn't rely on controls that an untrusted consumer could manipulate, such as cli... | Met | Authorization is enforced in Postgres and the Edge Functions, never in the client. |
| V8.4.1 | 2 | Multi-tenant applications use cross-tenant controls to ensure consumer operations will never affect tenants with which they do not have permissions to interact. | N/A | Single tenant (shared group trips are rows under RLS, covered at V8.2.2). |

## V9 Self-contained Tokens

| ID | L | Requirement | Status | Evidence |
|---|---|---|---|---|
| V9.1.1 | 1 | Self-contained tokens are validated using their digital signature or MAC to protect against tampering before accepting the token's contents. | Met | JWTs verified by Supabase Auth before use; the refine and unsubscribe tokens are HMAC checked in constant time (`edgeAuth.test.mjs`). |
| V9.1.2 | 1 | Only algorithms on an allowlist can be used to create and verify self-contained tokens, for a given context. | Met | Supabase Auth signs with the project key and refuses `alg: none` (refusal case in `edgeAuth.test.mjs` against the stub of that rule; live probe is T1164-b). |
| V9.1.3 | 1 | Key material that is used to validate self-contained tokens is from trusted pre-configured sources for the token issuer, preventing attackers from specifying... | Met | Keys come from the project configuration only. |
| V9.2.1 | 1 | Verify that, if a validity time span is present in the token data, the token and its content are accepted only if the verification time is within this validi... | Met | `exp` enforced (expired-token case in `edgeAuth.test.mjs`; refine token `exp`). |
| V9.2.2 | 2 | The service receiving a token validates the token to be the correct type and is meant for the intended purpose before accepting the token's contents. | Met | Only `role: authenticated` with a user counts; the anon key used as a user token is refused (`edgeAuth.test.mjs`). |
| V9.2.3 | 2 | The service only accepts tokens which are intended for use with that service (audience). | Met | Supabase Auth issues `aud: authenticated` for this project only. |
| V9.2.4 | 2 | Verify that, if a token issuer uses the same private key for issuing tokens to different audiences, the issued tokens contain an audience restriction that un... | N/A | One audience per issuer. |

## V10 OAuth and OIDC

| ID | L | Requirement | Status | Evidence |
|---|---|---|---|---|
| V10.1.1 | 2 | Tokens are only sent to components that strictly need them. | Met | Tokens go only to Supabase and the Edge Functions; Pages Functions never read or forward them (`pagesAuth.test.mjs`). |
| V10.1.2 | 2 | The client only accepts values from the authorization server (such as the authorization code or ID Token) if these values result from an authorization flow t... | Gap (T1164-g) | Implicit flow: the tokens arrive in the URL fragment without a code exchange bound to this client. |
| V10.2.1 | 2 | Verify that, if the code flow is used, the OAuth client has protection against browser-based request forgery attacks, commonly known as cross-site request fo... | Gap (T1164-g) | supabase-js defaults to `flowType: 'implicit'` (2.110.2) and `src/lib/supabaseClient.js` does not set PKCE. |
| V10.2.2 | 2 | Verify that, if the OAuth client can interact with more than one authorization server, it has a defense against mix-up attacks. | N/A | One authorization server (Supabase Auth). |
| V10.3.1 | 2 | The resource server only accepts access tokens that are intended for use with that service (audience). | Met | As V9.2.3. |
| V10.3.2 | 2 | The resource server enforces authorization decisions based on claims from the access token that define delegated authorization. | Met | Decisions use the `sub` claim through RLS and `auth.uid()`. |
| V10.3.3 | 2 | If an access control decision requires identifying a unique user from an access token (JWT or related token introspection response), the resource server iden... | Met | `sub` (user.id) only, never e-mail (`edgeAuth.test.mjs`). |
| V10.3.4 | 2 | Verify that, if the resource server requires specific authentication strength, methods, or recentness, it verifies that the presented access token satisfies... | Met | As V6.8.4 (`aal2`). |
| V10.4.1 | 1 | The authorization server validates redirect URIs based on a client-specific allowlist of pre-registered URIs using exact string comparison. | N/A | Carta is not an authorization server (Supabase Auth is; its redirect allow-list is a Dashboard setting in `docs/owner/auth-settings.md`). |
| V10.4.2 | 1 | Verify that, if the authorization server returns the authorization code in the authorization response, it can be used only once for a token request. | N/A | As V10.4.1. |
| V10.4.3 | 1 | The authorization code is short-lived. | N/A | As V10.4.1. |
| V10.4.4 | 1 | For a given client, the authorization server only allows the usage of grants that this client needs to use. | Gap (T1164-g) | Supabase is the server, but Carta's client uses the implicit (token) grant ASVS rules out. |
| V10.4.5 | 1 | The authorization server mitigates refresh token replay attacks for public clients, preferably using sender-constrained refresh tokens, i.e., Demonstrating P... | Gap (T1071-a) | Refresh rotation with a 10 s reuse window is set locally; the live value is a Dashboard check. |
| V10.4.6 | 2 | Verify that, if the code grant is used, the authorization server mitigates authorization code interception attacks by requiring proof key for code exchange (... | Gap (T1164-g) | As V10.2.1 (no PKCE). |
| V10.4.7 | 2 | If the authorization server supports unauthenticated dynamic client registration, it mitigates the risk of malicious client applications. | N/A | No dynamic client registration. |
| V10.4.8 | 2 | Refresh tokens have an absolute expiration, including if sliding refresh token expiration is applied. | Gap (T1164-j) | No absolute refresh token lifetime (V7.3.2). |
| V10.4.9 | 2 | Refresh tokens and reference access tokens can be revoked by an authorized user using the authorization server user interface, to mitigate the risk of malici... | Met | Sign-out and "sign out other devices" revoke refresh tokens. |
| V10.4.10 | 2 | Confidential client is authenticated for client-to-authorized server backchannel requests such as token requests, pushed authorization requests (PAR), and to... | N/A | As V10.4.1. |
| V10.4.11 | 2 | The authorization server configuration only assigns the required scopes to the OAuth client. | N/A | As V10.4.1 (Google scopes are the Supabase defaults: e-mail and profile). |
| V10.5.1 | 2 | The client (as the relying party) mitigates ID Token replay attacks. | Met | Supabase Auth checks the Google ID token nonce. |
| V10.5.2 | 2 | The client uniquely identifies the user from ID Token claims, usually the 'sub' claim, which cannot be reassigned to other users (for the scope of an identit... | Met | Users are identified by the Supabase `sub`, never reassigned. |
| V10.5.3 | 2 | The client rejects attempts by a malicious authorization server to impersonate another authorization server through authorization server metadata. | N/A | One provider, fixed by configuration. |
| V10.5.4 | 2 | The client validates that the ID Token is intended to be used for that client (audience) by checking that the 'aud' claim from the token is equal to the 'cli... | Met | Supabase Auth checks the ID token audience. |
| V10.5.5 | 2 | Verify that, when using OIDC back-channel logout, the relying party mitigates denial of service through forced logout and cross-JWT confusion in the logout f... | N/A | No back-channel logout. |
| V10.6.1 | 2 | The OpenID Provider only allows values 'code', 'ciba', 'id_token', or 'id_token code' for response mode. | N/A | Carta is not an OpenID Provider. |
| V10.6.2 | 2 | The OpenID Provider mitigates denial of service through forced logout. | N/A | As V10.6.1. |
| V10.7.1 | 2 | The authorization server ensures that the user consents to each authorization request. | N/A | No third-party client asks for consent to Carta data. |
| V10.7.2 | 2 | When the authorization server prompts for user consent, it presents sufficient and clear information about what is being consented to. | N/A | As V10.7.1. |
| V10.7.3 | 2 | The user can review, modify, and revoke consents which the user has granted through the authorization server. | N/A | As V10.7.1. |

## V11 Cryptography

| ID | L | Requirement | Status | Evidence |
|---|---|---|---|---|
| V11.1.1 | 2 | There is a documented policy for management of cryptographic keys and a cryptographic key lifecycle that follows a key management standard such as NIST SP 80... | Gap (T1059-c) | Key lifecycle policy written in `crypto-inventory.md` section 2 (T1211, NIST SP 800-57 states, per-key rotation and compromise steps). The critical keys are still to be rolled (T1059-c). |
| V11.1.2 | 2 | A cryptographic inventory is performed, maintained, regularly updated, and includes all cryptographic keys, algorithms, and certificates used by the applicat... | Met | `crypto-inventory.md` (T1211): every algorithm, key and certificate with the code that uses it; re-walk rule in section 4. |
| V11.2.1 | 2 | Industry-validated implementations (including libraries and hardware-accelerated implementations) are used for cryptographic operations. | Met | WebCrypto, node:crypto, Stripe and Supabase libraries, gpg; no home-made crypto. |
| V11.2.2 | 2 | The application is designed with crypto agility such that random number, authenticated encryption, MAC, or hashing algorithms, key lengths, rounds, ciphers a... | Met | Algorithms are named in one place each (`hmac` helpers, gpg flags) and can be swapped. |
| V11.2.3 | 2 | All cryptographic primitives utilize a minimum of 128-bits of security based on the algorithm, key size, and configuration. | Met | HMAC-SHA256, AES256 (gpg), TLS from the platforms. |
| V11.3.1 | 1 | Insecure block modes (e.g., ECB) and weak padding schemes (e.g., PKCS#1 v1.5) are not used. | Met | The only encryption of ours is gpg (OpenPGP, AES256 with MDC) for backups. |
| V11.3.2 | 1 | Only approved ciphers and modes such as AES with GCM are used. | Met | As V11.3.1. |
| V11.3.3 | 2 | Encrypted data is protected against unauthorized modification preferably by using an approved authenticated encryption method or by combining an approved enc... | Met | gpg MDC integrity protection on the backup files. |
| V11.4.1 | 1 | Only approved hash functions are used for general cryptographic use cases, including digital signatures, HMAC, KDF, and random bit generation. | Met | SHA-256 for every security use; md5 and sha1 appear only as cache keys (T1119 triage). |
| V11.4.2 | 2 | Passwords are stored using an approved, computationally intensive, key derivation function (also known as a "password hashing function"), with parameter sett... | Met | Supabase Auth stores bcrypt hashes. |
| V11.4.3 | 2 | Hash functions used in digital signatures, as part of data authentication or data integrity are collision resistant and have appropriate bit-lengths. | Met | SHA-256 in HMACs; Stripe signatures are HMAC-SHA256. |
| V11.4.4 | 2 | The application uses approved key derivation functions with key stretching parameters when deriving secret keys from passwords. | Met | The backup passphrase goes through gpg S2K (iterated and salted). |
| V11.5.1 | 2 | All random numbers and strings which are intended to be non-guessable must be generated using a cryptographically secure pseudo-random number generator (CSPR... | Met | Security randomness from crypto.randomUUID and getRandomValues; Math.random only for sampling and layout. |
| V11.6.1 | 2 | Only approved cryptographic algorithms and modes of operation are used for key generation and seeding, and digital signature generation and verification. | Met | Key generation by the platforms and gpg. |

## V12 Secure Communication

| ID | L | Requirement | Status | Evidence |
|---|---|---|---|---|
| V12.1.1 | 1 | Only the latest recommended versions of the TLS protocol are enabled, such as TLS 1.2 and TLS 1.3. | Met | Cloudflare and Supabase serve TLS 1.2 and 1.3; the Cloudflare minimum TLS setting is part of the preview check (T1164-a). |
| V12.1.2 | 2 | Only recommended cipher suites are enabled, with the strongest cipher suites set as preferred. | Met | Platform cipher suites (Cloudflare, Supabase). |
| V12.1.3 | 2 | The application validates that mTLS client certificates are trusted before using the certificate identity for authentication or authorization. | N/A | No mTLS. |
| V12.2.1 | 1 | TLS is used for all connectivity between a client and external facing, HTTP-based services, and does not fall back to insecure or unencrypted communications. | Met | HTTPS everywhere, HSTS preload, `upgrade-insecure-requests`, every connect-src host is https. |
| V12.2.2 | 1 | External facing services use publicly trusted TLS certificates. | Met | Publicly trusted certificates (Cloudflare, Supabase). |
| V12.3.1 | 2 | An encrypted protocol such as TLS is used for all inbound and outbound connections to and from the application, including monitoring systems, management tool... | Met | Every outbound call is HTTPS; the Intelligence API is localhost only, documented (threat model section 14). |
| V12.3.2 | 2 | TLS clients validate certificates received before communicating with a TLS server. | Met | Default certificate checks; no `verify=False` or `rejectUnauthorized` in the code. |
| V12.3.3 | 2 | TLS or another appropriate transport encryption mechanism used for all connectivity between internal, HTTP-based services within the application, and does no... | Met | Backend links (Edge to Postgres, box to R2 and Supabase) are TLS. |
| V12.3.4 | 2 | TLS connections between internal services use trusted certificates. | Met | Public certificates on every internal link. |

## V13 Configuration

| ID | L | Requirement | Status | Evidence |
|---|---|---|---|---|
| V13.1.1 | 2 | All communication needs for the application are documented. | Met | Request paths and hosts: `docs/architecture/request-paths.md` and the CSP connect-src list. |
| V13.2.1 | 2 | Communications between backend application components that don't support the application's standard user session mechanism, including APIs, middleware, and d... | Met | Machine callers use secrets compared in constant time (`x-notify-secret`, `x-uploads-secret`, ingest token) or Stripe signatures (`edgeAuth.test.mjs`). |
| V13.2.2 | 2 | Communications between backend application components, including local or operating system services, APIs, middleware, and data layers, are performed with ac... | Gap (T1164-c) | Edge Functions and the Pages AI event sink use the service role key, which bypasses every policy, where a narrower role would do. |
| V13.2.3 | 2 | If a credential has to be used for service authentication, the credential being used by the consumer is not a default credential (e.g., root/root or admin/ad... | Met | No default credentials. |
| V13.2.4 | 2 | An allowlist is used to define the external resources or systems with which the application is permitted to communicate (e.g., for outbound requests, data lo... | Gap (T1211-a) | The browser is held to a CSP connect-src allow-list, but parse-booking may fetch any public URL (private addresses are refused since T1211). |
| V13.2.5 | 2 | The web or application server is configured with an allowlist of resources or systems to which the server can send requests or load data or files from. | Gap (T1211-a) | As V13.2.4. |
| V13.3.1 | 2 | A secrets management solution, such as a key vault, is used to securely create, store, control access to, and destroy backend secrets. | Gap (T1059-c) | Supabase and Cloudflare secret stores hold the runtime keys, but the build box keeps its secrets in one `.env` with no manager (threat model gap 14). |
| V13.3.2 | 2 | Access to secret assets adheres to the principle of least privilege. | Gap (T1164-c) | As V13.2.2. |
| V13.4.1 | 1 | The application is deployed either without any source control metadata, including the .git or .svn folders, or in a way that these folders are inaccessible b... | Met | Only `dist/` is deployed; no `.git` in the build output. |
| V13.4.2 | 2 | Debug modes are disabled for all components in production environments to prevent exposure of debugging features and information leakage. | Met | Production build (`VITE_E2E_SEAMS=` empty in the deploy command); no debug endpoints. |
| V13.4.3 | 2 | Web servers do not expose directory listings to clients unless explicitly intended. | Met | Cloudflare Pages has no directory listing (ZAP 0 alerts for it). |
| V13.4.4 | 2 | Using the HTTP TRACE method is not supported in production environments, to avoid potential information leakage. | Met | Pages Functions answer 405 to unknown methods; Cloudflare refuses TRACE. |
| V13.4.5 | 2 | Documentation (such as for internal APIs) and monitoring endpoints are not exposed unless explicitly intended. | Met | No internal docs or monitoring endpoints on the app host; the docs site is private (B-a). |

## V14 Data Protection

| ID | L | Requirement | Status | Evidence |
|---|---|---|---|---|
| V14.1.1 | 2 | All sensitive data created and processed by the application has been identified and classified into protection levels. | Met | `data-classification.md` (T1211): four protection levels, every kind of data placed, built on `docs/legal/ARTICLE30.md`. |
| V14.1.2 | 2 | All sensitive data protection levels have a documented set of protection requirements. | Met | `data-classification.md` section 3 (T1211): storage, access, transit, at rest, logs, caching, third parties, retention, deletion and export per level. |
| V14.2.1 | 1 | Sensitive data is only sent to the server in the HTTP message body or header fields, and that the URL and query string do not contain sensitive information,... | Met | Tokens and personal data travel in headers and bodies; the unsubscribe link carries an HMAC, not a secret of the user. |
| V14.2.2 | 2 | The application prevents sensitive data from being cached in server components, such as load balancers and application caches, or ensures that the data is se... | Met | Personal answers come from POST Edge Functions (not stored by shared caches) and the notify and waitlist pages and `fail` answers say `no-store`; public data is cached on purpose. |
| V14.2.3 | 2 | Defined sensitive data is not sent to untrusted parties (e.g., user trackers) to prevent unwanted collection of data outside of the application's control. | Met | No third-party trackers; error reports are scrubbed and off until a DSN is set (`errorReporter.js`, T1120). |
| V14.2.4 | 2 | Controls around sensitive data related to encryption, integrity verification, retention, how the data is to be logged, access controls around sensitive data... | Gap (T1118-b) | Retention exists for some data (069 sweep) but not all decisions are taken. |
| V14.3.1 | 1 | Authenticated data is cleared from client storage, such as the browser DOM, after the client or session is terminated. | Met | Sign-out clears the supabase-js session from storage. |
| V14.3.2 | 2 | The application sets sufficient anti-caching HTTP response header fields (i.e., Cache-Control: no-store) so that sensitive data is not cached in browsers. | Met | As V14.2.2. |
| V14.3.3 | 2 | Data stored in browser storage (such as localStorage, sessionStorage, IndexedDB, or cookies) does not contain sensitive data, with the exception of session t... | Met | Only the Supabase session (by design of supabase-js) and preferences are in localStorage; ZAP 120000 (Info) notes it. |

## V15 Secure Coding and Architecture

| ID | L | Requirement | Status | Evidence |
|---|---|---|---|---|
| V15.1.1 | 1 | Application documentation defines risk based remediation time frames for 3rd party component versions with vulnerabilities and for updating libraries in gene... | Met | `dependency-remediation.md` (T1211): windows by severity (critical 7 days, high 30, moderate 90, low next update), tied to Dependabot and `supply-chain.yml`. Edge Function imports have no advisory feed yet (its section 3). |
| V15.1.2 | 2 | An inventory catalog, such as software bill of materials (SBOM), is maintained of all third-party libraries in use, including verifying that components come... | Met | CycloneDX SBOMs from `supply-chain.yml` (T1080). |
| V15.1.3 | 2 | The application documentation identifies functionality which is time-consuming or resource-demanding. | Met | `resource-heavy-features.md` (T1211): every AI, search, mail and scheduled job with its rate limit, cap or timeout. |
| V15.2.1 | 1 | The application only contains components which have not breached the documented update and remediation time frames. | Gap (T1080-b, T1080-d) | Known findings still open past any time frame. |
| V15.2.2 | 2 | The application has implemented defenses against loss of availability due to functionality which is time-consuming or resource-demanding, based on the docume... | Met | AI caps and quotas, per-address limits, upstream timeouts, edge cache on flights and forecast. |
| V15.2.3 | 2 | The production environment only includes functionality that is required for the application to function, and does not expose extraneous functionality such as... | Met | Test seams off in production (`VITE_E2E_SEAMS=`), no dev servers deployed. |
| V15.3.1 | 1 | The application only returns the required subset of fields from a data object. | Met | Functions answer explicit fields (`json(200, { url })`, the flight shape); PostgREST selects name columns. |
| V15.3.2 | 2 | Where the application backend makes calls to external URLs, it is configured to not follow redirects unless it is intended functionality. | Met (T1211) | parse-booking follows at most 3 redirects by hand (`redirect: 'manual'`) and runs the full name and address check on every Location; `parseBookingSsrf.test.mjs`. |
| V15.3.3 | 2 | The application has countermeasures to protect against mass assignment attacks by limiting allowed fields per controller and action, e.g., it is not possible... | Met | Edge Functions read named fields only (`body.action`, `body.tier`), never spread a body into a write (`edgeAuth.test.mjs` sends extra user ids that never reach a call). |
| V15.3.4 | 2 | All proxying and middleware components transfer the user's original IP address correctly using trusted data fields that cannot be manipulated by the end user... | Met | As V4.1.3. |
| V15.3.5 | 2 | The application explicitly ensures that variables are of the correct type and performs strict equality and comparator operations. | Met | Strict equality and explicit `String()` / `Number()` coercion in the validators and Edge Functions (by convention: ESLint has no `eqeqeq` rule). |
| V15.3.6 | 2 | JavaScript code is written in a way that prevents prototype pollution, for example, by using Set() or Map() instead of object literals. | Met | Parsed bodies are read by named field, never merged into objects by key from input. |
| V15.3.7 | 2 | The application has defenses against HTTP parameter pollution attacks, particularly if the application framework makes no distinction about the source of req... | Met | Every layer reads a query key with `URLSearchParams.get` (the first value), so no two layers see different copies; bodies are JSON, where a repeated key keeps the last. |

## V16 Security Logging and Error Handling

| ID | L | Requirement | Status | Evidence |
|---|---|---|---|---|
| V16.1.1 | 2 | An inventory exists documenting the logging performed at each layer of the application's technology stack, what events are being logged, log formats, where t... | Met | `log-inventory.md` (T1211): what each layer logs, format, where and how long. Platform retentions (Cloudflare, Supabase, GitHub) are not read from the Dashboards yet (T1164-i). |
| V16.2.1 | 2 | Each log entry includes necessary metadata (such as when, where, who, what) that would allow for a detailed investigation of the timeline when an event happens. | Gap (T1164-i) | Supabase and Cloudflare logs carry when and where; Carta adds no security event log of its own. |
| V16.2.2 | 2 | Time sources for all logging components are synchronized, and that timestamps in security event metadata use UTC or include an explicit time zone offset. | Met | Platform logs in UTC; database timestamps are `timestamptz`. |
| V16.2.3 | 2 | The application only stores or broadcasts logs to the files and services that are documented in the log inventory. | Met | Logs go only to the documented platforms and the error tracker (T1120). |
| V16.2.4 | 2 | Logs can be read and correlated by the log processor that is in use, preferably by using a common logging format. | Met | JSON logs from the platforms. |
| V16.2.5 | 2 | When logging sensitive data, the application enforces logging based on the data's protection level. | Met | AI events keep counts and hashes only, no text or user id (`aiEvents.mjs`, T1139); error events are scrubbed (T1120). |
| V16.3.1 | 2 | All authentication operations are logged, including successful and unsuccessful attempts. | Gap (T1164-i) | Supabase Auth logs sign-ins, retention per plan, not verified. |
| V16.3.2 | 2 | Failed authorization attempts are logged. | Gap (T1164-i) | Since T1211 every function wrapped in `withCors` (8 of 10; not `upload-scan` or `stripe-webhook`, which answer servers) writes one JSON line per 401 or 403 (`securityEvent` in `_shared/http.mjs`, `carta_security: auth_refused`) to the Supabase function log. Still open: admin guard refusals in SQL, and shipping the lines to a separate store with an alert. |
| V16.3.3 | 2 | The application logs the security events that are defined in the documentation and also logs attempts to bypass the security controls, such as input validati... | Gap (T1164-i) | As V16.3.2. |
| V16.3.4 | 2 | The application logs unexpected errors and security control failures such as backend TLS failures. | Gap (T1120-d) | Browser errors go to the tracker once configured; Edge Functions are not wired (T1120-d). |
| V16.4.1 | 2 | All logging components appropriately encode data to prevent log injection. | Met | Logs are structured JSON from the platforms; no raw request text is logged by our code. |
| V16.4.2 | 2 | Logs are protected from unauthorized access and cannot be modified. | Met | Platform logs are read-only to the project; `admin_audit_log` has no client write. |
| V16.4.3 | 2 | Logs are securely transmitted to a logically separate system for analysis, detection, alerting, and escalation. | Gap (T1164-i) | No log shipping to a separate system for alerting. |
| V16.5.1 | 2 | A generic message is returned to the consumer when an unexpected or security-sensitive error occurs, ensuring no exposure of sensitive internal system data s... | Met | Coded errors only (`{ code }`, `{ error }`); `withCors` turns an escaped exception into a fixed 500 (`edgeHttp.test.mjs`). |
| V16.5.2 | 2 | The application continues to operate securely when external resource access fails, for example, by using patterns such as circuit breakers or graceful degrad... | Met | Upstream failures answer 502 `upstream`; AI failures fall back to the local planner (HANDBOOK plan-day step 11). |
| V16.5.3 | 2 | The application fails gracefully and securely, including when an exception occurs, preventing fail-open conditions such as processing a transaction despite e... | Met | Fails closed: no token, no secret or a bad signature refuses before any work (`edgeAuth.test.mjs`); `admin_guard` refuses a missing `aal` claim. |

## V17 WebRTC

| ID | L | Requirement | Status | Evidence |
|---|---|---|---|---|
| V17.1.1 | 2 | The Traversal Using Relays around NAT (TURN) service only allows access to IP addresses that are not reserved for special purposes (e.g., internal networks,... | N/A | No WebRTC. |
| V17.2.1 | 2 | The key for the Datagram Transport Layer Security (DTLS) certificate is managed and protected based on the documented policy for management of cryptographic... | N/A | No WebRTC. |
| V17.2.2 | 2 | The media server is configured to use and support approved Datagram Transport Layer Security (DTLS) cipher suites and a secure protection profile for the DTL... | N/A | No WebRTC. |
| V17.2.3 | 2 | Secure Real-time Transport Protocol (SRTP) authentication is checked at the media server to prevent Real-time Transport Protocol (RTP) injection attacks from... | N/A | No WebRTC. |
| V17.2.4 | 2 | The media server is able to continue processing incoming media traffic when encountering malformed Secure Real-time Transport Protocol (SRTP) packets. | N/A | No WebRTC. |
| V17.3.1 | 2 | The signaling server is able to continue processing legitimate incoming signaling messages during a flood attack. | N/A | No WebRTC. |
| V17.3.2 | 2 | The signaling server is able to continue processing legitimate signaling messages when encountering malformed signaling message that could cause a denial of... | N/A | No WebRTC. |
