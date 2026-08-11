/**
 * groundLinks.js, curated ground-link profiles for Europe's secondary
 * low-cost hubs.
 *
 * Airports like Charleroi or Beauvais carry city names they are nowhere near;
 * the generic transfer engine prices that hop, but it cannot tell a traveller
 * WHAT actually bridges it. This table does: the named shuttle/bus service,
 * the city hub it runs to, the typical ride time, how often it goes, and a
 * sensible buffer to plan around. Static and curated on purpose, these
 * services are the airports' lifelines and change rarely.
 */

export const GROUND_LINKS = {
  CRL: {
    airport: 'Charleroi airport', service: 'Flibco shuttle', hub: 'Brussels Midi station',
    minutes: 55, everyMin: 30, bufferMin: 15,
  },
  BVA: {
    airport: 'Beauvais airport', service: 'the official shuttle', hub: 'Paris Porte Maillot',
    minutes: 75, everyMin: null, bufferMin: 20, // departures timed to flights
  },
  BGY: {
    airport: 'Bergamo airport', service: 'the airport coach', hub: 'Milano Centrale',
    minutes: 60, everyMin: 20, bufferMin: 15,
  },
  HHN: {
    airport: 'Frankfurt Hahn airport', service: 'the Flibco bus', hub: 'Frankfurt main station',
    minutes: 105, everyMin: null, bufferMin: 20,
  },
  CIA: {
    airport: 'Ciampino airport', service: 'the airport bus', hub: 'Roma Termini',
    minutes: 40, everyMin: 20, bufferMin: 15,
  },
  TSF: {
    airport: 'Treviso airport', service: 'the airport bus', hub: 'Venice Mestre station',
    minutes: 70, everyMin: null, bufferMin: 20,
  },
  NYO: {
    airport: 'Skavsta airport', service: 'the Flygbussarna coach', hub: 'Stockholm City',
    minutes: 80, everyMin: 30, bufferMin: 15,
  },
  GRO: {
    airport: 'Girona airport', service: 'the Sagalés bus', hub: 'Barcelona Nord station',
    minutes: 75, everyMin: null, bufferMin: 20,
  },
  LBC: {
    airport: 'Lübeck airport', service: 'the A20 shuttle', hub: 'Hamburg ZOB',
    minutes: 75, everyMin: null, bufferMin: 20,
  },
};

/** The curated ground-link profile for an airport, or null. */
export function groundLinkFor(iata) {
  return (iata && GROUND_LINKS[iata]) || null;
}
