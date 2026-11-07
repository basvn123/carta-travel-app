import React from 'react';
import { LoadingBlock } from '../../components/StateBlocks.jsx';
import { ExploreMap, DRAWER_MAX } from './exploreMapLazy.js';
import { MapPlacePanel } from '../MapPlacePanel.jsx';
import { MapDrawer } from '../../components/MapDrawer.jsx';
import { ExploreRails } from '../ExploreRails.jsx';
import { EmptyResult } from '../EmptyResult.jsx';
import { Button } from '../../components/ui/index.js';
import { ExploreCard } from './ExploreCard.jsx';

export function ExploreContent({
  allRows, anyActive, cardLinkId, chips, contentRef, costIndex, drawer, dxf, emptyLine, favSet,
  gridTotal, isActive, isDesktop, lastChip, listed, locationQuery, mapOpened, mapTop,
  onMapNeedDetail, onMapViewport, onPick, onPinLink, onToggleFav, openPlace, overviewOf,
  pageOver, pending, pickedId, pickedRow, pinLinkId, pins, railLead, railMonth, rails,
  railsIdle, reachMinutes, resetAll, roleFor, searchHits, selectedId, sentinelRef,
  setCardLinkId, setDrawer, setLocationQuery, setPickedId, setShowFavOnly, setView, showFavOnly,
  shownRows, t, taxRows, view, viewSwitch, viewportMode, visible, xf,
}) {
  return (
    <div className={`xcontent ${view === 'map' ? 'xcontent--split' : ''}`.trim()} ref={contentRef}
      style={mapTop != null ? { '--xmap-top': `${mapTop}px` } : undefined}>
      {/* The map comes first in the DOM and CSS puts it in the right
          column (T190): the keyboard reaches the map the reader just
          asked for straight after the control bar, instead of after
          every card of an infinitely scrolling list, which on a long
          list meant never. */}
      {/* Kept mounted after its first open (T441), hidden while the list
          shows, so switching back is instant instead of a rebuild. */}
      {mapOpened && (
        <div className="xcontent-map" hidden={view !== 'map'}>
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
            <ExploreMap rows={taxRows} all={allRows} pins={viewportMode ? pins : null}
              onSelect={openPlace} onViewport={onMapViewport}
              onNeedDetail={onMapNeedDetail} t={t}
              ringId={cardLinkId} onPinLink={onPinLink} costs={costIndex}
              onBack={() => setView('grid')} visible={view === 'map'}
              framed={anyActive || searchHits != null}
              pickedId={pickedRow ? pickedRow.id : null} onPick={onPick}
              drawerState={!isDesktop && view === 'map' ? drawer : null} />
          </React.Suspense>
          {/* T592 (owner decision 6): the map the Kayak way. On a
              desktop the panel floats on the left over the map: the
              places on the map, or the picked one with its trip box.
              On a phone the same panel is the drawer's body; the strip
              holds the toggle back to the list. */}
          {isDesktop && view === 'map' && (
            <MapPlacePanel t={t}
              rows={shownRows.slice(0, DRAWER_MAX)} count={shownRows.length}
              picked={pickedRow} overviewOf={overviewOf}
              onPick={onPick} onBack={() => setPickedId(null)} onOpen={openPlace}
              favSet={favSet} onToggleFav={onToggleFav} />
          )}
          {!isDesktop && view === 'map' && (
            <MapDrawer
              className="xdrawer"
              state={drawer}
              onStateChange={setDrawer}
              ariaLabel={t('explore.drawerAria')}
              labels={{ strip: t('explore.drawerStrip'), half: t('drawer.half'), full: t('drawer.full') }}
              strip={viewSwitch('xview-strip')}
            >
              <MapPlacePanel t={t} compact
                rows={shownRows.slice(0, DRAWER_MAX)} count={shownRows.length}
                picked={pickedRow} overviewOf={overviewOf}
                onPick={onPick} onBack={() => setPickedId(null)} onOpen={openPlace}
                favSet={favSet} onToggleFav={onToggleFav} />
            </MapDrawer>
          )}
        </div>
      )}
      <div className="xcontent-main">
        {/* T1030 (owner): Carta's own trips is Plan's page only; Explore
            no longer carries its own block or list. */}
        {/* The rails' doors, Show all places and the map toggle moved to
            the head block (T595); the rails draw no doors of their own. */}
        {railsIdle && (
          <ExploreRails rails={rails} onSelect={openPlace} t={t}
            favorites={favSet} onToggleFav={onToggleFav}
            month={xf.month || railMonth}
            lead={railLead} hideDoors
            /* H12 (T1105): eager only while the rails are on screen; the
               tab stays mounted under Home and under a page over it. */
            eager={isActive && !pageOver} />
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

        <div className={`xrows xrows--cards${pending ? ' is-pending' : ''}`} aria-busy={pending || undefined}>
          {listed.map((p) => (
            <ExploreCard
              key={p.id}
              layout="card"
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
              {...overviewOf(p)}
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
