"""Fact-checked trip-type corrections for GEM-tier destinations (2026-06-08).

The gems carry hand-written tag strings in `destinations_master.py`, but a full
audit of all 447 destinations found many gems missing obvious, filter-relevant
tags (UNESCO sites not tagged `unesco`, the Lofoten Islands not tagged `island`,
Zermatt/Matterhorn missing `mountains`/`iconic`, the Masurian Lakes invisible to
the Nature chip because their only tags were `sailing,quiet`, Torshavn tagged
only `remote`, etc.). Each entry below was verified against UNESCO World Heritage
listings and tourism sources.

`apply_gem_categories.py` patches these into both app_data.json files in place
(idempotent). The airport tier has its own module (`airport_categories.py`); the
two patchers are independent (airports vs gems) and can run in any order.

Filter mapping reminder (continent-app/src/trip_kinds.js): only `beach` hits the
Beach chip (`coast` is descriptive); UNESCO/medieval/renaissance/baroque/roman/
byzantine/ottoman/historic/art/ruins/cathedral/castle -> Cultural; nightlife/
party -> Nightlife; iconic/romantic -> Romantic; nature/national-park/wilderness/
fjord/lake/valley/countryside/volcanic -> Nature; alps/mountains/skiing ->
Mountains; island -> Island.
"""

