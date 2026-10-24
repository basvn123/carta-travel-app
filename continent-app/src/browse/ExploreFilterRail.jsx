import React from 'react';
import { Button, Chip, ChipGroup, Segmented, Switch } from '../components/ui/index.js';
import { TRIP_KINDS } from '../lib/trip_kinds.js';
import { KIND_ICONS } from './CategoryRail.jsx';
import { formatMoney } from '../lib/money.js';
import { DayPriceDot } from '../components/DayPriceDot.jsx';
import {
  ChevronDownIcon, DiamondIcon, GlobeIcon, MedalIcon, PersonIcon, SwimIcon, TrainIcon,
} from '../components/Icons.jsx';
import '../styles/78-filter-pane.css';
import { useDayView } from '../hooks/useDayView.js';

/**
 * The Explore filter pane (T589, Explore v6). One column that fits about one
 * desktop screen with nothing folded, in the order a traveller narrows:
 *
 *   Kind of place   small chips with their icon, many can be on
 *   Size            plain words, no icons (the old size glyphs read as noise);
 *                   beside Kind of place since T604, the same question
 *   Good for       one choice in plain words (a base for the week, a day
 *                   trip, a stop on the way) with one help line under it
 *   Budget a day    a stepped two-thumb range, min and max read out above it
 *   Month           twelve short month buttons and Any, one choice
 *   Rating          Any, Very good, Excellent, Exceptional ("this band and up")
 *   Flight up to    Any, 2 h, 3 h, 4 h, 6 h (only with flights on the way)
 *   Max travel time the ground reach, only where its data exists
 *   Good to know    icon, word and a switch per row
 *
 * Country left this pane (the settings line holds Countries) and the
 * shortlist left it for the toolbar's Saved toggle; their props may still be
 * passed and are ignored here.
 *
 * State contract: `xf` belongs to ExploreTab (and the URL there); this
 * component only renders it and calls `patch`. App-level filters (gems,
 * UNESCO, reach) are passed through. The same component is the body of the
 * phone's Filters sheet, which brings its own count and Clear all, so the
 * pane's own head shows only in the desktop side panel (CSS).
 */

const RATING_STEPS = ['1', '2', '3'];
/** Budget steps in whole euros a person a day; one more stop past the last is "Any". */
const BUDGET_STOPS = [0, 20, 40, 60, 80, 100, 130, 160];
const FLIGHT_HOURS = [2, 3, 4, 6];
const REACH_HOURS = [2, 3, 4, 5];
const SIZE_KEYS = ['metro', 'city', 'town', 'village', 'area'];
/** "Good for": one plain choice standing for one or two role keys. */
const GOOD_FOR = [
  { key: 'base', roles: ['base', 'basecamp'] },
  { key: 'daytrip', roles: ['daytrip'] },
  { key: 'stop', roles: ['stop'] },
];

function toggleIn(list, v) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** The lowest tier the verdict list asks for, or '' when it asks for none. */
export function minVerdict(verdicts) {
  if (!verdicts?.length) return '';
  return String(Math.min(...verdicts.map(Number)));
}

/** "This band and up": the verdict list a minimum tier stands for. */
export function verdictsFrom(min) {
  return min ? RATING_STEPS.filter((k) => Number(k) >= Number(min)) : [];
}

/** The "Good for" choice a role list stands for, or '' for any. */
export function goodForOf(roles) {
  if (!roles?.length) return '';
  const hit = GOOD_FOR.find((g) => g.roles.some((r) => roles.includes(r)));
  return hit ? hit.key : '';
}

/**
 * Minutes from a leg's departure to its arrival, read off the two local clock
 * times ("07:05", "09:40"); an arrival at or before the departure is the next
 * day. Local times, so a leg that crosses a time zone reads an hour or two
 * off its real length. Null when either time is missing.
 */
