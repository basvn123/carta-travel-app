"""place_registries.py - the authoritative registers that say "this place".

Europe is full of juries that have already done the work of deciding which
small places are worth going to, and almost none of that ever reached Carta's
catalogue. Les Plus Beaux Villages de France has picked 155 villages since
1982. I Borghi piu belli d'Italia has picked ~390. There are national
equivalents in a dozen countries, plus the labels an outsider never finds:
Les Plus Beaux Detours (the 2,000-20,000 band that is too big for the villages
list and too small for a guidebook, and which is exactly the band that has a
hotel and a station), Petites Cites de Caractere, Bandiera Arancione.

This module is the table of those registers. It carries no data, only where
to find each one: which Wikidata entity, which property links members to it,
and what kind of thing membership proves. harvest_place_signals.py resolves
them into actual places; score_place_candidates.py turns `kind` into weight.

LEVEL matters and is the trap. The same research turned up registers with
145,505 members (Swedish ancient monuments), 52,944 (French monuments
historiques) and 32,728 (UK scheduled monuments). Those are MONUMENT-level:
their members are churches and barrows, not destinations, and feeding them to
a destination finder would mark every parish in Sweden as a place to visit.
Only `level: "place"` entries feed coverage. Monument-level registers are
recorded here, unused, so nobody researches them a second time.

MODELLED is the other trap. A register can be real, famous and completely
absent from Wikidata - Los Pueblos mas bonitos de Espana has 121 members and
zero P463 statements. Those carry `modelled: False` and a `fallback` pointing
at the list that does exist, so the gap is visible rather than silently
missing. Verify the live counts any time with:

    python pipeline/harvest_place_signals.py --verify

Sources: live WDQS counts measured 2026-08-17, plus a 12-region research pass
whose France/Benelux/UK-Ireland/Nordics/Baltics legs completed.
"""

# kind -> what membership proves, and how much the scorer should trust it.
# Values live in score_place_candidates.DESIGNATION_WEIGHT.
KINDS = (
    "beautiful_village", "heritage_town", "spa_town", "unesco_whc",
    "unesco_tentative", "national_park", "cittaslow", "scenic_route",
    "blue_flag", "capital_of_culture", "eden", "market_town", "resort",
)

