import React, { useState } from 'react';
import { flagUrl, isoToFlag } from '../lib/tripGuide.js';
import { fmtMonths } from '../lib/dates.js';
import { stripDashes as cleanDash } from '../lib/format.js';
import {
  TrainIcon, BusIcon, CarIcon, AlertIcon,
  TicketIcon, RoadIcon, CheckIcon, BanIcon,
} from './Icons.jsx';
import { useI18n } from '../i18n/index.jsx';

const BUDGET_LABEL_KEYS = {
  low: 'intel.budgetLow',
  mid: 'intel.budgetMid',
  high: 'intel.budgetHigh',
  very_high: 'intel.budgetVeryHigh',
};

function Flag({ iso2, className = 'cintel-flag' }) {
  const url = flagUrl(iso2, 40);
  if (!url) return <span className={className}>{isoToFlag(iso2)}</span>;
  return (
    <img
      className={className}
      src={url}
      srcSet={`${flagUrl(iso2, 80)} 2x`}
      alt=""
      loading="lazy"
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

function LinkOut({ href, children }) {
  if (!href) return <span>{children}</span>;
  return <a href={href} target="_blank" rel="noreferrer" className="cintel-link">{children} ↗</a>;
}

/** One icon-led line inside an intel row. `tone` = 'warn' tints the icon rust. */
function IntelLine({ icon: Icon, tone, children }) {
  return (
    <div className={`cintel-line${tone ? ` cintel-line-${tone}` : ''}`}>
      <Icon className="cintel-ico" />
      <span>{children}</span>
    </div>
  );
}

/**
 * Deep per-country travel intel (from country_insights.json): budget level,
 * best months, rail/bus operators with booking links, driving rules (vignettes,
 * tolls, warnings), in-depth must-sees, practical traveler insights, food and
 * events. Collapsible so it can sit inside the planners without shouting.
 *
 * @param rec         the country's insight record (required)
 * @param country     display name (required)
 * @param defaultOpen start expanded (default false)
 * @param compact     hide must-see/food/events, keep transport + warnings
 */
export function CountryIntel({ rec, country, defaultOpen = false, compact = false }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const [allSights, setAllSights] = useState(false);
  if (!rec) return null;

  const sights = allSights ? rec.must_see : (rec.must_see || []).slice(0, 6);

  return (
    <div className={`cintel ${open ? 'open' : ''}`}>
      <button className="cintel-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Flag iso2={rec.iso2} />
        <span className="cintel-country">{country}</span>
        <span className="cintel-chips">
          {rec.budget_level && <span className={`cintel-chip budget-${rec.budget_level}`}>{BUDGET_LABEL_KEYS[rec.budget_level] ? t(BUDGET_LABEL_KEYS[rec.budget_level]) : rec.budget_level}</span>}
          {rec.daily_budget_eur && <span className="cintel-chip">{t('intel.perDay', { lo: rec.daily_budget_eur[0], hi: rec.daily_budget_eur[1] })}</span>}
          {rec.currency && rec.currency !== 'EUR' && <span className="cintel-chip">{t('intel.notEuro', { currency: rec.currency })}</span>}
        </span>
        <span className="cintel-caret">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="cintel-body">
          {rec.best_time_note && (
            <div className="cintel-row">
              <span className="cintel-label">{t('intel.bestTime')}</span>
              <p><strong>{fmtMonths(rec.best_months)}.</strong> {cleanDash(rec.best_time_note)}</p>
            </div>
          )}

          <div className="cintel-row">
            <span className="cintel-label">{t('intel.gettingAround')}</span>
            <div className="cintel-lines">
              {rec.rail?.operator && (
                <IntelLine icon={TrainIcon}>
                  <LinkOut href={rec.rail.url}>{rec.rail.operator}</LinkOut>{rec.rail.note ? `, ${cleanDash(rec.rail.note)}` : ''}
                </IntelLine>
              )}
              {rec.bus?.operators?.length > 0 && (
                <IntelLine icon={BusIcon}>
                  <LinkOut href={rec.bus.url}>{rec.bus.operators.join(', ')}</LinkOut>{rec.bus.note ? `, ${cleanDash(rec.bus.note)}` : ''}
                </IntelLine>
              )}
            </div>
          </div>

          {rec.driving && (
            <div className="cintel-row">
              <span className="cintel-label">{t('intel.byCar')}</span>
              <div className="cintel-lines">
                {rec.driving.side === 'left' && <IntelLine icon={AlertIcon} tone="warn">{t('intel.drivesLeft')}</IntelLine>}
                {rec.driving.vignette && <IntelLine icon={TicketIcon} tone="warn">{cleanDash(rec.driving.vignette)}</IntelLine>}
                {rec.driving.tolls && <IntelLine icon={RoadIcon}>{cleanDash(rec.driving.tolls)}</IntelLine>}
                {(rec.driving.warnings || []).map((w, i) => <IntelLine key={i} icon={AlertIcon} tone="warn">{cleanDash(w)}</IntelLine>)}
                {rec.driving.car_recommended_for && <IntelLine icon={CheckIcon}>{t('intel.worthCarFor', { areas: cleanDash(rec.driving.car_recommended_for) })}</IntelLine>}
                {rec.driving.car_not_needed_in && <IntelLine icon={BanIcon}>{t('intel.skipCarIn', { areas: cleanDash(rec.driving.car_not_needed_in) })}</IntelLine>}
              </div>
            </div>
          )}

          {!compact && (rec.must_see || []).length > 0 && (
            <div className="cintel-row">
              <span className="cintel-label">{t('intel.dontMiss')}</span>
              <div className="cintel-sights">
                {sights.map((s, i) => (
                  <div key={i} className="cintel-sight">
                    <span className="cintel-sight-name">{s.name}</span>
                    {s.region && <span className="cintel-sight-region">{s.region}</span>}
                    {s.why && <span className="cintel-sight-why">{cleanDash(s.why)}</span>}
                  </div>
                ))}
                {rec.must_see.length > 6 && (
                  <button className="cintel-more" onClick={() => setAllSights(!allSights)}>
                    {allSights ? t('intel.showFewer') : t('intel.showAll', { n: rec.must_see.length })}
                  </button>
                )}
              </div>
            </div>
          )}

          {(rec.insights || []).length > 0 && (
            <div className="cintel-row">
              <span className="cintel-label">{t('intel.goodToKnow')}</span>
              <ul className="cintel-insights">
                {rec.insights.map((t, i) => <li key={i}>{cleanDash(t)}</li>)}
              </ul>
            </div>
          )}

          {!compact && (rec.food || []).length > 0 && (
            <div className="cintel-row">
              <span className="cintel-label">{t('intel.eatDrink')}</span>
              <ul className="cintel-insights">
                {rec.food.map((f, i) => <li key={i}>{cleanDash(f)}</li>)}
              </ul>
            </div>
          )}

          {!compact && (rec.events || []).length > 0 && (
            <div className="cintel-row">
              <span className="cintel-label">{t('intel.events')}</span>
              <ul className="cintel-insights">
                {rec.events.map((e, i) => <li key={i}>{cleanDash(e)}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
