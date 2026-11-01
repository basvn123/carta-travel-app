import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/index.jsx';
import { Button, Chip, ChipGroup, IconButton } from './ui/index.js';
import {
  ArrowLeftIcon, BeachIcon, BikeIcon, BootIcon, ChevronDownIcon, CloseIcon, CompassIcon, FilterIcon,
  LakeIcon, MountainIcon, SearchIcon, SparkIcon, ClockIcon, GlobeIcon,
} from './Icons.jsx';
import {
  useSettings, useShortDate, whenValue, DatesControl, PartyControl, addDaysISO, nightsBetween, WAY_ICONS,
} from './SettingsLine.jsx';
import { FromPanel, fromName, fromPoint } from './FromPicker.jsx';
import { AirportReach } from './AirportReach.jsx';
import { partyText } from '../lib/party.js';
import { TRAVEL_MODES } from '../lib/travelWay.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { useDialogExit } from '../lib/motion.js';
import { openAskChat } from '../browse/ask/askChatStore.js';
import {
  useSearchDock, dockBack, dockFilters, loadRecent, rememberSearch, isQuestion,
} from '../browse/searchDockStore.js';
import '../styles/96-search-dock.css';

/**
 * The search dock (T961, owner 2026-10-31: "like airbnb at the top a search
 * bar, where when you click on it you can fill in the when, from, stay and
 * transport"). On a phone it replaces the settings line's four buttons and
 * Explore's Ask-or-search field with one pill and one round Ask Carta door.
 *
 *   pill      the activity's colour tile, "Where to?" (or what was searched)
 *             over the trip in one line; opens the search sheet
 *   Ask       the round door to the one Ask Carta chat (askChatStore)
 *   results   after a search (T962) the pill gets Back before it and the one
 *             Filters button after it, in place of Ask: the quick filters
 *             live behind that button only
 *
 * The sheet leads with What, the six kinds Carta searches (unlike a stays
 * site, a place, a walk, a beach, a lake, a summit or a ride), then Where,
 * When, From, Who, Stay and Transport as cards, one open at a time. Every
 * trip input holds the moment it changes (the same SettingsContext the
 * desktop line writes); Where and What wait for Search.
 *
 *   onSearch({ kind, q })   App moves to the kind's view with the text
 */
export const DOCK_KINDS = [
  { key: 'places', labelKey: 'places.catPlaces', Icon: CompassIcon },
  { key: 'trails', labelKey: 'places.catTrails', Icon: BootIcon },
  { key: 'beaches', labelKey: 'places.catBeaches', Icon: BeachIcon },
  { key: 'lakes', labelKey: 'places.catLakes', Icon: LakeIcon },
  { key: 'mountains', labelKey: 'places.catMountains', Icon: MountainIcon },
  { key: 'cycling', labelKey: 'places.catCycling', Icon: BikeIcon },
];
const kindOf = (key) => DOCK_KINDS.find((k) => k.key === key) || DOCK_KINDS[0];

/** The trip in one line: when, from where, who. */
function useTripLine(s) {
  const { t } = useI18n();
  const shortDate = useShortDate();
  if (!s) return '';
  const when = whenValue(t, s, shortDate, { nightsToo: false });
  const heads = (Number.isFinite(s.party) ? s.party : 2) + (s.babies || 0);
  const people = t(heads === 1 ? 'settings.peopleOne' : 'settings.peopleMany', { n: heads });
  const from = fromName(s);
  return from ? t('dock.summary', { when, from, people }) : t('settings.summary', { dates: when, people });
}