# ---------------------------------------------------------------------------
# Place-level registers. These are the ones that find destinations.
# `prop` is the property that ACTUALLY returns members - researched per entry,
# because the modelling is inconsistent (P463 member-of for the French and
# Italian village networks, P166 award-received for Petites Cites de
# Caractere, P1435 heritage-designation for UNESCO).
# ---------------------------------------------------------------------------
PLACE_REGISTRIES = [
    # --- most-beautiful-village associations --------------------------------
    dict(id="fr_plus_beaux_villages", kind="beautiful_village", countries=["FR"],
         qid="Q1010307", prop="P463", modelled=True,
         name="Les Plus Beaux Villages de France",
         note="155 in Wikidata vs ~176 real members; capped at 2,000 inhabitants"),
    dict(id="fr_plus_beaux_detours", kind="heritage_town", countries=["FR"],
         qid="Q3234783", prop="P463", modelled=True,
         name="Les Plus Beaux Detours de France",
         note="2,000-20,000 band: big enough for a hotel and a station"),
    dict(id="fr_petites_cites", kind="heritage_town", countries=["FR"],
         qid="Q3377466", prop="P166", modelled=True,
         name="Petites Cites de Caractere",
         note="P166, not P463; 4 rows are departments, filter to settlements"),
    dict(id="it_borghi_piu_belli", kind="beautiful_village", countries=["IT"],
         qid="Q127107", prop="P463", modelled=True,
         name="I Borghi piu belli d'Italia"),
    dict(id="es_pueblos_bonitos", kind="beautiful_village", countries=["ES"],
         qid="Q5576414", prop="P463", modelled=False,
         name="Los Pueblos mas bonitos de Espana",
         fallback="es.wikipedia 'Los Pueblos mas Bonitos de Espana'; "
                  "https://www.lospueblosmasbonitosdeespana.org",
         note="real and famous, zero P463 statements: scrape target"),
    dict(id="de_schoenste_doerfer", kind="beautiful_village", countries=["DE"],
         qid="Q2456354", prop="P463", modelled=False,
         name="Die schoensten Doerfer Deutschlands",
         fallback="https://www.schoenste-doerfer.de"),
    dict(id="wallonie_plus_beaux", kind="beautiful_village", countries=["BE"],
         qid="Q3405320", prop="P463", modelled=False,
         name="Les Plus Beaux Villages de Wallonie",
         fallback="fr.wikipedia 'Les Plus Beaux Villages de Wallonie'"),
    dict(id="ch_plus_beaux", kind="beautiful_village", countries=["CH"],
         qid="Q3405319", prop="P463", modelled=False,
         name="Les Plus Beaux Villages de Suisse",
         fallback="https://www.borghi.ch"),
    dict(id="ro_cele_mai_frumoase", kind="beautiful_village", countries=["RO"],
         qid=None, prop="P463", modelled=False,
         name="Cele mai frumoase sate din Romania",
         fallback="ro.wikipedia; association is young and thinly modelled"),

    # --- national heritage-town labels --------------------------------------
    dict(id="fr_villes_art_histoire", kind="heritage_town", countries=["FR"],
         qid="Q1003405", prop="P166", modelled=True,
         name="Villes et Pays d'art et d'histoire",
         fallback="fr.wikipedia 'Villes et Pays d'art et d'histoire'",
         note="~200 towns exist, only ~9 modelled: strongest French scrape target"),
    dict(id="it_bandiera_arancione", kind="heritage_town", countries=["IT"],
         qid="Q678967", prop="P166", modelled=True,
         name="Bandiera Arancione (Touring Club Italiano)",
         fallback="it.wikipedia 'Bandiera arancione'",
         note="~270 inland towns exist, 10 carry P166: the 10 are real, the "
              "other 260 are the single biggest Italian blind spot"),
    dict(id="pt_aldeias_historicas", kind="heritage_town", countries=["PT"],
         qid="Q120498", prop="P463", modelled=False,
         name="Aldeias Historicas de Portugal",
         fallback="pt.wikipedia 'Aldeias Historicas de Portugal' (12 villages)",
         note="Q120498 is the right entity; no property links its members"),
    dict(id="es_conjunto_historico", kind="heritage_town", countries=["ES"],
         qid="Q3317612", prop="P31", modelled=True,
         name="Conjunto historico (historic grouping)",
         note="632 rows but MIXED: old towns alongside pilgrim routes, canals "
              "and monasteries. Kept because Spain's village association is "
              "unmodelled and this is the only place-level signal it has; the "
              "4 km geo-match to a settlement drops most of the non-towns"),
    dict(id="gb_market_town", kind="market_town", countries=["GB", "IE"],
         qid="Q18511725", prop="P31", modelled=True,
         name="Market town",
         note="class not award: 397 rows, weak on its own, useful as a tiebreak"),

    # --- spa, slow and resort networks --------------------------------------
    dict(id="eu_great_spa_towns", kind="spa_town", countries=["BE", "CZ", "DE", "FR", "IT", "GB", "AT"],
         qid="Q16064866", prop="P361", modelled=True,
         name="The Great Spa Towns of Europe",
         note="P361 part-of is the one that works, 11 members; P463, P1435, "
              "P166 and P527 all return 0"),
    dict(id="eu_cittaslow", kind="cittaslow", countries=["IT", "DE", "PL", "GB", "ES", "NL"],
         qid="Q677741", prop="P463", modelled=False,
         name="Cittaslow",
         fallback="https://www.cittaslow.org/network",
         note="Q677741 is the right entity (Q1094216 was wrong) but only 3 of "
              "~300 members carry P463: effectively a scrape target"),

    # --- global designations ------------------------------------------------
    dict(id="unesco_whc", kind="unesco_whc", countries=["*"],
         qid="Q9259", prop="P1435", modelled=True,
         name="UNESCO World Heritage Site",
         note="many members are monuments, not settlements: geo-match then "
              "attribute to the nearest settlement rather than promoting"),
    dict(id="unesco_tentative", kind="unesco_tentative", countries=["*"],
         qid="Q1459900", prop="P1435", modelled=True,
         name="UNESCO World Heritage Tentative List"),
    dict(id="eu_capital_of_culture", kind="capital_of_culture", countries=["*"],
         qid="Q129372", prop="P166", modelled=True,
         name="European Capital of Culture"),
    dict(id="eu_heritage_label", kind="capital_of_culture", countries=["*"],
         qid="Q1378113", prop="P166", modelled=True,
         name="European Heritage Label"),
    dict(id="unesco_creative_cities", kind="capital_of_culture", countries=["*"],
         qid="Q1139352", prop="P463", modelled=True,
         name="UNESCO Creative Cities Network"),

    # --- landscape ----------------------------------------------------------
    dict(id="national_park", kind="national_park", countries=["*"],
         qid="Q46169", prop="P31", modelled=True,
         name="National park",
         note="matched to nearby settlements, never promoted as a place itself"),
    dict(id="unesco_geopark", kind="national_park", countries=["*"],
         qid="Q1324355", prop="P31", modelled=True,
         name="UNESCO Global Geopark"),
    dict(id="biosphere_reserve", kind="national_park", countries=["*"],
         qid="Q158454", prop="P31", modelled=True,
         name="UNESCO Man and the Biosphere reserve"),
]

# ---------------------------------------------------------------------------
# Monument-level registers: real, large, and deliberately NOT used for place
# discovery. Recorded so the research is not repeated. Their members are
# individual buildings and archaeological sites.
# ---------------------------------------------------------------------------
MONUMENT_REGISTRIES = [
    dict(id="se_fornminnen", countries=["SE"], qid="Q21287602", prop="P1435",
         members=145505, name="Fornminnesregistret"),
    dict(id="fr_monument_historique", countries=["FR"], qid="Q10387684",
         prop="P1435", members=52944, name="Monument historique"),
    dict(id="gb_scheduled_monument", countries=["GB"], qid="Q219538",
         prop="P1435", members=32728, name="Scheduled monument"),
    dict(id="dk_fortidsminder", countries=["DK"], qid="Q12312385", prop="P1435",
         members=31321, name="Protected ancient monuments in Denmark"),
    dict(id="no_kulturminne", countries=["NO"], qid="Q11970056", prop="P1435",
         members=16631, name="Askeladden protected heritage"),
    dict(id="gb_grade_i", countries=["GB"], qid="Q15700818", prop="P1435",
         members=9892, name="Grade I listed building"),
    dict(id="be_beschermd_monument", countries=["BE"], qid="Q12053139",
         prop="P1435", members=3764, name="Beschermd monument"),
    dict(id="fi_rky", countries=["FI"], qid="Q29966257", prop="P1435",
         members=1288, name="RKY built cultural environments"),
]


def modelled_registries():
    """Place-level registers that a SPARQL query can actually resolve."""
    return [r for r in PLACE_REGISTRIES if r.get("modelled") and r.get("qid")]


def scrape_targets():
    """Place-level registers Wikidata does not model: the known blind spots."""
    return [r for r in PLACE_REGISTRIES if not r.get("modelled")]
