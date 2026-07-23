"""Trip-type categories for airport-tier destinations.

The gems carry hand-written category tags (see destinations_master.py); the
airport-tier destinations historically shipped with an empty `categories[]`,
which made the trip-type filter hide every major city the moment a chip was
clicked. This module fixes that by giving every airport at least `["city"]`,
plus curated tags for the well-known sun / island / ski / capital airports so
the Beach / Island / Mountains / Cultural filters actually surface them.

Tags use the controlled vocabulary in destinations_master.CATEGORIES (plus
"nightlife", which the frontend trip-kind map treats as "party"). Anything not
in the curated map falls back to ["city"] - factual and filter-safe.

Used by `apply_airport_categories.py` (patches app_data.json in place) and by
the mock generator / pipeline so future regenerations stay correct.
"""

# Curated per-IATA tags. Geographic facts (islands, capitals, coast) plus the
# obvious draws. Keep entries factual; the long tail defaults to ["city"].
AIRPORT_CATEGORIES = {
    # --- Iberia ---------------------------------------------------------------
    "LIS": ["city", "coast", "unesco", "food", "historic"],
    "OPO": ["city", "coast", "wine", "unesco", "historic"],
    "MAD": ["city", "art", "food", "nightlife", "historic"],
    "BCN": ["city", "coast", "beach", "art", "unesco", "nightlife"],
    "AGP": ["city", "beach", "coast", "andalusia"],
    "VLC": ["city", "beach", "coast", "food"],
    "ALC": ["city", "beach", "coast"],
    "SVQ": ["city", "historic", "andalusia", "unesco"],
    "BIO": ["city", "coast", "art", "basque", "food"],
    "GRO": ["city", "coast", "beach"],
    "REU": ["city", "beach", "coast"],
    "MJV": ["city", "beach", "coast"],
    "XRY": ["city", "wine", "andalusia"],
    "SDR": ["city", "coast", "beach"],
    "OVD": ["city", "coast", "nature"],
    "LCG": ["city", "coast"],
    "SCQ": ["city", "unesco", "historic", "religion"],
    "PNA": ["city", "historic", "basque"],
    "VIT": ["city", "historic", "basque"],
    "VLL": ["city", "historic", "wine"],
    "ZAZ": ["city", "historic"],
    "BJZ": ["city", "historic"],
    # Balearic + Canary islands
    "PMI": ["island", "beach", "coast"],
    "IBZ": ["island", "beach", "coast", "nightlife", "party"],
    "MAH": ["island", "beach", "coast", "quiet"],
    "LPA": ["island", "beach", "coast"],
    "TFS": ["island", "beach", "coast", "nature"],
    "TFN": ["island", "coast", "nature", "mountains"],
    "ACE": ["island", "beach", "coast", "nature"],
    "FUE": ["island", "beach", "coast", "surf"],
    "SPC": ["island", "nature", "coast", "quiet"],
    "VDE": ["island", "nature", "coast", "diving", "remote"],
    # --- Italy ----------------------------------------------------------------
    "FCO": ["city", "unesco", "roman", "historic", "art", "iconic"],
    "CIA": ["city", "unesco", "roman", "historic", "art", "iconic"],
    "MXP": ["city", "art", "food"],
    "LIN": ["city", "art", "food"],
    "BGY": ["city", "historic", "medieval"],
    "VCE": ["city", "unesco", "iconic", "romantic", "historic"],
    "TSF": ["city", "unesco", "iconic", "romantic", "historic"],
    "VRN": ["city", "romantic", "historic", "unesco"],
    "BLQ": ["city", "food", "historic", "university"],
    "FLR": ["city", "art", "renaissance", "unesco", "tuscany", "iconic"],
    "PSA": ["city", "historic", "tuscany", "iconic"],
    "NAP": ["city", "coast", "food", "unesco", "historic"],
    "BRI": ["city", "coast", "food", "puglia"],
    "BDS": ["city", "coast", "beach", "puglia"],
    "PMO": ["island", "coast", "food", "historic", "unesco"],
    "CTA": ["island", "coast", "beach", "historic"],
    "TPS": ["island", "coast", "beach", "historic"],
    "CAG": ["island", "beach", "coast"],
    "OLB": ["island", "beach", "coast", "luxury"],
    "AHO": ["island", "beach", "coast", "historic"],
    "LMP": ["island", "beach", "coast", "remote"],
    "PNL": ["island", "coast", "remote", "diving"],
    "REG": ["city", "coast", "historic"],
    "LMZ": ["city", "coast"],
    "CRV": ["city", "coast", "beach"],
    "AOI": ["city", "coast", "historic"],
    "RMI": ["city", "beach", "coast"],
    "PSR": ["city", "coast", "beach"],
    "QSR": ["city", "coast", "historic"],
    "GOA": ["city", "coast", "historic", "food"],
    "TRN": ["city", "historic", "art", "baroque"],
    "TRS": ["city", "coast", "historic"],
    "PEG": ["city", "historic", "art", "medieval"],
    "CUF": ["city", "mountains", "alps", "nature"],
    # --- Greece ---------------------------------------------------------------
    "ATH": ["city", "ruins", "unesco", "historic", "iconic"],
    "SKG": ["city", "coast", "historic", "food", "nightlife"],
    "JTR": ["island", "coast", "iconic", "romantic", "beach"],
    "JMK": ["island", "beach", "coast", "nightlife", "party"],
    "HER": ["island", "coast", "beach", "historic"],
    "CHQ": ["island", "coast", "beach", "historic"],
    "CFU": ["island", "beach", "coast", "unesco"],
    "RHO": ["island", "beach", "coast", "medieval", "unesco"],
    "KGS": ["island", "beach", "coast", "nightlife"],
    "EFL": ["island", "beach", "coast", "nature"],
    "ZTH": ["island", "beach", "coast", "nature"],
    "SMI": ["island", "beach", "coast", "quiet"],
    "MJT": ["island", "coast", "quiet"],
    "KLX": ["city", "coast", "beach", "historic"],
    "KVA": ["city", "coast", "historic"],
    "PVK": ["city", "coast", "beach"],
    "VOL": ["city", "coast", "nature"],
    # --- Croatia / Balkans ----------------------------------------------------
    "DBV": ["city", "coast", "beach", "unesco", "iconic", "medieval"],
    "SPU": ["city", "coast", "beach", "historic", "unesco"],
    "ZAD": ["city", "coast", "beach", "historic"],
    "PUY": ["city", "coast", "beach", "roman"],
    "RJK": ["city", "coast", "historic"],
    "ZAG": ["city", "historic", "art"],
    "OSI": ["city", "historic"],
    "TIA": ["city", "historic", "affordable"],
    "SJJ": ["city", "historic", "mountains", "affordable"],
    "TZL": ["city", "affordable"],
    "BNX": ["city", "nature", "affordable"],
    # --- France ---------------------------------------------------------------
    "CDG": ["city", "art", "iconic", "romantic", "food"],
    "ORY": ["city", "art", "iconic", "romantic", "food"],
    "BVA": ["city", "art", "iconic", "romantic"],
    "NCE": ["city", "coast", "beach", "luxury", "cote-azur"],
    "MRS": ["city", "coast", "beach", "historic"],
    "MPL": ["city", "coast", "beach"],
    "BZR": ["city", "coast", "wine"],
    "PGF": ["city", "coast", "beach"],
    "NIM": ["city", "roman", "historic"],
    "CCF": ["city", "medieval", "unesco", "fortress"],
    "TLS": ["city", "art", "food", "university"],
    "BOD": ["city", "wine", "unesco", "food"],
    "BIQ": ["city", "coast", "beach", "surf", "basque", "luxury"],
    "LYS": ["city", "food", "historic", "unesco"],
    "NTE": ["city", "historic", "brittany"],
    "RNS": ["city", "historic", "brittany"],
    "BES": ["city", "coast", "brittany"],
    "LRH": ["city", "coast", "historic"],
    "BOD": ["city", "wine", "unesco", "food"],
    "LDE": ["city", "religion", "mountains"],
    "AJA": ["island", "coast", "beach"],
    "BIA": ["island", "coast", "beach"],
    "CLY": ["island", "coast", "beach", "luxury"],
    "FSC": ["island", "coast", "beach"],
    # --- Germany / Alps / Switzerland / Austria -------------------------------
    "BER": ["city", "art", "nightlife", "historic", "modern"],
    "MUC": ["city", "historic", "beer", "art"],
    "FRA": ["city", "modern", "historic"],
    "HHN": ["city", "wine", "nature"],
    "HAM": ["city", "coast", "modern", "historic"],
    "CGN": ["city", "historic", "cathedral"],
    "DUS": ["city", "modern", "art"],
    "STR": ["city", "modern", "historic"],
    "NUE": ["city", "medieval", "historic", "fairytale"],
    "DRS": ["city", "baroque", "art", "historic"],
    "LEJ": ["city", "music", "historic"],
    "BRE": ["city", "historic", "fairytale"],
    "FMM": ["city", "alps", "mountains"],
    "FDH": ["city", "lake", "alps", "mountains"],
    "FKB": ["city", "spa", "thermal"],
    "VIE": ["city", "art", "music", "baroque", "historic"],
    "SZG": ["city", "music", "baroque", "alps", "unesco", "iconic"],
    "INN": ["city", "alps", "mountains", "skiing", "winter"],
    "KLU": ["city", "lake", "alps", "nature"],
    "GRZ": ["city", "historic", "unesco"],
    "LNZ": ["city", "art", "modern"],
    "ZRH": ["city", "lake", "alps", "luxury", "modern"],
    "GVA": ["city", "lake", "alps", "luxury", "skiing"],
    "BSL": ["city", "art", "historic"],
    "BRN": ["city", "alps", "historic", "unesco"],
    # --- UK / Ireland ---------------------------------------------------------
    "LHR": ["city", "art", "historic", "iconic"],
    "LGW": ["city", "art", "historic", "iconic"],
    "LTN": ["city", "art", "historic", "iconic"],
    "STN": ["city", "art", "historic", "iconic"],
    "MAN": ["city", "music", "nightlife", "historic"],
    "EDI": ["city", "castle", "historic", "scotland", "iconic"],
    "GLA": ["city", "music", "scotland", "historic"],
    "INV": ["city", "nature", "scotland", "castle"],
    "BHX": ["city", "historic"],
    "BRS": ["city", "historic", "art"],
    "LPL": ["city", "music", "nightlife", "historic"],
    "NCL": ["city", "coast", "nightlife", "historic"],
    "LBA": ["city", "historic"],
    "EMA": ["city", "historic"],
    "CWL": ["city", "coast", "historic"],
    "BFS": ["city", "coast", "historic"],
    "EXT": ["city", "coast", "cornwall", "nature"],
    "BOH": ["city", "beach", "coast"],
    "NWI": ["city", "historic"],
    "IOM": ["island", "coast", "nature", "quiet"],
    "JER": ["island", "coast", "beach", "quiet"],
    "GCI": ["island", "coast", "beach", "quiet"],
    "ACI": ["island", "coast", "remote", "quiet"],
    "DUB": ["city", "music", "nightlife", "historic"],
    "ORK": ["city", "coast", "food", "historic"],
    "SNN": ["city", "nature", "castle", "coast"],
    "KIR": ["city", "nature", "coast"],
    "KOW": ["city", "nature", "religion"],
    # --- Nordics / Baltics ----------------------------------------------------
    "CPH": ["city", "modern", "food", "historic"],
    "BLL": ["city", "family", "modern"],
    "AAL": ["city", "coast", "modern"],
    "FAE": ["island", "nature", "remote", "wilderness", "coast"],
    "ARN": ["city", "modern", "historic"],
    "HEL": ["city", "modern", "historic"],
    "TMP": ["city", "lake", "nature"],
    "TKU": ["city", "coast", "historic"],
    "OUL": ["city", "nature", "arctic"],
    "RVN": ["city", "arctic", "northern-lights", "winter", "wilderness"],
    "KEF": ["nature", "wilderness", "iconic", "adventure", "northern-lights"],
    "AEY": ["city", "arctic", "northern-lights", "nature", "remote"],
    "TLL": ["city", "medieval", "unesco", "historic"],
    "RIX": ["city", "medieval", "unesco", "historic"],
    "VNO": ["city", "medieval", "historic", "baroque"],
    "KUN": ["city", "historic", "art"],
    "PLQ": ["city", "coast", "beach"],
    # --- Central / Eastern Europe ---------------------------------------------
    "PRG": ["city", "medieval", "unesco", "historic", "iconic"],
    "BRQ": ["city", "historic", "modern"],
    "BUD": ["city", "spa", "thermal", "historic", "nightlife"],
    "DEB": ["city", "historic", "thermal"],
    "OTP": ["city", "historic", "nightlife"],
    "SOF": ["city", "historic", "mountains"],
    "PDV": ["city", "roman", "unesco", "historic"],
    "VAR": ["city", "coast", "beach", "nightlife"],
    "BOJ": ["city", "coast", "beach", "nightlife"],
    "LUX": ["city", "historic", "fortress", "unesco"],
    # --- Cyprus ---------------------------------------------------------------
    "LCA": ["island", "coast", "beach", "historic"],
    "PFO": ["island", "coast", "beach", "unesco", "historic"],
    # --- Portugal islands / Madeira ------------------------------------------
    "FNC": ["island", "nature", "coast", "hiking"],
    # --- Fact-checked fill-ins (2026-06-07) -----------------------------------
    # Major destinations that previously defaulted to a bare ["city"], which hid
    # them from the Beach / Island / Nature / Cultural filters. Tags verified via
    # web research (UNESCO listings, tourism boards). NB: only "beach" surfaces
    # under the Beach chip ("coast" is descriptive only), and "fjord"/"lake"/
    # "volcanic"/"wilderness"/"nature" all map to the Nature chip.
    # Netherlands / Belgium
    "AMS": ["city", "art", "unesco", "nightlife", "iconic", "historic"],
    "BRU": ["city", "historic", "art", "food", "unesco"],
    "GRQ": ["city", "university", "nightlife"],
    "MST": ["city", "historic", "food"],
    # Poland
    "KRK": ["city", "unesco", "medieval", "historic", "iconic", "nightlife"],
    "WAW": ["city", "historic", "unesco", "art", "nightlife"],
    "WMI": ["city", "historic", "unesco", "art", "nightlife"],
    "WRO": ["city", "historic", "medieval"],
    "GDN": ["city", "coast", "beach", "historic", "medieval"],
    "POZ": ["city", "historic"],
    "LCJ": ["city", "art"],
    "LUZ": ["city", "historic"],
    "SZZ": ["city", "historic"],
    # Romania / Moldova
    "CLJ": ["city", "historic", "nightlife"],
    "CND": ["city", "coast", "beach", "historic", "nightlife"],
    "IAS": ["city", "historic"],
    "SBZ": ["city", "historic", "medieval"],
    "SUJ": ["city", "historic", "unesco"],
    "TSR": ["city", "historic", "art", "baroque"],
    "TGM": ["city", "historic"],
    "OMR": ["city", "art", "historic", "thermal"],
    "KIV": ["city", "wine"],
    # Balkans
    "BEG": ["city", "nightlife", "historic"],
    "INI": ["city", "historic", "roman"],
    "SKP": ["city", "historic"],
    "OHD": ["city", "lake", "unesco", "historic", "byzantine", "beach", "nature"],
    "LJU": ["city", "historic", "castle", "romantic"],
    "MBX": ["city", "wine", "nature"],
    "TIV": ["city", "coast", "beach", "luxury"],
    # Slovakia
    "BTS": ["city", "historic", "castle"],
    "KSC": ["city", "historic"],
    # France
    "EGC": ["city", "wine", "historic"],
    "LIG": ["city", "historic"],
    # Norway (fjords / arctic)
    "OSL": ["city", "art", "historic", "modern"],
    "TRF": ["city", "art", "historic", "modern"],
    "BGO": ["city", "coast", "fjord", "nature", "unesco", "historic"],
    "SVG": ["city", "fjord", "nature", "coast", "hiking"],
    "AES": ["city", "coast", "nature", "fjord", "art"],
    "TRD": ["city", "historic", "cathedral", "coast"],
    "BOO": ["city", "coast", "nature", "arctic", "northern-lights"],
    "TOS": ["city", "arctic", "northern-lights", "winter", "nature", "coast"],
    # Sweden (Stockholm airports + arctic + Gotland)
    "BMA": ["city", "historic", "art", "coast"],
    "NYO": ["city", "historic", "art", "coast"],
    "GOT": ["city", "coast", "food"],
    "KRN": ["city", "arctic", "northern-lights", "winter", "wilderness", "nature"],
    "VBY": ["island", "medieval", "unesco", "historic", "beach", "coast"],
    # Portugal mainland + Azores
    "FAO": ["city", "beach", "coast", "historic", "nature"],
    "PDL": ["island", "nature", "coast", "volcanic", "hiking"],
    "TER": ["island", "nature", "unesco", "historic", "coast", "volcanic"],
    # Malta
    "MLA": ["island", "beach", "coast", "historic", "unesco", "diving"],
}

