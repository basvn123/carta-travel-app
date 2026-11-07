#!/bin/bash
# checks.sh [pytest paths...]  runs the merge checks on the current checkout, prints a summary
R=/home/user/carta-travel-app; A=$R/continent-app; L=/tmp/claude-0/-home-user-carta-travel-app/74433359-2b2b-5d09-87bb-ede55d4217b4/scratchpad/logs; mkdir -p $L
run(){ n=$1; shift; ( "$@" ) > $L/$n.log 2>&1; c=$?; echo "$n: exit $c | $(tail -3 $L/$n.log | tr '\n' ' ' | cut -c1-200)"; }
cd $A
run npmtest npm test
run lint npm run lint
run designlint node scripts/ci/design-lint.mjs
run fastbuild env FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
run cssroutes node scripts/css-routes.mjs --check ../.fastbuild/assets
run eval node scripts/eval/run.mjs
cd $R
run entry python3 -I scripts/docs/check_entry_points.py
run drift python3 -I scripts/docs/drift.py
run configref python3 -I scripts/docs/config_reference.py --check
run lineage python3 -I scripts/docs/build_lineage.py --check
args=$(grep -v "^#" tests/quarantine.txt | grep . | sed "s/^/--deselect /"); run pytest python3 -m pytest tests -q -p no:cacheprovider $args
run reference python3 -I scripts/docs/build_reference.py --check
(cd services/mcp && [ -d node_modules ] && run mcp npm test)
cd $R
run ruff /var/tmp/ruff143/bin/ruff check --select E9,F63,F7,F82 pipeline src scripts run_pipeline.py tests
for d in services/*/; do [ -f $d/requirements-dev.txt ] && grep -q ruff $d/requirements-dev.txt && run ruff-$(basename $d) /var/tmp/ruff143/bin/ruff check $d; done
