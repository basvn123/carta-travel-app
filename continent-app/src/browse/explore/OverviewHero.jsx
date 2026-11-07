import React from 'react';
import { openAskChat } from '../ask/askChatStore.js';
import { fallbackSrc, srcSetFor } from '../../lib/heroImage.js';
import { SparkIcon, SearchIcon, CameraIcon, FilterIcon, BookmarkIcon, DiamondIcon, TrainIcon, PersonIcon, PiggyIcon, SunIcon, StarIcon, BootIcon, BeachIcon } from '../../components/Icons.jsx';
import { Button, Chip } from '../../components/ui/index.js';
import { PriceViewSwitch } from '../../components/PriceViewSwitch.jsx';

/**
 * The overview's head (T586, T595; rebuilt as a hero by T601, Explore v8,
 * owner 2026-10-22: "more hierarchy, more professional, some background
 * image"). Top to bottom:
 *
 *   the band          one licensed catalogue photograph (Commons, credited
 *                     under the band) with a solid panel over its lower
 *                     edge: the headline with Ask Carta beside it (under it
 *                     on a phone), then the bar
 *   the bar           one joined field What | Where | Search, the Map pill
 *                     apart after it (desktop). Where works for every What:
 *                     Places searches the catalogue, a category hands the
 *                     typed text to its tab, Trip styles ignores it.
 *   level 2           the categories as tabs (ExploreCategories row)
 *   level 3           small quiet chips: the rails' doors, Countries on a
 *                     phone, All filters and Show all places
 */
export function OverviewHero({
  t, TitleTag, locationQuery, setLocationQuery, onShowAll,
  viewToggle, quick, filtersRef, filtersOn, filterCount, onAllFilters, photo, tasteChip = null,
  strongChip = null, docked = false,
}) {
  const [where, setWhere] = React.useState(locationQuery || '');
  // T906 (owner, Explore board 2026-10-30): one field for a place and for
  // Ask Carta (Kayak's AI Mode, Booking's Smart Filter): a question, or
  // anything longer than a name, opens the chat with it; a name searches.
  const submit = (e) => {
    e.preventDefault();
    const q = where.trim();
    if (!q) { onShowAll(); return; }
    if (isQuestion(q)) openAskChat(e.currentTarget, { text: q });
    else setLocationQuery(q);
  };
  const whereId = React.useId();
  // T601: the photograph fades in once it has arrived, never from a blank
  // box the page waits on; a cached photo is shown at once.
  const photoUrl = photo?.url || null;
  const [shown, setShown] = React.useState(null);
  const imgRef = React.useCallback((el) => {
    if (el && el.complete && el.naturalWidth) setShown(photoUrl);
  }, [photoUrl]);
  // T961 (owner 2026-10-31): on a phone the dock in the top bar is the
  // search and Ask Carta, and the quick chips live behind its Filters
  // button (T962), so the overview keeps only its name for a screen reader.
  if (docked) {
    return <TitleTag className="xov-title sr-only" id="xov-title">{t('explore.heroTitle')}</TitleTag>;
  }
  return (
    <section className={`xov-hero${photo ? ' has-photo' : ''}`} aria-labelledby="xov-title">
      {/* T622 (owner 2026-10-23): on a desktop one scenic photograph with
          the search panel centred over it, so the block takes less height;
          on a phone no photograph at all, only the panel. No text on the
          photo; the credit sits under the band. */}
      <div className="xov-band">
        {photo && (
          <div className="xov-photo" aria-hidden="true">
            <img key={photo.url} ref={imgRef}
              className={`xov-photo-img${shown === photo.url ? ' is-in' : ''}`}
              src={fallbackSrc(photo.url, 1280)} srcSet={srcSetFor(photo.url, 1920)}
              sizes="100vw" alt="" width={16} height={9}
              loading="eager" decoding="async" fetchpriority="high"
              onLoad={() => setShown(photo.url)} />
          </div>
        )}
        {/* T906: the headline on the photograph; without one (a phone) it
            is the page's name for a screen reader only. */}
        <TitleTag className={photo ? 'xov-title xov-title--photo' : 'xov-title sr-only'} id="xov-title">{t('explore.heroTitle')}</TitleTag>
        <div className="xov-panel">
          <form className="xov-bar" role="search" aria-label={t('explore.heroSearchAria')} onSubmit={submit}>
            {/* One joined control, Where | Search (T622: What left; the
                category tabs above choose the kind). Where names itself by
                its label, with no placeholder. */}
            <div className="xov-field">
              <div className="xov-seg xov-seg-where">
                <SparkIcon size={20} className="xov-where-icon" />
                <label className="xov-seg-cap" htmlFor={whereId}>{t('explore.askOrSearch')}</label>
                {/* A blank placeholder, only so CSS can tell an empty field
                    (:placeholder-shown) and rest the label where the value goes. */}
                <input id={whereId} type="search" className="xov-where-input" value={where}
                  placeholder=" " autoComplete="off" enterKeyHint="search"
                  onChange={(e) => setWhere(e.target.value)} />
              </div>
              <Button type="submit" variant="primary" className="xov-go"
                iconStart={<SearchIcon size={18} />}>
                <span className="xov-go-word">{t('explore.heroSearch')}</span>
              </Button>
            </div>
          </form>
        </div>
      </div>
      {photo?.page && (
        <p className="xov-credit">
          <a href={photo.page} target="_blank" rel="noopener noreferrer">
            <CameraIcon size={14} className="xov-credit-icon" />
            <span>{t('explore.heroCredit', { place: photo.city, source: photo.source })}</span>
          </a>
        </p>
      )}
      {/* The quick chips: one quiet row; the map pill closes it on a
          desktop (a phone has the floating one). */}
      <div className="xov-picks">
        <div className="xov-quick" role="group" aria-label={t('explore.quickAria')}>
          {/* T907 (owner, Explore board 2026-10-30): Filters first, three
              quick doors, the taste and strong-match chips, then how prices
              read and the map. The Countries chip (the bar has Countries)
              and Show all places (each rail has See all) left the row. */}
          <Button ref={filtersRef} variant="secondary" size="sm"
            className={`xquick-chip xquick-filters${filtersOn ? ' is-on' : ''}`}
            iconStart={<FilterIcon size={16} />} aria-expanded={filtersOn}
            onClick={onAllFilters}>
            {t('places.allFilters')}
            {filterCount > 0 && <Chip kind="count" className="xfilters-n">{filterCount}</Chip>}
          </Button>
          {quick.slice(0, 3).map((r) => (
            <Button key={r.key} variant="secondary" size="sm" className="xquick-chip"
              iconStart={QUICK_ICONS[r.key] ? React.createElement(QUICK_ICONS[r.key], { size: 16 }) : null}
              onClick={r.seeAll}>
              {r.short || r.title}
            </Button>
          ))}
          {tasteChip}
          {strongChip}
          <PriceViewSwitch className="xov-price" />
          {viewToggle}
        </div>
      </div>
    </section>
  );
}

/** A question for Ask Carta rather than a place's name (T906): it asks, or
 *  it is longer than a name, or it carries a figure. */
function isQuestion(q) {
  const s = String(q || '').trim();
  if (!s) return false;
  return /\?$/.test(s) || /\d|\u20ac/.test(s) || s.split(/\s+/).length >= 4;
}

/** The quick chips' icons: the same line icons the filter pane uses. */
const QUICK_ICONS = {
  saved: BookmarkIcon, gems: DiamondIcon, nocar: TrainIcon, quiet: PersonIcon,
  cost: PiggyIcon, now: SunIcon, top: StarIcon, hiking: BootIcon, beach: BeachIcon,
};
