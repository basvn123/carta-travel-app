"""European destinations master list.

~400 destinations across 4 tiers:
  Tier A — Ryanair-served airports from BRU/CRL (real fare calendars)
  Tier B — Other Ryanair airports (real Ryanair fares, may need connection)
  Tier C — Major airports without Ryanair (estimated fares)
  Tier D — Non-airport gems (fly to nearest airport + ground transport)

Each entry carries the data we need to compute real or estimated trip costs.

This file is generated/curated separately from the notebooks because it's
foundational reference data that doesn't change run-to-run.
"""

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))  # pipeline/ (car_layer etc.)
import airport_categories

# Tier A+B: Ryanair airports across Europe (IATA, city, country, ISO2, lat, lon)
# Sourced from Ryanair's destination list. ~225 airports.
RYANAIR_AIRPORTS = [
    # Belgium (origins)
    ("BRU", "Brussels",          "Belgium",        "BE", 50.9014,  4.4844),
    ("CRL", "Charleroi",         "Belgium",        "BE", 50.4592,  4.4538),
    # Spain (huge Ryanair presence)
    ("MAD", "Madrid",            "Spain",          "ES", 40.4719, -3.5626),
    ("BCN", "Barcelona",         "Spain",          "ES", 41.2974,  2.0833),
    ("AGP", "Malaga",            "Spain",          "ES", 36.6749, -4.4991),
    ("VLC", "Valencia",          "Spain",          "ES", 39.4893, -0.4816),
    ("PMI", "Palma de Mallorca", "Spain",          "ES", 39.5517,  2.7388),
    ("ALC", "Alicante",          "Spain",          "ES", 38.2822, -0.5582),
    ("SVQ", "Seville",           "Spain",          "ES", 37.4180, -5.8931),
    ("BIO", "Bilbao",            "Spain",          "ES", 43.3011, -2.9106),
    ("IBZ", "Ibiza",             "Spain",          "ES", 38.8729,  1.3731),
    ("MAH", "Menorca",           "Spain",          "ES", 39.8626,  4.2186),
    ("SCQ", "Santiago de Compostela","Spain",      "ES", 42.8963, -8.4151),
    ("LCG", "A Coruna",          "Spain",          "ES", 43.3022, -8.3772),
    ("SDR", "Santander",         "Spain",          "ES", 43.4271, -3.8200),
    ("REU", "Reus (Costa Daurada)","Spain",        "ES", 41.1474,  1.1672),
    ("GRO", "Girona",            "Spain",          "ES", 41.9009,  2.7606),
    ("ZAZ", "Zaragoza",          "Spain",          "ES", 41.6661, -1.0415),
    ("VLL", "Valladolid",        "Spain",          "ES", 41.7060, -4.8519),
    ("MJV", "Murcia",            "Spain",          "ES", 37.8030, -1.1255),
    ("VIT", "Vitoria-Gasteiz",   "Spain",          "ES", 42.8828, -2.7244),
    ("ACE", "Lanzarote",         "Spain",          "ES", 28.9455, -13.6052),
    ("FUE", "Fuerteventura",     "Spain",          "ES", 28.4527, -13.8638),
    ("LPA", "Gran Canaria",      "Spain",          "ES", 27.9319, -15.3866),
    ("TFS", "Tenerife South",    "Spain",          "ES", 28.0444, -16.5725),
    ("TFN", "Tenerife North",    "Spain",          "ES", 28.4827, -16.3415),
    ("SPC", "La Palma",          "Spain",          "ES", 28.6265, -17.7556),
    ("VDE", "El Hierro",         "Spain",          "ES", 27.8148, -17.8871),
    ("XRY", "Jerez",             "Spain",          "ES", 36.7445, -6.0601),
    ("BJZ", "Badajoz",           "Spain",          "ES", 38.8913, -6.8213),
    ("OVD", "Asturias (Oviedo)", "Spain",          "ES", 43.5636, -6.0346),
    ("PNA", "Pamplona",          "Spain",          "ES", 42.7700, -1.6463),
    # Italy (huge Ryanair presence)
    ("FCO", "Rome (Fiumicino)",  "Italy",          "IT", 41.8003, 12.2389),
    ("CIA", "Rome (Ciampino)",   "Italy",          "IT", 41.7994, 12.5949),
    ("MXP", "Milan (Malpensa)",  "Italy",          "IT", 45.6306,  8.7281),
    ("BGY", "Milan (Bergamo)",   "Italy",          "IT", 45.6739,  9.7042),
    ("LIN", "Milan (Linate)",    "Italy",          "IT", 45.4451,  9.2767),
    ("VCE", "Venice (Marco Polo)","Italy",         "IT", 45.5053, 12.3519),
    ("TSF", "Venice (Treviso)",  "Italy",          "IT", 45.6484, 12.1944),
    ("VRN", "Verona",            "Italy",          "IT", 45.3957, 10.8885),
    ("BLQ", "Bologna",           "Italy",          "IT", 44.5354, 11.2887),
    ("FLR", "Florence",          "Italy",          "IT", 43.8100, 11.2051),
    ("PSA", "Pisa",              "Italy",          "IT", 43.6839, 10.3927),
    ("NAP", "Naples",            "Italy",          "IT", 40.8860, 14.2908),
    ("BRI", "Bari",              "Italy",          "IT", 41.1389, 16.7608),
    ("BDS", "Brindisi",          "Italy",          "IT", 40.6576, 17.9470),
    ("PMO", "Palermo",           "Italy",          "IT", 38.1759, 13.0910),
    ("CTA", "Catania",           "Italy",          "IT", 37.4668, 15.0664),
    ("TPS", "Trapani",           "Italy",          "IT", 37.9114, 12.4880),
    ("CAG", "Cagliari",          "Italy",          "IT", 39.2515,  9.0543),
    ("OLB", "Olbia (Costa Smeralda)","Italy",      "IT", 40.8987,  9.5176),
    ("AHO", "Alghero",           "Italy",          "IT", 40.6321,  8.2908),
    ("REG", "Reggio Calabria",   "Italy",          "IT", 38.0712, 15.6516),
    ("LMP", "Lampedusa",         "Italy",          "IT", 35.4979, 12.6181),
    ("PNL", "Pantelleria",       "Italy",          "IT", 36.8166, 11.9689),
    ("AOI", "Ancona",            "Italy",          "IT", 43.6163, 13.3623),
    ("PEG", "Perugia",           "Italy",          "IT", 43.0959, 12.5132),
    ("PSR", "Pescara",           "Italy",          "IT", 42.4317, 14.1810),
    ("CUF", "Cuneo",             "Italy",          "IT", 44.5470,  7.6232),
    ("TRN", "Turin",             "Italy",          "IT", 45.2008,  7.6496),
    ("GOA", "Genoa",             "Italy",          "IT", 44.4133,  8.8375),
    ("TRS", "Trieste",           "Italy",          "IT", 45.8273, 13.4722),
    ("RMI", "Rimini",            "Italy",          "IT", 44.0203, 12.6117),
    ("LMZ", "Lamezia Terme",     "Italy",          "IT", 38.9054, 16.2423),
    ("CRV", "Crotone",           "Italy",          "IT", 38.9972, 17.0802),
    ("QSR", "Salerno",           "Italy",          "IT", 40.6206, 14.9111),
    # Portugal
    ("LIS", "Lisbon",            "Portugal",       "PT", 38.7813, -9.1359),
    ("OPO", "Porto",             "Portugal",       "PT", 41.2481, -8.6814),
    ("FAO", "Faro",              "Portugal",       "PT", 37.0144, -7.9659),
    ("FNC", "Funchal (Madeira)", "Portugal",       "PT", 32.6979, -16.7745),
    ("PDL", "Ponta Delgada (Azores)","Portugal",   "PT", 37.7412, -25.6979),
    ("TER", "Terceira (Azores)", "Portugal",       "PT", 38.7592, -27.0908),
    # Greece
    ("ATH", "Athens",            "Greece",         "GR", 37.9364, 23.9445),
    ("SKG", "Thessaloniki",      "Greece",         "GR", 40.5197, 22.9709),
    ("HER", "Heraklion (Crete)", "Greece",         "GR", 35.3397, 25.1803),
    ("CHQ", "Chania (Crete)",    "Greece",         "GR", 35.5317, 24.1497),
    ("RHO", "Rhodes",            "Greece",         "GR", 36.4054, 28.0862),
    ("CFU", "Corfu",             "Greece",         "GR", 39.6019, 19.9117),
    ("ZTH", "Zakynthos",         "Greece",         "GR", 37.7509, 20.8843),
    ("KGS", "Kos",               "Greece",         "GR", 36.7933, 27.0917),
    ("JMK", "Mykonos",           "Greece",         "GR", 37.4351, 25.3481),
    ("JTR", "Santorini",         "Greece",         "GR", 36.3992, 25.4793),
    ("EFL", "Kefalonia",         "Greece",         "GR", 38.1201, 20.5005),
    ("PVK", "Preveza",           "Greece",         "GR", 38.9255, 20.7653),
    ("KLX", "Kalamata",          "Greece",         "GR", 37.0683, 22.0255),
    ("VOL", "Volos",             "Greece",         "GR", 39.2196, 22.7943),
    ("SMI", "Samos",             "Greece",         "GR", 37.6900, 26.9117),
    ("MJT", "Mytilene (Lesbos)", "Greece",         "GR", 39.0567, 26.5983),
    ("KVA", "Kavala",            "Greece",         "GR", 40.9133, 24.6192),
    # Germany
    ("BER", "Berlin",            "Germany",        "DE", 52.3667, 13.5033),
    ("MUC", "Munich",             "Germany",       "DE", 48.3538, 11.7861),
    ("FRA", "Frankfurt",          "Germany",       "DE", 50.0379,  8.5622),
    ("HHN", "Frankfurt-Hahn",     "Germany",       "DE", 49.9487,  7.2639),
    ("CGN", "Cologne-Bonn",       "Germany",       "DE", 50.8659,  7.1427),
    ("DUS", "Düsseldorf",         "Germany",       "DE", 51.2895,  6.7668),
    ("HAM", "Hamburg",            "Germany",       "DE", 53.6304, 10.0067),
    ("STR", "Stuttgart",          "Germany",       "DE", 48.6899,  9.2220),
    ("NUE", "Nuremberg",          "Germany",       "DE", 49.4987, 11.0780),
    ("LEJ", "Leipzig",            "Germany",       "DE", 51.4239, 12.2364),
    ("DRS", "Dresden",            "Germany",       "DE", 51.1328, 13.7672),
    ("BRE", "Bremen",             "Germany",       "DE", 53.0475,  8.7867),
    ("FMM", "Memmingen",          "Germany",       "DE", 47.9888, 10.2395),
    ("FKB", "Karlsruhe-Baden",    "Germany",       "DE", 48.7794,  8.0805),
    ("FDH", "Friedrichshafen",    "Germany",       "DE", 47.6713,  9.5114),
    # France
    ("CDG", "Paris (CDG)",        "France",        "FR", 49.0097,  2.5479),
    ("ORY", "Paris (Orly)",       "France",        "FR", 48.7233,  2.3794),
    ("BVA", "Paris (Beauvais)",   "France",        "FR", 49.4544,  2.1128),
    ("MRS", "Marseille",          "France",        "FR", 43.4393,  5.2214),
    ("NCE", "Nice",               "France",        "FR", 43.6650,  7.2150),
    ("LYS", "Lyon",               "France",        "FR", 45.7256,  5.0811),
    ("TLS", "Toulouse",           "France",        "FR", 43.6293,  1.3637),
    ("BOD", "Bordeaux",           "France",        "FR", 44.8283, -0.7156),
    ("NTE", "Nantes",             "France",        "FR", 47.1532, -1.6107),
    ("MPL", "Montpellier",        "France",        "FR", 43.5762,  3.9631),
    ("BIQ", "Biarritz",           "France",        "FR", 43.4683, -1.5311),
    ("LDE", "Lourdes",            "France",        "FR", 43.1787, -0.0067),
    ("CCF", "Carcassonne",        "France",        "FR", 43.2160,  2.3063),
    ("PGF", "Perpignan",          "France",        "FR", 42.7404,  2.8706),
    ("EGC", "Bergerac",           "France",        "FR", 44.8253,  0.5186),
    ("LRH", "La Rochelle",        "France",        "FR", 46.1792, -1.1953),
    ("BES", "Brest",              "France",        "FR", 48.4479, -4.4185),
    ("RNS", "Rennes",             "France",        "FR", 48.0719, -1.7333),
    ("BVE", "Brive",              "France",        "FR", 45.0397,  1.4856),
    ("LIG", "Limoges",            "France",        "FR", 45.8628,  1.1797),
    ("BZR", "Béziers",            "France",        "FR", 43.3239,  3.3539),
    ("NIM", "Nîmes",              "France",        "FR", 43.7574,  4.4163),
    ("FSC", "Figari (Corsica)",   "France",        "FR", 41.5006,  9.0978),
    ("BIA", "Bastia (Corsica)",   "France",        "FR", 42.5527,  9.4839),
    ("AJA", "Ajaccio (Corsica)",  "France",        "FR", 41.9236,  8.8027),
    ("CLY", "Calvi (Corsica)",    "France",        "FR", 42.5306,  8.7931),
    ("RDZ", "Rodez",              "France",        "FR", 44.4079,  2.4827),
    # Ireland
    ("DUB", "Dublin",             "Ireland",       "IE", 53.4213, -6.2701),
    ("ORK", "Cork",               "Ireland",       "IE", 51.8413, -8.4911),
    ("SNN", "Shannon",            "Ireland",       "IE", 52.7019, -8.9248),
    ("KIR", "Kerry",              "Ireland",       "IE", 52.1809, -9.5238),
    ("KOW", "Knock",              "Ireland",       "IE", 53.9100, -8.8181),
    # UK
    ("STN", "London (Stansted)",  "United Kingdom","GB", 51.8849,  0.2389),
    ("LTN", "London (Luton)",     "United Kingdom","GB", 51.8747, -0.3683),
    ("LGW", "London (Gatwick)",   "United Kingdom","GB", 51.1481, -0.1903),
    ("LHR", "London (Heathrow)",  "United Kingdom","GB", 51.4700, -0.4543),
    ("MAN", "Manchester",         "United Kingdom","GB", 53.3537, -2.2750),
    ("EDI", "Edinburgh",          "United Kingdom","GB", 55.9508, -3.3615),
    ("GLA", "Glasgow",            "United Kingdom","GB", 55.8718, -4.4338),
    ("BHX", "Birmingham",         "United Kingdom","GB", 52.4539, -1.7480),
    ("LPL", "Liverpool",          "United Kingdom","GB", 53.3336, -2.8497),
    ("LBA", "Leeds Bradford",     "United Kingdom","GB", 53.8659, -1.6606),
    ("NCL", "Newcastle",          "United Kingdom","GB", 55.0375, -1.6917),
    ("BFS", "Belfast",            "United Kingdom","GB", 54.6575, -6.2158),
    ("BRS", "Bristol",            "United Kingdom","GB", 51.3827, -2.7191),
    ("EMA", "East Midlands",      "United Kingdom","GB", 52.8311, -1.3281),
    ("BOH", "Bournemouth",        "United Kingdom","GB", 50.7800, -1.8425),
    ("EXT", "Exeter",             "United Kingdom","GB", 50.7344, -3.4139),
    ("CWL", "Cardiff",            "United Kingdom","GB", 51.3967, -3.3433),
    ("NWI", "Norwich",            "United Kingdom","GB", 52.6758, 1.2828),
    # Poland
    ("WAW", "Warsaw (Chopin)",    "Poland",        "PL", 52.1657, 20.9671),
    ("WMI", "Warsaw (Modlin)",    "Poland",        "PL", 52.4511, 20.6519),
    ("KRK", "Krakow",             "Poland",        "PL", 50.0777, 19.7848),
    ("GDN", "Gdansk",             "Poland",        "PL", 54.3776, 18.4662),
    ("WRO", "Wroclaw",            "Poland",        "PL", 51.1027, 16.8858),
    ("POZ", "Poznan",             "Poland",        "PL", 52.4210, 16.8263),
    ("KTW", "Katowice",           "Poland",        "PL", 50.4743, 19.0800),
    ("LCJ", "Lodz",               "Poland",        "PL", 51.7219, 19.3981),
    ("RZE", "Rzeszow",             "Poland",       "PL", 50.1100, 22.0190),
    ("BZG", "Bydgoszcz",           "Poland",       "PL", 53.0968, 17.9777),
    ("LUZ", "Lublin",              "Poland",       "PL", 51.2403, 22.7136),
    ("SZZ", "Szczecin",            "Poland",       "PL", 53.5847, 14.9022),
    # Czech Republic
    ("PRG", "Prague",              "Czechia",      "CZ", 50.1008, 14.2632),
    ("BRQ", "Brno",                "Czechia",      "CZ", 49.1513, 16.6944),
    # Slovakia
    ("BTS", "Bratislava",          "Slovakia",     "SK", 48.1702, 17.2127),
    ("KSC", "Kosice",              "Slovakia",     "SK", 48.6631, 21.2411),
    # Hungary
    ("BUD", "Budapest",            "Hungary",      "HU", 47.4369, 19.2556),
    ("DEB", "Debrecen",            "Hungary",      "HU", 47.4889, 21.6153),
    # Austria
    ("VIE", "Vienna",              "Austria",      "AT", 48.1103, 16.5697),
    ("SZG", "Salzburg",            "Austria",      "AT", 47.7933, 13.0043),
    ("INN", "Innsbruck",           "Austria",      "AT", 47.2602, 11.3439),
    ("GRZ", "Graz",                "Austria",      "AT", 46.9911, 15.4396),
    ("KLU", "Klagenfurt",          "Austria",      "AT", 46.6425, 14.3375),
    # Switzerland
    ("ZRH", "Zurich",              "Switzerland",  "CH", 47.4647,  8.5492),
    ("GVA", "Geneva",              "Switzerland",  "CH", 46.2381,  6.1090),
    ("BSL", "Basel",               "Switzerland",  "CH", 47.5896,  7.5300),
    # Netherlands
    ("AMS", "Amsterdam",           "Netherlands",  "NL", 52.3086,  4.7639),
    ("EIN", "Eindhoven",           "Netherlands",  "NL", 51.4501,  5.3745),
    ("MST", "Maastricht",          "Netherlands",  "NL", 50.9117,  5.7700),
    ("RTM", "Rotterdam",           "Netherlands",  "NL", 51.9569,  4.4372),
    ("GRQ", "Groningen",           "Netherlands",  "NL", 53.1196,  6.5794),
    # Luxembourg
    ("LUX", "Luxembourg",          "Luxembourg",   "LU", 49.6233,  6.2044),
    # Denmark
    ("CPH", "Copenhagen",          "Denmark",      "DK", 55.6181, 12.6561),
    ("BLL", "Billund",             "Denmark",      "DK", 55.7403,  9.1518),
    ("AAL", "Aalborg",             "Denmark",      "DK", 57.0928,  9.8492),
    # Sweden
    ("ARN", "Stockholm (Arlanda)", "Sweden",       "SE", 59.6519, 17.9186),
    ("NYO", "Stockholm (Skavsta)", "Sweden",       "SE", 58.7886, 16.9122),
    ("BMA", "Stockholm (Bromma)",  "Sweden",       "SE", 59.3544, 17.9416),
    ("GOT", "Gothenburg",          "Sweden",       "SE", 57.6685, 12.2978),
    ("MMX", "Malmö",               "Sweden",       "SE", 55.5364, 13.3762),
    # Norway
    ("OSL", "Oslo (Gardermoen)",   "Norway",       "NO", 60.1939, 11.1004),
    ("TRF", "Oslo (Torp)",         "Norway",       "NO", 59.1867, 10.2586),
    ("BGO", "Bergen",              "Norway",       "NO", 60.2934,  5.2181),
    ("TRD", "Trondheim",           "Norway",       "NO", 63.4578, 10.9239),
    ("SVG", "Stavanger",           "Norway",       "NO", 58.8767,  5.6378),
    ("TOS", "Tromsø",              "Norway",       "NO", 69.6833, 18.9189),
    # Finland
    ("HEL", "Helsinki",            "Finland",      "FI", 60.3172, 24.9633),
    ("TMP", "Tampere",             "Finland",      "FI", 61.4141, 23.6044),
    ("TKU", "Turku",               "Finland",      "FI", 60.5141, 22.2628),
    ("RVN", "Rovaniemi",           "Finland",      "FI", 66.5648, 25.8303),
    ("OUL", "Oulu",                "Finland",      "FI", 64.9301, 25.3546),
    # Iceland
    ("KEF", "Reykjavik (Keflavik)","Iceland",      "IS", 63.9850, -22.6056),
    ("AEY", "Akureyri",            "Iceland",      "IS", 65.6600, -18.0728),
    # Lithuania
    ("VNO", "Vilnius",             "Lithuania",    "LT", 54.6341, 25.2858),
    ("KUN", "Kaunas",              "Lithuania",    "LT", 54.9639, 24.0848),
    ("PLQ", "Palanga",             "Lithuania",    "LT", 55.9733, 21.0939),
    # Latvia
    ("RIX", "Riga",                "Latvia",       "LV", 56.9236, 23.9711),
    # Estonia
    ("TLL", "Tallinn",             "Estonia",      "EE", 59.4133, 24.8328),
    # Romania
    ("OTP", "Bucharest (Otopeni)", "Romania",      "RO", 44.5711, 26.0850),
    ("CLJ", "Cluj-Napoca",         "Romania",      "RO", 46.7852, 23.6862),
    ("TSR", "Timisoara",           "Romania",      "RO", 45.8099, 21.3379),
    ("IAS", "Iasi",                "Romania",      "RO", 47.1785, 27.6206),
    ("SBZ", "Sibiu",               "Romania",      "RO", 45.7856, 24.0913),
    ("CND", "Constanta",           "Romania",      "RO", 44.3622, 28.4883),
    ("CRA", "Craiova",             "Romania",      "RO", 44.3181, 23.8886),
    ("BCM", "Bacau",               "Romania",      "RO", 46.5219, 26.9103),
    ("OMR", "Oradea",              "Romania",      "RO", 47.0253, 21.9023),
    ("SUJ", "Suceava",             "Romania",      "RO", 47.6875, 26.3540),
    ("TGM", "Targu Mures",         "Romania",      "RO", 46.4677, 24.4125),
    # Bulgaria
    ("SOF", "Sofia",               "Bulgaria",     "BG", 42.6967, 23.4114),
    ("BOJ", "Burgas",              "Bulgaria",     "BG", 42.5696, 27.5152),
    ("VAR", "Varna",               "Bulgaria",     "BG", 43.2322, 27.8252),
    ("PDV", "Plovdiv",             "Bulgaria",     "BG", 42.0678, 24.8508),
    # Croatia
    ("ZAG", "Zagreb",              "Croatia",      "HR", 45.7429, 16.0688),
    ("SPU", "Split",               "Croatia",      "HR", 43.5389, 16.2980),
    ("DBV", "Dubrovnik",           "Croatia",      "HR", 42.5614, 18.2682),
    ("PUY", "Pula",                "Croatia",      "HR", 44.8935, 13.9222),
    ("ZAD", "Zadar",               "Croatia",      "HR", 44.1083, 15.3467),
    ("RJK", "Rijeka",              "Croatia",      "HR", 45.2169, 14.5703),
    ("OSI", "Osijek",              "Croatia",      "HR", 45.4627, 18.8101),
    # Slovenia
    ("LJU", "Ljubljana",           "Slovenia",     "SI", 46.2237, 14.4576),
    ("MBX", "Maribor",             "Slovenia",     "SI", 46.4799, 15.6862),
    # Bosnia
    ("SJJ", "Sarajevo",            "Bosnia and Herzegovina","BA", 43.8246, 18.3315),
    ("BNX", "Banja Luka",          "Bosnia and Herzegovina","BA", 44.9414, 17.2975),
    ("TZL", "Tuzla",               "Bosnia and Herzegovina","BA", 44.4587, 18.7248),
    ("OMO", "Mostar",              "Bosnia and Herzegovina","BA", 43.2829, 17.8458),
    # Serbia
    ("BEG", "Belgrade",            "Serbia",       "RS", 44.8184, 20.3091),
    ("INI", "Nis",                 "Serbia",       "RS", 43.3373, 21.8537),
    # Montenegro
    ("TIV", "Tivat",               "Montenegro",   "ME", 42.4047, 18.7233),
    ("TGD", "Podgorica",           "Montenegro",   "ME", 42.3594, 19.2519),
    # Albania
    ("TIA", "Tirana",              "Albania",      "AL", 41.4147, 19.7206),
    # North Macedonia
    ("SKP", "Skopje",              "North Macedonia","MK", 41.9616, 21.6214),
    ("OHD", "Ohrid",               "North Macedonia","MK", 41.1800, 20.7423),
    # Cyprus
    ("LCA", "Larnaca",             "Cyprus",       "CY", 34.8751, 33.6249),
    ("PFO", "Paphos",              "Cyprus",       "CY", 34.7180, 32.4857),
    # Malta
    ("MLA", "Malta",               "Malta",        "MT", 35.8575, 14.4775),
    # Kosovo
    ("PRN", "Pristina",            "Kosovo",       "XK", 42.5728, 21.0359),
    # Ukraine (currently flights very limited / suspended)
    # Belarus (limited)
    # Moldova
    ("KIV", "Chișinău",            "Moldova",      "MD", 46.9277, 28.9310),
    # Faroe Islands (Atlantic Airways) — self-governing territory, ISO2 FO (not DK)
    ("FAE", "Vágar (Faroe Islands)","Faroe Islands","FO", 62.0636, -7.2772),
    # Channel Islands
    ("JER", "Jersey",              "United Kingdom","GB", 49.2079, -2.1955),
    ("GCI", "Guernsey",            "United Kingdom","GB", 49.4350, -2.6021),
    ("ACI", "Alderney",            "United Kingdom","GB", 49.7060, -2.2147),
    # Isle of Man
    ("IOM", "Isle of Man",         "United Kingdom","GB", 54.0833, -4.6239),
]


