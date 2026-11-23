/**
 * Engine flags (G7, ROADMAP G4): which path each logic engine runs, so a wave
 * can ship its engine beside the old code and flip it per engine.
 *
 *   flag('E6')   'old' | 'new' | 'shadow'
 *   isOn('E6')   true only for 'new'; 'shadow' still serves the old answer
 *   inShadow('E6')   true when the caller should compute both and log the diff
 *
 * The values come from config/flags.json and nowhere else: no address
 * parameter, no storage key, so a traveller cannot flip an engine. An engine
 * that is not in the file, or a value that is not one of the three, throws,
 * so a typo fails at the call and not as a silent "old".
 */
import FLAGS from '../../config/flags.json' with { type: 'json' };

export const ENGINES = Object.freeze(Object.keys(FLAGS.engines));
export const MODES = Object.freeze(['old', 'new', 'shadow']);

for (const [engine, mode] of Object.entries(FLAGS.engines)) {
  if (!MODES.includes(mode)) throw new Error(`config/flags.json: ${engine} is "${mode}", want one of ${MODES.join(', ')}`);
}

// Set only by withFlags, for tests and the eval harness, which run the old and
// the new path of one engine in one process. Not reachable from the address,
// storage or any component.
let override = null;

export function flag(engine) {
  const mode = override?.[engine] ?? FLAGS.engines[engine];
  if (!mode) throw new Error(`engine "${engine}" is not in config/flags.json`);
  if (!MODES.includes(mode)) throw new Error(`flag ${engine}: "${mode}" is not one of ${MODES.join(', ')}`);
  return mode;
}

/** Run `fn` (synchronous) with some engines forced, then put the file's values back. */
export function withFlags(forced, fn) {
  const was = override;
  override = { ...(was || {}), ...forced };
  try { return fn(); } finally { override = was; }
}

export const isOn = (engine) => flag(engine) === 'new';
export const inShadow = (engine) => flag(engine) === 'shadow';
