import React from 'react';
import { LoadingBlock } from '../../components/StateBlocks.jsx';
import { prefersReducedMotion } from '../../lib/motion.js';
import { ExploreMap, DRAWER_MAX } from './exploreMapLazy.js';
import { MapPlacePanel } from '../MapPlacePanel.jsx';
import { MapSheet } from './MapSheet.jsx';
import { MapTapCard } from './MapTapCard.jsx';
import { ExploreRails } from '../ExploreRails.jsx';
import { EmptyResult } from '../EmptyResult.jsx';
import { Blaze, Button } from '../../components/ui/index.js';
import { ExploreCard } from './ExploreCard.jsx';
import { MapAnchorCard } from './MapAnchorCard.jsx';
import { QuickChips } from '../filters/QuickChips.jsx';
import { badgeCount, mapRowChips } from './chipRules.js';
import { useSettings } from '../../components/SettingsLine.jsx';
import { useSummaryItems } from '../band/SummaryChips.jsx';
import { useMedia } from '../settings/settingsBits.jsx';
import { priceFigure } from '../../lib/settings/prices.js';
import '../../styles/86-map-view.css';

// G12 map view: what floats over the map, so no pin sits under it (the
// band's field and chip row on a phone, the List pill, the tap card, the
// sheet, the heart).
const MAP_CHROME = [
  '.band.is-map .band-row', '.band.is-map .band-strip', '.band.is-map .band-quick', '.xmap-listpill', '.xmap-tapcard',
  '.xsheet:not(.is-closed)', '.corner-slot--left', '.xmap-quick', '.xmap-anchor-card',
].join(', ');
// G12 map view round 2 (proposal.md 8): the list column and the anchored
// card from this width; under it (a tablet held upright, 820) the map keeps
// the phone's model, the List pill, the sheet and the tap card, inside the
// map's frame (86-map-view.css).
const MAP_SPLIT = '(min-width: 1024px)';
// The sheet and the column list at most this many places for All.
const ALL_MAX = 120;

// The List or Map switch is a route change (DESIGN.md "Route"): the content
// rises in once on the traveller's own switch, never at first paint, and the
// map stays mounted (T441), so the class is added, not a remount.
// Reflow (DESIGN.md "Primitives"): after the traveller's own sort or
// filter, rows that stay glide from where they were on the settle curve and
// rows that arrive fade in. Only while 24 rows or fewer are on screen, no
// per-row stagger, nothing at first paint, nothing under reduced motion.
// Positions are read from offsetTop, so a scroll between renders never
// reads as a move.
const GLIDE_MAX = 24;
function useReflowGlide(ref, ids) {
  const prev = React.useRef(null);
  const key = ids.join('|');
  React.useLayoutEffect(() => {
    const list = ref?.current?.querySelector('.xrows--ledger');
    if (!list) return;
    const rows = [...list.children].filter((el) => el.dataset && el.dataset.id);
    const now = new Map(rows.map((el) => [el.dataset.id, el.offsetTop]));
    const before = prev.current;
    prev.current = now;
    if (!before || prefersReducedMotion() || typeof rows[0]?.animate !== 'function') return;
    const vh = window.innerHeight;
    const seen = rows.filter((el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < vh; });
    if (!seen.length || seen.length > GLIDE_MAX) return;
    const css = getComputedStyle(document.documentElement);
    const settle = { duration: parseFloat(css.getPropertyValue('--dur-settle')) || 400, easing: css.getPropertyValue('--ease-settle').trim() || 'ease-out' };
    const fade = { duration: parseFloat(css.getPropertyValue('--dur-2')) || 200, easing: 'ease-out' };
    for (const el of seen) {
      const was = before.get(el.dataset.id);
      if (was == null) { el.animate([{ opacity: 0 }, { opacity: 1 }], fade); continue; }
      const dy = was - now.get(el.dataset.id);
      if (Math.abs(dy) >= 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], settle);
    }
  }, [ref, key]);
}

