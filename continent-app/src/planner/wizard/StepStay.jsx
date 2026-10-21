import React, { useEffect, useMemo, useRef } from 'react';
import { ScoreChip, HiddenGemTag } from '../../components/RatingBadge.jsx';
import { CityPickerMap } from '../../map/CityPickerMap.jsx';
import { cityInsight, cityCompanions, designStays } from '../../lib/tripGuide.js';
import { knownForFacts } from '../../lib/knownFor.js';
import { gemScore } from '../../lib/trip_planner_pricing.js';
import { planRoute } from '../../lib/cartaRoute.js';
import { haversineKm } from '../../lib/runtime_pricing.js';
import { cityLabel } from '../../lib/placeName.js';
import { scrollBehavior } from '../../lib/motion.js';
import { formatMoney } from '../../lib/money.js';
import {
  SparkIcon, CheckIcon, AlertIcon, LeafIcon, ScaleIcon, BoltIcon, StarIcon, RouteIcon, BedIcon,
  MapPinIcon, DiamondIcon, DotIcon, PlusIcon,
} from '../../components/Icons.jsx';
import { PlaneIcon } from '../../components/TransportIcons.jsx';
import { IconButton } from '../../components/ui/index.js';
import { plannerStore } from '../plannerStore.js';
import { suggestedNights, Flag, CityThumb, StayRow } from '../GuidedTripWizardParts.jsx';
import { nightsText } from './wizardSteps.js';
import { useI18n } from '../../i18n/index.jsx';

const CITIES_PREVIEW = 8;

// "How full should your days feel?"
const PACE_CHOICES = [
  { key: 'relaxed', Icon: LeafIcon, labelKey: 'wizard.paceRelaxed', subKey: 'wizard.paceRelaxedSub' },
  { key: 'balanced', Icon: ScaleIcon, labelKey: 'wizard.paceBalanced', subKey: 'wizard.paceBalancedSub' },
  { key: 'packed', Icon: BoltIcon, labelKey: 'wizard.pacePacked', subKey: 'wizard.pacePackedSub' },
];

/** The minus glyph, drawn like the kit stepper's (the icon set has a plus only). */
function MinusGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4.5 10h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Stay: the traveller picks cities, the Carta algorithm routes them
 * (lib/cartaRoute.js) and shares out the nights. From 1024 px the map stands
 * in the wizard's right column (`mapAside`) and the step keeps the city
 * briefing beside it; on a phone the map stays in the step.
 *
 * The state is the wizard's (Start over clears it, a step change keeps it);
 * this module holds what is derived from it for this step only.
 */
