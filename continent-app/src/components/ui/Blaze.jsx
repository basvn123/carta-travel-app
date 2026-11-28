/*
 * Blaze (G1, house style 2026-11, DESIGN.md "Signature graphics"): the
 * waymark painted on a rock or a post. A white halo, a square umber paint
 * stripe, a short ink heel under its right end. It means "chosen" or "here"
 * and nothing else: the current tab, the chosen pin, a sheet grip, the
 * wordmark slot, the relief cut. Never on section headings, never inside a
 * rank plate, never as decoration.
 *
 *   <Blaze />                     24 x 14, painted
 *   <Blaze size="sm" />           16 x 10 (tabs, chips)
 *   <Blaze size="lg" />           40 x 22 (empty states, the missing photo)
 *   <Blaze state="rest" />        stripe at 25 % (an unchosen option)
 *   <Blaze state="blank" />       dashed stripe ("Not yet")
 *   <Blaze kind="trails" />       a kind's paint (trails, beaches, lakes, mountains, cycling)
 *
 * Decorative: always aria-hidden; the control around it carries the meaning.
 */
import React from 'react';

export function Blaze({ size = 'md', state = 'painted', kind, className = '' }) {
  const cls = ['hs-blaze', `blaze-${size}`, state !== 'painted' ? `is-${state}` : '', className]
    .filter(Boolean).join(' ');
  return <span className={cls} data-kind={kind || undefined} aria-hidden="true" />;
}
