"""B6 (T1167): the reference generators, on fixtures."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "docs"))
import reference_sql_tasks as st  # noqa: E402
import reference_api as api  # noqa: E402


def test_split_keeps_dollar_bodies():
    sql = "create function f() returns int as $$ select 1; select 2; $$ language sql;\nselect 3; -- c;"
    assert len(st.split_statements(sql)) == 2


def test_replay_tables_policies_functions(tmp_path):
    m = tmp_path / "supabase" / "migrations"
    m.mkdir(parents=True)
    (m / "002_a.sql").write_text(
        "create table if not exists public.t (id uuid primary key, owner uuid not null, n int default 0);\n"
        "alter table public.t enable row level security;\n"
        "alter table public.t add column if not exists extra text;\n"
        'drop policy if exists "t_sel" on public.t;\n'
        'create policy "t_sel" on public.t for select using (auth.uid() = owner);\n'
        "create or replace function public.f(a int) returns int language sql security definer as $$ select a; $$;\n"
        "create index if not exists t_idx on public.t(owner);\n"
    )
    (m / "003_a_down.sql").write_text("drop table public.t;")
    s = st.replay(tmp_path)
    t = s["tables"]["public.t"]
    assert t["rls"] and list(t["cols"]) == ["id", "owner", "n", "extra"]
    assert t["policies"]["t_sel"]["cmd"] == "select" and t["policies"]["t_sel"]["using"] == "auth.uid() = owner"
    assert next(iter(s["functions"].values()))["definer"]
    assert "t_idx" in s["indexes"]
    assert "t_sel" in st.render_supabase(tmp_path)


def test_python_and_js_api(tmp_path):
    (tmp_path / "pipeline").mkdir()
    (tmp_path / "pipeline" / "m.py").write_text('"""Mod doc."""\ndef pub(a: int) -> int:\n    """Does x."""\n\ndef _priv(): pass\n')
    lib = tmp_path / "continent-app" / "src" / "lib"
    lib.mkdir(parents=True)
    (lib / "x.js").write_text("// header line\n\n/** The y. */\nexport function y() {}\nexport const z = 1;\n")
    p = api.render_python(tmp_path)
    assert "`pub(a: int) -> int`" in p and "_priv" not in p
    j = api.render_app_lib(tmp_path)
    assert "The y." in j and "`z`" in j


def test_tasks_catalogue_real_repo():
    root = Path(__file__).resolve().parents[1]
    tasks = st.read_tasks(root)
    assert len(tasks) > 50 and all(t.get("cadence") for t in tasks)