export function SearchDock({ onSearch }) {
  const s = useSettings();
  const { t } = useI18n();
  const dock = useSearchDock();
  const [open, setOpen] = useState(false);
  const pillRef = useRef(null);
  const filtersRef = useRef(null);
  const line = useTripLine(s);
  if (!s) return null;
  const r = dock.results;
  const kind = kindOf(dock.kind);
  const title = r?.label || t('dock.where');
  return (
    <div className={`sdock${r ? ' is-results' : ''}`} role="search" aria-label={t('dock.title')}>
      {r && (
        <IconButton className="sdock-round sdock-back" label={t('explore.backOverview')} onClick={dockBack}>
          <ArrowLeftIcon size={20} />
        </IconButton>
      )}
      <button
        type="button"
        ref={pillRef}
        className="sdock-pill"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('dock.openAria', { what: title, summary: line })}
        onClick={() => setOpen(true)}
      >
        <span className="sdock-act" data-act={kind.key} aria-hidden="true"><kind.Icon size={20} /></span>
        <span className="sdock-text" aria-hidden="true">
          <span className="sdock-line1">{title}</span>
          <span className="sdock-line2">{line}</span>
        </span>
      </button>
      {r ? (
        <IconButton
          ref={filtersRef}
          className={`sdock-round sdock-filters${r.filtersOpen ? ' is-on' : ''}`}
          label={r.filterCount ? t('dock.filtersAria', { n: r.filterCount }) : t('filter.filters')}
          aria-haspopup="dialog"
          aria-expanded={!!r.filtersOpen}
          onClick={() => dockFilters(filtersRef.current)}
        >
          <FilterIcon size={20} />
          {r.filterCount > 0 && <span className="sdock-count" aria-hidden="true">{r.filterCount}</span>}
        </IconButton>
      ) : (
        <button type="button" className="sdock-ask" aria-label={t('dock.ask')} title={t('dock.ask')}
          onClick={(e) => openAskChat(e.currentTarget)}>
          <SparkIcon size={20} />
          <span className="sdock-ask-word" aria-hidden="true">{t('dock.askShort')}</span>
        </button>
      )}
      {open && (
        <SearchSheet
          s={s}
          startKind={kind.key}
          startQ={r?.query || ''}
          opener={pillRef}
          onClose={() => {
            setOpen(false);
            // Back to the pill, unless the sheet handed over to another
            // dialog (Stay's Lifestyle, Ask Carta) that holds focus now.
            requestAnimationFrame(() => {
              const a = document.activeElement;
              if (!a || a === document.body) pillRef.current?.focus();
            });
          }}
          onSearch={onSearch}
        />
      )}
    </div>
  );
}

/** One card of the sheet: its head names the input and its value; the body
 *  shows while it is the open one. */
function Card({ id, label, value, open, onOpen, children, icon = null }) {
  const bodyId = `${id}-body`;
  return (
    <section className={`sdock-card${open ? ' is-open' : ''}`}>
      <h3 className="sdock-card-h">
        <button type="button" className="sdock-card-head" aria-expanded={open} aria-controls={bodyId} onClick={onOpen}>
          <span className="sdock-card-label">{label}</span>
          <span className="sdock-card-value">{value}</span>
          {icon || <ChevronDownIcon size={16} className="sdock-card-chev" />}
        </button>
      </h3>
      {open && <div className="sdock-card-body" id={bodyId}>{children}</div>}
    </section>
  );
}

