// All four routes at once, at the same arrival rates as the single-route files.
// k6 run -e BASE_URL=<preview url> tests/load/all.js
import { RATE, scenario, thresholds } from './lib.js';
import askDefault from './ask.js';
import flightsDefault from './flights.js';
import staysDefault from './stays.js';
import staticDefault from './static.js';

export const options = {
  scenarios: {
    ask: scenario(RATE.ask, 'ask'),
    flights: scenario(RATE.flights, 'flights'),
    stays: scenario(RATE.stays, 'stays'),
    static: scenario(RATE.static, 'staticWire'),
  },
  thresholds: {
    ...thresholds('ask'), ...thresholds('flights'), ...thresholds('stays'), ...thresholds('static'),
    upstream_502: ['rate<0.05'],
  },
};

export const ask = askDefault;
export const flights = flightsDefault;
export const stays = staysDefault;
export const staticWire = staticDefault;
