import { HouseIcon } from '../../components/HouseIcons.jsx';
import { CloseIcon } from '../../components/Icons.jsx';
import { Button, IconButton } from '../../components/ui/index.js';
import { phoneChips } from './chipRules.js';

/** G12: the saved filter wears the save glyph, filled while on. It stays one
 *  tap away on every width (decision.md change 7). */
function SavedToggle({ showFavOnly, setShowFavOnly, t, className = '' }) {
  return (
    <Button variant="secondary" size="sm" className={`xtool xtool-saved${showFavOnly ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      iconStart={<HouseIcon.bookmark size={18} />} aria-pressed={showFavOnly}
      aria-label={t('explore.savedOnlyAria')}
      onClick={() => setShowFavOnly(!showFavOnly)}>
      {t('explore.toolSaved')}
    </Button>
  );
}

/**
 * G12 (decision.md step 8): the phone list's one row. Sort, then the chips
 * scrolling after it (Explore top: the Trip dock left for the band). Clear all
 * leads the chips and sticks to the left so it is always reachable; Saved
 * is always there. Every chip is capped in CSS and keeps its full text in
 * its name and title, so a long German or French label never pushes the row
 * past the screen.
 */
function PhoneTools({ chips, resetAll, showFavOnly, setShowFavOnly, sortMenu, t }) {
  const shown = phoneChips(chips);
  return (
    <>
      <span className="xtools-sort">{sortMenu}</span>
      <div className="xtools-chips" role="group" aria-label={t('filter.activeAria')}>
        {chips.length > 0 && (
          <Button variant="quiet" size="sm" className="xtools-clear"
            aria-label={t('explore.clearAllAria')} onClick={resetAll}>
            {t('dock.clear')}
          </Button>
        )}
        <SavedToggle showFavOnly={showFavOnly} setShowFavOnly={setShowFavOnly} t={t} className="xtools-saved" />
        {shown.map((c) => (
          <Button key={c.key} variant="quiet" size="sm" className="xtools-chip" data-chip={c.key}
            title={c.label} aria-label={t('filter.removeChip', { name: c.label })} onClick={c.remove}
            iconEnd={<CloseIcon size={12} />}>
            <span className="xchip-text">{c.label}</span>
          </Button>
        ))}
      </div>
    </>
  );
}

export function ExploreToolbar({
  TitleTag, chips, gridTotal, isDesktop, isMock, lang, lens,
  resetAll, setShowFavOnly, shareView, showFavOnly, sortMenu, t, viewSwitch,
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
          <HouseIcon.back size={20} />
        </a>}
        <TitleTag className="xbar-title">{t('explore.placesTitle')}</TitleTag>
        <span className="xbar-count sr-only">
          {t(gridTotal === 1 ? 'explore.countOne' : 'explore.countMany',
            { n: new Intl.NumberFormat(lang).format(gridTotal) })}
        </span>
        {isMock && <span className="explore-mock">{t('explore.mockData')}</span>}
      </div>
      <div className={`xbar-tools xtools${isDesktop ? '' : ' xtools--phone'}`} role="group" aria-label={t('explore.toolsAria')}>
        {isDesktop ? (
          <>
            {/* G12: Share is an icon on a desktop (on a phone it sits in the
                search field), so the row keeps its room for the filters. */}
            <IconButton className="xtool-share" tone="surface" label={t('explore.toolShare')}
              onClick={shareView}>
              <HouseIcon.share size={18} />
            </IconButton>
            {sortMenu}
            {/* G12 (Explore top): Filters, Strong match and the Trip dock
                left; the band's Settings holds what the dock did. */}
            <SavedToggle showFavOnly={showFavOnly} setShowFavOnly={setShowFavOnly} t={t} />
            {viewSwitch('xtool-view')}
          </>
        ) : (
          <PhoneTools chips={chips} resetAll={resetAll} showFavOnly={showFavOnly}
            setShowFavOnly={setShowFavOnly} sortMenu={sortMenu} t={t} />
        )}
      </div>
    </div>
  );
}
