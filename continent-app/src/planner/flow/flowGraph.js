/**
 * flowGraph.js, which screen comes next in the trip planner (T653).
 *
 * The planner is a short run of one-question screens, then the planning
 * itself, then an optional run about the days. Which screens a trip gets
 * depends on its answers, mostly on what is already booked:
 *
 *   setup     tell (free text and files, skippable), booked, who, sleep, priority, when, from, way, airports
 *             (when, from and the way there drop out when bookings fix them; airports
 *             only when the way there may fly, T860), then create
 *   doors     guide me / I know where / a ready trip       (not when stays are
 *             booked: the places are already chosen)
 *   guide     shape, likes, weather, reach, avoid, budget, pick (the explorative
 *             path, only behind "guide me"), then trips: the loader and the
 *             priced trips the answers lead to (TF2, T797), the one screen
 *             of the run that is not a question
 *   plan      the planning engine's own steps by name, from wizardSteps
 *             (Where, Trips or Stay, Stays, From, Getting, Finish) without the
 *             Booked and When steps the setup already asked
 *   days      days?, then the day rhythm, then guide or plan yourself
 *
 * Every function is pure: same settings in, same screen list out. Screen ids
 * are strings: 'booked', 'g:likes', 'p:Where', 'r:pace' and so on.
 */
import { wizardSteps } from '../wizard/wizardSteps.js';
import { datesFromBookings } from './tripSettings.js';

export const SETUP = ['tell', 'booked', 'who', 'sleep', 'priority', 'when', 'from', 'way', 'airports'];
/** T860: the ways there that may fly, so the airports in reach are asked. */
export const FLYING_WAYS = ['', 'any', 'plane'];
/** A trip already under way (T675): where the traveller is now and until
 *  when stand in for When and Where from; the way there is behind them. */
export const NOW_SETUP = ['tell', 'booked', 'who', 'sleep', 'priority', 'nowWhere', 'nowUntil'];
export const GUIDE = ['g:shape', 'g:likes', 'g:weather', 'g:reach', 'g:avoid', 'g:budget', 'g:pick', 'g:trips'];
/** The help-me-choose screen that answers rather than asks (T797). */
export const TRIPS_SCREEN = 'g:trips';
export const RHYTHM_SCREENS = ['r:mornings', 'r:pace', 'r:detail', 'r:goal', 'r:food', 'r:around'];
export const DOORS = ['guide', 'know', 'ready'];

/** The setup questions this trip is asked, in order. */
export function setupScreens(s) {
  if (s.kind === 'now') return NOW_SETUP;
  return SETUP.filter((id) => {
    if (id === 'when') return !datesFromBookings(s);
    if (id === 'from' || id === 'way') return !s.booked.flights;
    if (id === 'airports') return !s.booked.flights && FLYING_WAYS.includes(s.way || '');
    return true;
  });
}

/** Whether the "how do you want to choose?" doors are shown. With stays
 *  booked the places are known, so planning goes straight to the stays. */
export function hasDoors(s) {
  return !s.booked.stays;
}

/**
 * The help-me-choose screens, the questions then the trips. Reach is moot
 * when flights are booked (they decide where the trip starts). T859: with
 * places named, the questions that choose where are moot too: the weather
 * and how far, and with a town named also what they like (the towns are
 * chosen). How the trip moves, what to avoid and the budget stay.
 */
export const WHERE_QUESTIONS = ['g:weather', 'g:reach'];
export function guideScreens(s) {
  const places = Array.isArray(s.places) ? s.places : [];
  const town = places.some((p) => p.kind === 'place');
  return GUIDE.filter((id) => {
    if (id === 'g:reach' && s.booked.flights) return false;
    if (places.length && WHERE_QUESTIONS.includes(id)) return false;
    if (town && id === 'g:likes') return false;
    return true;
  });
}

/** The help-me-choose questions alone, for the "3 of 7" position. */
export function guideQuestions(s) {
  return guideScreens(s).filter((id) => id !== TRIPS_SCREEN);
}

/** The planning engine's steps for this trip, prefixed 'p:'. */
export function engineScreens(s, door = 'know') {
  const buildMode = door === 'ready' ? 'ready' : 'custom';
  return wizardSteps({ travel: s.booked.flights, stays: s.booked.stays }, buildMode)
    .filter((n) => n !== 'Booked' && n !== 'When')
    .map((n) => `p:${n}`);
}

/** Everything after the trip home: guide (when chosen) then the engine. */
export function planScreens(s, door = 'know') {
  const d = hasDoors(s) ? door : 'know';
  return [...(d === 'guide' ? guideScreens(s) : []), ...engineScreens(s, d)];
}

/** The days run: the question, the rhythm (answered ones skipped unless
 *  `all`), and the choice between Carta planning and planning yourself. */
export function dayScreens(s, { all = false } = {}) {
  const rhythm = RHYTHM_SCREENS.filter((id) => all || !s.answered.includes(id));
  return ['daysAsk', ...rhythm, 'daysHow'];
}

/** The whole run for one trip and door, start to finish. */
export function fullFlow(s, door = 'know') {
  return [...setupScreens(s), 'create', 'tripHome', ...(hasDoors(s) ? ['doors'] : []), ...planScreens(s, door), ...dayScreens(s)];
}

/** The screen after `id` in `list`, or null at the end. */
export function nextScreen(list, id) {
  const i = list.indexOf(id);
  return i >= 0 && i < list.length - 1 ? list[i + 1] : null;
}

/** The screen before `id` in `list`, or null at the start. */
export function prevScreen(list, id) {
  const i = list.indexOf(id);
  return i > 0 ? list[i - 1] : null;
}

/** Where `id` sits in `list`, for the step dots. */
export function progressOf(list, id) {
  const i = list.indexOf(id);
  return { index: i < 0 ? 0 : i, total: list.length };
}

/** The first setup question not answered yet, or 'create' when all are. */
export function firstOpenSetup(s) {
  return setupScreens(s).find((id) => id !== 'tell' && !s.answered.includes(id)) || 'create';
}
