/* eslint-disable react-refresh/only-export-components -- small helpers shared across the app */
import { FamilyIcon, FriendsIcon, HeartIcon, PersonIcon } from '../../components/Icons.jsx';
import { partyText } from '../../lib/party.js';
import { QUESTIONS } from '../../planner/flow/questions.js';
import { summaryParts } from '../../lib/travelStyles.js';
import { styleDayEur } from '../../lib/price/styleDay.js';
import { useMemo } from 'react';

/** The glyph of a style, from who comes: it is how travellers name them. */
export const WHO_ICONS = { solo: PersonIcon, couple: HeartIcon, friends: FriendsIcon, family: FamilyIcon, group: FriendsIcon };
export const styleIcon = (style) => WHO_ICONS[style?.who?.kind] || PersonIcon;

/** A style's name: the one the traveller typed, else its template's. */
export function styleName(t, style) {
  if (!style) return '';
  return style.name || (style.nameKey ? t(style.nameKey) : t('styles.mine'));
}

/** A style's one line: the head count, the bed, the trip shape. */
export function styleSummary(t, style) {
  return summaryParts(style).map((p) => (p.party ? partyText(t, p.party) : t(p.key))).filter(Boolean).join(', ');
}

/** The label of a planner option, read from the question it answers, so a
 *  style says each thing in the planner's own words. */
export function optLabel(t, qid, value) {
  const o = QUESTIONS[qid]?.options?.find((x) => x.value === value);
  return o?.labelKey ? t(o.labelKey) : '';
}

/** Each style's day figure (bed and food, one person, euros) by id, from
 *  styleDayEur. One memo for the overview, the dock and the filter switcher. */
export function useStyleFigures(list, destinations) {
  const key = (list || []).map((x) => JSON.stringify([x.id, x.who, x.stay, x.lifestyle])).join('|');
  return useMemo(() => {
    const m = new Map();
    for (const x of list || []) m.set(x.id, styleDayEur(x, destinations));
    return m;
  }, [key, destinations]); // eslint-disable-line react-hooks/exhaustive-deps -- key stands for the list's priced parts
}

