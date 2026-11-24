/**
 * styleSeed.js: a trip's settings started from a travel style
 * (lib/travelStyles.js seedTripSettings, bound to this planner's own
 * normalize and markAnswered). Plain JS, so node tests can hold it.
 */
import { defaultSettings, markAnswered, normalizeSettings, WAYS } from './tripSettings.js';
import { seedTripSettings, STYLE_ANSWERS, normalizeStyle } from '../../lib/travelStyles.js';

const BIND = { normalize: normalizeSettings, markAnswered };

/** `s` with the style's answers in every place the traveller has not
 *  answered on a screen or in words (those always stay theirs). */
export function withStyle(s, style) {
  return style ? seedTripSettings(normalizeSettings(s), style, BIND) : s;
}

/** A new trip's settings: the defaults, then the active style's answers. */
export function newTripSettings(style) {
  return withStyle(defaultSettings(), style);
}

/**
 * The trip moved to another style: the answers the old style gave are
 * dropped back to the defaults first, so nothing of the old style lingers,
 * then the new style fills them. Answers the traveller gave themselves stay.
 */
export function switchTripStyle(s, style) {
  const d = defaultSettings();
  const styled = (s.answered || []).filter((id) => s.sources?.[id] === 'style');
  let next = { ...s, answered: (s.answered || []).filter((id) => !styled.includes(id)), sources: { ...(s.sources || {}) } };
  for (const id of styled) delete next.sources[id];
  const guide = { ...next.guide };
  const rhythm = { ...next.rhythm };
  if (styled.includes('g:shape')) { guide.shapes = d.guide.shapes; guide.shape = ''; }
  if (styled.includes('g:persona')) { guide.personas = []; guide.personaMost = ''; guide.persona = ''; guide.size = ''; guide.quiet = ''; }
  if (styled.includes('g:likes')) guide.likes = [];
  if (styled.includes('g:avoid')) guide.avoid = [];
  if (styled.includes('g:around')) guide.around = '';
  if (styled.includes('r:mornings')) rhythm.mornings = '';
  if (styled.includes('r:pace')) rhythm.pace = '';
  // The old style's trade-offs go with it; the new style seeds its own.
  next = normalizeSettings({ ...next, guide, rhythm, style: '', tradeoffs: null });
  return withStyle(next, style);
}

/**
 * The trip re-seeded from another style, or from none (G12 plan rethink,
 * build plan "style switch"): what the old style gave goes, the new style
 * fills it, and every answer the traveller gave (on a screen, in words, for
 * this trip, from Explore or the page the trip came from: any source but
 * 'style') stays. With no style the old style's party and priority go back
 * to the defaults too, so no trace of it prices the trip. The flow then
 * asks whatever the new style does not answer (flowGraph). Pure.
 */
export function restyleTrip(settings, style) {
  const s = normalizeSettings(settings);
  const st = style ? normalizeStyle(style) : null;
  if (st) return switchTripStyle(s, st);
  const d = defaultSettings();
  const styled = (s.answered || []).filter((id) => s.sources?.[id] === 'style');
  const out = switchTripStyle(s, null);
  return normalizeSettings({
    ...out,
    party: styled.includes('who') ? d.party : out.party,
    priority: styled.includes('priority') ? d.priority : out.priority,
  });
}

/** Which of the style's answers a trip still takes from its style (the rest are the traveller's). */
export function styleGiven(settings) {
  return STYLE_ANSWERS.filter((id) => settings?.answered?.includes(id) && settings.sources?.[id] === 'style');
}

/** The trip fields holdForTrip writes, by the planner's question id. */
const HOLD_FIELDS = { who: 'who', party: 'who', way: 'way', sleep: 'sleep', style: 'style' };

/**
 * One change made for this trip (G12 plan rethink decision §4, "one hold
 * mechanism"; decision 0011): the trip takes the value with source 'trip',
 * and the app's travel style is held (hooks/useTravelStyles.js hold), never
 * rewritten and never switched from inside Plan, so the header says
 * "Changed for now" with Keep and Back. `app` is the settings context (its
 * travelStyles and setters); without it only the trip changes, which keeps
 * this testable in node.
 *
 *   field  'style' (value: a style or its id; the trip is re-seeded from it,
 *          restyleTrip, and its stay half prices the trip, holdStyle),
 *          'who' (value: the party), 'way' (a way there), 'sleep' (a stay tier)
 *   -> the trip's new settings
 */
export function holdForTrip(settings, field, value, app = null) {
  const id = HOLD_FIELDS[field];
  if (!id) return settings;
  const ts = app?.travelStyles || null;
  if (id === 'style') {
    const st = typeof value === 'string' ? (ts?.list || []).find((x) => x.id === value) : value;
    if (value && !st) return settings;
    if (st && ts?.holdStyle) ts.holdStyle(st.id);
    else ts?.hold?.();
    return restyleTrip(settings, st || null);
  }
  // An unknown way changes nothing, so it holds nothing either.
  if (id === 'way' && !WAYS.includes(value)) return settings;
  ts?.hold?.();
  if (id === 'who') {
    const party = { ...settings.party, ...(value || {}) };
    app?.setPartyParts?.({ adults: party.adults, children: party.kids, babies: party.babies });
    return markAnswered(normalizeSettings({ ...settings, party }), 'who', 'trip');
  }
  if (id === 'way') {
    app?.setTransportMode?.(value);
    return markAnswered(normalizeSettings({ ...settings, way: value }), 'way', 'trip');
  }
  // The bed lives in the app's choices (tripSettings' header): the trip
  // marks the answer as its own, the price follows the held choices.
  if (typeof value === 'string' && value) app?.setChoices?.((prev) => ({ ...prev, stay_tier: value }));
  return markAnswered(settings, 'sleep', 'trip');
}
