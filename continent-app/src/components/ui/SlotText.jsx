/*
 * SlotText (T1121, roadmap G2): a translated sentence with one node in its
 * slot, such as "From {price} a person a day" with the kit's Money where
 * {price} stands. The catalogue string is built with SLOT in place of the
 * figure; the node goes where SLOT lands. Before this the same helper was
 * written out three times (ExploreRails withNode, TripStylesRow and
 * JourneyCards withMoney). A sentence without SLOT shows as it is.
 *
 *   <SlotText text={t('rail.factFrom', { price: SLOT })}><Money value={42} /></SlotText>
 */
import React from 'react';
import { SLOT } from '../../lib/slot.js';

export function SlotText({ text, children }) {
  const at = typeof text === 'string' ? text.indexOf(SLOT) : -1;
  if (at < 0) return text;
  return <>{text.slice(0, at)}{children}{text.slice(at + SLOT.length)}</>;
}
