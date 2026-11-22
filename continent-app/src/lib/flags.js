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

export function flag(engine) {
  const mode = FLAGS.engines[engine];
  if (!mode) throw new Error(`engine "${engine}" is not in config/flags.json`);
  return mode;
}

export const isOn = (engine) => flag(engine) === 'new';
export const inShadow = (engine) => flag(engine) === 'shadow';
