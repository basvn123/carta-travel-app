/**
 * User-facing data credits, derived from docs/tos/data_licenses.md.
 *
 * One entry per external source whose license requires a visible credit for
 * the data Carta actually shows (CC BY, CC BY-SA, ODbL, NLOD, portal terms).
 * Sources with no credit requirement (CC0 Wikidata, OVapi, Trafiklab; the
 * directly harvested carrier fares) are deliberately absent; the ledger is
 * the full record.
 *
 * Rendered by Account > Data sources (auth/AccountPanel.jsx). The
 * credit lines stay in English on purpose: they are license notices naming
 * proper nouns, and a translated "© OpenStreetMap contributors" is a worse
 * credit, not a better one. The prose around the block (heading, lede) goes
 * through i18n like every other UI string.
 *
 * Keep entries in sync with the ledger: a new row there with a required
 * credit means a new entry here. Order is the ledger's, roughly by how much
 * of the product each source carries.
 */
export const ATTRIBUTIONS = [
  {
    source: 'OpenStreetMap',
    license: 'ODbL 1.0',
    credit: 'Map data, points of interest, nature areas, parking locations, '
      + 'beaches, lake shores, trail routes, mountain lifts, huts and '
      + 'summits, and the landmarks along them '
      + '© OpenStreetMap contributors',
  },
  {
    source: 'CARTO',
    license: 'CARTO basemap terms',
    credit: 'Basemap © CARTO',
  },
  {
    source: 'Wikipedia',
    license: 'CC BY-SA 4.0',
    credit: 'City descriptions from Wikipedia, and the facts behind the '
      + 'mountain pages, CC BY-SA 4.0',
  },
  {
    source: 'Wikivoyage',
    license: 'CC BY-SA 4.0',
    credit: 'Travel guide extracts, the onward-journey links and the named '
      + 'itineraries behind the ready-made trips, from Wikivoyage, '
      + 'CC BY-SA 4.0',
  },
  {
    source: 'Wikimedia Commons',
    license: 'Per-file (CC BY-SA, CC BY, public domain)',
    credit: 'Photos from Wikimedia Commons, including the trail, beach, lake '
      + 'and mountain galleries, credited per image',
  },
  {
    source: 'Geograph Britain and Ireland',
    license: 'CC BY-SA 2.0',
    credit: 'Photographs of Great Britain and Ireland from Geograph '
      + '(geograph.org.uk), credited per image',
  },
  {
    source: 'Mapillary',
    license: 'CC BY-SA 4.0',
    credit: 'Street-level imagery from Mapillary, credited per image',
  },
  {
    source: 'GeoNames',
    license: 'CC BY 4.0',
    credit: 'Population and settlement data from GeoNames (geonames.org)',
  },
  {
    source: 'Inside Airbnb',
    license: 'CC BY 4.0',
    credit: 'Nightly rate anchors from Inside Airbnb (insideairbnb.com)',
  },
  {
    source: 'Eurostat',
    license: 'CC BY 4.0',
    credit: 'Tourism statistics, including the visitor nights behind the '
      + 'crowding levels and the trip demand check, and the NUTS and LAU '
      + 'region boundaries behind region pages and coverage, '
      + '© European Union, Eurostat/GISCO',
  },
  {
    source: 'EuroGeographics',
    license: 'Eurostat GISCO conditions',
    credit: '© EuroGeographics for the administrative boundaries',
  },
  {
    source: 'European Environment Agency',
    license: 'EEA re-use policy (CC BY 4.0)',
    credit: 'Bathing water quality, and the official bathing sites that '
      + 'decide whether a lake can be swum in, from the European Environment '
      + 'Agency and the Member State authorities that report them; coastal '
      + 'stretches cut from the EEA coastline for analysis, and the EEA '
      + 'biogeographical regions and WISE river basin districts',
  },
  {
    source: 'ONS Open Geography',
    license: 'Open Government Licence v3.0',
    credit: 'UK region boundaries (International Territorial Levels) from '
      + 'the Office for National Statistics, contains OS data '
      + '© Crown copyright and database right 2025',
  },
  {
    source: 'GMBA Mountain Inventory',
    license: 'CC BY 4.0',
    credit: 'Mountain range outlines and hierarchy from the GMBA Mountain '
      + 'Inventory v2.0 (Snethlage et al. 2022, EarthEnv)',
  },
  {
    source: 'geoBoundaries',
    license: 'Mixed per release (ODbL, public domain)',
    credit: 'Administrative boundaries for Ukraine, Moldova and the '
      + 'microstates from geoBoundaries (Runfola et al. 2020)',
  },
  {
    source: 'NASA POWER',
    license: 'US Government work (no restriction; acknowledgement appreciated)',
    credit: 'Climate normals from the NASA POWER project, NASA Langley '
      + 'Research Center (power.larc.nasa.gov)',
  },
  {
    source: 'UNESCO World Heritage Centre',
    license: 'UNESCO WHC terms of use (verify)',
    credit: 'World Heritage designations from the UNESCO World Heritage List',
  },
  {
    source: 'WorldClim',
    license: 'WorldClim 2.1 terms (citation required)',
    credit: 'The estimated lake swimming season is modelled from WorldClim '
      + '2.1 normals (Fick and Hijmans 2017)',
  },
  {
    source: 'OpenTripMap',
    license: 'OpenTripMap API terms',
    credit: 'Points of interest from OpenTripMap (opentripmap.io)',
  },
  {
    source: 'Overture Maps',
    license: 'CDLA-Permissive 2.0',
    credit: 'Sightseeing places from Overture Maps Foundation',
  },
  // Trails vertical (tools/trailslab). The published hikes, daytrips and city
  // trips are produced works: selected, measured, described and approved one
  // by one. OSM above covers their geometry; these four cover what shaped it.
  {
    source: 'Copernicus GLO-30',
    license: 'Copernicus DEM instance terms (credit required)',
    credit: 'Trail elevation, ascent and descent from the Copernicus GLO-30 '
      + 'DEM (© ESA, Airbus)',
  },
  {
    source: 'swisstopo',
    license: 'swisstopo open government data terms',
    credit: 'Swiss trails checked against swissTLM3D-Wanderwege, source swisstopo',
  },
  {
    source: 'IGN',
    license: 'Etalab Licence Ouverte 2.0',
    credit: 'French trails checked against IGN BD TOPO, Etalab 2.0',
  },
  {
    source: 'Kartverket',
    license: 'CC BY 4.0',
    credit: 'Norwegian trails checked against Turrutebasen, Kartverket',
  },
  {
    source: 'Transitous',
    license: 'Per underlying feed (see the national feeds below)',
    credit: 'Public transport travel times via Transitous',
  },
  {
    source: 'GTFS.de / DELFI',
    license: 'CC BY-SA 4.0',
    credit: 'German timetable data from gtfs.de, DELFI',
  },
  {
    source: 'Entur',
    license: 'NLOD',
    credit: 'Norwegian timetable data from Entur',
  },
  {
    source: 'Digitraffic',
    license: 'CC BY 4.0',
    credit: 'Finnish rail data from Digitraffic, Fintraffic',
  },
  {
    source: 'opentransportdata.swiss',
    license: 'opentransportdata.swiss terms of use',
    credit: 'Swiss timetable data from opentransportdata.swiss',
  },
  {
    source: 'transport.data.gouv.fr',
    license: 'ODbL 1.0',
    credit: 'French timetable data from transport.data.gouv.fr, SNCF',
  },
  {
    source: 'Open-Meteo',
    license: 'CC BY 4.0 (non-commercial API tier)',
    credit: 'Live weather forecasts by Open-Meteo.com',
  },
  {
    source: 'Exchange Rate API',
    license: 'Open endpoint terms (credit link required)',
    credit: 'Currency rates by Exchange Rate API (exchangerate-api.com)',
  },
];
