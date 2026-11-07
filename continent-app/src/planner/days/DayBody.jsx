import { CheckIcon, BookmarkIcon, CloseIcon } from '../../components/Icons.jsx';
import { Button, Chip, IconButton } from '../../components/ui/index.js';
import { DayPills, DayStart } from './DayStart.jsx';
import { DaySwitcher, DayStayBar } from '../DayWorkspaceChrome.jsx';
import { fmtDate as fmtDateFull } from '../../lib/dates.js';
import { dayAiPreset, fromDraft } from '../flow/tripSettings.js';
import { plannerStore } from '../plannerStore.js';
import { cityLabel } from '../../lib/placeName.js';
import { Dropdown } from '../../components/Dropdown.jsx';
import { DaySummary, DayGmaps, DayKit, DayExports } from '../DayOverview.jsx';
import { DayTripTransport } from '../DayTripTransport.jsx';
import { DayPlanPanel } from '../DayPlanPanel.jsx';
import { DayTownGuide } from './DayTownGuide.jsx';

export function DayBody({
  addBody, addCityId, addStandaloneCity, adding, aiPlan, allCityOptions, assignedItems,
  assignments, canMoveRow, cityAddOpen, data, dayBands, dayCost, dayIdx, dayMonth, dayMoreItems,
  dayNumber, daySaveState, dayStepFree, dayTicketRows, dayTickets, dayTitle, dayTripFrom,
  dayTripView, days, detail, downloadIcsFile, downloadKmlFile, downloadPdf, dwellOf,
  flaggedLegs, flashRow, focusRow, gmapsParts, goToPlanDay, isNarrow, kitTools, moveAssigned,
  offPath, openAdd, optimizeNow, patchStandalone, pinnedWalksBlock, plan, planDays,
  removeStopWithUndo, routeState, rowRefs, saveToSavedTrips, scheduleShown, searchStay,
  setAddCityId, setAiOpen, setBotPreset, setCityAddOpen, setDayIdx, setDetail, setHoverRow,
  setOverview, setStayQuery, setStayResults, setStopIdx, setTripMode, shareDay, shareDayLink,
  shareState, startInfo, stayLabel, stayLeg, stayQuery, stayResults, staySearching, stop,
  stopIdx, stops, t, tripMode, walkKmDay, walkLeg,
}) {
  return (
    <>
      <div className="dayws-titlebar">
        <h1 className="dayws-title">{dayTitle}</h1>
        {plan.standalone || daySaveState === 'saved' ? (
          <span className="day-save-status" title={t('dayws.autoSavedTitle')}><CheckIcon size={14} /> {t('dayws.saved')}</span>
        ) : (
          <Button size="sm" iconStart={<BookmarkIcon size={16} />} onClick={saveToSavedTrips}>{t('dayws.saveDay')}</Button>
        )}
      </div>

      {/* T898: the days as chips, All days first inside a trip; a lone
          standalone plan keeps the switcher with its menu. */}
      {stop && !plan.standalone && planDays.length > 0 && (
        <DayPills
          days={planDays.map((d, k) => ({ k, label: t('dayws.crumbDay', { n: k + 1 }), empty: !(assignments?.[d.si]?.[d.di] || []).length }))}
          current={dayNumber - 1}
          onPick={goToPlanDay}
          onAll={() => setOverview(true)}
        />
      )}

      {stop && plan.standalone && planDays.length > 0 && (
        <DaySwitcher
          index={dayNumber - 1}
          total={planDays.length}
          label={t('itin.dayN', { n: dayNumber })}
          date={days[dayIdx] ? fmtDateFull(days[dayIdx], true) : ''}
          onPrev={() => goToPlanDay(dayNumber - 2)}
          onNext={() => goToPlanDay(dayNumber)}
          moreItems={dayMoreItems}
        />
      )}

      {/* T898: Start your day, what is needed before leaving, on top. */}
      {stop && !adding && (
        <DayStart
          leaveMin={scheduleShown && assignedItems.length ? scheduleShown.startMin : null}
          first={assignedItems[0] ? { name: assignedItems[0].name, arriveMin: scheduleShown?.rows?.[0]?.arriveMin ?? null } : null}
          highC={dayMonth ? (data?.destinations?.[stop.destination_id]?.taste?.tmax_by_month?.[dayMonth - 1] ?? stop.dest?.taste?.tmax_by_month?.[dayMonth - 1] ?? null) : null}
          tickets={dayTickets}
          dayCost={dayCost}
          stayLabel={stayLabel}
          onPlan={() => { setBotPreset(plan.standalone ? { autoRun: true } : { ...dayAiPreset(fromDraft(plannerStore.getState())), autoRun: true }); setAiOpen(true); }}
          onAdd={() => openAdd('end')}
        />
      )}

      {stop && (stops.length > 1 || cityAddOpen) && (
        <div className="dayws-daybar">
          {stops.length > 1 && (
            <div className="dayws-cities" role="group" aria-label={t('dayws.citiesAria')}>
              {stops.map((s, i) => (
                <Chip
                  key={i}
                  selected={i === stopIdx}
                  onClick={() => { setStopIdx(i); setDayIdx(0); }}
                >{cityLabel(s.dest?.city || t('day.unknown'))}</Chip>
              ))}
            </div>
          )}
          {cityAddOpen && plan.standalone && (
            <div className="dayws-city-add">
              <Dropdown
                value={addCityId}
                onChange={setAddCityId}
                options={allCityOptions}
                placeholder={t('dayws.cityPickPlaceholder')}
                searchPlaceholder={t('dayws.cityPickSearch')}
              />
              <Button size="sm" onClick={() => { addStandaloneCity(); setCityAddOpen(false); }} disabled={!addCityId}>{t('dayws.cityAdd')}</Button>
              <IconButton label={t('shape.close')} onClick={() => { setCityAddOpen(false); setAddCityId(''); }}><CloseIcon size={16} /></IconButton>
            </div>
          )}
        </div>
      )}

      {adding ? addBody : (
        <>
          {assignedItems.length > 0 && (
            <DaySummary
              schedule={scheduleShown}
              stops={assignedItems.length}
              walkKm={walkKmDay || 0}
              route={routeState ? { state: routeState, flagged: flaggedLegs } : null}
            />
          )}

          {/* T487: the day in Google Maps, under the day's head where a
              traveller looks when they set off; in the drawer on a phone. */}
          <DayGmaps parts={gmapsParts} dayNumber={stop && planDays.length > 0 ? dayNumber : null} />

          {plan.standalone && stop && (
            <DayStayBar
              stayLabel={stayLabel}
              editable={!!plan.standalone}
              query={stayQuery}
              onQuery={setStayQuery}
              onSearch={searchStay}
              searching={staySearching}
              results={stayResults}
              onPick={(r) => {
                patchStandalone((sp) => { sp.stayPoint = r; return sp; });
                setStayQuery('');
                setStayResults(null);
              }}
              onClear={() => {
                setStayQuery('');
                setStayResults(null);
                patchStandalone((sp) => { sp.stayPoint = null; return sp; });
              }}
              transportBlock={dayTripView ? (
                <DayTripTransport
                  fromDest={dayTripFrom}
                  toDest={dayTripView.toDest}
                  opts={dayTripView}
                  mode={tripMode}
                  onPickMode={setTripMode}
                />
              ) : null}
            />
          )}

          <DayPlanPanel
            items={assignedItems}
            dayNumber={dayNumber}
            city={stop?.dest?.city || ''}
            schedule={scheduleShown}
            bands={dayBands}
            legs={assignedItems.map((_, i) => walkLeg(i))}
            stayLeg={stayLeg}
            offPath={offPath}
            start={startInfo}
            stepFree={dayStepFree}
            compact={isNarrow}
            dwellOf={dwellOf}
            onMove={moveAssigned}
            canMove={canMoveRow}
            onRemove={removeStopWithUndo}
            rowRefs={rowRefs}
            flashIdx={flashRow?.idx ?? null}
            onHoverRow={setHoverRow}
            focusIdx={focusRow}
            onAdd={openAdd}
            onBestRoute={optimizeNow}
            onAskCarta={() => { setBotPreset(plan.standalone ? null : dayAiPreset(fromDraft(plannerStore.getState()))); setAiOpen(true); }}
            canBestRoute={assignedItems.length >= 2}
            aiSummary={aiPlan?.summary || ''}
            walksBlock={pinnedWalksBlock}
            tickets={dayTicketRows}
            detail={detail}
            onDetail={setDetail}
          />

          <DayKit tools={kitTools} />

          {/* T898: the town's guide is about the town, not the day: one
              closed block after the day, without the empty questions. */}
          {stop?.dest && (
            <DayTownGuide
              dest={stop.dest}
              destId={stop.destination_id}
              month={dayMonth}
              folded
            />
          )}

          <DayExports
            onPdf={downloadPdf}
            onShareLink={shareDayLink}
            onShareText={shareDay}
            onIcs={downloadIcsFile}
            onKml={downloadKmlFile}
            note={shareState === 'copied' ? t('day.copied') : shareState === 'linked' ? t('dayws.linkCopied') : ''}
          />
        </>
      )}
    </>
  );
}
