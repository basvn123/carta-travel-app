"""Group the open owner rows into one procedure file per system (T1072, A3).

Writes Execution/P15/_OPEN-<slug>.md for each system and appends a pointer
"(procedure: Execution/P15/_OPEN-<slug>.md, step N)" to the Item of each owner
row it lists. Steps are the rows themselves in register order (the Order
column first, then task number); the wording is the row's own, trimmed. No
step is invented. Rows other tasks in the batch own are left alone.

Usage: python scripts/register/owner_procedures.py [--dry-run]
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import triage  # noqa: E402

OUT = triage.ROOT / "Execution" / "P15"
SKIP_IDS = set("T1057-a T333-a T333-b T333-c T1021-a T1061-d T1065-a T1066-a T293-a".split())
SKIP_RE = re.compile(r"hostelworld|xotelo|booking scrape|\bseo\b|prerender|sitemap|canonical|threat model|auth setting|\bMFA\b|admin audit|audit log", re.I)

# (slug, title, intro, pattern); first match wins
SYSTEMS = [
    ("translation-review", "Translation review by native readers",
     "Strings written by Claude in German, Spanish, French, Italian and Dutch that no native reader has seen. Read them in one sitting per language, in the app, not in the files.",
     r"native (review|read|speaker)|machine translation|own translations|translations? (written|wanted)"),
    ("stripe", "Stripe",
     "Everything that needs the Stripe Dashboard or a Stripe-backed purchase. Test mode first; live mode only at launch (ROADMAP I2).",
     r"stripe|checkout function|webhook|refund|trip pass|yearly plan|customer portal|tax_behavior|pass_grants|receipt email|tacit|renewal"),
    ("legal", "Legal, tax and brand",
     "Reviews, registrations and wording only you or a qualified person can sign off. ROADMAP I1 (sole trader, late registration) and I-R4, I-R5 decide the route.",
     r"legal|terms of service|\bterms\b|privacy|imprint|\bVAT\b|accountant|trademark|EUIPO|KBO|licen[cs]|DPA|GDPR|waiver|article 1|commercial terms|courtesy note|attribution|disclosure"),
    ("hetzner-box", "Hetzner box and workers",
     "Steps on the Hetzner box (CAX11) and the on-demand worker (CAX41 or CPX42). Existing detail: Execution/P3/_OPEN-hetzner.md and Execution/P15/_OPEN-explore-data-runs.md.",
     r"hetzner|\bCAX|\bCPX|\bbox\b|spawn|valhalla|systemd|trailslab|worker (token|type|keypair)|dump"),
    ("cloudflare", "Cloudflare (Pages, R2, Workers, email routing)",
     "Deploys, data pushes, tokens and DNS. Run data pushes before page deploys (CLAUDE.md, Deploy).",
     r"cloudflare|\bR2\b|wrangler|pages|push-data|\bCORS\b|pmtiles|\bCDN\b|\bDNS\b|email routing|flight-sweep|\bworker\b|data host|deploy"),
    ("supabase-migrations", "Supabase: SQL pastes, Edge Functions and secrets",
     "Pastes in the SQL editor, Edge Function deploys and secrets for project ntssxktaduxzpsmejwyv. Migrations 013 to 060 are live (T985); run the liveness query before any paste list.",
     r"migration|\bpaste|\bSQL\b|supabase|\bRLS\b|edge function|pg_cron|\bvault\b|\bRPC\b|plan-day|notify|resend|admin_|ai_usage|aal2"),
    ("google-and-search", "Google, Gemini billing and Search Console",
     "Google Cloud billing, Gemini keys and the Search and Bing webmaster properties.",
     r"search console|bing|indexnow|gemini|google cloud|AI Studio|billing|crux|google flights|google's|serpapi|paid"),
    ("accounts-and-signups", "Accounts, mailboxes and programme sign-ups",
     "Third-party accounts, mailboxes, affiliate programmes and store accounts.",
     r"sign up|affiliate|mailbox|handle|registrar|apple developer|play developer|provider|SPF|DKIM|awin|partnerize|travelpayouts|status\.|email address|subscribe"),
    ("product-decisions", "Product and design decisions only you can make",
     "Each row asks for a call, a confirmation or an approval. Answer in chat with the row id; the session that picks it up edits PRODUCT.md or carta-design if the answer changes a rule.",
     r"decide|confirm|owner call|call made|calls made|approve|choose|question|accept|keep or|should|owner to|owner audit|owner looks|owner checks|owner step|pick|whether"),
    ("data-and-pipeline-runs", "Pipeline and data runs that wait on you",
     "Runs on the laptop or the box that need your go (paid, hours long, or needing a credential). Existing detail: Execution/P15/_OPEN-explore-data-runs.md and Execution/P9/_OPEN-paid-runs.md.",
     r"run |rerun|pipeline|data lane|python|backfill|paid|batch|regenerate|refresh|export"),
    ("owner-checks", "Other owner checks and clean-ups",
     "Everything left: look at, confirm or clean up something on your own machine or in a service.",
     r".*"),
]


EXISTING = {
    "T291-b": "Execution/P15/_OPEN-secrets-rotation.md, step 1",
    "T1046-b": "Execution/P15/_OPEN-secrets-rotation.md, step 1",
    "T296-a": "Execution/P15/_OPEN-secrets-rotation.md, step 1.4",
}

OVERRIDES = {
    "T382-h": "owner-checks", "T384-a": "owner-checks", "T551-a": "data-and-pipeline-runs",
    "T565-b": "cloudflare", "T218-d": "accounts-and-signups", "T220-c": "product-decisions",
    "T220-d": "product-decisions", "T319-a": "legal", "T503-g": "product-decisions",
    "T1048-a": "legal", "T461-a": "cloudflare", "T216-a": "accounts-and-signups",
    "T213-e": "accounts-and-signups", "T227-b": "cloudflare", "T322-a": "data-and-pipeline-runs",
    "T557-e": "product-decisions", "T051-a": "cloudflare", "T040-b": "data-and-pipeline-runs",
    "T144-a": "data-and-pipeline-runs", "T145-b": "data-and-pipeline-runs",
    "T150-a": "data-and-pipeline-runs", "T152-a": "data-and-pipeline-runs",
    "T153-a": "data-and-pipeline-runs", "T153-b": "data-and-pipeline-runs",
    "T839-a": "product-decisions", "T866-b": "product-decisions", "T873-a": "product-decisions",
    "T1052-a": "legal", "T1047-a": "product-decisions", "T043-b": "owner-checks",
    "T043-c": "owner-checks", "T072-a": "data-and-pipeline-runs", "T083-c": "owner-checks",
    "T323-b": "data-and-pipeline-runs", "T332-c": "data-and-pipeline-runs",
    "T093-a": "data-and-pipeline-runs", "T571-g": "product-decisions",
    "T808-a": "product-decisions", "T365-f": "product-decisions", "T235-a": "owner-checks",
    "T235-e": "owner-checks", "T062-a": "owner-checks", "T508-c": "product-decisions",
}


def classify(item, rid=None):
    if rid in OVERRIDES:
        return OVERRIDES[rid]
    for slug, _, _, pat in SYSTEMS:
        if re.search(pat, item, re.I):
            return slug
    return "owner-checks"


def sort_key(r):
    o = r["order"].strip()
    num = int(o) if o.isdigit() else 10 ** 6
    return (num, triage.task_num(r["id"]), r["id"])


def main():
    dry = "--dry-run" in sys.argv
    lines, rows = triage.parse(triage.OPEN)
    for r in rows:
        if r["id"] in EXISTING and "procedure: Execution/" not in r["item"]:
            ptr = f" (procedure: {EXISTING[r['id']]})"
            cells = [r["id"], r["raised"], r["item"] + ptr, r["owner"], r["status"], r["order"]]
            lines[r["idx"]] = triage.fmt_row(cells)
    owners = [r for r in rows if r["owner"] == "user" and r["id"] not in SKIP_IDS and r["id"] not in EXISTING
              and not re.search(r"_OPEN-[\w-]+\.md", r["item"])
              and not r["id"].startswith("T714-") and not SKIP_RE.search(r["item"])
              and "procedure: Execution/" not in r["item"]]
    by = {s[0]: [] for s in SYSTEMS}
    for r in owners:
        by[classify(r["item"], r["id"])].append(r)
    new_lines = list(lines)  # lines already carries the EXISTING pointers
    for slug, title, intro, _ in SYSTEMS:
        rs = sorted(by[slug], key=sort_key)
        if not rs:
            continue
        rel = f"Execution/P15/_OPEN-{slug}.md"
        out = [f"# Owner procedure: {title} (T1072, ROADMAP A3)", "",
               intro, "",
               "Steps are the open register rows with Owner `user` that belong to this system, in register order: the Order column first, then task number. A row's own wording says what it waits on (\"after\", \"before\"); that is repeated beside the step. Nothing here is new: each step is a row, and the task report named in the row has the detail. When you finish a step, tell a session the row id; it moves the row to `Execution/_OPEN-CLOSED.md`.", "",
               f"Rows: {len(rs)}. Register rows point back here.", "", "## Steps", ""]
        for n, r in enumerate(rs, 1):
            wait = f" (register order: {r['order']})" if r["order"].strip() else ""
            text = r["item"] if len(r["item"]) <= 420 else r["item"][:417].rstrip() + "..."
            out.append(f"{n}. **{r['id']}**{wait}: {text}")
            ptr = f" (procedure: {rel}, step {n})"
            cells = [r["id"], r["raised"], r["item"] + ptr, r["owner"], r["status"], r["order"]]
            new_lines[r["idx"]] = triage.fmt_row(cells)
        out.append("")
        print(slug, len(rs))
        if not dry:
            (OUT / f"_OPEN-{slug}.md").write_bytes(("\r\n".join(out)).encode("utf-8"))
    if not dry:
        triage.OPEN.write_bytes("\r\n".join(new_lines).encode("utf-8"))
    print("owner rows pointed:", len(owners), "of", sum(1 for r in rows if r["owner"] == "user"))


if __name__ == "__main__":
    main()
