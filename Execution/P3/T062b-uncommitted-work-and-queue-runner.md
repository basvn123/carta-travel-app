# T062 Commit the stranded app-repo work and scope the queue runner's orphan killer

## Task ID

T062

## Date

2026-09-28

## What changed

Three questions were raised against T057's sweep commit and T060's small diff. Two turned out to be non-problems and are recorded here so nobody re-opens them; the third was real and is fixed.

The audit of commit 4b2d8e19f found it carries 84 files while its message names one. Every path in it was checked against main and all 84 are genuinely absent there, so this is not a duplicate of merged work: it is the never-merged output of T011 to T056 (the R2 scripts, the CSP verifier, the image ladder, _headers, wrangler.toml, the AI quota tests) that earlier tasks left uncommitted and T057 swept up. The content therefore stays. What is wrong is attribution: reverting T057 would now also revert T049 to T056's app code, which breaks the revertibility that one-branch-per-task exists to protect. That is recorded as an open row rather than repaired, because repairing it means rewriting eight stacked branches for tidiness alone.

The "additional docs/Carta/" tree in that commit was examined for removal, since 445 KB of plan documents including a 151,629-byte binary .xmind looks like the kind of thing that does not belong in git. It stays, including the binary. T058 unzips Carta-Master-Plan.xmind and walks its content.json for the task specification, and every queue prompt opens with "Read first: Original mind map", so the file is a live input to the task pipeline, not an artifact. Untracking it would break the next task that reads it. T026's rewrite plan already accounts for these paths.

T060's "already lazy" finding was verified rather than taken on trust, because a very small diff against a six-hour scope is worth checking. It holds. scripts/sync-data.mjs does strip activities.items_full into public/poi/{destId}.json: there are 3,865 shards totalling 41 MB, averaging about 10.6 KB, and the only readers are DestinationPage.jsx:125 and DayPlannerTab.jsx:722, both per-destination and on demand. Nothing fetches the catalogue at boot. The layer directories are likewise tab-gated in DestinationsTab.jsx and reached through React.lazy routes. T060's four reach measurements were reproduced exactly against a fresh build. So the small diff is the correct answer to a task whose premise prior work had already satisfied, and T060's report is right to say so.

One false alarm is worth writing down because it cost time and would cost it again. T060's gate reads activeTab === 'map' || reachHours != null, and this looks circular: reachHours can only be set through a dropdown that renders on reachAvailable, which is !!reachMinutes, which the gate controls. The apparent bug is that leaving Explore nulls the table, unmounts the dropdown, and strands the reader's cutoff while the URL still advertises it. A latch was written to fix it. Enumerating every tab-and-filter sequence showed the two gates diverge only when reachHours is null, meaning the reader opened Explore and never set a filter, and there the latch keeps fetching where T060's gate correctly stops. The reachHours != null test already carries the state across tabs, so the cutoff never strands. The latch was strictly worse and was reverted; T060 needs no fix.

