/**
 * aiGuard: the one AI security guard for Carta's model calls (T1117, ROADMAP
 * C8 with E3). Used by the Gemini-backed Edge Functions plan-day,
 * suggest-city (since T1137) and parse-booking, and (as a byte-identical copy in
 * continent-app/functions/_lib/aiGuard.js, kept equal by
 * continent-app/tests/aiGuard.test.mjs) by Ask's /api/ask/answer on Workers AI.
 *
 * Plain ES module, no Deno or Workers API beyond crypto.getRandomValues, so the
 * Node tests run the very code that ships.
 *
 * Three stages:
 *
 *   Input   Traveller text (questions, wishes, pasted bookings) and harvested
 *           text (Ask passages, fetched pages, the candidate deck the client
 *           sends) is DATA. scanInjection finds instruction-shaped text;
 *           scrubData drops the sentences that carry it; dataBlock fences
 *           what is left between per-call random markers the data cannot
 *           close; SYSTEM_RULES go in the system slot, where nothing in the
 *           data may override them. scrubPii takes e-mail addresses, phone
 *           numbers, IBANs and card numbers out of traveller text (T1206).
 *   Output  Every model answer passes a shape check (rejected when the
 *           shape is wrong, repaired when only a field is) and a text check:
 *           URLs, markup, e-mail addresses and phone numbers are stripped;
 *           a prompt leak, the canary, chat-template tokens or an echoed
 *           injection empties the field (or ends an Ask stream). Em and
 *           en dashes become house style (fixDashes); houseStyleIssues
 *           reports banned words (T1206).
 *   Limits  LIMITS caps what one call may send and take back.
 *
 * What it does not do: decide whether a fact is true (verify.js and agree.js
 * on Ask, the catalogue match in plan-day, sanitizeParsed in parse-booking).
 * Which provider and model answer, and how long each may take, is the model
 * access module's job (aiModels.mjs, T1137); the pipeline's twin of both is
 * pipeline/ai_gateway.py. The prompt text (the security rules, Ask's user
 * prompt lines) comes from the prompt registry through ./prompts.js, the
 * generated module that sits beside each copy (T1140).
 */
import { ask, frag, securityRules } from './prompts.js';

export const GUARD_VERSION = 1;

/** Per-call caps (characters). Inputs above are refused or cut before a model sees them. */
export const LIMITS = {
  askQuestion: 200,
  askNotes: 14,
  askNoteChars: 300,
  askOutputChars: 2400,
  planFreeText: 280,
  planPromptChars: 60000,
  cityPromptChars: 60000,
  bookingPromptChars: 80000,
  modelOutputChars: 65536,
  heldChars: 600,
};

/**
 * A fixed tag in every system slot. A model that prints it has printed its
 * rules: the answer is a leak, whatever else it says.
 */
export const CANARY = 'cg-k7q2-ward';

/** The security rules, sent in the system slot of every call (Gemini systemInstruction, Workers AI system role). */
export function systemRules(nonce) {
  // The text is the registry's security-rules prompt (prompts/security-rules, T1140).
  return frag(securityRules, 'rules', { canary: CANARY, nonce });
}

/* ---- text folding for the scanners ---- */

// Zero width, bidi controls, BOM, soft hyphen, Unicode tag characters.
const INVISIBLE = /[­᠎​-‏‪-‮⁠-⁤⁦-⁯﻿]|[\u{e0000}-\u{e007f}]/gu;
const HOMOGLYPH = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ɡ: 'g', ı: 'i' };
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };

/** Invisible characters out; the text is otherwise untouched. */
export function stripInvisible(s) {
  return String(s ?? '').replace(INVISIBLE, '');
}

/** Lower case, accents off, look-alike letters mapped, spaces collapsed: the form the rules match. */
export function foldForScan(s) {
  return stripInvisible(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[Ѐ-ӿɐ-ʯı]/g, (c) => HOMOGLYPH[c] || c)
    .replace(/\s+/g, ' ')
    .trim();
}

const deLeet = (s) => s.replace(/[013457@$]/g, (c) => LEET[c]);
// "i g n o r e" and "i.g.n.o.r.e" fold back to the word.
const despace = (s) => s.replace(/\b(?:[a-z][ .\-_*]){3,}[a-z]\b/g, (m) => m.replace(/[ .\-_*]/g, ''));

/* ---- input: instruction-shaped text ---- */

