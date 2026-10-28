import React, { useMemo } from 'react';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryPickerMap } from '../../map/CountryPickerMap.jsx';
import { CountryBrief } from '../CountryBrief.jsx';
import { CountryMatchCards, DayCostLine } from '../CountryMatchCards.jsx';
import { PlannerSection } from '../PlannerSection.jsx';
import { Button, IconButton } from '../../components/ui/index.js';
import { favDestIds } from '../../lib/favorites.js';
import { googleFlightsExploreLink } from '../../lib/transportLinks.js';
import { CheckIcon, InfoIcon, StarIcon, CloseIcon, ListDayIcon, MapPinIcon } from '../../components/Icons.jsx';
import { PlaneIcon } from '../../components/TransportIcons.jsx';
import { Flag } from '../GuidedTripWizardParts.jsx';
import { dayCostText } from './wizardSteps.js';
import { useI18n } from '../../i18n/index.jsx';
import { SaveTripTaste } from '../../browse/WhyItMatches.jsx';

// The two ways to answer "where", as a real tablist: keyboard-navigable with
// the arrow keys, announced as one control with two states.
const WHERE_TABS = ['help', 'hand'];

/**
 * "Not sure where to go yet?", the one question Carta's own catalogue answers
 * from the wrong end. Carta ranks places by what they cost to BE in; Google
 * Flights Explore ranks them by what they cost to REACH. It needs a departure
 * airport and nothing else.
 */
function ExploreFlightsCard({ airport, month = '', lang = 'en', t }) {
  const url = googleFlightsExploreLink({
    fromIata: airport?.iata, fromCity: airport?.city, month, lang,
  });
  if (!url) return null;
  return (
    <a className="guide-explore-card" href={url} target="_blank" rel="noopener noreferrer">
      <span className="guide-explore-icon"><PlaneIcon size={16} /></span>
      <span className="guide-explore-text">
        <b>{t('wizard.exploreTitle')}</b>
        <small>{t('wizard.exploreCta', { airport: airport.iata })}</small>
      </span>
      <span className="ext-arrow" aria-hidden="true">&#8599;</span>
    </a>
  );
}

/**
 * One country to pick by hand (T490-i; T752 redrew it as Explore's tile, the
 * kit Card anatomy): the photograph with a tick once picked, the flag and the
 * name, the shortlist count, and what a day there costs from. The pick is the
 * card's one stretched button, with "Italy, from about {price} a person a day"
 * as its name; the info button stands above it in the corner.
 */
function CountryCard({ c, on, reading, img, favN, cost, onToggle, onInfo }) {
  const { t } = useI18n();
  const text = dayCostText(cost, t);
  const favId = `ccard-fav-${c.iso2 || c.country}`;
  return (
    <article className={`card card-tile card-wrap is-interactive pf-ccard${on ? ' is-selected' : ''}${reading ? ' is-reading' : ''}`}>
      <div className="card-media">
        <HeroImage
          url={img}
          city={c.country}
          iso2={c.iso2}
          className="pf-ccard-img"
          maxWidth={960}
          ratio={[4, 3]}
          sizes="(max-width: 480px) 46vw, (max-width: 768px) 30vw, 240px"
        />
        {on && <span className="pf-ccard-tick" aria-hidden="true"><CheckIcon size={14} /></span>}
      </div>
      <div className="card-body pf-ccard-body">
        <h3 className="card-title">
          <button
            type="button"
            className="card-open pf-ccard-name"
            onClick={() => onToggle(c.country)}
            aria-pressed={on}
            aria-label={text ? t('wizard.countryPickName', { country: c.country, price: text.spoken }) : c.country}
            aria-describedby={favN > 0 ? favId : undefined}
          >
            <Flag iso2={c.iso2} className="guide-flag-img-sm" />
            <span>{c.country}</span>
          </button>
        </h3>
        {favN > 0 && <div className="card-meta pf-ccard-fav" id={favId}><StarIcon size={11} /> {t('wizard.onShortlist', { n: favN })}</div>}
        <div className="card-figures"><div className="card-price"><DayCostLine cost={cost} t={t} as="span" className="pf-ccard-cost" /></div></div>
      </div>
      <div className="card-actions">
        <IconButton tone="surface" className="pf-ccard-info" label={t('brief.whatsThereIn', { country: c.country })}
          aria-expanded={reading} onClick={(e) => { e.stopPropagation(); onInfo(c.country); }}>
          <InfoIcon size={16} />
        </IconButton>
      </div>
    </article>
  );
}

/**
 * Where: two tabs over one selection, a quiz that recommends countries and
 * the grid you pick them on yourself. From 1024 px the map stands in the
 * wizard's right column (`mapAside`), so the step shows the grid alone; on a
 * phone the Grid | Map switch stays.
 */
