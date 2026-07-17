"""Merge curated_appeal entries for the 2026-07c gem batch (43 new dests).
Idempotent: overwrites the keys it owns, leaves the rest untouched.
appeal 0-10 editorial traveller-appeal; gem=True only for under-the-radar spots
(nudges the hidden_gem badge, never the score)."""
import json
from pathlib import Path

P = Path("app_data/curated_appeal.json")

NEW = {
    "gem:lefkada":        (7.5, False, "Ionian cliff beaches, Porto Katsiki turquoise"),
    "gem:bol-brac":       (7.5, False, "Zlatni Rat, Croatia's signature beach"),
    "gem:tarifa":         (7.0, False, "Two seas, kite mecca, wild Atlantic beaches"),
    "gem:vieste":         (7.0, True,  "Gargano sea stacks, whitewashed clifftop town"),
    "gem:villasimius":    (7.0, True,  "Sardinian powder bays and flamingo lagoons"),
    "gem:la-maddalena":   (7.5, True,  "Pink granite archipelago, Caribbean water"),
    "gem:sagres":         (7.0, False, "End of Europe cliffs, surf and sunsets"),
    "gem:comporta":       (6.5, True,  "Empty Atlantic sand, rice fields, pine"),
    "gem:ios":            (6.5, False, "Cyclades party island plus Mylopotas beach"),
    "gem:carvoeiro":      (6.5, True,  "Algarve cove, Praia da Marinha cliff trail"),
    "gem:gallipoli-puglia":(6.5, True, "Baroque island town ringed by Ionian beaches"),
    "gem:otranto":        (7.0, True,  "Byzantine mosaic cathedral, turquoise coves"),

    "gem:snowdonia":      (8.0, False, "Wales's finest mountains, Snowdon, glacial lakes"),
    "gem:brecon-beacons": (7.0, True,  "Welsh uplands, waterfalls, Pen y Fan"),
    "gem:peak-district":  (7.0, False, "England's first park, gritstone edges and dales"),
    "gem:yorkshire-dales":(7.0, True,  "Green dales, limestone scars, waterfalls"),
    "gem:dartmoor":       (6.5, True,  "Granite tors, wild ponies, bronze-age moor"),
    "gem:cairngorms":     (7.5, False, "Largest UK park, subarctic plateau, forest"),
    "gem:loch-lomond":    (7.5, False, "Bonnie banks, wooded islands, Highland edge"),
    "gem:ordesa":         (8.0, False, "Pyrenean grand canyon, cirque of waterfalls"),
    "gem:camargue":       (7.0, True,  "Flamingos, white horses, delta wilderness"),
    "gem:kranjska-gora":  (7.0, True,  "Julian Alps resort, Vrsic pass, Planica"),
    "gem:titisee":        (6.0, False, "Black Forest lake, classic if touristy"),
    "gem:transfagarasan": (8.0, True,  "Spectacular alpine road of hairpins"),
    "gem:jurassic-coast": (7.5, False, "Durdle Door arch, fossil cliffs, Dorset"),
    "gem:samaria-gorge":  (8.0, False, "Europe's longest gorge walk to the Libyan Sea"),
    "gem:pulpit-rock":    (8.5, False, "Iconic flat cliff 600 m over the Lysefjord"),
    "gem:millau":         (6.5, True,  "Tarn gorges beneath the tallest bridge"),

    "gem:malbork":        (7.5, False, "World's largest brick castle, UNESCO"),
    "gem:bacharach":      (7.0, True,  "Half-timbered Rhine wine village below castles"),
    "gem:aachen":         (7.0, False, "Charlemagne's cathedral, Germany's first UNESCO"),
    "gem:vicenza":        (7.5, False, "Palladio's city of villas, UNESCO"),
    "gem:padua":          (7.5, False, "Giotto's Scrovegni frescoes, oldest botanic garden"),
    "gem:parma":          (7.0, False, "Food capital, pink baptistery, Correggio domes"),
    "gem:chartres":       (7.5, False, "Purest Gothic cathedral, blue windows"),
    "gem:figueres":       (7.0, False, "Dali's surreal Theatre-Museum"),
    "gem:peniscola":      (7.0, True,  "Walled papal sea castle ringed by sand"),
    "gem:trento":         (7.0, False, "Alpine cathedral city, frescoed palazzi"),
    "gem:portovenere":    (8.0, True,  "Cinque Terre's UNESCO twin, Byron's cave"),
    "gem:langhe":         (7.5, True,  "Barolo vineyards, truffles, UNESCO hills"),
    "gem:bergamo-alta":   (7.5, True,  "Venetian-walled hilltop old town of towers"),
    "gem:erfurt":         (7.0, True,  "Medieval city, timbered merchant bridge"),
    "gem:potsdam":        (7.5, False, "Frederick the Great's Sanssouci palaces, UNESCO"),
}

data = json.loads(P.read_text(encoding="utf-8"))
before = len(data)
for k, (appeal, gem, why) in NEW.items():
    data[k] = {"appeal": appeal, "gem": gem, "why": why}
P.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"curated_appeal: {before} -> {len(data)} entries ({len(NEW)} written)")