# ─── TIER C: Non-Ryanair airports referenced as nearest-airport for gems ──
# These airports don't have direct BRU/CRL Ryanair service, so fares to them
# are ESTIMATED (distance-based). Used as connection points for gems.
NON_RYANAIR_AIRPORTS = [
    ("BRN", "Bern",                "Switzerland",  "CH", 46.9141,  7.4971),
    ("LNZ", "Linz",                "Austria",      "AT", 48.2333, 14.1875),
    ("BOO", "Bodø",                "Norway",       "NO", 67.2692, 14.3653),
    ("AES", "Ålesund",             "Norway",       "NO", 62.5625,  6.1197),
    ("KRN", "Kiruna",              "Sweden",       "SE", 67.8214, 20.3367),
    ("VBY", "Visby",               "Sweden",       "SE", 57.6628, 18.3462),
    ("INV", "Inverness",           "United Kingdom","GB", 57.5425, -4.0475),
]

# Airports that are ONLY access points for their namesake gem — the town is the
# real destination (Rotterdam/RTM, Mostar/OMO, Kiruna/KRN, Visby/VBY). They stay
# resolvable in all_airports() for fares/transfers but are not emitted as
# standalone destinations, else the place is double-counted (airport + gem).
CONNECTION_ONLY_AIRPORTS = {"RTM", "OMO", "KRN", "VBY"}


