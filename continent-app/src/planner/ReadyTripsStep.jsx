import React, { useEffect, useMemo, useState } from 'react';
import { loadTripsFor, rankTrips } from '../lib/trips.js';
import { tripHeadline, shapeLabel, transportLabel, seasonLabel, tripTags, cardThumb } from '../lib/tripStory.js';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { CountryPickerMap } from '../map/CountryPickerMap.jsx';
import { eur } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';
import {
  RouteIcon, CheckIcon, SparkIcon, BedIcon, LoopIcon,
} from '../components/Icons.jsx';

/**
 * The ready-made half of the planner: 2,258 itineraries that were composed and
 * checked by pipeline/trips, filtered down to the countries this traveller
 * ticked and the days they actually have.
 *
 * The screen is split because the choice is: one country in depth, or several
 * strung together. Those are different holidays and neither is a filter of the
 * other, so they get a column each rather than one list with a chip on it.
 *
 * Ticking a country off the row above rebuilds both columns. That is the whole
 * point of the step: the country picker was a shortlist of maybes, and this is
 * where the maybes turn into a route, so undoing one has to be one tap and has
 * to show its consequence immediately.
 *
 * Nothing here is invented. Every card is a published trip: real stops, real
 * nights, legs the transport engine agreed exist, and the checks it passed
 * printed on the card.
 */

/** How many of the traveller's own countries a trip actually visits. */
function coverage(trip, picked) {
  return (trip.countries || []).filter((cc) => picked.has(cc)).length;
}

function TripCard({ trip, picked, chosen, onPick, t }) {
  const tags = tripTags(trip, t, 2);
  const season = seasonLabel(trip, t);
  const covers = coverage(trip, picked);
  return (
    <button
      className={`wtrip ${chosen ? 'on' : ''}`}
      onClick={() => onPick(trip)}
      aria-pressed={chosen}
    >
      <span className="wtrip-media">
        {trip.img
          ? <img className="wtrip-img" src={cardThumb(trip.img.url)} alt="" loading="lazy" />
          : <span className="wtrip-img wtrip-noimg" aria-hidden="true"><RouteIcon size={22} /></span>}
        <span className="wtrip-scrim" aria-hidden="true" />
        <span className="wtrip-days"><b>{trip.days}</b> {t(trip.days === 1 ? 'trip.dayWord' : 'trip.daysWord')}</span>
        {chosen && <span className="wtrip-check"><CheckIcon size={12} /></span>}
        <span className="wtrip-name">{tripHeadline(trip, t)}</span>
      </span>
      <span className="wtrip-body">
        <span className="wtrip-route">
          {trip.cities.map((c, i) => (
            <React.Fragment key={`${c.city}-${i}`}>
              {i > 0 && <span className="wtrip-arrow" aria-hidden="true">&rsaquo;</span>}
              <span className="wtrip-city">
                <CountryFlag country={c.cc} size={10} />
                {c.city}
                <span className="wtrip-n">{c.n}</span>
              </span>
            </React.Fragment>
          ))}
        </span>
        <span className="wtrip-meta">
          <span className="wtrip-chip">{transportLabel(trip, t)}</span>
          <span className="wtrip-chip">{shapeLabel(trip, t)}</span>
          {tags.map((tag) => <span key={tag.code} className="wtrip-chip on">{tag.label}</span>)}
          {covers > 1 && <span className="wtrip-chip">{t('ready.covers', { n: covers })}</span>}
        </span>
        {trip.sights?.length > 0 && <span className="wtrip-sights">{trip.sights.slice(0, 3).join(', ')}</span>}
        <span className="wtrip-foot">
          <span className="wtrip-cost">{t('trip.perDay', { eur: eur(trip.cost.per_day_eur) })}</span>
          {season && <span className="wtrip-season">{season}</span>}
        </span>
      </span>
    </button>
  );
}