function SearchSheet({ s, startKind, startQ, opener, onClose, onSearch }) {
  const { t } = useI18n();
  const shortDate = useShortDate();
  const baseId = useId();
  const [kind, setKind] = useState(startKind);
  const [q, setQ] = useState(startQ);
  const [card, setCard] = useState('where');
  const [pickEnd, setPickEnd] = useState('start');
  const [fromOpen, setFromOpen] = useState(false);
  const recent = useMemo(() => loadRecent(), []);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const exit = useDialogExit(onClose);
  useFocusTrap(panelRef, exit.close, { initialFocusRef: inputRef });

  // The page under the sheet holds still while it is open.
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('sdock-locked');
    return () => html.classList.remove('sdock-locked');
  }, []);

  const pickDate = useCallback((iso) => {
    if (!iso) return;
    const nights = Math.max(1, nightsBetween(s.departDate, s.returnDate));
    if (pickEnd === 'end' && s.departDate && iso > s.departDate) {
      s.setReturnDate(iso);
      return;
    }
    s.setDepartDate(iso);
    s.setReturnDate(addDaysISO(iso, nights));
    setPickEnd('end');
  }, [s, pickEnd]);

  const ask = (text) => {
    exit.close();
    openAskChat(opener.current, { text });
  };
  const submit = (text = q, k = kind) => {
    const v = String(text || '').trim();
    if (v && isQuestion(v)) { ask(v); return; }
    rememberSearch(k, v);
    onSearch?.({ kind: k, q: v });
    exit.close();
  };

  const toggle = (name) => setCard((c) => (c === name ? null : name));
  const k = kindOf(kind);
  const typed = q.trim();
  const shownRecent = recent.filter((r) => !typed || r.q.toLowerCase().includes(typed.toLowerCase()));
  const mode = TRAVEL_MODES.includes(s.transportMode) ? s.transportMode : 'any';
  const mayFly = !['train', 'bus', 'car'].includes(mode);
  const children = s.children || 0;
  const party = Number.isFinite(s.party) ? s.party : 2;
  const people = partyText(t, { adults: Math.max(1, party - children), children, babies: s.babies || 0 });
  const from = fromName(s) || t('origin.pickTown');
  const bed = t(`stay.${s.stayTier || 'home'}`);

  return createPortal(
    <div className={`sdock-scrim${exit.leaving ? ' is-leaving' : ''}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) exit.close(); }}>
      <div className={`sdock-sheet${exit.leaving ? ' is-leaving' : ''}`} ref={panelRef}
        role="dialog" aria-modal="true" aria-labelledby={`${baseId}-t`}>
        <div className="sdock-sheet-head">
          <h2 className="sdock-sheet-title" id={`${baseId}-t`}>{t('dock.title')}</h2>
          <IconButton className="sdock-close" label={t('a11y.close')} onClick={exit.close}>
            <CloseIcon size={18} />
          </IconButton>
        </div>

        <div className="sdock-sheet-body">
          {/* What: the six kinds Carta searches, each in its own colour. */}
          <div className="sdock-what" role="group" aria-label={t('dock.what')}>
            {DOCK_KINDS.map(({ key, labelKey, Icon }) => (
              <button key={key} type="button" className="sdock-kind" data-act={key}
                aria-pressed={kind === key} onClick={() => setKind(key)}>
                <span className="sdock-kind-tile" aria-hidden="true"><Icon size={24} /></span>
                <span className="sdock-kind-label">{t(labelKey)}</span>
              </button>
            ))}
          </div>

          <section className={`sdock-card sdock-card-where${card === 'where' ? ' is-open' : ''}`}>
            {card === 'where' ? (
              <div className="sdock-card-body">
                <h3 className="sdock-where-h">
                  <label htmlFor={`${baseId}-q`}>{t('dock.where')}</label>
                </h3>
                <form className="sdock-field" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                  <SearchIcon size={18} className="sdock-field-icon" />
                  <input id={`${baseId}-q`} ref={inputRef} type="search" value={q}
                    className="sdock-input" placeholder={t('dock.wherePh')}
                    autoComplete="off" enterKeyHint="search" onChange={(e) => setQ(e.target.value)} />
                  {q && (
                    <IconButton className="sdock-field-clear" label={t('dock.clearText')} onClick={() => { setQ(''); inputRef.current?.focus(); }}>
                      <CloseIcon size={14} />
                    </IconButton>
                  )}
                </form>
                <ul className="sdock-options">
                  {typed ? (
                    <>
                      <li>
                        <button type="button" className="sdock-option" data-act={k.key} onClick={() => submit(typed)}>
                          <span className="sdock-option-tile" aria-hidden="true"><k.Icon size={20} /></span>
                          <span className="sdock-option-text">
                            <span className="sdock-option-name">{t('dock.in', { what: t(k.labelKey), q: typed })}</span>
                          </span>
                        </button>
                      </li>
                      <li>
                        <button type="button" className="sdock-option is-ask" onClick={() => ask(typed)}>
                          <span className="sdock-option-tile" aria-hidden="true"><SparkIcon size={20} /></span>
                          <span className="sdock-option-text">
                            <span className="sdock-option-name">{t('dock.askFor', { q: typed })}</span>
                            <span className="sdock-option-sub">{t('dock.askSub')}</span>
                          </span>
                        </button>
                      </li>
                    </>
                  ) : (
                    <li>
                      <button type="button" className="sdock-option" data-act={k.key} onClick={() => submit('')}>
                        <span className="sdock-option-tile" aria-hidden="true"><GlobeIcon size={20} /></span>
                        <span className="sdock-option-text">
                          <span className="sdock-option-name">{t('dock.anywhere')}</span>
                          <span className="sdock-option-sub">{t('dock.anywhereSub', { what: t(k.labelKey) })}</span>
                        </span>
                      </button>
                    </li>
                  )}
                </ul>
                {shownRecent.length > 0 && (
                  <>
                    <h4 className="sdock-sub-h">{t('dock.recent')}</h4>
                    <ul className="sdock-options">
                      {shownRecent.map((r) => {
                        const rk = kindOf(r.kind);
                        return (
                          <li key={`${r.kind}:${r.q}`}>
                            <button type="button" className="sdock-option" data-act={rk.key}
                              onClick={() => { setKind(rk.key); submit(r.q, rk.key); }}>
                              <span className="sdock-option-tile is-quiet" aria-hidden="true"><ClockIcon size={18} /></span>
                              <span className="sdock-option-text">
                                <span className="sdock-option-name">{r.q}</span>
                                <span className="sdock-option-sub">{t(rk.labelKey)}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            ) : (
              <h3 className="sdock-card-h">
                <button type="button" className="sdock-card-head" aria-expanded="false" onClick={() => setCard('where')}>
                  <span className="sdock-card-label">{t('dock.whereShort')}</span>
                  <span className="sdock-card-value">{typed || t('dock.anywhere')}</span>
                  <ChevronDownIcon size={16} className="sdock-card-chev" />
                </button>
              </h3>
            )}
          </section>

          <Card id={`${baseId}-when`} label={t('dates.when')}
            value={whenValue(t, s, shortDate, { nightsToo: false })}
            open={card === 'when'} onOpen={() => { setPickEnd('start'); toggle('when'); }}>
            <DatesControl s={s} pickEnd={pickEnd} setPickEnd={setPickEnd} pickDate={pickDate} shortDate={shortDate} />
          </Card>

          <Card id={`${baseId}-from`} label={t('settings.from')} value={from}
            open={card === 'from'} onOpen={() => { setFromOpen(false); toggle('from'); }}>
            {fromOpen || !s.fromPlace ? (
              <FromPanel data={s.data} current={fromPoint(s)} autoFocus={false}
                onPick={(p) => { s.setFrom(p); setFromOpen(false); }} />
            ) : (
              <Button variant="secondary" block className="sdock-from-change" onClick={() => setFromOpen(true)}>
                {t('dock.changeFrom', { from })}
              </Button>
            )}
            {s.setAirports && s.fromPlace && mayFly && (
              <div className="settings-airports">
                <h4 className="sdock-sub-h" id={`${baseId}-airports`}>{t('pf.q.airports')}</h4>
                <AirportReach
                  meta={s.data?.meta}
                  point={s.fromPlace}
                  covered={s.sweptOrigins}
                  hours={s.airportHours}
                  codes={s.airports}
                  labelId={`${baseId}-airports`}
                  onChange={(codes, hours) => s.setAirports(codes, hours)}
                />
              </div>
            )}
          </Card>

          <Card id={`${baseId}-who`} label={t('dock.who')} value={people}
            open={card === 'who'} onOpen={() => toggle('who')}>
            <PartyControl s={s} />
          </Card>

          <Card id={`${baseId}-way`} label={t('settings.wayShort')} value={t(`way.${mode}`)}
            open={card === 'way'} onOpen={() => toggle('way')}>
            <ChipGroup label={t('way.label')} className="sdock-ways">
              {TRAVEL_MODES.map((m) => {
                const Icon = WAY_ICONS[m];
                return (
                  <Chip key={m} kind="choice" selected={mode === m} onClick={() => s.setTransportMode(m)}>
                    <Icon size={16} />
                    <span>{t(`way.${m}`)}</span>
                  </Chip>
                );
              })}
            </ChipGroup>
          </Card>

          {/* Stay opens the one Lifestyle dialog (the bed and the habits),
              which is richer than a card can hold. */}
          {s.openLifestyle && (
            <section className="sdock-card">
              <h3 className="sdock-card-h">
                <button type="button" className="sdock-card-head" aria-haspopup="dialog"
                  onClick={() => { exit.close(); s.openLifestyle(); }}>
                  <span className="sdock-card-label">{t('settings.stayShort')}</span>
                  <span className="sdock-card-value">{bed}</span>
                  <span className="sdock-card-go">{t('dock.change')}</span>
                </button>
              </h3>
            </section>
          )}
        </div>

        <div className="sdock-sheet-foot">
          <Button variant="quiet" className="sdock-clear" onClick={() => { setQ(''); setKind(startKind); setCard('where'); }}>
            {t('dock.clear')}
          </Button>
          <Button variant="primary" className="sdock-go" iconStart={<SearchIcon size={18} />} onClick={() => submit()}>
            {t('dock.search')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
