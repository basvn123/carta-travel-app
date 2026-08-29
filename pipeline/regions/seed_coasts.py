"""The hand named coastal stretches, and how a name lands on a cut.

This is the one human decided file of the coast layer, in the same spirit as
seed_peaks.py and seed_lakes.py: coasts.py cuts the shoreline into honest 40
to 120 km stretches on its own, and this table puts the names travellers
actually search for on top of that cut. A stretch no seed reaches keeps its
honest generated label ("West-Vlaanderen coast"), which is correct and dull;
a seed makes it "the Belgian coast", which is what a person calls it.

Each entry:

    slug      stable id fragment; the stretch becomes COAST:CC-SLUG
    name      the traveller's name, printed as is (proper nouns are not
              translated, same as the rest of the catalogue)
    cc        country the stretch must belong to (a seed never renames a
              stretch across a border)
    lat, lon  an anchor on or near that coast; the seed claims the nearest
              unnamed stretch within SNAP_KM
    span_km   optional. When the named coast is longer than one cut (the
              Costa de la Luz runs ~200 km), the claimed stretch absorbs
              adjacent unnamed same country stretches until it reaches
              span_km, capped at 1.3x so a name never swallows a coast it
              does not cover.

Anchors are deliberately coarse (a town on the coast, the middle of a bay):
SNAP_KM of slack means "near Nerja" is enough and nobody needs to digitise
a shoreline to name it. A seed that finds nothing within reach is reported
and skipped, never guessed.

ASCII clean, no em dashes, per project convention.
"""

import numpy as np
import shapely

SNAP_KM = 35.0
MERGE_TOUCH_KM = 6.0   # stretches this close along the shore count as adjacent
SPAN_SLACK = 1.3

