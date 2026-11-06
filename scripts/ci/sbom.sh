#!/usr/bin/env bash
# C6 (T1080): CycloneDX SBOMs for the app, the trailslab review tool and the
# pipeline. Tools run through npx and pip in CI only; nothing is added to
# package.json or requirements.txt.
# Usage: bash scripts/ci/sbom.sh [out-dir]   (default: sbom)
set -euo pipefail
out="${1:-sbom}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$root/$out"

# npm: reads package-lock.json, so the lockfile must exist (npm ci is the rule).
for dir in continent-app tools/trailslab/review; do
  name="$(echo "$dir" | tr '/' '-')"
  (cd "$root/$dir" && npx --yes @cyclonedx/cyclonedx-npm@4.0.2 \
    --omit dev --package-lock-only --spec-version 1.5 --output-format JSON \
    --output-file "$root/$out/sbom-npm-$name.cdx.json")
done

# Python: the pinned closure the pipeline runs (constraints.txt) plus the ML file.
python -m pip install --quiet cyclonedx-bom==8.0.1
for req in constraints.txt requirements-ml.txt; do
  python -m cyclonedx_py requirements "$root/$req" --sv 1.5 --of JSON \
    -o "$root/$out/sbom-python-${req%.txt}.cdx.json"
done
ls -l "$root/$out"