# Fact-checked corrections / enrichments (2026-06-08). These override any base
# entry above (applied via .update). Each was checked against UNESCO World
# Heritage listings and national tourism boards. NB filter mapping (trip_kinds.js):
# only "beach" hits the Beach chip ("coast" is descriptive); UNESCO/medieval/
# roman/baroque/art/historic/castle/cathedral -> Cultural; nightlife/party ->
# Nightlife; iconic/romantic -> Romantic; fjord/lake/volcanic/wilderness/nature/
# national-park -> Nature; alps/mountains/skiing -> Mountains.
_CORRECTIONS = {
    # Austria - Vienna historic centre IS UNESCO (on the in-danger list, 2024).
    "VIE": ["city", "art", "music", "baroque", "historic", "unesco", "iconic"],
    "GRZ": ["city", "historic", "unesco", "art"],
    # Bulgaria - Plovdiv is UNESCO *tentative* only (since 2004), NOT inscribed.
    "PDV": ["city", "roman", "historic", "art"],
    # Denmark / Finland
    "CPH": ["city", "modern", "food", "historic", "nightlife"],
    "HEL": ["city", "modern", "historic", "coast"],
    # France
    "MPL": ["city", "coast", "beach", "historic"],
    # Germany - Cologne Cathedral, Bremen Rathaus/Roland, Hamburg Speicherstadt UNESCO.
    "CGN": ["city", "historic", "cathedral", "unesco"],
    "BRE": ["city", "historic", "fairytale", "unesco"],
    "HAM": ["city", "coast", "modern", "historic", "unesco", "nightlife"],
    # Greece - Thessaloniki Palaeochristian monuments UNESCO.
    "SKG": ["city", "coast", "historic", "food", "nightlife", "unesco"],
    # Hungary - Budapest (Banks of the Danube + Buda Castle + Andrassy) UNESCO.
    "BUD": ["city", "spa", "thermal", "historic", "nightlife", "unesco"],
    # Iceland - Reykjavik IS a city (was missing the tag entirely).
    "KEF": ["city", "nature", "wilderness", "iconic", "adventure", "northern-lights", "nightlife"],
    # Italy
    "BRI": ["city", "coast", "food", "puglia", "historic"],
    "CTA": ["island", "coast", "beach", "historic", "baroque"],
    "MXP": ["city", "art", "food", "historic"],
    "LIN": ["city", "art", "food", "historic"],
    "PSA": ["city", "historic", "tuscany", "iconic", "unesco"],
    "RMI": ["city", "beach", "coast", "nightlife"],
    # Lithuania - Kaunas modernism inscribed 2023; Vilnius old town UNESCO.
    "KUN": ["city", "historic", "art", "unesco"],
    "VNO": ["city", "medieval", "historic", "baroque", "unesco"],
    # Portugal - Lisbon (Belem/Jeronimos) UNESCO + famous nightlife.
    "LIS": ["city", "coast", "unesco", "food", "historic", "nightlife", "iconic"],
    # Spain - A Coruna (Tower of Hercules UNESCO); Oviedo/Asturias UNESCO;
    # Girona city is inland/historic (airport is the Costa Brava gateway).
    "LCG": ["city", "coast", "beach", "unesco", "historic"],
    "OVD": ["city", "coast", "nature", "unesco"],
    "GRO": ["city", "coast", "beach", "historic", "medieval"],
    "AGP": ["city", "beach", "coast", "andalusia", "art"],
    # Sweden - align Arlanda with the other Stockholm fields.
    "ARN": ["city", "historic", "art", "coast", "modern"],
    # UK - Edinburgh Old & New Towns UNESCO. (Liverpool was DELISTED 2021 - no unesco.)
    "EDI": ["city", "castle", "historic", "scotland", "iconic", "unesco"],
}
AIRPORT_CATEGORIES.update(_CORRECTIONS)

# Capitals / major cities not necessarily worth a bespoke tag but that read as
# "historic city" rather than a bare "city". (Kept small; everything else -> city.)
_HISTORIC_CITY_DEFAULT = set()


def categories_for(iata, city=None, country=None, iso2=None):
    """Return the trip-type categories for an airport. Curated where known,
    otherwise ["city"] - always non-empty so the trip-type filter never hides it.
    """
    tags = AIRPORT_CATEGORIES.get(iata)
    if tags:
        # de-dupe while preserving order
        seen = set()
        out = []
        for t in tags:
            if t not in seen:
                seen.add(t)
                out.append(t)
        return out
    return ["city"]
