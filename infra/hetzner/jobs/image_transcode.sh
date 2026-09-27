#!/usr/bin/env bash
# Job image_transcode (T047): a STUB. It exits 3 and transcodes nothing.
#
# Why it is a stub. The job is to run the libvips derivative ladder of
# CARTA_CLOUD_ARCHITECTURE.md section 4.2 (3 AVIF + 2 WebP per source image,
# content-addressed by sha1 under img/) on 16 cores, the "one 6-hour CAX41 run,
# about EUR 0.35" of section 4.6. The stage that does it, pipeline/photos/
# derive.py, is step 4 of the migration order in section 8 and has not been
# written (checked 2026-09-27: no derive.py under pipeline/photos, and no
# pyvips or libvips import anywhere in the pipeline). There is no command to
# wrap.
#
# What it needs when derive.py lands, from T006's arm64 audit: pyvips ships as
# an sdist that binds the system library through cffi, so worker.sh must
# `apt-get install -y libvips-dev` before `pip install pyvips` (add a "vips"
# need to the jobs table and a branch for it in worker.sh). The body is then:
#
#   cd "$CARTA_REPO" && "$CARTA_PY" pipeline/photos/derive.py \
#     --workers "$CARTA_THREADS" --out "$CARTA_OUT/img" <layer>
#
# with CARTA_OUT/img promoted to the img/ prefix by spawn.sh. Harvest politeness
# (2 workers, 0.4 s pacer on Commons) stays as it is: section 4.6 says download,
# not CPU, is the constraint on the first run.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/jobs_lib.sh"
CARTA_JOB_NAME=image_transcode
job_env_defaults
if [ -f "$CARTA_REPO/pipeline/photos/derive.py" ]; then
  jlog "pipeline/photos/derive.py now exists: replace this stub with the call in its header"
fi
jlog "not implemented: pipeline/photos/derive.py (architecture section 8 step 4) is not written; see the header of this script"
exit 3
