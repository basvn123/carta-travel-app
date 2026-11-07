// Load test: GET /api/ask (dense retrieval Function, edge cached an hour per URL).
// Mix: 70% questions from a small set of popular ones (cache hits), 30% unique strings (misses, real CPU).
import { check } from 'k6';
import { BASE, RATE, scenario, thresholds, get } from './lib.js';

export const options = {
  scenarios: { ask: scenario(RATE.ask) },
  thresholds: thresholds('ask'),
};

const POPULAR = [
  'cheap beach town in june', 'quiet mountain village for hiking', 'best city break under 100 euro a day',
  'warm in october with few crowds', 'where to cycle in the netherlands', 'lake with a train station',
];
const WORDS = ['coast', 'trail', 'old town', 'castle', 'island', 'food', 'wine', 'ferry', 'snow', 'market'];

export function question() {
  if (Math.random() < 0.7) return POPULAR[Math.floor(Math.random() * POPULAR.length)];
  const w = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  return `${w()} ${w()} ${Math.floor(Math.random() * 1e6)}`;
}

export default function () {
  const res = get('ask', `${BASE}/api/ask?q=${encodeURIComponent(question())}&src=dest,highlight`);
  if (res.status === 200) check(res, { 'ask has hits': (r) => r.json('hits') !== undefined });
}
