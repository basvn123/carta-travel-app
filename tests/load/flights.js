// Load test: GET /api/flights (live Google Flights search, edge cached an hour per route and day).
// Needs outbound access to the flight source: from a runner without it every miss is a 502
// (counted as upstream_502, not a failure of the budget). Run it on the preview deploy.
import { check } from 'k6';
import { BASE, RATE, scenario, thresholds, get, upstream } from './lib.js';

export const options = {
  scenarios: { flights: scenario(RATE.flights) },
  thresholds: thresholds('flights', { upstream_502: ['rate<0.05'] }),
};

const ROUTES = [['BRU', 'BCN'], ['AMS', 'LIS'], ['BRU', 'ATH'], ['CDG', 'FCO'], ['BER', 'PRG'], ['BRU', 'DUB'], ['AMS', 'ZAG'], ['BRU', 'SPU']];

function day(offset) {
  return new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
}

export default function () {
  // 80% from 8 routes and 5 dates (hits), 20% a random day within 60 days (misses).
  const [o, d] = ROUTES[Math.floor(Math.random() * ROUTES.length)];
  const offset = Math.random() < 0.8 ? 14 + Math.floor(Math.random() * 5) : 7 + Math.floor(Math.random() * 60);
  const res = get('flights', `${BASE}/api/flights?o=${o}&d=${d}&date=${day(offset)}`);
  if (res.status === 200) check(res, { 'flights is a list': (r) => Array.isArray(r.json('flights')) });
}
