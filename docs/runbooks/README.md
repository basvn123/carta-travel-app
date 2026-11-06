# Runbooks

Step by step procedures for the operator (the owner). Built by T1073 (ROADMAP B2) from CLAUDE.md "Checks", the header of `continent-app/scripts/build-pages.mjs`, `infra/hetzner/`, and the retired incident runbook in git.

| Runbook | When |
|---|---|
| [deploy.md](deploy.md) | The owner asks for a deploy to Cloudflare Pages and R2 |
| [build-box.md](build-box.md) | Bringing up, checking or debugging the Hetzner build box |
| [backup-restore.md](backup-restore.md) | Taking, proving or restoring a Supabase or archive dump; before any pasted migration |
| [refund.md](refund.md) | A traveller asks for money back |
| [incident.md](incident.md) | Something is broken for travellers: the outage line, where to look first, five worked incidents |

Rules for every runbook: names and places only, never a secret value (see [../security/SECRETS.md](../security/SECRETS.md)); say what the traveller sees; say how to undo.
