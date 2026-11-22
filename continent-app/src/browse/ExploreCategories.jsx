import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Segmented, Tabs, Tile, TileGroup } from '../components/ui/index.js';
import { HouseIcon } from '../components/HouseIcons.jsx';
import { useIsDesktop } from '../hooks/useIsDesktop.js';

/**
 * What Explore holds, as six kit tiles (T498, roadmap 1.3b A; replaces the
 * T496 row of link pills). Places is the catalogue Explore opens on (owner
 * T489-h); the five after it are the outdoor layers that used to be the
 * Destinations tab. Six is the most carta-design allows on a phone, so the
 * trip library is a row on Places, not a seventh tile (owner T484-e).
 *
 * Tab semantics (the six swap the view below in place, arrow keys move
 * between them); the one on screen in the selected tint with its tick.
 * Three across on a phone (the 2 x 3 grid), two across in the desktop side
 * panel.
 *
 * T586 (Explore v6, owner decision 7: the category choice leaves the filter
 * pane): `variant="row"` draws the same six kit tiles as one row of pills,
 * icon beside the word, at the top of Explore's content. The row scrolls
 * sideways on a phone; the selected one keeps the tint and its tick.
 *
 * T601 (Explore v8, owner 2026-10-22: "more hierarchy"): the row is drawn
 * as the kit Tabs, level 2 under the search: icon over nothing, icon beside
 * the word, --text-2 at rest, the current one --text with the 2 px brown
 * underline on the row's hairline. Same props; every tab that passes
 * variant="row" gets the same look. Arrow keys, Home and End move and
 * choose, as the kit Tabs do.
 */
// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
export const EXPLORE_TILES = [
  { key: 'places', labelKey: 'places.catPlaces', Icon: HouseIcon.places },
  { key: 'trails', labelKey: 'places.catTrails', Icon: HouseIcon.trails },
  { key: 'beaches', labelKey: 'places.catBeaches', Icon: HouseIcon.beaches },
  { key: 'lakes', labelKey: 'places.catLakes', Icon: HouseIcon.lakes },
  // "Peaks" on a phone only (G12, owner 2026-11-18): six words in one row
  // at 360 px, German and French too, without cutting a word.
  { key: 'mountains', labelKey: 'places.catMountains', shortKey: 'band.peaks', Icon: HouseIcon.mountains },
  { key: 'cycling', labelKey: 'places.catCycling', Icon: HouseIcon.cycling },
];

// Keys that move between tabs (the kit Tabs' own).
const MOVE_KEYS = new Set(['ArrowRight', 'ArrowLeft', 'Home', 'End']);

/** After a keyboard move the chosen tab's view can mount anew (Places and
 *  the layers are two tabs of the app, each with its own row; on a phone
 *  the band's row learns the new tab a moment later), so focus follows the
 *  chosen tab for a few frames wherever its row is drawn (fixes r1 B2). */