# ─── NON-AIRPORT GEMS ────────────────────────────────────────────────────────
# Cities/regions without their own airport, but worth visiting.
# Each lists nearest_airports = [(IATA, ground_transport_minutes, ground_cost_eur)]
# Format: (slug, name, country, ISO2, lat, lon, [(airport, mins, eur)], category, blurb)
NON_AIRPORT_GEMS = [
    # Belgium
    ("bruges",     "Bruges",            "Belgium",        "BE", 51.2093,  3.2247,
     [("BRU", 60, 15), ("CRL", 90, 20)],
     "city,canals,medieval", "UNESCO medieval canal city, day-trip from Brussels"),
    ("ghent",      "Ghent",             "Belgium",        "BE", 51.0543,  3.7174,
     [("BRU", 45, 12)],
     "city,medieval,gothic", "Medieval Flemish city, less touristy than Bruges"),
    ("antwerp",    "Antwerp",           "Belgium",        "BE", 51.2194,  4.4025,
     [("BRU", 40, 10)],
     "city,art,fashion", "Diamond and fashion capital, Rubens' city"),
    # Netherlands
    ("utrecht",    "Utrecht",           "Netherlands",    "NL", 52.0907,  5.1214,
     [("AMS", 30, 9)],
     "city,canals,university", "Amsterdam's older sister, prettier and quieter"),
    ("rotterdam",  "Rotterdam",         "Netherlands",    "NL", 51.9244,  4.4777,
     [("RTM", 15, 5), ("AMS", 60, 14)],
     "city,architecture,modern", "Cubist houses, modern architecture playground"),
    ("delft",      "Delft",             "Netherlands",    "NL", 52.0116,  4.3571,
     [("RTM", 25, 7), ("AMS", 60, 14)],
     "city,historic,art,canals,pottery", "Vermeer's town, blue pottery, classic canals"),
    ("haarlem",    "Haarlem",           "Netherlands",    "NL", 52.3874,  4.6462,
     [("AMS", 25, 7)],
     "city,historic,art,quaint", "Tulip-fields nearby in spring; Haarlem itself is gorgeous"),
    ("zaanse-schans","Zaanse Schans",   "Netherlands",    "NL", 52.4744,  4.8189,
     [("AMS", 25, 6)],
     "village,windmills,quaint,historic", "Windmill village 30 min from Amsterdam"),
    # Germany — non-airport
    ("rothenburg", "Rothenburg ob der Tauber","Germany", "DE", 49.3781, 10.1789,
     [("NUE", 90, 25), ("FMM", 120, 30)],
     "village,medieval,fairytale", "The most preserved medieval town in Germany"),
    ("heidelberg", "Heidelberg",        "Germany",        "DE", 49.3988,  8.6724,
     [("FRA", 80, 18), ("STR", 100, 20)],
     "city,castle,romantic", "Romantic university town with hilltop castle"),
    ("bamberg",    "Bamberg",           "Germany",        "DE", 49.8988, 10.9028,
     [("NUE", 70, 18)],
     "city,unesco,beer", "UNESCO Old Town, world's beer capital"),
    ("regensburg", "Regensburg",        "Germany",        "DE", 49.0134, 12.1016,
     [("MUC", 90, 20), ("NUE", 90, 18)],
     "city,medieval,unesco", "UNESCO medieval city on the Danube"),
    ("wurzburg",   "Würzburg",          "Germany",        "DE", 49.7913,  9.9534,
     [("NUE", 90, 20), ("FRA", 90, 22)],
     "city,wine,baroque", "Baroque palaces, Franconian wine country"),
    ("garmisch",   "Garmisch-Partenkirchen","Germany",   "DE", 47.4920, 11.0954,
     [("MUC", 100, 25)],
     "alps,mountains,skiing", "Bavarian Alps, gateway to Zugspitze"),
    ("neuschwanstein","Neuschwanstein", "Germany",        "DE", 47.5576, 10.7498,
     [("MUC", 130, 30), ("FMM", 90, 22)],
     "castle,fairytale,alps", "The fairytale castle inspiring Disney"),
    ("baden-baden","Baden-Baden",       "Germany",        "DE", 48.7606,  8.2397,
     [("FKB", 30, 8), ("STR", 80, 18)],
     "spa,thermal,elegant,unesco,historic", "19th-century spa town, thermal baths"),
    ("dresden-saxon","Saxon Switzerland","Germany",      "DE", 50.8845, 14.0830,
     [("DRS", 50, 12)],
     "mountains,hiking,bridge", "Sandstone formations, Bastei Bridge"),
    # Czech Republic
    ("cesky-krumlov","Český Krumlov",   "Czechia",        "CZ", 48.8113, 14.3151,
     [("PRG", 180, 40), ("LNZ", 60, 20)],
     "town,unesco,medieval,fairytale", "UNESCO medieval town, river-bend castle"),
    ("karlovy-vary","Karlovy Vary",     "Czechia",        "CZ", 50.2316, 12.8717,
     [("PRG", 120, 22)],
     "spa,thermal,elegant,unesco,historic", "19th-century spa town, hot springs"),
    ("kutna-hora", "Kutná Hora",        "Czechia",        "CZ", 49.9484, 15.2680,
     [("PRG", 60, 12)],
     "town,unesco,bones", "Sedlec ossuary, UNESCO silver-mining town"),
    ("plzen",      "Pilsen",            "Czechia",        "CZ", 49.7384, 13.3736,
     [("PRG", 75, 15)],
     "city,beer,brewery", "Birthplace of pilsner beer"),
    ("olomouc",    "Olomouc",           "Czechia",        "CZ", 49.5938, 17.2509,
     [("BRQ", 75, 15)],
     "city,unesco,baroque", "Less-touristed historic Moravian capital"),
    # Austria — non-airport
    ("hallstatt",  "Hallstatt",         "Austria",        "AT", 47.5622, 13.6493,
     [("SZG", 75, 18), ("LNZ", 90, 22)],
     "village,unesco,lakeside,fairytale", "Iconic lakeside Alpine village"),
    ("bad-ischl", "Bad Ischl",         "Austria",        "AT", 47.7126, 13.6273,
     [("SZG", 60, 15)],
     "spa,imperial,salzkammergut,historic", "Imperial spa, Salzkammergut gateway"),
    ("st-anton",   "St. Anton am Arlberg","Austria",     "AT", 47.1289, 10.2614,
     [("INN", 75, 20)],
     "alps,skiing,mountains", "World-class Alpine skiing"),
    ("zell-am-see","Zell am See",       "Austria",        "AT", 47.3267, 12.7937,
     [("SZG", 100, 22)],
     "alps,lake,skiing", "Lake-and-mountain Alpine resort"),
    ("durnstein",  "Dürnstein",         "Austria",        "AT", 48.3956, 15.5189,
     [("VIE", 90, 22)],
     "town,wine,danube,wachau", "Wachau wine valley, ruined castle"),
    # Slovenia
    ("bled",       "Lake Bled",         "Slovenia",       "SI", 46.3683, 14.1146,
     [("LJU", 50, 15)],
     "lake,alps,island,iconic", "Iconic island church, alpine lake"),
    ("bohinj",     "Lake Bohinj",       "Slovenia",       "SI", 46.2792, 13.8810,
     [("LJU", 80, 18)],
     "lake,alps,quiet,national-park", "Bigger, quieter, wilder than Bled"),
    ("piran",      "Piran",             "Slovenia",       "SI", 45.5283, 13.5683,
     [("TRS", 60, 15), ("LJU", 90, 20)],
     "coast,venetian,medieval", "Venetian-style Slovenian seaside town"),
    # Switzerland
    ("interlaken", "Interlaken",        "Switzerland",    "CH", 46.6863,  7.8632,
     [("ZRH", 130, 35), ("BSL", 110, 28), ("GVA", 150, 40)],
     "alps,lakes,adventure", "Two lakes, alpine activities, Jungfrau gateway"),
    ("zermatt",    "Zermatt",           "Switzerland",    "CH", 46.0207,  7.7491,
     [("ZRH", 210, 70), ("GVA", 240, 80)],
     "alps,matterhorn,car-free", "Car-free Matterhorn village"),
    ("lucerne",    "Lucerne",           "Switzerland",    "CH", 47.0502,  8.3093,
     [("ZRH", 60, 20)],
     "lake,alps,classic", "Classic Swiss lake city"),
    ("st-moritz",  "St. Moritz",        "Switzerland",    "CH", 46.4988,  9.8369,
     [("ZRH", 210, 70)],
     "alps,luxury,skiing", "Luxury Alpine resort"),
    ("grindelwald","Grindelwald",       "Switzerland",    "CH", 46.6244,  8.0414,
     [("ZRH", 150, 40), ("BSL", 130, 35)],
     "alps,jungfrau,village", "Jungfrau village, hiking and skiing"),
    ("lauterbrunnen","Lauterbrunnen",   "Switzerland",    "CH", 46.5933,  7.9078,
     [("ZRH", 160, 42), ("BSL", 140, 35)],
     "valley,waterfalls,alps", "72-waterfall valley, hobbit-shire vibes"),
    # Italy — non-airport
    ("cinque-terre","Cinque Terre",     "Italy",          "IT", 44.1278,  9.7104,
     [("PSA", 90, 22), ("GOA", 90, 22)],
     "coast,villages,unesco,iconic", "Five clifftop villages, UNESCO"),
    ("amalfi-coast","Amalfi Coast",     "Italy",          "IT", 40.6340, 14.6027,
     [("NAP", 75, 22)],
     "coast,unesco,iconic,villages", "Positano, Amalfi, Ravello: cliffside villages"),
    ("portofino",  "Portofino",         "Italy",          "IT", 44.3034,  9.2090,
     [("GOA", 60, 18)],
     "coast,luxury,iconic", "Tiny luxury fishing harbor on Italian Riviera"),
    ("como",       "Lake Como",         "Italy",          "IT", 45.9999,  9.2580,
     [("MXP", 60, 18), ("BGY", 90, 22), ("LIN", 75, 20)],
     "lake,alps,villas,iconic", "Glamorous alpine lake, villas and slopes"),
    ("garda",      "Lake Garda",        "Italy",          "IT", 45.6492, 10.6967,
     [("VRN", 30, 12), ("BGY", 75, 20)],
     "lake,alps,family", "Italy's largest lake, family-friendly"),
    ("dolomites",  "Dolomites (Cortina)","Italy",         "IT", 46.5403, 12.1357,
     [("VCE", 130, 30), ("INN", 130, 30)],
     "alps,unesco,mountains,skiing", "UNESCO peaks, Cortina d'Ampezzo"),
    ("tuscany-siena","Siena & Val d'Orcia","Italy",       "IT", 43.3188, 11.3308,
     [("PSA", 130, 25), ("FLR", 75, 18)],
     "tuscany,countryside,wine,unesco", "Medieval Siena + UNESCO wine countryside"),
    ("matera",     "Matera",            "Italy",          "IT", 40.6663, 16.6042,
     [("BRI", 60, 18)],
     "city,unesco,cave,historic", "UNESCO cave city, ancient and otherworldly"),
    ("alberobello","Alberobello",       "Italy",          "IT", 40.7833, 17.2333,
     [("BRI", 60, 15)],
     "village,unesco,trulli", "UNESCO trulli (cone-roofed houses)"),
    ("lecce",      "Lecce",             "Italy",          "IT", 40.3515, 18.1750,
     [("BDS", 50, 15)],
     "city,baroque,puglia", "Baroque limestone capital of Puglia"),
    ("polignano",  "Polignano a Mare",  "Italy",          "IT", 40.9961, 17.2189,
     [("BRI", 40, 12)],
     "coast,cliff,puglia,beach", "Clifftop town, swimmable cove"),
    ("ravenna",    "Ravenna",           "Italy",          "IT", 44.4173, 12.1972,
     [("BLQ", 75, 18)],
     "city,unesco,mosaics,byzantine", "UNESCO Byzantine mosaics"),
    ("urbino",     "Urbino",            "Italy",          "IT", 43.7264, 12.6364,
     [("RMI", 90, 20), ("AOI", 75, 18)],
     "city,unesco,renaissance", "UNESCO Renaissance hill town"),
    # France — non-airport
    ("annecy",     "Annecy",            "France",         "FR", 45.8992,  6.1294,
     [("LYS", 90, 22), ("GVA", 45, 18)],
     "lake,alps,canals,fairytale", "Alpine lake city with canals"),
    ("colmar",     "Colmar",            "France",         "FR", 48.0794,  7.3585,
     [("BSL", 50, 18), ("STR", 100, 22)],
     "town,alsace,wine,fairytale", "Alsatian half-timbered fairytale"),
    ("strasbourg", "Strasbourg",        "France",         "FR", 48.5734,  7.7521,
     [("FKB", 50, 14), ("BSL", 110, 25), ("STR", 90, 22)],
     "city,unesco,alsace", "Petite France canals, UNESCO old town"),
    ("avignon",    "Avignon",           "France",         "FR", 43.9493,  4.8055,
     [("MRS", 60, 18), ("MPL", 90, 22)],
     "city,unesco,papal,provence", "UNESCO papal palace, Provence gateway"),
    ("aix",        "Aix-en-Provence",   "France",         "FR", 43.5297,  5.4474,
     [("MRS", 30, 10)],
     "city,provence,cezanne,fountains", "Cézanne's Provence, fountains and squares"),
    ("etretat",    "Étretat",           "France",         "FR", 49.7079,  0.2078,
     [("CDG", 180, 40), ("ORY", 200, 45)],
     "coast,cliffs,normandy,nature", "Iconic Normandy chalk cliffs"),
    ("mont-saint-michel","Mont-Saint-Michel","France",   "FR", 48.6361, -1.5114,
     [("RNS", 90, 20), ("CDG", 240, 60)],
     "abbey,unesco,iconic,tidal-island", "UNESCO tidal island abbey"),
    ("saint-malo", "Saint-Malo",        "France",         "FR", 48.6492, -2.0258,
     [("RNS", 75, 18)],
     "coast,walled-city,brittany,historic,beach", "Walled corsair city on Brittany coast"),
    ("chamonix",   "Chamonix",          "France",         "FR", 45.9237,  6.8694,
     [("GVA", 90, 30)],
     "alps,mont-blanc,skiing,iconic", "Mont Blanc village, Alpine icon"),
    ("loire-valley","Loire Valley (Tours)","France",     "FR", 47.3941,  0.6848,
     [("CDG", 150, 30), ("NTE", 120, 30)],
     "valley,castles,wine,unesco", "Châteaux and wine country, UNESCO"),
    ("provence-luberon","Luberon (Gordes)","France",    "FR", 43.9120,  5.2010,
     [("MRS", 90, 25)],
     "provence,villages,lavender,iconic", "Hilltop villages, lavender, ochre"),
    ("biarritz-coast","Saint-Jean-de-Luz","France",     "FR", 43.3879, -1.6627,
     [("BIQ", 30, 10)],
     "coast,basque,beach", "Basque coast charm, gentler than Biarritz"),
    ("nice-villefranche","Villefranche-sur-Mer","France","FR", 43.7036,  7.3094,
     [("NCE", 20, 8)],
     "coast,cote-azur,village,quiet,beach", "Côte d'Azur fishing village"),
    # Spain — non-airport gems
    ("ronda",      "Ronda",             "Spain",          "ES", 36.7421, -5.1664,
     [("AGP", 90, 22), ("SVQ", 130, 28)],
     "town,gorge,andalusia,iconic", "Cliffside Andalusian town with gorge"),
    ("cordoba",    "Córdoba",           "Spain",          "ES", 37.8847, -4.7791,
     [("SVQ", 90, 20), ("AGP", 130, 28)],
     "city,unesco,mosque,andalusia", "UNESCO mezquita, Moorish heritage"),
    ("granada",    "Granada",           "Spain",          "ES", 37.1773, -3.5986,
     [("AGP", 90, 22), ("MAD", 240, 50)],
     "city,unesco,alhambra,andalusia", "Alhambra, Sierra Nevada views"),
    ("toledo",     "Toledo",            "Spain",          "ES", 39.8628, -4.0273,
     [("MAD", 60, 12)],
     "city,unesco,medieval", "UNESCO medieval city, Madrid day-trip"),
    ("salamanca",  "Salamanca",         "Spain",          "ES", 40.9700, -5.6635,
     [("VLL", 90, 20), ("MAD", 150, 30)],
     "city,unesco,university", "UNESCO sandstone university city"),
    ("segovia",    "Segovia",           "Spain",          "ES", 40.9479, -4.1187,
     [("MAD", 60, 14)],
     "city,unesco,roman,aqueduct", "Roman aqueduct, fairytale alcázar"),
    ("san-sebastian","San Sebastián",   "Spain",          "ES", 43.3183, -1.9812,
     [("BIO", 90, 20), ("BIQ", 60, 18)],
     "city,beach,basque,food,iconic", "World-class pintxos, perfect bay"),
    # Portugal — non-airport gems
    ("sintra",     "Sintra",            "Portugal",       "PT", 38.7980, -9.3878,
     [("LIS", 50, 12)],
     "town,unesco,palaces,fairytale", "UNESCO romantic palaces, day-trip from Lisbon"),
    ("evora",      "Évora",             "Portugal",       "PT", 38.5713, -7.9135,
     [("LIS", 90, 22)],
     "city,unesco,medieval", "UNESCO medieval whitewashed town"),
    ("obidos",     "Óbidos",            "Portugal",       "PT", 39.3606, -9.1572,
     [("LIS", 75, 18)],
     "village,walled,medieval", "Walled medieval village, day-trip"),
    ("douro",      "Douro Valley (Pinhão)","Portugal",   "PT", 41.1908, -7.5494,
     [("OPO", 100, 25)],
     "valley,wine,terraces,unesco", "UNESCO Port-wine terraced valley"),
    ("nazare",     "Nazaré",            "Portugal",       "PT", 39.6011, -9.0700,
     [("LIS", 100, 22)],
     "coast,surf,fishing,beach", "Massive surf waves, fishing-village charm"),
    # Greece — non-airport gems
    ("meteora",    "Meteora",           "Greece",         "GR", 39.7217, 21.6306,
     [("VOL", 90, 20), ("SKG", 240, 40)],
     "monasteries,unesco,iconic,rocks", "UNESCO clifftop monasteries"),
    ("delphi",     "Delphi",            "Greece",         "GR", 38.4824, 22.5010,
     [("ATH", 130, 30)],
     "ruins,unesco,oracle,mountains", "Ancient oracle, mountain setting"),
    ("naxos",      "Naxos",             "Greece",         "GR", 37.0855, 25.3686,
     [("JTR", 60, 25), ("JMK", 60, 25)],
     "island,beach,quiet", "Largest Cyclade, less touristy than Santorini"),
    ("paros",      "Paros",             "Greece",         "GR", 37.0853, 25.1521,
     [("JMK", 60, 25)],
     "island,beach,whitewashed", "Cycladic charm, fewer crowds"),
    ("milos",      "Milos",             "Greece",         "GR", 36.7218, 24.4484,
     [("ATH", 180, 60)],   # fly to Athens, then Piraeus->Milos fast ferry (~3h, sea leg)
     "island,beach,volcanic", "Volcanic moonscape beaches"),
    # Croatia — non-airport gems
    ("plitvice",   "Plitvice Lakes",    "Croatia",        "HR", 44.8654, 15.5820,
     [("ZAG", 130, 28), ("ZAD", 90, 22)],
     "lakes,unesco,national-park,waterfalls", "UNESCO 16-lake national park"),
    ("hvar",       "Hvar",              "Croatia",        "HR", 43.1729, 16.4413,
     [("SPU", 90, 30)],
     "island,coast,party,lavender", "Glam Adriatic island"),
    ("korcula",    "Korčula",           "Croatia",        "HR", 42.9606, 17.1359,
     [("DBV", 180, 35)],
     "island,medieval,quiet", "Marco Polo's island home"),
    ("mostar-ba",  "Mostar",            "Bosnia and Herzegovina","BA", 43.3438, 17.8079,
     [("OMO", 20, 8), ("DBV", 130, 30), ("SPU", 180, 35)],
     "city,unesco,bridge,ottoman", "UNESCO Old Bridge, Ottoman heart"),
    # Hungary — non-airport
    ("eger",       "Eger",              "Hungary",        "HU", 47.9025, 20.3779,
     [("BUD", 130, 25)],
     "town,castle,wine", "Wine country, baroque town, Turkish minaret"),
    # Norway — non-airport gems
    ("lofoten",    "Lofoten Islands",   "Norway",         "NO", 68.1500, 13.7500,
     [("BOO", 0, 0)],
     "islands,fjords,arctic,iconic", "Arctic islands, dramatic peaks"),
    ("geiranger",  "Geirangerfjord",    "Norway",         "NO", 62.1004,  7.2098,
     [("AES", 120, 30)],
     "fjord,unesco,iconic", "UNESCO World Heritage fjord"),
    ("bergen-nearby","Sognefjord",      "Norway",         "NO", 61.0650,  6.6500,
     [("BGO", 180, 40)],
     "fjord,longest,deep", "Norway's longest, deepest fjord"),
    # Sweden — non-airport gems
    ("kiruna",     "Kiruna / Abisko",   "Sweden",         "SE", 67.8558, 20.2253,
     [("KRN", 0, 0)],
     "arctic,northern-lights,winter,mountains,national-park", "Aurora viewing, Ice Hotel, Sami culture"),
    ("visby",      "Visby (Gotland)",   "Sweden",         "SE", 57.6348, 18.2940,
     [("VBY", 0, 0)],
     "island,unesco,medieval,walled", "UNESCO walled medieval Hanseatic town"),
    ("dalarna",    "Dalarna",           "Sweden",         "SE", 60.6065, 15.6355,
     [("ARN", 240, 50)],
     "countryside,traditional,red-cottages", "Quintessential Swedish countryside"),
    # Iceland — non-airport
    ("vik",        "Vík & South Coast", "Iceland",        "IS", 63.4194, -19.0067,
     [("KEF", 150, 80)],
     "coast,glaciers,black-sand,iconic", "Black sand beaches, glaciers, waterfalls"),
    ("skaftafell", "Skaftafell / Vatnajökull","Iceland", "IS", 64.0166, -16.9670,
     [("KEF", 240, 100)],
     "glaciers,national-park,ice", "Largest European glacier, hiking"),
    # Romania — non-airport
    ("brasov",     "Brașov & Bran",     "Romania",        "RO", 45.6580, 25.6012,
     [("OTP", 150, 25), ("SBZ", 130, 22)],
     "city,castle,medieval,carpathians", "Transylvanian medieval city, Bran castle"),
    ("sighisoara", "Sighișoara",        "Romania",        "RO", 46.2197, 24.7920,
     [("TGM", 60, 15), ("SBZ", 90, 18)],
     "town,unesco,medieval", "UNESCO medieval Transylvanian citadel"),
    # Bulgaria
    ("rila",       "Rila Monastery",    "Bulgaria",       "BG", 42.1300, 23.3403,
     [("SOF", 130, 22)],
     "monastery,unesco,mountains", "UNESCO frescoed mountain monastery"),
    ("veliko-tarnovo","Veliko Tarnovo", "Bulgaria",       "BG", 43.0758, 25.6172,
     [("SOF", 240, 35), ("VAR", 240, 35)],
     "town,fortress,medieval", "Medieval Bulgarian capital"),
    # Albania
    ("berat",      "Berat",             "Albania",        "AL", 40.7058, 19.9522,
     [("TIA", 130, 25)],
     "town,unesco,thousand-windows", "UNESCO 'town of a thousand windows'"),
    ("gjirokaster","Gjirokastër",       "Albania",        "AL", 40.0758, 20.1389,
     [("TIA", 240, 35)],
     "town,unesco,stone,ottoman", "UNESCO Ottoman stone town"),
    ("ksamil",     "Ksamil",            "Albania",        "AL", 39.7706, 20.0064,
     [("TIA", 270, 40), ("CFU", 60, 30)],
     "coast,beach,quiet,affordable", "Albanian Riviera, turquoise water"),
    # Montenegro
    ("kotor",      "Kotor",             "Montenegro",     "ME", 42.4247, 18.7712,
     [("TIV", 15, 8), ("DBV", 90, 20)],
     "bay,unesco,medieval,fjord-like", "UNESCO walled bay city"),
    ("budva",      "Budva",             "Montenegro",     "ME", 42.2911, 18.8403,
     [("TIV", 25, 10)],
     "coast,beach,old-town", "Coastal old town, beach resort"),
    # Faroe Islands
    ("torshavn",   "Tórshavn",          "Faroe Islands",  "FO", 62.0117, -6.7770,
     [("FAE", 50, 15)],
     "islands,remote,dramatic,nature", "Faroese capital, turf-roofed harbour town in the North Atlantic"),
    # UK — non-airport
    ("bath",       "Bath",              "United Kingdom","GB", 51.3811, -2.3590,
     [("BRS", 30, 8), ("LHR", 120, 25)],
     "city,unesco,roman,georgian", "UNESCO Roman baths, Georgian architecture"),
    ("oxford",     "Oxford",            "United Kingdom","GB", 51.7520, -1.2577,
     [("LHR", 75, 18), ("LTN", 90, 22)],
     "city,university,gothic", "Spires, colleges, Harry-Potter dining halls"),
    ("cambridge",  "Cambridge",         "United Kingdom","GB", 52.2053,  0.1218,
     [("STN", 30, 10), ("LHR", 120, 30)],
     "city,university,punting", "Punting, King's College Chapel"),
    ("york",       "York",              "United Kingdom","GB", 53.9600, -1.0873,
     [("LBA", 60, 15), ("MAN", 100, 22)],
     "city,medieval,roman,viking", "Walled medieval city, Roman roots"),
    ("cotswolds",  "Cotswolds",         "United Kingdom","GB", 51.8330, -1.8433,
     [("BHX", 75, 20), ("BRS", 90, 22), ("LHR", 90, 22)],
     "countryside,villages,quintessentially-english", "Honey-stone villages"),
    ("lake-district","Lake District",   "United Kingdom","GB", 54.4609, -3.0886,
     [("MAN", 130, 28), ("LPL", 130, 28)],
     "lakes,mountains,national-park", "Wordsworth's lakes and fells"),
    ("isle-of-skye","Isle of Skye",     "United Kingdom","GB", 57.2730, -6.2154,
     [("INV", 240, 50), ("GLA", 300, 60)],
     "island,scotland,dramatic,iconic", "Dramatic Scottish island"),
    ("st-ives",    "St Ives",           "United Kingdom","GB", 50.2080, -5.4805,
     [("EXT", 180, 40)],
     "coast,beach,artist,cornwall", "Cornish artist colony, surf beaches"),
    # Ireland — non-airport
    ("galway-cliffs","Galway & Cliffs of Moher","Ireland","IE", 53.2707, -9.0568,
     [("SNN", 75, 18), ("KIR", 130, 28)],
     "city,coast,cliffs,music", "Irish trad-music capital, day-trip to Cliffs"),
    ("dingle",     "Dingle",            "Ireland",        "IE", 52.1404, -10.2658,
     [("KIR", 60, 15), ("ORK", 180, 35)],
     "peninsula,coast,gaeltacht,nature", "Wild Atlantic, Gaeltacht-speaking peninsula"),
    ("connemara",  "Connemara",         "Ireland",        "IE", 53.5500, -9.8500,
     [("SNN", 130, 28)],
     "wilderness,bogs,mountains", "Wild Irish west, bogs and lakes"),
    # Poland — non-airport
    ("zakopane",   "Zakopane",          "Poland",         "PL", 49.2992, 19.9496,
     [("KRK", 100, 22)],
     "alps,mountains,winter,village", "Polish Tatra mountain resort"),
    ("auschwitz",  "Auschwitz / Wieliczka","Poland",     "PL", 50.0276, 19.2050,
     [("KRK", 90, 22)],
     "memorial,history,unesco", "Auschwitz memorial, Wieliczka salt mine"),
    ("masuria",    "Masurian Lakes",    "Poland",         "PL", 53.7000, 21.6000,
     [("WAW", 240, 45)],
     "lakes,sailing,nature,quiet", "Lake district for sailing/canoeing"),
    # Slovakia — non-airport
    ("high-tatras","High Tatras",       "Slovakia",       "SK", 49.1951, 20.0822,
     [("KSC", 130, 25), ("KRK", 130, 25)],
     "alps,mountains,national-park", "Slovak/Polish Alps, hiking and skiing"),
    # Lichtenstein
    ("vaduz",      "Vaduz",             "Liechtenstein",  "LI", 47.1410,  9.5215,
     [("ZRH", 90, 25)],
     "country,castle,curiosity", "Tiny principality, mountain views"),
    # Andorra
    ("andorra-la-vella","Andorra la Vella","Andorra",    "AD", 42.5063,  1.5218,
     [("BCN", 200, 35), ("TLS", 180, 30)],
     "country,alps,duty-free,skiing", "Pyrenees micro-nation"),
    # San Marino
    ("san-marino", "San Marino",        "San Marino",     "SM", 43.9424, 12.4578,
     [("RMI", 30, 10), ("BLQ", 130, 25)],
     "country,unesco,fortress", "UNESCO fortress micro-state"),
    # Monaco
    ("monaco-mc",  "Monaco",            "Monaco",         "MC", 43.7384,  7.4246,
     [("NCE", 30, 12)],
     "country,luxury,casino,coast,iconic", "Glamorous Riviera principality"),
    # Greek mainland gems already covered (Meteora, Delphi)

    # ─── Belgium (extras) ───
    ("leuven",       "Leuven",                 "Belgium",        "BE", 50.8794,  4.7009,
     [("BRU", 30, 8)],
     "city,medieval,university,beer", "Stella's hometown, gothic university city, beer culture"),
    ("mechelen",     "Mechelen",               "Belgium",        "BE", 51.0259,  4.4776,
     [("BRU", 25, 7)],
     "city,medieval,cathedral,quiet", "Compact Flemish cathedral city, between Brussels and Antwerp"),
    ("dinant",       "Dinant",                 "Belgium",        "BE", 50.2607,  4.9119,
     [("BRU", 90, 22), ("CRL", 60, 15)],
     "town,valley,romantic", "Citadel above the Meuse, Sax's birthplace, dramatic riverside setting"),

    # ─── Netherlands (extras) ───
    ("giethoorn",    "Giethoorn",              "Netherlands",    "NL", 52.7396,  6.0763,
     [("AMS", 90, 22)],
     "village,canals,quiet,romantic", "Car-free 'Dutch Venice' of waterways and thatched roofs"),
    ("kinderdijk",   "Kinderdijk",             "Netherlands",    "NL", 51.8838,  4.6420,
     [("RTM", 30, 8), ("AMS", 70, 18)],
     "village,unesco,windmills,iconic", "19 UNESCO windmills lined along the canals, postcard Netherlands"),
    ("texel",        "Texel",                  "Netherlands",    "NL", 53.0520,  4.7980,
     [("AMS", 120, 30)],
     "island,beach,quiet,family", "North Sea island, wide beaches, dunes, seal colonies, slow pace"),
    ("leiden",       "Leiden",                 "Netherlands",    "NL", 52.1601,  4.4970,
     [("AMS", 30, 9)],
     "city,canals,university,historic", "Rembrandt's birthplace, canal-laced student town, oldest Dutch university"),

    # ─── Ireland (extras) ───
    ("killarney",    "Killarney",              "Ireland",        "IE", 52.0599, -9.5044,
     [("KIR", 25, 8), ("ORK", 90, 22), ("SNN", 110, 28)],
     "town,national-park,mountains,lake", "Ring of Kerry gateway, lakes and mountains national park"),
    ("kilkenny",     "Kilkenny",               "Ireland",        "IE", 52.6541, -7.2448,
     [("DUB", 90, 22), ("ORK", 130, 30)],
     "town,medieval,castle,historic", "Walled medieval town, riverside castle, classic Irish stone streets"),
    ("doolin",       "Doolin",                 "Ireland",        "IE", 53.0149, -9.3792,
     [("SNN", 75, 20)],
     "village,coast,music,cliffs,nature", "Trad-music capital, gateway to the Cliffs of Moher and Aran Islands"),
    ("aran-islands", "Aran Islands (Inishmore)","Ireland",       "IE", 53.1267, -9.7358,
     [("SNN", 90, 35)],
     "island,remote,coast,gaelic", "Wind-carved limestone islands, Iron Age forts, Irish-speaking villages"),

    # ─── Czech Republic (extras) ───
    ("telc",         "Telč",                   "Czechia", "CZ", 49.1840, 15.4533,
     [("BRQ", 100, 22), ("PRG", 150, 32)],
     "town,unesco,renaissance,fairytale", "UNESCO pastel-arcaded square, perfectly preserved Renaissance town"),
    ("mikulov",      "Mikulov",                "Czechia", "CZ", 48.8056, 16.6383,
     [("BRQ", 50, 14), ("VIE", 90, 22)],
     "town,wine,castle,baroque", "Moravian wine country, hilltop chateau, Jewish heritage"),

    # ─── Austria (extras) ───
    ("melk",         "Melk",                   "Austria",        "AT", 48.2273, 15.3325,
     [("VIE", 80, 18)],
     "town,abbey,baroque,wachau,unesco", "Yellow baroque abbey above the Danube, Wachau Valley anchor"),
    ("st-wolfgang",  "St. Wolfgang",           "Austria",        "AT", 47.7406, 13.4406,
     [("SZG", 50, 14)],
     "village,lake,salzkammergut,quiet", "Pilgrimage town on a lake, paddle-steamers, mountain backdrop"),

    # ─── Switzerland (extras) ───
    ("montreux",     "Montreux",               "Switzerland",    "CH", 46.4312,  6.9107,
     [("GVA", 75, 20), ("BRN", 90, 22)],
     "town,lake,music,mountains", "Lake Geneva resort, jazz festival, Chillon Castle on the water"),
    ("lausanne",     "Lausanne",               "Switzerland",    "CH", 46.5197,  6.6323,
     [("GVA", 50, 14)],
     "city,lake,university,modern", "Hilly lakefront city, Olympic museum, vineyard terraces nearby"),
    ("lugano",       "Lugano",                 "Switzerland",    "CH", 46.0037,  8.9511,
     [("ZRH", 180, 50), ("MXP", 80, 22)],
     "city,lake,italian,romantic", "Italian-Swiss lakeside city, palm trees, piazzas, mountain views"),
    ("appenzell",    "Appenzell",              "Switzerland",    "CH", 47.3308,  9.4087,
     [("ZRH", 90, 22)],
     "village,countryside,alps,quiet", "Painted houses, cowbells, alpine traditions in eastern Switzerland"),

    # ─── Portugal (extras) ───
    ("coimbra",      "Coimbra",                "Portugal",       "PT", 40.2056, -8.4196,
     [("OPO", 90, 22), ("LIS", 130, 30)],
     "city,university,unesco,historic", "Oldest Portuguese university, fado tradition, hilltop old town"),
    ("lagos-pt",     "Lagos",                  "Portugal",       "PT", 37.1028, -8.6747,
     [("FAO", 70, 18)],
     "town,coast,beach,party", "Algarve cliff-coast town, golden beaches, lively old quarter"),
    ("tavira",       "Tavira",                 "Portugal",       "PT", 37.1267, -7.6492,
     [("FAO", 40, 12)],
     "town,coast,quiet,historic", "Quietest Algarve town, Roman bridge, palm-lined river, island beaches"),
    ("aveiro",       "Aveiro",                 "Portugal",       "PT", 40.6405, -8.6538,
     [("OPO", 60, 14)],
     "city,canals,coast,art-nouveau", "'Portuguese Venice', moliceiro boats, art nouveau, salt pans"),
    ("monsaraz",     "Monsaraz",               "Portugal",       "PT", 38.4429, -7.3805,
     [("LIS", 180, 40), ("FAO", 220, 50)],
     "village,medieval,castle,remote,quiet", "Whitewashed hilltop village above a vast lake, Alentejo silence"),
    ("tomar",        "Tomar",                  "Portugal",       "PT", 39.6017, -8.4099,
     [("LIS", 90, 22)],
     "town,unesco,castle,religion", "Templar town, Convent of Christ, Manueline window, river island"),

    # ─── Hungary (extras) ───
    ("pecs",         "Pécs",                   "Hungary",        "HU", 46.0727, 18.2330,
     [("BUD", 180, 35)],
     "city,unesco,roman,ottoman,art", "Roman tombs, Ottoman mosque, vibrant arts scene in southern Hungary"),
    ("szeged",       "Szeged",                 "Hungary",        "HU", 46.2530, 20.1414,
     [("BUD", 150, 32)],
     "city,art-nouveau,thermal,music", "Sunny southern city of art-nouveau facades and the Tisza river"),
    ("balaton",      "Tihany & Lake Balaton",  "Hungary",        "HU", 46.9133, 17.8911,
     [("BUD", 130, 30)],
     "lake,village,quiet,thermal", "Central Europe's biggest lake, vineyards, lavender, abbey on a peninsula"),
    ("holloko",      "Hollókő",                "Hungary",        "HU", 47.9981, 19.5894,
     [("BUD", 90, 22)],
     "village,unesco,medieval,quiet,fairytale", "UNESCO living folk village in the Cserhát hills, frozen-in-time"),

    # ─── Slovakia (extras) ───
    ("banska-stiavnica", "Banská Štiavnica",   "Slovakia",       "SK", 48.4581, 18.8946,
     [("BTS", 180, 40), ("VIE", 220, 45)],
     "town,unesco,medieval,mountains,quiet", "UNESCO mining town in volcanic hills, gothic castle, terraced lakes"),
    ("spis-castle",  "Spiš Castle & Levoča",   "Slovakia",       "SK", 49.0008, 20.7681,
     [("KSC", 60, 15), ("PRG", 360, 70)],
     "fortress,unesco,ruins,medieval,carpathians", "Largest castle ruin in Central Europe, beneath the High Tatras"),
    ("bardejov",     "Bardejov",               "Slovakia",       "SK", 49.2939, 21.2761,
     [("KSC", 90, 22)],
     "town,unesco,medieval,gothic,quiet", "UNESCO walled town, gabled square, Jewish heritage, on the Polish border"),

    # ─── Finland (extras) ───
    ("porvoo",       "Porvoo",                 "Finland",        "FI", 60.3927, 25.6615,
     [("HEL", 60, 14)],
     "town,coast,romantic,quiet", "Red shore-houses, cobbled old town, easy day-trip from Helsinki"),
    ("savonlinna",   "Savonlinna",             "Finland",        "FI", 61.8669, 28.8862,
     [("HEL", 240, 50), ("TMP", 240, 50)],
     "town,lake,castle,music,quiet", "Medieval castle on an island, lakes everywhere, summer opera festival"),

    # ─── Estonia (extras) ───
    ("parnu",        "Pärnu",                  "Estonia",        "EE", 58.3859, 24.4971,
     [("TLL", 110, 28)],
     "town,beach,coast,spa,summer-only", "Estonia's summer capital, long sandy beach, art nouveau spa town"),
    ("tartu",        "Tartu",                  "Estonia",        "EE", 58.3776, 26.7290,
     [("TLL", 150, 32)],
     "city,university,quiet,historic", "Estonia's intellectual heart, handsome old town, river setting"),
    ("saaremaa",     "Saaremaa",               "Estonia",        "EE", 58.2528, 22.5039,
     [("TLL", 240, 50)],
     "island,coast,quiet,remote,countryside", "Largest Estonian island, windmills, juniper, medieval bishop's castle"),

    # ─── Latvia (extras) ───
    ("sigulda",      "Sigulda",                "Latvia",         "LV", 57.1538, 24.8590,
     [("RIX", 60, 15)],
     "town,castle,countryside,fall-foliage,quiet", "Gauja River valley, castle ruins, cable car, forest trails"),
    ("cesis",        "Cēsis",                  "Latvia",         "LV", 57.3133, 25.2700,
     [("RIX", 90, 20)],
     "town,medieval,castle,quiet", "Medieval castle ruins, cobbled old town, classic Latvian provincial charm"),
    ("jurmala",      "Jūrmala",                "Latvia",         "LV", 56.9682, 23.7704,
     [("RIX", 30, 10)],
     "town,beach,coast,spa,art-nouveau", "30km Baltic beach, wooden art-nouveau villas, easy from Riga"),

    # ─── Lithuania (extras) ───
    ("trakai",       "Trakai",                 "Lithuania",      "LT", 54.6378, 24.9344,
     [("VNO", 30, 10)],
     "town,castle,lake,medieval,iconic", "Red-brick island castle on a lake, Lithuania's iconic image"),
    ("hill-of-crosses","Hill of Crosses",      "Lithuania",      "LT", 56.0153, 23.4166,
     [("KUN", 100, 22), ("VNO", 200, 40)],
     "religion,memorial,countryside,quiet", "Hillside of 100,000+ crosses, defiant pilgrimage site"),
    ("curonian-spit","Curonian Spit (Nida)",   "Lithuania",      "LT", 55.3019, 21.0066,
     [("KUN", 240, 55), ("VNO", 360, 70)],
     "coast,unesco,national-park,quiet,remote", "UNESCO sand-dune peninsula on the Baltic, pine forest, Mann's house"),

    # ─── Slovenia (extras) ───
    ("postojna",     "Postojna Cave & Predjama","Slovenia",      "SI", 45.7833, 14.2031,
     [("LJU", 60, 16), ("TRS", 90, 22)],
     "adventure,castle,family,iconic", "Vast karst cave system + clifftop fairytale castle nearby"),
    ("soca-valley",  "Soča Valley (Bovec)",    "Slovenia",       "SI", 46.3382, 13.5519,
     [("LJU", 130, 30), ("TRS", 130, 30)],
     "valley,mountains,national-park,adventure,hiking", "Emerald-green river canyon, rafting, gorges, alpine peaks"),

    # ─── Croatia (extras) ───
    ("rovinj",       "Rovinj",                 "Croatia",        "HR", 45.0816, 13.6386,
     [("PUY", 40, 12), ("TRS", 110, 28)],
     "town,coast,romantic,iconic,medieval", "Istrian peninsula gem, pastel old town tumbling into the Adriatic"),
    ("trogir",       "Trogir",                 "Croatia",        "HR", 43.5141, 16.2516,
     [("SPU", 15, 6)],
     "town,unesco,medieval,coast", "UNESCO island old town next to Split airport, compact and stunning"),
    ("krka",         "Krka National Park",     "Croatia",        "HR", 43.8019, 15.9772,
     [("ZAD", 60, 16), ("SPU", 75, 20)],
     "national-park,waterfalls,quiet", "Cascading waterfalls and turquoise pools, quieter cousin of Plitvice"),
    ("mljet",        "Mljet",                  "Croatia",        "HR", 42.7333, 17.5333,
     [("DBV", 90, 30)],
     "island,national-park,remote,quiet", "Forested Adriatic island, saltwater lakes, off-the-beaten-track"),
    ("motovun",      "Motovun",                "Croatia",        "HR", 45.3325, 13.8322,
     [("PUY", 55, 15), ("TRS", 80, 20)],
     "village,medieval,valley,fairytale,wine,quiet", "Istria's iconic hilltop village above a vineyard-striped valley, truffle country"),
    ("groznjan",     "Grožnjan",               "Croatia",        "HR", 45.3796, 13.7186,
     [("PUY", 70, 18), ("TRS", 65, 18)],
     "village,medieval,valley,fairytale,art,quiet", "Tiny stone hill-town of artists' studios and panoramic Istrian views"),

    # ─── Greece (extras) ───
    ("monemvasia",   "Monemvasia",             "Greece",         "GR", 36.6878, 23.0537,
     [("KLX", 60, 18), ("ATH", 240, 55)],
     "town,medieval,byzantine,fortress,romantic", "Hidden Byzantine sea-fortress on a tied island, Peloponnese"),
    ("nafplio",      "Nafplio",                "Greece",         "GR", 37.5669, 22.8019,
     [("ATH", 130, 32)],
     "town,coast,fortress,historic,romantic", "Greece's first capital, Venetian fortresses, neoclassical streets"),

    # ─── Spain (extras) ───
    ("cuenca",       "Cuenca",                 "Spain",          "ES", 40.0704, -2.1374,
     [("MAD", 120, 25), ("VLC", 180, 40)],
     "town,unesco,medieval,castle,iconic", "Hanging houses on a cliff, gravity-defying medieval town"),
    ("albarracin",   "Albarracín",             "Spain",          "ES", 40.4072, -1.4439,
     [("VLC", 180, 40), ("MAD", 240, 50)],
     "village,medieval,fairytale,castle,remote,quiet", "Pink-walled mountain village often called Spain's prettiest"),
    ("cadaques",     "Cadaqués",               "Spain",          "ES", 42.2887,  3.2778,
     [("BCN", 150, 35), ("GRO", 90, 22)],
     "village,coast,art,quiet,romantic", "Whitewashed Costa Brava cove, Dalí's home, Cap de Creus"),

    # ─── France (extras) ───
    ("honfleur",     "Honfleur",               "France",         "FR", 49.4198,  0.2326,
     [("CDG", 180, 40), ("ORY", 180, 40)],
     "town,coast,normandy,art,romantic", "Slate-tiled Normandy harbour town, Impressionist muse"),
    ("eze",          "Èze",                    "France",         "FR", 43.7281,  7.3621,
     [("NCE", 25, 10)],
     "village,coast,cote-azur,romantic,iconic", "Cliff-top medieval village above the Riviera, Nietzsche's path"),

    # ─── Italy (extras) ───
    ("orvieto",      "Orvieto",                "Italy",          "IT", 42.7185, 12.1107,
     [("FCO", 100, 25), ("PEG", 90, 22), ("CIA", 110, 28)],
     "town,medieval,cathedral,wine,iconic", "Tuff-cliff town crowned by a striped Gothic cathedral"),
    ("volterra",     "Volterra",               "Italy",          "IT", 43.4014, 10.8606,
     [("PSA", 75, 20), ("FLR", 90, 22)],
     "town,medieval,tuscany,etruscan,quiet", "Etruscan-walled hilltown, alabaster workshops, Tuscan silence"),
    ("assisi",       "Assisi",                 "Italy",          "IT", 43.0707, 12.6196,
     [("PEG", 30, 10), ("FCO", 180, 40)],
     "town,unesco,religion,medieval,quiet", "Pilgrimage town of St. Francis, pink-stone basilica, Umbrian views"),
    ("san-gimignano","San Gimignano",          "Italy",          "IT", 43.4675, 11.0429,
     [("PSA", 75, 20), ("FLR", 60, 16)],
     "town,unesco,medieval,tuscany,iconic", "Tuscan 'Manhattan', 14 surviving medieval tower-houses"),

    # ─── United Kingdom (extras) ───
    ("stratford",    "Stratford-upon-Avon",    "United Kingdom", "GB", 52.1917, -1.7080,
     [("BHX", 45, 14), ("LHR", 120, 28)],
     "town,historic,literary,quiet", "Shakespeare's birthplace, Tudor cottages, riverside theatre"),
    ("rye",          "Rye",                    "United Kingdom", "GB", 50.9527,  0.7331,
     [("LGW", 90, 22)],
     "town,medieval,coast,quiet,romantic", "Cobbled medieval port town, Mermaid Inn, Sussex marshes"),

    # ─── Germany (extras) ───
    ("quedlinburg",  "Quedlinburg",            "Germany",        "DE", 51.7888, 11.1428,
     [("LEJ", 90, 22), ("BER", 180, 40)],
     "town,unesco,medieval,quiet", "Half-timbered UNESCO town in the Harz mountains, 1,300 historic houses"),
    ("lubeck",       "Lübeck",                 "Germany",        "DE", 53.8654, 10.6866,
     [("HAM", 60, 16)],
     "city,unesco,medieval,gothic,hanseatic", "Brick-gothic Hanseatic capital, marzipan, Holstentor gate"),
]

