import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useIsDesktop } from '../../hooks/useIsDesktop.js';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { IconButton } from '../../components/ui/index.js';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { durationMs } from '../../lib/motion.js';
import { addRecentText } from '../../lib/search/recent.js';
import { countKey } from '../../lib/plural.js';
import { ExploreCategories } from '../ExploreCategories.jsx';
import { openAskChat, closeAskChat, useAskChat } from '../ask/askChatStore.js';
import { useSearchDock, dockBack, dockShare } from '../searchDockStore.js';
import { useFilters } from '../filters/filtersStore.js';
import { toggleSettings, useSettingsSheet } from '../settings/settingsSheetStore.js';
import { useMapViewOn } from '../explore/mapViewStore.js';
import { QuickChips } from '../filters/QuickChips.jsx';
// The search panel loads on the field's first focus.
const SearchPanel = React.lazy(() => import('../search/SearchPanel.jsx').then((m) => ({ default: m.SearchPanel })));
import { SummaryChips, useSummaryItems } from './SummaryChips.jsx';
import { useQuickReturn } from './useQuickReturn.js';
import '../../styles/80-band.css';

/** The one country the list is narrowed to, read from the address the tab
 *  keeps (Places `xc`, a layer `dn`), so a tab change keeps it (rule 3). */
function oneCountry(places) {
  try {
    const q = new URLSearchParams(window.location.search);
    const v = q.get(places ? 'xc' : 'dn') || '';
    return v && !v.includes(',') && !(places && q.get('xo') === '1') ? v : '';
  } catch { return ''; }
}

/** Mounted while `open` and for one exit after it, so the panel leaves the
 *  way it came (every open and close animates; reduced motion: at once). */
function usePresence(open, token = '--dur-1') {
  const [shown, setShown] = React.useState(open);
  if (open && !shown) setShown(true);
  const leaving = shown && !open;
  React.useEffect(() => {
    if (!leaving) return undefined;
    const id = setTimeout(() => setShown(false), durationMs(token));
    return () => clearTimeout(id);
  }, [leaving, token]);
  return { shown, leaving };
}

/**
 * The band at the top of Explore (G12; round 2, decision.md APPROVED
 * 2026-11-19). It lives in the top bar, so it never scrolls away.
 *
 *   field     the words, on a desktop Filters with its count, then the umber
 *             search button at the right end (Enter does the same); no
 *             magnifier on the left. In a searched list a back arrow sits
 *             at its left end and the query stays in it.
 *   Ask       Ask Carta beside the field on every width ("Ask" on a phone):
 *             a side panel on a desktop, a sheet on a phone; lit while open,
 *             never opened on its own.
 *   desktop   row 1 field, Ask and Settings (Places), all 48 tall; row 2
 *             the settings line on the field's text edge (its room stays on
 *             the layer tabs, so the band never changes height). The tabs
 *             and the List | Map switch stand under it, in the tab's own
 *             scroller (ExploreCategories).
 *   phone     row 1 field and Ask (44); row 2 the settings strip; row 3 the
 *             six tabs. Scrolling the list down folds rows 1 and 3 away and
 *             pins the strip on its solid ground; a small scroll up brings
 *             them back.
 *
 * The rows stand one gap apart (owner O1), measured ink to ink: the field's
 * edge to the line's words, the line's words to the tabs' words.
 *
 * The five layers price nothing from Start, When or the way (their rows
 * read only the country), so their band carries no chips and no Settings.
 *
 *   head                     the app header; on a phone it folds away with
 *                            the search, so the pinned chips reach the top
 *   onSearch({ kind, q })    App's search for a kind (dockSearch)
 *   onPickCategory(key, cc)  App's door to a tab, the country travelling
 */
