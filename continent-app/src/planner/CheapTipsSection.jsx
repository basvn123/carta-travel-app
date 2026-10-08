import React, { useMemo, useState } from 'react';
import { tipsForTrip } from '../lib/cheapTips.js';
import { InfoIcon, SparkIcon, ChevronDownIcon } from '../components/Icons.jsx';
import { useI18n } from '../i18n/index.jsx';

// i18n keys for the tip categories (T388: these were English in every
// language). The tip texts themselves are English data in cheapTips.json and
// wait on a translation pass (row T377-f).
const CATEGORY_KEY = {
  transport: 'trip.tipCatTransport',
  flights: 'trip.tipCatFlights',
  food: 'trip.tipCatFood',
  stay: 'trip.tipCatStay',
  activities: 'trip.tipCatActivities',
  driving: 'trip.tipCatDriving',
  connectivity: 'trip.tipCatConnectivity',
};

function TipRow({ tip, t }) {
  return (
    <div className="cheap-tip">
      <div className="cheap-tip-head">
        <b>{tip.title}</b>
        {tip.savings && <span className="cheap-tip-save">{tip.savings}</span>}
      </div>
      <small>{tip.tip}</small>
      {tip.category && <span className="cheap-tip-cat">{CATEGORY_KEY[tip.category] ? t(CATEGORY_KEY[tip.category]) : tip.category}</span>}
    </div>
  );
}

/**
 * "Know before you go", the planned trip's one country facts fold (T388,
 * brief item 6). It used to be two blocks at the foot of a 2,546 px sheet:
 * the country intel ("Know before you go", always open) and the money tips
 * ("Travel cheaper", folded). They answer one question, what to know about
 * these countries before going, so they are one fold now, closed until asked
 * for: the intel first (the rules), then the researched savings filtered to
 * THIS trip's countries, month, transport and party size (lib/cheapTips.js).
 *
 * `intel` is the CountryIntel nodes the planner tab renders for the route.
 */
export function CheapTipsSection({ stopDetails = [], tripStart = null, transportPref = null, groupSize = 1, intel = null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [showGeneric, setShowGeneric] = useState(false);

  const countryNames = useMemo(() => {
    const m = new Map();
    for (const s of stopDetails) {
      if (s.dest?.iso2 && !m.has(s.dest.iso2)) m.set(s.dest.iso2, s.dest.country);
    }
    return m;
  }, [stopDetails]);

  const picked = useMemo(() => tipsForTrip({
    iso2s: [...countryNames.keys()],
    startDate: tripStart,
    transport: (transportPref === 'car' || transportPref === 'owncar') ? 'car' : 'flight',
    groupSize,
  }), [countryNames, tripStart, transportPref, groupSize]);

  const count = picked.byCountry.reduce((s, g) => s + g.tips.length, 0) + picked.generic.length;
  const hasIntel = Array.isArray(intel) ? intel.length > 0 : Boolean(intel);
  if (!count && !hasIntel) return null;
  const names = [...countryNames.values()].join(', ');

  return (
    <div className={`trip-block cheap-tips ${open ? 'open' : ''}`}>
      <h2 className="trip-fold-h">
        <button className="day-collapse-head" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="day-collapse-headline">
            <span className="day-collapse-title">
              <InfoIcon size={13} /> {t('trip.factsTitle')}
            </span>
            <span className={`day-collapse-caret ${open ? 'open' : ''}`} aria-hidden="true"><ChevronDownIcon size={14} /></span>
          </span>
          {!open && names && (
            <span className="day-collapse-summary">{t('trip.factsSummary', { countries: names })}</span>
          )}
        </button>
      </h2>
      {open && (
        <div className="day-collapse-body">
          {intel}
          {count > 0 && (
            <div className="cheap-tip-sub">
              <h3 className="cheap-tip-sub-title">
                {t('trip.tipsTitle')} <span className="day-collapse-count">{count}</span>
              </h3>
              {picked.byCountry.map((g) => (
                <div key={g.iso2} className="cheap-tip-group">
                  <div className="cheap-tip-group-title">{countryNames.get(g.iso2) || g.iso2}</div>
                  {g.tips.map((tip) => <TipRow key={tip.id} tip={tip} t={t} />)}
                </div>
              ))}
              {picked.generic.length > 0 && (
                <div className="cheap-tip-group">
                  <button className="cheap-tip-group-title cheap-tip-generic-toggle" onClick={() => setShowGeneric(!showGeneric)} aria-expanded={showGeneric}>
                    <SparkIcon size={11} /> {t('trip.tipsEverywhere', { n: picked.generic.length })}
                  </button>
                  {showGeneric && picked.generic.map((tip) => <TipRow key={tip.id} tip={tip} t={t} />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
