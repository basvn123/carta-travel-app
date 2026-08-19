# Beaches: harvestable source research

Category: individual named BEACHES across Europe, the ones worth travelling
for. Researched 2026-08-17. Scope is the Carta catalogue's 43 countries.

Conventions follow `docs/tos/data_licenses.md`: every source below carries a
licence name plus URL, an access method, whether it gives per-feature
coordinates, and whether harvesting is permitted. Anything that could not be
confirmed against a live page or a live endpoint is marked UNVERIFIED with a
note saying exactly what is unconfirmed. Nothing here is invented.

Verification method: where possible the endpoint was called during this
research and the response inspected, not just read about. Those checks are
marked LIVE CHECK with the date and the figure returned.

---

## 0. The headline answer: named beach vs town

The single question the brief asks. Sorted by what each source actually
returns as its feature identity.

| Source | Feature identity | Coordinates | Verdict |
|---|---|---|---|
| OpenStreetMap `natural=beach` + `name` | A named beach ("Veliki Zal", "Boninovo") | Yes, node or polygon centroid | NAMED BEACH |
| Wikidata `P31/P279* wd:Q40080` | A named beach, but the class also swallows spits and coastlines | Yes, P625 | NAMED BEACH, with class noise |
| GeoNames feature codes BCH / BCHS | A named beach | Yes, in the dump | NAMED BEACH (dump unreachable at research time) |
| Portugal APA `Praias` | A named beach (`nome_praia`) | Yes, ETRS89 points | NAMED BEACH |
| Spain MITECO `Guia de Playas` | A named beach | Yes, per the metadata | NAMED BEACH (downloads currently broken) |
| Ireland EPA Blue Flag | A named awarded beach | Yes, WFS / GeoJSON | NAMED BEACH |
| EEA WISE bathing water | A named MONITORING POINT. Sometimes that name is the beach, often it is a street, a lifeguard hut or a distance-from-a-jetty description | Yes, lat/lon per site | MIXED, country dependent |
| Copernicus Coastal Zones | An unnamed land cover polygon with a class code | Yes, polygon geometry | NO NAME AT ALL |
| Blue Flag (FEE) international | A named awarded site, published as prose or PDF | No | NAME ONLY, no coordinates |
| Italy Bandiera Blu (Ministero del Turismo PDF) | A named beach plus its comune | No | NAME ONLY, no coordinates |
| Wikivoyage See/Do listings | A named beach inside a town article | Sometimes, when the editor filled the lat/long params | NAMED BEACH, sparse coords |
| Pan-European "best beaches" rankings | A named beach in editorial prose | No | NAME ONLY, and not licensed |

The blunt version: **OpenStreetMap and Wikidata are the only two pan-European
sources that give a named beach with a coordinate at scale and under a licence
we can use.** EEA WISE gives an official swim-quality point that is sometimes
a beach name and sometimes a sampling-post description. Copernicus gives
shape without identity. Blue Flag gives identity without shape.

---

## 1. OpenStreetMap, `natural=beach` and `leisure=beach_resort`

