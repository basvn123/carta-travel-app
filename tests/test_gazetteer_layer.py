"""G12: pipeline/gazetteer_layer.py builds Explore search's place list.

On a tiny GeoNames fixture: towns outside Europe or its box are left out,
names come in the six languages without historic ones, every name routes to
a shard that holds its town, regions and countries get a box, and a build
without alternateNamesV2 still ships the main and ASCII names.
"""
import io
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline import gazetteer_layer as G  # noqa: E402


def _city(gid, name, ascii_name, lat, lon, cc, a1, pop):
    cols = [str(gid), name, ascii_name, "", str(lat), str(lon), "P", "PPL", cc, "", a1,
            "", "", "", str(pop), "", "", "Europe/X", "2026-01-01"]
    return "\t".join(cols) + "\n"


def _fixture(tmp_path, with_alts=True):
    cache = tmp_path / "cache"
    gn = cache / "geonames"
    gn.mkdir(parents=True)
    (cache / "geonames_cities500.txt").write_text("".join([
        _city(2886242, "Köln", "Koeln", 50.9333, 6.95, "DE", "07", 1024621),
        _city(3176959, "Florence", "Florence", 43.7792, 11.2463, "IT", "16", 367150),
        _city(2657928, "Zermatt", "Zermatt", 46.02, 7.7486, "CH", "VS", 6629),
        _city(1, "Omsk", "Omsk", 54.98, 73.37, "RU", "54", 1100000),       # Asia: out
        _city(2, "Boston", "Boston", 42.36, -71.06, "US", "MA", 600000),   # not Europe
        _city(3, "Sankt Gallen", "Sankt Gallen", 47.42, 9.37, "CH", "SG", 75000),
    ]), encoding="utf-8")
    (gn / "admin1CodesASCII.txt").write_text(
        "IT.16\tTuscany\tTuscany\t3165361\nCH.VS\tValais\tValais\t2658205\n"
        "US.MA\tMassachusetts\tMassachusetts\t6254926\n", encoding="utf-8")
    (gn / "countryInfo.txt").write_text(
        "#ISO\tISO3\n"
        + "IT\tITA\t380\tIT\tItaly\tRome\t301230\t60482200\tEU\t.it\tEUR\tEuro\t39\t\t\tit\t3175395\t\t\n"
        + "US\tUSA\t840\tUS\tUnited States\tWashington\t9629091\t327167434\tNA\t.us\tUSD\tDollar\t1\t\t\ten\t6252001\t\t\n",
        encoding="utf-8")
    if with_alts:
        lines = [
            "1\t2886242\tnl\tKeulen\t\t\t\t\t\t\n",
            "2\t2886242\tfr\tCologne\t\t\t\t\t\t\n",
            "3\t2886242\tla\tColonia Agrippina\t\t\t\t\t\t\n",     # not a Carta language
            "4\t3176959\tde\tFlorenz\t\t\t\t\t\t\n",
            "5\t3176959\tit\tFirenze\t\t\t\t\t\t\n",
            "6\t3176959\ten\tFlorentia\t\t\t\t1\t\t\n",           # historic
            "7\t3165361\tit\tToscana\t\t\t\t\t\t\n",
            "8\t3175395\tnl\tItalië\t\t\t\t\t\t\n",
        ]
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("alternateNamesV2.txt", "".join(lines))
        (gn / "alternateNamesV2.zip").write_bytes(buf.getvalue())
    return cache


def _load(out):
    index = json.loads((out / "index.json").read_text(encoding="utf-8"))
    shards = {s["file"]: json.loads((out / s["file"]).read_text(encoding="utf-8")) for s in index["shards"]}
    areas = json.loads((out / "areas.json").read_text(encoding="utf-8"))
    return index, shards, areas


def _shard_for(index, key):
    froms = [s["from"] for s in index["shards"]]
    i = max(j for j, f in enumerate(froms) if f <= key)
    return index["shards"][i]["file"]


def test_build_keeps_europe_and_six_languages(tmp_path):
    out = tmp_path / "out"
    index = G.build(_fixture(tmp_path), out, shards=3)
    assert index["langs"] == ["en", "nl", "de", "fr", "es", "it"]
    assert index["towns"] == 4  # Omsk and Boston are out
    _, shards, _ = _load(out)
    rows = {r[0]: r for rs in shards.values() for r in rs}
    assert set(rows) == {2886242, 3176959, 2657928, 3}
    # Koeln folds apart from Köln (koeln, koln), so the ASCII form is kept too.
    assert rows[2886242][1] == ["Köln", "Koeln", "Keulen", "Cologne"]
    assert "Florentia" not in rows[3176959][1]
    assert "Colonia Agrippina" not in rows[2886242][1]


def test_every_name_routes_to_a_shard_that_holds_it(tmp_path):
    out = tmp_path / "out"
    index = G.build(_fixture(tmp_path), out, shards=3)
    _, shards, _ = _load(out)
    for rows in shards.values():
        for row in rows:
            for name in row[1]:
                held = shards[_shard_for(index, G.fold(name))]
                assert any(r[0] == row[0] for r in held), name


def test_rows_carry_the_name_for_each_ui_language(tmp_path):
    out = tmp_path / "out"
    G.build(_fixture(tmp_path), out, shards=3)
    _, shards, areas = _load(out)
    rows = {r[0]: r for rs in shards.values() for r in rs}
    assert rows[2886242][7] == {"fr": "Cologne", "nl": "Keulen"}
    assert len(rows[2657928]) == 7  # Zermatt: no other name, no map
    regions = {r[0]: r for r in areas["regions"]}
    assert regions["IT.16"][4] == {"it": "Toscana"}
    assert {c[0]: c for c in areas["countries"]}["IT"][4] == {"nl": "Italië"}


def test_areas_have_boxes_and_names(tmp_path):
    out = tmp_path / "out"
    G.build(_fixture(tmp_path), out, shards=3)
    _, _, areas = _load(out)
    regions = {r[0]: r for r in areas["regions"]}
    assert set(regions) == {"IT.16", "CH.VS"}  # no US region; CH.SG has no admin1 row here
    assert regions["IT.16"][1] == ["Tuscany", "Toscana"]
    w, s, e, n = regions["CH.VS"][2]
    assert w < 7.7486 < e and s < 46.02 < n
    countries = {c[0]: c for c in areas["countries"]}
    assert set(countries) == {"IT"}
    assert countries["IT"][1] == ["Italy", "Italië"]


def test_without_alternate_names_it_still_builds(tmp_path):
    out = tmp_path / "out"
    index = G.build(_fixture(tmp_path, with_alts=False), out, shards=2)
    assert index["langs"] == []
    _, shards, _ = _load(out)
    rows = {r[0]: r for rs in shards.values() for r in rs}
    assert rows[3176959][1] == ["Florence"]


def test_split_is_balanced_and_never_splits_a_key():
    keyed = [(f"{c}{i:03d}", i) for c in "abcd" for i in range(50)] + [("b000", 999)]
    parts = G.split_shards(keyed, 4)
    assert len(parts) == 4
    assert parts[0][0] == ""
    sizes = [len(p) for _, p in parts]
    assert max(sizes) - min(sizes) <= 2
    for i in range(1, len(parts)):
        assert parts[i - 1][1][-1][0] < parts[i][1][0][0]
        assert parts[i][1][0][0].startswith(parts[i][0])


def test_fold_matches_the_app():
    assert G.fold("Kraków") == "krakow"
    assert G.fold("Łódź") == "lodz"
    assert G.fold("Saint-Malo") == "saint malo"
    assert G.fold("Straße") == "strasse"