export function ExploreBand({ head = null, places, onSearch, onPickCategory }) {
  const { t } = useI18n();
  const isDesktop = useIsDesktop();
  const dock = useSearchDock();
  const ask = useAskChat();
  const sheet = useSettingsSheet();
  const items = useSummaryItems();
  const kind = places ? 'places' : (dock.kind && dock.kind !== 'places' ? dock.kind : layerKind());
  // A searched or filtered Places list: Back and the query in the field
  // (and Share on a phone), as the tab on screen says through the store.
  const results = places ? dock.results : null;
  // Filters live with Places (ExploreTab mounts the sheet; filtersStore is
  // the line to it), so the control shows on Places only.
  const filters = useFilters();
  const filterCount = places ? filters.count || 0 : 0;
  // G12 map view (decision.md "Phone map view"): while Places shows its
  // map on a phone, the band floats over it: the field and Ask, then one
  // swipeable row with Filters first, the style and the settings. The
  // header, the tabs and the band's ground step aside (86-map-view.css).
  const onMap = useMapViewOn() && places;
  const mapView = onMap && !isDesktop;

  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const shownQuery = results?.query || '';
  // The field shows what the list was searched for until the traveller types.
  const [edited, setEdited] = React.useState(false);
  const value = edited || open ? q : shownQuery;
  const panelState = usePresence(open);
  // A phone's panel covers the screen from under row 1 (80-band.css).
  const [panelTop, setPanelTop] = React.useState(0);
  React.useLayoutEffect(() => {
    if (!open || isDesktop) return;
    const row = bandRef.current?.querySelector('.band-row');
    if (row) setPanelTop(Math.round(row.getBoundingClientRect().bottom));
  }, [open, isDesktop]);

  // A phone folds two parts (the search above the strip, the tabs below
  // it); the list never tucks the band before it has scrolled past both.
  // Each part's height goes on the band (--fold-a, --fold-b), so the fold
  // slides the parts by exactly that with a transform: the band keeps its
  // height, the top bar too, and the list under it never moves (G12 round
  // 2, m1: resizing rows shifted the column, CLS 0.42 at 360 de).
  const bandRef = React.useRef(null);
  const [foldPx, setFoldPx] = React.useState(120);
  React.useLayoutEffect(() => {
    const els = [...(bandRef.current?.querySelectorAll('.band-fold-in') || [])];
    if (!els.length) return undefined;
    const read = () => {
      const hs = els.map((el) => el.scrollHeight || 0);
      const band = bandRef.current;
      if (band) {
        band.style.setProperty('--fold-a', `${hs[0] || 0}px`);
        band.style.setProperty('--fold-b', `${hs[1] || 0}px`);
      }
      setFoldPx(hs.reduce((sum, h) => sum + h, 0) || 120);
    };
    read();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    els.forEach((el) => ro?.observe(el));
    return () => ro?.disconnect();
  }, [isDesktop, mapView]);
  const tucked = useQuickReturn(!isDesktop && !open && !mapView, foldPx, `${kind}:${open}:${mapView}`) && !mapView;
  // A tab change is a new page: the band takes its new shape at once (the
  // layers have no chip row), with no fold animation playing over the swap
  // (fixes r1 B5).
  const [seenKind, setSeenKind] = React.useState(kind);
  const instant = seenKind !== kind;
  React.useEffect(() => {
    if (!instant) return undefined;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setSeenKind(kind)));
    return () => cancelAnimationFrame(id);
  }, [instant, kind]);

  const inputRef = React.useRef(null);
  const panelId = React.useId();
  const close = React.useCallback(() => {
    setOpen(false);
    setEdited(false);
    setQ('');
  }, []);
  // Enter and the search button search. A question is offered to Ask Carta
  // in the panel; it is never sent there on its own (decision.md 1).
  const submit = (e) => {
    e?.preventDefault?.();
    const text = (open || edited ? q : shownQuery).trim();
    if (text) addRecentText(text);
    onSearch({ kind, q: text });
    inputRef.current?.blur();
    close();
  };
  const onKeyDown = (e) => {
    if (e.key !== 'Escape') return;
    // Escape first closes what opened under the field, then clears it.
    if (open) { e.preventDefault(); setOpen(false); return; }
    if (q) { e.preventDefault(); setQ(''); }
  };
  // A press outside the band and its panel closes the panel.
  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (bandRef.current?.contains(e.target)) return;
      if (e.target.closest?.('.band-search-panel')) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  // The search panel closes before Ask or Filters opens, so one thing is
  // open at a time and focus returns to the control that opened it.
  const openAsk = (opener, seed = null) => {
    close();
    openAskChat(opener, seed);
  };
  const toggleAsk = (e) => (ask.open ? closeAskChat() : openAsk(e.currentTarget));
  const openFilters = (opener) => {
    close();
    if (filters.isOpen) filters.close();
    else filters.open({ opener });
  };

  const tabs = !isDesktop ? (
    <div className="band-fold band-fold--tabs" inert={tucked || undefined}>
      <div className="band-fold-in">
        <div className="band-tabs">
          <ExploreCategories current={kind} variant="row" className="band-cats"
            onPick={(key) => onPickCategory?.(key, oneCountry(places))} />
        </div>
      </div>
    </div>
  ) : null;
  const showChips = places && items.length > 0;
  // Every page under the top bar stands at its height (--filter-h). App
  // keeps that with a ResizeObserver, which lands a frame after a tab change
  // reshapes the band (the layers have no strip), so the new tab painted at
  // the old height first and then jumped (G12 round 2: 0.05 of the screen at
  // 390). Written here before paint, the band and the tab land together.
  React.useLayoutEffect(() => {
    const bar = bandRef.current?.closest('.top-bar');
    if (bar) document.documentElement.style.setProperty('--filter-h', `${bar.offsetHeight}px`);
  }, [kind, showChips, isDesktop, mapView]);
  // On a phone the lists scroll under the band from the screen's top
  // (80-band.css), so the band can slide away over them; the page says so.
  React.useLayoutEffect(() => {
    if (isDesktop) return undefined;
    const root = document.documentElement;
    root.classList.add('has-phone-band');
    return () => root.classList.remove('has-phone-band');
  }, [isDesktop]);
  // While the phone search is open, the corners step aside (89-dock.css) and
  // the panel ends at the visible screen's foot: above the nav, and above a
  // keyboard that overlays the page (iOS, Chrome's resizes-visual), which
  // only visualViewport reports. At 360x640 the panel ran under the nav and
  // the corners covered it, so Filters and Ask could not be reached (judge 1).
  const [kbdInset, setKbdInset] = React.useState(0);
  React.useLayoutEffect(() => {
    if (isDesktop || !open) return undefined;
    const root = document.documentElement;
    root.classList.add('band-searching');
    const vv = window.visualViewport;
    const read = () => {
      if (!vv) return;
      setKbdInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    };
    read();
    vv?.addEventListener('resize', read);
    vv?.addEventListener('scroll', read);
    return () => {
      root.classList.remove('band-searching');
      vv?.removeEventListener('resize', read);
      vv?.removeEventListener('scroll', read);
    };
  }, [isDesktop, open]);
  // The panel's listbox is `${panelId}-list` (SearchPanel); the field
  // points at it, and the wrapper carries no id of its own.
  const panel = panelState.shown ? (
    <React.Suspense fallback={null}>
      <div className={`band-search-panel${panelState.leaving ? ' is-leaving' : ''}`} inert={panelState.leaving || undefined}
        style={isDesktop ? undefined : { '--sp-top': `${panelTop}px`, '--sp-kbd': `${kbdInset}px` }}>
        <SearchPanel query={q} kind={kind} id={panelId} inputRef={inputRef}
          filters={places ? filters : null} onOpenFilters={openFilters}
          onAsk={(opener, text) => openAsk(opener, text ? { text } : null)}
          onSubmit={(text) => { onSearch({ kind, q: text }); inputRef.current?.blur(); close(); }}
          onClose={() => { inputRef.current?.blur(); close(); }} />
      </div>
    </React.Suspense>
  ) : null;

  return (
    <>
    {isDesktop && head}
    <div ref={bandRef}
      onBlur={(e) => {
        // Focus that leaves the band and its panel (a Tab past the field)
        // closes the panel, as a press outside does.
        const to = e.relatedTarget;
        if (open && to && !e.currentTarget.contains(to)) setOpen(false);
      }}
      className={`band${places ? ' is-places' : ''}${tucked ? ' is-tucked' : ''}${instant ? ' is-instant' : ''}${open ? ' is-searching' : ''}${isDesktop ? ' is-desk' : ' is-phone'}${mapView ? ' is-map' : ''}`}>
      <div className="band-fold" inert={tucked || undefined}>
        <div className="band-fold-in">
          {!isDesktop && head}
          <div className="band-row">
            <div className="band-field">
              <form className={`band-search${results ? ' is-results' : ''}`} role="search"
                aria-label={t('dock.title')} onSubmit={submit}>
                {results && (
                  <IconButton className="band-in band-back" label={t('explore.backOverview')} onClick={dockBack}>
                    <HouseIcon.back size={20} />
                  </IconButton>
                )}
                <input ref={inputRef} type="search" className="band-input"
                  value={value} placeholder={t(isDesktop ? 'band.searchPh' : 'band.searchPhShort')} aria-label={t('band.searchPh')}
                  autoComplete="off" enterKeyHint="search" spellCheck={false}
                  role="combobox"
                  aria-expanded={open}
                  aria-controls={open ? `${panelId}-list` : undefined}
                  onFocus={() => { if (!edited) setQ(shownQuery); setEdited(true); setOpen(true); }}
                  onChange={(e) => { setQ(e.target.value); setEdited(true); setOpen(true); }}
                  onKeyDown={onKeyDown} />
                {value && open && (
                  <IconButton className="band-in band-clear" label={t('band.clear')}
                    onClick={() => { setQ(''); inputRef.current?.focus(); }}>
                    <HouseIcon.close size={18} />
                  </IconButton>
                )}
                {/* A tablet's map has Share here too (judgement-5): the tab
                    row has no room for it below 1024 px (80-band.css). */}
                {results?.canShare && !open && (!isDesktop || onMap) && (
                  <IconButton className="band-in band-share" label={t('explore.toolShare')} onClick={dockShare}>
                    <HouseIcon.share size={20} />
                  </IconButton>
                )}
                {isDesktop && places && (
                  <Pressable className={`band-filters${filters.isOpen ? ' is-on' : ''}`}
                    aria-label={filterCount ? t(countKey(t.lang, filterCount, 'band.filtersOnOne', 'band.filtersOn'), { n: filterCount }) : t('band.filters')}
                    aria-expanded={filters.isOpen}
                    onClick={(e) => openFilters(e.currentTarget)}>
                    <HouseIcon.filter size={20} />
                    <span className="band-filters-word" aria-hidden="true">{t('band.filters')}</span>
                    {filterCount > 0 && <span className="band-count" aria-hidden="true">{filterCount}</span>}
                  </Pressable>
                )}
                <Pressable type="submit" className="band-go" aria-label={t('dock.title')}>
                  <HouseIcon.search size={20} />
                </Pressable>
              </form>
              {panel}
            </div>
            {/* Ask Carta stands beside the field: it opens a panel, so it
                says so (aria-haspopup) and stays lit while that is open. */}
            <Pressable className={`band-ask${ask.open ? ' is-on' : ''}`} aria-label={t('dock.ask')}
              aria-haspopup="dialog" aria-expanded={ask.open} onClick={toggleAsk}>
              <HouseIcon.ask size={20} />
              <span className="band-ask-word" aria-hidden="true">{t(isDesktop ? 'dock.ask' : 'dock.askShort')}</span>
            </Pressable>
            {places && isDesktop && (
              <Pressable className={`band-settings${sheet.isOpen ? ' is-on' : ''}`}
                aria-expanded={sheet.isOpen}
                onClick={() => toggleSettings({ step: 'overview' })}>
                <HouseIcon.fader size={22} />
                <span className="band-settings-word">{t('band.settings')}</span>
              </Pressable>
            )}
          </div>
        </div>
      </div>
      {/* Row 2, the settings. A desktop keeps the line's room on every tab;
          a phone keeps the strip in place under an open search (the panel
          covers it), so nothing below moves. */}
      {isDesktop ? (
        <div className="band-line">{showChips && <SummaryChips items={items} />}</div>
      ) : ((showChips || mapView) && (
        // The strip's own ground: the chips fade at their ends (a mask),
        // and the list must not show through there when the strip is pinned.
        <div className="band-strip">
          <SummaryChips items={items} className="is-swipe" pinStyle={mapView} />
        </div>
      ))}
      {/* G12 map view round 2 (owner, 2026-11-20: the travel style must stay
          in view): row 2 above is the style, sticky at its left, and the
          settings; row 3 is Filters and the quick filters. */}
      {mapView && (
        <div className="band-quick">
          <QuickChips className="is-swipe" />
        </div>
      )}
      {!mapView && tabs}
    </div>
    </>
  );
}

/** A layer tab's kind from its address (`dc`), for a desktop search. */
function layerKind() {
  try {
    const c = new URLSearchParams(window.location.search).get('dc');
    return c && c !== 'trips' ? c : 'places';
  } catch { return 'places'; }
}
