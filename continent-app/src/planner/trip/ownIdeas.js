/**
 * The traveller's own ideas for a trip (T850, owner board panel 9: "let the
 * user add their own ideas"): anything in their own words, kept for later or
 * put on a trip day, in the trip extras (dayPlanStore, synced with the
 * account). And a day's plan in a few words (T851), the high-level way to
 * plan a day. Pure: each returns new extras.
 */
export const IDEA_MAX = 140;
export const NOTE_MAX = 400;

const clean = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);

export function addIdea(extras, text, { day = null, now = Date.now() } = {}) {
  const t = clean(text, IDEA_MAX);
  if (!t) return extras;
  const ideas = extras.ideas || [];
  return { ...extras, ideas: [...ideas, { id: `i${now.toString(36)}${ideas.length}`, text: t, day: day || null }] };
}

/** Put an idea on a day (a dayNum), or back to "for later" with null. */
export function setIdeaDay(extras, id, day) {
  return { ...extras, ideas: (extras.ideas || []).map((x) => (x.id === id ? { ...x, day: day || null } : x)) };
}

export function removeIdea(extras, id) {
  return { ...extras, ideas: (extras.ideas || []).filter((x) => x.id !== id) };
}

export function ideasOnDay(extras, day) {
  return (extras.ideas || []).filter((x) => x.day === day);
}

/** A day's plan in a few words; an empty text clears it. */
export function setDayNote(extras, day, text) {
  const t = clean(text, NOTE_MAX);
  const notes = { ...(extras.dayNotes || {}) };
  if (t) notes[day] = t; else delete notes[day];
  return { ...extras, dayNotes: notes };
}
