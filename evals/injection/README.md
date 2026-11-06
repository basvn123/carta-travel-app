# Injection set (T1117, ROADMAP C8 and E3)

`attacks.json` holds the adversarial inputs Carta's AI guard is tested against, one per row, with the surface (`ask`, `plan-day`, `parse-booking`), the vector (question, note, wish, refine, candidate, document, output), the attack family, the input, a `recorded` model output and what must happen (`refused`, `rejected`, or `guarded`: nothing in `mustNotAppear` reaches the traveller). `benign` holds inputs that must pass untouched.

`recorded` is a stubbed worst case: what a model that followed the injection would write. That keeps the set in `npm test` (`continent-app/tests/aiGuard.test.mjs`) with no key and no network. It proves the guard catches the attack whatever the model does; it does not prove how often the real model is turned.

The live pass replays the set against a preview and the deployed functions with a test account and records the real outputs in `recorded-live-<date>.json`: `continent-app/scripts/ai/redteam_live.mjs` (owner step, see its header). Add an attack whenever a new one is seen live; keep at least 30.
