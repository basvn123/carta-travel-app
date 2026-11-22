import React from 'react';
import { createPortal } from 'react-dom';
import { Button, Chip, ChipGroup, IconButton } from '../../components/ui/index.js';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';
import { useDialogExit } from '../../lib/motion.js';
import { formatMoney } from '../../lib/money.js';
import { useFirstRun } from '../../lib/firstRunContext.js';
import { isEmptyTaste } from '../../lib/taste.js';
import {
  BUDGET_STEPS, GROUP_PICKS, MATCH_MIN, PICKS, SCORE_STEPS, TEMP_BANDS, bandLabel, parsePicks, sortOptionsFor, sortShown,
} from './filterModel.js';
import { filtersOpener } from './filtersStore.js';
import { countKey } from '../../lib/plural.js';
import { useI18n } from '../../i18n/index.jsx';
import '../../styles/83-filters.css';

/**
 * The Explore filters (G12, Explore top round 2, decision.md section 2), in
 * the Settings sheet's look: a head with the title and the close, the groups,
 * and a foot with Clear all and "Show 46 places". Every change applies at
 * once (the list behind recounts); the foot's button only closes.
 *
 *   phone    a modal bottom sheet: scrim, grab handle (swipe down closes),
 *            focus trapped, Escape closes, focus back to the opener
 *   desktop  a panel hung under the search bar, non-modal so the list stays
 *            in view: focus moves to its title, Escape or a press outside
 *            closes, focus goes back to the Filters control
 *
 * `f` is the tab's filter state and setters (ExploreTab builds it):
 *   xf, setXf, sortKey, setSortKey, showFavOnly, setShowFavOnly, gemOnly,
 *   setGemOnly, unescoOnly, setUnescoOnly, month, monthName, noTemp,
 *   dayFactor, tripSpan, total, listOn, count, onClearAll, onSetMonth, onShow
 */
export function FilterSheet({ desktop, group, nonce, onClose, f, t, lang }) {
  const exit = useDialogExit(onClose);
  const titleId = React.useId();
  const panelRef = React.useRef(null);
  const titleRef = React.useRef(null);
  // A door that names a group (a chip in the applied row) lands on it.
  React.useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const sec = group ? el.querySelector(`[data-group="${group}"]`) : null;
    if (sec) {
      sec.scrollIntoView({ block: 'start' });
      sec.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
    } else if (desktop) {
      titleRef.current?.focus({ preventScroll: true });
    }
  }, [group, nonce, desktop]);
  const fast = useFastFilters(f);
  const body = <FilterGroups f={fast} t={t} />;
  const foot = <FilterFoot f={fast} t={t} lang={lang} onDone={() => { f.onShow?.(); exit.close(); }} />;
  return desktop
    ? <FilterPanel {...{ panelRef, titleRef, titleId, exit, t, body, foot }} />
    : <FilterBottomSheet {...{ panelRef, titleRef, titleId, exit, t, body, foot }} />;
}

/**
 * A tap answers at once (owner: the count lagged behind a tap): the sheet
 * keeps the tapped filters itself, shows its chips and the count from
 * `f.countFor` (a pass over the rows already priced) in the same frame, and
 * hands the change to the tab as a transition, so the list and every price
 * on it follow after without holding the tap.
 */
function useFastFilters(f) {
  const [mine, setMine] = React.useState(null);
  const latest = React.useRef(f.xf);
  // The tab's filters moved on (the transition landed, or it changed them
  // itself): its state rules again.
  if (mine && f.xf !== mine.base) setMine(null);
  latest.current = mine ? mine.xf : f.xf;
  const { countFor, setXf } = f;
  const fastSet = React.useCallback((up) => {
    const next = typeof up === 'function' ? up(latest.current) : up;
    latest.current = next;
    if (!countFor) { setXf(next); return; }
    setMine((m) => ({ base: m ? m.base : f.xf, xf: next, total: countFor(next) }));
    React.startTransition(() => setXf(next));
  }, [countFor, setXf, f.xf]);
  return mine ? { ...f, xf: mine.xf, total: mine.total, setXf: fastSet } : { ...f, setXf: fastSet };
}

