// Load test: the stays wire. Stays have no live Function since T1074: bed prices come from
// stays/v1/{cc}.json shards (staysData.js, ?b= build hash), served static from the data host.
import { check } from 'k6';
import { DATA, RATE, scenario, thresholds, get } from './lib.js';

export const options = {
  scenarios: { stays: scenario(RATE.stays) },
  thresholds: thresholds('stays'),
};

const COUNTRIES = ['be', 'nl', 'fr', 'es', 'it', 'pt', 'de', 'at', 'gr', 'hr', 'cz', 'pl', 'ch', 'ie', 'dk', 'se'];

export default function () {
  const cc = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
  const res = get('stays', `${DATA}/stays/v1/${cc}.json?b=load`);
  if (res.status === 200) check(res, { 'stays is json': (r) => (r.headers['Content-Type'] || '').includes('json') });
}