The real find was in the other direction. The app repo, which is its own git tree, had four modified files sitting uncommitted, and two of them are T057's actual work: src/lib/origins.js and scripts/sync-data.mjs carry exactly the fare-metadata strip that 4b2d8e19f describes in the root repo. T057 committed the mirror and never committed the tree, which is the nested-repo trap, and T058-d and T060 have both since reasoned against code that was never in history. Two further files were adrift from older tasks: the Article 6 legal-basis table and 90-day retention section in PrivacyPolicy.jsx (T017's report describes that diff line for line, down to the git add it meant to run) and four Belgian operator entries in attribution.js (T021's four closed ledger rows: SNCB / NMBS, De Lijn, STIB / MIVB, TEC). All four files are now committed in three commits, split by owning task rather than one lump, so each stays revertible against the task that produced it.

While committing origins.js one comment was corrected. It said per-day refinements carry their own observed/expires on individual prices via outbound_expires, which stopped being true the moment T057 stripped those fields. That stale comment is part of why T058-d's dead x slot in fareProv was hard to see; the comment now says per-day expiry is not shipped at all and expiry is a merge-time gate.

Finally the queue runner. The owner's uncommitted driver edit carried three fixes, all sound and all committed as found: a single-instance guard against the 2026-09-28 triple launch, a [uint32] cast for SetThreadExecutionState (the literal 0x80000001 is a negative Int32 in PowerShell and failed the UInt32 bind, so the keep-awake flag had silently never been set), and Start-Process -Wait in place of the call operator on cmd, which waits for the child's stdout pipe to close and so let a leftover vite preview hold the driver for hours. The narrowing added here is to the orphan killer that edit introduced: it matched vite (preview|dev) across the whole machine with no parent check, so it would have killed a preview the owner started by hand in another terminal. It now kills only descendants of the process the driver spawned. That required replacing -Wait with an explicit HasExited poll, because the descendant set has to be snapshotted while the child is still alive: once the parent exits its children are reparented and a tree walk finds nothing.

## Files touched

**Modified (continent-app/, its own git tree):**
- src/lib/origins.js (T057's strip, plus the corrected provenance comment)
- scripts/sync-data.mjs (T057's per-day metadata strip at sync time)
- src/components/PrivacyPolicy.jsx (T017's legal-basis table and retention section)
- src/data/attribution.js (T021's four Belgian operator entries)

**Modified (root repo):**
- Execution/_queue/run_queue.ps1 (owner's three fixes as found, plus the scoped orphan killer)
- Execution/_OPEN.md (two new rows, one row closed)

**Created:**
- Execution/P3/T062-uncommitted-work-and-queue-runner.md

## Commands run

From the repo root unless noted.

    # Establish that the 84 files in T057's commit are not already on main
    for f in $(git show --name-only --pretty=format: 4b2d8e19f); do
      git cat-file -e main:"$f" 2>/dev/null || echo "absent from main: $f"; done

    # Verify T060's POI claim independently
    cd continent-app
    sed -n '90,105p' scripts/sync-data.mjs          # the items_full strip
    ls public/poi | wc -l                            # 3,865 shards
    du -sh public/poi                                # 41 MB
    grep -rn "fetchDestPois|fetchDestPoiMap" src/    # two on-demand readers

    # Reproduce T060's four reach measurements against a fresh build
    npm test                                         # 92/92
    CARTA_SKIP_CSP_CHECK=1 npx vite build
    npx vite preview --port 4173 --strictPort &
    node ./_reachprobe.tmp.mjs                       # throwaway, deleted after
    # Enumerate every tab/filter sequence for the two candidate gates; this is
    # what showed the suspected bug was not one. Throwaway, deleted after.

    # Commit the stranded work, split by owning task
    git add src/lib/origins.js scripts/sync-data.mjs && git commit    # bdd125d
    git add src/components/PrivacyPolicy.jsx         && git commit    # afdb35e
    git add src/data/attribution.js                 && git commit    # c2355a3
    npx eslint src/lib/origins.js src/components/PrivacyPolicy.jsx src/data/attribution.js
    npm test                                         # 92/92

    # Queue runner
    cd ..
    # parse check, then a throwaway three-level process tree proving the walk
    # finds a grandchild and does not claim a process started outside the tree
    git add Execution/_queue/run_queue.ps1 && git commit              # ac7d86902

No preview server was left running: the four vite preview processes started for the measurement were stopped explicitly.

## Config and secrets set

None.

## Before/after measurements

The reach figures are a reproduction of T060's, not a new result; they are here because they are what verifies that report rather than trusting it.

| Metric | Before | After | Delta |
|---|---|---|---|
| Uncommitted files in the app repo's tree | 4 | 0 | -4 |
| Tasks whose app-repo work exists only in the working tree | 3 (T017, T021, T057) | 0 | -3 |
| Processes the orphan killer may kill | any machine-wide vite preview or dev | descendants of the spawned agent only | scoped |
| Reach fetch, bare landing (Destinations) | none | none | unchanged |
| Reach fetch, ?tab=day | none | none | unchanged |
| Reach fetch, ?tab=map | CRL.json | CRL.json | unchanged |
| Reach fetch, ?tab=places&rh=5&o=BRU | BRU.json | BRU.json | unchanged |
| Test suite | 92/92 | 92/92 | unchanged |

The "additional docs/" tree is 445 KB across 12 files, of which the 151,629-byte .xmind is the only binary. Unchanged; the measurement is recorded because the removal question will otherwise be asked again.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A latch was added to T060's reach gate to fix a suspected stranded-filter bug | Misread the gate as circular. The reachHours != null test already carries the wanted state across a tab switch, so the reader's cutoff never strands. Enumerating every tab/filter sequence showed the two gates diverge only when no filter is set, where the latch keeps fetching and T060's gate correctly stops | Reverted before committing; the branch was deleted in both repos and App.jsx is untouched. T060 needs no fix |
| The first attempt to scope the orphan killer found no descendants at all | Start-Process -Wait returns only after the child exits, and by then its children have been reparented, so a tree walk from the dead parent's pid matches nothing | Replaced -Wait with a HasExited poll that snapshots and accumulates the descendant set every five seconds while the child is alive, then intersects it with the server pattern after it exits. Proved on a throwaway three-level tree: the walk found a PING.EXE grandchild and did not claim a sibling started outside the tree |
| A Playwright probe of the reach dropdown timed out on an invisible element, then found no control at all | The filter rail is twinned across desktop and phone, so a bare selector resolves to the hidden copy; on desktop the rail also sits behind a filter button | Used :visible, then abandoned the UI route in favour of enumerating the gate logic directly, which is what the finding actually rested on. Recorded because it is the same twinned-control trap earlier harnesses hit |
| git branch -D refused to delete the scratch branch | It was checked out in the other repo of the nested pair | Checked out the original branch in both repos first, then deleted |

## What is still open

Commit 4b2d8e19f remains mis-attributed: it carries T011 to T056's work under a T057 message, so reverting T057 would revert eight tasks' app code. Nothing is broken today and the fix costs a rewrite of every branch stacked above it, so this is recorded as a known defect for whoever merges P3 rather than repaired here. It pairs with T026, which already plans a history rewrite and already lists these paths.

The wider cause is still live: the app repo is its own git tree, so a task that commits only the root repo leaves its real work in the working tree, and nothing catches it. T057, T017 and T021 each did this, and T058-d and T060 both reasoned against code that was not in history. The queue runner's system note now forbids git add -A, which is the right rule for not stealing another task's files, but it does nothing to ensure a task commits its own tree. A gate that fails a task whose report names continent-app/ files while git -C continent-app status --porcelain is dirty would catch it.

T058-d is unchanged and still owns the dead x slot in fareProv. This task only corrected the comment that made it hard to see; fareExpired in FareProvenance.jsx:105 still tests a field that no longer ships and so can never fire.

T059-f, the duplicate runner, is closed. The race has already ended on its own: of the two instances the row names, PID 30708 has exited and only PID 22284 (started 08:55) is still alive, so nothing needs stopping today. The single-instance guard now committed prevents the recurrence, but note it only refuses a new start; it cannot separate two runners that were already alive when it landed, which is why the row is closed on the current process state rather than on the guard alone.

## Rollback procedure

Each piece reverts independently.

    # The queue runner (root repo)
    git revert ac7d86902

    # The stranded app-repo work, per owning task (continent-app/)
    cd continent-app
    git revert c2355a3            # T021's attributions
    git revert afdb35e            # T017's legal basis and retention
    git revert bdd125d            # T057's fare-metadata strip

Reverting the T057 commit restores the four per-day provenance fields and the fare_model constant to every route, which is wasteful but harmless: nothing reads them, which is why they were removed. It does not require a pipeline run, because sync-data.mjs strips at sync time and the next sync reinstates whichever behaviour is in the tree. Reverting T017's or T021's commit removes text from the Privacy Policy and rows from the Data sources screen, both of which are legal-facing: T021's four operators require attribution when their data is displayed, so do not revert that one without checking whether the Belgian feeds are still shipped.

Nothing here touches data, schema or the wire format, and no migration was applied. The report itself is revertible with the commit that carries it.