function useRouteIn(ref, view) {
  const last = React.useRef(view);
  React.useEffect(() => {
    if (last.current === view) return undefined;
    last.current = view;
    const el = ref?.current;
    if (!el) return undefined;
    el.classList.remove('hs-route-in');
    void el.offsetWidth;
    el.classList.add('hs-route-in');
    // Only the content's own animation ends the route class; a child's pop
    // or settle bubbling up must not cut it short.
    const done = (e) => { if (e.target === el) el.classList.remove('hs-route-in'); else el.addEventListener('animationend', done, { once: true }); };
    el.addEventListener('animationend', done, { once: true });
    return () => el.removeEventListener('animationend', done);
  }, [ref, view]);
}

export function ExploreContent({
  guidedRows, isActiveMap, lang, allRows, anyActive, cardLinkId, catalogueFull = true, chips, contentRef, costIndex, dxf, emptyLine, favSet,
  gridTotal, isActive, isDesktop, lastChip, listed, locationQuery, mapOpened, mapTop,
  onMapNeedDetail, onMapViewport, onPick, onPinLink, onToggleFav, openPlace, overviewOf, rowOverviewOf = overviewOf,
  pageOver, pending, pickedId, pickedRow, pinLinkId, pins, railLead, railMonth, rails,
  railsIdle, reachMinutes, resetAll, roleFor, searchHits, selectedId, sentinelRef,
  setCardLinkId, setLocationQuery, setPickedId, setShowFavOnly, setView, showFavOnly,
  shownRows, t, taxRows, view, viewSwitch, viewportMode, visible, xf, mapSort = null, quick = [],
}) {
  useRouteIn(contentRef, view);
  // G12 map view round 2: the best value in view (its row says so, as its
  // pin's saffron dot does), the price basis in words, the neighbours of the
  // picked place in the list's order (the tap card's swipe).
  const model = useSettings()?.model || null;
  const bestId = React.useMemo(() => {
    if (view !== 'map') return '';
    let best = null; let eur = Infinity;
    for (const p of shownRows) {
      const e = priceFigure({ cost: p.cost }, model || {}).eur;
      if (Number.isFinite(e) && e < eur) { eur = e; best = p.id; }
    }
    return best || '';
  }, [shownRows, model, view]);
  const mapSplit = useMedia(MAP_SPLIT);
  const summary = useSummaryItems();
  const basis = summary.find((it) => it.step === 'prices')?.text || '';
  const mapList = guidedRows || taxRows;
  const inView = pickedRow ? shownRows.some((p) => p.id === pickedRow.id) : false;
  const ring = inView ? shownRows : mapList;
  const at = pickedRow ? ring.findIndex((p) => p.id === pickedRow.id) : -1;
  const prevRow = at > 0 ? ring[at - 1] : null;
  const nextRow = at >= 0 && at < ring.length - 1 ? ring[at + 1] : null;
  const zoomOut = () => {
    const m = document.querySelector('.xcontent-map .xmap-canvas')?._cartaMap;
    m?.easeTo({ zoom: Math.max(3, m.getZoom() - 1.5), duration: prefersReducedMotion() ? 0 : 420 });
  };
  const anchorCard = mapSplit && view === 'map' && pickedRow ? (
    <MapAnchorCard t={t} p={pickedRow} overview={overviewOf(pickedRow)}
      fav={favSet.has(pickedRow.id)} onToggleFav={onToggleFav}
      onOpen={openPlace} onClose={() => onPick(null)} />
  ) : null;
  useReflowGlide(contentRef, listed.map((p) => p.id));
  // Judgement-6: with only quick filters on, the applied row above the map
  // is not drawn (they show checked in the quick row), so Clear all ends the
  // quick row instead; with any other filter on it stays in that row.
  const clearOnQuick = isDesktop && view === 'map' && badgeCount(chips) > 0 && mapRowChips(chips, quick).length === 0;
  return (
    <div className={`xcontent ${view === 'map' ? 'xcontent--split' : ''}`.trim()} ref={contentRef}
      style={mapTop != null ? { '--xmap-top': `${mapTop}px` } : undefined}>
      {/* The map comes before the endless list in the DOM and CSS puts
          it in the right column (T190): the keyboard reaches the map the
          reader just asked for straight after the control bar, instead of
          after every card of an infinitely scrolling list, which on a long
          list meant never. Inside the map's frame the column (at most
          DRAWER_MAX rows) and the quick row come first (judgement-6). */}
      {/* Kept mounted after its first open (T441), hidden while the list
          shows, so switching back is instant instead of a rebuild. */}
      {mapOpened && (
        <div className="xcontent-map" hidden={view !== 'map'}>
          {/* T592 (owner decision 6): the map the Kayak way. On a
              desktop the panel floats on the left over the map: the
              places on the map, or the picked one with its trip box.
              G12 map view: a 400 px column of compact cards beside the
              map, a card under the pointer lifting its pin and a pin
              under the pointer outlining its card. Its head names no
              basis: the settings line above says it, every row too.
              It comes before the map in the DOM, the grid
              placing it, so Tab reaches the list before the pins
              (judgement-6). */}
          {mapSplit && view === 'map' && (
            <MapPlacePanel t={t}
              rows={shownRows.slice(0, DRAWER_MAX)} count={shownRows.length}
              allRows={mapList.slice(0, ALL_MAX)} allCount={mapList.length}
              sort={mapSort} bestId={bestId}
              picked={null} overviewOf={overviewOf}
              onPick={onPick} onBack={() => setPickedId(null)} onOpen={openPlace}
              favSet={favSet} onToggleFav={onToggleFav}
              linkedId={pinLinkId} onLink={setCardLinkId} pickedId={pickedId} />
          )}
          {/* G12 map view round 2: the quick filters on the map's top edge
              (desktop); on a phone they are the band's third row. */}
          {isDesktop && view === 'map' && (
            <QuickChips className="xmap-quick" withFilters={false} showClear={clearOnQuick} />
          )}
          {/* While maplibre downloads, the frame the map will fill is
              already drawn at its final size: a skeleton, not the app's
              full-screen pulse, so nothing jumps when the canvas lands. */}
          <React.Suspense fallback={(
            <div className="xmap xmap-skel">
              <LoadingBlock label={t('explore.mapLoading')} rows={1} shape="card" />
            </div>
          )}>
            {/* `all` is the list's own catalogue before the filters,
                airport gateways merged into one place (T441: the raw
                data drew three Paris dots, labelled "Paris (CDG)"). The
                map serialises it once and filters by id (P4.5). */}
            {/* G12 map view: the rows in the list's own order rank the
                pins (a pill for the best-ranked that fit); the floating
                chrome named here keeps every pin clear of it; only a new
                search moves the camera. */}
            <ExploreMap rows={guidedRows || taxRows} all={allRows} pins={viewportMode ? pins : null}
              onSelect={openPlace} onViewport={onMapViewport}
              onNeedDetail={onMapNeedDetail} t={t}
              ringId={cardLinkId} onPinLink={onPinLink} costs={costIndex}
              onBack={() => setView('grid')} visible={view === 'map'}
              framed={anyActive || searchHits != null}
              pickedId={pickedRow ? pickedRow.id : null} onPick={onPick}
              zoomAt="bottom-right" fitKey={searchHits != null ? locationQuery || '' : ''}
              chrome={MAP_CHROME} cornerInMap pickCard={anchorCard} />
          </React.Suspense>
          {/* G12 map view (phone, and a tablet under 1024): the map is the page; the list is a
              sheet the List pill opens, a picked place a card over the
              map. Both mount only while this tab shows the map. */}
          {!mapSplit && view === 'map' && isActiveMap && (
            <MapSheet t={t} lang={lang}
              rows={shownRows.slice(0, DRAWER_MAX)} count={shownRows.length}
              allRows={mapList.slice(0, ALL_MAX)} allCount={mapList.length}
              pickedId={pickedId} overviewOf={overviewOf} onPick={onPick}
              favSet={favSet} onToggleFav={onToggleFav} sort={mapSort}
              basis={basis} bestId={bestId} onZoomOut={zoomOut}
              listSwitch={viewSwitch('xsheet-view')} />
          )}
          {!mapSplit && view === 'map' && isActiveMap && pickedRow && (
            <MapTapCard t={t} p={pickedRow} prev={prevRow} next={nextRow} overviewOf={overviewOf}
              fav={favSet.has(pickedRow.id)} onToggleFav={onToggleFav} onPick={onPick}
              onOpen={openPlace} onClose={() => onPick(null)} />
          )}
        </div>
      )}
      <div className="xcontent-main">
        {/* T1030 (owner): Viantra's own trips is Plan's page only; Explore
            no longer carries its own block or list. */}
        {/* The rails' doors, Show all places and the map toggle moved to
            the head block (T595); the rails draw no doors of their own. */}
        {railsIdle && (
          <ExploreRails rails={rails} onSelect={openPlace} t={t}
            favorites={favSet} onToggleFav={onToggleFav}
            month={xf.month || railMonth}
            lead={railLead} hideDoors full={catalogueFull}
            /* H12 (T1105): eager only while the rails are on screen; the
               tab stays mounted under Home and under a page over it. */
            eager={isActive && !pageOver} />
        )}

        {gridTotal === 0 && (
          /* House style 2026-11: the dashed blaze, "the path is waiting",
             marks the empty state (DESIGN.md "States"). */
          <Blaze size="lg" state="blank" className="xempty-mark" />
        )}
        {gridTotal === 0 && (
          /* One empty block for every category and the library (T498,
             roadmap 1.3b F; V3 T383 before it): the sentence names what
             emptied the list, one button changes it, Clear all beside
             it once two or more filters are on. An empty shortlist
             offers the way back. */
          <EmptyResult
            className="explore-count xempty"
            line={emptyLine}
            action={showFavOnly
              ? { label: t('explore.showAll'), onClick: () => setShowFavOnly(false) }
              : locationQuery
                ? { label: t('results.clearSearch'), onClick: () => setLocationQuery('') }
                : lastChip
                  ? { label: t('explore.removeFilter', { filter: lastChip.label }), onClick: lastChip.remove }
                  : null}
            onClearAll={!showFavOnly && !locationQuery && lastChip && chips.length > 1 ? resetAll : null}
            clearLabel={t('filter.clearAll')}
          >
            {locationQuery && searchHits?.suggestions?.length > 0 && (
              <span className="xsearch-suggest">
                {t('explore.didYouMean')}
                {searchHits.suggestions.map((sug) => (
                  <Button key={sug} variant="quiet" size="sm"
                    onClick={() => setLocationQuery(sug)}>{sug}</Button>
                ))}
              </span>
            )}
          </EmptyResult>
        )}

        {/* House style 2026-11 (the walker's table): the places as rows.
            G12 (owner, 2026-11-17): no column head over them any more; each
            figure says its own unit and the dates live in the Trip dock. */}
        {/* G12, D10 (lane 1, round 5): on the overview the list is hidden
            (84-explore-overview.css), so its rows are not drawn there: the
            48 hidden rows were redrawn on every re-price for nobody. */}
        <div className={`xrows xrows--ledger${pending ? ' is-pending' : ''}`} aria-busy={pending || undefined}>
          {!railsIdle && listed.map((p) => (
            <ExploreCard
              key={p.id}
              p={p}
              role={roleFor(p)}
              selected={p.id === (pickedId || selectedId)}
              fav={favSet.has(p.id)}
              onSelect={openPlace}
              onToggleFav={onToggleFav}
              t={t}
              reachMin={reachMinutes?.get(p.id) ?? null}
              linked={view === 'map' && p.id === pinLinkId}
              onLink={view === 'map' ? setCardLinkId : null}
              month={dxf.month}
              {...rowOverviewOf(p)}
            />
          ))}
        </div>

        {visible < gridTotal && (
          <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
        )}
      </div>
    </div>
  );
}