export function ReadyTripsStep({
  countries, allCountries, windowNights, selectedId, onPick, onToggleCountry, onBuildOwn,
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState(null);   // null = loading
  const [view, setView] = useState('list'); // 'list' | 'map'
  const [anyLength, setAnyLength] = useState(false);
  // How many cards each column is showing. A country pair can offer hundreds
  // of trips and nobody scrolls that; the count in the header is always the
  // real one, and the button says how many are still behind it, so the list is
  // short without the shortening being a secret.
  const [shown, setShown] = useState({ multi: 12, single: 12 });

  const picked = useMemo(() => {
    const set = new Set();
    for (const c of allCountries) if (countries.has(c.country)) set.add(c.iso2);
    return set;
  }, [countries, allCountries]);
  const ccKey = [...picked].sort().join(',');

  useEffect(() => {
    let live = true;
    setRows(null);
    if (!picked.size) { setRows([]); return undefined; }
    setShown({ multi: 12, single: 12 });
    loadTripsFor([...picked]).then((list) => { if (live) setRows(list || []); });
    return () => { live = false; };
  }, [ccKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A trip is offered when it visits at least one country still ticked. Length
  // follows the window from the first step, one day either side, because a
  // seven day trip is a perfectly good eight day trip with a slow morning in
  // it; "any length" opens that up when the window is unusual.
  const days = windowNights > 0 ? windowNights + 1 : null;
  const { multi, single, hidden } = useMemo(() => {
    const all = (rows || []).filter((trip) => coverage(trip, picked) > 0);
    const fitted = rankTrips(all, { days: anyLength ? null : days });
    const m = fitted.filter((x) => (x.countries || []).length > 1)
      .sort((a, b) => coverage(b, picked) - coverage(a, picked) || b.score - a.score);
    const s = fitted.filter((x) => (x.countries || []).length === 1);
    return { multi: m, single: s, hidden: all.length - fitted.length };
  }, [rows, picked, days, anyLength]);

  const empty = rows != null && multi.length === 0 && single.length === 0;

  return (
    <div className="wready">
      {/* The shortlist, still editable, with its consequence one row below. */}
      <div className="wready-tools">
        <div className="wready-chips">
          {allCountries.filter((c) => countries.has(c.country)).map((c) => (
            <button
              key={c.country}
              className="wready-chip on"
              onClick={() => onToggleCountry(c.country)}
              title={t('ready.dropCountry', { country: c.country })}
            >
              <CountryFlag country={c.iso2} size={12} />
              {c.country}
              <span className="wready-chip-x" aria-hidden="true">×</span>
            </button>
          ))}
        </div>
        <div className="guide-datemode guide-stay-view wready-view">
          <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>{t('wizard.map')}</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>{t('wizard.list')}</button>
        </div>
      </div>

      {view === 'map' && (
        <div className="wready-map">
          <CountryPickerMap countries={allCountries} selected={countries} onToggle={onToggleCountry} />
        </div>
      )}

      {rows == null && <p className="guide-empty">{t('ready.loading')}</p>}

      {empty && (
        <div className="wready-empty">
          <p>{t('ready.noneFit', { days: days || windowNights })}</p>
          <div className="wready-empty-actions">
            {!anyLength && days && (
              <button className="guide-back" onClick={() => setAnyLength(true)}>{t('ready.showAnyLength')}</button>
            )}
            <button className="guide-back" onClick={onBuildOwn}>{t('ready.buildOwn')}</button>
          </div>
        </div>
      )}

      {!empty && rows != null && (
        <div className="wready-split">
          <section className="wready-col">
            <div className="wready-col-head">
              <h3 className="wready-col-title"><RouteIcon size={13} /> {t('ready.multiTitle')}</h3>
              <span className="wready-col-n">{multi.length}</span>
            </div>
            <p className="wready-col-sub">{t('ready.multiSub')}</p>
            <div className="wready-grid">
              {multi.slice(0, shown.multi).map((trip) => (
                <TripCard key={trip.id} trip={trip} picked={picked} chosen={trip.id === selectedId} onPick={onPick} t={t} />
              ))}
              {multi.length === 0 && (
                <p className="guide-empty">{t('ready.noMulti')}</p>
              )}
            </div>
            {multi.length > shown.multi && (
              <button
                className="wready-more"
                onClick={() => setShown((p) => ({ ...p, multi: p.multi + 12 }))}
              >
                {t('ready.showMore', { n: multi.length - shown.multi })}
              </button>
            )}
          </section>

          <section className="wready-col">
            <div className="wready-col-head">
              <h3 className="wready-col-title"><BedIcon size={13} /> {t('ready.singleTitle')}</h3>
              <span className="wready-col-n">{single.length}</span>
            </div>
            <p className="wready-col-sub">{t('ready.singleSub')}</p>
            <div className="wready-grid">
              {single.slice(0, shown.single).map((trip) => (
                <TripCard key={trip.id} trip={trip} picked={picked} chosen={trip.id === selectedId} onPick={onPick} t={t} />
              ))}
              {single.length === 0 && (
                <p className="guide-empty">{t('ready.noSingle')}</p>
              )}
            </div>
            {single.length > shown.single && (
              <button
                className="wready-more"
                onClick={() => setShown((p) => ({ ...p, single: p.single + 12 }))}
              >
                {t('ready.showMore', { n: single.length - shown.single })}
              </button>
            )}
          </section>
        </div>
      )}

      {!empty && rows != null && (hidden > 0 || anyLength) && (
        <p className="wready-note">
          <LoopIcon size={11} />
          {anyLength
            ? t('ready.anyLengthOn', { days: days || windowNights })
            : t('ready.hiddenByLength', { n: hidden, days })}
          <button className="wready-link" onClick={() => setAnyLength(!anyLength)}>
            {anyLength ? t('ready.backToMyDays') : t('ready.showAnyLength')}
          </button>
        </p>
      )}

      {!empty && rows != null && (
        <p className="wready-note wready-own">
          <SparkIcon size={11} />
          {t('ready.orBuildOwn')}
          <button className="wready-link" onClick={onBuildOwn}>{t('ready.buildOwn')}</button>
        </p>
      )}
    </div>
  );
}