export function legMinutes(leg) {
  const hm = (s) => {
    const m = typeof s === 'string' ? /^(\d{1,2}):(\d{2})/.exec(s) : null;
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = hm(leg?.dep);
  const b = hm(leg?.arr);
  if (a == null || b == null) return null;
  const d = b - a;
  return d > 0 ? d : d + 1440;
}

/** The stops of the budget range: the house steps, plus any odd value a link carries. */
function budgetStops(xf) {
  const extra = [xf.bmin, xf.budget].filter((n) => Number.isFinite(n) && n > 0 && !BUDGET_STOPS.includes(n));
  return [...new Set([...BUDGET_STOPS, ...extra])].sort((a, b) => a - b);
}

function BudgetRange({ t, xf, patch }) {
  // T694 (V15, V16): the stops are stored a person a day and shown in the
  // traveller's view, the same factor the cards use, so a filter compares
  // the number on the card and gives the same places in both views.
  const view = useDayView();
  const stops = budgetStops(xf);
  const anyAt = stops.length; // the stop past the last euro step is "Any"
  const lo = Math.max(0, stops.indexOf(xf.bmin || 0));
  const hi = xf.budget ? stops.indexOf(xf.budget) : anyAt;
  const pct = (i) => `${(i / anyAt) * 100}%`;
  const label = (i) => (i >= anyAt ? t('filter.budgetAny') : formatMoney(stops[i] * view.factor));
  const setLo = (i) => {
    const v = Math.min(i, hi - 1);
    patch({ bmin: v > 0 ? stops[v] : null });
  };
  const setHi = (i) => {
    const v = Math.max(i, lo + 1);
    patch({ budget: v >= anyAt ? null : stops[v] });
  };
  return (
    <div className="xpane-range" style={{ '--lo': pct(lo), '--hi': pct(hi) }}>
      <div className="xpane-range-read" aria-hidden="true">
        <span className="xpane-range-val">
          <span className="xpane-range-cap">{t('filter.budgetMin')}</span>
          <span className="xpane-range-fig">{label(lo)}</span>
        </span>
        <span className="xpane-range-val is-end">
          <span className="xpane-range-cap">{t('filter.budgetMax')}</span>
          <span className="xpane-range-fig">{label(hi)}</span>
        </span>
      </div>
      <div className="xpane-range-track">
        <span className="xpane-range-fill" aria-hidden="true" />
        <input type="range" className="xpane-range-in is-lo" min={0} max={anyAt} step={1} value={lo}
          aria-label={t('filter.budgetMinAria')} aria-valuetext={label(lo)}
          onChange={(e) => setLo(Number(e.target.value))} />
        <input type="range" className="xpane-range-in is-hi" min={0} max={anyAt} step={1} value={hi}
          aria-label={t('filter.budgetMaxAria')} aria-valuetext={label(hi)}
          onChange={(e) => setHi(Number(e.target.value))} />
      </div>
    </div>
  );
}

function MonthPick({ t, lang, month, onPick }) {
  const names = React.useMemo(() => {
    const narrow = new Intl.DateTimeFormat(lang, { month: 'narrow' });
    const long = new Intl.DateTimeFormat(lang, { month: 'long' });
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(2026, i, 15);
      return { m: i + 1, short: narrow.format(d), long: long.format(d) };
    });
  }, [lang]);
  const btn = (value, text, name, extra = '') => {
    const on = (month || null) === value;
    return (
      <Chip key={value ?? 'any'} kind="choice" selected={on}
        aria-label={name} title={name}
        className={`xpane-month${extra}`}
        onClick={() => onPick(value)}>
        <span aria-hidden="true">{text}</span>
      </Chip>
    );
  };
  return (
    <ChipGroup label={t('filter.month')} className="xpane-months">
      {btn(null, t('filter.paneAny'), t('filter.anyMonth'), ' is-any')}
      {names.map((n) => btn(n.m, n.short, n.long))}
    </ChipGroup>
  );
}

const KNOW_ICONS = {
  gems: DiamondIcon, nocar: TrainIcon, quiet: PersonIcon, sea: SwimIcon, unesco: GlobeIcon, badged: MedalIcon,
};