- URL: https://wiki.openstreetmap.org/wiki/Tag:natural%3Dbeach
- Access: Overpass API (https://overpass-api.de/api/interpreter), or the
  Geofabrik per-country extracts the trails lab already caches under
  `data/raw/geofabrik/` and reads with pyosmium
  (`pipeline/trails/ingest_osm_routes.py` is the working precedent)
- Licence: ODbL 1.0, https://opendatacommons.org/licenses/odbl/1-0/
- Attribution: yes, "© OpenStreetMap contributors"
- Share-alike: yes, a derived database carries ODbL obligations
- Harvesting allowed: yes
- Per-feature coordinates: yes
- Verdict: **USE. This is the spine.**

LIVE CHECK 2026-08-17, Overpass, bbox 34.5,-11.0,71.5,35.0 (Europe plus a
sliver of the North African and Anatolian coast):

```
natural=beach with a name:  24,146 features (3,031 nodes, 18,639 ways, 2,476 relations)
leisure=beach_resort named:  5,393 features (2,391 nodes, 2,753 ways, 249 relations)
```

LIVE CHECK 2026-08-17, Overpass, Greece area only: `natural=beach` with a
name returns **2,914** features.

LIVE CHECK 2026-08-17, taginfo (https://taginfo.openstreetmap.org/api/4/tag/stats):
`natural=beach` globally 248,593 objects; `leisure=beach_resort` globally
15,015 objects.

LIVE CHECK 2026-08-17, sample of 12 named beaches around Dubrovnik. The tags
are richer than expected and directly rankable:

```
Cava Beach          42.6634 18.0595  surface=rock         wikidata=Q12639826  nudism=customary
Veliki Zal          42.7405 17.9275  surface=pebblestone
Gradska Plaza       42.5816 18.2207  surface=concrete
Kupaliste Kuletina  42.8634 18.4221  surface=gravel
Nudisticka plaza    42.6221 18.1263                       nudism=obligatory
```

3 of the 12 carried a `wikidata` tag. That tag is the clean join key into
Wikidata for images and fame, and it means the Wikidata layer does not have to
be matched by fuzzy name.

Notes and cautions:

- `leisure=beach_resort` is mostly a commercial beach club or lido, heavily
  Italian ("stabilimento balneare"). It is a "developed vs wild" signal, not a
  second list of beaches. Do not merge the two counts.
- `blue_flag` as an OSM key is dead: LIVE CHECK 2026-08-17 taginfo returns
  **19** uses globally, on ways only. Useless as a Blue Flag source.
- One physical beach is often several `natural=beach` ways. The repo already
  owns the fix: the union-find name plus geo dedupe from
  `travel-app-poi-dedupe-v2`.
- Overpass rate-limits hard. During this research a Europe-wide key-only query
  returned HTTP 429 once and HTTP 504 twice, and the kumi.systems mirror
  returned 504. For a real harvest, read the Geofabrik extracts instead of
  hammering Overpass.

---

## 2. Wikidata

- URL: https://www.wikidata.org/wiki/Q40080 (beach)
- Access: SPARQL, https://query.wikidata.org/sparql
- Licence: CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/
- Attribution: not required
- Harvesting allowed: yes
- Per-feature coordinates: yes (P625)
- Verdict: **USE. The image and fame layer.**

LIVE CHECK 2026-08-17, SPARQL, instances of Q40080 or its subclasses, with
P625, in a country whose P30 is Europe (Q46):

```
8,395 beaches with coordinates
4,786 of them (57%) carry a P18 image
```

LIVE CHECK 2026-08-17, sitelink distribution over the same 8,395:

```
0-1 sitelinks   6,094
2 sitelinks     1,087
3-4 sitelinks     844
5-9 sitelinks     307
10+ sitelinks      63
```

So a `>= 3 sitelinks` fame gate leaves **1,214** beaches, which is a sensible
shortlist size for "worth travelling for". This matches the sitelink fame
proxy the repo already uses in `pipeline/trails/popularity.py` and
`harvest_osm_wikidata.py`.

Per-country counts of Q40080 with coordinates, LIVE CHECK 2026-08-17 (top of
the European rows):

```
ES 4,121   IT 937   GR 861   FR 757   GB 386   PT 339   NO 242   DK 94
HR 69      SE 57    DE 53    IS 45    IE 42    PL 35    EE 34    TR 31
FI 30      ME 21    UA 21    CY 19    MT 12    AL 10    LV 9     BG 8
```

Note the shape of that: Spain is over-represented (4,121, largely bot-imported
from Spanish beach registers) and Croatia is absurdly under-represented at 69
when OSM has thousands. **Wikidata is not a coverage source, it is an
enrichment source.** Coverage must come from OSM.

LIVE CHECK 2026-08-17, top European beaches by sitelink count. This is the
warning label for using sitelinks as a beauty proxy:

```
67  Curonian Spit (LT)      67  Curonian Spit (RU)   46  Hel Peninsula (PL)
46  Lido di Venezia (IT)    42  Omaha Beach (FR)     41  Arabat Spit (UA)
36  Vistula Spit (RU)       34  Utah Beach (FR)      30  Juno Beach (FR)
29  Dzharylhach (UA)        28  Sword Beach (FR)     27  Gold Beach (FR)
27  Bulgarian Black Sea Coastline (BG)               26  Playa del Ingles (ES)
26  La Concha Beach (ES)
```

Nine of the top fifteen are either a landform (spit, peninsula, coastline) or
a D-Day landing site. Fame is measuring history and geography, not swimming.
Also note Curonian Spit appears twice, once per country, so cross-border
duplicates need collapsing.

---

## 3. EEA WISE bathing water (already in the repo)

- URL: https://water.discomap.eea.europa.eu/arcgis/rest/services/BathingWater/
- Repo harvester: `pipeline/harvest_bathing_water.py`
- Licence: EEA reuse policy, CC BY. LIVE CHECK 2026-08-17 against
  https://www.eea.europa.eu/en/legal-notice, which states content may be
  re-used "without prior permission, free of charge, for commercial or
  non-commercial purposes" provided "the EEA is always acknowledged as the
  original source of the material and that the original meaning or message of
  the content is not distorted". Third party content inside EEA products is
  excluded.
- Access: ArcGIS REST, paged `query` endpoint, no key
- Harvesting allowed: yes
- Per-feature coordinates: yes
- Verdict: **USE, but as a water-quality gate, not as the beach list.**

LIVE CHECK 2026-08-17 against the local cache `cache/eea_bathing_water.json`
(22,289 sites):

```
by water type:  Coastal 14,487   Lake 6,211   River 1,217   Transitional 374
countries:      29 only
```

The 29 countries present are AL AT BE BG CH CY CZ DE DK EE EL ES FI FR HR HU
IE IT LT LU LV MT NL PL PT RO SE SI SK.

**Missing from the 43-country catalogue: GB, NO, IS, TR, RS, BA, ME, MK, UA,
MD, AD, LI, MC, SM, VA, XK.** The UK gap is the Brexit gap already recorded in
the crowding memo. Norway and Iceland do not report under the directive
either. So EEA WISE cannot gate a beach in Cornwall, Lofoten or Antalya.

The name-quality problem, LIVE CHECK 2026-08-17, first coastal sites per
country from the same cache:

```
HR  Soline / Jaz / Uvala Rovanjska / Perilo                   <- real beach and cove names
EL  GLYFADA 5 / PANTAZI / MIKRI MANTINEIA                     <- mostly beach names, numbered suffixes
CY  GLYKI NERO / PERNERA BAY / NISIA GARDENS                  <- real beach names
EE  VAANA-JOESUU / ROOSTA RAND / PARALEPA RAND                <- real beach names ("rand" = beach)
PT  POCA DAS MUJAS / PRAIA DA RIVIERA                         <- real beach names
ES  PLAYA CHANTEIRO PM1 / PLAYA AREA GRANDE DE SUEVOS         <- beach name plus a monitoring-point suffix
IT  LEVANTE 50 M SUD DIGA DX FOCE CANALE NICESOL              <- a sampling point description, NOT a beach
    SOTTOMARINA 1600 M SUD INIZIO DIGA S. FELICE
FR  RUE LAFORGE - BLONVILLE EST / DEVANT LA PISCINE /
    POSTE DE SURVEILLANCE                                     <- a street or a lifeguard hut, NOT a beach
DE  OSTSEE AHRENSHOOP REHA KLINIK / OSTSEE BORN GRABENWIESE   <- sea plus town plus landmark, NOT a beach
NL  HARLINGERSTRAND, HARLINGEN / SCHARENDIJKE BADSTRAND       <- beach-ish, town-qualified
DK  DRAGOR SOBAD, NORD / MOESGARD STRAND                      <- mostly real names
```

So the honest statement is: EEA WISE yields a named beach in HR, EL, CY, EE,
PT, DK, ES and roughly NL, and yields a monitoring point description in IT, FR
and DE. Italy and France are the two biggest contributors to the file (5,535
and 3,378 sites), so the unusable-name fraction is large.

Operational note for the repo. LIVE CHECK 2026-08-17: the
`BathingWater_Dyna_WM_2026` MapServer layer 3 returns an empty descriptor,
while `BathingWater_Dyna_WM_2025` returns a live Feature Layer with
`maxRecordCount: 2000` and the full `qualityStatus` through
`qualityStatus_minus10` field set. The harvester's `YEAR = 2025` is still the
correct pin. Do not bump it yet.

---

## 4. Blue Flag (Foundation for Environmental Education)

- URL: https://www.blueflag.global/
- Licence: none published. The site footer reads
  "(C) 2023 Foundation for Environmental Education, Scandiagade 13, 2450
  Copenhagen SV, Denmark". Blue Flag is a registered trademark of FEE.
- Access: HTML only
- Per-feature coordinates: no
- Harvesting allowed: **no open licence, and no bulk endpoint exists to harvest**
- Verdict: **REJECT as a data source. Use national open datasets instead.**

LIVE CHECK 2026-08-17:

- `https://www.blueflag.global/all-bf-sites` returns HTTP 404.
- `https://www.blueflag.global/all-sites` returns HTTP 404 (it is in search
  indexes but the page is gone).
- `https://www.blueflag.global/site-map` is the live page. It carries an
  interactive map and a per-country count table for the 2026 Northern
  Hemisphere season, plus the line "We encourage visitors to also consult our
  national members' webpages for more detailed information". No download, no
  API, no licence statement.
- Earlier FEE communications state the map system has been unavailable and
  that they are "working on alternative solutions to provide sites
  information".

So there is no international Blue Flag dataset to take. What exists is
per-country, and only some of it is open:

| Country | Blue Flag source | Coordinates | Licence | Verified |
|---|---|---|---|---|
| Ireland | data.gov.ie "Designated Blue Flag Beach", publisher EPA | Yes, GeoJSON / WFS / ArcGIS REST | CC BY 4.0 | Yes, LIVE CHECK 2026-08-17 |
| Portugal | APA `Praias` shapefile carries a per-beach `bandeira_a` flag | Yes | CC BY 4.0 | Yes, LIVE CHECK 2026-08-17, field read from the DBF |
| Italy | Ministero del Turismo PDF, "Elenco Spiagge Bandiera Blu 2026", 525 beaches, 257 comuni | No | UNVERIFIED, no licence statement read | No |
| Greece | HSPN / EEPF (eepf.gr), 624 awarded beaches in 2026 | Unknown | UNVERIFIED, page returned HTTP 403 to the fetcher | No |
| Spain | ADEAC is the national operator | Unknown | UNVERIFIED, not reached | No |

Separate legal point, worth flagging even though it is not a data licence:
Blue Flag is a trademark. Carta may state as a fact that a beach held a Blue
Flag in a given season, sourced to the national open dataset, but must not
render the Blue Flag logo or imply certification of Carta itself. The award is
also season-bound: the FEE site states the standard "is only guaranteed during
the Blue Flag season".

---

## 5. National open data, beach registers

### 5a. Portugal, APA "Praias" (BEST NATIONAL SOURCE FOUND)

- Dataset: https://dados.gov.pt/en/datasets/praias-informacao-sobre-as-praias-de-portugal/
- Publisher: Agencia Portuguesa do Ambiente
- Licence: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
  (LIVE CHECK 2026-08-17 via the udata API, `"license": "cc-by"`)
- Access: single ZIP shapefile,
  https://sniambgeoviewer.apambiente.pt/GeoDocs/shpzips/snirh_praias_infopraia_vwm.zip
- Per-feature coordinates: yes
- Harvesting allowed: yes
- Verdict: **USE**

LIVE CHECK 2026-08-17: downloaded (97,439 bytes), unpacked, DBF header parsed.
**755 point records**, shape type 1 (point), PRJ is GCS_ETRS_1989, bbox
-31.26 32.63 to -6.78 41.96 (mainland plus Azores and Madeira). Fields:

```
nome_praia    beach name, e.g. "Praia do Forte (Farol)"
concelho      municipality
arh           river basin authority region
qualidade_    water quality in Portuguese prose
bandeira_a    Blue Flag flag (0/1)
acessivel, cadeira_an   accessibility, amphibious wheelchair
vigilancia, posto_soco  lifeguard cover, first aid post
sanitarios, duche, estacionam, apoio_baln   toilets, showers, parking, beach support
ondas_espe    notable waves (a surf signal)
url_infopr    per-beach page, https://infopraia.apambiente.pt/detail/<id>
url_webcam    live webcam where one exists
```

This is exactly the shape of a beach record Carta wants, for free, for one
country. It is the model to argue for elsewhere.

### 5b. Spain, MITECO "Guia de Playas"

- Dataset: https://datos.gob.es/en/catalogo/e0dat0002-guia-de-playas-de-espana
- Publisher: Ministerio para la Transicion Ecologica y el Reto Demografico,
  via the Catalogo Oficial de Datos y Servicios INSPIRE
- Licence: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
  (LIVE CHECK 2026-08-17, the licence field on the datos.gob.es record)
- Per-feature coordinates: yes, EPSG:4258
- Harvesting allowed: yes by licence
- Verdict: **MAYBE. The licence is fine, the downloads are broken.**

LIVE CHECK 2026-08-17, every published distribution:

```
https://www.miteco.gob.es/es/cartografia-y-sig/ide/descargas/shape_playas_web_tcm30-163164.zip
   HTTP 200 but content-type text/html, 46,740 bytes: it is an error page, not a zip
https://www.miteco.gob.es/es/cartografia-y-sig/ide/descargas/kmz_playas_web_tcm30-163165.zip
   redirects to an HTML page, not a zip
https://www.miteco.gob.es/es/costas/servicios/guia-playas/guiaplayas2020_tcm30-161656.kmz
   redirects to an HTML page, not a kmz
https://www.miteco.gob.es/es/cartografia-y-sig/ide/descargas/costas-medio-marino/guia-playas-descargas.aspx
   301 to .html, which then 302s to /es/error/404.html
https://wms.mapama.gob.es/sig/Costas/Playas/wms.aspx?Request=GetCapabilities
   connection failed from this host
```

The datos.gob.es record itself carries user comments saying the links are dead
and that the repository administrators have contacted the publisher. The
remaining live options are the INSPIRE ATOM services
(`https://www.mapama.gob.es/ide/inspire/atom/downloadservice.xml`) and the WMS,
neither of which was reachable during this research. Spain also has an
apparent third-party republish at
https://opendata.esri.es/datasets/84ddbc8cf4104a579d579f6441fcaa8a_0
("Playas espanolas"), whose provenance and licence were NOT verified.

Practical consequence: Spain is the country with the most Wikidata beaches
(4,121) and the best official register, and right now we can reach neither the
official file nor a confirmed mirror. Fall back to OSM for Spain and revisit.

### 5c. Ireland, EPA Blue Flag beaches

- Dataset: https://data.gov.ie/dataset/designated-blue-flag-beach
- Publisher: Environmental Protection Agency
- Licence: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
  (LIVE CHECK 2026-08-17)
- Access: ArcGIS REST JSON, WMS, WFS, plus a GeoJSON download
- Per-feature coordinates: yes, WGS 84
- Harvesting allowed: yes
- Verdict: **USE for IE**

### 5d. United Kingdom, Environment Agency bathing waters

- API: https://environment.data.gov.uk/bwq/ and the API reference at
  https://environment.data.gov.uk/bwq/doc/api-reference-v0.6.html
- Dataset record: https://environment.data.gov.uk/dataset/fb8da72f-4938-4100-ac91-d9b8438ffd4c
- Licence: Open Government Licence (per the data.gov.uk record). The exact OGL
  version was NOT confirmed, so treat as UNVERIFIED until the licence page is
  read.
- Coverage: England only. Scotland (SEPA), Wales (NRW) and Northern Ireland
  (DAERA) publish separately and were NOT investigated.
- Per-feature coordinates: yes, monitoring point locations
- Harvesting allowed: yes, subject to OGL attribution
- Verdict: **MAYBE, and important, because it is the only way to fill the
  post-Brexit UK hole in EEA WISE.**

LIVE CHECK 2026-08-17: `https://environment.data.gov.uk/doc/bathing-water.json`
returned HTTP 403 from this host (Microsoft Azure Application Gateway), as did
the API reference page to the fetcher. The API is documented and publicly
described as linked data with JSON, CSV and RDF representations, but its
response shape was NOT verified here. Retry from a normal client before
building on it.

### 5e. France

`https://www.data.gouv.fr/datasets/donnees-de-rapportage-de-la-saison-balneaire-1`
is the national bathing season reporting dataset, published because of the
same Directive 2006/7/EC that feeds EEA WISE. It carries site coordinates and
bathing profiles. It therefore inherits the same problem: the site names are
monitoring point descriptions, not beach names. No advantage over EEA WISE for
this category. Licence NOT verified. Verdict: reject for beaches.

### 5f. Greece

geodata.gov.gr carries a national coastline dataset
(http://geodata.gov.gr/en/dataset/aktogramme) and several local foreshore
delimitation datasets, but no national named-beach register was found. Greece
has 861 Wikidata beaches and 2,914 named OSM beaches, so OSM plus Wikidata is
the route for Greece. Verdict: reject the portal for this category.

### 5g. Croatia

Croatia publishes sea quality assessments for bathing beaches through its open
data infrastructure, which is the Croatian side of the same EU reporting. No
separate named-beach register was found on data.gov.hr. Croatia's EEA WISE
names happen to be good beach names, so the EEA layer plus OSM covers it.
Licence NOT verified. Verdict: reject as a separate source.

---

## 6. Copernicus and EEA coastline / coastal zone products

- Product: Coastal Zones Land Cover/Land Use 2018 (vector), Europe
  https://land.copernicus.eu/en/products/coastal-zones/coastal-zones-2018
- Metadata record: https://sdi.eea.europa.eu/catalogue/copernicus/api/records/205e2db2-4e35-4b1b-bf84-271c4a82248c
- Licence: Copernicus full, free and open access under Commission Delegated
  Regulation (EU) No 1159/2013. The metadata records "no limitations to public
  access" plus use constraints requiring users to inform the public of the
  source, to state clearly where products have been adapted or modified, and
  not to imply EU endorsement.
- Access: bulk vector download (ESRI and SQLite geodatabase)
- Per-feature coordinates: yes, polygons
- Harvesting allowed: yes
- Verdict: **REJECT for this category.**

Reason, LIVE CHECK 2026-08-17 against the metadata record: the product is land
cover / land use classification only, 71 thematic classes at 0.5 ha minimum
mapping unit, covering the coastal strip to 10 km inland. **It contains no
named features.** It can tell you that a polygon is beach-and-dune land cover;
it cannot tell you it is Praia da Marinha. It would only be useful as a
geometric mask, for example to compute a beach's sand area, and OSM polygons
already give that for named features. The same applies to EU-Hydro coastline
products: geometry, no beach identity.

The repo's precedent here is Copernicus GLO-30, already in the ledger for
trails elevation. If a beach-area metric is ever wanted, the licensing path is
already cleared.

---

## 7. GeoNames

- URL: https://www.geonames.org/export/codes.html
- Licence: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ (the licence
  already recorded in `docs/tos/data_licenses.md` for
  `pipeline/harvest_geonames.py`)
- Access: per-country dump ZIPs at https://download.geonames.org/export/dump/
- Per-feature coordinates: yes
- Harvesting allowed: yes
- Verdict: **MAYBE, as an alias and name-variant fallback.**

LIVE CHECK 2026-08-17 against https://www.geonames.org/export/codes.html:
feature class **T** carries code **BCH** ("a shore zone of coarse
unconsolidated sediment that extends from the low-water line to the highest
reach of storm waves") and **BCHS** for the plural form. So GeoNames does hold
named beaches as first-class features.

UNVERIFIED: the per-country beach counts. `download.geonames.org` was
unreachable from this host during the research window (curl HTTP 000, and
python urllib raised WinError 10060 connection timeout for MT, CY and HR).
The repo only caches `cities500` (`cache/geonames_cities500.txt`), which is
populated places only and contains no BCH rows. Someone must re-run the
per-country dump download to size this layer before relying on it.

GeoNames' real value here is not coverage, it is the `alternatenames` column:
local-language and transliterated beach names, which is what makes matching
"Navagio" to "Shipwreck Beach" to "Nauagio" work.

---

## 8. Wikivoyage

- URL: https://en.wikivoyage.org/
- Licence: CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/
- Access: MediaWiki API, already wrapped in
  `pipeline/harvest_wikivoyage_listings.py`
- Per-feature coordinates: sometimes, when the editor filled the `lat`/`long`
  listing parameters
- Harvesting allowed: yes
- Verdict: **USE as a corroboration signal only, exactly as the repo already
  does for POIs.**

The existing harvester's own header states the posture the ledger requires:
store listing names, coordinates, order and article status as facts, derive a
numeric signal, copy no prose. Wikivoyage See/Do sections are hand-curated
shortlists, so a beach appearing high in a town's See section is genuine
editorial corroboration that it is worth the trip, which is precisely the
signal sitelinks and pageviews cannot give.

Share-alike caution: the moment any Wikivoyage sentence is quoted or
paraphrased into a beach description, CC BY-SA attaches to that description.
The trails lab already solved this with the six-word shingle guard in
`pipeline/trails/describe.py`. Reuse that guard, do not reinvent it.

---

## 9. Pan-European "best beaches" rankings

Investigated and rejected as a category.

| Ranking | URL | Why rejected |
|---|---|---|
| European Best Destinations, "Most Beautiful Beaches in Europe" | https://www.europeanbestdestinations.com/best-beaches-in-europe/ | Proprietary editorial ranking derived from their own panel vote. No open licence found. All rights reserved by default. |
| Tripadvisor Travellers' Choice Beaches | https://tripadvisor.mediaroom.com/us-terms-of-use | ToS explicitly prohibit using "any robot, spider, artificial intelligence (AI) system, or other automated device, process or means to access, retrieve, copy, scrape, aggregate, collect, download, or otherwise index any portion of the Services or any Content, except as expressly permitted by Tripadvisor in writing". **Harvesting forbidden. Reject.** |
| Time Out, Times, Conde Nast beach lists | various | Editorial journalism, copyright, no reuse licence. |
| Blue Flag as a "ranking" | see section 4 | It is a management-standard award, not a beauty ranking, and there is no bulk dataset. |

There is no pan-European best-beaches ranking with a reusable licence. Stating
that plainly is the finding. The composite score has to be built from open
signals, exactly as `pipeline/score_significance.py` does for POIs.

Note on posture: the ledger already carries one precedent for hand-typed
factual excerpts from a proprietary site, the Numbeo anchors row, and that row
is flagged as an open RISK. Do not add a second one. If an editorial shortlist
is ever wanted, it should be Carta's own, built from the open signals below.

---

## 10. Ranking signals: how to sort 24,000 beaches down to the ones worth travelling for

Ordered by how much they actually carry.

1. **Wikidata sitelink count.** Count distinct `schema:about` sitelinks per
   beach QID. Proxies cross-cultural notability. Weakness, demonstrated above:
   the European top fifteen is dominated by D-Day landing sites and by spits
   and coastlines that are landforms rather than swimmable beaches. Needs a
   class filter and a history penalty.
2. **Wikipedia pageviews on the beach's own article.** The repo already has
   `pipeline/harvest_pageviews.py` and the pageview data is CC0. Better than
   sitelinks at separating "famous now" from "famous in 1944", and it is
   seasonal, which for beaches is itself informative. Weakness: no article, no
   signal, and most beautiful small beaches have no article.
3. **EEA WISE nearest-site class within about 2 km.** Excellent versus
   Sufficient is an official, audited, non-gameable quality fact. Use it as a
   gate, not as a score: a Poor-rated beach should not be recommended for
   swimming whatever its fame. Weakness: 16 of the 43 countries have no data
   at all, so it can only ever demote, never promote.
4. **OSM tag richness.** Presence of `name`, plus `surface`, `nudism`,
   `access`, `wikidata`, `description`, nearby `amenity` count. A beach that
   several mappers bothered to describe in detail is a beach people go to.
   Weakness: correlates with mapper density, so Germany and the Netherlands
   score high and Albania scores low for reasons that have nothing to do with
   the beaches.
5. **Beach size from the OSM polygon.** Compute area, or the length of the
   shoreline edge. A 30 m urban strip is not worth travelling for; a 4 km arc
   might be. Weakness: only ways and relations have geometry, the 3,031 nodes
   do not, and fragmented ways must be merged first.
6. **Commons image count for the beach's Commons category.** Photographs taken
   is the closest open proxy to "photogenic" there is. Weakness: tourist volume
   confound, and per-file licences must be resolved before any image is shown,
   which the citytrip harvester already does.
7. **Blue Flag status, where a national open dataset carries it.** Today that
   means Portugal's `bandeira_a` field and Ireland's EPA layer. Proxies
   facilities and management, not beauty. Weakness: it is an application-based
   award, so wild beaches with no municipality behind them never get one, and
   those are often the best ones.
8. **`leisure=beach_resort` or amenity density within 300 m.** A developed
   versus wild axis. Not a quality score, a filter: it lets the app answer
   "beach with a bar" separately from "beach with nobody on it".
9. **Wikivoyage See/Do listing presence and its rank inside the section.** The
   only human editorial corroboration available under an open licence.
   Weakness: sparse, and coordinates are often missing.
10. **Reachability from a Carta destination.** Distance to the nearest
    catalogue city centre, plus the existing `public/reach/` minutes. A perfect
    beach four hours from any airport is not a Carta beach.

Suggested composite, mirroring `poi_significance.py`: fame (1 and 2) gives the
headline rank, water class (3) gates it, size and richness (4, 5) break ties,
and 8, 9, 10 become filter chips rather than score terms.

---

## 11. Pitfalls

- **EEA name is not a beach name in IT, FR and DE.** Those three are 11,204 of
  the 22,289 sites. Any pipeline that assumes `bathingWaterName` is a beach
  name will produce entries called "POSTE DE SURVEILLANCE" and "LEVANTE 50 M
  SUD DIGA DX FOCE CANALE NICESOL".
- **EEA covers 29 countries, not 43.** No GB, NO, IS, TR, RS, BA, ME, MK, UA,
  MD, AD, LI, MC, SM, VA, XK. Cornwall, Lofoten and the Turkish coast get no
  water rating from this source.
- **Wikidata Q40080 includes landforms.** Spits, peninsulas and whole
  coastlines are instances. Filter them, or the top of the ranking is a
  geography lesson.
- **Cross-border duplicates in Wikidata.** Curonian Spit resolves twice, LT and
  RU, from one QID joined through two P17 values. Deduplicate on QID, not on
  country plus name.
- **OSM beach fragmentation.** One physical beach is often several ways. Run
  the existing union-find dedupe from `travel-app-poi-dedupe-v2` before
  counting anything, and remember the l-with-stroke folding gotcha recorded
  there when folding Polish and Croatian names.
- **`leisure=beach_resort` is not a beach.** It is mostly Italian commercial
  lidos. Merging the 5,393 into the 24,146 double-counts and skews the country
  mix towards Italy.
- **OSM `blue_flag` key is empty.** 19 uses globally. Do not try to source Blue
  Flag from OSM.
- **Blue Flag is trademarked and season-bound.** State the award as a sourced
  fact for a given season. Do not render the logo, do not imply certification.
- **Spain's official download is broken today** despite a clean CC BY 4.0
  licence. Do not write a harvester against those URLs without re-checking; all
  five distributions returned HTML or failed on 2026-08-17.
- **UK EA API returned 403 from this host.** The licence and the API exist, the
  response shape is unverified. Verify before it becomes a dependency.
- **GeoNames dump host was unreachable.** BCH exists as a feature code, the
  volume is unmeasured. Size it before planning around it.
- **ODbL share-alike on an OSM-derived beach layer.** This is open item 2 in
  the ledger's follow-up list, for the existing nature and POI layers. A beach
  layer shipped in `app_data.json` raises exactly the same question. The trails
  vertical's answer was to publish produced works only
  (`pipeline/trails/export_wire.py`); copy that answer.
- **Overpass will rate-limit a Europe-wide harvest.** HTTP 429 and 504 were
  both hit during this research. Use the cached Geofabrik extracts and pyosmium
  instead, which the trails lab already does.
- **Fame is not beauty.** The single most likely failure mode for this
  category: shipping Omaha Beach and Lido di Venezia at the top of "Europe's
  best beaches" because sitelinks said so.

---

## 12. Recommended stack

Spine, enrichment, gate, fallback, in that order.

1. **Spine: OpenStreetMap `natural=beach` with a `name`.** Read the Geofabrik
   per-country extracts already cached under `data/raw/geofabrik/` with
   pyosmium, following `pipeline/trails/ingest_osm_routes.py`. About 24k named
   features Europe-wide. Keep the polygon so area is computable. Run the
   union-find dedupe before anything else.
2. **Enrichment: Wikidata, joined on the OSM `wikidata` tag first, then by
   name core plus proximity.** Gives P18 images (57% of the 8,395 European
   beaches carry one) and sitelink counts for fame. CC0, no attribution
   obligation, no share-alike.
3. **Gate: EEA WISE, nearest classified site within 2 km.** The repo already
   downloads and caches this. Reuse `cache/eea_bathing_water.json`, do not
   re-download. Attach the class and the profile URL. Show nothing where there
   is no site, which is honest and matches how `harvest_bathing_water.py`
   already refuses to invent a rating.
4. **National enrichment where it is free and good: Portugal and Ireland
   today.** Portugal's 755 records add lifeguard cover, accessibility, showers,
   parking, surf and a Blue Flag flag. Ireland adds Blue Flag. Both CC BY 4.0.
   Add Spain and the UK when their endpoints come back.
5. **Corroboration: Wikivoyage See/Do listing presence and rank**, facts only,
   with the six-word shingle guard from `describe.py` if any prose is ever
   generated near it.
6. **Fallback names: GeoNames BCH/BCHS `alternatenames`** for local-language
   and transliterated variants, once the dump host is reachable again.
7. **Rank** with a composite in the shape of `poi_significance.py`: sitelinks
   and pageviews for fame, water class as a gate, polygon area and tag richness
   as tiebreakers, and developed-versus-wild plus reach as filter chips.
8. **Ship as produced works**, per the trails precedent, so the ODbL derived
   database obligations stay inside the pipeline rather than travelling with
   `app_data.json`.

Explicitly not in the stack: Blue Flag international (no data), Copernicus
Coastal Zones (no names), Tripadvisor (ToS forbids it), European Best
Destinations and press rankings (no licence), France's national bathing
reporting (no advantage over EEA).

---

## 13. Proposed rows for `docs/tos/data_licenses.md`

Per the ledger's rule that a new harvester must add a row before it ships.
These belong in section 5, Destination content layers.

| Source | What we take | License | Attribution required | Share-alike | Where attributed today |
|---|---|---|---|---|---|
| OpenStreetMap `natural=beach` via Geofabrik extracts (proposed `pipeline/harvest_beaches_osm.py`) | Named beach features: name, geometry, surface, nudism, access, wikidata tag | ODbL 1.0 | Yes: © OpenStreetMap contributors | Yes: derived database, publish produced works only | Would extend the existing OSM credit in the home footer, Data sources block |
| Wikidata beach entities (proposed, same harvester) | QID, P625 coordinates, P18 image pointer, sitelink count per beach | CC0 | No | No | None needed |
| Agencia Portuguesa do Ambiente, Praias (proposed `pipeline/harvest_beaches_pt.py`) | 755 named Portuguese beaches: coordinates, facilities, accessibility, lifeguard cover, Blue Flag flag, water quality, InfoPraia URL | CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ | Yes: Agencia Portuguesa do Ambiente | No | New row required in `attribution.js` before it ships |
| EPA Ireland, Designated Blue Flag Beach (proposed) | Named awarded Irish beaches with coordinates | CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ | Yes: Environmental Protection Agency (Ireland) | No | New row required in `attribution.js` before it ships |
| MITECO Guia de Playas, Spain (proposed, BLOCKED) | Named Spanish beaches with coordinates and services | CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ | Yes: MITECO | No | Not ingestible today: all published distributions returned HTML or failed on 2026-08-17 |
| Environment Agency bathing waters, England (proposed, UNVERIFIED) | Named English bathing waters with coordinates and classifications, to fill the post-Brexit hole in EEA WISE | Open Government Licence, version UNCONFIRMED | Yes, per OGL | No | Endpoint returned 403 from the research host; verify before use |

The existing EEA WISE row in section 5 needs no change. Its licence claim
("EEA standard re-use policy, effectively CC BY 4.0, verify") is now
**verified** against https://www.eea.europa.eu/en/legal-notice, which permits
commercial reuse free of charge with EEA acknowledged as the original source.
The "verify" qualifier can be dropped from that row.

---

## 14. What is still unverified

Listed so nobody mistakes a gap for a finding.

1. GeoNames BCH/BCHS volume per country. Host unreachable 2026-08-17.
2. UK Environment Agency bathing water API response shape and exact OGL
   version. HTTP 403 from this host.
3. Spain: whether any working mirror of Guia de Playas exists, and the
   provenance and licence of the opendata.esri.es republish.
4. Greece EEPF, Spain ADEAC and Italy Ministero del Turismo Blue Flag list
   licences. None reachable or stated.
5. Scotland (SEPA), Wales (NRW), Northern Ireland (DAERA) bathing water
   sources. Not investigated.
6. Croatia and France dataset licences on their national portals. Both were
   rejected on content grounds before licence became decisive.
7. Whether Wikidata's Q40080 subclass tree can be pruned cleanly enough to drop
   spits and coastlines without dropping real beaches. Needs a query pass.
