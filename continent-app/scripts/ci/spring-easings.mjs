// The CSS linear() easings of the house springs (G1, G5), generated from the
// installed motion so a CSS control and a Motion control move the same way.
// Never edit the linear() strings in 01-tokens.css by hand: change a spring
// in src/lib/motionTokens.js, run this, paste the printed lines.
//   node scripts/ci/spring-easings.mjs          print the token lines
//   node scripts/ci/spring-easings.mjs --check  exit 1 if 01-tokens.css differs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spring } from 'motion';
import { SPRING } from '../../src/lib/motionTokens.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOKENS = path.resolve(here, '../../src/styles/01-tokens.css');

// token name -> spring name; the duration token is the spring's settle time.
const MAP = [['tick', 'tick'], ['pop', 'pop'], ['settle', 'settle']];

function easing(name) {
  const gen = spring({ keyframes: [0, 1], ...SPRING[name] });
  // motion's spring generator exposes its own linear() string and duration.
  const css = gen.toString();
  const m = /^(\d+)ms (linear\(.*\))$/.exec(css);
  if (!m) throw new Error(`unexpected spring string for ${name}: ${css}`);
  return { ms: Number(m[1]), linear: m[2] };
}

const lines = MAP.map(([tok, name]) => {
  const e = easing(name);
  return [`  --dur-${tok}: ${e.ms}ms;`, `  --ease-${tok}: ${e.linear};`];
}).flat();

if (process.argv.includes('--check')) {
  const css = fs.readFileSync(TOKENS, 'utf8');
  const missing = lines.filter((l) => !css.includes(l.trim()));
  if (missing.length) {
    console.error('01-tokens.css is out of step with src/lib/motionTokens.js:\n' + missing.join('\n'));
    process.exit(1);
  }
  console.log('spring easings: in step');
} else {
  console.log(lines.join('\n'));
}
