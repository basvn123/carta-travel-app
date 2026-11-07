import { tripDaysBetween } from '../../lib/runtime_pricing.js';
import { addDays, fmtDate as fmtDateFull } from '../../lib/dates.js';
import { MapPinIcon, CalendarIcon, StarIcon, SearchIcon, BedIcon, TownIcon, HomeIcon, CrosshairIcon, RouteIcon, ClockIcon } from '../../components/Icons.jsx';
import { DayRail } from '../DayRail.jsx';
import { Money, Button, Chip, Card } from '../../components/ui/index.js';
import { CartaChatPlanner } from '../CartaChatPlanner.jsx';
import { UndoToast } from '../DayPlanPanel.jsx';
import { DayExploreBuilder } from '../DayExploreBuilder.jsx';
import { hasImminentTrip, ContinueTripCards, DayPlanCards } from '../DayTripCards.jsx';
import { SAVED_MOCK, fmtDate } from './dayPlannerData.js';
import { DayWizardShell } from '../DayWizardShell.jsx';
import { geoLines } from '../../lib/geocode.js';
import { DateField } from '../../components/DateField.jsx';
import { Stepper } from '../../components/FilterControls.jsx';
import { DayIdeasStep } from '../DayIdeasStep.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CreditChip } from '../../components/CreditChip.jsx';

