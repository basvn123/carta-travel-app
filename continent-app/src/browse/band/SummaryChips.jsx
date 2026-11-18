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
 *  door, owner 2026-11-18) or a house glyph by name. */
function glyphOf(icon) {
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
 * a desktop it fits and never moves.
 */
export function SummaryChips({ items, className = '' }) {
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

  return (
    <div ref={rowRef}
      className={`band-chips${edges.start ? ' has-start' : ''}${edges.end ? ' has-end' : ''} ${className}`.trim()}
      role="group" aria-label={t('band.chipsAria')}>
      {items.map((it) => {
        const Ico = glyphOf(it.icon);
        const isStyle = it.key === 'style';
        const name = t('band.chipAria', { text: it.text }) + (isStyle && changed ? `. ${t('styles.kickerChanged')}` : '');
        return (
          <Pressable key={it.key}
            className={`band-chip${isStyle ? ' is-style' : ''}`}
            data-band-step={isStyle ? 'style' : it.step || 'overview'}
            aria-label={name}
            onClick={() => (isStyle ? openStudio(ts) : openSettings({ step: it.step || 'overview' }))}>
            {Ico && <span className="band-chip-ic" aria-hidden="true"><Ico size={18} /></span>}
            <span className="band-chip-text">{it.text}</span>
            {isStyle && changed && <span className="band-chip-dot" aria-hidden="true" />}
          </Pressable>
        );
      })}
    </div>
  );
}
