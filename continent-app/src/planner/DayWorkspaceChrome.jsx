import React, { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useDismiss } from './DayPlanPanel.jsx';
import { isMustSee } from './dayDraft.js';
import { CountryIntel } from '../components/CountryIntel.jsx';
import {
  BedIcon, BulbIcon, SearchIcon, SparkIcon, RouteIcon, ListDayIcon,
  TicketIcon, PlusIcon, StarIcon, MountainIcon, InfoIcon, CloseIcon,
  ChevronRightIcon, ChevronDownIcon,
} from '../components/Icons.jsx';
import { formatSteps, kmToSteps } from '../lib/steps.js';

/**
 * Top left of the map: where you are sleeping tonight.
 *
 * It is the anchor the whole day is measured from (the first leg, the walking
 * order, how far a candidate really is), so it sits over the map where it can
 * be read at a glance and changed in two taps, rather than as a form field
 * scrolled past once and never seen again.
 */
export function DayStayBar({
  stayLabel, editable, query, onQuery, onSearch, searching, results, onPick, onClear, transportBlock,
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  return (
    <div className={`dayws-stay${open ? ' open' : ''}`} ref={ref}>
      <button
        className="dayws-stay-btn"
        onClick={() => (editable ? setOpen((v) => !v) : null)}
        aria-expanded={editable ? open : undefined}
        disabled={!editable}
        title={editable ? t('dayws.stayChange') : undefined}
      >
        <BedIcon size={14} />
        <span className="dayws-stay-text">
          <small>{t('dayws.stayLabel')}</small>
          <b>{stayLabel || t('dayws.stayNone')}</b>
        </span>
      </button>

      {open && (
        <div className="dayws-stay-panel">
          <div className="dayws-stay-search">
            <SearchIcon size={13} />
            <input
              type="text"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
              placeholder={t('dayws.stayPlaceholder')}
              aria-label={t('day.stayAria')}
            />
            <button className="dayws-stay-find" onClick={onSearch} disabled={searching || query.trim().length < 3}>
              {searching ? '...' : t('dayws.stayFind')}
            </button>
          </div>
          {results && (results.length ? (
            <div className="dayws-stay-results">
              {results.map((r, i) => (
                <button key={i} className="dayws-stay-result" onClick={() => { onPick(r); setOpen(false); }}>
                  {r.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="dayws-stay-none">{t('dayws.stayNoMatch')}</p>
          ))}
          {stayLabel && (
            <button className="dayws-stay-clear" onClick={onClear}>{t('dayws.stayClear')}</button>
          )}
          {/* Getting from the door to today's town belongs with the door, not
              inside the list of places you walk between once you are there. */}
          {transportBlock}
        </div>
      )}
    </div>
  );
}

/**
 * The day switcher (carta-design "Day list", rule N7; T389).
 *
 * Inside one plan the days are switched with one control: "Day 2, Thu 15 Oct"
 * with Previous and Next beside it, walking through every day of the plan in
 * order, across cities. It replaced a row of "Day N" chips and a second row
 * of city chips that together took two bands of a phone screen above the
 * first stop. Adding a day or a city is rarer, so both live in one "More"
 * menu at the end of the row (carta-design "More" menu).
 *
 * The arrow keys move a day while the switcher has focus, as on the day track.
 */
export function DaySwitcher({
  index, total, label, date, onPrev, onNext, moreItems = [],
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const onKey = (e) => {
    if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); onPrev(); }
    if (e.key === 'ArrowRight' && index < total - 1) { e.preventDefault(); onNext(); }
  };
  return (
    <div className="day-sw" role="group" aria-label={t('dayws.daySwitchAria')} onKeyDown={onKey}>
      <button
        type="button"
        className="day-sw-btn day-sw-prev"
        onClick={onPrev}
        disabled={index <= 0}
        aria-label={t('dayws.dayPrev')}
        title={t('dayws.dayPrev')}
      ><ChevronRightIcon size={16} /></button>
      <span className="day-sw-label" aria-live="polite">
        <span className="day-sw-day">{label}</span>
        {date && <span className="day-sw-date">{date}</span>}
      </span>
      <button
        type="button"
        className="day-sw-btn day-sw-next"
        onClick={onNext}
        disabled={index >= total - 1}
        aria-label={t('dayws.dayNext')}
        title={t('dayws.dayNext')}
      ><ChevronRightIcon size={16} /></button>
      {moreItems.length > 0 && (
        <div className="day-sw-more" ref={ref}>
          <button
            type="button"
            className="day-sw-morebtn"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <span>{t('dayws.more')}</span>
            <ChevronDownIcon size={14} />
          </button>
          {open && (
            <div className="dayp-menu day-sw-menu" role="menu">
              {moreItems.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  role="menuitem"
                  className="dayp-menu-item"
                  onClick={() => { setOpen(false); m.onSelect(); }}
                >
                  <PlusIcon size={14} />
                  <span><b>{m.label}</b></span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


/**
 * What a local would tell you, as content (T433): the town's own notes, the
 * walks that are the sight, the country's habits. The day kit opens it in a
 * sheet; the floating tips button over the map is gone.
 */
export function DayTipsBody({
  city, country, countryRec, intel, walks, dayWalks, assignedIdx, onToggleIntel, onToggleWalk,
}) {
  const { t, lang } = useI18n();
  return (
    <>
            {intel && (
              <section className="dayws-tips-sec">
                <div className="dayws-tips-sub"><SparkIcon size={11} /> {t('dayws.tipsIntel', { city })}</div>
                <p className="dayws-tips-intro">{intel.intro}</p>
                {intel.areas.map((a) => {
                  const added = a.idx != null && assignedIdx.includes(a.idx);
                  return (
                    <div className={`dayws-tip-row${added ? ' added' : ''}`} key={a.name}>
                      <span className="dayws-tip-body">
                        <span className="dayws-tip-name">
                          {a.name}
                          <span className="dayws-tip-tag">{a.tag}</span>
                          {a.item && isMustSee(a.item) && (
                            <span className="dayws-tip-star" title={t('dayws.mustTitle')} role="img" aria-label={t('dayws.mustTitle')}><StarIcon size={9} /></span>
                          )}
                        </span>
                        <span className="dayws-tip-note">{a.note}</span>
                      </span>
                      {a.idx != null && (
                        <button
                          className={`dayws-tip-add${added ? ' on' : ''}`}
                          onClick={() => onToggleIntel(a.idx)}
                          aria-pressed={added}
                          title={added ? t('dayws.removeFromDay') : t('dayws.addToDay')}
                        >{added ? '✓' : '+'}</button>
                      )}
                    </div>
                  );
                })}
                <p className="dayws-tips-foot"><InfoIcon size={11} /> {intel.tip}</p>
              </section>
            )}

            {walks.length > 0 && (
              <section className="dayws-tips-sec">
                <div className="dayws-tips-sub"><MountainIcon size={11} /> {t('dayws.tipsWalks')}</div>
                {walks.map((w) => {
                  const added = dayWalks.includes(w.name);
                  return (
                    <div className={`dayws-tip-row${added ? ' added' : ''}`} key={w.name}>
                      <span className="dayws-tip-body">
                        <span className="dayws-tip-name">{w.name}</span>
                        <span className="dayws-tip-note">{t('dayws.walkSteps', { n: formatSteps(kmToSteps(w.km), lang) })} {w.note}</span>
                      </span>
                      <button
                        className={`dayws-tip-add${added ? ' on' : ''}`}
                        onClick={() => onToggleWalk(w.name)}
                        aria-pressed={added}
                        title={added ? t('dayws.removeFromDay') : t('dayws.addToDay')}
                      >{added ? '✓' : '+'}</button>
                    </div>
                  );
                })}
              </section>
            )}

            {countryRec && (
              <section className="dayws-tips-sec">
                <div className="dayws-tips-sub"><InfoIcon size={11} /> {t('dayws.tipsCountry', { country })}</div>
                <CountryIntel country={country} rec={countryRec} compact />
              </section>
            )}
              </>
  );
}

/** How many tips there are, for the kit tile. */
export function tipsCount({ intel, walks = [], countryRec }) {
  return (intel ? intel.areas.length : 0) + walks.length + (countryRec ? 1 : 0);
}
