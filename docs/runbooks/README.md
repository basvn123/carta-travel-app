# Runbooks

Step by step procedures for the operator (the owner). Built by T1073 (ROADMAP B2) from CLAUDE.md "Checks", the header of `continent-app/scripts/build-pages.mjs`, `infra/hetzner/`, and the retired incident runbook in git.

| Runbook | When |
|---|---|
| [deploy.md](deploy.md) | The owner asks for a deploy to Cloudflare Pages and R2 |
| [build-box.md](build-box.md) | Bringing up, checking or debugging the Hetzner build box |
| [incident.md](incident.md) | Something is broken for travellers: the outage line, where to look first, three worked incidents |

Not written yet (open in the T1073 report, ROADMAP B2 lists them): backup and restore, refund. Their old versions are `archive/docs-2026-11/BACKUP.md` and `archive/docs-2026-11/REFUND_SOP.md`; they were archived as distrusted, so rewrite them from the code before using them.

Rules for every runbook: names and places only, never a secret value (see [../security/SECRETS.md](../security/SECRETS.md)); say what the traveller sees; say how to undo.
