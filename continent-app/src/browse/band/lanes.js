/*
 * The band's doors into the other Explore top lanes (G12, contract.md): the
 * Settings sheet (Lane 2), the summary helper (Lane 3) and the search panel
 * (Lane 4). Built in parallel, so each is found by glob: a part that has not
 * landed yet is simply absent and the band draws without it, instead of a
 * missing import breaking the build.
 */
import React from 'react';

const sheetMods = import.meta.glob('../settings/SettingsSheet.jsx');
const searchMods = import.meta.glob('../search/SearchPanel.jsx');
const summaryMods = import.meta.glob('../../lib/settings/*.js', { eager: true });

const lazyNamed = (mods, path, name) => (mods[path]
  ? React.lazy(() => mods[path]().then((m) => ({ default: m[name] || m.default })))
  : null);

/** Lane 2's sheet, or null until it lands. */
export const SettingsSheet = lazyNamed(sheetMods, '../settings/SettingsSheet.jsx', 'SettingsSheet');

/** Lane 4's search panel, or null until it lands. */
export const SearchPanel = lazyNamed(searchMods, '../search/SearchPanel.jsx', 'SearchPanel');

/** Lane 3's `settingsSummary(choices, style, t)`, or null until it lands. */
export const settingsSummary = Object.values(summaryMods)
  .map((m) => m?.settingsSummary).find((f) => typeof f === 'function') || null;