export function StepWhere({
  titleTag, allCountries, countries, setCountries, toggleCountry, whereTab, setWhereTab,
  quiz, tripMonth, countryMatches, countryDayCost, briefCountry, setBriefCountry, openBrief,
  nearAirports, tripYearMonth, whereView, setWhereView, favorites, destinations, countryCovers,
  recommendedNames, mapAside, data, originCode, windowNights, flexNights, dateMode, startDate, endDate,
  onOpenDest, onOpenCountry, onOpenTrip, onPlanTrip,
  // T670: compare the picked countries side by side (CompareSheet).
  onCompare = null,
  // T752: false behind "I know where": the picker alone, no Help me choose tab.
  whereTabs = true,
}) {
  const { t, lang } = useI18n();
  const StepTitle = titleTag;

  // How many shortlisted places each country holds, so the grid can lead with
  // the countries the traveller has already been starring.
  const favByCountry = useMemo(() => {
    const out = new Map();
    if (!favorites || !favorites.size) return out;
    for (const id of favDestIds(favorites)) {
      const d = destinations[id];
      if (d?.country) out.set(d.country, (out.get(d.country) || 0) + 1);
    }
    return out;
  }, [favorites, destinations]);

  // Alphabetical, but a country holding shortlisted places comes first.
  const handCountries = useMemo(() => {
    const rows = allCountries.slice();
    rows.sort((a, b) => {
      const fa = favByCountry.get(a.country) || 0;
      const fb = favByCountry.get(b.country) || 0;
      return fb - fa || a.country.localeCompare(b.country);
    });
    return rows;
  }, [allCountries, favByCountry]);

  // The same shortlist, as its own row above the grid, most-starred first.
  const shortlistCountries = useMemo(
    () => allCountries
      .filter((c) => (favByCountry.get(c.country) || 0) > 0)
      .sort((a, b) => (favByCountry.get(b.country) || 0) - (favByCountry.get(a.country) || 0)
        || a.country.localeCompare(b.country)),
    [allCountries, favByCountry],
  );

  /** Left/right moves between the two Where tabs, as a tablist must. */
  const onWhereTabKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = WHERE_TABS.indexOf(whereTab);
    const next = WHERE_TABS[(i + (e.key === 'ArrowRight' ? 1 : WHERE_TABS.length - 1)) % WHERE_TABS.length];
    setWhereTab(next);
    document.getElementById(`wtab-${next}`)?.focus();
  };
  const toggleBrief = (name) => setBriefCountry(briefCountry === name ? '' : name);
  const view = mapAside ? 'list' : whereView;
  const tab = whereTabs ? whereTab : 'hand';

  return (
    <>
      <StepTitle className="guide-title">{t('wizard.whereTitle')}</StepTitle>
      {whereTabs && <p className="guide-sub">{t('wizard.whereSub')}</p>}

      {/* The picks live above the tabs, because they belong to neither. */}
      {countries.size > 0 && (
        <div className="guide-picked-row">
          {allCountries.filter((c) => countries.has(c.country)).map((c) => (
            <button
              key={c.country}
              className="guide-picked-chip"
              onClick={() => toggleCountry(c.country)}
              title={t('ready.dropCountry', { country: c.country })}
              aria-label={t('ready.dropCountry', { country: c.country })}
            >
              <Flag iso2={c.iso2} className="guide-flag-img-sm" />
              {c.country}
              <span className="guide-picked-x" aria-hidden="true"><CloseIcon size={12} /></span>
            </button>
          ))}
          <button className="guide-stay-filter-clear" onClick={() => setCountries(new Set())}>
            {t('wizard.stayFilterClear')}
          </button>
        </div>
      )}

      {whereTabs && (
      <div className="guide-datemode guide-wtabs" role="tablist" aria-label={t('wizard.whereTitle')}>
        {WHERE_TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            id={`wtab-${tab}`}
            aria-selected={whereTab === tab}
            aria-controls={`wpanel-${tab}`}
            tabIndex={whereTab === tab ? 0 : -1}
            className={whereTab === tab ? 'on' : ''}
            onClick={() => setWhereTab(tab)}
            onKeyDown={onWhereTabKey}
          >
            {t(tab === 'help' ? 'wizard.tabHelp' : 'wizard.tabHand')}
          </button>
        ))}
      </div>
      )}

      {onCompare && countries.size >= 2 && (
        <div className="cmp-bar">
          <span className="cmp-bar-text">{t('cmp.picked', { n: countries.size })}</span>
          <Button variant="secondary" size="sm" onClick={onCompare}>{t('cmp.open')}</Button>
        </div>
      )}

      <div className={`guide-where ${openBrief ? 'has-brief' : ''}`}>
        <div className="guide-where-col">
          {tab === 'help' ? (
            <div role="tabpanel" id="wpanel-help" aria-labelledby="wtab-help">
              {/* T796: the Help me choose answers are not asked a second time
                  here; they stay in the trip settings (the gear). */}
              {countryMatches.length > 0 && (
                <PlannerSection title={t('quiz.recommended')} className="wq-results">
                  <CountryMatchCards
                    costs={countryDayCost}
                    matches={countryMatches}
                    picked={countries}
                    onToggle={toggleCountry}
                    onBrief={toggleBrief}
                  />
                  {/* T766: the trip's likes become the travel style only on this tap. */}
                  <SaveTripTaste likes={quiz.types} />
                </PlannerSection>
              )}
              {quiz.types?.length > 0 && countryMatches.length === 0 && (
                <p className="guide-empty">{t('quiz.noMatches')}</p>
              )}
              {/* The honest companion to a recommendation: wherever happens
                  to be cheap to reach out of their own airport that month. */}
              <ExploreFlightsCard airport={nearAirports[0]} month={tripYearMonth} lang={lang} t={t} />
            </div>
          ) : (
            <div {...(whereTabs ? { role: 'tabpanel', id: 'wpanel-hand', 'aria-labelledby': 'wtab-hand' } : {})}>
              {/* Explore's one toggle (T592): in the grid it offers the map,
                  on the map it offers the grid, with the icon of where it goes. */}
              {!mapAside && (
                <div className="pf-where-bar">
                  <Button variant="secondary" size="sm" className="pf-view-toggle"
                    iconStart={whereView === 'map' ? <ListDayIcon size={16} /> : <MapPinIcon size={16} />}
                    onClick={() => setWhereView(whereView === 'map' ? 'list' : 'map')}>
                    {t(whereView === 'map' ? 'explore.viewList' : 'explore.viewMap')}
                  </Button>
                </div>
              )}

              {/* The countries the traveller has already starred places in,
                  pulled out above the grid. One tap adds the country. */}
              {view === 'list' && shortlistCountries.length > 0 && (
                <div className="guide-shortrow">
                  <span className="guide-shortrow-label">
                    <StarIcon size={11} /> {t('wizard.fromYourShortlist')}
                  </span>
                  <div className="guide-shortrow-chips">
                    {shortlistCountries.map((c) => (
                      <button
                        key={c.country}
                        type="button"
                        className={`guide-shortrow-chip ${countries.has(c.country) ? 'on' : ''}`}
                        onClick={() => toggleCountry(c.country)}
                        aria-pressed={countries.has(c.country)}
                      >
                        <Flag iso2={c.iso2} className="guide-flag-img-sm" />
                        {c.country}
                        <span className="guide-shortrow-n">{favByCountry.get(c.country)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {view === 'list' ? (
                <div className="pf-cgrid">
                  {handCountries.map((c) => (
                    <CountryCard
                      key={c.country}
                      c={c}
                      on={countries.has(c.country)}
                      reading={briefCountry === c.country}
                      img={countryCovers.get(c.country)}
                      favN={favByCountry.get(c.country) || 0}
                      cost={countryDayCost.get(c.country) || null}
                      onToggle={toggleCountry}
                      onInfo={toggleBrief}
                    />
                  ))}
                </div>
              ) : (
                <div className="guide-where-map">
                  <CountryPickerMap
                    countries={allCountries}
                    selected={countries}
                    onToggle={toggleCountry}
                    recommended={recommendedNames}
                    covers={countryCovers}
                    onBrief={toggleBrief}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* The country, opened: a right-hand drawer on a desktop, a bottom
            sheet on anything narrower. */}
        {openBrief && (
          <CountryBrief
            dayCost={countryDayCost.get(openBrief.country) || null}
            brief={openBrief}
            picked={countries.has(openBrief.country)}
            onToggle={toggleCountry}
            onClose={() => setBriefCountry('')}
            destinations={destinations}
            meta={data?.meta}
            origin={originCode}
            tripMonth={tripMonth}
            nights={windowNights || flexNights}
            startDate={dateMode === 'exact' ? startDate : ''}
            endDate={dateMode === 'exact' ? endDate : ''}
            quizTypes={quiz.types}
            favorites={favorites}
            onOpenDest={onOpenDest}
            onSeeAll={onOpenCountry ? () => onOpenCountry(openBrief.iso2) : null}
            onOpenTrip={onOpenTrip ? (trip) => onOpenTrip(trip.id) : null}
            onPlanTrip={(trip) => onPlanTrip(trip, openBrief.country)}
          />
        )}
      </div>
    </>
  );
}