# Categories vocabulary — controlled list used for filtering.
# Keep this small enough to be a useful filter, but big enough to be expressive.
CATEGORIES = {
    # Place type
    "city", "town", "village", "country",
    # Geography
    "beach", "coast", "island", "lake", "valley", "fjord", "alps",
    "mountains", "countryside", "wilderness", "national-park",
    # Heritage
    "unesco", "medieval", "renaissance", "baroque", "ottoman", "roman",
    "byzantine", "gothic", "modern", "historic",
    # Specific landmark types
    "castle", "monastery", "abbey", "ruins", "memorial", "cathedral",
    "fortress", "bridge", "palace", "windmills",
    # Climate / season
    "winter", "skiing", "thermal", "spa", "arctic", "northern-lights",
    "lavender", "fall-foliage", "summer-only",
    # Nature / scenery (also used by airport_categories; map to the Nature chip)
    "nature", "volcanic",
    # Plural aliases used in hand-written gem tags (Lofoten "islands", Masuria
    # "lakes", etc.) - kept so the Island / Nature chips match them.
    "islands", "lakes", "fjords",
    # Nightlife (airport_categories uses "nightlife"; the party chip maps both)
    "nightlife",
    # Vibe
    "iconic", "fairytale", "luxury", "party", "quiet", "family",
    "romantic", "adventure", "remote", "affordable",
    # Activity
    "wine", "beer", "food", "art", "music", "surf", "hiking", "sailing",
    "diving",
    # Cultural draw
    "university", "religion",
    # Region tags (broader than country; useful for "I want a Tuscany trip")
    "tuscany", "andalusia", "provence", "alsace", "puglia",
    "salzkammergut", "wachau", "carpathians", "cote-azur",
    "basque", "brittany", "normandy", "cornwall", "scotland",
}


