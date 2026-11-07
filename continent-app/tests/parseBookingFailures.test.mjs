// T1215 (register row T1156-e): the parse-booking failure-case set.
// Each case plants one bad model answer and runs it through the shipped
// text-import path. `caught` in failures.json says whether that path removes
// the fault today; this test fails when an outcome changes, so the model card
// (docs/ai/model-card-parse-booking.md) and the code move together.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runDoc, DIR } from '../scripts/eval/adapters/parse-booking.mjs';

const SET = JSON.parse(readFileSync(join(DIR, 'failures.json'), 'utf8'));

function faultSurvives(c, r) {
  const b = r.safe.bookings[0];
  const planted = typeof c.answer === 'string' ? null : c.answer.bookings[0];
  switch (c.fault) {
    case 'link': return !!b?.link;
    case 'code': return !!b?.code;
    case 'invented_booking': return r.safe.bookings.length > 0;
    case 'injected_link': return !!b?.link && b.link === planted.link;
    case 'personal_data': return r.safe.bookings.some((x) => /@/.test(`${x.title} ${x.city}`));
    case 'currency': return !!b && b.eur === planted.amount && planted.currency !== 'EUR';
    case 'bad_json': return !r.rejected;
    default: throw new Error(`unknown fault ${c.fault}`);
  }
}

test('the failure-case set has unique ids and a known fault per case', () => {
  const ids = SET.cases.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(SET.cases.length >= 7);
});

for (const c of SET.cases) {
  test(`${c.id} (${c.fault}): the shipped path ${c.caught ? 'removes' : 'does not yet remove'} the fault`, () => {
    const answer = typeof c.answer === 'string' ? c.answer : JSON.stringify(c.answer);
    const r = runDoc({ ...c, lang: 'en' }, answer);
    assert.equal(faultSurvives(c, r), !c.caught, c.about);
  });
}
