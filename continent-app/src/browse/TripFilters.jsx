import React from 'react';
import { BANDS, SORTS } from '../lib/tripFilters.js';
import { formatMoney } from '../lib/money.js';
import { SHORT, WEEK } from '../lib/tripLength.js';
import { tagLabel } from '../lib/tripTags.js';
import { FilterIcon } from '../components/Icons.jsx';
import { Dropdown } from '../components/Dropdown.jsx';
import { PlacesFilterSheet } from './PlacesFilterSheet.jsx';
import { FilterChips } from './FilterChips.jsx';

/**
 * The curated trip list's one filter row (T188, rebuilt by T387 for the v6
 * trips brief, item V3.3).
 *
 * Before: three stacked groups of full-width buttons (length, four cost
 * bands, up to thirteen tags) that pushed the first trip card to 804 px on a
 * 380 px phone, and a cost row that arrived after the library and moved the
 * list. Now one row: the length as a two-segment control (the short version
 * first, the same order as the trip page), one Filters button that opens the
 * shared filter sheet with cost, month, tag and the sort inside. The active
 * filters show as removable chips under the row (rule "Filter chips"), so
 * what narrows the list is always on screen and each one comes off alone.
 *
 * Length is never a filter that drops a trip: every trip exists at both
 * lengths (lib/tripLength.js). It sets the days and the total each card
 * shows and the total the cost band tests, and Clear all leaves it alone.
 */

const eurFmt = (lang) => (n) => formatMoney(n, { precision: 'whole', locale: lang });

/** The two-segment length control, shared by the list and the trip page. */
export function LengthSegments({ value, onChange, shortLabel, weekLabel, label, className = '' }) {
  return (
    <div className={`tl-seg ${className}`} role="group" aria-label={label}>
      {[[SHORT, shortLabel], [WEEK, weekLabel]].map(([key, text]) => (
        <button
          key={key}
          type="button"
          className={`tl-btn${value === key ? ' tl-on' : ''}`}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** The labels of the three cost bands, from the library's edges. */
function bandLabels(edges, t, lang) {
  const eur = eurFmt(lang);
  if (!edges) return { low: '', mid: '', high: '' };
  return {
    low: t('journey.fltUnder', { eur: eur(edges.low) }),
    mid: t('journey.fltBetween', { lo: eur(edges.low), hi: eur(edges.high) }),
    high: t('journey.fltOver', { eur: eur(edges.high) }),
  };
}

const monthName = (m, lang) => {
  try {
    return new Intl.DateTimeFormat(lang, { month: 'long' }).format(new Date(2026, m - 1, 1));
  } catch { return String(m); }
};

export function TripFilters({
  length, onLength,
  band, onBand, edges, counts,
  month = null, onMonth, monthCounts = {},
  tag = null, onTag, tags = [], tagCounts = {},
  sort = 'written', onSort,
  onClear, resultCount = 0, t, lang,
}) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef(null);
  const labels = bandLabels(edges, t, lang);
  const close = React.useCallback(() => setOpen(false), []);

  const active = (band != null && edges ? 1 : 0) + (month ? 1 : 0) + (tag ? 1 : 0);

  const groups = [];
  if (edges) {
    groups.push({
      key: 'cost',
      label: t('journey.fltCost'),
      options: BANDS.map((key) => ({ key, label: labels[key], n: counts?.[key] ?? 0, on: band === key })),
      onToggle: (key) => onBand(band === key ? null : key),
    });
  }
  if (tags.length > 0) {
    groups.push({
      key: 'tag',
      label: t('journey.fltTag'),
      options: tags.map((key) => ({ key, label: tagLabel(key), n: tagCounts[key] ?? 0, on: tag === key })),
      onToggle: (key) => onTag(tag === key ? null : key),
    });
  }

  // Month (rule "Month"): one select of the twelve months plus "Any".
  const monthField = (
    <section className="fsheet-section">
      <div className="fsheet-fields">
        <div className="fsheet-field is-wide">
          <span className="fsheet-label">{t('journey.fltMonth')}</span>
          <Dropdown
            value={month ? String(month) : ''}
            onChange={(v) => onMonth(v ? Number(v) : null)}
            options={[
              { value: '', label: t('journey.fltAnyMonth') },
              ...Array.from({ length: 12 }, (_, i) => ({
                value: String(i + 1),
                label: `${monthName(i + 1, lang)} (${monthCounts[i + 1] ?? 0})`,
              })),
            ]}
            placeholder={t('journey.fltAnyMonth')}
            searchThreshold={99}
          />
          <p className="tf-month-note">{t('journey.fltMonthNote')}</p>
        </div>
        <div className="fsheet-field is-wide">
          <span className="fsheet-label">{t('journey.sortLabel')}</span>
          <Dropdown
            value={sort}
            onChange={(v) => onSort(v)}
            options={SORTS.map((key) => ({ value: key, label: t(`journey.sort.${key}`) }))}
            placeholder={t('journey.sort.written')}
            searchThreshold={99}
          />
        </div>
      </div>
    </section>
  );

  // The chips name what narrows the list, each removable on its own.
  const chips = [];
  if (band != null && edges) chips.push({ key: 'band', label: labels[band], remove: () => onBand(null) });
  if (month) chips.push({ key: 'month', label: monthName(month, lang), remove: () => onMonth(null) });
  if (tag) chips.push({ key: 'tag', label: tagLabel(tag), remove: () => onTag(null) });

  return (
    <>
      <div className="tf-bar" role="group" aria-label={t('journey.fltAria')}>
        <LengthSegments
          value={length}
          onChange={onLength}
          shortLabel={t('journey.segShortAny')}
          weekLabel={t('journey.nDays', { n: 7 })}
          label={t('journey.lenLabel')}
        />
        <button
          type="button"
          ref={btnRef}
          className="tf-open"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <FilterIcon size={14} />
          <span>{t('filter.filters')}</span>
          {active > 0 && <span className="tf-count mono">{active}</span>}
        </button>
      </div>
      {chips.length > 0 && (
        <div className="tf-chips">
          <FilterChips t={t} chips={chips} onClearAll={onClear} />
        </div>
      )}
      {open && (
        <PlacesFilterSheet
          onClose={close}
          anchorRef={btnRef}
          groups={groups}
          extra={monthField}
          activeFilters={active}
          resetAll={onClear}
          resultCount={resultCount}
        />
      )}
    </>
  );
}
