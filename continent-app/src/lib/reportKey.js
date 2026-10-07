/**
 * The report key of the context block (T326, docs/FEEDBACK-LOOP.md option A).
 *
 * A report is a feedback row that names its item: layer and id are the
 * override console's own keys, cc is the country file, what is one of
 * REPORT_WHATS, name is there so the inbox row reads without a lookup.
 * Nothing about the person is added. Empty fields are left out so the block
 * stays far under the 4096 bytes submit_feedback allows.
 */
export const REPORT_WHATS = ['photo', 'text', 'price', 'missing', 'other'];

export function reportKey({ layer, id, cc, what, name }) {
  const out = { layer: String(layer), id: String(id), what: REPORT_WHATS.includes(what) ? what : 'other' };
  if (cc) out.cc = String(cc);
  if (name) out.name = String(name).slice(0, 120);
  return out;
}
