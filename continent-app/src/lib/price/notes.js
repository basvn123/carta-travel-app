// The price notes (T1114, ROADMAP D10; owner decision 2, 2026-11-05): the one
// rule for when a price says "few listings measured" under its bed figure and
// "not yet measured" for a part with no figure. Every screen that prices a
// place (Explore card, destination price card, Ask card, trip page, Plan
// receipt) asks this function and draws the answer with components/
// PriceNotes.jsx; none keeps a rule of its own. The notes never move a number.
import { bedIsThin, bedIsModelled, bedFallback, unmeasuredParts } from './display.js';

/**
 * @param {object|object[]|null} source one engine row (priceDay output, with
 *   `lines`) or a list of them (a trip's stops); null and rows without lines
 *   say nothing, so a card with no engine row stays quiet rather than guessing.
 * @returns {{thinBed:boolean, unmeasured:string[], modelledBed?:true, fallback?:{asked:string,tier:string}}} thinBed when any row's bed
 *   rests on few listings; unmeasured the part keys with no figure, once each.
 */
export function priceNotes(source) {
  const rows = (Array.isArray(source) ? source : [source]).filter((r) => r && Array.isArray(r.lines));
  const unmeasured = [];
  for (const r of rows) for (const k of unmeasuredParts(r)) if (!unmeasured.includes(k)) unmeasured.push(k);
  // modelledBed (REQ-data-2) and fallback (E3) are keys only when there is something to say.
  const fallback = rows.map(bedFallback).find(Boolean);
  return { thinBed: rows.some(bedIsThin), unmeasured, ...(rows.some(bedIsModelled) ? { modelledBed: true } : {}), ...(fallback ? { fallback } : {}) };
}

/** True when there is anything to say. */
export const hasPriceNotes = (n) => !!(n && (n.thinBed || n.modelledBed || n.fallback || n.unmeasured?.length));
