import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { IconButton } from '../../components/ui/index.js';
import { haptic } from '../../lib/haptics.js';
import {
  addMonths, clampDay, monthOf, monthWeeks, moveDay, rangeState, pickDay, weekdayIndex,
} from './calendarModel.js';

/**
 * The range calendar (G12 Settings, When: Dates). A clean month: tap the
 * leaving day, then the return day. One grid (`role="grid"`) and one tab
 * stop: the arrows move by a day and a week, Home and End to the week's
 * ends, Page Up and Down by a month; Enter or Space picks. Each day's name
 * is the full date with its place in the range ("Saturday 12 June 2027,
 * leave"). No dots, no notes (APPROVED).
 *
 *   <RangeCalendar start end min max onPick={(range) => ...} />
 *
 * `onPick({ start, end, complete })` after every tap; the caller applies a
 * complete pair and holds a half one.
 */
export function RangeCalendar({ start, end, min = '', max = '', onPick }) {
  const { t, lang, languages } = useI18n();
  const bcp47 = languages.find((l) => l.code === lang)?.bcp47 || 'en-GB';
  const fmt = React.useMemo(() => ({
    month: new Intl.DateTimeFormat(bcp47, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    day: new Intl.DateTimeFormat(bcp47, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
    head: new Intl.DateTimeFormat(bcp47, { weekday: 'narrow', timeZone: 'UTC' }),
    headLong: new Intl.DateTimeFormat(bcp47, { weekday: 'long', timeZone: 'UTC' }),
  }), [bcp47]);
  const at = (iso) => new Date(`${iso}T00:00:00Z`);

  const first = clampDay(start || min || new Date().toISOString().slice(0, 10), min, max);
  const [focusDay, setFocusDay] = React.useState(first);
  const [view, setView] = React.useState(monthOf(first));
  const gridRef = React.useRef(null);
  const wantFocus = React.useRef(false);

  React.useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    gridRef.current?.querySelector(`[data-day="${focusDay}"]`)?.focus();
  }, [focusDay, view]);

  const moveTo = (iso) => {
    const d = clampDay(iso, min, max);
    wantFocus.current = true;
    setFocusDay(d);
    if (monthOf(d) !== view) setView(monthOf(d));
  };
  const pick = (iso) => {
    if ((min && iso < min) || (max && iso > max)) return;
    haptic('tick');
    setFocusDay(iso);
    onPick(pickDay({ start, end }, iso));
  };
  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(focusDay); return; }
    const to = moveDay(focusDay, e.key, e.shiftKey);
    if (!to) return;
    e.preventDefault();
    moveTo(to);
  };

  const canPrev = !min || addMonths(view, -1) >= monthOf(min);
  const canNext = !max || addMonths(view, 1) <= monthOf(max);
  const page = (n) => {
    const ym = addMonths(view, n);
    setView(ym);
    // The tab stop follows into the month shown, on the same day number.
    const day = Math.min(Number(focusDay.slice(8, 10)), 28);
    setFocusDay(clampDay(`${ym}-${String(day).padStart(2, '0')}`, min, max));
  };

  const weeks = monthWeeks(view);
  // Monday to Sunday heads from a known Monday (2024-01-01).
  const heads = Array.from({ length: 7 }, (_, i) => `2024-01-0${i + 1}`);
  const focusInView = monthOf(focusDay) === view ? focusDay : `${view}-01`;

  const dayName = (iso) => {
    const name = fmt.day.format(at(iso));
    const st = rangeState(iso, start, end);
    return st ? t(`settings.sheet.cal.${st}`, { date: name }) : name;
  };

  return (
    <div className="set-cal">
      <div className="set-cal-top">
        <h4 className="set-cal-month" id={`set-cal-${view}`}>{fmt.month.format(at(`${view}-01`))}</h4>
        <span className="set-cal-pages">
          <IconButton label={t('settings.sheet.cal.prev')} disabled={!canPrev} onClick={() => page(-1)}>
            <HouseIcon.prev size={18} />
          </IconButton>
          <IconButton label={t('settings.sheet.cal.next')} disabled={!canNext} onClick={() => page(1)}>
            <HouseIcon.next size={18} />
          </IconButton>
        </span>
      </div>
      <table ref={gridRef} className="set-cal-grid" role="grid" aria-labelledby={`set-cal-${view}`} onKeyDown={onKeyDown}>
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h} scope="col" abbr={fmt.headLong.format(at(h))}>
                <span aria-hidden="true">{fmt.head.format(at(h))}</span>
                <span className="sr-only">{fmt.headLong.format(at(h))}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.find(Boolean)}>
              {w.map((iso, i) => {
                if (!iso) return <td key={`x${i}`} className="set-cal-empty" />;
                const st = rangeState(iso, start, end);
                const off = (min && iso < min) || (max && iso > max);
                const cls = ['set-cal-day', st && `is-${st}`, off && 'is-off',
                  st === 'in' && weekdayIndex(iso) === 0 && 'is-row-start',
                  st === 'in' && weekdayIndex(iso) === 6 && 'is-row-end',
                  // The band leaves the leave and return discs toward the
                  // range, except across the end of a week row.
                  end && st === 'start' && weekdayIndex(iso) !== 6 && 'has-end',
                  st === 'end' && weekdayIndex(iso) !== 0 && 'has-start'].filter(Boolean).join(' ');
                return (
                  <td
                    key={iso}
                    data-day={iso}
                    className={cls}
                    role="gridcell"
                    tabIndex={iso === focusInView ? 0 : -1}
                    aria-selected={st ? 'true' : 'false'}
                    aria-disabled={off ? 'true' : undefined}
                    aria-label={dayName(iso)}
                    onClick={() => pick(iso)}
                    onFocus={() => { if (iso !== focusDay) setFocusDay(iso); }}
                  >
                    <span className="set-cal-n" aria-hidden="true">{Number(iso.slice(8, 10))}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