# Keyed by the destination id used in app_data ("gem:<slug>"). Each value is the
# FULL replacement category list for that gem.
GEM_CATEGORIES = {
    # Albania
    "gem:berat": ["town", "unesco", "historic", "ottoman"],
    "gem:gjirokaster": ["town", "unesco", "ottoman", "historic"],
    # Austria - Wachau (Durnstein) is a UNESCO cultural landscape; Hallstatt sits
    # on a lake under the Dachstein massif.
    "gem:durnstein": ["town", "wine", "wachau", "unesco", "castle"],
    "gem:hallstatt": ["village", "unesco", "fairytale", "lake", "mountains"],
    # Belgium - Bruges historic centre is UNESCO + quintessentially romantic.
    "gem:antwerp": ["city", "art", "historic"],
    "gem:bruges": ["city", "medieval", "unesco", "romantic", "iconic"],
    # Croatia
    "gem:hvar": ["island", "coast", "party", "lavender", "beach", "nightlife"],
    "gem:plitvice": ["unesco", "national-park", "iconic"],
    # Czechia - Karlovy Vary inscribed 2021 (Great Spa Towns of Europe).
    "gem:karlovy-vary": ["spa", "thermal", "unesco", "historic"],
    "gem:kutna-hora": ["town", "unesco", "medieval"],
    # Denmark - Torshavn is the Faroese capital, not merely "remote".
    "gem:torshavn": ["city", "coast", "nature", "remote"],
    # France
    "gem:aix": ["city", "provence", "art", "historic"],
    "gem:loire-valley": ["valley", "wine", "unesco", "castle"],
    "gem:provence-luberon": ["provence", "lavender", "iconic", "countryside"],
    "gem:saint-malo": ["coast", "brittany", "historic"],
    "gem:strasbourg": ["city", "unesco", "alsace", "historic"],
    "gem:etretat": ["coast", "normandy", "nature", "iconic"],
    # Germany - Baden-Baden (Great Spa Towns 2021), Wurzburg Residence UNESCO,
    # Neuschwanstein is the iconic fairytale castle, Saxon Switzerland is a NP.
    "gem:baden-baden": ["spa", "thermal", "unesco", "historic"],
    "gem:wurzburg": ["city", "wine", "baroque", "unesco"],
    "gem:neuschwanstein": ["castle", "fairytale", "alps", "iconic"],
    "gem:dresden-saxon": ["mountains", "hiking", "bridge", "nature", "national-park"],
    # Greece - Meteora's cliff monasteries.
    "gem:meteora": ["unesco", "iconic", "nature", "mountains"],
    # Iceland - Vik's black-sand beach (Reynisfjara).
    "gem:vik": ["coast", "iconic", "beach", "nature"],
    # Ireland
    "gem:galway-cliffs": ["city", "coast", "music", "nature"],
    "gem:dingle": ["coast", "nature"],
    # Italy
    "gem:alberobello": ["village", "unesco", "iconic"],
    "gem:amalfi-coast": ["coast", "unesco", "iconic", "beach"],
    "gem:cinque-terre": ["coast", "unesco", "iconic", "beach", "village"],
    "gem:lecce": ["city", "baroque", "puglia", "historic"],
    "gem:matera": ["city", "unesco", "historic", "iconic"],
    "gem:polignano": ["coast", "puglia", "beach", "iconic"],
    "gem:como": ["lake", "alps", "iconic", "romantic"],
    "gem:tuscany-siena": ["tuscany", "countryside", "wine", "unesco", "medieval"],
    # Monaco
    "gem:monaco-mc": ["country", "luxury", "coast", "iconic"],
    # Montenegro - Kotor bay/old town is UNESCO + iconic; Budva is the party coast.
    "gem:budva": ["coast", "beach", "nightlife", "medieval"],
    "gem:kotor": ["unesco", "medieval", "coast", "iconic"],
    # Netherlands
    "gem:utrecht": ["city", "university", "historic"],
    # Norway - Lofoten IS islands; Sognefjord is dramatic nature.
    "gem:lofoten": ["arctic", "iconic", "island", "nature"],
    "gem:bergen-nearby": ["fjord", "nature"],  # Sognefjord
    # Poland - the Masurian Lakes (were only sailing,quiet).
    "gem:masuria": ["sailing", "quiet", "lake", "nature"],
    # Portugal
    "gem:sintra": ["town", "unesco", "fairytale", "castle", "iconic"],
    "gem:nazare": ["coast", "surf", "beach"],
    "gem:obidos": ["village", "medieval", "castle"],
    "gem:tavira": ["town", "coast", "quiet", "historic", "beach"],
    # Romania - Brasov sits in the Carpathians.
    "gem:brasov": ["city", "castle", "medieval", "carpathians", "mountains"],
    # Slovenia
    "gem:piran": ["coast", "medieval", "romantic"],
    "gem:postojna": ["adventure", "castle", "family", "iconic", "nature"],
    # Spain - Granada/Alhambra, Cordoba/Mezquita, Ronda, Segovia.
    "gem:granada": ["city", "unesco", "andalusia", "historic", "iconic"],
    "gem:cordoba": ["city", "unesco", "andalusia", "historic"],
    "gem:ronda": ["town", "andalusia", "iconic", "historic"],
    "gem:segovia": ["city", "unesco", "roman", "iconic", "castle"],
    # Sweden
    "gem:dalarna": ["countryside", "nature", "lake"],
    # Switzerland - the Bernese Oberland + Matterhorn.
    "gem:grindelwald": ["alps", "village", "mountains", "skiing"],
    "gem:interlaken": ["alps", "adventure", "mountains", "lake"],
    "gem:lauterbrunnen": ["valley", "alps", "mountains", "nature"],
    "gem:lucerne": ["lake", "alps", "city", "historic", "iconic"],
    "gem:st-moritz": ["alps", "luxury", "skiing", "mountains"],
    "gem:zermatt": ["alps", "mountains", "skiing", "iconic"],
    # United Kingdom
    "gem:cambridge": ["city", "university", "historic"],
    "gem:isle-of-skye": ["island", "scotland", "iconic", "nature"],
    "gem:lake-district": ["mountains", "national-park", "lake"],
    "gem:cotswolds": ["countryside", "village"],
    "gem:oxford": ["city", "university", "gothic", "historic"],
    "gem:york": ["city", "medieval", "roman", "historic"],
    "gem:st-ives": ["coast", "beach", "cornwall", "art"],
}


def categories_for(dest_id):
    """Return the corrected category list for a gem id, or None if no override."""
    return GEM_CATEGORIES.get(dest_id)