const W = '[^.!?\\n]{0,40}';
/** Each rule names one attack family; the id is what the tests and logs record. */
export const INJECTION_RULES = [
  ['override', new RegExp(`\\b(ignore|disregard|forget|override|bypass|skip|drop)\\b${W}\\b(previous|prior|above|earlier|preceding|all|any|your|these|those|system|original|carta'?s?)\\b${W}\\b(instructions?|rules?|prompts?|directions?|guidelines?|constraints?|guardrails?)\\b`)],
  ['override_nl', new RegExp(`\\b(negeer|vergeet|omzeil)\\b${W}\\b(instructies|regels|opdrachten|richtlijnen)\\b`)],
  ['override_de', new RegExp(`\\b(ignorier\\w*|vergiss\\w*|missachte\\w*)\\b${W}\\b(anweisungen|regeln|vorgaben|instruktionen)\\b`)],
  ['override_fr', new RegExp(`\\b(ignore[rz]?|oublie[rz]?)\\b${W}\\b(instructions|regles|consignes)\\b`)],
  ['override_es', new RegExp(`\\b(ignora\\w*|olvida\\w*)\\b${W}\\b(instrucciones|reglas|indicaciones)\\b`)],
  ['override_it', new RegExp(`\\b(ignora\\w*|dimentica\\w*)\\b${W}\\b(istruzioni|regole|indicazioni)\\b`)],
  ['new_rules', /\b(new|updated|real|actual|true|additional|revised|override)\s+(system\s+)?(instructions?|rules|prompt|directives?|orders)\s*[:=]/],
  ['from_now', /\bfrom now on\b[^.!?\n]{0,40}\b(you|answer|respond|reply|only|always|never)\b/],
  ['role', /\byou are (now|no longer)\b|\b(act|behave|respond) as (an?\s+|the\s+)?(unfiltered|unrestricted|uncensored|different|new|evil|dan|developer|admin|root|system|jailbroken|hacker)\b|\bpretend (to be|you are|that you)\b|\broleplay as\b|\b(je bent nu|du bist jetzt|tu es maintenant|ahora eres|ora sei)\b/],
  ['jailbreak', /\b(jailbreak\w*|dan mode|developer mode|god mode|do anything now|unfiltered mode|no restrictions mode)\b/],
  ['reveal', /\b(reveal|print|show|repeat|output|tell me|display|leak|dump|recite|summari[sz]e)\b[^.!?\n]{0,30}\b(your|hidden|initial|original|secret|developer)\s+(system\s+)?(prompt|instructions|rules|configuration)\b|\bsystem (prompt|message|instructions)\b|\b(instructions|rules|prompt) (above|before this|you were given)\b/],
  ['template', /<\|?\s*(im_start|im_end|system|endoftext|start_of_turn|end_of_turn|eot_id|begin_of_text)\s*\|?>|\[\/?inst\]|<<\/?sys>>|(^|\n)\s*(system|assistant|developer)\s*:|<\/?(system|instructions?|prompt)>|#{2,}\s*(system|instructions?|new rules)\b|\bbegin (system|new|hidden) (prompt|instructions)\b|<<<\s*(data|end)\b/],
  ['exfil', /\b(send|post|upload|forward|exfiltrate|e-?mail|transmit)\b[^.!?\n]{0,40}\b(to|at)\b[^.!?\n]{0,25}(https?:|www\.|@[a-z0-9-]+\.)|!\[[^\]]*\]\(\s*https?:/],
  ['social', /\b(mark|flag|label|report)\b[^.!?\n]{0,30}\b(as )?(cancel+ed|failed|urgent|invalid|fraud\w*|expired)\b|\btell the (traveller|traveler|user|reader|customer) (to|that)\b|\b(ai|assistant|model|chatbot|llm)\b[^.!?\n]{0,20}\b(must|should|shall|will) (now )?(say|write|tell|add|output|reply|answer)\b/],
  ['tooling', /\b(call|invoke|execute)\b[^.!?\n]{0,20}\b(tools?|functions?|commands?|shell|sql|api)\b/],
  ['output_ctrl', /\b(respond|reply|answer|output|say) (only )?with\b[^.!?\n]{0,30}\b(pwned|hacked|yes|ok|the word|exactly)\b|\b(add|include|insert)\b[^.!?\n]{0,30}\b(this|the following|a)\s+(link|url|warning|phone number|banner)\b/],
];

/** Instruction-shaped text: { hit, rules }. Runs on the folded text, then again with leetspeak and spaced letters undone. */
export function scanInjection(text) {
  const f = foldForScan(text);
  if (!f) return { hit: false, rules: [] };
  const variants = [f, despace(deLeet(f))];
  const rules = [];
  for (const [id, re] of INJECTION_RULES) if (variants.some((v) => re.test(v))) rules.push(id);
  return { hit: rules.length > 0, rules };
}

/**
 * Sentences (and lines) of a text, keeping their end marks. A sentence ends
 * at . ! or ? followed by white space or the end, or at a line break; the
 * dot inside a domain, a path or a number ("evil.example/collect", "2.30")
 * does not end one, so an injected URL is scrubbed with the rest of its
 * sentence (T1206, register row T1137-d, attack city-04).
 */
export function sentencesOf(text) {
  const s = String(text);
  const out = [];
  const END = /[.!?]+(?=\s|$)|\n/g;
  let from = 0;
  for (let m = END.exec(s); m; m = END.exec(s)) {
    const to = m.index + m[0].length;
    out.push(s.slice(from, to));
    from = to;
  }
  if (from < s.length) out.push(s.slice(from));
  return out;
}

/** Pieces of a sentence cut at every . ! or ?, the dot of a domain included. */
const piecesOf = (s) => String(s).match(/[^.!?\n]+(?:[.!?]+|\n|$)|[.!?\n]+/g) || [];

/** The longest head of a hit sentence that does not hit, ending at a space; '' when there is none. */
function cleanHead(sentence) {
  let head = '';
  for (const piece of piecesOf(sentence)) {
    if (scanInjection(head + piece).hit) break;
    head += piece;
  }
  if (head.length === sentence.length) return '';
  const cut = head.search(/\s\S*$/);
  return (cut >= 0 ? head.slice(0, cut) : '').trim();
}

/**
 * Data with its instruction-shaped sentences taken out. Returns
 * { text, hit, rules, removed }. A field that was nothing but an injection
 * comes back empty.
 */
export function scrubData(text, max = Infinity) {
  const raw = stripInvisible(text);
  const whole = scanInjection(raw);
  if (!whole.hit) return { text: raw.slice(0, max), hit: false, rules: [], removed: 0 };
  const rules = new Set(whole.rules);
  let removed = 0;
  const kept = [];
  for (const s of sentencesOf(raw)) {
    const r = scanInjection(s);
    if (!r.hit) { kept.push(s); continue; }
    removed += 1;
    r.rules.forEach((x) => rules.add(x));
    // Text with no sentence ends (a booking pasted on one line) is one long
    // "sentence": keep its clean head, never its tail. The head is the
    // longest run of pieces (cut at any . ! ?) that does not hit, cut back
    // to the last space so no half URL or word is left.
    const head = cleanHead(s);
    if (head) kept.push(`${head} `);
  }
  let out = kept.join('').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  // A rule that only matched across two sentences: drop it all rather than guess.
  if (scanInjection(out).hit) { out = ''; removed += 1; }
  return { text: out.slice(0, max), hit: true, rules: [...rules], removed };
}

/** A per-call marker id, so a document cannot know (and so close) its fence. */
export function makeNonce() {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Marker look-alikes and chat-template tokens out of data before it is fenced. */
export function neutralizeData(text) {
  return stripInvisible(text)
    .replace(/<{2,}|>{2,}/g, ' ')
    .replace(/<\|[^|>]{0,30}\|>/g, ' ')
    .replace(/\[\/?INST\]/gi, ' ')
    .replace(/={4,}/g, '==')
    .replace(/`{3,}/g, '');
}

/** One fenced data block. The label is Carta's word, never data. */
export function dataBlock(label, text, nonce) {
  const tag = String(label).toUpperCase().replace(/[^A-Z_]/g, '');
  return `<<<DATA ${nonce} ${tag}>>>\n${neutralizeData(text)}\n<<<END ${nonce}>>>`;
}

/* ---- output: what the traveller may see ---- */

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+|\b[a-z0-9][a-z0-9-]{0,62}(?:\.[a-z0-9-]{1,63})*\.[a-z]{2,24}\/[^\s<>"')\]]*|\b(?:javascript|data|vbscript):\S*/gi;
const MD_LINK_RE = /!?\[[^\]\n]*\]\([^)\n]*\)/g;
const MARKUP_RE = /<(script|style|iframe|object)\b[\s\S]*?(?:<\/\1\s*>|$)|<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>|```[\s\S]*?(```|$)|&lt;\/?[a-z]+/gi;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE_RE = /(?:\+|\b00)\d{1,3}(?:[\s.()-]*\d){6,}/g;
const HIJACK_RE = /\bpwned\b|\bhacked\b|\bi (have been|was|am) (hacked|pwned|jailbroken|freed)\b|\bdeveloper mode (is )?(enabled|on|active)\b|\bdan mode\b|\bas an ai (language )?model\b|\bmy (system )?(prompt|instructions) (is|are|say|says)\b|\bi (will|shall|must) (now )?ignore\b/;

/* ---- input: personal data (T1206, ROADMAP E3 "PII scrub") ---- */

const IBAN_RE = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g;
const CARD_RE = /\b[3-6]\d{2,3}(?:[ -]?\d{3,4}){2,4}\b/g;

/** A payment card number: 15 or 16 digits that pass the Luhn check. */
function isCard(m) {
  const d = m.replace(/\D/g, '');
  if (d.length < 15 || d.length > 16) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let x = Number(d[d.length - 1 - i]);
    if (i % 2) { x *= 2; if (x > 9) x -= 9; }
    sum += x;
  }
  return sum % 10 === 0;
}

/** An IBAN: country, check digits and account that pass the mod 97 check. */
function isIban(m) {
  const c = m.replace(/ /g, '');
  if (c.length < 15 || c.length > 34) return false;
  const n = (c.slice(4) + c.slice(0, 4)).replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let r = 0;
  for (const ch of n) r = (r * 10 + Number(ch)) % 97;
  return r === 1;
}

/**
 * Traveller text with the personal data a model never needs taken out:
 * e-mail addresses, international phone numbers (+ or 00), IBANs and payment
 * card numbers become a bracketed word. Booking codes, dates, times and
 * prices are left alone (a card needs 15 or 16 digits that pass Luhn, an
 * IBAN its mod 97 check). Names are not found: a name is not a pattern.
 * Returns { text, pii }, pii the kinds found.
 */
export function scrubPii(text) {
  const found = new Set();
  const out = String(text ?? '')
    .replace(EMAIL_RE, () => { found.add('email'); return '[email]'; })
    .replace(IBAN_RE, (m) => (isIban(m) ? (found.add('iban'), '[iban]') : m))
    .replace(CARD_RE, (m) => (isCard(m) ? (found.add('card'), '[card]') : m))
    .replace(PHONE_RE, () => { found.add('phone'); return '[phone]'; });
  return { text: out, pii: [...found] };
}

/* ---- output: house style (T1206, ROADMAP E3 "banned terms and no dashes") ---- */

/**
 * Em and en dashes out, the way the app's stripDashes does it
 * (continent-app/src/lib/format.js, PRODUCT.md): a range between figures
 * becomes "to" or a hyphen, a tight join a hyphen, a spaced dash a comma.
 */
export function fixDashes(text) {
  return String(text ?? '')
    .replace(/(\d)\s*[—–]\s*([€$£]\s?\d)/g, '$1 to $2')
    .replace(/(\d)\s*[—–]\s*(\d)/g, '$1-$2')
    .replace(/(\w)[—–](\w)/g, '$1-$2')
    .replace(/\s*[—–]\s*/g, ', ');
}

/** PRODUCT.md's banned words. */
export const BANNED_TERMS = ['seamless', 'unlock', 'effortless', 'elevate', 'leverage', 'empower', 'curated', 'simply', 'just', 'easy'];
const BANNED_RE = new RegExp(`\\b(${BANNED_TERMS.join('|')})\\b`, 'gi');

/**
 * The house-style faults of a model text: { dashes, banned }, banned the
 * banned words it uses (lower case, once each). Reported, not repaired:
 * what to do with a banned word (drop the field, ask again, rewrite) is a
 * product call that is still open (register row from T1206).
 */
export function houseStyleIssues(text) {
  const s = String(text ?? '');
  const banned = [...new Set((s.match(BANNED_RE) || []).map((w) => w.toLowerCase()))];
  return { dashes: (s.match(/[—–]/g) || []).length, banned };
}

const words = (s) => foldForScan(s).replace(/[^\p{L}\p{N} ]+/gu, ' ').split(' ').filter(Boolean);
/** Six-word runs of the system text: any of them in an answer is a prompt leak. */
export function promptShingles(systemText, n = 6) {
  const w = words(systemText);
  const out = new Set();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

/** The word index where the first six-word run of the system text starts, or -1. */
export function leakAt(text, shingles, n = 6) {
  if (!shingles || !shingles.size) return -1;
  const w = words(text);
  for (let i = 0; i + n <= w.length; i++) if (shingles.has(w.slice(i, i + n).join(' '))) return i;
  return -1;
}

/**
 * The text check. issues: url, markup, email, phone (strippable) and leak,
 * canary, template, hijack, injection (severe: the field is not shown).
 */
export function scanOutput(text, { shingles = null } = {}) {
  const s = String(text ?? '');
  const issues = [];
  if (URL_RE.test(s) || MD_LINK_RE.test(s)) issues.push('url');
  URL_RE.lastIndex = 0; MD_LINK_RE.lastIndex = 0;
  if (MARKUP_RE.test(s)) issues.push('markup');
  MARKUP_RE.lastIndex = 0;
  if (EMAIL_RE.test(s)) issues.push('email');
  EMAIL_RE.lastIndex = 0;
  if (PHONE_RE.test(s)) issues.push('phone');
  PHONE_RE.lastIndex = 0;
  const f = foldForScan(s);
  if (f.includes(CANARY)) issues.push('canary');
  if (leakAt(s, shingles) >= 0) issues.push('leak');
  if (INJECTION_RULES.find(([id]) => id === 'template')[1].test(f)) issues.push('template');
  if (HIJACK_RE.test(f)) issues.push('hijack');
  if (scanInjection(s).hit) issues.push('injection');
  return { ok: issues.length === 0, issues, severe: issues.some((i) => SEVERE.has(i)) };
}
const SEVERE = new Set(['leak', 'canary', 'template', 'hijack', 'injection']);

/**
 * One output field, repaired: strippable issues are cut out, a severe one
 * empties the field. Returns { text, issues }.
 */
export function repairText(text, { max = 400, shingles = null } = {}) {
  const raw = stripInvisible(text);
  const r = scanOutput(raw, { shingles });
  if (r.severe) return { text: '', issues: r.issues };
  // House style (PRODUCT.md): no em or en dash in anything a traveller reads.
  const dashed = fixDashes(raw);
  const dashIssue = dashed !== raw ? ['dash'] : [];
  if (r.ok) return { text: dashed.slice(0, max), issues: dashIssue };
  const out = dashed
    .replace(MD_LINK_RE, ' ')
    .replace(MARKUP_RE, ' ')
    .replace(URL_RE, ' ')
    .replace(EMAIL_RE, ' ')
    .replace(PHONE_RE, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { text: out.slice(0, max), issues: [...r.issues, ...dashIssue] };
}

/* ---- Ask: the streamed answer ---- */

/**
 * A guard over a streamed answer. push(piece) returns the text that may go
 * out now (whole sentences that passed); end() returns the rest. A chunk
 * with a strippable issue is dropped; a severe one ends the stream
 * (withdrawn), since a model that leaked or was turned once is not trusted
 * for the rest of the answer. Cut at maxChars.
 */
export function makeStreamGuard({ systemText = '', maxChars = LIMITS.askOutputChars } = {}) {
  const shingles = promptShingles(systemText);
  let buf = '';
  // One finished chunk is held back until the next one is in, so a leak
  // that a sentence boundary cuts in two is still seen whole.
  let held = '';
  let sent = 0;
  const state = { dropped: 0, withdrawn: false, cut: false, issues: [] };
  const withdraw = (issues) => { state.withdrawn = true; state.issues.push(...issues); held = ''; buf = ''; return ''; };
  const release = (chunk) => {
    if (!chunk || state.withdrawn || state.cut) return '';
    const r = scanOutput(chunk, { shingles });
    if (r.severe) return withdraw(r.issues);
    if (!r.ok) { state.dropped += 1; state.issues.push(...r.issues); return ''; }
    if (sent + chunk.length > maxChars) { state.cut = true; return ''; }
    sent += chunk.length;
    return fixDashes(chunk);
  };
  const take = (chunk) => {
    if (held) {
      // A leak that starts in the held chunk: neither is shown.
      const at = leakAt(held + chunk, shingles);
      if (at >= 0 && at < words(held).length) return withdraw(['leak']);
    }
    const out = release(held);
    held = state.withdrawn ? '' : chunk;
    return out;
  };
  const BOUNDARY = /[.!?](?:\s*\[\d+\])*\s+|\n+/g;
  return {
    state,
    push(piece) {
      if (state.withdrawn || state.cut) return '';
      buf += stripInvisible(piece);
      let last = -1;
      BOUNDARY.lastIndex = 0;
      for (let m = BOUNDARY.exec(buf); m; m = BOUNDARY.exec(buf)) last = m.index + m[0].length;
      let out = '';
      if (last > 0) { const c = buf.slice(0, last); buf = buf.slice(last); out = take(c); }
      if (buf.length > LIMITS.heldChars) { const c = buf; buf = ''; out += take(c); }
      return out;
    },
    end() {
      let out = '';
      if (buf) { const c = buf; buf = ''; out += take(c); }
      out += release(held);
      held = '';
      return out;
    },
  };
}

/** The Ask question and notes as fenced data; null when the question itself is an injection. */
export function guardAskInput(wire) {
  const q = scanInjection(wire.question);
  if (q.hit) return { ok: false, rules: q.rules };
  let withheld = 0;
  const notes = wire.notes.map((n) => {
    if (!scanInjection(n).hit) return n;
    withheld += 1;
    return '(note withheld)';
  });
  return { ok: true, question: wire.question, notes, withheld };
}

/** The Ask user turn, with the question and the notes fenced as data. */
export function askUserPrompt({ question, notes }, nonce) {
  return [
    frag(ask, 'server.question'),
    dataBlock('QUESTION', question, nonce),
    '',
    frag(ask, 'server.notes'),
    dataBlock('NOTES', notes.map((t, i) => `[${i + 1}] ${t}`).join('\n'), nonce),
  ].join('\n');
}

/* ---- plan-day ---- */

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const STOP_OPTIONAL = { id: 'string', isEvent: 'boolean', lat: 'number', lon: 'number' };

/**
 * plan-day's traveller and client-sent fields, scrubbed before the cache key
 * and the prompt (injections out, then personal data: scrubPii). A field that was only an injection becomes empty; a
 * candidate whose name is one is dropped (its description is just cleared).
 * @template {{ name: string }} M
 * @template {{ name: string, kind?: string, desc?: string }} C
 * @param {{ city?: string, country?: string, freeText?: string, refine?: string, prevStops?: string[], mustInclude?: M[], candidates?: C[] }} p
 * @returns {{ badDest: boolean, freeText: string, refine: string, prevStops: string[], mustInclude: M[], candidates: C[], flags: string[], pii: string[] }}
 */
export function guardPlanInput({ city = '', country = '', freeText = '', refine = '', prevStops = [], mustInclude = [], candidates = [] }) {
  const flags = [];
  const pii = new Set();
  const scrub = (field, v, max) => {
    const r = scrubData(v, max);
    if (r.hit) flags.push(field);
    const p = scrubPii(r.text);
    p.pii.forEach((k) => pii.add(k));
    return p.text;
  };
  const badDest = scanInjection(city).hit || scanInjection(country).hit;
  if (badDest) flags.push('dest');
  const out = {
    badDest,
    freeText: scrub('freeText', freeText, LIMITS.planFreeText),
    refine: scrub('refine', refine, LIMITS.planFreeText),
    prevStops: prevStops.filter((s) => { const h = scanInjection(s).hit; if (h) flags.push('prevStops'); return !h; }),
    mustInclude: mustInclude.filter((m) => { const h = scanInjection(m.name).hit; if (h) flags.push('mustInclude'); return !h; }),
    candidates: candidates
      .filter((c) => { const h = scanInjection(c.name).hit || scanInjection(c.kind).hit; if (h) flags.push('candidate'); return !h; })
      .map((c) => (c.desc && scanInjection(c.desc).hit ? (flags.push('candidateDesc'), { ...c, desc: '' }) : c)),
  };
  return { ...out, flags: [...new Set(flags)], pii: [...pii] };
}

/**
 * The model's plan-day JSON, checked against RESPONSE_SCHEMA before anything
 * else reads it. Rejected (reason set) when it is not { summary, stops[] };
 * a stop of the wrong shape is dropped; text fields are repaired; unknown
 * keys are not carried. Returns { value, reason, dropped, repaired }.
 */
export function guardPlanOutput(parsed, { systemText = '' } = {}) {
  if (!isObj(parsed)) return { value: null, reason: 'wrong_shape', dropped: 0, repaired: 0 };
  if (!Array.isArray(parsed.stops)) return { value: null, reason: 'missing_key', dropped: 0, repaired: 0 };
  const shingles = promptShingles(systemText);
  let dropped = 0;
  let repaired = 0;
  const fix = (t, max) => {
    const r = repairText(t, { max, shingles });
    if (r.issues.length) repaired += 1;
    return r.text;
  };
  const stops = [];
  for (const s of parsed.stops.slice(0, 60)) {
    // A stop is an object with a text name; anything else is not a stop.
    if (!isObj(s) || typeof s.name !== 'string') { dropped += 1; continue; }
    // A key of the wrong type is a schema break, not a typo: the stop goes.
    if (Object.entries(STOP_OPTIONAL).some(([k, t]) => s[k] != null && typeof s[k] !== t)) { dropped += 1; continue; }
    if (s.inCatalog != null && typeof s.inCatalog !== 'boolean') { dropped += 1; continue; }
    const inCatalog = typeof s.inCatalog === 'boolean' ? s.inCatalog : s.id != null;
    const name = fix(s.name, 90);
    // A discovery's name is model text the traveller reads as a place: a bad one drops the stop.
    if (!name && !inCatalog) { dropped += 1; continue; }
    // Missing or mistyped soft fields are repaired to their defaults.
    const soft = [typeof s.why === 'string', typeof s.arrive === 'string', Number.isFinite(s.dwellMin)];
    if (soft.includes(false)) repaired += 1;
    const stop = {
      name,
      arrive: soft[1] ? s.arrive : '',
      dwellMin: soft[2] ? s.dwellMin : 40,
      why: soft[0] ? fix(s.why, 240) : '',
      inCatalog,
    };
    for (const k of Object.keys(STOP_OPTIONAL)) if (s[k] != null) stop[k] = s[k];
    stops.push(stop);
  }
  const summary = typeof parsed.summary === 'string' ? fix(parsed.summary, 400) : '';
  if (typeof parsed.summary !== 'string') repaired += 1;
  return { value: { summary, stops }, reason: null, dropped, repaired };
}

/**
 * The plan-day payload the traveller receives, fresh or from ai_plan_cache:
 * the same text check on every visible string, and a shape check. Returns
 * the repaired payload, or null when it is off-schema (a cached row that is
 * null is treated as a miss and regenerated).
 */
export function guardPlanPayload(payload) {
  if (!isObj(payload) || typeof payload.summary !== 'string' || !Array.isArray(payload.stops)) return null;
  if (payload.events != null && !Array.isArray(payload.events)) return null;
  const stops = [];
  for (const s of payload.stops) {
    if (!isObj(s) || typeof s.name !== 'string') return null;
    for (const k of ['lat', 'lon']) if (s[k] != null && typeof s[k] !== 'number') return null;
    const name = repairText(s.name, { max: 90 }).text;
    if (!name) continue;
    stops.push({ ...s, name, why: typeof s.why === 'string' ? repairText(s.why, { max: 240 }).text : '' });
  }
  const events = (payload.events || [])
    .filter((e) => isObj(e) && typeof e.name === 'string')
    .map((e) => ({ name: repairText(e.name, { max: 90 }).text, why: typeof e.why === 'string' ? repairText(e.why, { max: 240 }).text : '' }))
    .filter((e) => e.name);
  return { ...payload, summary: repairText(payload.summary, { max: 400 }).text, stops, events };
}

/* ---- parse-booking ---- */

/**
 * The booking texts and trip context, scrubbed before the cache key and the
 * prompt (injections out, then personal data: scrubPii).
 * @template {{ stops: { city: string, country?: string }[] }} T
 * @param {{ texts?: string[], context?: T }} p
 * @returns {{ texts: string[], context: T, flags: string[], pii: string[] }}
 */
export function guardBookingInput({ texts = [], context = /** @type {any} */ ({ stops: [] }) }) {
  const flags = [];
  const pii = new Set();
  const out = texts.map((t) => {
    const r = scrubData(t);
    if (r.hit) flags.push(...r.rules);
    const p = scrubPii(r.text);
    p.pii.forEach((k) => pii.add(k));
    return p.text;
  });
  const stops = (context.stops || []).filter((s) => {
    const h = scanInjection(s.city).hit || scanInjection(s.country).hit;
    if (h) flags.push('context');
    return !h;
  });
  return { texts: out, context: { ...context, stops }, flags: [...new Set(flags)], pii: [...pii] };
}

const squash = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * sanitizeParsed's result, with the text check on every visible field. When
 * the import was text only (no PDF or image the server cannot read), a link
 * or a code must appear in that text, or it is the model's (or an
 * injection's) invention and is cleared.
 */
export function guardBookingOutput(safe, { sourceText = '', textOnly = false, systemText = '' } = {}) {
  const shingles = promptShingles(systemText);
  let repaired = 0;
  const fix = (t, max) => {
    const r = repairText(t, { max, shingles });
    if (r.issues.length) repaired += 1;
    return r.text;
  };
  const src = String(sourceText || '');
  const srcSquash = squash(src);
  const traced = (v, kind) => {
    if (!v || !textOnly) return v;
    const ok = kind === 'link' ? src.includes(v) || src.includes(v.replace(/\/$/, '')) : srcSquash.includes(squash(v));
    if (!ok) repaired += 1;
    return ok ? v : '';
  };
  const bookings = safe.bookings
    .map((b) => ({
      ...b,
      title: fix(b.title, 90),
      city: fix(b.city, 60),
      code: traced(scanOutput(b.code).severe ? '' : b.code, 'code'),
      link: traced(b.link, 'link'),
    }))
    .filter((b) => b.title);
  const activities = safe.activities
    .map((a) => ({ ...a, name: fix(a.name, 90), city: fix(a.city, 60), note: fix(a.note, 140) }))
    .filter((a) => a.name);
  return { ...safe, bookings, activities, summary: fix(safe.summary, 300), repaired };
}

/** A parse-booking payload from ai_plan_cache: re-checked before it is served; null is a miss. */
export function guardBookingPayload(payload) {
  if (!isObj(payload) || !Array.isArray(payload.bookings) || !Array.isArray(payload.activities)) return null;
  if (payload.bookings.some((b) => !isObj(b) || typeof b.title !== 'string')) return null;
  if (payload.activities.some((a) => !isObj(a) || typeof a.name !== 'string')) return null;
  const { repaired, ...out } = guardBookingOutput({ ...payload, summary: typeof payload.summary === 'string' ? payload.summary : '' });
  void repaired;
  return out;
}

/* ---- suggest-city (T1137) ---- */

/**
 * suggest-city's wish and the client-sent candidate deck, scrubbed before the
 * cache key and the prompt, as plan-day's are. A candidate whose name,
 * country or a tag is an injection is dropped.
 * @template {{ name: string, country?: string, tags?: string[] }} C
 * @param {{ freeText?: string, candidates?: C[] }} p
 * @returns {{ freeText: string, candidates: C[], flags: string[], pii: string[] }}
 */
export function guardCityInput({ freeText = '', candidates = [] }) {
  const flags = [];
  const r = scrubData(freeText, LIMITS.planFreeText);
  if (r.hit) flags.push('freeText');
  const p = scrubPii(r.text);
  const kept = candidates.filter((c) => {
    const h = [c.name, c.country, ...(c.tags || [])].some((t) => scanInjection(t).hit);
    if (h) flags.push('candidate');
    return !h;
  });
  return { freeText: p.text, candidates: kept, flags: [...new Set(flags)], pii: p.pii };
}

/**
 * The model's suggest-city JSON, before sanitizeSuggestions reads it.
 * Rejected when it is not { suggestions[] }; a suggestion that is not an
 * object is dropped; name, country and why are repaired (a discovery whose
 * name fails is dropped: its name is model text the traveller reads as a
 * place). Returns { value, reason, dropped, repaired }.
 */
export function guardCityOutput(parsed, { systemText = '' } = {}) {
  if (!isObj(parsed)) return { value: null, reason: 'wrong_shape', dropped: 0, repaired: 0 };
  if (!Array.isArray(parsed.suggestions)) return { value: null, reason: 'missing_key', dropped: 0, repaired: 0 };
  const shingles = promptShingles(systemText);
  let dropped = 0;
  let repaired = 0;
  const fix = (t, max) => {
    if (typeof t !== 'string') return '';
    const r = repairText(t, { max, shingles });
    if (r.issues.length) repaired += 1;
    return r.text;
  };
  const suggestions = [];
  for (const s of parsed.suggestions.slice(0, 12)) {
    if (!isObj(s)) { dropped += 1; continue; }
    const name = fix(s.name, 90);
    if (!name && s.inCatalog === false) { dropped += 1; continue; }
    suggestions.push({ ...s, name, country: fix(s.country, 60), why: fix(s.why, 200) });
  }
  return { value: { suggestions }, reason: null, dropped, repaired };
}

/** A suggest-city payload, fresh or from ai_plan_cache: re-checked before it is served; null is a miss. */
export function guardCityPayload(payload) {
  if (!isObj(payload) || !Array.isArray(payload.suggestions)) return null;
  if (payload.suggestions.some((s) => !isObj(s) || typeof s.name !== 'string')) return null;
  const suggestions = payload.suggestions
    .map((s) => ({
      ...s,
      name: repairText(s.name, { max: 90 }).text,
      country: typeof s.country === 'string' ? repairText(s.country, { max: 60 }).text : '',
      why: typeof s.why === 'string' ? repairText(s.why, { max: 200 }).text : '',
    }))
    .filter((s) => s.name);
  return { ...payload, suggestions };
}