export function StepStay({
  titleTag, mapAside, booked, setBuildMode, anchorDest, anchorId, ownCarChosen, readyTrip,
  destinations, countries, selectedCountries, includedIds, orderedIncludedIds, nights, setNights,
  setOrder, setAutoNightIds, windowNights, flexNights, totalNights, originPoint, pace, setPace,
  stayStyle, setStayStyle, stayStyleOpen, setStayStyleOpen, designedNote, setDesignedNote,
  designQuizOpen, setDesignQuizOpen, quizStops, setQuizStops, quizMust, setQuizMust,
  staySearch, setStaySearch, stayMinRating, setStayMinRating, stayMaxNightly, setStayMaxNightly,
  stayView, setStayView, focusedId, setFocusedId, expandedGroups, setExpandedGroups,
  mapCities, toggleCity, setCityNights, passesStayFilters, nightlyFor,
}) {
  const { t } = useI18n();
  const StepTitle = titleTag;

  // ---- The Carta algorithm, on the cities the traveller chose ----------
  // Order and nights in one call, live, so the panel can say what it did
  // before the traveller commits to it; finish() routes the same way.
  const cartaPlan = useMemo(() => {
    if (readyTrip || includedIds.length < 2) return null;
    return planRoute({
      ids: includedIds,
      destinations,
      totalNights: windowNights || totalNights || includedIds.length,
      start: anchorDest && anchorDest.lat != null
        ? { lat: anchorDest.lat, lon: anchorDest.lon }
        : (originPoint ? { lat: originPoint.lat, lon: originPoint.lon } : null),
      fixFirst: Boolean(anchorId && includedIds[0] === anchorId),
      pace,
    });
  }, [readyTrip, includedIds, destinations, windowNights, totalNights, anchorDest, anchorId,
    originPoint, pace]);
  const nightsDiffer = Boolean(cartaPlan)
    && cartaPlan.order.some((id) => (nights[id] || 0) !== cartaPlan.nights[id]);
  const applyCartaNights = () => {
    if (!cartaPlan) return;
    const next = { ...nights };
    for (const id of includedIds) next[id] = 0;
    for (const id of cartaPlan.order) next[id] = cartaPlan.nights[id];
    // These nights are now a decision, not a placeholder, so adding a city
    // afterwards must not silently re-split them into equal shares.
    setAutoNightIds(new Set());
    setNights(next);
    setOrder(cartaPlan.order);
  };

  // ---- Curated multi-stop templates, fitted to this trip's nights -------
  // Each a real designStays() run, so a template card IS the route it
  // promises. Hidden once stops exist.
  const stayTemplates = useMemo(() => {
    if (stayStyle !== 'multi' || includedIds.length > 0) return [];
    const n = windowNights || flexNights || 7;
    const defs = [
      { key: 'pair', stops: 2, labelKey: 'wizard.tplPair', minNights: 4 },
      { key: 'triangle', stops: 3, labelKey: 'wizard.tplTriangle', minNights: 6 },
      { key: 'grand', stops: Math.min(5, Math.max(4, Math.round(n / 3))), labelKey: 'wizard.tplGrand', minNights: 9 },
    ].filter((d) => n >= d.minNights);
    const seen = new Set();
    const out = [];
    for (const d of defs) {
      const picks = designStays({
        destinations, countries, anchorDest, anchorId, totalNights: n, maxStops: d.stops,
        mustIncludeIds: [], transport: ownCarChosen ? 'owncar' : 'auto',
      });
      if (picks.length < 2) continue;
      const sig = picks.map((x) => x.id).join('|');
      if (seen.has(sig)) continue; // two shapes resolving to one route are one choice
      seen.add(sig);
      const legs = [];
      for (let i = 0; i < picks.length - 1; i += 1) {
        const a = destinations[picks[i].id];
        const b = destinations[picks[i + 1].id];
        const km = a && b ? haversineKm(a.lat, a.lon, b.lat, b.lon) : null;
        if (km != null) legs.push(Math.round(km * 1.3));
      }
      out.push({ ...d, picks, legKm: legs.reduce((x, y) => x + y, 0) });
    }
    return out;
  }, [stayStyle, includedIds.length, windowNights, flexNights,
    destinations, countries, anchorDest, anchorId, ownCarChosen]);
  const applyTemplate = (tpl) => {
    const nextNights = {};
    tpl.picks.forEach((x) => { nextNights[x.id] = x.nights; });
    setNights(nextNights);
    setOrder(tpl.picks.map((x) => x.id));
    setAutoNightIds(new Set());
    setDesignedNote(true);
    plannerStore.setItineraryType('curated');
  };

  // Carta designs the stays from the arrival and the window, steered by the
  // questionnaire. A one-home-base trip designs exactly one stay.
  const applyDesign = () => {
    const picks = designStays({
      destinations, countries, anchorDest, anchorId,
      totalNights: windowNights || 5,
      maxStops: stayStyle === 'single' ? 1 : (quizStops || null),
      mustIncludeIds: [...quizMust],
      transport: ownCarChosen ? 'owncar' : 'auto',
    });
    if (!picks.length) return;
    const nextNights = {};
    picks.forEach((p) => { nextNights[p.id] = p.nights; });
    setNights(nextNights);
    setOrder(picks.map((p) => p.id));
    setAutoNightIds(new Set()); // designed nights are deliberate: do not rebalance them
    setDesignedNote(true);
    setDesignQuizOpen(false);
  };

  // The strongest candidate cities in the chosen countries, for the
  // "which cities do you really want?" chips.
  const mustChoices = useMemo(() => {
    if (!designQuizOpen) return [];
    return selectedCountries
      .flatMap((c) => c.cities)
      .map(({ id, dest }) => ({ id, dest, s: gemScore(dest) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 10);
  }, [designQuizOpen, selectedCountries]);
  const toggleSet = (setter) => (key) => setter((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  const toggleQuizMust = toggleSet(setQuizMust);
  const toggleGroup = toggleSet(setExpandedGroups);

  // ---- Per-country groups (big cities vs gems), exhaustive ---------------
  const q = staySearch.trim().toLowerCase();
  const matchesQ = (dest) => !q || dest.city.toLowerCase().includes(q);
  // How special a city is, softened by distance from where they land.
  const stayRank = (cd) => {
    let r = cd.rankBase;
    if (anchorDest && anchorDest.lat != null && cd.dest.lat != null) {
      const km = haversineKm(anchorDest.lat, anchorDest.lon, cd.dest.lat, cd.dest.lon);
      if (km != null) r -= km / 140;
    }
    return r;
  };
  const stayCountries = selectedCountries.map((c) => {
    const ranked = c.cities
      .map(({ id, dest }) => ({
        id,
        dest,
        rankBase: (dest.rating?.score ?? dest.beauty?.score ?? 0) + (dest.rating?.hidden_gem ? 1.5 : 0),
      }))
      .filter((cd) => matchesQ(cd.dest) && passesStayFilters(cd.id, cd.dest))
      .sort((a, b) => {
        if (a.id === anchorId) return -1;
        if (b.id === anchorId) return 1;
        return stayRank(b) - stayRank(a);
      });
    return {
      ...c,
      big: ranked.filter((cd) => cd.dest.tier !== 'gem'),
      gems: ranked.filter((cd) => cd.dest.tier === 'gem'),
    };
  });
  // Searching can also pull in places outside the chosen countries.
  const elsewhereMatches = q
    ? Object.entries(destinations)
      .filter(([id, d]) => d && d.lat != null && !countries.has(d.country) && matchesQ(d) && passesStayFilters(id, d))
      .map(([id, d]) => ({ id, dest: d }))
      .slice(0, 12)
    : [];

  // What the briefing panel shows before a pin is tapped: the best-rated
  // candidates in the chosen region, the countries taking turns.
  const topCityPicks = useMemo(() => {
    const byCountry = new Map();
    for (const c of mapCities) {
      if (c.selected || c.score == null) continue;
      const dest = destinations[c.id];
      if (!dest) continue;
      const key = dest.country || '';
      if (!byCountry.has(key)) byCountry.set(key, []);
      byCountry.get(key).push({ id: c.id, score: c.score });
    }
    for (const list of byCountry.values()) list.sort((a, b) => b.score - a.score);
    const order = selectedCountries.map((c) => c.country).filter((k) => byCountry.has(k));
    for (const key of byCountry.keys()) if (!order.includes(key)) order.push(key);
    const limit = order.length <= 1 ? 4 : Math.min(8, order.length * 3);
    const out = [];
    for (let round = 0; out.length < limit; round += 1) {
      let added = false;
      for (const key of order) {
        const list = byCountry.get(key);
        if (round >= list.length) continue;
        out.push(list[round]);
        added = true;
        if (out.length >= limit) break;
      }
      if (!added) break;
    }
    return out.map(({ id }) => ({ id, dest: destinations[id] })).filter((x) => x.dest);
  }, [mapCities, destinations, selectedCountries]);

  // "Pairs well with" hints for the selected cities.
  const companionsFor = useMemo(() => {
    const map = {};
    for (const id of includedIds) {
      const dest = destinations[id];
      if (!dest) continue;
      map[id] = cityCompanions(id, dest, destinations).filter((c) => !(includedIds.includes(c.id)));
    }
    return map;
  }, [includedIds, destinations]);

  // On a phone the briefing panel a pin tap fills sits below the map, so it
  // is nudged into view on selection (narrow screens only).
  const citySideRef = useRef(null);
  useEffect(() => {
    const el = citySideRef.current;
    if (!focusedId || !el || typeof window === 'undefined') return;
    if (!window.matchMedia?.('(max-width: 700px)').matches) return;
    requestAnimationFrame(() => el.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' }));
  }, [focusedId]);

  const focusedDest = focusedId ? destinations[focusedId] : null;
  const row = (id, dest) => (
    <StayRow
      key={id}
      id={id}
      dest={dest}
      nights={nights[id]}
      onNights={setCityNights}
      anchorDest={anchorDest}
      isAnchor={id === anchorId}
      companions={companionsFor[id]}
      nightlyEur={nightlyFor(id, dest)}
    />
  );
  const renderStayGroup = (country, groupKey, title, list) => {
    if (!list.length) return null;
    const key = `${country}:${groupKey}`;
    const open = expandedGroups.has(key) || Boolean(q);
    const visible = open ? list : list.slice(0, CITIES_PREVIEW);
    return (
      <div className="guide-stay-group" key={key}>
        <div className="guide-stay-group-title">{title}</div>
        <div className="guide-city-list">{visible.map((cd) => row(cd.id, cd.dest))}</div>
        {!open && list.length > CITIES_PREVIEW && (
          <button className="guide-show-more" onClick={() => toggleGroup(key)}>
            {t(groupKey === 'gems' ? 'wizard.showAllGems' : 'wizard.showAllCities', { n: list.length })}
          </button>
        )}
      </div>
    );
  };
  // The picked cities in the order the trip will run: the order handed to
  // the planner, so the numbers here are the stops' numbers there.
  const routeIds = orderedIncludedIds;

  const sidePanel = (
    <div className="guide-city-side" ref={citySideRef}>
      {!focusedDest ? (
        // Before anything is picked, the panel offers the best-rated
        // candidates, one tap from their briefing.
        <div className="guide-side-idle">
          <div className="guide-side-idle-head">
            <MapPinIcon size={16} />
            <p>{t('wizard.tapCityHint')}</p>
          </div>
          {topCityPicks.length > 0 && (
            <>
              <div className="guide-stay-group-title">{t('wizard.bestRatedHere')}</div>
              <div className="guide-side-idle-list">
                {topCityPicks.map(({ id, dest }) => (
                  <button key={id} className="guide-side-idle-row" onClick={() => setFocusedId(id)}>
                    <CityThumb dest={dest} className="guide-nearby-thumb" />
                    <span className="guide-side-idle-text">
                      <b>
                        {cityLabel(dest.city)}
                        {selectedCountries.length > 1 && (
                          <Flag iso2={dest.iso2} className="guide-flag-img-sm guide-side-idle-flag" />
                        )}
                      </b>
                      <small>{cityInsight(dest)}</small>
                    </span>
                    {dest.rating?.score != null && <ScoreChip rating={dest.rating} size="xs" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <CityThumb dest={focusedDest} className="guide-city-side-photo" />
          <div className="guide-city-side-title">
            <b>{cityLabel(focusedDest.city)}</b>
            <Flag iso2={focusedDest.iso2} className="guide-flag-img-sm" />
            {focusedDest.rating?.score != null && <ScoreChip rating={focusedDest.rating} size="xs" />}
            {focusedDest.rating?.hidden_gem && <HiddenGemTag />}
          </div>
          {focusedId === anchorId && (
            <p className="guide-note"><PlaneIcon size={10} /> {t('wizard.youArriveHere')}</p>
          )}
          <p className="guide-city-side-insight">{cityInsight(focusedDest)}</p>
          <div className="guide-city-facts">
            {anchorDest && anchorDest.lat != null && focusedDest.lat != null && focusedId !== anchorId && (
              <div className="guide-city-fact">
                <span className="guide-city-fact-label">{t('wizard.fromArrival')}</span>
                <span className="guide-city-fact-value">{Math.round(haversineKm(anchorDest.lat, anchorDest.lon, focusedDest.lat, focusedDest.lon))} km</span>
              </div>
            )}
            {/* "Worth", not "Stay": Carta's advice on how long the place
                deserves, beside the nights actually planned. */}
            <div className="guide-city-fact">
              <span className="guide-city-fact-label">{t('wizard.worthLabel')}</span>
              <span className="guide-city-fact-value">
                {t('wizard.worthValue', { n: t(suggestedNights(focusedDest).textKey) })}
                {(nights[focusedId] || 0) > 0 && (
                  <span className="guide-city-fact-booked">
                    {t('wizard.youPlannedNights', { nights: nightsText(t, nights[focusedId]) })}
                  </span>
                )}
              </span>
            </div>
            {knownForFacts(focusedDest).map(([label, value]) => (
              <div className={`guide-city-fact ${label === 'Known for' ? 'guide-city-fact-known' : ''}`} key={label}>
                <span className="guide-city-fact-label">{label}</span>
                <span className="guide-city-fact-value">{value}</span>
              </div>
            ))}
          </div>
          {(nights[focusedId] || 0) > 0 ? (
            <div className="guide-city-side-actions">
              {/* Kit icon buttons at 48 px (T500, roadmap 1.3c 2.7). */}
              <div className="guide-nights wstay-nights-ctl" role="group" aria-label={t('wizard.nightsIn', { city: cityLabel(focusedDest.city) })}>
                <IconButton tone="surface" className="wiz-icon-main" label={t('wizard.fewerNights')} onClick={() => setCityNights(focusedId, (nights[focusedId] || 0) - 1)}>
                  <MinusGlyph />
                </IconButton>
                <span className="guide-nights-val" aria-live="polite">{nightsText(t, nights[focusedId])}</span>
                <IconButton
                  tone="surface"
                  className="wiz-icon-main"
                  label={t('wizard.moreNights')}
                  disabled={(nights[focusedId] || 0) >= 21}
                  onClick={() => setCityNights(focusedId, (nights[focusedId] || 0) + 1)}
                >
                  <PlusIcon size={20} />
                </IconButton>
              </div>
              <button className="guide-back" onClick={() => toggleCity(focusedId)}>{t('wizard.remove')}</button>
            </div>
          ) : (
            <button
              className="guide-next guide-city-side-add"
              onClick={() => {
                if (stayStyle === 'single' && includedIds.length >= 1) {
                  // One home base: the new pick replaces the old.
                  includedIds.forEach((id) => { if (id !== focusedId) toggleCity(id); });
                }
                toggleCity(focusedId);
              }}
            >
              <BedIcon size={12} /> {t(stayStyle === 'single' ? 'wizard.makeMyBase' : 'wizard.addToTrip')}
            </button>
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      <StepTitle className="guide-title">{t('wizard.stayTitle')}</StepTitle>
      {/* Building your own is reached from the bottom of the trips list, so
          this step owes it one quiet way back. */}
      {!booked.stays && (
        <button className="wready-link wready-back" onClick={() => setBuildMode('ready')}>
          &larr; {t('ready.backToReady')}
        </button>
      )}
      <p className="guide-sub">
        {anchorDest
          ? t(ownCarChosen ? 'wizard.stayIntroArrive' : 'wizard.stayIntroLand', { city: cityLabel(anchorDest.city) })
          : t('wizard.stayIntroFree')}
      </p>

      {/* What the algorithm did with the cities, said out loud: it reports
          rather than asks, and offers to share the nights out too. */}
      {cartaPlan && (
        <div className="wroute">
          <div className="wroute-head">
            <span className="wroute-label"><SparkIcon size={12} /> {t('route.title')}</span>
            {cartaPlan.kmSaved > 20 && (
              <span className="wroute-saved">{t('route.saved', { km: cartaPlan.kmSaved })}</span>
            )}
          </div>
          <div className="wroute-line">
            {cartaPlan.order.map((id, i) => destinations[id] && (
              <React.Fragment key={id}>
                {i > 0 && <span className="wroute-arrow" aria-hidden="true">&rsaquo;</span>}
                <span className="wroute-stop">
                  {cityLabel(destinations[id].city)}
                  <b>{cartaPlan.nights[id]}</b>
                </span>
              </React.Fragment>
            ))}
          </div>
          <div className="wroute-foot">
            <span className="wroute-fact">{t('route.km', { km: cartaPlan.km })}</span>
            <span className="wroute-fact">{t('route.hours', { h: Math.round(cartaPlan.hours) })}</span>
            {cartaPlan.crowded && <span className="wroute-warn"><AlertIcon size={11} /> {t('route.crowded')}</span>}
            {nightsDiffer && (
              <button className="wroute-apply" onClick={applyCartaNights}>
                {t('route.applyNights')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* One base, or changing stays? Once stops are on the board the
          question folds into a read-only answer with a Change. */}
      <div className="guide-staystyle">
        {includedIds.length > 0 && !stayStyleOpen ? (
          <div className="guide-answered">
            <span className="guide-answered-label">{t('wizard.howStay')}</span>
            <span className="guide-answered-value">
              {stayStyle === 'single' ? <BedIcon size={11} /> : <RouteIcon size={11} />}
              {t(stayStyle === 'single' ? 'wizard.oneHomeBase' : 'wizard.changeStays')}
            </span>
            <button className="guide-answered-edit" onClick={() => setStayStyleOpen(true)}>
              {t('wizard.change')}
            </button>
          </div>
        ) : (
          <>
            <span className="trip-field-label">{t('wizard.howStay')}</span>
            <div className="guide-datemode guide-staystyle-toggle">
              <button
                className={stayStyle === 'multi' ? 'on' : ''}
                onClick={() => { setStayStyle('multi'); setStayStyleOpen(false); }}
              >
                <RouteIcon size={12} /> {t('wizard.changeStays')}
              </button>
              <button
                className={stayStyle === 'single' ? 'on' : ''}
                onClick={() => { setStayStyle('single'); setStayStyleOpen(false); }}
              >
                <BedIcon size={12} /> {t('wizard.oneHomeBase')}
              </button>
            </div>
            {stayStyle === 'single' && (
              <p className="guide-note">{t('wizard.oneBaseNote')}</p>
            )}
          </>
        )}
      </div>

      {/* Curated route shapes, fitted to THIS trip's nights. */}
      {stayTemplates.length > 0 && (
        <div className="guide-templates">
          <span className="trip-field-label"><SparkIcon size={11} /> {t('wizard.templatesLabel', { n: windowNights || flexNights })}</span>
          <div className="guide-template-row">
            {stayTemplates.map((tpl) => (
              <button key={tpl.key} className="guide-template" onClick={() => applyTemplate(tpl)}>
                <b className="guide-template-name">{t(tpl.labelKey)}</b>
                <span className="guide-template-route">
                  {tpl.picks.map((x, i) => (
                    <span key={x.id} className="guide-template-stop">
                      {i > 0 && <span className="guide-template-arrow" aria-hidden="true">→</span>}
                      {cityLabel(destinations[x.id]?.city) || x.id} <small>{nightsText(t, x.nights)}</small>
                    </span>
                  ))}
                </span>
                <small className="guide-template-legs">
                  {tpl.legKm > 0
                    ? t('wizard.tplStaysKm', { n: tpl.picks.length, km: tpl.legKm })
                    : t('wizard.tplStays', { n: tpl.picks.length })}
                </small>
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="guide-design-btn guide-design-btn-quiet" onClick={() => setDesignQuizOpen((v) => !v)} aria-expanded={designQuizOpen}>
        <span className="guide-design-spark"><SparkIcon size={13} /></span>
        <span className="guide-design-text">
          {t(stayStyle === 'single' ? 'wizard.pickMyBase' : 'wizard.pickMyCities')}
          <small>{t('wizard.nightsTuned', { n: windowNights || flexNights })}</small>
        </span>
      </button>

      {designQuizOpen && (
        <div className="guide-design-quiz">
          <div className="guide-quiz-q">
            <span className="trip-field-label">{t('wizard.howBusy')}</span>
            <div className="guide-months">
              {PACE_CHOICES.map((p) => (
                <button
                  key={p.key}
                  className={`guide-chip ${pace === p.key ? 'on' : ''}`}
                  aria-pressed={pace === p.key}
                  onClick={() => setPace(p.key)}
                >{t(p.labelKey)}</button>
              ))}
            </div>
          </div>
          {stayStyle === 'multi' && (
            <div className="guide-quiz-q">
              <span className="trip-field-label">{t('wizard.howManyStays')}</span>
              <div className="guide-months">
                <button className={`guide-chip ${quizStops === 0 ? 'on' : ''}`} aria-pressed={quizStops === 0} onClick={() => setQuizStops(0)}>{t('wizard.cartaDecides')}</button>
                {[2, 3, 4, 5].map((n) => (
                  <button key={n} className={`guide-chip ${quizStops === n ? 'on' : ''}`} aria-pressed={quizStops === n} onClick={() => setQuizStops(n)}>{n}</button>
                ))}
              </div>
            </div>
          )}
          {mustChoices.length > 0 && (
            <div className="guide-quiz-q">
              <span className="trip-field-label">{t('wizard.mustCities')}</span>
              <div className="guide-months">
                {mustChoices.map(({ id, dest }) => (
                  <button
                    key={id}
                    className={`guide-chip ${quizMust.has(id) ? 'on' : ''}`}
                    aria-pressed={quizMust.has(id)}
                    onClick={() => toggleQuizMust(id)}
                  >{cityLabel(dest.city)}</button>
                ))}
              </div>
            </div>
          )}
          <button className="guide-next guide-quiz-go" onClick={applyDesign}>
            <SparkIcon size={12} /> {t(stayStyle === 'single' ? 'wizard.designMyStay' : 'wizard.designMyRoute')}
          </button>
        </div>
      )}

      {designedNote && includedIds.length > 0 && (
        <p className="guide-note"><CheckIcon size={11} /> {t(includedIds.length === 1 ? 'wizard.designedOneStop' : 'wizard.designedStops', { n: includedIds.length })}</p>
      )}

      {/* Search, the narrowing filters and the view switch are one toolbar. */}
      <div className="guide-toolbar">
        <input
          className="guide-search"
          type="search"
          value={staySearch}
          onChange={(e) => setStaySearch(e.target.value)}
          placeholder={t('wizard.searchAnyCity')}
          aria-label={t('wizard.searchCities')}
        />
        <div className="guide-stay-filters">
          <label className="guide-stay-filter">
            <span>{t('wizard.stayFilterRating')}</span>
            <select value={stayMinRating} onChange={(e) => setStayMinRating(Number(e.target.value))}>
              <option value="0">{t('wizard.stayFilterAny')}</option>
              <option value="6">6+</option>
              <option value="7">7+</option>
              <option value="8">8+</option>
              <option value="9">9+</option>
            </select>
          </label>
          <label className="guide-stay-filter">
            <span>{t('wizard.stayFilterPrice')}</span>
            <select value={stayMaxNightly} onChange={(e) => setStayMaxNightly(Number(e.target.value))}>
              <option value="0">{t('wizard.stayFilterAny')}</option>
              <option value="60">{t('wizard.stayFilterUpTo', { price: formatMoney(60) })}</option>
              <option value="90">{t('wizard.stayFilterUpTo', { price: formatMoney(90) })}</option>
              <option value="120">{t('wizard.stayFilterUpTo', { price: formatMoney(120) })}</option>
              <option value="180">{t('wizard.stayFilterUpTo', { price: formatMoney(180) })}</option>
              <option value="250">{t('wizard.stayFilterUpTo', { price: formatMoney(250) })}</option>
            </select>
          </label>
          {(stayMinRating > 0 || stayMaxNightly > 0) && (
            <button
              className="guide-stay-filter-clear"
              onClick={() => { setStayMinRating(0); setStayMaxNightly(0); }}
            >{t('wizard.stayFilterClear')}</button>
          )}
        </div>
        <div className="guide-datemode guide-stay-view">
          <button className={stayView === 'map' ? 'on' : ''} aria-pressed={stayView === 'map'} onClick={() => setStayView('map')}>{t('wizard.map')}</button>
          <button className={stayView === 'list' ? 'on' : ''} aria-pressed={stayView === 'list'} onClick={() => setStayView('list')}>{t('wizard.list')}</button>
        </div>
      </div>

      {stayView === 'map' && (
        <>
          {/* From 1024 px the map is the wizard's right column; the step
              keeps the briefing that a pin tap fills. */}
          <div className={`guide-stay-wrap ${mapAside ? 'is-aside' : ''}`}>
            {!mapAside && (
              <CityPickerMap
                cities={mapCities}
                onToggle={toggleCity}
                onFocus={(id) => setFocusedId((cur) => (cur === id ? '' : id))}
                anchor={anchorDest && anchorDest.lat != null ? { lat: anchorDest.lat, lon: anchorDest.lon } : null}
              />
            )}
            {sidePanel}
          </div>
          <div className="guide-tier-legend">
            <span className="guide-tier guide-tier-top"><StarIcon size={9} /> {t('wizard.legendMust')}</span>
            <span className="guide-tier guide-tier-great"><DiamondIcon size={9} /> {t('wizard.legendGreat')}</span>
            <span className="guide-tier guide-tier-good"><DotIcon size={8} /> {t('wizard.legendWorth')}</span>
            <span className="guide-tier-legend-note">{t('wizard.legendNote')}</span>
          </div>
        </>
      )}

      {(stayView === 'list' || q) && (
        <>
          {stayCountries.map((c) => (
            <div key={c.country} className="guide-country-block">
              <div className="guide-block-head"><Flag iso2={c.iso2} className="guide-flag-img-sm" /> {c.country}</div>
              {renderStayGroup(c.country, 'big', t('wizard.groupCities'), c.big)}
              {renderStayGroup(c.country, 'gems', t('wizard.groupGems'), c.gems)}
              {!c.big.length && !c.gems.length && (
                <p className="guide-empty">{t('wizard.noStayMatch', { country: c.country, q: staySearch })}</p>
              )}
            </div>
          ))}
          {elsewhereMatches.length > 0 && (
            <div className="guide-country-block">
              <div className="guide-block-head">{t('wizard.groupBeyond')}</div>
              <div className="guide-city-list">{elsewhereMatches.map(({ id, dest }) => row(id, dest))}</div>
            </div>
          )}
        </>
      )}

      {/* The picked cities, numbered in route order (T500, 1.3c 2.7), so
          nights stay adjustable while the map has the screen. */}
      {stayView === 'map' && !q && includedIds.length > 0 && (
        <div className="guide-stay-group">
          <div className="guide-stay-group-title">{t('wizard.groupYourStops')}</div>
          <ol className="guide-city-list wstay-route">
            {routeIds.map((id, i) => destinations[id] && (
              <li className="wstay-route-row" key={id}>
                <span className="wstay-route-i" aria-hidden="true">{i + 1}</span>
                {row(id, destinations[id])}
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}