export function DayPlannerStart({
  DATE_HORIZON_DAYS, addLandingCity, allCityOptions, authConfigured, builderPreview, canLocate,
  chatDefaultTownId, chatHasEvents, chatPresets, chatTownCounts, chatWeatherNote, costs,
  dayDateMax, dayDateMin, dayWindowUsable, deleteStandalone, destinations, doUndo, explorePois,
  exploreTowns, flowDir, goManualWithIdeas, hiddenPlanIds, homeTownId, ideas, ideasTownId,
  importChatPlan, landingStep, letCartaFinish, locBusy, locErr, movePick, newDayCount,
  newStartDate, newStayPoint, newStayWindow, newStops, onOpenDest, onOpenFeature, onPlanTrip,
  onRequestAuth, onStayBlur, onStayFocus, onStayKeyDown, openPlan, openStandalone,
  pickRecentStay, pickUpcomingStay, plansError, plansLoading, prefs, quickDates, recentStays,
  removeLandingCity, researchTown, resolveNearestTown, runChatAi, savedPlans, searchStay,
  selPois, setDayIdx, setFlowDir, setIdeas, setLandingStep, setNewDayCount, setNewStartDate,
  setNewStayPoint, setNewStayWindow, setNewStops, setPlansTry, setSelPois, setStayCursor,
  setStayQuery, setStayResults, setStopIdx, shortlistPoints, standalonePlans,
  startExplorePlanning, startName, stayCursor, stayQuery, stayResultRefs, stayResults,
  staySearching, stayTownId, suggestCityAi, t, today, togglePoiPick, undoPending, upcomingStays,
  useMyLocation, user,
}) {
  const forkKey = landingStep === 'chat' ? 'chat' : landingStep === 'manual' ? 'manual' : null;
  const FLOW = [
    { key: 'stay', label: t('day.stepStart') },
    { key: 'when', label: t('day.stepDays') },
    { key: 'ideas', label: t('day.stepIdeas') },
    { key: 'how', label: t('day.stepHow') },
    {
      key: forkKey || 'plan',
      label: forkKey === 'chat' ? t('day.stepCarta') : forkKey === 'manual' ? t('day.stepPick') : t('day.stepPlan'),
    },
  ];
  const at = Math.max(0, FLOW.findIndex((s) => s.key === landingStep));
  const goFlow = (i) => {
    const key = FLOW[i]?.key;
    if (!key || key === 'plan') return;
    setFlowDir(i < at ? 'back' : 'fwd');
    setLandingStep(key);
  };
  const back = () => goFlow(at - 1);
  const startOver = () => {
    setFlowDir('back');
    setNewStayPoint(null);
    setNewStayWindow(null);
    setNewDayCount(1);
    setIdeas([]);
    setSelPois([]);
    setNewStops([]);
    setStayQuery('');
    setStayResults(null);
    setLandingStep('stay');
  };
  const wizard = { steps: FLOW, at, onGo: goFlow, onStartOver: startOver, dir: flowDir };

  // Picking a day off a trip card answers the start and the day in one tap.
  const openDayFromTrip = async (planId, stopIndex, dayIndex) => {
    try {
      await openPlan(planId);
      setStopIdx(Math.max(0, stopIndex || 0));
      setDayIdx(Math.max(0, dayIndex || 0));
    } catch { /* the trip was deleted on another device */ }
  };

  const nextLabel = (i) => t('wizard.nextTo', { step: FLOW[i]?.label || '' });
  const maxDays = newStayWindow?.to && newStartDate
    ? Math.max(1, Math.min(7, tripDaysBetween(newStartDate, newStayWindow.to) || 1))
    : 7;
  const dayCount = Math.min(newDayCount, maxDays);
  const lastDay = newStartDate ? addDays(newStartDate, Math.max(0, dayCount - 1)) : null;
  const daysLine = newStartDate
    ? (dayCount > 1
      ? t('day.daysSpan', { from: fmtDateFull(newStartDate, true), to: fmtDateFull(lastDay, true), n: dayCount })
      : fmtDateFull(newStartDate, true))
    : '';

  // The three places the builder card shows, each named under its photo.
  const forkPlaces = (() => {
    const out = [];
    const seen = new Set();
    const take = (sightsOnly) => {
      for (const p of explorePois) {
        if (out.length === 3) return;
        const img = p.item?.img;
        if (!img || seen.has(img) || (sightsOnly && p.cat !== 'sight')) continue;
        seen.add(img);
        out.push({ img, name: p.item.name });
      }
    };
    take(true);
    take(false);
    return out;
  })();
  const homeDest = homeTownId ? destinations[homeTownId] : null;

  // What Carta is planning around (T459): the trip planner's recap, every
  // answer given so far as a chip that goes back to its question. It
  // replaces the T433 start pill, whose one Change button went to step 1
  // whatever was being changed.
  const editTitle = (i) => t('wizard.recapEdit', { step: FLOW[i]?.label || '' });
  const recap = !newStayPoint || at === 0 ? [] : [
    { key: 'start', Icon: MapPinIcon, text: startName || newStayPoint.shortLabel || newStayPoint.label, onClick: () => goFlow(0), title: editTitle(0) },
    ...(at > 1 && daysLine ? [{ key: 'days', Icon: CalendarIcon, text: daysLine, onClick: () => goFlow(1), title: editTitle(1) }] : []),
    ...(at > 2 && ideas.length ? [{
      key: 'ideas',
      Icon: StarIcon,
      text: t(ideas.length === 1 ? 'day.ideasOne' : 'day.ideasMany', { n: ideas.length }),
      onClick: () => goFlow(2),
      title: editTitle(2),
    }] : []),
  ];

  // The card beside every step (T459), the trip planner's "Your trip": what
  // a day at the start costs one person, then the answers that shape it.
  const costRowHere = costs && homeTownId ? costs.get(homeTownId) : null;
  const figure = costRowHere && costRowHere.dayEur != null
    ? { eur: costRowHere.dayEur, est: costRowHere.stayLevel !== 'city' || costRowHere.foodLevel !== 'city' }
    : null;
  const railRows = newStayPoint ? [
    { key: 'start', label: t('dayr.start'), value: newStayPoint.shortLabel || startName },
    { key: 'days', label: t('wizard.summaryDates'), value: at > 0 ? daysLine : '' },
  ] : [];
  const landingRail = <DayRail figure={figure} rows={railRows} empty={!newStayPoint} />;
  const railSummary = figure
    ? <><span className="plan-total-btn-lbl">{t('dayr.title')}</span><span className="plan-total-btn-n"><Money value={figure.eur} est={figure.est} /></span></>
    : null;

  if (landingStep === 'chat') {
    return (
      <div className="trip-planner-screen day-flow-screen">
        <CartaChatPlanner
          wizard={wizard}
          onWizardBack={back}
          recap={recap}
          rail={landingRail}
          railSummary={railSummary}
          dayCount={dayCount}
          startName={startName}
          initialAnswers={chatPresets}
          onSignIn={onRequestAuth}
          towns={exploreTowns}
          dateISO={newStartDate}
          groupSize={prefs?.aiGroupSize || 2}
          signedIn={!!user && authConfigured}
          onRun={runChatAi}
          presetTownId={ideasTownId}
          ideas={ideas}
          defaultTownId={chatDefaultTownId}
          townCandidateCount={chatTownCounts.id === chatDefaultTownId ? chatTownCounts.total : null}
          townMustSeeCount={chatTownCounts.id === chatDefaultTownId ? chatTownCounts.mustSee : null}
          weatherNote={chatWeatherNote}
          hasEvents={chatHasEvents}
          onImport={importChatPlan}
          onBack={() => goFlow(3)}
          onManual={() => { setFlowDir('fwd'); setLandingStep('manual'); }}
          stayPoint={newStayPoint}
          cityOptions={allCityOptions}
          onSuggestCity={suggestCityAi}
          resolveNearest={resolveNearestTown}
          onResearchCity={researchTown}
        />
        <UndoToast pending={undoPending} onUndo={doUndo} />
      </div>
    );
  }

  if (landingStep === 'manual' && newStayPoint) {
    return (
      <div className="trip-planner-screen day-flow-screen">
        <DayExploreBuilder
          wizard={wizard}
          onWizardBack={back}
          startName={startName}
          recap={recap}
          railRows={railRows}
          figure={figure}
          preview={builderPreview}
          stay={newStayPoint}
          dateISO={newStartDate}
          explorePois={explorePois}
          exploreTowns={exploreTowns}
          destinations={destinations}
          stayTownId={stayTownId}
          homeTownId={homeTownId}
          ideas={ideas}
          shortlistPoints={shortlistPoints}
          picks={selPois}
          townPicks={newStops}
          onTogglePick={togglePoiPick}
          onMovePick={movePick}
          onToggleTown={(id) => (newStops.some((s) => s.destinationId === id)
            ? removeLandingCity(id) : addLandingCity(id))}
          onStartPlanning={startExplorePlanning}
          onLetCartaPlan={letCartaFinish}
          onOpenDest={onOpenDest}
          onOpenFeature={onOpenFeature}
        />
        <UndoToast pending={undoPending} onUndo={doUndo} />
      </div>
    );
  }

  const foot = {
    stay: {
      next: { label: nextLabel(1), onClick: () => goFlow(1), disabled: !newStayPoint },
    },
    when: {
      back,
      summary: daysLine ? <span className="dayw-foot-days">{daysLine}</span> : null,
      next: { label: nextLabel(2), onClick: () => goFlow(2), disabled: !newStartDate },
    },
    ideas: {
      back,
      summary: ideas.length
        ? <span className="dayw-foot-days">{t(ideas.length === 1 ? 'day.ideasOne' : 'day.ideasMany', { n: ideas.length })}</span>
        : null,
      next: { label: ideas.length ? nextLabel(3) : t('day.skipIdeas'), onClick: () => goFlow(3), quiet: !ideas.length },
    },
    how: { back },
  }[landingStep] || {};

  const tripsLead = Boolean(user) && authConfigured && hasImminentTrip(savedPlans);
  const tripCards = (lead) => (
    <ContinueTripCards
      plans={savedPlans}
      destinations={destinations}
      loading={plansLoading}
      failed={plansError}
      onRetry={() => setPlansTry((n) => n + 1)}
      signedIn={Boolean(user) || SAVED_MOCK}
      authConfigured={authConfigured || SAVED_MOCK}
      onOpenDay={openDayFromTrip}
      onRequestAuth={onRequestAuth}
      onPlanTrip={onPlanTrip}
      lead={lead}
    />
  );

  return (
    <div className="trip-planner-screen day-flow-screen">
      <DayWizardShell
        {...wizard}
        layout={landingStep === 'how' ? 'mid' : 'form'}
        foot={foot}
        canvasKey={landingStep}
        className={`dayw-on-${landingStep}`}
        recap={recap}
        title={{
          stay: t('day.whereStaying'),
          when: t('day.whichDays'),
          ideas: t('ideas.question'),
          how: t('day.howToPlan'),
        }[landingStep]}
        rail={landingRail}
        railSummary={railSummary}
        railTitle={t('dayr.title')}
      >
        {/* STEP 1, where the day starts. */}
        {landingStep === 'stay' && (
          <div className="dayw-step">
            {tripsLead && tripCards(true)}
            {newStayPoint ? (
              <div className="dayw-chosen">
                <MapPinIcon size={18} />
                <span className="dayw-chosen-text">
                  <b>{newStayPoint.shortLabel || newStayPoint.label}</b>
                  {startName && startName !== (newStayPoint.shortLabel || newStayPoint.label) && <small>{startName}</small>}
                </span>
                <Button
                  variant="quiet"
                  size="sm"
                  className="dayw-start-change"
                  onClick={() => { setNewStayPoint(null); setNewStayWindow(null); setStayResults(null); setStayQuery(''); }}
                >{t('day.change')}</Button>
              </div>
            ) : (
              <div className="day-stay-search day-flow-search dayw-search">
                <SearchIcon size={18} className="dayw-search-ico" />
                <input
                  className="day-stay-input"
                  type="text"
                  value={stayQuery}
                  onChange={(e) => setStayQuery(e.target.value)}
                  onKeyDown={onStayKeyDown}
                  onFocus={onStayFocus}
                  onBlur={onStayBlur}
                  placeholder={t('day.stayPlaceholder')}
                  aria-label={t('day.stayAria')}
                  role="combobox"
                  aria-expanded={Boolean(stayResults?.length)}
                  aria-controls="day-stay-results"
                  aria-autocomplete="list"
                  autoFocus
                />
                <Button className="trip-add-btn" onClick={searchStay} disabled={staySearching || stayQuery.trim().length < 3}>
                  {staySearching ? t('day.searching') : t('day.find')}
                </Button>
              </div>
            )}
            {newStayPoint ? null : stayResults ? (
              stayResults.length ? (
                <div className="day-stay-results dayw-results" id="day-stay-results" role="listbox">
                  {stayResults.map((r, i) => {
                    const lines = geoLines(r);
                    const KindIcon = r.kind === 'hotel' ? BedIcon : r.kind === 'town' ? TownIcon : HomeIcon;
                    return (
                      <button
                        key={i}
                        ref={(el) => { stayResultRefs.current[i] = el; }}
                        className={`day-stay-result dayw-hit${stayCursor === i ? ' on' : ''}`}
                        role="option"
                        aria-selected={stayCursor === i}
                        onFocus={() => setStayCursor(i)}
                        onKeyDown={onStayKeyDown}
                        onClick={() => { setNewStayWindow(null); setNewStayPoint(r); }}
                      >
                        <span className="dayw-hit-ico" aria-hidden="true"><KindIcon size={18} /></span>
                        <span className="dayw-hit-text">
                          <b>{lines.title || r.shortLabel || r.label}</b>
                          {lines.rest && <small>{lines.rest}</small>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="dayw-note">{t('day.noAddressMatchTown')}</p>
              )
            ) : (
              <div className="dayw-quick">
                {canLocate && (
                  <Button size="sm" className="dayw-quick-row" iconStart={<CrosshairIcon size={18} />} onClick={useMyLocation} disabled={locBusy}>
                    {locBusy ? t('day.locating') : t('day.useMyLocation')}
                  </Button>
                )}
                {locErr && <p className="dayw-note">{locErr}</p>}
                {upcomingStays.map((r) => (
                  <Button key={r.key} size="sm" className="dayw-quick-row" iconStart={<RouteIcon size={18} />} onClick={() => pickUpcomingStay(r)}>
                    {r.name} <small>{t('day.tripFrom', { date: fmtDate(r.from) })}</small>
                  </Button>
                ))}
                {recentStays.map((r) => (
                  <Button key={r.key} size="sm" className="dayw-quick-row" iconStart={<ClockIcon size={18} />} onClick={() => pickRecentStay(r)}>
                    {r.label}
                  </Button>
                ))}
              </div>
            )}

            {/* Work already started, under the question it continues. */}
            <DayPlanCards
              plans={standalonePlans.filter((sp) => !hiddenPlanIds.has(sp.id))}
              destinations={destinations}
              onOpen={openStandalone}
              onDelete={deleteStandalone}
            />
            {!tripsLead && tripCards(false)}
          </div>
        )}

        {/* STEP 2, which days. */}
        {landingStep === 'when' && (
          <div className="dayw-step">
            <div className="dayw-when">
              <div className="dayw-when-cal">
                <div className="dayw-chips" role="group" aria-label={t('day.whenVisiting')}>
                  {quickDates.map((q) => (
                    <Chip
                      key={q.key}
                      selected={newStartDate === q.iso}
                      onClick={() => setNewStartDate(q.iso)}
                    >
                      {q.labelKey ? t(q.labelKey) : q.label}
                    </Chip>
                  ))}
                </div>
                <DateField
                  inline
                  value={newStartDate}
                  rangeStart={newStartDate}
                  rangeEnd={lastDay}
                  min={dayWindowUsable ? dayDateMin : today}
                  max={dayWindowUsable ? dayDateMax : addDays(today, DATE_HORIZON_DAYS)}
                  onChange={setNewStartDate}
                  placeholder={t('day.startDate')}
                />
              </div>
              <div className="dayw-count">
                <span className="dayw-count-text">
                  <b>{t('day.howManyDays')}</b>
                  <small>{daysLine}</small>
                </span>
                <Stepper
                  value={dayCount}
                  min={1}
                  max={maxDays}
                  onChange={setNewDayCount}
                  ariaLabel={t('day.howManyDays')}
                  decLabel={t('day.fewerDays')}
                  incLabel={t('day.moreDays')}
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3, anything already in mind. Skip is the footer. */}
        {landingStep === 'ideas' && (
          <div className="dayw-step">
            <DayIdeasStep
              stayPoint={newStayPoint}
              explorePois={explorePois}
              exploreTowns={exploreTowns}
              shortlistPoints={shortlistPoints}
              destinations={destinations}
              ideas={ideas}
              onChange={setIdeas}
            />
          </div>
        )}

        {/* STEP 4, how. Two equal answers, each showing what it gives. */}
        {landingStep === 'how' && (
          <div className="dayw-step">
            <div className="dayw-fork">
              <Card
                layout="tile"
                as="div"
                className="dayw-fork-card"
                onOpen={() => { setFlowDir('fwd'); setLandingStep('chat'); }}
                media={(
                  <span className="dayw-fork-photo">
                    <HeroImage
                      url={homeDest?.image?.url || forkPlaces[0]?.img || ''}
                      city={homeDest?.city || startName}
                      iso2={homeDest?.iso2}
                      maxWidth={960}
                      sizes="(max-width: 768px) 92vw, 520px"
                      ratio={[16, 9]}
                    />
                  </span>
                )}
                title={t('day.useChatbot')}
                meta={(
                  <span className="dayw-fork-body">
                    <span className="dayw-fork-sub">
                      {t(dayCount > 1 ? 'day.forkCartaSubDays' : 'day.forkCartaSub', { n: dayCount })}
                    </span>
                    <CreditChip />
                  </span>
                )}
              />
              <Card
                layout="tile"
                as="div"
                className="dayw-fork-card"
                onOpen={() => { setFlowDir('fwd'); goManualWithIdeas(); }}
                media={(
                  <span className={`dayw-fork-mosaic n${forkPlaces.length}`}>
                    {forkPlaces.map((p) => (
                      <span className="dayw-fork-tile" key={p.img}>
                        <HeroImage url={p.img} city={p.name} maxWidth={500} sizes="200px" ratio={[1, 1]} />
                      </span>
                    ))}
                  </span>
                )}
                title={t('day.planManually')}
                meta={(
                  <span className="dayw-fork-body">
                    <span className="dayw-fork-sub">
                      {startName ? t('day.forkBuildSub', { town: startName }) : t('day.planManuallySubHere')}
                    </span>
                    {/* Said beside the other card's cost, so the two answers
                        compare line for line and end together. */}
                    <span className="credit-chip">{t('day.forkFree')}</span>
                  </span>
                )}
              />
            </div>
          </div>
        )}
      </DayWizardShell>
      <UndoToast pending={undoPending} onUndo={doUndo} />
    </div>
  );
}