function focusTabSoon(key) {
  if (typeof document === 'undefined') return;
  let n = 0;
  const step = () => {
    const btn = [...document.querySelectorAll(`.xcats-tab[data-cat="${key}"]`)]
      .map((el) => el.closest('[role="tab"]'))
      .find((b) => b && b.getAttribute('aria-selected') === 'true' && b.getClientRects().length > 0);
    if (btn && document.activeElement !== btn) btn.focus({ preventScroll: true });
    if (++n < 30) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function ExploreCategories({ current, onPick, columns = 3, panelId, className = '', variant = 'grid', view, onView, onViewIntent, end = null }) {
  const row = variant === 'row';
  const { t } = useI18n();
  const isDesktop = useIsDesktop();
  const movedAt = React.useRef(0);
  const lineRef = React.useRef(null);
  const [more, setMore] = React.useState({ start: false, end: false });
  // A narrow window (769 to about 900 px, a long language) can hold fewer
  // tabs than six: the row then slides sideways, fades on a side that has
  // more, and brings the chosen tab into view, so no tab is cut without a
  // cue (owner: no cut text).
  React.useLayoutEffect(() => {
    const el = row && isDesktop ? lineRef.current?.querySelector('.xcats-row') : null;
    if (!el) return undefined;
    let gone = false;
    const read = () => {
      if (gone) return;
      const x = Math.abs(el.scrollLeft);
      const max = el.scrollWidth - el.clientWidth;
      setMore((m) => (m.start === x > 1 && m.end === max - x > 1 ? m : { start: x > 1, end: max - x > 1 }));
    };
    const reveal = () => {
      const tab = el.querySelector('[aria-selected="true"]');
      if (!tab || el.scrollWidth <= el.clientWidth + 1) { read(); return; }
      const a = tab.offsetLeft - el.offsetLeft; const b = a + tab.offsetWidth;
      const fade = 32;
      if (a - fade < el.scrollLeft) el.scrollLeft = Math.max(0, a - fade);
      else if (b + fade > el.scrollLeft + el.clientWidth) el.scrollLeft = b + fade - el.clientWidth;
      read();
    };
    reveal();
    document.fonts?.ready?.then(reveal);
    el.addEventListener('scroll', read, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(reveal) : null;
    ro?.observe(el);
    return () => { gone = true; el.removeEventListener('scroll', read); ro?.disconnect(); };
  }, [row, isDesktop, current, t]);
  if (row) {
    const tabs = (
      // Listens to the kit Tabs' own keys; the tabs are the controls.
      <div className="xcats-keys" style={{ display: 'contents' }}
        onKeyDownCapture={(ev) => { if (MOVE_KEYS.has(ev.key)) movedAt.current = Date.now(); }}>
      <Tabs label={t('places.sideBrowse')} value={current} panelId={panelId}
        className={`xcats xcats-row ${className}`.trim()}
        onChange={(key) => {
          if (key === current) return;
          if (Date.now() - movedAt.current < 400) focusTabSoon(key);
          onPick(key);
        }}
        tabs={EXPLORE_TILES.map(({ key, labelKey, shortKey, Icon }) => ({
          id: key,
          label: (
            <span className="xcats-tab" data-cat={key}>
              <span className="xcats-tab-icon" aria-hidden="true"><Icon size={20} /></span>
              <span className="xcats-tab-label">{t(!isDesktop && shortKey ? shortKey : labelKey)}</span>
            </span>
          ),
        }))} />
      </div>
    );
    if (!isDesktop) return tabs;
    // G12 round 2 (decision.md 6): on a desktop the row is one line with
    // the hairline under it, and the List | Map switch closes it at the
    // right when the tab passes `view` ('list' | 'map') and `onView(view)`;
    // `onViewIntent` runs on hover or focus (the map's prefetch). `end` (the
    // map's Share, judgement-5) stands just before the switch, so the switch
    // keeps its place between the list and the map.
    return (
      <div ref={lineRef} className={`xcats-line${more.start ? ' has-start' : ''}${more.end ? ' has-end' : ''}`}>
        {tabs}
        {(onView || end) && (
          <span className="xcats-end">
            {end}
            {onView && (
              <span className="xcats-view-wrap" onPointerEnter={onViewIntent} onFocus={onViewIntent}>
                <Segmented label={t('explore.viewAria')} size="sm" className="xcats-view"
                  value={view === 'map' ? 'map' : 'list'} onChange={onView}
                  options={[
                    { value: 'list', label: t('explore.viewList'), icon: <HouseIcon.list size={16} /> },
                    { value: 'map', label: t('explore.viewMap'), icon: <HouseIcon.map size={16} /> },
                  ]} />
              </span>
            )}
          </span>
        )}
      </div>
    );
  }
  return (
    <TileGroup kind="tabs" columns={columns} label={t('places.sideBrowse')}
      className={`xcats xrail-tiles ${className}`.trim()}>
      {EXPLORE_TILES.map(({ key, labelKey, Icon }) => (
        <Tile key={key} kind="tab" icon={<Icon size={20} />} selected={key === current}
          aria-controls={panelId} data-cat={key}
          onClick={() => { if (key !== current) onPick(key); }}>
          {t(labelKey)}
        </Tile>
      ))}
    </TileGroup>
  );
}
