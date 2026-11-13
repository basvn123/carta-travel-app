/**
 * styleSeed.js: a trip's settings started from a travel style
 * (lib/travelStyles.js seedTripSettings, bound to this planner's own
 * normalize and markAnswered). Plain JS, so node tests can hold it.
 */
import { defaultSettings, markAnswered, normalizeSettings } from './tripSettings.js';
import { seedTripSettings } from '../../lib/travelStyles.js';

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
  if (styled.includes('g:persona')) { guide.personas = []; guide.personaMost = ''; guide.persona = ''; }
  if (styled.includes('g:likes')) guide.likes = [];
  if (styled.includes('g:avoid')) guide.avoid = [];
  if (styled.includes('g:around')) guide.around = '';
  if (styled.includes('r:mornings')) rhythm.mornings = '';
  if (styled.includes('r:pace')) rhythm.pace = '';
  next = normalizeSettings({ ...next, guide, rhythm, style: '' });
  return withStyle(next, style);
}
