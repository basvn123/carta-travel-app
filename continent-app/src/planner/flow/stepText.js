/**
 * The plan flow's steps as words (T893, the owner's plan flow studio board
 * 2026-10-30): the groups the step list shows on a wide screen, and each
 * step's answer as one short line for the list and Your trip so far.
 * Pure and node-runnable.
 */
import { QUESTIONS } from './questions.js';
import { formatMoney } from '../../lib/money.js';
import { partyText } from '../../lib/party.js';
import { personasOfRaw } from './tripSettings.js';

/** The help-me-choose questions in their groups, in order. */
export const GUIDE_GROUPS = [
  ['like', ['g:persona', 'g:shape', 'g:likes', 'g:weather']],
  ['practical', ['g:reach', 'g:around', 'g:avoid', 'g:budget']],
  ['last', ['g:pick', 'g:how']],
];

/** The groups that hold any of `ids`, each with its ids in the flow's order. */
export function groupsOf(ids) {
  return GUIDE_GROUPS
    .map(([key, list]) => ({ key, ids: ids.filter((id) => list.includes(id)) }))
    .filter((g) => g.ids.length);
}

/**
 * One step's answer as a short line, or '' when there is none to say.
 *   when   the trip's dates as words ({ start, end }, flowHooks whenText)
 */
export function stepAnswer(t, id, s, { when = null, locale } = {}) {
  const g = s.guide || {};
  switch (id) {
    case 'who':
      return partyText(t, { adults: s.party.adults, children: s.party.kids, babies: s.party.babies });
    case 'when':
      if (!when?.start) return '';
      return when.end ? t('plan.dateRange', { a: when.start, b: when.end }) : when.start;
    case 'from':
      return s.from?.name || '';
    case 'g:persona':
      return personasOfRaw(g).personas.map((v) => t(`pf.persona.${v}`)).join(', ');
    case 'g:likes':
      return (g.likes || []).map((v) => t(`pf.like.${v}`)).join(', ');
    case 'g:budget':
      if (!(g.budget?.eur > 0)) return '';
      return g.budget.per === 'group' && g.budget.groupEur > 0 ? formatMoney(g.budget.groupEur, { locale }) : formatMoney(g.budget.eur, { locale });
    default: {
      const q = QUESTIONS[id];
      if (!q?.read || !q.options) return '';
      const values = q.read(s) || [];
      return values
        .map((v) => q.options.find((o) => o.value === v))
        .filter(Boolean)
        .map((o) => t(o.labelKey))
        .join(', ');
    }
  }
}
