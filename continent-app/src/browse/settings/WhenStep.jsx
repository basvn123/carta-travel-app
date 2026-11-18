import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { Segmented } from '../../components/ui/index.js';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { formatMoney } from '../../lib/money.js';
import { RangeCalendar } from './RangeCalendar.jsx';
import { NightsStepper, nightsText } from './settingsBits.jsx';
import { addMonths, nightsBetween } from './calendarModel.js';

const MODES = ['dates', 'month', 'any', 'cheapest'];

/** The next twelve months from this one, as 'YYYY-MM'. */
function nextMonths(today = new Date().toISOString().slice(0, 10)) {
  const first = today.slice(0, 7);
  return Array.from({ length: 12 }, (_, i) => addMonths(first, i));
}

/**
 * When (G12 Settings, APPROVED): four modes on one switch (Dates, A month,
 * Any time, Cheapest); switching keeps what each mode holds (the model
 * keeps them). Dates is the range calendar; A month the twelve months as
 * cards with a "from" figure only where the model has one; every mode but
 * Dates the nights. No notes.
 */
export function WhenStep({ model, onChange }) {
  const { t, lang, languages } = useI18n();
  const { when } = model;
  const bcp47 = languages.find((l) => l.code === lang)?.bcp47 || 'en-GB';
  const monthFmt = React.useMemo(() => new Intl.DateTimeFormat(bcp47, { month: 'long', timeZone: 'UTC' }), [bcp47]);
  const yearFmt = React.useMemo(() => new Intl.DateTimeFormat(bcp47, { year: 'numeric', timeZone: 'UTC' }), [bcp47]);
  const dayFmt = React.useMemo(() => new Intl.DateTimeFormat(bcp47, { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }), [bcp47]);
  const at = (iso) => new Date(`${iso}T00:00:00Z`);

  // A leaving day picked and its return still to come: held here, so the
  // prices never read a half trip.
  const [pending, setPending] = React.useState('');

  const setMode = (m) => { setPending(''); when.setMode(m); onChange(); };
  const onPick = (r) => {
    if (!r.complete) { setPending(r.start); return; }
    setPending('');
    when.setDates(r.start, r.end);
    onChange();
  };
  const months = React.useMemo(() => nextMonths(), []);
  const thisYear = new Date().toISOString().slice(0, 4);

  return (
    <div className="set-step set-when">
      <Segmented
        label={t('settings.sheet.row.when')}
        block
        className="set-modes"
        value={when.mode}
        onChange={setMode}
        options={MODES.map((m) => ({ value: m, label: t(`settings.sheet.mode.${m}`) }))}
      />

      {when.mode === 'dates' && (
        <>
          <RangeCalendar
            start={pending || when.start}
            end={pending ? '' : when.end}
            min={when.bounds?.min || ''}
            max={when.bounds?.max || ''}
            onPick={onPick}
          />
          {/* The trip as picked; read out as it changes. */}
          <p className="set-range" aria-live="polite">
            <span className="set-range-ic" aria-hidden="true"><HouseIcon.calendar size={20} /></span>
            {pending ? (
              <span className="set-range-text">
                <b>{dayFmt.format(at(pending))}</b>
                <span>{t('settings.sheet.cal.pickReturn')}</span>
              </span>
            ) : when.start && when.end ? (
              <span className="set-range-text">
                <b>{t('settings.datesRange', { start: dayFmt.format(at(when.start)), end: dayFmt.format(at(when.end)) })}</b>
                <span>{nightsText(t, nightsBetween(when.start, when.end))}</span>
              </span>
            ) : (
              <span className="set-range-text"><b>{t('settings.sheet.cal.pickLeave')}</b></span>
            )}
          </p>
        </>
      )}

      {when.mode === 'month' && (
        <div className="set-months" role="radiogroup" aria-label={t('settings.sheet.mode.month')}>
          {months.map((ym, i) => {
            const on = ym === when.month;
            const from = when.monthFrom ? when.monthFrom(ym) : null;
            const year = ym.slice(0, 4) !== thisYear ? yearFmt.format(at(`${ym}-01`)) : '';
            return (
              <Pressable
                key={ym}
                role="radio"
                aria-checked={on}
                tabIndex={on || (!when.month && i === 0) ? 0 : -1}
                className={`set-month${on ? ' is-on' : ''}`}
                haptic={on ? null : 'tick'}
                onClick={() => { when.setMonth(ym); onChange(); }}
                onKeyDown={(e) => {
                  // A radio group: every arrow moves the choice by one.
                  const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
                  if (!d) return;
                  e.preventDefault();
                  const group = e.currentTarget.parentElement;
                  const next = months[Math.max(0, Math.min(months.length - 1, i + d))];
                  when.setMonth(next);
                  onChange();
                  requestAnimationFrame(() => group?.querySelector('[aria-checked="true"]')?.focus());
                }}
              >
                <span className="set-month-name">{monthFmt.format(at(`${ym}-01`))}{year && <span className="set-month-year"> {year}</span>}</span>
                {Number.isFinite(from) && (
                  <span className="set-month-from">{t('settings.sheet.monthFrom', { amount: formatMoney(from) })}</span>
                )}
                <span className="sst-tile-tick" aria-hidden="true"><HouseIcon.check size={12} /></span>
              </Pressable>
            );
          })}
        </div>
      )}

      {when.mode !== 'dates' && (
        <NightsStepper nights={when.nights} onChange={(n) => { when.setNights(n); onChange(); }} />
      )}
    </div>
  );
}