function Head({ titleId, titleRef, t, onClose, grab = null }) {
  return (
    <header className="flt-head" {...(grab || {})}>
      {grab && <span className="flt-grab" aria-hidden="true" />}
      <div className="flt-head-row">
        <h2 className="flt-title" id={titleId} ref={titleRef} tabIndex={-1}>{t('filters.title')}</h2>
        <IconButton className="flt-close" label={t('filters.close')} onClick={onClose}>
          <HouseIcon.close size={18} />
        </IconButton>
      </div>
    </header>
  );
}

function FilterBottomSheet({ panelRef, titleRef, titleId, exit, t, body, foot }) {
  const scrimRef = React.useRef(null);
  useFocusTrap(panelRef, exit.close, { initialFocusRef: titleRef });
  // Swipe down on the head closes, as every bottom sheet in the app does.
  const drag = React.useRef({ id: null, y0: 0 });
  const grab = {
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' || e.target.closest('button')) return;
      drag.current = { id: e.pointerId, y0: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e) => {
      if (drag.current.id !== e.pointerId || !panelRef.current) return;
      const dy = Math.max(0, e.clientY - drag.current.y0);
      panelRef.current.style.transition = 'none';
      panelRef.current.style.transform = `translateY(${dy}px)`;
    },
    onPointerUp: (e) => {
      if (drag.current.id !== e.pointerId) return;
      const dy = Math.max(0, e.clientY - drag.current.y0);
      drag.current = { id: null, y0: 0 };
      if (panelRef.current) {
        panelRef.current.style.transition = '';
        panelRef.current.style.transform = '';
      }
      if (dy > 90) exit.close();
    },
  };
  grab.onPointerCancel = grab.onPointerUp;
  return createPortal(
    <div ref={scrimRef} className={`fsheet-scrim flt-scrim${exit.leaving ? ' is-leaving' : ''}`}
      onMouseDown={(e) => { if (e.target === scrimRef.current) exit.close(); }}>
      <div ref={panelRef} className={`fsheet flt flt-sheet${exit.leaving ? ' is-leaving' : ''}`}
        role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <Head titleId={titleId} titleRef={titleRef} t={t} onClose={exit.close} grab={grab} />
        {body}
        {foot}
      </div>
    </div>,
    document.body,
  );
}

/** Where the panel hangs: under the band's search field, 720 px wide and
 *  centred (G12 map view round 2: two columns, every section in view). */
function measurePanelPlace() {
  const field = document.querySelector('.band .band-search') || document.querySelector('.band');
  const r = field?.getBoundingClientRect();
  const gutter = 16;
  const top = Math.round((r ? r.bottom : 120) + 8);
  const width = Math.round(Math.min(window.innerWidth - gutter * 2, 720));
  const left = Math.round(Math.max(gutter, (window.innerWidth - width) / 2));
  return { top, left, width, maxHeight: Math.max(320, window.innerHeight - top - gutter) };
}

