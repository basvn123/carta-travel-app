/*
 * The prompt registry's file format and hashing (T1140, ROADMAP E5).
 * The Python twin is pipeline/prompt_registry.py; both must parse a file to
 * the same fragments and the same hash (tests/test_prompt_registry.py).
 *
 * A prompt file, prompts/<id>/v<N>.md:
 *
 *   ---
 *   id: plan-day
 *   version: 1
 *   ---
 *   Free Markdown: what the prompt is for, who calls it, the changelog.
 *
 *   ### intro
 *   ~~~
 *   You are Carta's day planner ... in {{city}}, {{country}} on {{dateISO}}.
 *   ~~~
 *
 * A fragment is a "### <name>" line directly followed by a "~~~" line; its
 * text is every line up to the next line that is exactly "~~~", joined with
 * "\n" (so a text that ends in a newline ends in an empty line before the
 * fence). Everything outside fragments is documentation and never reaches a
 * model. "{{name}}" in a fragment is filled by code in one pass, so a value
 * that itself contains "{{x}}" is left as it is. Carriage returns are
 * dropped on read, so a Windows checkout gives the same bytes.
 *
 * A Trips generator prompt (Trips/.../pipeline/prompts/k*.md) keeps its own
 * format, "key: value" header lines, a blank line, the body; it is one
 * fragment named "body" (format "trips-header" in registry.json).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const FENCE = '~~~';
const NAME_RE = /^[A-Za-z0-9_.-]+$/;
export const PLACEHOLDER_RE = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;

/** { meta, frags } from the text of a registry prompt file. */
export function parsePromptFile(text, { file = 'prompt' } = {}) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const meta = {};
  let i = 0;
  if (lines[0] === '---') {
    for (i = 1; i < lines.length && lines[i] !== '---'; i++) {
      const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i]);
      if (m) meta[m[1]] = m[2].trim();
    }
    if (i >= lines.length) throw new Error(`${file}: front matter not closed`);
    i++;
  }
  if (meta.version != null) meta.version = Number(meta.version);
  const frags = {};
  for (; i < lines.length; i++) {
    const h = /^### (.+)$/.exec(lines[i]);
    if (!h || lines[i + 1] !== FENCE) continue;
    const name = h[1].trim();
    if (!NAME_RE.test(name)) throw new Error(`${file}: bad fragment name "${name}"`);
    if (name in frags) throw new Error(`${file}: fragment "${name}" twice`);
    const body = [];
    let j = i + 2;
    for (; j < lines.length && lines[j] !== FENCE; j++) body.push(lines[j]);
    if (j >= lines.length) throw new Error(`${file}: fragment "${name}" has no closing fence`);
    frags[name] = body.join('\n');
    i = j;
  }
  return { meta, frags };
}

/** A Trips generator prompt: header lines, a blank line, the body (as generate_trip.load_prompt reads it). */
export function parseTripsHeader(text, { file = 'prompt' } = {}) {
  const t = String(text).replace(/\r/g, '');
  const cut = t.indexOf('\n\n');
  if (cut < 0) throw new Error(`${file}: no header`);
  const meta = {};
  for (const line of t.slice(0, cut).split('\n')) {
    const k = line.split(':')[0].trim();
    meta[k] = line.slice(line.indexOf(':') + 1).trim();
  }
  meta.version = Number(meta.version);
  return { meta, frags: { body: t.slice(cut + 2) } };
}

export function parseByFormat(text, format, opts) {
  return format === 'trips-header' ? parseTripsHeader(text, opts) : parsePromptFile(text, opts);
}

/**
 * The hash of a prompt's text: its fragments in name order, each as
 * name, NUL, text, NUL. Documentation outside the fragments is not in it.
 */
export function fragmentsSha(frags) {
  const h = createHash('sha256');
  for (const name of Object.keys(frags).sort()) h.update(`${name}\u0000${frags[name]}\u0000`, 'utf8');
  return h.digest('hex');
}

/** One fragment of a file as a registry file writes it. */
export function writeFragment(name, text) {
  if (String(text).split('\n').includes(FENCE)) throw new Error(`fragment "${name}" holds a line "${FENCE}"`);
  return `### ${name}\n${FENCE}\n${text}\n${FENCE}\n`;
}

/* ---- the Node loader (scripts that read the files; bundled code uses the generated prompts.js) ---- */

const REPO = new URL('../../', import.meta.url);

/** The current version of a prompt, read from the registry and its file: { id, version, sha256, f }. */
export function loadPrompt(id) {
  const reg = JSON.parse(readFileSync(new URL('prompts/registry.json', REPO), 'utf8'));
  const entry = reg.prompts[id];
  if (!entry) throw new Error(`prompt registry: no prompt "${id}"`);
  const { frags } = parseByFormat(readFileSync(new URL(entry.file, REPO), 'utf8'), entry.format, { file: entry.file });
  return { id, version: entry.version, sha256: fragmentsSha(frags), f: frags };
}

/** One fragment with its {{name}} slots filled, in one pass; the same rules as the generated frag(). */
export function frag(p, name, vars = {}) {
  const t = p.f[name];
  if (t == null) throw new Error(`prompt ${p.id} v${p.version}: no fragment "${name}"`);
  return t.replace(PLACEHOLDER_RE, (_, k) => {
    if (!(k in vars)) throw new Error(`prompt ${p.id} v${p.version}: fragment "${name}" needs {{${k}}}`);
    return String(vars[k]);
  });
}