SEEDS = [
    # --- Spain, Mediterranean north to south ---
    dict(slug="COSTA-BRAVA", name="Costa Brava", cc="ES", lat=41.97, lon=3.22, span_km=160),
    dict(slug="MARESME", name="Costa del Maresme", cc="ES", lat=41.55, lon=2.55),
    dict(slug="COSTA-DORADA", name="Costa Dorada", cc="ES", lat=41.07, lon=1.15, span_km=160),
    dict(slug="AZAHAR", name="Costa del Azahar", cc="ES", lat=40.05, lon=0.05, span_km=140),
    dict(slug="VALENCIA", name="Costa de Valencia", cc="ES", lat=39.35, lon=-0.30),
    dict(slug="COSTA-BLANCA", name="Costa Blanca", cc="ES", lat=38.53, lon=-0.10, span_km=170),
    dict(slug="CALIDA", name="Costa Calida", cc="ES", lat=37.60, lon=-1.00, span_km=150),
    dict(slug="ALMERIA", name="Costa de Almeria", cc="ES", lat=36.85, lon=-2.30, span_km=150),
    dict(slug="TROPICAL", name="Costa Tropical", cc="ES", lat=36.72, lon=-3.50),
    dict(slug="COSTA-DEL-SOL", name="Costa del Sol", cc="ES", lat=36.50, lon=-4.70, span_km=150),
    dict(slug="LUZ-CADIZ", name="Costa de la Luz (Cadiz)", cc="ES", lat=36.30, lon=-6.10, span_km=140),
    dict(slug="LUZ-HUELVA", name="Costa de la Luz (Huelva)", cc="ES", lat=37.10, lon=-7.00, span_km=110),
    # --- Spain, Atlantic ---
    dict(slug="RIAS-BAIXAS", name="Rias Baixas", cc="ES", lat=42.40, lon=-8.80, span_km=180),
    dict(slug="COSTA-DA-MORTE", name="Costa da Morte", cc="ES", lat=43.05, lon=-9.15, span_km=120),
    dict(slug="RIAS-ALTAS", name="Rias Altas", cc="ES", lat=43.60, lon=-8.05, span_km=150),
    dict(slug="COSTA-VERDE", name="Costa Verde", cc="ES", lat=43.55, lon=-5.90, span_km=200),
    dict(slug="CANTABRIA", name="Costa de Cantabria", cc="ES", lat=43.45, lon=-3.80, span_km=130),
    dict(slug="COSTA-VASCA", name="Costa Vasca", cc="ES", lat=43.35, lon=-2.50, span_km=120),
    # --- Spain, islands ---
    dict(slug="BADIA-DE-PALMA", name="Badia de Palma", cc="ES", lat=39.50, lon=2.60),
    dict(slug="TRAMUNTANA", name="Tramuntana coast", cc="ES", lat=39.85, lon=2.75, span_km=100),
    dict(slug="LLEVANT", name="Mallorca Llevant", cc="ES", lat=39.58, lon=3.38, span_km=100),

    # --- Portugal ---
    dict(slug="BARLAVENTO", name="Algarve Barlavento", cc="PT", lat=37.10, lon=-8.60, span_km=110),
    dict(slug="SOTAVENTO", name="Algarve Sotavento", cc="PT", lat=37.08, lon=-7.70, span_km=100),
    dict(slug="VICENTINA", name="Costa Vicentina", cc="PT", lat=37.50, lon=-8.80, span_km=110),
    dict(slug="COSTA-AZUL", name="Costa Azul", cc="PT", lat=38.45, lon=-8.85, span_km=100),
    dict(slug="LISBOA", name="Lisbon coast", cc="PT", lat=38.65, lon=-9.40),
    dict(slug="PRATA", name="Costa de Prata", cc="PT", lat=39.60, lon=-9.10, span_km=180),
    dict(slug="COSTA-VERDE", name="Costa Verde", cc="PT", lat=41.30, lon=-8.75, span_km=130),

    # --- France, north to Biscay ---
    dict(slug="OPALE", name="Cote d'Opale", cc="FR", lat=50.75, lon=1.60, span_km=120),
    dict(slug="ALBATRE", name="Cote d'Albatre", cc="FR", lat=49.75, lon=0.40, span_km=130),
    dict(slug="FLEURIE", name="Cote Fleurie", cc="FR", lat=49.30, lon=0.00),
    dict(slug="COTENTIN", name="Cotentin peninsula", cc="FR", lat=49.60, lon=-1.60, span_km=150),
    dict(slug="EMERAUDE", name="Cote d'Emeraude", cc="FR", lat=48.65, lon=-2.10, span_km=110),
    dict(slug="GRANIT-ROSE", name="Cote de Granit Rose", cc="FR", lat=48.83, lon=-3.45),
    dict(slug="CORNOUAILLE", name="Cornouaille coast", cc="FR", lat=47.90, lon=-4.20, span_km=140),
    dict(slug="MORBIHAN", name="Golfe du Morbihan", cc="FR", lat=47.55, lon=-2.80, span_km=120),
    dict(slug="AMOUR", name="Cote d'Amour", cc="FR", lat=47.28, lon=-2.35),
    dict(slug="LUMIERE", name="Cote de Lumiere", cc="FR", lat=46.50, lon=-1.80, span_km=130),
    # The Basque coast claims its stretch BEFORE the Cote d'Argent's span
    # merge reaches the border: seeds apply in list order, and the first
    # cut of this file had the Argent swallow Biarritz.
    dict(slug="BASQUE", name="Cote Basque", cc="FR", lat=43.40, lon=-1.60),
    dict(slug="ARGENT", name="Cote d'Argent", cc="FR", lat=44.50, lon=-1.25, span_km=180),
    # --- France, Mediterranean ---
    dict(slug="VERMEILLE", name="Cote Vermeille", cc="FR", lat=42.50, lon=3.13),
    dict(slug="AMETHYSTE", name="Cote d'Amethyste", cc="FR", lat=43.30, lon=3.50, span_km=180),
    dict(slug="CAMARGUE", name="Camargue coast", cc="FR", lat=43.45, lon=4.50, span_km=100),
    dict(slug="COTE-BLEUE", name="Cote Bleue", cc="FR", lat=43.33, lon=5.15),
    dict(slug="CALANQUES", name="Calanques de Marseille", cc="FR", lat=43.21, lon=5.45),
    dict(slug="VAR", name="Cote d'Azur (Var)", cc="FR", lat=43.15, lon=6.35, span_km=140),
    dict(slug="RIVIERA", name="French Riviera", cc="FR", lat=43.55, lon=7.10, span_km=110),

    # --- Italy, Ligurian to Adriatic ---
    dict(slug="FIORI", name="Riviera dei Fiori", cc="IT", lat=43.82, lon=7.90),
    dict(slug="PONENTE", name="Riviera di Ponente", cc="IT", lat=44.15, lon=8.30, span_km=110),
    dict(slug="LEVANTE", name="Riviera di Levante", cc="IT", lat=44.30, lon=9.40, span_km=110),
    dict(slug="VERSILIA", name="Versilia", cc="IT", lat=43.90, lon=10.20),
    dict(slug="ETRUSCHI", name="Costa degli Etruschi", cc="IT", lat=43.20, lon=10.55, span_km=120),
    dict(slug="MAREMMA", name="Maremma coast", cc="IT", lat=42.65, lon=11.05, span_km=120),
    dict(slug="ULISSE", name="Riviera di Ulisse", cc="IT", lat=41.25, lon=13.35),
    dict(slug="AMALFI", name="Amalfi Coast", cc="IT", lat=40.63, lon=14.55),
    dict(slug="CILENTO", name="Cilento coast", cc="IT", lat=40.10, lon=15.10, span_km=130),
    dict(slug="DEI", name="Costa degli Dei", cc="IT", lat=38.68, lon=15.90),
    dict(slug="VIOLA", name="Costa Viola", cc="IT", lat=38.25, lon=15.75),
    dict(slug="SALENTO-ION", name="Salento (Ionian)", cc="IT", lat=39.95, lon=18.00, span_km=110),
    dict(slug="SALENTO-ADR", name="Salento (Adriatic)", cc="IT", lat=40.15, lon=18.45, span_km=110),
    dict(slug="GARGANO", name="Gargano", cc="IT", lat=41.85, lon=16.05, span_km=130),
    dict(slug="TRABOCCHI", name="Costa dei Trabocchi", cc="IT", lat=42.25, lon=14.50),
    dict(slug="CONERO", name="Conero Riviera", cc="IT", lat=43.55, lon=13.60),
    dict(slug="ROMAGNOLA", name="Riviera Romagnola", cc="IT", lat=44.15, lon=12.50, span_km=110),
    dict(slug="VENETA", name="Venetian coast", cc="IT", lat=45.30, lon=12.30, span_km=100),
    # --- Italy, islands ---
    dict(slug="CICLOPI", name="Riviera dei Ciclopi", cc="IT", lat=37.60, lon=15.17),
    dict(slug="SMERALDA", name="Costa Smeralda", cc="IT", lat=41.10, lon=9.53),
    dict(slug="COSTA-VERDE-SAR", name="Costa Verde (Sardinia)", cc="IT", lat=39.50, lon=8.45),

    # --- Croatia ---
    dict(slug="ISTRIA", name="Istrian coast", cc="HR", lat=45.20, lon=13.60, span_km=120),
    dict(slug="KVARNER", name="Kvarner Gulf", cc="HR", lat=45.00, lon=14.60, span_km=120),
    dict(slug="ZADAR", name="Zadar riviera", cc="HR", lat=44.05, lon=15.25, span_km=120),
    dict(slug="SIBENIK", name="Sibenik riviera", cc="HR", lat=43.70, lon=15.85),
    dict(slug="SPLIT", name="Split riviera", cc="HR", lat=43.45, lon=16.60, span_km=100),
    dict(slug="MAKARSKA", name="Makarska riviera", cc="HR", lat=43.25, lon=17.05),
    dict(slug="DUBROVNIK", name="Dubrovnik riviera", cc="HR", lat=42.65, lon=18.05, span_km=110),
    dict(slug="KRK", name="Krk", cc="HR", lat=45.07, lon=14.60),
    dict(slug="CRES", name="Cres", cc="HR", lat=44.96, lon=14.40),
    dict(slug="LOSINJ", name="Losinj", cc="HR", lat=44.60, lon=14.40),
    dict(slug="RAB", name="Rab", cc="HR", lat=44.75, lon=14.76),
    dict(slug="PAG", name="Pag", cc="HR", lat=44.45, lon=15.05),
    dict(slug="DUGI-OTOK", name="Dugi otok", cc="HR", lat=44.00, lon=15.05),
    dict(slug="BRAC", name="Brac", cc="HR", lat=43.32, lon=16.65),
    dict(slug="HVAR", name="Hvar", cc="HR", lat=43.15, lon=16.60),
    dict(slug="VIS", name="Vis", cc="HR", lat=43.05, lon=16.15),
    dict(slug="KORCULA", name="Korcula", cc="HR", lat=42.95, lon=17.05),
    dict(slug="MLJET", name="Mljet", cc="HR", lat=42.75, lon=17.50),

    # --- Greece ---
    dict(slug="KASSANDRA", name="Kassandra", cc="GR", lat=40.00, lon=23.40),
    dict(slug="SITHONIA", name="Sithonia", cc="GR", lat=40.10, lon=23.80),
    dict(slug="OLYMPIAN", name="Olympian Riviera", cc="GR", lat=40.00, lon=22.60),
    dict(slug="PELION", name="Pelion coast", cc="GR", lat=39.30, lon=23.15, span_km=110),
    dict(slug="ATHENS-RIVIERA", name="Athens Riviera", cc="GR", lat=37.85, lon=23.75),
    dict(slug="MANI", name="Mani coast", cc="GR", lat=36.75, lon=22.35, span_km=130),
    dict(slug="NAVARINO", name="Navarino coast", cc="GR", lat=36.95, lon=21.70),
    dict(slug="CORFU", name="Corfu", cc="GR", lat=39.65, lon=19.80),
    dict(slug="LEFKADA", name="Lefkada", cc="GR", lat=38.70, lon=20.60),
    dict(slug="KEFALONIA", name="Kefalonia", cc="GR", lat=38.20, lon=20.50),
    dict(slug="ZAKYNTHOS", name="Zakynthos", cc="GR", lat=37.78, lon=20.75),
    dict(slug="MYKONOS", name="Mykonos", cc="GR", lat=37.45, lon=25.35),
    dict(slug="PAROS", name="Paros", cc="GR", lat=37.05, lon=25.15),
    dict(slug="NAXOS", name="Naxos", cc="GR", lat=37.05, lon=25.50),
    dict(slug="MILOS", name="Milos", cc="GR", lat=36.70, lon=24.43),
    dict(slug="SANTORINI", name="Santorini", cc="GR", lat=36.40, lon=25.45),
    dict(slug="RHODES", name="Rhodes", cc="GR", lat=36.20, lon=28.00),
    dict(slug="KOS", name="Kos", cc="GR", lat=36.85, lon=27.20),

    # --- Great Britain ---
    dict(slug="NORTH-CORNWALL", name="North Cornwall coast", cc="GB", lat=50.60, lon=-4.90, span_km=130),
    dict(slug="SOUTH-CORNWALL", name="South Cornwall coast", cc="GB", lat=50.15, lon=-5.05, span_km=130),
    dict(slug="SOUTH-DEVON", name="South Devon coast", cc="GB", lat=50.30, lon=-3.70, span_km=110),
    dict(slug="JURASSIC", name="Jurassic Coast", cc="GB", lat=50.65, lon=-2.60, span_km=150),
    dict(slug="SUSSEX", name="Sussex coast", cc="GB", lat=50.80, lon=-0.40, span_km=110),
    dict(slug="KENT", name="Kent coast", cc="GB", lat=51.15, lon=1.30, span_km=110),
    dict(slug="NORFOLK", name="Norfolk coast", cc="GB", lat=52.95, lon=1.00, span_km=130),
    dict(slug="SUFFOLK", name="Suffolk Heritage Coast", cc="GB", lat=52.25, lon=1.60),
    dict(slug="YORKSHIRE", name="Yorkshire coast", cc="GB", lat=54.40, lon=-0.55, span_km=110),
    dict(slug="NORTHUMBERLAND", name="Northumberland coast", cc="GB", lat=55.50, lon=-1.65, span_km=110),
    dict(slug="NORTH-DEVON", name="North Devon coast", cc="GB", lat=51.05, lon=-4.20, span_km=110),
    dict(slug="GOWER", name="Gower Peninsula", cc="GB", lat=51.57, lon=-4.15),
    dict(slug="PEMBROKESHIRE", name="Pembrokeshire coast", cc="GB", lat=51.70, lon=-5.10, span_km=140),
    dict(slug="CARDIGAN-BAY", name="Cardigan Bay", cc="GB", lat=52.45, lon=-4.05, span_km=150),
    dict(slug="LLYN", name="Llyn Peninsula", cc="GB", lat=52.90, lon=-4.50, span_km=100),
    dict(slug="ANGLESEY", name="Anglesey", cc="GB", lat=53.28, lon=-4.40, span_km=130),
    dict(slug="AYRSHIRE", name="Ayrshire coast", cc="GB", lat=55.45, lon=-4.65),
    dict(slug="ARRAN", name="Isle of Arran", cc="GB", lat=55.58, lon=-5.25),
    dict(slug="ISLAY", name="Islay", cc="GB", lat=55.75, lon=-6.20),
    dict(slug="MULL", name="Isle of Mull", cc="GB", lat=56.45, lon=-6.00),
    dict(slug="SKYE", name="Isle of Skye", cc="GB", lat=57.30, lon=-6.20),
    dict(slug="WESTER-ROSS", name="Wester Ross coast", cc="GB", lat=57.60, lon=-5.80, span_km=150),
    dict(slug="MORAY-FIRTH", name="Moray Firth coast", cc="GB", lat=57.70, lon=-3.50, span_km=130),
    dict(slug="FIFE", name="Fife coast", cc="GB", lat=56.20, lon=-2.70),
    dict(slug="EAST-LOTHIAN", name="East Lothian coast", cc="GB", lat=56.00, lon=-2.60),
    dict(slug="CAUSEWAY", name="Causeway Coast", cc="GB", lat=55.23, lon=-6.50, span_km=110),
    dict(slug="MOURNE", name="Mourne coast", cc="GB", lat=54.20, lon=-5.85),

    # --- Ireland ---
    dict(slug="WICKLOW", name="Wicklow coast", cc="IE", lat=52.95, lon=-6.00),
    dict(slug="COPPER-COAST", name="Copper Coast", cc="IE", lat=52.15, lon=-7.35),
    dict(slug="WEST-CORK", name="West Cork coast", cc="IE", lat=51.55, lon=-9.30, span_km=150),
    dict(slug="RING-OF-KERRY", name="Ring of Kerry coast", cc="IE", lat=51.85, lon=-10.00, span_km=140),
    dict(slug="DINGLE", name="Dingle Peninsula", cc="IE", lat=52.15, lon=-10.30, span_km=110),
    dict(slug="CLARE", name="Clare coast", cc="IE", lat=52.95, lon=-9.40, span_km=110),
    dict(slug="CONNEMARA", name="Connemara coast", cc="IE", lat=53.40, lon=-9.90, span_km=140),
    dict(slug="MAYO", name="Mayo coast", cc="IE", lat=53.95, lon=-9.90, span_km=140),
    dict(slug="DONEGAL", name="Donegal coast", cc="IE", lat=54.95, lon=-8.40, span_km=180),

    # --- Low Countries and Germany ---
    dict(slug="BELGIAN-COAST", name="Belgian coast", cc="BE", lat=51.20, lon=2.90, span_km=70),
    dict(slug="ZEELAND", name="Zeeland delta", cc="NL", lat=51.60, lon=3.60, span_km=140),
    dict(slug="HOLLAND-DUNES", name="Holland dune coast", cc="NL", lat=52.30, lon=4.50, span_km=140),
    dict(slug="TEXEL", name="Texel", cc="NL", lat=53.05, lon=4.80),
    dict(slug="TERSCHELLING", name="Terschelling", cc="NL", lat=53.40, lon=5.35),
    dict(slug="AMELAND", name="Ameland", cc="NL", lat=53.45, lon=5.75),
    dict(slug="EAST-FRISIAN", name="East Frisian Islands", cc="DE", lat=53.70, lon=7.20),
    dict(slug="SYLT", name="Sylt", cc="DE", lat=54.90, lon=8.33),
    dict(slug="HOLSTEIN-BALTIC", name="Baltic fjord coast", cc="DE", lat=54.40, lon=10.20, span_km=130),
    dict(slug="MECKLENBURG", name="Mecklenburg Baltic coast", cc="DE", lat=54.10, lon=11.60, span_km=130),
    dict(slug="RUEGEN", name="Ruegen", cc="DE", lat=54.45, lon=13.40, span_km=200),
    dict(slug="USEDOM", name="Usedom", cc="DE", lat=54.00, lon=14.00),

    # --- Nordics ---
    dict(slug="JUTLAND-WEST", name="Jutland west coast", cc="DK", lat=55.80, lon=8.10, span_km=250),
    dict(slug="NORTH-JUTLAND", name="North Jutland coast", cc="DK", lat=57.60, lon=10.00, span_km=150),
    dict(slug="DANISH-RIVIERA", name="Danish Riviera", cc="DK", lat=56.00, lon=12.40),
    dict(slug="BORNHOLM", name="Bornholm", cc="DK", lat=55.10, lon=14.90),
    dict(slug="MON", name="Mon", cc="DK", lat=54.97, lon=12.55),
    dict(slug="BOHUSLAN", name="Bohuslan coast", cc="SE", lat=58.30, lon=11.35, span_km=180),
    dict(slug="HALLAND", name="Halland coast", cc="SE", lat=56.80, lon=12.60, span_km=130),
    dict(slug="SKANE", name="Skane coast", cc="SE", lat=55.45, lon=13.60, span_km=150),
    dict(slug="OLAND", name="Oland", cc="SE", lat=56.70, lon=16.60),
    dict(slug="GOTLAND", name="Gotland", cc="SE", lat=57.50, lon=18.50, span_km=250),
    dict(slug="STOCKHOLM-ARCH", name="Stockholm Archipelago", cc="SE", lat=59.30, lon=18.80),
    dict(slug="HIGH-COAST", name="High Coast", cc="SE", lat=62.90, lon=18.30, span_km=120),
    dict(slug="OSLOFJORD", name="Oslofjord", cc="NO", lat=59.40, lon=10.60, span_km=150),
    dict(slug="SORLANDET", name="Sorlandet coast", cc="NO", lat=58.10, lon=7.80, span_km=200),
    dict(slug="JAEREN", name="Jaeren beaches", cc="NO", lat=58.75, lon=5.55),
    dict(slug="HARDANGER", name="Hardangerfjord", cc="NO", lat=60.40, lon=6.40, span_km=200),
    dict(slug="SOGNEFJORD", name="Sognefjord", cc="NO", lat=61.10, lon=6.50, span_km=250),
    dict(slug="SUNNMORE", name="Sunnmore coast", cc="NO", lat=62.40, lon=6.20, span_km=150),
    dict(slug="LOFOTEN", name="Lofoten", cc="NO", lat=68.15, lon=13.70, span_km=200),
    dict(slug="VESTERALEN", name="Vesteralen", cc="NO", lat=68.80, lon=15.00, span_km=200),
    dict(slug="SENJA", name="Senja", cc="NO", lat=69.30, lon=17.30),
    dict(slug="ALAND", name="Aland Islands", cc="FI", lat=60.20, lon=20.00, span_km=250),
    dict(slug="TURKU-ARCH", name="Turku Archipelago", cc="FI", lat=60.20, lon=21.90),
    dict(slug="SNAEFELLSNES", name="Snaefellsnes", cc="IS", lat=64.85, lon=-23.30, span_km=130),
    dict(slug="WESTFJORDS", name="Westfjords", cc="IS", lat=65.90, lon=-23.00, span_km=250),
    dict(slug="SOUTH-ICELAND", name="South Iceland coast", cc="IS", lat=63.50, lon=-19.00, span_km=250),
    dict(slug="REYKJANES", name="Reykjanes", cc="IS", lat=63.85, lon=-22.50),

    # --- Baltics and Poland ---
    dict(slug="LAHEMAA", name="Estonian north coast", cc="EE", lat=59.55, lon=25.70, span_km=130),
    dict(slug="SAAREMAA", name="Saaremaa", cc="EE", lat=58.40, lon=22.50, span_km=250),
    dict(slug="HIIUMAA", name="Hiiumaa", cc="EE", lat=58.90, lon=22.60),
    dict(slug="KURZEME", name="Kurzeme coast", cc="LV", lat=57.05, lon=21.45, span_km=200),
    dict(slug="RIGA-GULF", name="Gulf of Riga coast", cc="LV", lat=57.00, lon=23.60, span_km=150),
    dict(slug="LITHUANIAN-COAST", name="Lithuanian coast", cc="LT", lat=55.90, lon=21.06, span_km=90),
    dict(slug="CURONIAN-SPIT", name="Curonian Spit", cc="LT", lat=55.40, lon=21.10),
    dict(slug="POMERANIA-WEST", name="West Pomeranian coast", cc="PL", lat=53.95, lon=14.45, span_km=130),
    dict(slug="KOSZALIN", name="Middle Pomeranian coast", cc="PL", lat=54.30, lon=16.15, span_km=150),
    dict(slug="KASHUBIA", name="Kashubian coast", cc="PL", lat=54.70, lon=18.00, span_km=130),
    dict(slug="HEL", name="Hel Peninsula", cc="PL", lat=54.70, lon=18.55),
    dict(slug="GDANSK-BAY", name="Bay of Gdansk coast", cc="PL", lat=54.40, lon=18.65),

    # --- Adriatic east and the rest ---
    dict(slug="SLOVENIAN-ISTRIA", name="Slovenian Istria", cc="SI", lat=45.52, lon=13.60, span_km=60),
    dict(slug="KOTOR", name="Bay of Kotor", cc="ME", lat=42.45, lon=18.60),
    dict(slug="BUDVA", name="Budva Riviera", cc="ME", lat=42.28, lon=18.85),
    dict(slug="ULCINJ", name="Ulcinj Riviera", cc="ME", lat=41.93, lon=19.20),
    dict(slug="ALBANIAN-RIVIERA", name="Albanian Riviera", cc="AL", lat=40.10, lon=19.70, span_km=120),
    dict(slug="DURRES", name="Durres coast", cc="AL", lat=41.30, lon=19.45, span_km=100),

    # --- Cyprus and Turkey ---
    dict(slug="PAPHOS", name="Paphos coast", cc="CY", lat=34.75, lon=32.40),
    dict(slug="AKAMAS", name="Akamas", cc="CY", lat=35.05, lon=32.30),
    dict(slug="LIMASSOL", name="Limassol coast", cc="CY", lat=34.65, lon=33.00),
    dict(slug="AYIA-NAPA", name="Ayia Napa coast", cc="CY", lat=34.98, lon=34.00),
    dict(slug="LYCIAN", name="Lycian coast", cc="TR", lat=36.30, lon=29.30, span_km=200),
    dict(slug="TURKISH-RIVIERA", name="Turkish Riviera", cc="TR", lat=36.85, lon=30.90, span_km=200),
    dict(slug="BODRUM", name="Bodrum peninsula", cc="TR", lat=37.05, lon=27.40),
    dict(slug="CESME", name="Cesme peninsula", cc="TR", lat=38.30, lon=26.30),
]


