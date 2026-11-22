import React, { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { Button } from '../../components/ui/index.js';
import { EyeIcon, PlusIcon } from '../../components/Icons.jsx';
import { countryName } from '../../lib/countryName.js';
import { extremes, nightsPerMonth, nightsPerYear, tripLogOrder, tripYear } from '../../lib/atlasFacts.js';
import { NAME_OF } from './atlas/plateData.js';
import { ExampleBar, RateTrip } from './TripParts.jsx';
import { Frame2 } from './atlas/Ink.jsx';
import {
  Badges, CostChart, Extremes, MonthsChart, PastRow, Sect, YearBars, YearCardSection,
} from './EuropeParts.jsx';

// The plate moved to ./atlas/AtlasPlate.jsx (G12 Phase B), which takes
// overlays; the plain map is re-exported here for its old importers.
export { EuropeMap } from './atlas/AtlasPlate.jsx';

/** One milestone as a badge label and its fact line, from lib/myTrips.europeMilestones(). */
function badgeOf(t, m, fmtMonth) {
  if (m.key === 'region') return { label: t(`mt.region.${m.region}`), sub: t('mt.msRegion', { region: t(`mt.region.${m.region}`) }), earned: true };
  if (m.key === 'next') {
    return {
      label: t(`mt.region.${m.region}`),
      sub: t('mt.msNextSub', { countries: m.cc.map((c) => countryName(c, NAME_OF[c] || c)).join(', ') }),
      earned: false,
    };
  }
  if (m.key === 'nightTrain') return { label: t('mt.badgeNightTrain'), sub: t('mt.msNightTrain'), earned: true };
  if (m.key === 'longest') {
    return { label: t('mt.badgeLongest'), sub: [t('mt.msLongest', { n: m.n }), m.title, m.when ? fmtMonth(m.when) : ''].filter(Boolean).join(', '), earned: true };
  }
  return { label: t('mt.badgeNorth'), sub: t('mt.msNorth', { city: m.city }), earned: true };
}

/**
 * Your Europe (T926; G12 Phase E, the "your atlas" reference). The plate,
 * the count chip, the year legend and Countries as a list live in the map
 * slot (AtlasSlot); this is the column under it.
 *
 * Empty: Add a past trip and See an example. With a record, in the
 * reference's order: Nights per year (a tap filters the map and the other
 * charts), When you travel and Your extremes (the hero, beside the map from
 * 1100 px), then the past trips, by year or by grade (the one list is also
 * the trip log), beside What your trips cost, the milestone badges and the
 * year card. A first record (under three trips) leads with the past trips.
 *
 *   trips      past trips in lib/atlasFacts' plain shape (examples only in example mode)
 *   year, onYear   the year filter, shared with the map
 *   past       [{ id, year, title, img, iso2, flags, nights, grade, vs, onOpen, open, below, menuActions, onRemove, removeLabel }]
 *   onGrade(id, n)  a grade given in place (memory.rating)
 *   onFill(id) opens the memory form for a trip without spend
 */
export function YourEurope({
  trips = [], year = null, onYear, ramp = {}, geo, milestones = [], countries = 0, past = [],
  onGrade, onFill, onRecap, onShare, sharing = false, ycModel = null, ycExample = '', onAddPast, pastForm, error, fmtMonth,
  example = false, onExample, onExampleClose, onLift = null,
}) {
  const { t } = useI18n();
  const [per, setPer] = useState('day');
  const [askId, setAskId] = useState('');
  // The past trip whose ten taps are open in its row (G12 polish).
  const [rowRate, setRowRate] = useState('');
  // Past trips by year or by the traveller's own grade: the one list that
  // also is the trip log (owner review 2026-11-22: the log repeated the list).
  const [order, setOrder] = useState('year');
  const has = trips.length > 0;
  const tv = useMemo(() => (year == null ? trips : trips.filter((x) => tripYear(x) === year)), [trips, year]);
  const bars = useMemo(() => nightsPerYear(trips), [trips]);
  const months = useMemo(() => nightsPerMonth(trips, { year }), [trips, year]);
  const ex = useMemo(() => (tv.length > 1 ? extremes(tv) : null), [tv]);
  const log = useMemo(() => tripLogOrder(trips), [trips]);

  if (!has && !pastForm && !error) {
    return (
      <div className="mt-europe atlas-eu is-empty">
        <div className="atlas-empty-acts">
          <Pressable className="atlas-btn" onClick={onAddPast}><PlusIcon size={18} />{t('saved.addPastTrip')}</Pressable>
          {onExample && <Button variant="secondary" className="mt-soft" iconStart={<EyeIcon size={18} />} onClick={onExample}>{t('mt.seeExample')}</Button>}
        </div>
        {/* Desktop: the column beside the map shows the shape of what a first trip fills in,
            the same three charts as bare shapes, no figures (owner review 2026-11-22). */}
        <div className="atlas-ghost" aria-hidden="true">
          <div className="atlas-ghost-b">
            <p className="atlas-ghost-h">{t('mt.nightsPerYear')}</p>
            <div className="atlas-ghost-years">{[46, 78, 60].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
          </div>
          <div className="atlas-ghost-b">
            <p className="atlas-ghost-h">{t('mt.whenYouTravel')}</p>
            <div className="atlas-ghost-months">{[0, 0, 0, 0, 44, 0, 70, 100, 30, 0, 0, 0].map((h, i) => <i key={i} style={{ height: `${Math.max(6, h)}%` }} className={h ? 'is-on' : ''} />)}</div>
          </div>
          <div className="atlas-ghost-b is-full">
            <p className="atlas-ghost-h">{t('mt.costTitle')}</p>
            <div className="atlas-ghost-cost">{[88, 64, 76].map((w, i) => <span key={i}><b /><i style={{ width: `${w}%` }} /></span>)}</div>
          </div>
        </div>
      </div>
    );
  }

  const spent = tv.filter((x) => Number.isFinite(x.spendPP) && x.spendPP > 0 && x.nights > 0)
    .map((x) => ({ ...x, year: tripYear(x) }));
  const missing = tv.length - spent.length;
  const ask = log.unrated.find((x) => x.id === askId) || (trips.length < 3 ? log.unrated[0] : null);
  const rate = ask ? (
    <RateTrip title={ask.title} onRate={(n) => { onGrade?.(ask.id, n); setAskId(''); }} />
  ) : null;
  const items = [
    ...milestones.map((m, i) => ({ id: `${m.key}-${m.region || i}`, key: m.key, ...badgeOf(t, m, fmtMonth) })),
    { id: 'ten', key: 'ten', label: t('mt.badge10'), earned: countries >= 10 },
    ...(milestones.some((m) => m.key === 'nightTrain') ? [] : [{ id: 'train', key: 'nightTrain', label: t('mt.badgeNightTrain'), earned: false }]),
  ];
  // The best trip's badge takes the umber fill; ties share it.
  const bestGrade = past.reduce((m, x) => (x.grade != null && x.grade > m ? x.grade : m), -1);
  const inYear = past.filter((x) => year == null || x.year === year);
  const years = [...new Set(inYear.map((x) => x.year))].sort((a, b) => b - a);
  const graded = inYear.some((x) => x.grade != null);
  const byGrade = order === 'grade' && graded;
  const row = (x, withYear = false) => (
    <PastRow
      key={x.id}
      x={x}
      top={x.grade != null && x.grade === bestGrade}
      withYear={withYear}
      rating={rowRate === x.id}
      onRateOpen={() => setRowRate((v) => (v === x.id ? '' : x.id))}
      onRate={onGrade ? (n) => { onGrade(x.id, n); setRowRate(''); } : undefined}
      onLift={onLift}
      geo={geo}
      trip={trips.find((tr) => tr.id === x.id) || null}
    />
  );
  // By grade: the best first, a tie by the newest; trips without a grade last.
  const ranked = byGrade ? [...inYear].sort((p, q) => ((q.grade ?? -1) - (p.grade ?? -1)) || (q.year - p.year)) : [];
  const sortSeg = graded && inYear.length > 1 ? (
    <Frame2 label={t('mt.pastSort')} options={[['year', t('mt.pastByYear')], ['grade', t('mt.pastByGrade')]]} value={byGrade ? 'grade' : 'year'} onChange={setOrder} />
  ) : null;
  const pastSect = (
    <Sect
      id="mt-past-h"
      full
      title={t('mt.pastTrips')}
      action={(
        <span className="atlas-past-acts">
          {sortSeg}
          {!example && !pastForm ? <Pressable className="atlas-lnk" onClick={onAddPast}><PlusIcon size={14} />{t('mt.add')}</Pressable> : null}
        </span>
      )}
    >
      {pastForm}
      {error && <p className="mt-error" role="alert">{error}</p>}
      {rate}
      {byGrade ? (
        <div className="atlas-prows mt-pgrid is-ranked">{ranked.map((x) => row(x, true))}</div>
      ) : years.map((y) => {
        const rows = inYear.filter((x) => x.year === y);
        const nights = rows.reduce((n, x) => n + (x.nights > 0 ? x.nights : 0), 0);
        return (
          <div className="atlas-pyear" key={y}>
            <h4 className="atlas-pyear-h">
              {y}
              {nights > 0 && <span>{t(nights === 1 ? 'saved.nights1' : 'saved.nightsN', { n: nights })}</span>}
            </h4>
            <div className="atlas-prows mt-pgrid">{rows.map((x) => row(x))}</div>
          </div>
        );
      })}
    </Sect>
  );
  const first = trips.length < 3;
  const yc = ycModel ? (
    <YearCardSection model={ycModel} geo={geo} onEdit={onRecap} onShare={onShare} busy={sharing} example={ycExample} />
  ) : null;
  const cost = (
    <CostChart
      trips={spent}
      per={per}
      onPer={setPer}
      missing={example ? 0 : missing}
      onFill={() => onFill?.(tv.find((x) => !(x.spendPP > 0))?.id)}
    />
  );
  // Two parts (owner review 2026-11-22, "one clean whole"): the hero stands
  // beside the map from 1100 px, the rest runs the full width under both,
  // the past trips on the left and the cost, milestones and year card beside.
  // On a phone they simply follow each other.
  return (
    <div className="mt-europe atlas-eu">
      {example && <ExampleBar onClose={onExampleClose} />}
      {first ? (
        <>
          <div className="atlas-hero atlas-eu-hero is-first">{pastSect}</div>
          <div className="atlas-rest atlas-eu-rest is-first">{cost}<Badges items={items} />{yc}</div>
        </>
      ) : (
        <>
          <div className="atlas-hero atlas-eu-hero">
            <Sect
              id="mt-npy-h"
              title={t('mt.nightsPerYear')}
              action={year != null ? <Pressable className="atlas-lnk" onClick={() => onYear?.(null)}>{t('mt.allYears')}</Pressable> : null}
            >
              <YearBars data={bars} ramp={ramp} year={year} onYear={onYear} />
            </Sect>
            <Sect id="mt-months-h" title={t('mt.whenYouTravel')}><MonthsChart months={months} /></Sect>
            {ex && <Extremes ex={ex} />}
          </div>
          <div className="atlas-rest atlas-eu-rest">
            <div className="atlas-eu-list">{pastSect}</div>
            <div className="atlas-eu-side">{cost}<Badges items={items} />{yc}</div>
          </div>
        </>
      )}
    </div>
  );
}