export function ExploreFilterRail({
  t, lang, xf, patch,
  gemOnly, setGemOnly,
  unescoOnly, setUnescoOnly,
  reachHours, setReachHours, reachAvailable,
  tripKinds, setTripKinds,
  flightLimitAvailable = false,
  count = null, onClearAll = null,
  only = null,
}) {
  const view = useDayView();   // T694: the budget's unit in the traveller's view
  // T604: `only` draws a subset of the sections (a quick chip's popover
  // draws one), so a filter has one look and one behaviour wherever it is.
  const show = (key) => !only || only.includes(key);
  const uid = React.useId();
  const hid = (key) => `xpane-h-${key}${uid.replace(/[^a-zA-Z0-9]/g, '')}`;
  const rating = minVerdict(xf.verdicts);
  const goodFor = goodForOf(xf.roles);
  const hours = (n) => t('filter.paneHours', { n });

  const knowRows = [
    { key: 'gems', label: t('rail.gems'), on: gemOnly, set: setGemOnly },
    { key: 'nocar', label: t('filter.noCar'), on: xf.nocar, set: (v) => patch({ nocar: v }) },
    { key: 'quiet', label: t('filter.notCrowded'), on: xf.quiet, set: (v) => patch({ quiet: v }) },
    { key: 'sea', label: t('filter.nearSea'), on: xf.sea, set: (v) => patch({ sea: v }) },
    { key: 'unesco', label: t('dest.unesco'), on: unescoOnly, set: setUnescoOnly },
    { key: 'badged', label: t('filter.bestOf'), on: xf.badged, set: (v) => patch({ badged: v }) },
  ].filter((r) => r.set);

  return (
    <div className="xrail xpane">
      {count != null && !only && (
        <div className="xpane-head">
          {/* T596 (owner 2026-10-22): no place count in the pane's head. */}
          <p className="xpane-count sr-only" aria-live="polite">
            {count === 1 ? t('filter.paneCountOne') : t('filter.paneCount', { n: count.toLocaleString(lang) })}
          </p>
          {onClearAll && (
            <Button variant="quiet" size="sm" className="xpane-clear" onClick={onClearAll}>
              {t('filter.clearAll')}
            </Button>
          )}
        </div>
      )}

      {setTripKinds && show('type') && (
        <section className="xpane-sec" aria-labelledby={hid('type')}>
          <h3 className="xrail-h" id={hid('type')}>{t('filter.tripType')}</h3>
          <div className="xpane-chips" role="group" aria-labelledby={hid('type')}>
            {TRIP_KINDS.map((k) => {
              const Icon = KIND_ICONS[k.key];
              return (
                <Chip key={k.key} icon={Icon ? <Icon size={16} /> : null}
                  selected={tripKinds.includes(k.key)}
                  onClick={() => setTripKinds(toggleIn(tripKinds, k.key))}>
                  {t(`kind.${k.key}`)}
                </Chip>
              );
            })}
          </div>
        </section>
      )}

      {show('size') && (
        <section className="xpane-sec" aria-labelledby={hid('size')}>
          <h3 className="xrail-h" id={hid('size')}>{t('filter.size')}</h3>
          <div className="xpane-chips" role="group" aria-labelledby={hid('size')}>
            {SIZE_KEYS.map((k) => (
              <Chip key={k} selected={xf.kinds.includes(k)}
                onClick={() => patch({ kinds: toggleIn(xf.kinds, k) })}>
                {t(`filter.sizeWord.${k}`)}
              </Chip>
            ))}
          </div>
        </section>
      )}

      {show('good') && (
        <section className="xpane-sec" aria-labelledby={hid('good')}>
          <h3 className="xrail-h" id={hid('good')}>{t('filter.goodFor')}</h3>
          <ChipGroup label={t('filter.goodFor')} className="xpane-chips">
            <Chip kind="choice" selected={!goodFor} onClick={() => patch({ roles: [] })}>
              {t('filter.paneAny')}
            </Chip>
            {GOOD_FOR.map((g) => (
              <Chip key={g.key} kind="choice" selected={goodFor === g.key}
                onClick={() => patch({ roles: g.roles })}>
                {t(`filter.goodFor.${g.key}`)}
              </Chip>
            ))}
          </ChipGroup>
        </section>
      )}

      {show('budget') && (
        <section className="xpane-sec" aria-labelledby={hid('budget')}>
          {/* What the day figure holds, once per view (T498): the dot sits
              after the label, outside it. */}
          <div className="xpane-label-row">
            <h3 className="xrail-h" id={hid('budget')}>{t('filter.budget')}</h3>
            <DayPriceDot />
            <span className="xpane-unit">{view.total ? view.unit : t('filter.budgetUnit')}</span>
          </div>
          <BudgetRange t={t} xf={xf} patch={patch} />
        </section>
      )}

      {show('month') && (
        <section className="xpane-sec" aria-labelledby={hid('month')}>
          <h3 className="xrail-h" id={hid('month')}>{t('filter.month')}</h3>
          <MonthPick t={t} lang={lang} month={xf.month} onPick={(m) => patch({ month: m })} />
        </section>
      )}

      {show('rating') && (
        <section className="xpane-sec" aria-labelledby={hid('rating')}>
          <h3 className="xrail-h" id={hid('rating')}>{t('sort.rating')}</h3>
          <Segmented label={t('sort.rating')} size="sm" block className="xpane-seg"
            value={rating}
            onChange={(v) => patch({ verdicts: verdictsFrom(v) })}
            options={[
              { value: '', label: t('filter.paneAny') },
              ...RATING_STEPS.map((k) => ({ value: k, label: t(`score.band${k}`) })),
            ]} />
        </section>
      )}

      {flightLimitAvailable && show('flight') && (
        <section className="xpane-sec" aria-labelledby={hid('flight')}>
          <h3 className="xrail-h" id={hid('flight')}>{t('filter.flightUpTo')}</h3>
          <Segmented label={t('filter.flightUpTo')} size="sm" block className="xpane-seg"
            value={xf.fh ? String(xf.fh) : ''}
            onChange={(v) => patch({ fh: v ? Number(v) : null })}
            options={[
              { value: '', label: t('filter.paneAny') },
              ...FLIGHT_HOURS.map((h) => ({ value: String(h), label: hours(h) })),
            ]} />
        </section>
      )}

      {reachAvailable && setReachHours && show('reach') && (
        <section className="xpane-sec" aria-labelledby={hid('reach')}>
          <h3 className="xrail-h" id={hid('reach')}>{t('filter.reach')}</h3>
          <Segmented label={t('filter.reach')} size="sm" block className="xpane-seg"
            value={reachHours ? String(reachHours) : ''}
            onChange={(v) => setReachHours(v ? Number(v) : null)}
            options={[
              { value: '', label: t('filter.paneAny') },
              ...REACH_HOURS.map((h) => ({ value: String(h), label: hours(h) })),
            ]} />
        </section>
      )}

      {show('know') && (
        <section className="xpane-sec xpane-know" aria-labelledby={hid('know')}>
          <h3 className="xrail-h" id={hid('know')}>{t('filter.goodToKnow')}</h3>
          <div className="xpane-know-list">
            {knowRows.map((r) => {
              const Icon = KNOW_ICONS[r.key];
              return (
                <Switch key={r.key} className="xpane-know-row" checked={!!r.on} onChange={r.set}
                  label={(
                    <span className="xpane-know-label">
                      <span className="xpane-know-icon"><Icon size={r.key === 'gems' ? 12 : 18} /></span>
                      {r.label}
                    </span>
                  )} />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/** The quick chips' groups, in the pane's own order (T604). */
const QUICK_KEYS = ['type', 'good', 'budget', 'month', 'rating', 'flight'];

/**
 * The focused view's quick filter chips (T604, owner 2026-10-22: "make it
 * consistent with the actual filter panel"). One chip per pane section, in
 * the pane's order; a chip names the section until it is set, then the
 * value it holds, in the selected tint with its tick. A chip opens a small
 * popover that draws exactly that section of the pane (ExploreFilterRail
 * with `only`), so a filter has the same controls, labels and state in the
 * chip and in the pane. Escape or a press outside closes it and focus goes
 * back to the chip; Clear empties that one section.
 *
 * Takes the pane's own props, unchanged.
 */
export function ExploreQuickFilters(props) {
  const { t, lang, xf, patch, tripKinds, setTripKinds, flightLimitAvailable = false } = props;
  const { factor } = useDayView();   // T694: chip figures in the traveller's view
  const eurIn = (v) => formatMoney(v * factor);
  const [openKey, setOpenKey] = React.useState(null);
  const [left, setLeft] = React.useState(0);
  const barRef = React.useRef(null);
  const popRef = React.useRef(null);
  const chipRefs = React.useRef(new Map());
  const popId = `xqf${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const summary = {
    type: () => {
      const on = tripKinds || [];
      if (on.length === 1) return t(`kind.${on[0]}`);
      return on.length > 1 ? t('where.chipMany', { label: t('filter.tripType'), n: on.length }) : '';
    },
    good: () => {
      const k = goodForOf(xf.roles);
      return k ? t(`filter.goodFor.${k}`) : '';
    },
    budget: () => {
      if (xf.bmin && xf.budget) {
        return t('explore.qfRange', { lo: eurIn(xf.bmin), hi: eurIn(xf.budget) });
      }
      if (xf.budget) return t('explore.qfBudget', { eur: eurIn(xf.budget) });
      return xf.bmin ? t('filter.budgetFrom', { eur: eurIn(xf.bmin) }) : '';
    },
    month: () => (xf.month
      ? new Intl.DateTimeFormat(lang, { month: 'long' }).format(new Date(2026, xf.month - 1, 15))
      : ''),
    rating: () => {
      const r = minVerdict(xf.verdicts);
      return r ? t('explore.qfRatingUp', { band: t(`score.band${r}`) }) : '';
    },
    flight: () => (xf.fh ? t('explore.qfFlight', { n: xf.fh }) : ''),
  };
  const clear = {
    type: () => setTripKinds([]),
    good: () => patch({ roles: [] }),
    budget: () => patch({ bmin: null, budget: null }),
    month: () => patch({ month: null }),
    rating: () => patch({ verdicts: [] }),
    flight: () => patch({ fh: null }),
  };
  const label = {
    type: t('filter.tripType'), good: t('filter.goodFor'), budget: t('filter.budget'),
    month: t('filter.month'), rating: t('sort.rating'), flight: t('filter.flightUpTo'),
  };
  const keys = QUICK_KEYS.filter((k) => (k !== 'type' || setTripKinds) && (k !== 'flight' || flightLimitAvailable));
  const open = keys.includes(openKey) ? openKey : null;

  const close = React.useCallback((refocus) => {
    const chip = chipRefs.current.get(openKey);
    setOpenKey(null);
    if (refocus) chip?.focus();
  }, [openKey]);

  // The popover hangs under its chip, kept inside the bar's width; focus
  // moves into it so the keyboard reaches its controls next.
  React.useLayoutEffect(() => {
    if (!open) return;
    const bar = barRef.current;
    const chip = chipRefs.current.get(open);
    const pop = popRef.current;
    if (!bar || !chip || !pop) return;
    const b = bar.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    setLeft(Math.max(0, Math.min(c.left - b.left, b.width - pop.offsetWidth)));
    pop.querySelector('button:not(:disabled), input')?.focus({ preventScroll: true });
  }, [open]);

  React.useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (popRef.current?.contains(e.target)) return;
      if (chipRefs.current.get(open)?.contains(e.target)) return;
      close(false);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close(true);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, close]);

  return (
    <div className="xqf" ref={barRef}>
      <div className="xqf-row" role="group" aria-label={t('explore.qfAria')}>
        {keys.map((k) => {
          const value = summary[k]();
          const isOpen = open === k;
          return (
            <Chip key={k} kind="filter" selected={!!value}
              className={`xqf-chip${isOpen ? ' is-open' : ''}`}
              ref={(el) => { if (el) chipRefs.current.set(k, el); else chipRefs.current.delete(k); }}
              aria-pressed={undefined}
              aria-haspopup="dialog"
              aria-expanded={isOpen}
              aria-controls={isOpen ? popId : undefined}
              onClick={() => setOpenKey(isOpen ? null : k)}>
              {value || label[k]}
              <ChevronDownIcon size={14} className="xqf-chev" />
            </Chip>
          );
        })}
      </div>
      {open && (
        <div className="xqf-pop" id={popId} ref={popRef} role="dialog" aria-label={label[open]}
          style={{ left }}>
          <ExploreFilterRail {...props} count={null} onClearAll={null} only={[open]} />
          {summary[open]() && (
            <div className="xqf-foot">
              <Button variant="quiet" size="sm" className="xqf-clear" onClick={clear[open]}>
                {t('where.clearGroup')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
