// Load test: the static wire and shell a first visit fetches: index, boot index, a destination shard,
// the ask lexicon and the 404 path. Pages serves these from the CDN: the budget is tight.
import { check } from 'k6';
import { BASE, DATA, RATE, scenario, thresholds, get } from './lib.js';

export const options = {
  scenarios: { static: scenario(RATE.static) },
  thresholds: thresholds('static'),
};

const FILES = [
  () => `${BASE}/`,
  () => `${BASE}/boot.json`,
  () => `${DATA}/dest/be.json`,
  () => `${DATA}/dest/fr.json`,
  () => `${BASE}/search/ask/lexicon.json`,
  () => `${BASE}/country_insights.json`,
];

export default function () {
  const url = FILES[Math.floor(Math.random() * FILES.length)]();
  const res = get('static', url);
  if (res.status === 200) check(res, { 'static has a body': (r) => r.body && r.body.length > 0 });
}
