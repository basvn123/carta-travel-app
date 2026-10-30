/**
 * tellChips.js, Tell Carta's chips as data (T858, plan flow v3 Batch B).
 *
 * The sentence is read as it is typed (lib/plan/parseTrip.js) and shown
 * under the field as chips: every answer the words or an earlier screen gave
 * as a selected chip, every setup question still open as a dashed chip. A
 * tap on a chip opens that question in a popover; what is saved there is the
 * traveller's own (an override, source 'screen') and the words never replace
 * it while they keep typing.
 *
 *   tellSettings(base, parsed, overrides) -> { settings, words, choices }
 *   tellChips(settings, parsed, opts)     -> [{ key, screen, missing, text }]
 *   openSetup(settings)                   -> the setup questions still open
 *
 * Pure, no React, so node tests hold it (tests/tellChips.test.mjs).
 */
import { applyTrip } from '../../lib/plan/parseTrip.js';
import { markAnswered, normalizeSettings, screenGiven } from './tripSettings.js';
import { setupScreens } from './flowGraph.js';

/** The settings each screen writes, so an override copies only its own. */
const OWN = {
  who: (o) => ({ party: o.party }),
  when: (o) => ({ when: o.when }),
  from: (o) => ({ from: o.from }),
  booked: (o) => ({ booked: o.booked }),
  priority: (o) => ({ priority: o.priority }),
  places: (o) => ({ places: o.places }),
};
const OWN_GUIDE = { 'g:likes': 'likes', 'g:budget': 'budget', 'g:weather': 'weather' };

/** The answers the words gave that the words may take back when they change. */
const WORD_IDS = ['who', 'when', 'from', 'booked', 'priority', 'g:likes', 'g:budget', 'g:weather', 'sleep', 'places'];

/**
 * The trip settings the field stands for right now: `base` (the settings
 * the screen opened with), then what the words give (never over an answer a
 * screen gave), then the popovers' own answers. An answer the earlier words
 * gave and the words no longer say is taken back, so deleting "in July"
 * opens When again.
 *
 *   -> { settings, words (ids the words answered), choices (stay tier, way) }
 */
export function tellSettings(base, parsed, overrides = {}) {
  const b = normalizeSettings(base);
  const keep = [...new Set([...screenGiven(b).filter((id) => id !== 'tell'), ...Object.keys(overrides)])];
  // The popovers' answers first too, so the words read against them (a
  // budget for the group is split over the party the traveller set).
  const mine = withOverrides(b, overrides);
  const { patch, answered, choices } = applyTrip(mine, parsed, { keep });
  let s = normalizeSettings({ ...mine, ...patch, guide: { ...mine.guide, ...(patch.guide || {}) } });
  // Take back what only the earlier words said.
  const stale = WORD_IDS.filter((id) => b.sources?.[id] === 'words' && !answered.includes(id) && !overrides[id]);
  if (stale.length) {
    const sources = { ...s.sources };
    for (const id of stale) delete sources[id];
    s = { ...s, answered: s.answered.filter((id) => !stale.includes(id)), sources, places: stale.includes('places') ? [] : s.places };
  }
  for (const id of answered) s = markAnswered(s, id, 'words');
  s = withOverrides(s, overrides);
  // A popover's Lifestyle is saved app-wide as it is changed; the words' stay and way stand down.
  const out = { ...choices };
  if (overrides.sleep) { delete out.stay_tier; delete out.transport_mode; }
  return { settings: s, words: answered.filter((id) => !overrides[id]), choices: out };
}

/** `s` with each popover's own answer copied in and marked the screen's. */
function withOverrides(s, overrides) {
  let out = s;
  for (const [id, o] of Object.entries(overrides)) {
    if (!o) continue;
    if (OWN[id]) out = normalizeSettings({ ...out, ...OWN[id](o) });
    else if (OWN_GUIDE[id]) out = normalizeSettings({ ...out, guide: { ...out.guide, [OWN_GUIDE[id]]: o.guide?.[OWN_GUIDE[id]] } });
    out = markAnswered(out, id, 'screen');
  }
  return out;
}

/** The setup questions this trip still asks (Tell itself aside), in order. */
export function openSetup(s) {
  return setupScreens(s).filter((id) => id !== 'tell' && !s.answered.includes(id));
}

const STAY_KEY = { dorm: 'stay.dorm', private: 'stay.private', room: 'stay.room', home: 'stay.home' };

