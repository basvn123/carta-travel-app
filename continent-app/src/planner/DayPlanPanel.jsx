import React, { useEffect, useRef, useState } from 'react';
import { PoiThumb } from './DayActivityRows.jsx';
import { isMustSee, poiKind, poiMapCat } from './dayDraft.js';
import { useI18n } from '../i18n/index.jsx';
import {
  PlusIcon, ShareIcon, MapPinIcon, DownloadIcon, RouteIcon, CalendarIcon,
  SparkIcon, StarIcon, MountainIcon, CheckIcon,
} from '../components/Icons.jsx';

/** Close a popover on outside click and on Escape. */
export function useDismiss(open, close) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

/** One stop of today's walk. Everything that is not the place itself was cut:
 *  no clock, no leg distance, no explanation of how you get there. The order
 *  is the information, and the map above draws the rest. */
function RouteStop({ item, n, last, flash, onMoveUp, onMoveDown, onRemove, rowRef, onHoverChange, t }) {
  return (
    <li
      className={`dayr-row${flash ? ' flash' : ''}${last ? ' last' : ''}`}
      ref={rowRef}
      onMouseEnter={onHoverChange ? () => onHoverChange(true) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(false) : undefined}
    >
      <span className="dayr-mark">
        <PoiThumb img={item.img} cat={poiMapCat(item)} name={item.name} />
        <span className="dayr-no">{n}</span>
      </span>
      <span className="dayr-body">
        <span className="dayr-name">
          {item.name}
          {isMustSee(item) && (
            <span className="dayr-must" title={t('dayws.mustTitle')}><StarIcon size={9} /></span>
          )}
        </span>
        <span className="dayr-kind">
          {poiKind(item)}
          {/* A place the catalogue never heard of was pinned by best effort,
              and when that effort missed it sits on the city centre. Saying so
              is a correctness caveat, not decoration, so it survives the cut
              that took every other badge off this list. */}
          {item.custom && (
            <span
              className="day-badge-custom"
              title={item.unmapped
                ? t('dayws.customApproxTitle')
                : t('dayws.customTitle')}
            >
              {item.unmapped ? t('dayws.customApprox') : t('dayws.custom')}
            </span>
          )}
        </span>
      </span>
      <span className="dayr-tools">
        <button className="dayr-tool" onClick={onMoveUp} disabled={n === 1} aria-label={t('dayws.moveUp')} title={t('dayws.moveUp')}>↑</button>
        <button className="dayr-tool" onClick={onMoveDown} disabled={last} aria-label={t('dayws.moveDown')} title={t('dayws.moveDown')}>↓</button>
        <button className="dayr-tool dayr-tool-del" onClick={onRemove} aria-label={t('dayws.removeStop')} title={t('dayws.removeStop')}>×</button>
      </span>
    </li>
  );
}

/**
 * Tab 1 of the day workspace: today's plan, and nothing else.
 *
 * Two controls sit above the list. The plus opens what you can ADD (more
 * places, or Carta rebuilding the order); the share icon opens where the day
 * can GO (the route in Google Maps, a message to the people coming with you,
 * then the file exports). Both are popovers, so the list itself keeps the panel.
 */
