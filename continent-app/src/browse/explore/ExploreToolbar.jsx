import { ArrowLeftIcon, ShareIcon, FilterIcon, BookmarkIcon } from '../../components/Icons.jsx';
import { Button, Chip } from '../../components/ui/index.js';
import { MATCH } from '../../lib/match.js';
import { CountriesButton } from '../../components/CountriesControl.jsx';

export function ExploreToolbar({
  TitleTag, chips, filterBtnRef, gridTotal, isDesktop, isMock, lang, lens, matchTaste, paneOpen,
  setPaneOpen, setSheetOpen, setShowFavOnly, setStrongOnly, settingsLine, shareView, sheetOpen,
  showFavOnly, sortMenu, strongOnly, t, viewSwitch,
}) {
  return (
    <div className="xbar">
      <div className="xbar-lead">
        {/* The page's one h1, only while this tab is the one showing:
            the tab stays mounted under Destinations, and its h1 made a
            second one there (row T380-g). Hidden, it is a plain div. */}
        {/* T588: the title and the live count under it (owner
            2026-10-22, reversing 2026-10-13). */}
        {/* T598: one head row. The way back to the overview (T586) is
            a round arrow before the title: a link to the overview's
            address, drawn as the kit's icon button; Back in the browser
            does the same. */}
        {isDesktop && <a className="icon-btn icon-btn-surface xov-back" href={lens.href}
          aria-label={t('explore.backOverview')} title={t('explore.backOverview')}
          onClick={(e) => { e.preventDefault(); lens.back(); }}>
          <ArrowLeftIcon size={20} />
        </a>}
        <TitleTag className="xbar-title">{t('explore.placesTitle')}</TitleTag>
        <span className="xbar-count sr-only">
          {t(gridTotal === 1 ? 'explore.countOne' : 'explore.countMany',
            { n: new Intl.NumberFormat(lang).format(gridTotal) })}
        </span>
        {isMock && <span className="explore-mock">{t('explore.mockData')}</span>}
      </div>
      {/* T588: one row of pills: Share, Sort, Filters, Saved, then the
          countries on a phone and the map toggle last. */}
      <div className="xbar-tools xtools" role="group" aria-label={t('explore.toolsAria')}>
        <Button variant="secondary" size="sm" className="xtool" iconStart={<ShareIcon size={18} />}
          onClick={shareView}>
          {t('explore.toolShare')}
        </Button>
        {sortMenu}
        {/* T962: on a phone Filters is the dock's round button. */}
        {isDesktop && <Button
          variant="secondary"
          size="sm"
          ref={filterBtnRef}
          className={`xtool${isDesktop && paneOpen ? ' is-on' : ''}`}
          iconStart={<FilterIcon size={18} />}
          onClick={() => (isDesktop ? setPaneOpen((v) => !v) : setSheetOpen(true))}
          aria-haspopup={isDesktop ? undefined : 'dialog'}
          aria-expanded={isDesktop ? paneOpen : sheetOpen}
          aria-controls={isDesktop ? 'explore-side' : undefined}
        >
          {t('filter.filters')}
          {chips.length > 0 && <Chip kind="count" className="xfilters-n">{chips.length}</Chip>}
        </Button>}
        <Button variant="secondary" size="sm" className={`xtool${showFavOnly ? ' is-on' : ''}`}
          iconStart={<BookmarkIcon size={18} />} aria-pressed={showFavOnly}
          onClick={() => setShowFavOnly(!showFavOnly)}>
          {t('explore.toolSaved')}
        </Button>
        {matchTaste && (
          <Button variant="secondary" size="sm" className={`xtool${strongOnly ? ' is-on' : ''}`}
            title={t('fit.strongHint', { pct: Math.round(MATCH.strong_min * 100) })}
            aria-pressed={strongOnly} onClick={() => setStrongOnly((v) => !v)}>
            {t('fit.strong')}
          </Button>
        )}
        {!isDesktop && <CountriesButton s={settingsLine} className="xtool" />}
        {viewSwitch('xtool-view')}
      </div>
    </div>
  );
}
