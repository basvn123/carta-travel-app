"""Audit app_data.json for missing pieces across all destinations."""
import json, collections

DATA = "app_data/app_data.json"
d = json.load(open(DATA, encoding="utf-8"))
dests = d["destinations"]
print(f"total destinations: {len(dests)}")

# per-field presence counters
miss = collections.defaultdict(list)
cat_counter = collections.Counter()
country_counter = collections.Counter()
tier_counter = collections.Counter()

def has_items_full(dd):
    a = dd.get("activities") or {}
    return bool(a.get("items_full"))

def n_items_full(dd):
    a = dd.get("activities") or {}
    return len(a.get("items_full") or [])

def n_items(dd):
    a = dd.get("activities") or {}
    return len(a.get("items") or [])

for did, dd in dests.items():
    tier_counter[dd.get("tier")] += 1
    country_counter[dd.get("country")] += 1
    for c in (dd.get("categories") or []):
        cat_counter[c] += 1
    if not dd.get("image"):
        miss["no_image"].append(did)
    if not (dd.get("activities") and (dd["activities"].get("items") or dd["activities"].get("items_full"))):
        miss["no_activities"].append(did)
    if not has_items_full(dd):
        miss["no_items_full"].append(did)
    elif n_items_full(dd) < 6:
        miss["thin_items_full(<6)"].append(f"{did}={n_items_full(dd)}")
    if not dd.get("rating"):
        miss["no_rating"].append(did)
    if not dd.get("beauty"):
        miss["no_beauty"].append(did)
    if not (dd.get("costs") and dd["costs"].get("meal_mid_eur")):
        miss["no_costs"].append(did)
    if not (dd.get("accommodation") and dd["accommodation"].get("per_person_night_eur")):
        miss["no_accommodation"].append(did)
    if not (dd.get("categories")):
        miss["no_categories"].append(did)
    if not dd.get("blurb"):
        miss["no_blurb"].append(did)
    # scenic walks? check for a walks/scenic field
    if "scenic_walks" not in dd and "walks" not in dd:
        miss["no_walks_field"].append(did)

print("\n=== MISSING FIELD COUNTS ===")
for k in sorted(miss, key=lambda k: -len(miss[k])):
    print(f"{k:28} {len(miss[k])}")

print("\n=== tiers ===", dict(tier_counter))

print("\n=== items_full coverage by tier ===")
for tier in ("airport", "gem"):
    ids = [x for x, dd in dests.items() if dd.get("tier") == tier]
    withf = [x for x in ids if has_items_full(dests[x])]
    print(f"{tier}: {len(withf)}/{len(ids)} have items_full")

print("\n=== category counts (top 40) ===")
for c, n in cat_counter.most_common(40):
    print(f"{c:18} {n}")

# beaches, nature, walks
print("\n=== thematic coverage ===")
for theme in ["beach","coast","island","lake","mountains","hiking","national-park","nature","surf","diving","wine","village","town","city"]:
    print(f"{theme:16} {cat_counter.get(theme,0)}")

# per country dest count
print("\n=== destinations per country ===")
for c, n in country_counter.most_common():
    print(f"{c:28} {n}")