function usePanelPlace() {
  // Measured in the first render, not after it: a panel that starts hidden
  // refuses the focus FilterSheet moves into it in the same commit, which
  // left keyboard users on the Filters control with Escape dead (flow F1).
  const [place, setPlace] = React.useState(measurePanelPlace);
  React.useEffect(() => {
    const measure = () => setPlace(measurePanelPlace());
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  return place;
}

function FilterPanel({ panelRef, titleRef, titleId, exit, t, body, foot }) {
  const place = usePanelPlace();
  const close = exit.close;
  const closeAndReturn = React.useCallback(() => {
    const back = filtersOpener();
    close();
    if (back) requestAnimationFrame(() => back.focus({ preventScroll: true }));
  }, [close]);
  // A press outside closes; the Filters control itself toggles (it carries
  // data-filters-door), so it is left to its own click.
  React.useEffect(() => {
    const onDown = (e) => {
      const el = e.target;
      if (panelRef.current?.contains(el) || el.closest?.('[data-filters-door], .band-filters')) return;
      // A menu or sheet opened from inside the panel (Settings) is not outside.
      if (el.closest?.('[role="dialog"], [role="menu"], .set')) return;
      close();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [close, panelRef]);
  // Escape is heard on the document, not only inside the panel: focus may
  // still sit on the Filters control or on the page. A dialog or the search
  // panel that handles Escape first (defaultPrevented) wins.
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const at = document.activeElement;
      const ours = !at || at === document.body || panelRef.current?.contains(at)
        || at.closest?.('.band-filters, [data-filters-door]');
      if (!ours) return;
      e.preventDefault();
      closeAndReturn();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeAndReturn, panelRef]);
  return createPortal(
    <div ref={panelRef} className={`flt flt-panel${exit.leaving ? ' is-leaving' : ''}`}
      role="region" aria-labelledby={titleId} style={place}>
      <Head titleId={titleId} titleRef={titleRef} t={t} onClose={closeAndReturn} />
      {body}
      {foot}
    </div>,
    document.body,
  );
}

function Group({ id, label, children, className = '' }) {
  const hid = `flt-g-${id}`;
  return (
    <section className={`flt-group ${className}`.trim()} data-group={id} aria-labelledby={hid}>
      <h3 className="flt-label" id={hid}>{label}</h3>
      {children}
    </section>
  );
}

/** An option's live count (G12 map view round 2): how many places the list
 *  would hold with it. A count of 0 greys the option out. Said in the app's
 *  language, not the browser's: an English page on a Dutch browser read
 *  "3.855" (judgement-5). */
function Count({ n }) {
  const { lang } = useI18n();
  if (n == null) return null;
  return <span className={`flt-n${n === 0 ? ' is-zero' : ''}`}>{new Intl.NumberFormat(lang).format(n)}</span>;
}

/** A row of toggle chips (several may be on): the kit's filter chips. */
function Toggles({ label, items }) {
  return (
    <div className="flt-chips" role="group" aria-label={label}>
      {items.map((it) => (
        <Chip key={it.id} kind="filter" selected={it.on} onClick={it.toggle}
          className={`flt-chip${!it.on && it.n === 0 ? ' is-zero' : ''}`} data-count={it.n ?? undefined}>
          {it.label}<Count n={it.n} />
        </Chip>
      ))}
    </div>
  );
}

export function FilterGroups({ f, t }) {
  const { xf, setXf } = f;
  // The live counts: each option's figure is the list it would leave, worked
  // out over the priced rows (f.countFor) a moment after a tap, so a run of
  // taps counts once.
  const later = React.useDeferredValue(xf);
  const counts = React.useMemo(() => {
    const c = f.countFor;
    if (typeof c !== 'function') return null;
    const v = later;
    const now = c(v);
    const pick = {};
    for (const id of Object.keys(PICKS)) pick[id] = v.picks.includes(id) ? now : c({ ...v, picks: parsePicks([...v.picks, id]) });
    const temp = {};
    for (const b of TEMP_BANDS) temp[b.id] = v.temps.includes(b.id) ? now : c({ ...v, temps: [...v.temps, b.id] });
    const budget = {};
    for (const eur of [...BUDGET_STEPS, v.budget].filter(Boolean)) budget[eur] = c({ ...v, budget: eur });
    const score = {};
    for (const n of SCORE_STEPS) score[n] = c({ ...v, minScore: n, verdicts: [] });
    return {
      now, pick, temp, budget, score,
      any: c({ ...v, budget: null }),
      scoreAny: c({ ...v, minScore: null, verdicts: [] }),
      top: c({ ...v, minScore: null, verdicts: ['excellent'] }),
      nocar: v.nocar ? now : c({ ...v, nocar: true }),
      quiet: v.quiet ? now : c({ ...v, quiet: true }),
      match: v.minMatch ? now : c({ ...v, minMatch: MATCH_MIN }),
      gems: f.gemOnly ? now : c(v, (p) => !!p.rating?.hidden_gem),
      unesco: f.unescoOnly ? now : c(v, (p) => !!p.beauty?.unesco),
      saved: f.showFavOnly ? now : c(v, (p) => !!f.favorites?.has?.(p.id)),
    };
  }, [later, f.countFor, f.gemOnly, f.unescoOnly, f.showFavOnly, f.favorites]);
  const togglePick = (id) => () => setXf((v) => {
    const on = v.picks.includes(id);
    return { ...v, picks: parsePicks(on ? v.picks.filter((x) => x !== id) : [...v.picks, id]) };
  });
  const pickItems = (group) => GROUP_PICKS[group].map((id) => ({
    id, label: t(PICKS[id].labelKey), on: xf.picks.includes(id), toggle: togglePick(id), n: counts?.pick[id],
  }));
  const isTop = xf.verdicts.length === 1 && xf.verdicts[0] === 'excellent';
  const setScore = (n) => () => setXf((v) => ({ ...v, minScore: n, verdicts: [] }));
  const toggleTemp = (id) => () => setXf((v) => {
    const on = v.temps.includes(id);
    const next = on ? v.temps.filter((x) => x !== id) : [...v.temps, id];
    return { ...v, temps: TEMP_BANDS.map((b) => b.id).filter((x) => next.includes(x)) };
  });
  const flip = (k) => () => setXf((v) => ({ ...v, [k]: !v[k] }));
  // The steps are a person's day; the words follow the traveller's view
  // (V15: a filter compares the figure the card shows).
  const money = (eur) => formatMoney(eur * (f.dayFactor || 1));
  const steps = [...BUDGET_STEPS];
  // A ceiling from a rail (the cost rail's own) stays visible as a choice.
  if (xf.budget && !steps.includes(xf.budget)) steps.push(xf.budget);
  steps.sort((a, b) => a - b);
  const setBudget = (eur) => () => setXf((v) => ({ ...v, budget: eur }));
  const dayLabel = t(f.tripSpan ? 'filters.aTrip' : 'filters.aDay');
  // Sort shows on a list only, decided when the sheet opens: the first
  // filter turns the overview into a list, and a Sort row arriving at the
  // top then pushed every group down under the finger (G12 round 2).
  const [withSort] = React.useState(!!f.listOn);
  // The active style's explore half is the taste (useTravelStyles); with
  // one, For you leads the choices.
  const tasteRaw = useFirstRun()?.choices?.taste;
  const hasTaste = !!tasteRaw && !isEmptyTaste(tasteRaw);
  const sortValue = sortShown(f.sortKey, hasTaste);

  return (
    <div className="flt-body">
      <div className="flt-groups">
        {/* G12 map view round 2: the Score, then the day's price. */}
        <Group id="score" label={t('filters.score')}>
          <ChipGroup label={t('filters.score')} className="flt-chips">
            <Chip kind="choice" selected={!xf.minScore && !isTop} onClick={setScore(null)} className="flt-chip">
              {t('filters.any')}<Count n={counts?.scoreAny} />
            </Chip>
            {SCORE_STEPS.map((n) => (
              <Chip key={n} kind="choice" selected={xf.minScore === n && !isTop} onClick={setScore(n)}
                className={`flt-chip${counts?.score[n] === 0 ? ' is-zero' : ''}`} data-count={counts?.score[n]}>
                {t('filters.scoreMin', { n })}<Count n={counts?.score[n]} />
              </Chip>
            ))}
            <Chip kind="choice" selected={isTop} onClick={() => setXf((v) => ({ ...v, minScore: null, verdicts: ['excellent'] }))}
              className="flt-chip" data-count={counts?.top}>
              {t('filters.topRated')}<Count n={counts?.top} />
            </Chip>
          </ChipGroup>
        </Group>

        <Group id="day" label={dayLabel}>
          <ChipGroup label={dayLabel} className="flt-chips">
            <Chip kind="choice" selected={!xf.budget} onClick={setBudget(null)} className="flt-chip">
              {t('filters.any')}<Count n={counts?.any} />
            </Chip>
            {steps.map((eur) => (
              <Chip key={eur} kind="choice" selected={xf.budget === eur} onClick={setBudget(eur)}
                className={`flt-chip${counts?.budget[eur] === 0 && xf.budget !== eur ? ' is-zero' : ''}`} data-count={counts?.budget[eur]}>
                {t('filters.upTo', { eur: money(eur) })}<Count n={counts?.budget[eur]} />
              </Chip>
            ))}
          </ChipGroup>
        </Group>

        <Group id="temp" label={f.month ? t('filters.dayHigh', { month: f.monthName }) : t('filters.dayHighAny')}>
          {f.month ? (
            <>
              <Toggles label={t('filters.dayHigh', { month: f.monthName })} items={TEMP_BANDS.map((b) => ({
                id: b.id, label: bandLabel(b.id, t), on: xf.temps.includes(b.id), toggle: toggleTemp(b.id), n: counts?.temp[b.id],
              }))} />
              {f.noTemp > 0 && (
                <p className="flt-note">{t(countKey(t.lang, f.noTemp, 'filters.noTempOne', 'filters.noTemp'), { n: f.noTemp })}</p>
              )}
            </>
          ) : (
            // The button says what is missing; a sentence beside it said it
            // twice (judgement-4).
            <div className="flt-nomonth">
              <Button variant="secondary" size="sm" onClick={f.onSetMonth}
                iconStart={<HouseIcon.calendar size={16} />}>
                {t('filters.setMonth')}
              </Button>
            </div>
          )}
        </Group>

        <Group id="water" label={t('filters.water')}>
          <Toggles label={t('filters.water')} items={pickItems('water')} />
        </Group>

        <Group id="walk" label={t('filters.walking')}>
          <Toggles label={t('filters.walking')} items={[
            ...pickItems('walk'),
            { id: 'nocar', label: t('filter.noCar'), on: xf.nocar, toggle: flip('nocar'), n: counts?.nocar },
          ]} />
        </Group>

        {f.hasTaste && (
          <Group id="style" label={t('filters.yourStyle')}>
            {f.styleName && <p className="flt-note">{f.styleName}</p>}
            <Toggles label={t('filters.yourStyle')} items={[
              { id: 'match', label: t('filters.matchMin', { n: Math.round(MATCH_MIN * 100) }), on: !!xf.minMatch,
                toggle: () => setXf((v) => ({ ...v, minMatch: v.minMatch ? null : MATCH_MIN })), n: counts?.match },
            ]} />
          </Group>
        )}

        <Group id="kind" label={t('filters.kind')}>
          <Toggles label={t('filters.kind')} items={[...pickItems('size'), ...pickItems('feel')]} />
        </Group>

        <Group id="good" label={t('filters.goodToKnow')}>
          <Toggles label={t('filters.goodToKnow')} items={[
            { id: 'gems', label: t('filters.gems'), on: f.gemOnly, toggle: () => f.setGemOnly(!f.gemOnly), n: counts?.gems },
            { id: 'unesco', label: t('dest.unesco'), on: f.unescoOnly, toggle: () => f.setUnescoOnly(!f.unescoOnly), n: counts?.unesco },
            { id: 'quiet', label: t('filter.notCrowded'), on: xf.quiet, toggle: flip('quiet'), n: counts?.quiet },
            { id: 'saved', label: t('filters.savedOnly'), on: f.showFavOnly, toggle: () => f.setShowFavOnly(!f.showFavOnly), n: counts?.saved },
          ]} />
        </Group>

        {withSort && (
          <Group id="sort" label={t('filters.sort')} className="flt-group--wide">
            {/* Last, as the spec lists it (proposal.md 5.2): the list's head
                carries Sort too, so here it closes the sheet. Chips, not a
                segment: the choices (For you first) wrap in
                every language at 360 px. */}
            <ChipGroup label={t('filters.sort')} className="flt-chips flt-sort">
              {sortOptionsFor(hasTaste).map((o) => (
                <Chip key={o.key} kind="choice" selected={sortValue === o.key} onClick={() => f.setSortKey(o.key)} className="flt-chip">
                  {t(o.labelKey, o.args)}
                </Chip>
              ))}
            </ChipGroup>
          </Group>
        )}
      </div>
    </div>
  );
}

function FilterFoot({ f, t, lang, onDone }) {
  const n = f.total ?? 0;
  const label = n === 0 ? t('filters.none')
    : t(countKey(lang, n, 'filters.showOne', 'filters.show'), { n: new Intl.NumberFormat(lang).format(n) });
  // The count is spoken once it settles, not on every step of a change.
  const [said, setSaid] = React.useState('');
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    const h = setTimeout(() => setSaid(label), 700);
    return () => clearTimeout(h);
  }, [label]);
  return (
    <footer className="flt-foot">
      <p className="sr-only" role="status">{said}</p>
      <Button variant="quiet" className="flt-clear" disabled={!f.count} onClick={f.onClearAll}>
        {t('filters.clearAll')}
      </Button>
      <Button variant="primary" className="flt-show" disabled={n === 0} onClick={onDone}>
        {label}
      </Button>
    </footer>
  );
}
