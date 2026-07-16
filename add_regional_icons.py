"""
add_regional_icons.py - seed world-class excursion sights into items_full.

The activity harvest is city-local, so famous landmarks that sit OUTSIDE a
city (Mont-Saint-Michel near Saint-Malo, Neuschwanstein near Innsbruck's
region, Versailles outside Paris) never entered the data, and the Day
planner's "Worth the detour" shelf had nothing to show. This pass appends a
curated list of iconic, verifiably famous sights to every destination whose
CITY CENTRE lies within ASSIGN_KM of the sight, unless an item of the same
name already exists there. rate=3 + heritage flags make them surface via
poiScore; desc/img/wiki are filled afterwards by enrich_must_descs.py.

Idempotent: re-running never duplicates (name match, case/diacritic-lax).
Run:  python add_regional_icons.py
"""
import json
import math
import sys
import unicodedata
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).parent
DATA = ROOT / "app_data" / "app_data.json"
ASSIGN_KM = 90

# name, kind, lat, lon, heritage(UNESCO or national register)
ICONS = [
    ("Mont-Saint-Michel", "Ancient site", 48.6361, -1.5115, True),
    ("Palace of Versailles", "Palace", 48.8049, 2.1204, True),
    ("Chateau de Chambord", "Castle", 47.6162, 1.5170, True),
    ("Carcassonne Citadel", "Fortress", 43.2065, 2.3628, True),
    ("Pont du Gard", "Roman site", 43.9475, 4.5350, True),
    ("Etretat Cliffs", "Viewpoint", 49.7070, 0.1990, False),
    ("Dune du Pilat", "Dunes", 44.5890, -1.2140, False),
    ("Gorges du Verdon", "Canyon", 43.7496, 6.3285, False),
    ("Neuschwanstein Castle", "Castle", 47.5576, 10.7498, False),
    ("Zugspitze", "Peak", 47.4212, 10.9863, False),
    ("Rothenburg ob der Tauber", "Ancient site", 49.3779, 10.1866, False),
    ("Windsor Castle", "Castle", 51.4839, -0.6044, False),
    ("Stonehenge", "Ancient site", 51.1789, -1.8262, True),
    ("Giant's Causeway", "Nature reserve", 55.2408, -6.5116, True),
    ("Cliffs of Moher", "Viewpoint", 52.9715, -9.4309, False),
    ("Glendalough", "Monastery", 53.0101, -6.3274, False),
    ("Sintra (Pena Palace)", "Palace", 38.7876, -9.3904, True),
    ("Cabo da Roca", "Viewpoint", 38.7804, -9.4989, False),
    ("Toledo Old Town", "Ancient site", 39.8628, -4.0273, True),
    ("Segovia Aqueduct", "Roman site", 40.9481, -4.1184, True),
    ("El Escorial", "Palace", 40.5891, -4.1477, True),
    ("Montserrat Monastery", "Monastery", 41.5931, 1.8383, False),
    ("Ronda", "Ancient site", 36.7462, -5.1612, False),
    ("Caminito del Rey", "Trail", 36.9330, -4.7900, False),
    ("Pompeii", "Ancient site", 40.7489, 14.4989, True),
    ("Mount Vesuvius", "Peak", 40.8220, 14.4260, False),
    ("Amalfi Coast (Positano)", "Viewpoint", 40.6280, 14.4850, True),
    ("Capri (Blue Grotto)", "Cave", 40.5610, 14.2054, False),
    ("Villa d'Este, Tivoli", "Palace", 41.9633, 12.7958, True),
    ("Ostia Antica", "Roman site", 41.7554, 12.2916, False),
    ("Orvieto", "Ancient site", 42.7186, 12.1110, False),
    ("San Gimignano", "Ancient site", 43.4677, 11.0431, True),
    ("Siena Old Town", "Ancient site", 43.3188, 11.3308, True),
    ("Pisa (Leaning Tower)", "Tower", 43.7230, 10.3966, True),
    ("Lake Bled", "Lake", 46.3625, 14.0936, False),
    ("Postojna Cave", "Cave", 45.7828, 14.2039, False),
    ("Predjama Castle", "Castle", 45.8156, 14.1276, False),
    ("Plitvice Lakes", "Nature reserve", 44.8654, 15.5820, True),
    ("Krka Waterfalls", "Waterfall", 43.8060, 15.9725, False),
    ("Trogir Old Town", "Ancient site", 43.5165, 16.2514, True),
    ("Mostar Old Bridge", "Bridge", 43.3372, 17.8151, True),
    ("Kotor Old Town", "Ancient site", 42.4247, 18.7712, True),
    ("Ostrog Monastery", "Monastery", 42.6748, 19.0294, False),
    ("Meteora Monasteries", "Monastery", 39.7217, 21.6306, True),
    ("Delphi", "Ancient site", 38.4824, 22.5010, True),
    ("Mycenae", "Ancient site", 37.7308, 22.7560, True),
    ("Epidaurus Theatre", "Ancient site", 37.5960, 23.0790, True),
    ("Cape Sounion (Temple of Poseidon)", "Ancient site", 37.6503, 24.0247, False),
    ("Knossos", "Ancient site", 35.2980, 25.1631, False),
    ("Rila Monastery", "Monastery", 42.1335, 23.3402, True),
    ("Bran Castle", "Castle", 45.5150, 25.3672, False),
    ("Peles Castle", "Castle", 45.3600, 25.5426, False),
    ("Auschwitz-Birkenau Memorial", "Memorial", 50.0359, 19.1783, True),
    ("Wieliczka Salt Mine", "Cave", 49.9834, 20.0553, True),
    ("Malbork Castle", "Castle", 54.0399, 19.0280, True),
    ("Karlstejn Castle", "Castle", 49.9394, 14.1883, False),
    ("Kutna Hora (Bone Church)", "Church", 49.9482, 15.2887, True),
    ("Cesky Krumlov", "Ancient site", 48.8127, 14.3175, True),
    ("Hallstatt", "Ancient site", 47.5622, 13.6493, True),
    ("Melk Abbey", "Monastery", 48.2280, 15.3320, True),
    ("Salzkammergut (St. Wolfgang)", "Lake", 47.7400, 13.4450, False),
    ("Rhine Falls", "Waterfall", 47.6779, 8.6158, False),
    ("Jungfraujoch", "Peak", 46.5475, 7.9851, True),
    ("Chillon Castle", "Castle", 46.4142, 6.9273, False),
    ("Mount Pilatus", "Peak", 46.9790, 8.2550, False),
    ("Keukenhof Gardens", "Garden", 52.2697, 4.5462, False),
    ("Kinderdijk Windmills", "Ancient site", 51.8839, 4.6447, True),
    ("Zaanse Schans", "Ancient site", 52.4741, 4.8164, False),
    ("Bruges Historic Centre", "Ancient site", 51.2085, 3.2251, True),
    ("Dinant Citadel", "Citadel", 50.2606, 4.9124, False),
    ("Geirangerfjord", "Viewpoint", 62.1049, 7.0940, True),
    ("Preikestolen (Pulpit Rock)", "Viewpoint", 58.9864, 6.1904, False),
    ("Golden Circle (Gullfoss)", "Waterfall", 64.3271, -20.1199, False),
    ("Thingvellir", "Nature reserve", 64.2559, -21.1295, True),
    ("Blue Lagoon", "Thermal baths", 63.8804, -22.4495, False),
    ("Kronborg Castle", "Castle", 56.0389, 12.6214, True),
    ("Frederiksborg Castle", "Castle", 55.9349, 12.3011, False),
    ("Drottningholm Palace", "Palace", 59.3217, 17.8866, True),
    ("Sighisoara Citadel", "Citadel", 46.2197, 24.7926, True),
    ("Butrint", "Ancient site", 39.7456, 20.0208, True),
    ("Berat Old Town", "Ancient site", 40.7086, 19.9522, True),
    ("Gjirokaster Old Town", "Ancient site", 40.0758, 20.1389, True),
    ("Ohrid Old Town", "Ancient site", 41.1129, 20.8016, True),
    ("Matka Canyon", "Canyon", 41.9520, 21.3000, False),
    ("Vikos Gorge", "Canyon", 39.9060, 20.7480, False),
    ("Curonian Spit", "Dunes", 55.2700, 20.9800, True),
    ("Trakai Castle", "Castle", 54.6520, 24.9340, False),
    ("Rundale Palace", "Palace", 56.4139, 24.0247, False),
    ("Lahemaa National Park", "Nature reserve", 59.5580, 25.7130, False),
    ("Mdina Old Town", "Ancient site", 35.8867, 14.4033, False),
    ("Blue Grotto (Malta)", "Cave", 35.8214, 14.4550, False),
    ("Cinque Terre (Vernazza)", "Ancient site", 44.1350, 9.6840, True),
    ("Portofino", "Viewpoint", 44.3032, 9.2097, False),
    ("Herculaneum", "Ancient site", 40.8060, 14.3482, True),
    ("Eltz Castle", "Castle", 50.2054, 7.3360, False),
    ("Loreley Rock", "Viewpoint", 50.1391, 7.7290, True),
    ("Cochem Castle", "Castle", 50.1460, 7.1670, False),
    ("Colmar Old Town", "Ancient site", 48.0790, 7.3585, False),
    ("Chateau du Haut-Koenigsbourg", "Castle", 48.2494, 7.3444, False),
    ("Annecy Old Town", "Ancient site", 45.8992, 6.1294, False),
    ("Chamonix (Aiguille du Midi)", "Peak", 45.8790, 6.8878, False),
]


