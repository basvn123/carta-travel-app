"""Apply a lab migration only when it would actually change something.

Every module in this folder starts by running its migration file, which is
right: a lab that predates a column must grow it without a rebuild, and every
statement in those files is IF NOT EXISTS or ON CONFLICT.

The trap is that "no-op" is not free. `ALTER TABLE trips ADD COLUMN IF NOT
EXISTS ...` still takes an ACCESS EXCLUSIVE lock on trips, and ACCESS
EXCLUSIVE queues behind every open read AND blocks every read that arrives
after it. So one long-running SELECT (regionize's sample walk over 236,000
routes takes half an hour) plus one routine schema apply is enough to freeze
the whole lab: the ALTER waits for the SELECT, and the next twelve queries
wait for the ALTER. That happened, twice, with concurrent sessions in this
repo running the beach, lake, mountain and cycling passes against the same
database.

So: look first. If every column and table the migration adds is already
there, do nothing at all and take no lock. If something is missing, run the
file, which is when the lock is worth paying for.

    from schema import ensure
    ensure(conn, FILTERS_SQL)

ASCII clean, no em dashes, per project convention.
"""

import re

# ALTER TABLE <t> ADD COLUMN IF NOT EXISTS <c>
COLUMN_RE = re.compile(
    r"ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\w+)",
    re.IGNORECASE)
# CREATE TABLE IF NOT EXISTS <t>
TABLE_RE = re.compile(r"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)",
                      re.IGNORECASE)
# CREATE [UNIQUE] INDEX IF NOT EXISTS <i>
INDEX_RE = re.compile(
    r"CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+(\w+)",
    re.IGNORECASE)


def wanted(sql_text):
    """(columns, tables, indexes) the migration adds, as sets."""
    return (
        {(t.lower(), c.lower()) for t, c in COLUMN_RE.findall(sql_text)},
        {t.lower() for t in TABLE_RE.findall(sql_text)},
        {i.lower() for i in INDEX_RE.findall(sql_text)},
    )


def missing(conn, sql_text):
    """What the migration would add that is not there yet."""
    columns, tables, indexes = wanted(sql_text)
    gaps = []
    with conn.cursor() as cur:
        if columns:
            cur.execute("""
                SELECT lower(table_name), lower(column_name)
                FROM information_schema.columns
                WHERE table_schema = 'public'""")
            have = set(cur.fetchall())
            gaps += [f"{t}.{c}" for t, c in sorted(columns - have)]
        if tables:
            cur.execute("""
                SELECT lower(table_name) FROM information_schema.tables
                WHERE table_schema = 'public'""")
            have = {r[0] for r in cur.fetchall()}
            gaps += sorted(tables - have)
        if indexes:
            cur.execute("SELECT lower(indexname) FROM pg_indexes "
                        "WHERE schemaname = 'public'")
            have = {r[0] for r in cur.fetchall()}
            gaps += sorted(indexes - have)
    return gaps


def ensure(conn, path, verbose=False):
    """Run the migration at `path` only if it has something to add.

    Returns the list of missing objects it ran for, empty when it did
    nothing. The read that decides takes no lock worth the name; the write
    takes ACCESS EXCLUSIVE and is therefore only paid for once."""
    text = path.read_text(encoding="utf-8")
    gaps = missing(conn, text)
    if not gaps:
        conn.rollback()      # release the catalogue read before returning
        return []
    if verbose:
        print(f"  [schema] applying {path.name} for: {', '.join(gaps[:8])}"
              + (" ..." if len(gaps) > 8 else ""))
    conn.execute(text)
    conn.commit()
    return gaps
