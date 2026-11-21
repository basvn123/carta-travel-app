import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { HeartIcon } from '../../components/Icons.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { useSettings } from '../../components/SettingsLine.jsx';
import { openStudio } from '../styles/studioDoors.js';
import { openSettings } from '../settings/settingsSheetStore.js';
import { settingsSummary } from '../../lib/settings/summary.js';

// lib/settings/summary.js names a few glyphs by what they show; the house
// set draws them under its own names.
const ALIAS = { plane: 'flight', flag: 'from' };

/** An item's glyph: a component, `heart` (the legacy heart, the style's one
 *  door, owner 2026-11-18) or a house glyph by name. The place receipt's
 *  chips (components/price/PriceSheet.jsx) draw the same. */
// eslint-disable-next-line react-refresh/only-export-components -- shared with the place receipt's chips
export function glyphOf(icon) {
  if (typeof icon === 'function') return icon;
  if (icon === 'heart') return HeartIcon;
  if (typeof icon !== 'string') return null;
  return HouseIcon[ALIAS[icon] || icon] || null;
}

/** The items to draw, read from settingsSummary (lib/settings; never re-derived
 *  here). */
// eslint-disable-next-line react-refresh/only-export-components -- read by the band's own test and the verify script
export function useSummaryItems() {
  const { t } = useI18n();
  const s = useSettings();
  const style = s?.travelStyles?.active || null;
  return React.useMemo(() => {
    if (!s) return [];
    try {
      const out = settingsSummary(s.model ?? s, style, t, { data: s.data || null });
      return Array.isArray(out) ? out.filter((it) => it && it.text) : [];
    } catch {
      // A summary that throws must not take the top of Explore with it.
      return [];
    }
  }, [s, style, t]);
}

/**
 * The settings in one line (G12, decision.md APPROVED): the style, the
 * start, when, the way and how prices read, each an icon and its full text,
 * no separators. Each opens Settings at its step; the style opens the Style
 * Studio. One sideways row on every width: on a phone it swipes with snap
 * and soft edge fades (the fades show only on a side with more to see), on
 * a desktop it fits and never moves. `lead` goes first in the same row
 * (the phone map view's Filters chip).
 */
// G12 map view round 2: `pinStyle` keeps the style chip out of the swipe, at
// the row's left, so it never scrolls away (owner, 2026-11-20: on the phone
// map the travel style must stay in view). Judgement-4: the pinned chip is
// one line like its neighbours; the no-style door says it short, a long
// style name ends in a fade (`is-cut`), the whole name in its title and its
// accessible name.
export function SummaryChips({ items, className = '', lead = null, pinStyle = false }) {
  const { t } = useI18n();
  const s = useSettings();
  const ts = s?.travelStyles;
  const changed = Boolean(ts?.active && (ts.changed || ts.held));
  const rowRef = React.useRef(null);
  const [edges, setEdges] = React.useState({ start: false, end: false });
  React.useEffect(() => {
    const el = rowRef.current;
    if (!el) return undefined;
    const read = () => {
      const max = el.scrollWidth - el.clientWidth;
      // Logical sides: in a right-to-left page scrollLeft runs negative.
      const x = Math.abs(el.scrollLeft);
      setEdges((p) => {
        const n = { start: x > 1, end: max - x > 1 };
        return p.start === n.start && p.end === n.end ? p : n;
      });
    };
    read();
    el.addEventListener('scroll', read, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    ro?.observe(el);
    return () => { el.removeEventListener('scroll', read); ro?.disconnect(); };
  }, [items.length]);

  const pinRef = React.useRef(null);
  const [pinCut, setPinCut] = React.useState(false);
  const chip = (it, pin = false) => {
    const Ico = glyphOf(it.icon);
    const isStyle = it.key === 'style';
    const text = pin && it.short ? it.short : it.text;
    const name = t('band.chipAria', { text: it.text }) + (isStyle && changed ? `. ${t('styles.kickerChanged')}` : '');
    return (
      <Pressable key={it.key}
        className={`band-chip${isStyle ? ' is-style' : ''}${pin && pinCut ? ' is-cut' : ''}`}
        data-band-step={isStyle ? 'style' : it.step || 'overview'}
        aria-label={name} title={pin ? it.text : undefined}
        onClick={() => (isStyle ? openStudio(ts) : openSettings({ step: it.step || 'overview' }))}>
        {Ico && <span className="band-chip-ic" aria-hidden="true"><Ico size={18} /></span>}
        <span className="band-chip-text" ref={pin ? pinRef : undefined}>{text}</span>
        {isStyle && changed && <span className="band-chip-dot" aria-hidden="true" />}
      </Pressable>
    );
  };
  const pinned = pinStyle ? items.find((it) => it.key === 'style') : null;
  const rest = pinned ? items.filter((it) => it !== pinned) : items;
  // Every render: the chip can mount anew (the row's shape changes when
  // the map view pins it), so an observer kept from an earlier one would
  // watch a node no longer on the page.
  React.useLayoutEffect(() => {
    const el = pinRef.current;
    if (!el) return undefined;
    let gone = false;
    const read = () => { if (!gone) setPinCut(el.scrollWidth > el.clientWidth + 1); };
    read();
    // The face arriving widens the words but not their capped box, which a
    // ResizeObserver never sees: read again once the fonts are in.
    document.fonts?.ready?.then(read);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    ro?.observe(el);
    ro?.observe(el.parentElement);
    return () => { gone = true; ro?.disconnect(); };
  });
  const row = (
    <div ref={rowRef}
      className={`band-chips${edges.start ? ' has-start' : ''}${edges.end ? ' has-end' : ''} ${className}`.trim()}
      role={pinned ? undefined : 'group'} aria-label={pinned ? undefined : t('band.chipsAria')}>
      {lead}
      {rest.map((it) => chip(it))}
    </div>
  );
  if (!pinned) return row;
  return (
    <div className="band-chips-pin" role="group" aria-label={t('band.chipsAria')}>
      {chip(pinned, true)}
      {row}
    </div>
  );
}
