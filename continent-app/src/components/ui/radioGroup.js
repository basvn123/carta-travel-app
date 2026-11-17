/*
 * The roving tab stop of a radio group, shared by ChipGroup and PlateGroup
 * (K6, K9). One radio in the group is in the tab order: the checked one, or
 * the first enabled one when none is checked (place judge 1: a group with no
 * pick had no tab stop at all). Arrow keys move and commit the pick; Home and
 * End go to the ends, as a native radio group does.
 */
import React from 'react';

const RADIOS = '[role="radio"]:not(:disabled):not([aria-disabled="true"])';

export function rovingStops(group) {
  if (!group) return;
  const items = [...group.querySelectorAll(RADIOS)];
  const on = items.find((el) => el.getAttribute('aria-checked') === 'true') || items[0];
  for (const el of group.querySelectorAll('[role="radio"]')) el.tabIndex = el === on ? 0 : -1;
}

/* Runs after every render of the group, so a pick made by the caller's state
   moves the stop with it. */
export function useRovingRadios(ref) {
  React.useLayoutEffect(() => { rovingStops(ref.current); });
}

export function radioGroupKeyDown(e) {
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll(RADIOS)];
  const i = items.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  const n = items.length;
  const j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1
    : (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + n) % n;
  items[j].focus();
  items[j].click();
}
