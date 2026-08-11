/**
 * User-facing data credits, derived from docs/tos/data_licenses.md.
 *
 * One entry per external source whose license requires a visible credit for
 * the data Carta actually shows (CC BY, CC BY-SA, ODbL, NLOD, portal terms).
 * Sources with no credit requirement (CC0 Wikidata, OVapi, Trafiklab; the
 * directly harvested carrier fares) are deliberately absent; the ledger is
 * the full record.
 *
 * Rendered by the Data sources block in the home footer (HomePage.jsx). The
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
    credit: 'Map data, points of interest, nature areas and trail routes '
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
    credit: 'City descriptions from Wikipedia, CC BY-SA 4.0',
  },
  {
    source: 'Wikivoyage',
    license: 'CC BY-SA 4.0',
    credit: 'Travel guide extracts from Wikivoyage, CC BY-SA 4.0',
  },
  {
    source: 'Wikimedia Commons',
    license: 'Per-file (CC BY-SA, CC BY, public domain)',
    credit: 'Photos from Wikimedia Commons, credited per image',
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
    credit: 'Tourism statistics © European Union, Eurostat',
  },
  {
    source: 'EuroGeographics',
    license: 'Eurostat GISCO conditions',
    credit: '© EuroGeographics for the administrative boundaries',
  },
  {
    source: 'European Environment Agency',
    license: 'EEA re-use policy (CC BY 4.0)',
    credit: 'Bathing water quality from the European Environment Agency',
  },
  {
    source: 'WorldClim',
    license: 'WorldClim 2.1 terms (citation required)',
    credit: 'Climate normals from WorldClim 2.1 (Fick and Hijmans 2017)',
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
    source: 'Exchange Rate API',
    license: 'Open endpoint terms (credit link required)',
    credit: 'Currency rates by Exchange Rate API (exchangerate-api.com)',
  },
];
