# Rating v5: bring the box fee harvest into the app (T761-a)

You are running unattended, started by `Execution/_queue/chain_rating_r4b.ps1` once the POI fee
harvest on the Hetzner box (carta@46.225.237.75, key `~/.ssh/carta_orchestrator_ed25519`, repo
`/home/carta/carta`) finished and the R1 to R4 merge was committed and pushed. Nobody can answer
a question; make the conservative call and write it down.

Follow CLAUDE.md. Take one task number (highest in `git log --all --oneline` plus one). Work in
the foreground: no background agents, no ScheduleWakeup.

1. Read register row T761-a and the merge report (`Execution/P7/*rating-v5-merge*.md`).
2. On the box: confirm the harvest finished cleanly (its log, the count against 44,755), then
   `git pull` the merged `main` (never discard the box's caches or uncommitted data).
3. Run what T761-a names: the `poi_significance` step that re-labels POIs with the fee tags,
   and whatever the merge report says follows it. Copy the results back to this machine.
4. Rebuild the wire (`sync-data`), the dossiers, run `npm test`, the contract check and one
   fast build; one browser look at a POI page that should now say Free.
5. Commit on `main` (`T{n}:`), push, close T761-a in `_OPEN.md`, and write a short report
   `Execution/P7/T{n}-rating-v5-box-fees.md`. Do not deploy.
