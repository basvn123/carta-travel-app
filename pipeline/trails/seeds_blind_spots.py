"""Seeds for ranges and regions the registry cannot see (T322, row T113-e).

Tier: Scheduled (read by famous_registry.build_country, after SEEDS)

The T113 coverage report found 367 GMBA ranges and 217 NUTS3 regions where the
wire publishes walks and the registry holds none, so the top-three gate had
nothing to hold them to. Each entry below names a walk that belongs to one of
the largest of those units (the unit is in the comment). The full list of
units, with the best-rated published walks as candidates for a person to
confirm, is data/reports/trails_blind_spots.json
(pipeline/trails/blind_spot_worklist.py).

What these are and are not. They are the same kind of thing as SEEDS: a
recall net, never a data source. Every name is resolved against Wikidata,
Wikipedia and OSM by famous_registry.build_country; one that resolves to
nothing ships as unresolved_seed, which is reported and never gates. They
were written from the maintainer's own knowledge of the walks, each checked
only against the names the published wire already carries, not against a
portal. A seed that turns out to be wrong costs one unresolved row. Add more
by working down the worklist, largest published count first; a portal pass
(national park or regional hiking portals for Greece and the Balkans) is the
better source where one exists.

ASCII clean, no em dashes, per project convention.
"""

SEEDS_BLIND = {
    # GMBA:12371 Central Balkan Mountains (69 published, no registry walk)
    "BG": ["Botev Peak", "Raiskoto Praskalo Waterfall"],
    # Cyclades (65), Agrafa (39), Zagori (28), Euboean Mountains (26),
    # White Mountains (25), Athos (21), Dodecanese (19), Parnon Oros (19),
    # Samos (18), Naxos (17), Beoetian/Attican Peninsula (13)
    "GR": ["Santorini Fira to Oia", "Paros Byzantine Road",
           "Mount Zas Naxos", "Mount Dirfys",
           "Agia Irini Gorge", "Gingilos", "Drakolimni Tymfi",
           "Papingo Rock Pools", "Monodendri Vikos Trail",
           "Astraka Refuge", "Mount Kerkis Samos", "Seven Springs Rhodes",
           "Mount Parnitha", "Mount Hymettus", "Megali Tourla Parnon",
           "Mount Athos Summit from Agia Anna"],
    # GMBA:15159 Kopaonik (32; the wire files it under XK)
    "XK": ["Josif Pancic Hiking Transversal", "Pancicev Vrh"],
    # GMBA:15470 Papuk (15)
    "HR": ["Papuk Jankovac", "Rupnica Waterfall"],
    # GMBA:12462 Gennargentu (19), GMBA:15774 Aspromonte (11)
    "IT": ["Punta La Marmora", "Gola di Gorropu", "Cala Goloritze Trail",
           "Sentiero dell'Inglese Aspromonte"],
    # GMBA:20879 Little Carpathians (11)
    "SK": ["Stefanikova Magistrala"],
    # GMBA:19369 Central Highlands, GMBA:20604 Hekla Landmannalaugar (8 each)
    "IS": ["Kristinartindar", "Svartifoss", "Hrafntinnusker"],
}