export function DayPlanPanel({
  items, dayNumber, city,
  onMoveUp, onMoveDown, onRemove, rowRefs, flashIdx, onHoverRow,
  onAddMore, onOptimize, onAskCarta, canOptimize,
  gmapsUrl, onShare, shareState, onPdf, onKml, onIcs,
  citytrip, onUseCitytrip, walksBlock, discoveries = [], aiSummary = '',
}) {
  const { t } = useI18n();
  const [addOpen, setAddOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const addRef = useDismiss(addOpen, () => setAddOpen(false));
  const shareRef = useDismiss(shareOpen, () => setShareOpen(false));

  if (items.length === 0) {
    return (
      <div className="dayp">
        <div className="dayp-empty">
          <span className="dayp-empty-glyph" aria-hidden="true"><RouteIcon size={22} /></span>
          <h3>{t('dayws.emptyTitle', { n: dayNumber })}</h3>
          <p>{t('dayws.emptySub', { city: city || t('day.thisCity') })}</p>
          <div className="dayp-empty-actions">
            <button className="dayp-cta" onClick={onAskCarta}>
              <SparkIcon size={14} /> {t('dayws.emptyAsk')}
            </button>
            <button className="dayp-cta dayp-cta-ghost" onClick={onAddMore}>
              <PlusIcon size={14} /> {t('dayws.emptyBrowse')}
            </button>
          </div>
          {citytrip && (
            <button className="dayp-ready" onClick={onUseCitytrip}>
              <span className="dayp-ready-ico"><RouteIcon size={16} /></span>
              <span className="dayp-ready-text">
                <b>{t('day.readyMade', { city: city || '' })}</b>
                <small>{t('day.readyMadeSub', {
                  n: citytrip.n_stops,
                  km: (citytrip.distance_m / 1000).toFixed(1),
                })}</small>
              </span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dayp">
      <div className="dayp-bar">
        <div className="dayp-pop" ref={addRef}>
          <button
            className={`dayp-round dayp-round-primary${addOpen ? ' on' : ''}`}
            onClick={() => { setShareOpen(false); setAddOpen((v) => !v); }}
            aria-haspopup="menu"
            aria-expanded={addOpen}
            aria-label={t('dayws.addAria')}
            title={t('dayws.addAria')}
          ><PlusIcon size={17} /></button>
          {addOpen && (
            <div className="dayp-menu" role="menu">
              <button className="dayp-menu-item" role="menuitem" onClick={() => { setAddOpen(false); onAddMore(); }}>
                <MapPinIcon size={14} />
                <span><b>{t('dayws.addPlaces')}</b><small>{t('dayws.addPlacesSub')}</small></span>
              </button>
              <button className="dayp-menu-item" role="menuitem" onClick={() => { setAddOpen(false); onAskCarta(); }}>
                <SparkIcon size={14} />
                <span><b>{t('dayws.addCarta')}</b><small>{t('dayws.addCartaSub')}</small></span>
              </button>
              {canOptimize && (
                <button className="dayp-menu-item" role="menuitem" onClick={() => { setAddOpen(false); onOptimize(); }}>
                  <RouteIcon size={14} />
                  <span><b>{t('dayws.addReorder')}</b><small>{t('dayws.addReorderSub')}</small></span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="dayp-pop dayp-pop-right" ref={shareRef}>
          <button
            className={`dayp-round${shareOpen ? ' on' : ''}`}
            onClick={() => { setAddOpen(false); setShareOpen((v) => !v); }}
            aria-haspopup="menu"
            aria-expanded={shareOpen}
            aria-label={t('dayws.shareAria')}
            title={t('dayws.shareAria')}
          ><ShareIcon size={16} /></button>
          {shareOpen && (
            <div className="dayp-menu dayp-menu-end" role="menu">
              {gmapsUrl && (
                <a className="dayp-menu-item" role="menuitem" href={gmapsUrl} target="_blank" rel="noreferrer" onClick={() => setShareOpen(false)}>
                  <MapPinIcon size={14} />
                  <span><b>{t('export.openInGmaps')}</b><small>{t('dayws.shareGmapsSub')}</small></span>
                </a>
              )}
              {/* Stays open so "Copied" is read where it was clicked. */}
              <button className="dayp-menu-item" role="menuitem" onClick={onShare}>
                {shareState === 'copied' ? <CheckIcon size={14} /> : <ShareIcon size={14} />}
                <span>
                  <b>{shareState === 'copied' ? t('day.copied') : t('dayws.shareFriends')}</b>
                  <small>{t('dayws.shareFriendsSub')}</small>
                </span>
              </button>
              <div className="dayp-menu-rule" role="separator" />
              <button className="dayp-menu-item dayp-menu-small" role="menuitem" onClick={() => { setShareOpen(false); onPdf(); }}>
                <DownloadIcon size={13} /> <span><b>{t('day.downloadPdf')}</b></span>
              </button>
              <button className="dayp-menu-item dayp-menu-small" role="menuitem" onClick={() => { setShareOpen(false); onKml(); }}>
                <RouteIcon size={13} /> <span><b>{t('export.myMaps')}</b></span>
              </button>
              <button className="dayp-menu-item dayp-menu-small" role="menuitem" onClick={() => { setShareOpen(false); onIcs(); }}>
                <CalendarIcon size={13} /> <span><b>{t('export.calendar')}</b></span>
              </button>
            </div>
          )}
        </div>
      </div>

      {aiSummary && <p className="dayp-summary">{aiSummary}</p>}

      <ol className="dayr-list">
        {items.map((it, i) => (
          <RouteStop
            key={`${it.id || it.name}-${i}`}
            item={it}
            n={i + 1}
            last={i === items.length - 1}
            flash={flashIdx === i}
            onMoveUp={() => onMoveUp(i)}
            onMoveDown={() => onMoveDown(i)}
            onRemove={() => onRemove(i)}
            rowRef={(el) => { if (rowRefs) rowRefs.current[i] = el; }}
            onHoverChange={(on) => onHoverRow?.(on ? i : null)}
            t={t}
          />
        ))}
      </ol>

      {walksBlock}

      {/* Places Carta found off the catalogue while planning: they carry their
          own map pins but no row to sit in, so they are named once, here. */}
      {discoveries.length > 0 && (
        <div className="dayp-finds">
          <div className="dayp-finds-title"><MountainIcon size={11} /> {t('ai.discoveryTitle')}</div>
          {discoveries.map((s, i) => (
            <div className="dayp-find" key={i}>
              <b>
                {s.name}
                {/* Two caveats that must travel with the find: an event may not
                    be running when you get there, and a place Carta knew but
                    could not locate has no pin to check it against. */}
                {s.isEvent && <span className="ai-disc-tag ai-event-tag">{t('ai.eventTag')}</span>}
                {s.unmapped && <span className="ai-disc-tag ai-unmapped-tag">{t('ai.unmappedTag')}</span>}
              </b>
              {s.why && <small>{s.why}</small>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
