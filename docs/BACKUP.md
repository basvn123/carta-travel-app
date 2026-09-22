# Backing up the live Supabase project

Carta's user data lives in one Supabase project, `ntssxktaduxzpsmejwyv`, in
eu-central-2. Everything a user has ever saved is there: profiles, trip plans,
day plans, shares, friends, achievements, passes, paywall events. None of it is
reproducible from the pipeline, because none of it came from the pipeline.

Migrations are applied by pasting SQL into the Supabase SQL editor. `supabase
db push` is not used against this project; migration `007_passes.sql` says so in
its own header. The SQL editor has no undo and no confirmation step. A `drop`
or a bad `update` in there is final. These scripts exist so that it is not.

Take a backup before every hand-applied migration. P2 and P4 each run several.

## The two scripts

`ops/backup_supabase.sh` dumps the live project and encrypts the result.
`ops/restore_supabase.sh` decrypts a dump and restores it into a local
database so you can look at it.

The dump uses `pg_dump --format=custom`, which is compressed and lets
`pg_restore` extract a single table. A plain `.sql` dump cannot do that, and
the ability to pull back one table is the difference between a five-minute
recovery and a full rollback.

`pg_dump` streams directly into `gpg`. The unencrypted dump is never written to
disk at any point. That matters because the thing being dumped is a database of
real users' personal data on a laptop that is not a secure host.

Encryption is symmetric (`gpg --symmetric`, AES256) rather than a keypair.
There is no GPG key on this machine, and a backup encrypted to a key that only
exists on the laptop you are trying to recover from is not a backup. A
passphrase in a password manager survives the laptop.

## What you need

You do not need the database password. This is worth stating plainly, because
looking for it is a dead end: Supabase shows that password exactly once, at
project creation, and stores only a hash. It cannot be read back from the
dashboard. The only thing the dashboard offers is a reset, which would break
anything still holding the old one.

Instead the script asks the Supabase CLI for a temporary login role. The CLI
mints a fresh one on every run, authorised by the access token that
`supabase login` stored in `~/.supabase/access-token`. The credential is
different each time and is dead by the time anyone could read it out of a log.
So you need to be logged in (`supabase login`) and linked, which this
repository already is via `supabase/.temp/project-ref`.

That leaves one secret, which is yours to choose:

`CARTA_BACKUP_PASSPHRASE` is what the dump is encrypted with. Store it in a
password manager. Storing it alongside the dumps defeats the entire exercise.

## Taking a backup

Read the passphrase in at a prompt rather than putting it on the command line:

```
read -rs CARTA_BACKUP_PASSPHRASE
export CARTA_BACKUP_PASSPHRASE
ops/backup_supabase.sh
```

Paste the passphrase at the blank line and press enter. Nothing echoes, nothing
lands in shell history, and no quoting is involved, which matters: a passphrase
containing a single quote breaks `export VAR='...'` by closing the string early,
and one containing `$` or a backtick gets mangled by double quotes instead.
Generating passphrases as letters and digits only sidesteps the whole problem
and costs no strength, since nobody types this by hand.

Output goes to `~/carta-backups/carta-<UTC timestamp>.dump.gpg` with a
`.sha256` sidecar next to it. Override the directory with `--out /d/somewhere`
or by setting `CARTA_BACKUP_DIR`.

The script refuses to declare success on a file under 2 KB. A truncated dump
that looks like a file is worse than no dump, because you will trust it.

## Getting it off the laptop

The script does not do this and cannot, because it does not know where your
off-machine storage is. A dump sitting in `~/carta-backups` is not a backup; it
is a second copy on the same disk that the laptop's failure takes with it.

Copy both the `.dump.gpg` and its `.sha256` to somewhere that is not this
machine. Any of these is fine, since the file is already encrypted and the
destination never sees plaintext: a cloud drive, an external disk kept
elsewhere, or a private object store. Keep the last few, not just the newest,
so a corruption you notice late still has a clean predecessor behind it.

## Testing a restore

```
read -rs CARTA_BACKUP_PASSPHRASE
export CARTA_BACKUP_PASSPHRASE
ops/restore_supabase.sh ~/carta-backups/carta-20260922T150000Z.dump.gpg
```

This verifies the checksum, decrypts to a temporary file, restores into a local
database called `carta_restore_test`, and prints the row count of every table.
The temporary decrypted file is deleted on exit, including on failure or
ctrl-c.

It needs a local PostgreSQL that you can reach. Set `PGHOST`, `PGPORT` and
`PGUSER` if yours is not `localhost:5432` as `postgres`.

The restore prints errors and that is expected. On a bare local Postgres they
are all the same one: the RLS policies call `auth.uid()`, and there is no
`auth` schema outside Supabase, so every policy fails to create. A measured run
produced several dozen such errors and nothing else. The exact count tracks the
number of policies in the database and so moves with every migration; what
matters is that they are all that one cause. An error mentioning anything other
than the missing `auth` schema is worth reading.

This matters for what a local restore is and is not. The policies are in the
dump and restore correctly into a real Supabase project, which has the `auth`
schema. A local restore gives you the tables, the data, the constraints, the
indexes, the triggers and the functions, but the tables land with RLS unenforced.
Treat the local copy as a place to read data, never as somewhere to point an
app.

Judge the restore by the row counts at the end, not by a silent log.

Deliberately, this script will not restore to the live project. Restoring over
a live database mid-incident turns one bad migration into two. Restore locally,
confirm what you need is there, then decide by hand what to copy back.

## Restoring for real

There is no one-command path back to the live project, on purpose. When you
actually need to recover:

Restore locally first, with the script above, and confirm the data you lost is
present. Then take a fresh backup of the live project as it currently stands,
broken or not, because you may need to compare against it later. Then move only
what you need, table by table, through `pg_restore --data-only --table=<name>`
against the live connection string, or by exporting the specific rows and
inserting them in the SQL editor.

Restoring the whole dump over a live project would also revert every migration
applied since the dump was taken, and would drop rows that real users wrote in
the meantime.

## What is not covered

These scripts dump the `public` schema only. The temporary login role has no
rights on `storage` or `auth`, so neither can be included; asking for them
fails the dump outright with "permission denied for schema storage". The app
does not use Supabase Storage, so nothing is lost there today. If that changes,
buckets will need a separate backup path.

`auth.users` is not in the dump either. If accounts themselves were ever lost,
users would re-authenticate through Google and the profile rows keyed by their
user id would need re-linking by hand.

Edge Functions are in `supabase/functions/` in git and are not part of the
dump. Secrets set on the project (the Gemini key) are not in the dump either.