def all_airports():
    """All airports (Ryanair + non-Ryanair) as a {iata: dict} map.
    Used to resolve nearest_airports in gems.
    """
    out = {}
    for entry in RYANAIR_AIRPORTS + NON_RYANAIR_AIRPORTS:
        if not entry or len(entry) < 6 or entry[1] is None:
            continue
        iata, city, country, iso2, lat, lon = entry[:6]
        out[iata] = {
            "iata": iata, "city": city, "country": country,
            "iso2": iso2, "lat": lat, "lon": lon,
            "ryanair_serves": (iata, city, country, iso2, lat, lon) in {tuple(e) for e in RYANAIR_AIRPORTS},
        }
    return out


def all_destinations():
    """Yield all destinations as dicts with consistent shape.

    Tier A+B (Ryanair airports): tier='airport', ryanair_serves=True
    Tier C (Non-Ryanair airports): tier='airport', ryanair_serves=False
    Tier D (non-airport gems):     tier='gem' with nearest_airports filled
    """
    seen = set()
    # Ryanair airports first (preferred)
    for entry in RYANAIR_AIRPORTS:
        if not entry or len(entry) < 6 or entry[1] is None:
            continue
        iata, city, country, iso2, lat, lon = entry[:6]
        if iata in seen or iata in CONNECTION_ONLY_AIRPORTS:
            continue
        seen.add(iata)
        yield {
            "id": iata,
            "tier": "airport",
            "iata": iata,
            "ryanair_serves": True,
            "city": city,
            "country": country,
            "iso2": iso2,
            "lat": lat,
            "lon": lon,
            "categories": airport_categories.categories_for(iata, city, country, iso2),
            "blurb": None,
            "nearest_airports": [(iata, 0, 0)],
        }
    # Non-Ryanair airports (Tier C)
    for entry in NON_RYANAIR_AIRPORTS:
        iata, city, country, iso2, lat, lon = entry[:6]
        if iata in seen or iata in CONNECTION_ONLY_AIRPORTS:
            continue
        seen.add(iata)
        yield {
            "id": iata,
            "tier": "airport",
            "iata": iata,
            "ryanair_serves": False,
            "city": city,
            "country": country,
            "iso2": iso2,
            "lat": lat,
            "lon": lon,
            "categories": airport_categories.categories_for(iata, city, country, iso2),
            "blurb": None,
            "nearest_airports": [(iata, 0, 0)],
        }
    # Non-airport gems
    for slug, name, country, iso2, lat, lon, nearest, cats, blurb in NON_AIRPORT_GEMS:
        all_tags = [c.strip() for c in cats.split(",")]
        # Split into controlled categories (filterable) and free tags (descriptive)
        categories = [t for t in all_tags if t in CATEGORIES]
        free_tags = [t for t in all_tags if t not in CATEGORIES]
        yield {
            "id": "gem:" + slug,
            "tier": "gem",
            "iata": None,
            "ryanair_serves": False,
            "city": name,
            "country": country,
            "iso2": iso2,
            "lat": lat,
            "lon": lon,
            "categories": categories,
            "tags": free_tags,
            "blurb": blurb,
            "nearest_airports": [(a, m, e) for a, m, e in nearest],
        }


