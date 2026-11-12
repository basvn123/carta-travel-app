# Owner procedure: Google, Gemini billing and Search Console (T1072, ROADMAP A3)

Google Cloud billing, Gemini keys and the Search and Bing webmaster properties.

Steps are the open register rows with Owner `user` that belong to this system, in register order: the Order column first, then task number. A row's own wording says what it waits on ("after", "before"); that is repeated beside the step. Nothing here is new: each step is a row, and the task report named in the row has the detail. When a step is done, delete it here (docs/decisions/0003-open-items-owner-steps-and-roadmap.md).

Rows: 3. Register rows point back here.

## Steps

1. **T200-g** (register order: after launch): Field Core Web Vitals (CrUX or Search Console) cannot be read until the site has traffic and the owner verifies the property; check once there is a month of visits
2. **T205-f** (register order: before T239): Create the Search Console property for https://www.carta-europetravel.com/, a Bing Webmaster Tools property and an IndexNow key; nothing can be submitted or the indexed share measured without them
3. **T259-b**: AI Studio shows the key's project on a Prepay Tier 1 billing tier; unverified whether the Cloud budget counts prepaid Gemini spend and what the live functions return when the prepaid balance runs out; read both once the budget shows non-zero spend