def norm(s):
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode()
    return "".join(ch for ch in s.lower() if ch.isalnum())


def hav(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


def all_icons():
    """Built-in round-1 list plus any researched rounds shipped as JSON
    (app_data/icons_round*.json: [{name, kind, lat, lon, heritage}])."""
    icons = list(ICONS)
    seen = {norm(n) for n, *_ in icons}
    for path in sorted(ROOT.glob("app_data/icons_round*.json")):
        for e in json.loads(path.read_text(encoding="utf-8")):
            if norm(e["name"]) in seen:
                continue
            icons.append((e["name"], e["kind"], e["lat"], e["lon"], bool(e.get("heritage"))))
            seen.add(norm(e["name"]))
    return icons


def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    icons = all_icons()
    print(f"{len(icons)} icons in catalogue")
    added = 0
    touched = set()
    for dest_id, dest in data["destinations"].items():
        act = dest.get("activities")
        if not act or not act.get("items_full"):
            continue
        clat = dest.get("city_lat", dest.get("lat"))
        clon = dest.get("city_lon", dest.get("lon"))
        if clat is None:
            continue
        names = {norm(it.get("name")) for it in act["items_full"]}
        for name, kind, lat, lon, heritage in icons:
            km = hav(clat, clon, lat, lon)
            if km > ASSIGN_KM:
                continue
            key = norm(name)
            # Skip if an item with (roughly) this name already exists.
            if any(key in n or n in key for n in names if len(n) > 5) or key in names:
                continue
            item = {"name": name, "kind": kind, "lat": lat, "lon": lon, "rate": 3}
            if heritage:
                item["heritage"] = True
            act["items_full"].append(item)
            names.add(key)
            added += 1
            touched.add(dest_id)
    DATA.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"added {added} icon placements across {len(touched)} destinations")


if __name__ == "__main__":
    main()
