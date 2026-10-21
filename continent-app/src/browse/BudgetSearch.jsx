import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useSettings } from '../components/SettingsLine.jsx';
import { Stepper } from '../components/FilterControls.jsx';
import { Button, Field, Segmented } from '../components/ui/index.js';
import { formatMoney } from '../lib/money.js';
import { dedupeGateways } from '../hooks/useExploreCatalog.js';
import {
  budgetSearch, normalizeQuery, parseBudget, nextMonth, BUFFER_DEFAULT, BUFFER_STEPS,
  DAYS_MIN, DAYS_MAX, DAYS_DEFAULT, ADULTS_DEFAULT, MODES, MODE_DEFAULT,
} from '../lib/budgetSearch.js';
import { MAX_PARTY } from '../lib/tripTotal.js';
import { BudgetResults } from './BudgetResults.jsx';
import '../styles/73-budget-search.css';

/**
 * Search on a total budget (T506, roadmap 1.19; design in
 * Roadmap/1.19-budgetzoeken.md, carta-design "Budget search").
 *
 * One bar: "How much do you have?" first, and one sentence under it that
 * states every other input (who, how long, when, from where and how) with
 * one Change that opens them in place. Nothing is priced here: the search
 * is lib/budgetSearch.js, which prices every place with priceTrip(), and
 * the answer is BudgetResults (Fits, Tight, the receipt).
 *
 * The Lifestyle and the bed come from the settings line (useSettings), so
 * the search and the Explore card price a day from the same inputs.
 *
 * props
 *   data    the app data ({ destinations, meta })
 *   onOpen  (destId) => open that place's page, Explore's own door
 */
export function BudgetSearch({ data, onOpen }) {
  const { t, lang } = useI18n();
  const s = useSettings();
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const [draft, setDraft] = React.useState(() => ({
    budget: '',
    adults: Math.max(1, Math.min(MAX_PARTY, s?.party || ADULTS_DEFAULT)),
    children: 0,
    days: DAYS_DEFAULT,
    month: nextMonth(),
    mode: MODE_DEFAULT,
    buffer: BUFFER_DEFAULT,
  }));
  const [editing, setEditing] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState('');
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  // Once asked, the search follows every input in place; the deferred copy
  // keeps typing responsive while the catalogue reprices.
  const settled = React.useDeferredValue(draft);
  const query = React.useMemo(
    () => (submitted && parseBudget(settled.budget) ? normalizeQuery(settled) : null),
    [submitted, settled],
  );

  const list = React.useMemo(
    () => (query && data?.destinations ? dedupeGateways(Object.values(data.destinations)) : []),
    [data, query],
  );
  const lifestyle = s?.lifestyle || null;
  const stayTier = s?.stayTier || 'home';
  const result = React.useMemo(
    () => (query ? budgetSearch(list, query, { lifestyle, stayTier }) : null),
    [list, query, lifestyle, stayTier],
  );

  const example = formatMoney(1500);
  const monthName = (m) => new Intl.DateTimeFormat(lang, { month: 'long' }).format(new Date(2026, m - 1, 15));
  const pct = (v) => new Intl.NumberFormat(lang, { style: 'percent' }).format(v);
  const origin = s?.origin ? (data?.meta?.origins?.[s.origin]?.city || s.origin) : null;
  const head = draft.adults + draft.children;
  const people = head === 1 ? t('budget.person') : t('budget.people', { n: head });
  const summary = t(origin ? 'budget.summaryFrom' : 'budget.summary', {
    people, days: draft.days, month: monthName(draft.month), origin, by: t(`budget.by.${draft.mode}`),
  });

  const submit = (e) => {
    e.preventDefault();
    if (!parseBudget(draft.budget)) {
      setError(t('budget.amountError', { example }));
      return;
    }
    setError('');
    setSubmitted(true);
  };
  const clear = () => {
    setSubmitted(false);
    set({ budget: '' });
  };

  return (
    <section className="bgs" aria-labelledby={`${uid}-h`}>
      <form className="bgs-form" onSubmit={submit} noValidate>
        <h2 className="bgs-title" id={`${uid}-h`}>{t('budget.title')}</h2>
        <div className="bgs-main">
          <Field
            className="bgs-amount"
            label={t('budget.amount')}
            inputMode="numeric"
            autoComplete="off"
            placeholder={example}
            value={draft.budget}
            onChange={(e) => set({ budget: e.target.value })}
            hint={error ? undefined : t('budget.amountHint')}
            error={error || undefined}
          />
          <Button type="submit" className="bgs-submit">{t('budget.submit')}</Button>
        </div>
        <p className="bgs-summary">
          <span>{summary}</span>
          <Button variant="quiet" size="sm" aria-expanded={editing} aria-controls={`${uid}-f`}
            onClick={() => setEditing((v) => !v)}>
            {t('budget.change')}
          </Button>
        </p>
        <div className="bgs-fields" id={`${uid}-f`} hidden={!editing}>
          <fieldset className="bgs-group">
            <legend className="bgs-label">{t('budget.who')}</legend>
            <div className="bgs-step">
              <span className="bgs-step-name">{t('budget.adults')}</span>
              <Stepper value={draft.adults} min={1} max={MAX_PARTY - draft.children}
                onChange={(n) => set({ adults: n })} ariaLabel={t('budget.adults')}
                decLabel={t('budget.adultsLess')} incLabel={t('budget.adultsMore')} />
            </div>
            <div className="bgs-step">
              <span className="bgs-step-name">{t('budget.children')}</span>
              <Stepper value={draft.children} min={0} max={MAX_PARTY - draft.adults}
                onChange={(n) => set({ children: n })} ariaLabel={t('budget.children')}
                decLabel={t('budget.childrenLess')} incLabel={t('budget.childrenMore')} />
            </div>
          </fieldset>
          <fieldset className="bgs-group">
            <legend className="bgs-label">{t('budget.howLong')}</legend>
            <div className="bgs-step">
              <span className="bgs-step-name">{t('budget.daysN', { n: draft.days })}</span>
              <Stepper value={draft.days} min={DAYS_MIN} max={DAYS_MAX}
                onChange={(n) => set({ days: n })} ariaLabel={t('budget.howLong')}
                decLabel={t('budget.daysLess')} incLabel={t('budget.daysMore')} />
            </div>
          </fieldset>
          <Field as="select" className="bgs-group" label={t('budget.when')} value={draft.month}
            onChange={(e) => set({ month: Number(e.target.value) })}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{monthName(m)}</option>
            ))}
          </Field>
          <fieldset className="bgs-group bgs-group-wide">
            <legend className="bgs-label">{t('budget.fromHow')}</legend>
            {origin && <p className="bgs-origin">{t('budget.fromOrigin', { origin })}</p>}
            <Segmented label={t('budget.fromHow')} value={draft.mode} block
              onChange={(v) => set({ mode: v })}
              options={MODES.map((m) => ({ value: m, label: t(`budget.mode.${m}`) }))} />
          </fieldset>
          <Field as="select" className="bgs-group" label={t('budget.buffer')} value={String(draft.buffer)}
            hint={t('budget.bufferHint')}
            onChange={(e) => set({ buffer: Number(e.target.value) })}>
            {BUFFER_STEPS.map((b) => (
              <option key={b} value={String(b)}>{b === 0 ? t('budget.bufferOff') : pct(b)}</option>
            ))}
          </Field>
        </div>
      </form>
      {result && (
        <BudgetResults result={result} onOpen={onOpen} onClear={clear}
          monthName={monthName} pct={pct} people={people} />
      )}
    </section>
  );
}
