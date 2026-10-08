import React, { useEffect, useRef, useState } from 'react';
import { SheetShell } from '../browse/SheetShell.jsx';
import { PoiThumb } from './DayActivityRows.jsx';
import { isMustSee, poiKind, poiMapCat } from './dayDraft.js';
import { useI18n } from '../i18n/index.jsx';
import {
  PlusIcon, ShareIcon, MapPinIcon, DownloadIcon, RouteIcon, CalendarIcon,
  SparkIcon, StarIcon, MountainIcon, CheckIcon, ChevronDownIcon,
} from '../components/Icons.jsx';
import { formatSteps, kmToSteps } from '../lib/steps.js';

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
 * One toolbar row sits above the list (T389, carta-design "Day list": a
 * planning surface puts its ways to add in one labelled toolbar row inside
 * the content). "Add" holds every way to put something into the day: more
 * places, Carta planning it, the refining asks that used to float over the
 * map as the Carta bot (more stops, less walking, rain, food) and reordering
 * the route, once. "Share" holds where the day can go: Google Maps, a message
 * to the people coming with you, then the file exports. Nothing floats over
 * the list any more.
 */
export function DayPlanPanel({
  items, dayNumber, city,
  onMoveUp, onMoveDown, onRemove, rowRefs, flashIdx, onHoverRow,
  onAddMore, onOptimize, onAskCarta, canOptimize,
  botPrompts = [], onBotPrompt,
  gmapsUrl, onShare, shareState, onPdf, onKml, onIcs,
  citytrip, onUseCitytrip, walksBlock, discoveries = [], aiSummary = '',
}) {
  const { t, lang } = useI18n();
  const [addOpen, setAddOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const addBtnRef = useRef(null);
  const shareBtnRef = useRef(null);

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
                <small>{t('day.readyMadeSubSteps', {
                  n: citytrip.n_stops,
                  steps: formatSteps(kmToSteps(citytrip.distance_m / 1000), lang),
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
      <div className="dayp-bar" role="toolbar" aria-label={t('dayws.toolbarAria', { n: dayNumber })}>
        <button
          ref={addBtnRef}
          type="button"
          className={`dayp-tool${addOpen ? ' on' : ''}`}
          onClick={() => { setShareOpen(false); setAddOpen((v) => !v); }}
          aria-haspopup="dialog"
          aria-expanded={addOpen}
          title={t('dayws.addAria')}
        >
          <PlusIcon size={16} />
          <span>{t('dayws.toolAdd')}</span>
          <ChevronDownIcon size={14} className="dayp-tool-caret" />
        </button>
        <button
          ref={shareBtnRef}
          type="button"
          className={`dayp-tool${shareOpen ? ' on' : ''}`}
          onClick={() => { setAddOpen(false); setShareOpen((v) => !v); }}
          aria-haspopup="dialog"
          aria-expanded={shareOpen}
          title={t('dayws.shareAria')}
        >
          <ShareIcon size={15} />
          <span>{t('dayws.toolShare')}</span>
          <ChevronDownIcon size={14} className="dayp-tool-caret" />
        </button>
      </div>

      {/* Both choices open in the shared sheet: a popover hung off its
          button on a pointer screen, a bottom sheet over the one scrim on a
          phone, where eight two-line items never fit above the bottom nav as
          a dropdown (the V1 walk found the exports cut off there). */}
      {addOpen && (
        <SheetShell
          title={t('dayws.addAria')}
          onClose={() => setAddOpen(false)}
          anchorRef={addBtnRef}
          width={320}
          className="dayp-sheet"
          labelId="dayp-add-title"
        >
          <div className="dayp-choices">
            <button type="button" className="dayp-menu-item" onClick={() => { setAddOpen(false); onAddMore(); }}>
              <MapPinIcon size={14} />
              <span><b>{t('dayws.addPlaces')}</b><small>{t('dayws.addPlacesSub')}</small></span>
            </button>
            {canOptimize && (
              <button type="button" className="dayp-menu-item" onClick={() => { setAddOpen(false); onOptimize(); }}>
                <RouteIcon size={14} />
                <span><b>{t('dayws.addReorder')}</b><small>{t('dayws.addReorderSub')}</small></span>
              </button>
            )}
            <div className="dayp-menu-rule" aria-hidden="true" />
            <div className="dayp-menu-label">{t('dayws.botTitle')}</div>
            <button type="button" className="dayp-menu-item" onClick={() => { setAddOpen(false); onAskCarta(); }}>
              <SparkIcon size={14} />
              <span><b>{t('dayws.addCarta')}</b><small>{t('dayws.addCartaSub')}</small></span>
            </button>
            {botPrompts.map((p) => (
              <button
                key={p.key}
                type="button"
                className="dayp-menu-item"
                onClick={() => { setAddOpen(false); onBotPrompt?.(p.key); }}
              >
                {React.createElement(p.Icon, { size: 14 })}
                <span><b>{t(p.labelKey)}</b><small>{t(p.subKey)}</small></span>
              </button>
            ))}
          </div>
        </SheetShell>
      )}
      {shareOpen && (
        <SheetShell
          title={t('dayws.shareAria')}
          onClose={() => setShareOpen(false)}
          anchorRef={shareBtnRef}
          width={320}
          className="dayp-sheet"
          labelId="dayp-share-title"
        >
          <div className="dayp-choices">
            {gmapsUrl && (
              <a className="dayp-menu-item" href={gmapsUrl} target="_blank" rel="noreferrer" onClick={() => setShareOpen(false)}>
                <MapPinIcon size={14} />
                <span><b>{t('export.openInGmaps')}</b><small>{t('dayws.shareGmapsSub')}</small></span>
              </a>
            )}
            {/* Stays open so "Copied" is read where it was clicked. */}
            <button type="button" className="dayp-menu-item" onClick={onShare}>
              {shareState === 'copied' ? <CheckIcon size={14} /> : <ShareIcon size={14} />}
              <span>
                <b>{shareState === 'copied' ? t('day.copied') : t('dayws.shareFriends')}</b>
                <small>{t('dayws.shareFriendsSub')}</small>
              </span>
            </button>
            <div className="dayp-menu-rule" aria-hidden="true" />
            <button type="button" className="dayp-menu-item dayp-menu-small" onClick={() => { setShareOpen(false); onPdf(); }}>
              <DownloadIcon size={13} /> <span><b>{t('day.downloadPdf')}</b></span>
            </button>
            <button type="button" className="dayp-menu-item dayp-menu-small" onClick={() => { setShareOpen(false); onKml(); }}>
              <RouteIcon size={13} /> <span><b>{t('export.myMaps')}</b></span>
            </button>
            <button type="button" className="dayp-menu-item dayp-menu-small" onClick={() => { setShareOpen(false); onIcs(); }}>
              <CalendarIcon size={13} /> <span><b>{t('export.calendar')}</b></span>
            </button>
          </div>
        </SheetShell>
      )}

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
