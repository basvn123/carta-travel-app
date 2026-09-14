import React, { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useDismiss } from './DayPlanPanel.jsx';
import { isMustSee } from './dayDraft.js';
import { CountryIntel } from '../components/CountryIntel.jsx';
import {
  BedIcon, BulbIcon, SearchIcon, SparkIcon, RouteIcon, ListDayIcon,
  TicketIcon, PlusIcon, StarIcon, MountainIcon, InfoIcon, CloseIcon,
} from '../components/Icons.jsx';

/**
 * The predefined things a traveller asks Carta about a day. A blank chat box
 * is a worse control than four buttons: nobody opens one knowing what this
 * particular bot is good at. Each entry is a whole request, and the ones that
 * carry `refine` skip the questionnaire entirely and generate on open.
 */
export const BOT_PROMPTS = [
  { key: 'plan', labelKey: 'dayws.botPlan', subKey: 'dayws.botPlanSub', Icon: SparkIcon, needsPlan: false },
  { key: 'more', labelKey: 'dayws.botMore', subKey: 'dayws.botMoreSub', Icon: PlusIcon, needsPlan: true, refineKey: 'dayws.botMoreAsk' },
  { key: 'reorder', labelKey: 'dayws.botReorder', subKey: 'dayws.botReorderSub', Icon: RouteIcon, needsPlan: true, action: 'optimize' },
  { key: 'easy', labelKey: 'dayws.botEasy', subKey: 'dayws.botEasySub', Icon: MountainIcon, needsPlan: true, refineKey: 'dayws.botEasyAsk' },
  { key: 'rain', labelKey: 'dayws.botRain', subKey: 'dayws.botRainSub', Icon: InfoIcon, needsPlan: false, refineKey: 'dayws.botRainAsk' },
  { key: 'food', labelKey: 'dayws.botFood', subKey: 'dayws.botFoodSub', Icon: TicketIcon, needsPlan: false, refineKey: 'dayws.botFoodAsk' },
];

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
 * Top right of the map: what a local would tell you before you set off.
 *
 * Carta's hand-written orientation for the town, the country's own habits
 * (tipping, transport, the hours things keep), and the walks that are the
 * sight rather than the way to one. All of it is read-once context, so it
 * lives behind one button instead of three cards nobody scrolls to.
 */
export function DayTipsPanel({
  city, country, countryRec, intel, walks, dayWalks, assignedIdx, onToggleIntel, onToggleWalk,
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const count = (intel ? intel.areas.length : 0) + walks.length + (countryRec ? 1 : 0);
  if (!count) return null;

  return (
    <div className={`dayws-tips${open ? ' open' : ''}`} ref={ref}>
      <button
        className="dayws-tips-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={t('dayws.tipsTitle')}
      >
        <BulbIcon size={15} />
        <span className="dayws-tips-label">{t('dayws.tipsShort')}</span>
      </button>

      {open && (
        <div className="dayws-tips-panel" role="dialog" aria-label={t('dayws.tipsTitle')}>
          <div className="dayws-tips-head">
            <h3>{t('dayws.tipsTitle')}</h3>
            <button className="dayws-tips-close" onClick={() => setOpen(false)} aria-label={t('shape.close')}>
              <CloseIcon size={14} />
            </button>
          </div>
          <div className="dayws-tips-body">
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
                            <span className="dayws-tip-star" title={t('dayws.mustTitle')}><StarIcon size={9} /></span>
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
                        <span className="dayws-tip-note">{t('dayws.walkKm', { km: w.km })} {w.note}</span>
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
          </div>
        </div>
      )}
    </div>
  );
}

/** The Carta bot, as a button that already knows what it can be asked. */
export function CartaBotFab({ dayNumber, hasPlan, onPick }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const prompts = BOT_PROMPTS.filter((p) => !p.needsPlan || hasPlan);

  return (
    <div className={`dayws-bot${open ? ' open' : ''}`} ref={ref}>
      {open && (
        <div className="dayws-bot-menu" role="menu">
          <div className="dayws-bot-head">
            <span className="dayws-bot-avatar" aria-hidden="true"><SparkIcon size={13} /></span>
            <span>
              <b>{t('dayws.botTitle')}</b>
              <small>{t('dayws.botSub', { n: dayNumber })}</small>
            </span>
          </div>
          {prompts.map(({ key, labelKey, subKey, Icon }) => (
            <button
              key={key}
              className="dayws-bot-item"
              role="menuitem"
              onClick={() => { setOpen(false); onPick(key); }}
            >
              <Icon size={14} />
              <span><b>{t(labelKey)}</b><small>{t(subKey)}</small></span>
            </button>
          ))}
        </div>
      )}
      <button
        className="dayws-bot-fab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={t('dayws.botTitle')}
      >
        <SparkIcon size={18} />
        <span className="dayws-bot-fab-label">{t('dayws.botShort')}</span>
      </button>
    </div>
  );
}

const TABS = [
  { key: 'plan', labelKey: 'dayws.tabPlan', Icon: RouteIcon },
  { key: 'add', labelKey: 'dayws.tabAdd', Icon: ListDayIcon },
  { key: 'files', labelKey: 'dayws.tabFiles', Icon: TicketIcon },
];

/** The three questions a planned day gets asked, in the order they get asked:
 *  what am I doing, what else could I do, where is the paperwork. */
export function DayTabsRail({ tab, onTab, counts = {} }) {
  const { t } = useI18n();
  return (
    <div className="dayws-tabs" role="tablist" aria-label={t('dayws.tabsAria')}>
      {TABS.map(({ key, labelKey, Icon }) => (
        <button
          key={key}
          role="tab"
          aria-selected={tab === key}
          className={`dayws-tab${tab === key ? ' on' : ''}`}
          onClick={() => onTab(key)}
        >
          <Icon size={14} />
          {t(labelKey)}
          {counts[key] > 0 && <span className="dayws-tab-count">{counts[key]}</span>}
        </button>
      ))}
    </div>
  );
}
