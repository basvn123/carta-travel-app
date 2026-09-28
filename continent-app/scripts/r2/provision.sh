#!/usr/bin/env bash
# Provision the Carta R2 bucket: one bucket, four prefixes, two custom domains,
# and a Cache-Control smoke test on the img/ and data/ prefixes.
#
# Reference: additional docs/Carta/Plan/Architecture/CARTA_CLOUD_ARCHITECTURE.md
# sections 3, 5.2, 8.2 step 2. Task: Execution/P3/T044-r2-bucket-and-domains.md.
#
# This script needs two things that do not exist in this environment yet:
#   CLOUDFLARE_API_TOKEN   an API token, R2 Storage: Edit at minimum (see below)
#   CLOUDFLARE_ACCOUNT_ID  the Cloudflare account id that owns carta-europetravel.com
#
# Neither is read from a file. Export them in the shell that runs this script,
# on the machine that has account access. Never commit them.
#
# Usage:
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... bash scripts/r2/provision.sh
#   bash scripts/r2/provision.sh --dry-run     # prints every command, runs none of them
#
# Run from continent-app/, so wrangler.toml is picked up for account defaults.

set -euo pipefail

BUCKET="carta"
ZONE_DOMAIN="carta-europetravel.com"
CDN_DOMAIN="cdn.${ZONE_DOMAIN}"
DATA_DOMAIN="data.${ZONE_DOMAIN}"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

run() {
  echo "+ $*"
  if [ "$DRY_RUN" -eq 0 ]; then
    "$@"
  fi
}

if [ "$DRY_RUN" -eq 0 ]; then
  if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
    echo "CLOUDFLARE_API_TOKEN is not set. Export it or run with --dry-run to exercise this script without credentials." >&2
    exit 1
  fi
  if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
    echo "CLOUDFLARE_ACCOUNT_ID is not set. Export it or run with --dry-run to exercise this script without credentials." >&2
    exit 1
  fi
fi

echo "== Step 1: create the bucket =="
# One bucket for everything: images, wire shards, tiles, archive. The
# architecture doc (section 3, section 8.2 step 2) calls for "one bucket,
# four prefixes", not four buckets. It does not name the bucket, so this
# script uses "carta", the short name the rest of the project already uses
# for the app ("carta-app" in wrangler.toml, carta-europetravel.com for the
# zone). Change BUCKET above before running if a different name is wanted;
# renaming after creation means a new bucket and a re-upload, R2 buckets
# cannot be renamed in place.
run npx wrangler r2 bucket create "$BUCKET" --location weur

echo "== Step 2: lay down the four prefixes =="
# R2, like S3, has no real directories. A key such as "img/foo.avif" is one
# flat object whose name happens to contain a slash; the R2 dashboard and
# tools render the slash as a folder for convenience, but there is no
# separate "create folder" operation and nothing to configure per prefix.
# The marker objects below exist only so the four prefixes are visible in
# the dashboard and in `wrangler r2 object list` before any real content is
# uploaded. They carry no meaning to the app and can be deleted later
# without affecting anything.
TMP_MARKER="$(mktemp)"
printf 'Carta R2 prefix marker. Prefixes have no real existence in R2; this object exists only so the prefix shows up before real content is uploaded. Safe to delete.\n' > "$TMP_MARKER"

for prefix in img data tiles archive; do
  run npx wrangler r2 object put "${BUCKET}/${prefix}/.keep" \
    --file "$TMP_MARKER" \
    --content-type "text/plain" \
    --cache-control "no-store"
done

