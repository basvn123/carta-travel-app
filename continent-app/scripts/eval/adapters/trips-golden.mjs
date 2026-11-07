/*
 * Adapter: the Trips generator's offline checks (T153 golden set, T1140) in
 * the shared results format (T1206, register row T1140-b). It guards the
 * trips-shared prompt and the five Trips pass prompts (trips-skeleton,
 * trips-prose, trips-numbers, trips-critic, trips-packing): a bump of one of
 * them runs this.
 *
 * Three gated parts, all offline (stub clients, no key, no model call):
 *   golden_set self-test     the golden set's diff catches drift, a new dispute, a short comparison
 *   backfill self-test       the packing and risk backfill (trips-packing, trips-shared previousNotes)
 *   golden_set check         the prompts, model chain and set match the blessed baseline
 *                            (no baseline yet passes, as in golden-set.yml, with a note)
 * And one advisory part: generate_trip.py self-test (the four-pass fixture run),
 * reported, not gated, while its known failures stand.
 * Headline: the share of the gated parts that pass. The live golden run
 * (golden_set.py run --live, paid) stays a manual step; this eval says
 * whether one is due.
 */
import { makeResult } from '../lib/results.mjs';
import { runPython } from './python.mjs';

export const id = 'trips-golden';
export const title = 'Trips generator golden set and self-tests (offline)';

export async function run() {
  const d = runPython(`
import contextlib, io, json, os, sys
sys.path.insert(0, 'Trips/carta-unified/carta-unified/pipeline')
import golden_set as GS
import backfill_modules as B
import generate_trip as T
def cap(fn, *a):
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            rc = fn(*a)
    except SystemExit as e:
        rc = e.code if isinstance(e.code, int) else 1
    except Exception as e:
        rc, _ = 2, buf.write(repr(e))
    lines = [x for x in buf.getvalue().splitlines() if x.strip()]
    return {"rc": rc or 0, "fails": [x for x in lines if "FAIL" in x][:20], "last": lines[-1] if lines else ""}
out = {
  "golden_self_test": cap(GS.self_test),
  "backfill_self_test": cap(B.self_test),
  "golden_check": cap(GS.cmd_check, True),
  "generate_self_test": cap(T.self_test),
  "baseline": os.path.exists(GS.BASELINE_PATH),
  "prompt_version": T.prompt_version(),
}
print(json.dumps(out))
`);
  const gated = [
    ['golden_self_test', 'golden_set.py self-test'],
    ['backfill_self_test', 'backfill_modules.py self-test'],
    ['golden_check', 'golden_set.py check (against the blessed baseline)'],
  ];
  const failures = [];
  for (const [k, label] of gated) {
    if (d[k].rc !== 0) failures.push({ key: k, was: 0, now: d[k].rc, why: `${label}: ${(d[k].fails.join('; ') || d[k].last).slice(0, 400)}` });
  }
  const passed = gated.length - failures.length;
  const g = d.generate_self_test;
  const notes = [];
  if (!d.baseline) notes.push('No golden baseline yet (golden/baseline.json): the first live run and bless is an owner step (needs a Gemini key).');
  if (g.rc !== 0) notes.push(`Advisory, not gated: generate_trip.py self-test fails ${g.fails.length} check(s): ${g.fails.map((x) => x.replace(/^SELF-TEST FAIL: /, '')).join('; ').slice(0, 400)}`);
  return makeResult({
    eval: id, title, kind: 'text-check',
    status: failures.length ? 'fail' : 'pass', gated: true,
    headline: { key: 'parts_pass', value: Math.round((passed / gated.length) * 10000) / 10000, label: 'offline Trips checks that pass (two self-tests, the baseline stamp)', higher_is_better: true },
    metrics: {
      parts_pass: Math.round((passed / gated.length) * 10000) / 10000,
      'golden_self_test.ok': d.golden_self_test.rc === 0 ? 1 : 0,
      'backfill_self_test.ok': d.backfill_self_test.rc === 0 ? 1 : 0,
      'golden_check.ok': d.golden_check.rc === 0 ? 1 : 0,
      'baseline.present': d.baseline ? 1 : 0,
      'generate_self_test.ok': g.rc === 0 ? 1 : 0,
      'generate_self_test.fails': g.fails.length,
    },
    gate: { ok: !failures.length, rule: 'both self-tests pass and the stamp matches the baseline (or there is none yet)', tolerance: null, baseline: 'Trips/carta-unified/carta-unified/golden/baseline.json', failures },
    cases: { n: gated.length, passed },
    inputs: { prompt_version: d.prompt_version, set: 'Trips/carta-unified/carta-unified/golden/golden-set.json' },
    notes,
  });
}
