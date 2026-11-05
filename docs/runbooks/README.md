# Runbooks

Step by step procedures for the operator (the owner). Built by T1073 (ROADMAP B2) from CLAUDE.md "Checks", the header of `continent-app/scripts/build-pages.mjs`, `infra/hetzner/`, and the retired incident runbook in git.

| Runbook | When |
|---|---|
| [deploy.md](deploy.md) | The owner asks for a deploy to Cloudflare Pages and R2 |
| [build-box.md](build-box.md) | Bringing up, checking or debugging the Hetzner build box |
| [backup.md](backup.md) | What is backed up and where, taking a Supabase dump before a migration, restoring, and what does not exist |
| [incident.md](incident.md) | Something is broken for travellers: the outage line, where to look first, three worked incidents |

Not written yet (ROADMAP B2 lists it): refund. Its old version is `archive/docs-2026-11/REFUND_SOP.md`; it was archived as distrusted, so rewrite it from the code before using it. Backup was written by T1085.

Rules for every runbook: names and places only, never a secret value (see [../security/SECRETS.md](../security/SECRETS.md)); say what the traveller sees; say how to undo.