echo "== Step 3: upload one test object per cached prefix, with the real Cache-Control =="
# img/ is the prefix the architecture doc names explicitly: everything in it
# gets a one-year immutable cache, because image derivatives are
# content-hashed and never change once written (section 4.2). data/ (wire
# shards) is not specified as immutable in section 5.2 the way img/ is, so
# this script gives it a conservative long-but-revalidatable policy; the app
# team should confirm the exact policy per shard type when T054 lands the
# real shards, and change the value below rather than assuming this default.
TEST_IMG="$(mktemp --suffix=.txt)"
printf 'Carta R2 test object for img/. Uploaded by scripts/r2/provision.sh to verify Cache-Control.\n' > "$TEST_IMG"
run npx wrangler r2 object put "${BUCKET}/img/_test/hello.txt" \
  --file "$TEST_IMG" \
  --content-type "text/plain" \
  --cache-control "public, max-age=31536000, immutable"

TEST_DATA="$(mktemp --suffix=.json)"
printf '{"ok":true,"note":"Carta R2 test object for data/. Uploaded by scripts/r2/provision.sh."}\n' > "$TEST_DATA"
run npx wrangler r2 object put "${BUCKET}/data/_test/hello.json" \
  --file "$TEST_DATA" \
  --content-type "application/json" \
  --cache-control "public, max-age=300, must-revalidate"

echo "== Step 4: attach the two custom domains =="
# wrangler r2 bucket domain add needs --zone-id, not a bucket-level setting;
# it is the Cloudflare zone id for carta-europetravel.com, found on the zone
# overview page in the dashboard or via `wrangler r2 bucket domain add --help`.
# It is not read from any file in this repo. Export CLOUDFLARE_ZONE_ID or
# paste the id in place of the variable below before running for real.
if [ "$DRY_RUN" -eq 0 ] && [ -z "${CLOUDFLARE_ZONE_ID:-}" ]; then
  echo "CLOUDFLARE_ZONE_ID is not set. Export it (the zone id for carta-europetravel.com) before running step 4 for real." >&2
  exit 1
fi
ZONE_ID="${CLOUDFLARE_ZONE_ID:-<ZONE_ID_PLACEHOLDER>}"

run npx wrangler r2 bucket domain add "$BUCKET" --domain "$CDN_DOMAIN" --zone-id "$ZONE_ID" --min-tls 1.2
run npx wrangler r2 bucket domain add "$BUCKET" --domain "$DATA_DOMAIN" --zone-id "$ZONE_ID" --min-tls 1.2

echo "== Step 5: verify =="
cat <<EOF

Custom domains take a few minutes to provision after "domain add" succeeds
(Cloudflare issues a certificate and adds the DNS record). Once they resolve,
verify with:

  curl -sSI https://${CDN_DOMAIN}/img/_test/hello.txt
  curl -sSI https://${DATA_DOMAIN}/data/_test/hello.json

Expect, on the img/ object:
  HTTP/2 200
  cache-control: public, max-age=31536000, immutable

Expect, on the data/ object:
  HTTP/2 200
  cache-control: public, max-age=300, must-revalidate

Or run scripts/r2/verify.mjs, which checks both automatically.

Note on how the Cache-Control header actually gets there: it is object
metadata, set at upload time by the --cache-control flag above (this is what
Cloudflare's R2 documentation calls it: an HTTP metadata field stored with
the object, not a bucket-wide setting). A custom domain serves whatever
Cache-Control the object carries. There is no bucket-level default and no
wrangler flag to set one; every object must be written with its own
--cache-control, or re-uploaded to change it. The app's continent-app/public/_headers
file has no effect here at all: it is a Cloudflare Pages feature that only
applies to the Pages deployment's own origin, never to an R2 custom domain,
which is a separate product with a separate serving path. Optionally, a
Cloudflare "Cache Rule" (dashboard: Caching, Cache Rules) can be layered on
top of the zone to force a floor even if an object is ever uploaded without
the header, but that is a belt-and-suspenders addition, not required if
every upload path (this script, and later the image ladder's derive.py
stage) sets --cache-control correctly every time. Recommend adding it once,
scoped to hostname eq "${CDN_DOMAIN}" and starts_with(http.request.uri.path, "/img/"),
as insurance against a future upload path that forgets the flag.
EOF
