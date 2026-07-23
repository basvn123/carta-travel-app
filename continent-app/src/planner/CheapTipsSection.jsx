import React, { useMemo, useState } from 'react';
import { tipsForTrip } from '../lib/cheapTips.js';
import { PiggyIcon, SparkIcon } from '../components/Icons.jsx';

const CATEGORY_LABEL = {
  transport: 'Getting around',
  flights: 'Flights',
  food: 'Eating & drinking',
  stay: 'Sleeping',
  activities: 'Sights & activities',
  driving: 'Driving',
  connectivity: 'Phone & data',
};

function TipRow({ tip }) {
  return (
    <div className="cheap-tip">
      <div className="cheap-tip-head">
        <b>{tip.title}</b>
        {tip.savings && <span className="cheap-tip-save">{tip.savings}</span>}
      </div>
      <small>{tip.tip}</small>
      {tip.category && <span className="cheap-tip-cat">{CATEGORY_LABEL[tip.category] || tip.category}</span>}
    </div>
  );
}

/**
 * "Travel cheaper", the trip overview's tailored money advice: researched,
 * verified market intel (rail advance-fare systems, budget buses, city cards,
 * supermarket chains, free museum days, fuel tactics...) filtered down to
 * THIS trip's countries, month, transport and party size. Data + selection
 * logic in lib/cheapTips.js.
 */
export function CheapTipsSection({ stopDetails = [], tripStart = null, transportPref = null, groupSize = 1 }) {
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
  if (!count) return null;

  return (
    <div className={`trip-block cheap-tips ${open ? 'open' : ''}`}>
      <button className="day-collapse-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="day-collapse-headline">
          <span className="day-collapse-title">
            <PiggyIcon size={13} /> Travel cheaper: tips for this trip
            <span className="day-collapse-count">{count}</span>
          </span>
          <span className="day-collapse-caret" aria-hidden="true">{open ? '−' : '+'}</span>
        </span>
        {!open && (
          <span className="day-collapse-summary">
            Researched savings for {[...countryNames.values()].join(', ') || 'your trip'}
          </span>
        )}
      </button>
      {open && (
        <div className="day-collapse-body">
          {picked.byCountry.map((g) => (
            <div key={g.iso2} className="cheap-tip-group">
              <div className="cheap-tip-group-title">{countryNames.get(g.iso2) || g.iso2}</div>
              {g.tips.map((tip) => <TipRow key={tip.id} tip={tip} />)}
            </div>
          ))}
          {picked.generic.length > 0 && (
            <div className="cheap-tip-group">
              <button className="cheap-tip-group-title cheap-tip-generic-toggle" onClick={() => setShowGeneric(!showGeneric)} aria-expanded={showGeneric}>
                <SparkIcon size={11} /> Everywhere in Europe ({picked.generic.length}) {showGeneric ? '−' : '+'}
              </button>
              {showGeneric && picked.generic.map((tip) => <TipRow key={tip.id} tip={tip} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
