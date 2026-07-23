import React, { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { TrainIcon, BusIcon, CarIcon, SparkIcon } from '../components/Icons.jsx';
import { eur } from '../lib/format.js';
import { fmtDur } from './dayFormat.js';

// The three inter-city day-trip modes and their glyphs/labels. Exported because
// the main day-plan view also reads MODE_META to label committed legs.
export const MODE_META = {
  train: { Icon: TrainIcon, labelKey: 'day.modeTrain' },
  bus: { Icon: BusIcon, labelKey: 'day.modeBus' },
  car: { Icon: CarIcon, labelKey: 'day.modeCar' },
};

/**
 * "How do you get there for the day?", from the traveller's base (their stay)
 * to the day-trip destination, using the same per-leg transport engine the
 * Trip planner prices with: train / bus / car, honest distance-based
 * estimates, national-operator booking links, and a day-return framing.
 *
 * The three modes are BUTTONS: the traveller can overrule Carta's pick, and
 * the chosen mode is what the day's timeline and Google Maps handoff use,  * one decision, spoken everywhere.
 *
 *   opts        legTransportOptions result (parent computes it once), or
 *               { local: true } when the stay is already in/next to the city
 *   mode        the active mode key ('train'|'bus'|'car')
 *   onPickMode  choose a different mode (persisted with the plan)
 */
export function DayTripTransport({ fromDest, toDest, opts, mode, onPickMode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!fromDest || !toDest || !opts) return null;
  // Staying in, or right next to, the day-trip city itself: there's no
  // inter-city hop to recommend, but say so plainly rather than showing
  // nothing (a blank space reads as "the feature is broken").
  if (opts.local) {
    return (
      <div className="trip-block daytrip-transport">
        <div className="trip-block-title">{t('day.gettingTo', { city: toDest.city })}</div>
        <p className="trip-note daytrip-here">
          <SparkIcon size={11} /> {t('day.stayLocalNote', { city: toDest.city })}
        </p>
      </div>
    );
  }
  if (opts.no_road) {
    return (
      <div className="trip-block">
        <div className="trip-block-title">{t('day.gettingThereFrom', { city: fromDest.city })}</div>
        <p className="trip-note">{opts.note || t('day.noOverland')}</p>
      </div>
    );
  }
  const active = opts.modes[mode] ? mode : opts.recommended;
  const cur = opts.modes[active];
  const CurIcon = MODE_META[active].Icon;
  const isRec = active === opts.recommended;
  // A day trip only works if you can be there by mid-morning and back for
  // dinner: flag long rides and suggest when to set off.
  const oneWayH = cur.hours;
  const feasible = oneWayH <= 3;
  const departHint = oneWayH <= 1 ? t('day.departEasy')
    : oneWayH <= 2 ? t('day.depart830')
    : oneWayH <= 3 ? t('day.depart800')
    : t('day.departTooFar');
  const perLabel = active === 'car' ? t('day.perCarSuffix') : t('day.perPersonSuffix');

  return (
    <div className="trip-block daytrip-transport">
      <div className="trip-block-title">{t('day.gettingThereFrom', { city: fromDest.city })}</div>
      <div className="daytrip-reco">
        <span className="daytrip-reco-icon"><CurIcon size={15} /></span>
        <span className="daytrip-reco-main">
          <b>
            {isRec
              ? <><SparkIcon size={10} /> {t('day.bestBet', { mode: t(MODE_META[active].labelKey) })}</>
              : <>{t('day.yourPick', { mode: t(MODE_META[active].labelKey) })}</>}
          </b>
          <small>
            {t('day.modeSummary', {
              km: opts.road_km,
              dur: fmtDur(cur.hours * 60),
              fare: `${eur(cur.eur_pp)}${perLabel}`,
              ret: eur(cur.eur_pp * 2),
              split: active === 'car' ? t('day.splitWithGroup') : '',
            })}
          </small>
          <small className={feasible ? 'daytrip-hint' : 'daytrip-hint warn'}>{departHint}</small>
          {opts.sea_crossing && cur.note && (
            <small className="daytrip-hint">{cur.note}</small>
          )}
          {opts.transit_reason && (
            <small className="daytrip-hint warn">{opts.transit_reason}</small>
          )}
          {!isRec && (
            <small className="daytrip-hint">
              {t('day.cartaPickWouldBe', { mode: t(MODE_META[opts.recommended].labelKey).toLowerCase() })}
            </small>
          )}
        </span>
        <button className="daytrip-more" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? t('day.less') : t('day.compare')}
        </button>
      </div>
      {open && (
        <>
          <div className="trip-leg-modes daytrip-modes">
            {Object.entries(opts.modes).map(([m, o]) => (
              <button
                key={m}
                type="button"
                className={`trip-leg-mode daytrip-mode-btn ${active === m ? 'on' : ''}`}
                onClick={() => onPickMode?.(m)}
                aria-pressed={active === m}
                title={t('day.planAroundMode', { mode: t(MODE_META[m].labelKey).toLowerCase() })}
              >
                <span>
                  {React.createElement(MODE_META[m].Icon, { size: 12 })} {t(MODE_META[m].labelKey)}
                  {opts.recommended === m && <SparkIcon size={9} />}
                </span>
                <b>{eur(o.eur_pp)}{m === 'car' ? t('day.perCarShort') : t('day.perPersonShort')}</b>
                <small>{t('day.eachWay', { dur: fmtDur(o.hours * 60) })}</small>
              </button>
            ))}
          </div>
          <p className="trip-leg-note daytrip-pick-note">{t('day.tapMode')}</p>
          {opts.train_dropped && (
            <p className="trip-leg-note">
              {t('day.noRailLink', { city: toDest.city })}
            </p>
          )}
          <div className="trip-leg-links">
            {cur.links.map((l, j) => (
              <a key={j} href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