/**
 * The chips, in the order a trip is told: where, when, how long, who, what
 * they like, from where, the budget, the bed and the way, what is booked,
 * what matters most; then the questions still open, dashed.
 *
 *   opts: { t, monthName(m), day(iso), money(eur), stayTier (the app's),
 *           way (the app's transport mode), choices (the words' stay and way) }
 */
export function tellChips(s, parsed, opts) {
  const { t, monthName = String, day = String, money = String, stayTier = '', choices = {} } = opts;
  const F = parsed?.fields || {};
  const done = new Set(s.answered);
  const out = [];
  const add = (key, screen, text) => { if (text) out.push({ key, screen, missing: false, text }); };

  for (const p of s.places || []) add(`place:${p.kind}:${p.id}`, 'places', p.name);
  if (done.has('when')) {
    const w = s.when;
    if (w.mode === 'exact' && w.start) add('when', 'when', w.end ? t('plan.dateRange', { a: day(w.start), b: day(w.end) }) : day(w.start));
    else if (w.mode === 'months' && w.months.length) add('when', 'when', w.months.map(monthName).join(', '));
    else if (w.mode === 'any') add('when', 'when', t('pf.when.any'));
    else if (w.mode === 'unsure') add('when', 'when', t('pf.when.unsure'));
  }
  const nightsSaid = F.nights || (done.has('when') && s.when.mode !== 'exact');
  if (nightsSaid && !(s.when.mode === 'exact' && s.when.start && s.when.end)) {
    const n = s.when.nights;
    add('nights', 'when', t(n === 1 ? 'detail.nightsOne' : 'detail.nightsMany', { n }));
  }
  if (done.has('who')) {
    const p = s.party;
    const bits = [t(p.adults === 1 ? 'plan.partyAdultOne' : 'plan.partyAdultMany', { n: p.adults })];
    if (p.kids) bits.push(t(p.kids === 1 ? 'plan.partyChildOne' : 'plan.partyChildMany', { n: p.kids }));
    if (p.babies) bits.push(t(p.babies === 1 ? 'plan.partyBabyOne' : 'plan.partyBabyMany', { n: p.babies }));
    add('who', 'who', bits.join(', '));
  }
  if (done.has('g:likes')) for (const k of s.guide.likes) add(`like:${k}`, 'g:likes', t(`pf.like.${k}`));
  if (done.has('from') && s.from?.name) add('from', 'from', t('pf.chip.from', { town: s.from.name }));
  if (done.has('g:budget') && s.guide.budget.eur > 0) {
    const b = s.guide.budget;
    const said = s.sources?.['g:budget'] === 'words' ? F.budget?.value : null;
    const people = s.party.adults + s.party.kids;
    if (said && said.per === 'group' && said.unit === 'trip' && people > 1) add('budget', 'g:budget', t('pf.chip.budgetGroup', { eur: money(said.eur), n: people }));
    else add('budget', 'g:budget', t(b.kind === 'day' ? 'pf.chip.budgetDay' : 'pf.chip.budgetPerson', { eur: money(b.eur) }));
  }
  const tier = choices.stay_tier || (done.has('sleep') ? stayTier : '');
  if (tier) add('stay', 'sleep', /^hotel[2-5]$/.test(tier) && tier !== 'hotel3'
    ? t('pf.chip.hotel', { stars: t(`stay.stars${tier.slice(5)}`) })
    : t(STAY_KEY[tier] || 'stay.hotel'));
  if (choices.transport_mode && choices.transport_mode !== 'any') add('way', 'sleep', t(`way.${choices.transport_mode}`));
  if (done.has('booked')) {
    const on = ['flights', 'stays', 'car', 'tickets'].filter((k) => s.booked[k]);
    if (!on.length) add('booked', 'booked', t('pf.chip.bookedNone'));
    for (const k of on) add(`booked:${k}`, 'booked', t(`pf.chip.booked.${k}`));
  }
  if (done.has('priority')) add('priority', 'priority', t(`pf.o.${s.priority}`));
  if (done.has('g:weather') && s.guide.weather && s.guide.weather !== 'any') add('weather', 'g:weather', t(`pf.o.${s.guide.weather}`));

  for (const id of openSetup(s)) out.push({ key: `ask:${id}`, screen: id, missing: true, text: t(`pf.chip.ask.${id}`) });
  return out;
}
