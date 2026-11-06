# Langfuse on the build box (prepared, not installed)

T1148, ROADMAP F6. The eval runner works without Langfuse: every eval writes the shared results format to `data/reports/evals/`. Langfuse is the later place for traces of live AI calls (ROADMAP E4) and for eval runs as dataset scores.

Install (owner, register row T1148-b):

1. On the box, with Docker and the compose plugin: copy this folder, `cp .env.example .env`, fill every `change-me` (`openssl rand -hex 32` for each secret).
2. Compare `docker-compose.yml` with the official file of the Langfuse release you install, and pin the image digests.
3. `docker compose up -d`, then open the UI through a tunnel: `ssh -L 3000:127.0.0.1:3000 <box>` and http://localhost:3000. Every port binds to 127.0.0.1 only; sign-up is off.
4. Sizing: Langfuse names 4 cores, 16 GiB RAM and about 100 GiB disk as the minimum; Compose has no high availability and no backups, so add a nightly `pg_dump` and a ClickHouse backup if traces matter.
5. Put `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` and `LANGFUSE_BASE_URL` (and `LANGFUSE_BASEURL`) where the sender runs. No traveller text goes to Langfuse until the privacy review of E4 says how it is masked.

Version note: Langfuse v4 is current and needs ClickHouse 25.12 or newer and the v6 JS SDK; this file pins the v3 stack (JS SDK v5). Choose one at install and keep the SDK to match.