# ─── Sanity-check at import time ─────────────────────────────────────────────
def _validate():
    seen_ids = set()
    seen_iatas = set()
    airports = all_airports()
    for d in all_destinations():
        if d["id"] in seen_ids:
            raise ValueError(f"Duplicate id: {d['id']}")
        seen_ids.add(d["id"])
        if d["iata"]:
            if d["iata"] in seen_iatas:
                raise ValueError(f"Duplicate IATA: {d['iata']} ({d['id']})")
            seen_iatas.add(d["iata"])
        if d["tier"] == "gem":
            for a_iata, mins, eur in d["nearest_airports"]:
                if a_iata not in airports:
                    raise ValueError(f"{d['id']}: unknown airport {a_iata!r}")
        if not (-32 <= d["lon"] <= 50 and 27 <= d["lat"] <= 72):
            raise ValueError(f"{d['id']}: lat/lon out of Europe bounds ({d['lat']}, {d['lon']})")
    return len(seen_ids)


def to_json_dict():
    """Serialize the master list to a JSON-compatible dict."""
    return {
        "destinations": list(all_destinations()),
        "airports":     all_airports(),
        "categories":   sorted(CATEGORIES),
        "n_destinations": sum(1 for _ in all_destinations()),
    }


if __name__ == "__main__":
    import sys, json
    n = _validate()
    print(f"✓ {n} destinations validated")
    by_tier = {}
    by_country = {}
    for d in all_destinations():
        by_tier[d["tier"]] = by_tier.get(d["tier"], 0) + 1
        by_country[d["iso2"]] = by_country.get(d["iso2"], 0) + 1
    print(f"\nBy tier: {by_tier}")
    print(f"\nBy country (top 25):")
    for iso2, n in sorted(by_country.items(), key=lambda x: -x[1])[:25]:
        print(f"  {iso2}: {n}")

    # Write JSON for the notebooks to consume
    if "--write" in sys.argv:
        out = "cache/destinations_master.json"
        from pathlib import Path
        Path("cache").mkdir(exist_ok=True)
        Path(out).write_text(json.dumps(to_json_dict(), indent=2, ensure_ascii=False))
        print(f"\n💾 Wrote {out}")
