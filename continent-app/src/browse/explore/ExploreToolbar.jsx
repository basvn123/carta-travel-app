import { HouseIcon } from '../../components/HouseIcons.jsx';
import { IconButton } from '../../components/ui/index.js';
import { AppliedRow, SavedToggle } from '../filters/AppliedRow.jsx';
import { deskChips, phoneChips } from './chipRules.js';
import { countKey } from '../../lib/plural.js';

/**
 * The list's head (G12, Explore top round 2): the page's h1 and its count,
 * read but not drawn (the band names the list: its field holds the search
 * and the way back), then the applied row (filters/AppliedRow.jsx).
 *
 * What left this head for the band: the back arrow (inside the field), Map
 * (the List | Map switch at the tab row's end on a desktop, the corner on a
 * phone) and Filters. What it dropped as a repeat: the search chip (the field
 * shows it), the "Showing places in" hint and the second and third pill
 * styles. Share stays at the desktop row's right end; a phone has it in the
 * field. On the map (`mapView`) the row keeps Share only: Sort is the list
 * sheet's or the column's head, Saved a quick chip on the map (judgement-4:
 * each control once).
 */
export function ExploreToolbar({
  TitleTag, chips, filterCount, gridTotal, isDesktop, isMock, lang, mapView = false,
  resetAll, setShowFavOnly, shareView, showFavOnly, sortMenu, t,
}) {
  const tools = isDesktop ? (
    <>
      {!mapView && sortMenu}
      {!mapView && <SavedToggle on={showFavOnly} onChange={setShowFavOnly} t={t} />}
      <IconButton className="xap-share" label={t('explore.toolShare')} onClick={shareView}>
        <HouseIcon.share size={18} />
      </IconButton>
    </>
  ) : null;
  return (
    <div className="xhead">
      {/* The page's one h1, only while this tab is the one showing: the
          tab stays mounted under Destinations (row T380-g). It says
          "Places", not "Places in Europe", which was wrong over a
          Belgian list (audit-visual defect 10). */}
      <TitleTag className="xhead-title sr-only">{t('places.catPlaces')}</TitleTag>
      <span className="xbar-count sr-only">
        {t(countKey(lang, gridTotal, 'explore.countOne', 'explore.countMany'),
          { n: new Intl.NumberFormat(lang).format(gridTotal) })}
      </span>
      {isMock && <span className="explore-mock">{t('explore.mockData')}</span>}
      <AppliedRow t={t} desktop={isDesktop} count={filterCount}
        chips={isDesktop ? deskChips(chips) : phoneChips(chips)}
        onClearAll={resetAll} tools={tools} />
    </div>
  );
}
