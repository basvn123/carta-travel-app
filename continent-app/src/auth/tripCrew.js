/**
 * tripCrew.js, the people on a trip.
 *
 * Carta kept two lists of the same humans. `extras.people` is the positional
 * roster the expense ledger splits a bill by, and `memory.companions` is the
 * list a past trip records under "who came". pastTripMemory.saveMemory copied
 * the second into the first, which was always the tell that they are one
 * thing wearing two names.
 *
 * This is that one thing. A crew member is { id, name, userId }, where userId
 * stays null until an account is linked to it (nothing links yet, that is a
 * later phase). The list lives in `extras.people`, which already syncs:
 * localStorage first, shadowed into the account's day_plans row when signed
 * in. So it works for guests, who are most of the app, and it needs no new
 * table. It also needs no new extras key, which matters, because anything
 * outside the whitelist in dayPlanStore.loadTripExtras is silently dropped on
 * every read.
 *
 * POSITION IS LOAD BEARING. The expense ledger stores `paidBy` as an index
 * into this array, and `expenses[].sharers` as a list of indices. Moving an
 * entry silently rewrites what an already recorded expense means, so readCrew
 * never reorders and never inserts: it upgrades each slot where it stands and
 * pads the tail. That is also why ids are derived from position rather than
 * generated, so a member keeps its identity across a reload without anything
 * being stored to remember it by.
 *
 * There is deliberately no "this one is you" flag. The field has always been
 * labelled "names, so the ledger can split what it cost", so some travellers
 * typed themselves into it and some did not, and both files are in the wild.
 * Guessing would put the wrong name on a card, so nothing here guesses: the
 * crew is simply the people the trip has, in the order they were typed.
 */

/** Hard caps. A trip with more than this many named people is a corrupted
 *  blob, not a coach tour, and a 200 character name is not a name. */
export const MAX_CREW = 20;
const MAX_NAME = 60;

/** The id a slot carries. Derived from position, which readCrew guarantees is
 *  stable, so nothing has to be persisted to keep React keys steady. */
const slotId = (i) => `p${i}`;

// Ids for slots added during an edit. Removing a member leaves the surviving
// ids stale (they were derived from the old positions), so a fresh slot must
// not be able to land on one of them: `n1` can never collide with `p3`. These
// live only for the length of the edit, readCrew renumbers on the next load.
let draftSeq = 0;

const cleanName = (v) => (typeof v === 'string' ? v : '').slice(0, MAX_NAME);

/** One crew member from whatever shape the slot was stored in: a bare string
 *  (every trip saved before this module existed) or an object (every trip
 *  saved since). Unknown shapes become an empty slot rather than throwing,
 *  because a single bad entry must not cost the traveller the whole list. */
function crewEntry(raw, i) {
  if (typeof raw === 'string') {
    return { id: slotId(i), name: cleanName(raw), userId: null };
  }
  if (raw && typeof raw === 'object') {
    return {
      id: slotId(i),
      name: cleanName(raw.name),
      userId: typeof raw.userId === 'string' ? raw.userId : null,
    };
  }
  return { id: slotId(i), name: '', userId: null };
}

/**
 * The trip's crew, as a complete positional list.
 *
 * `groupSize` pads the tail with empty slots so the ledger can show a row per
 * traveller before anybody has been named. `memory` seeds the list from a
 * past trip's legacy `companions` array, but only when `extras.people` is
 * genuinely empty: extras is the newer of the two and wins wherever both
 * exist, otherwise editing a name would revert on the next read.
 */
export function readCrew(extras, { groupSize = 0, memory = null } = {}) {
  const stored = Array.isArray(extras?.people) ? extras.people : [];
  let source = stored;

  if (!stored.some((p) => cleanName(typeof p === 'string' ? p : p?.name).trim())) {
    const legacy = Array.isArray(memory?.companions) ? memory.companions : [];
    if (legacy.length) source = legacy;
  }

  const n = Math.min(MAX_CREW, Math.max(source.length, Math.max(0, groupSize)));
  return Array.from({ length: n }, (_, i) => crewEntry(source[i], i));
}

/**
 * Extras with this crew stored, trailing empty slots trimmed so a roster that
 * was padded out to the group size does not persist its own padding.
 *
 * Trimming the tail is only safe because readCrew pads it straight back at the
 * group size. An expense whose `paidBy` points at an unnamed traveller still
 * resolves to that slot on the next read, and still shows the ledger's
 * "Traveller 2" fallback. Interior blanks are never trimmed, because nothing
 * would put those back.
 */
export function writeCrew(extras, crew) {
  const list = (Array.isArray(crew) ? crew : []).slice(0, MAX_CREW).map((c) => ({
    name: cleanName(c?.name),
    userId: typeof c?.userId === 'string' ? c.userId : null,
  }));
  while (list.length && !list[list.length - 1].name.trim() && !list[list.length - 1].userId) {
    list.pop();
  }
  return { ...extras, people: list };
}

/**
 * A blank slot to append to a roster being edited.
 *
 * Appending is the only safe edit: it cannot change what an already recorded
 * expense meant. Removing a member from the middle does renumber everything
 * after it, so an editor that offers removal is accepting that its trip's
 * hand-typed ledger rows may need re-checking. The generated rows a past trip
 * carries (`src: 'memory'`) are rebuilt on every save and are never affected.
 */
export function newCrewMember() {
  draftSeq += 1;
  return { id: `n${draftSeq}`, name: '', userId: null };
}

/** Only the slots that carry a real name. This is what gets shown; the empty
 *  slots exist for the ledger's benefit, not the reader's. */
export function namedCrew(crew) {
  return (crew || []).filter((c) => c?.name?.trim());
}

/**
 * The crew as one line: "Sofie, Jonas and Anna".
 *
 * Intl.ListFormat conjugates the list in the reader's own language, which is
 * six locale strings this does not have to carry. Older engines fall back to
 * commas, which reads fine and is never wrong, only plainer.
 */
export function crewLabel(crew, lang = 'en', max = 4) {
  const names = namedCrew(crew).map((c) => c.name.trim());
  if (!names.length) return '';
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  let line;
  try {
    // Bare 'en' resolves to US English, which sets the Oxford comma. The rest
    // of Carta's copy is British ("traveller", "colour"), so the list should
    // read the same way.
    const loc = lang === 'en' ? 'en-GB' : lang;
    line = new Intl.ListFormat(loc, { style: 'long', type: 'conjunction' }).format(shown);
  } catch {
    line = shown.join(', ');
  }
  return rest > 0 ? `${line} +${rest}` : line;
}

/** Initials for an avatar stack, in crew order. Takes the first letter of the
 *  first and last word, so "Anna De Vries" reads AV and "Sofie" reads S. */
export function crewInitials(crew, max = 3) {
  return namedCrew(crew).slice(0, max).map((c) => {
    const words = c.name.trim().split(/\s+/);
    const first = words[0]?.[0] || '';
    const last = words.length > 1 ? words[words.length - 1][0] : '';
    return {
      id: c.id,
      name: c.name.trim(),
      initials: `${first}${last}`.toUpperCase() || '?',
    };
  });
}

/** How many people the crew names, for a count next to a heading. */
export function crewCount(crew) {
  return namedCrew(crew).length;
}