def _probe(geom, step=25):
    """Every step-th vertex as a MultiPoint. Distance questions against a
    stretch are answered off this instead of the full shoreline: a point
    within 35 km of the coast is within 35 km + one vertex gap of the
    probe, and the probe is hundreds of times cheaper to measure against."""
    pts = []
    for part in geom.geoms:
        xy = np.asarray(part.coords)
        pts.append(xy[::step])
        pts.append(xy[-1:])
    return shapely.multipoints(np.vstack(pts))


def apply(rows):
    """Put the names on the cut. Mutates `rows` (the pre GeoDataFrame dicts
    from coasts.build_stretches, geometries in metres) in place and returns
    how many stretches ended up carrying a seed name."""
    from pyproj import Transformer
    t = Transformer.from_crs("EPSG:4326", "EPSG:3035", always_xy=True)

    probes = [_probe(row["geom_m"]) for row in rows]
    absorbed = set()
    named = 0
    for seed in SEEDS:
        x, y = t.transform(seed["lon"], seed["lat"])
        pt = shapely.Point(x, y)
        best, best_d = None, SNAP_KM * 1000.0
        for i, row in enumerate(rows):
            if i in absorbed or row["named"] or row["cc"] != seed["cc"]:
                continue
            d = shapely.distance(pt, probes[i])
            if d < best_d:
                best, best_d = i, d
        if best is None:
            print(f"[regions]   seed {seed['cc']}-{seed['slug']} found no "
                  f"unnamed stretch within {SNAP_KM:.0f} km, skipped")
            continue
        row = rows[best]
        row["id"] = f"COAST:{seed['cc']}-{seed['slug']}"
        row["name"] = seed["name"]
        row["named"] = True
        named += 1

        span = seed.get("span_km")
        cap = span * SPAN_SLACK if span else 0.0
        while span and row["length_km"] < span:
            nxt, nxt_d = None, MERGE_TOUCH_KM * 1000.0
            for j, other in enumerate(rows):
                if j in absorbed or other is row or other["named"]:
                    continue
                if other["cc"] != seed["cc"]:
                    continue
                if row["length_km"] + other["length_km"] > cap:
                    continue
                d = shapely.distance(probes[best], probes[j])
                if d < nxt_d:
                    nxt, nxt_d = j, d
            if nxt is None:
                break
            other = rows[nxt]
            # Concatenate parts rather than union: a union of two touching
            # MultiLineStrings can answer with a GeometryCollection, and the
            # GeoPackage layer holds one geometry type.
            row["geom_m"] = shapely.MultiLineString(
                list(row["geom_m"].geoms) + list(other["geom_m"].geoms))
            row["length_km"] = round(row["length_km"] + other["length_km"], 1)
            merged_n3 = set(row["n3_list"].split(",")) | set(other["n3_list"].split(","))
            row["n3_list"] = ",".join(sorted(merged_n3))
            probes[best] = _probe(row["geom_m"])
            absorbed.add(nxt)

    if absorbed:
        keep = [row for i, row in enumerate(rows) if i not in absorbed]
        rows.clear()
        rows.extend(keep)
    return named
