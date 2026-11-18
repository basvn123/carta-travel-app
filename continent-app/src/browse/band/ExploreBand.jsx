import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useIsDesktop } from '../../hooks/useIsDesktop.js';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { IconButton } from '../../components/ui/index.js';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { ExploreCategories } from '../ExploreCategories.jsx';
import { openAskChat } from '../ask/askChatStore.js';
import { useSearchDock, dockBack, dockShare, isQuestion } from '../searchDockStore.js';
import { toggleSettings, useSettingsSheet } from '../settings/settingsSheetStore.js';
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

/**
 * The band at the top of Explore (G12, decision.md APPROVED block). It lives
 * in the top bar, so it never scrolls away with the list.
 *
 *   desktop   the search field with Ask, the Settings button (Places only),
 *             then the settings in one line under it (Places only; the line's
 *             room stays on the other tabs, so the band never changes height)
 *   phone     the search field, the six tabs, then the settings as one
 *             sideways row of chips (Places only). Scrolling the list down
 *             folds the search and the tabs away and pins the chips; a small
 *             scroll up brings them back.
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
  const sheet = useSettingsSheet();
  const items = useSummaryItems();
  const kind = places ? 'places' : (dock.kind && dock.kind !== 'places' ? dock.kind : layerKind());
  // A phone shows a searched list's Back and Share inside the field (the
  // dock's old applied state); a desktop has both in the list's own head.
  const results = !isDesktop && places ? dock.results : null;

  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const shownQuery = results?.query || '';
  // The field shows what the list was searched for until the traveller types.
  const [edited, setEdited] = React.useState(false);
  const value = edited || open ? q : shownQuery;

  const foldRef = React.useRef(null);
  const [foldPx, setFoldPx] = React.useState(120);
  React.useLayoutEffect(() => {
    const el = foldRef.current?.firstElementChild;
    if (!el) return undefined;
    const read = () => setFoldPx(el.scrollHeight || 120);
    read();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [isDesktop]);
  const tucked = useQuickReturn(!isDesktop && !open, foldPx, `${kind}:${open}`);
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
  const submit = (e) => {
    e?.preventDefault?.();
    const text = (open || edited ? q : shownQuery).trim();
    if (text && isQuestion(text)) openAskChat(inputRef.current, { text });
    else onSearch({ kind, q: text });
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
  const bandRef = React.useRef(null);
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

  const tabs = !isDesktop ? (
    <div className="band-tabs">
      <ExploreCategories current={kind} variant="row" className="band-cats"
        onPick={(key) => onPickCategory?.(key, oneCountry(places))} />
    </div>
  ) : null;
  const showChips = places && items.length > 0;
  // The panel's listbox is `${panelId}-list` (SearchPanel); the field
  // points at it, and the wrapper carries no id of its own.
  const panel = open ? (
    <React.Suspense fallback={null}>
      <div className="band-search-panel">
        <SearchPanel query={q} kind={kind} id={panelId} inputRef={inputRef}
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
      className={`band${places ? ' is-places' : ''}${tucked ? ' is-tucked' : ''}${instant ? ' is-instant' : ''}${open ? ' is-searching' : ''}${isDesktop ? ' is-desk' : ' is-phone'}`}>
      <div className="band-fold" ref={foldRef} inert={tucked || undefined}>
        <div className="band-fold-in">
          {!isDesktop && head}
          <div className="band-row">
            <form className={`band-search${results ? ' is-results' : ''}`} role="search"
              aria-label={t('dock.title')} onSubmit={submit}>
              {results ? (
                <IconButton className="band-in band-back" label={t('explore.backOverview')} onClick={dockBack}>
                  <HouseIcon.back size={20} />
                </IconButton>
              ) : (
                <span className="band-mag" aria-hidden="true"><HouseIcon.search size={20} /></span>
              )}
              <input ref={inputRef} type="search" className="band-input"
                value={value} placeholder={t('band.searchPh')} aria-label={t('band.searchPh')}
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
              {results?.canShare && !open && (
                <IconButton className="band-in band-share" label={t('explore.toolShare')} onClick={dockShare}>
                  <HouseIcon.share size={20} />
                </IconButton>
              )}
              {/* Ask stays inside the field: the one door to Ask Carta. The
                  boxed AI mark is a glyph so the name stays "Ask Carta". */}
              <Pressable className="band-ask" aria-label={t('dock.ask')}
                onClick={(e) => openAskChat(e.currentTarget)}>
                <HouseIcon.ask size={16} />
                <span className="band-ask-word" aria-hidden="true">{t(isDesktop ? 'dock.ask' : 'dock.askShort')}</span>
              </Pressable>
            </form>
            {places && isDesktop && (
              <Pressable className={`band-settings${sheet.isOpen ? ' is-on' : ''}`}
                aria-expanded={sheet.isOpen}
                onClick={() => toggleSettings({ step: 'overview' })}>
                <HouseIcon.fader size={22} />
                <span className="band-settings-word">{t('band.settings')}</span>
              </Pressable>
            )}
          </div>
          {tabs}
        </div>
      </div>
      {/* The line under the search: hidden while the search is open on a
          phone (its suggestions take the room, the keyboard is up). A
          desktop keeps the line's room on every tab. */}
      {isDesktop ? (
        <div className="band-line">{showChips && <SummaryChips items={items} />}</div>
      ) : (showChips && !open && <SummaryChips items={items} className="is-swipe" />)}
      {panel}
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
