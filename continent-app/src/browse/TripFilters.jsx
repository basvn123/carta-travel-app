import React from 'react';
import { BANDS, SORTS } from '../lib/tripFilters.js';
import { formatMoney } from '../lib/money.js';
import { SHORT, WEEK } from '../lib/tripLength.js';
import { tagLabel } from '../lib/tripTags.js';
import { Chip, Field, Segmented } from '../components/ui/index.js';
import { InfoDot } from '../components/InfoDot.jsx';

/**
 * The trip library's filters as parts, not a bar (T498, roadmap 1.3b rule 4
 * and section C; before: T188, T387).
 *
 * The library used to carry its own filter bar (.tf-bar). Now it has none:
 * the active filters are chips in the one refine row (FilterChips), and the
 * controls live where every other Explore filter lives: in the side panel on
 * a desktop (TripFilterPanel, the xrail grammar) and in the shared filter
 * sheet on a phone (tripFilterParts' groups plus TripSheetExtra). One
 * description feeds all three, so a filter cannot exist in one and not the
 * other.
 *
 * Length is never a filter that drops a trip: every trip exists at each
 * length (lib/tripLength.js). It sets the days and the figure each card
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

/**
 * Every filter of one style's list, described once:
 *
 *   groups  [{ key, label, options: [{ key, label, on, disabled }], onToggle }]
 *           cost and theme, the chip groups (the sheet's and the panel's)
 *   chips   [{ key, label, remove }] what narrows the list, for FilterChips
 *   active  how many filters are on (the Filters button's count)
 *   month, sort, beds  the select and segmented controls' state, for
 *           TripFilterPanel and TripSheetExtra
 *
 * A choice that would show nothing is disabled unless it is the one on.
 */
// A description, not a component; it lives beside the components it feeds.
// eslint-disable-next-line react-refresh/only-export-components
export function tripFilterParts({
  band = null, onBand, edges = null, counts = {},
  month = null, onMonth, monthCounts = {},
  tag = null, onTag, tags = [], tagCounts = {},
  sort = 'written', onSort,
  hasBeds = false, cheapBeds = false, onBeds,
  t, lang,
}) {
  const labels = bandLabels(edges, t, lang);
  const groups = [];
  if (edges) {
    groups.push({
      key: 'cost',
      label: t('journey.fltCostPp'),
      options: BANDS.map((key) => ({
        key, label: labels[key], on: band === key, disabled: band !== key && !(counts?.[key] > 0),
      })),
      onToggle: (key) => onBand(band === key ? null : key),
    });
  }
  if (tags.length > 0) {
    groups.push({
      key: 'tag',
      label: t('journey.fltTheme'),
      options: tags.map((key) => ({
        key, label: tagLabel(key), on: tag === key, disabled: tag !== key && !(tagCounts[key] > 0),
      })),
      onToggle: (key) => onTag(tag === key ? null : key),
    });
  }

  const chips = [];
  if (band != null && edges) chips.push({ key: 'band', label: labels[band], remove: () => onBand(null) });
  if (month) chips.push({ key: 'month', label: monthName(month, lang), remove: () => onMonth(null) });
  if (tag) chips.push({ key: 'tag', label: tagLabel(tag), remove: () => onTag(null) });
  if (cheapBeds) chips.push({ key: 'beds', label: t('journey.bedsCheap'), remove: () => onBeds(false) });

  return {
    groups,
    chips,
    active: chips.length,
    month: { value: month, onChange: onMonth, counts: monthCounts },
    sort: { value: sort, onChange: onSort },
    beds: hasBeds || cheapBeds ? { value: cheapBeds, onChange: onBeds } : null,
    t,
    lang,
  };
}

/** The month select: the twelve months plus Any (rule "Month"). */
function MonthField({ parts }) {
  const { t, lang, month } = parts;
  return (
    <Field
      as="select"
      className="tf-field"
      label={t('journey.fltMonth')}
      value={month.value ? String(month.value) : ''}
      onChange={(e) => month.onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">{t('journey.fltAnyMonth')}</option>
      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
        <option key={m} value={String(m)} disabled={month.value !== m && !(month.counts?.[m] > 0)}>
          {monthName(m, lang)}
        </option>
      ))}
    </Field>
  );
}

function SortField({ parts }) {
  const { t, sort } = parts;
  return (
    <Field
      as="select"
      className="tf-field"
      label={t('journey.sortLabel')}
      value={sort.value}
      onChange={(e) => sort.onChange(e.target.value)}
    >
      {SORTS.map((key) => <option key={key} value={key}>{t(`journey.sort.${key}`)}</option>)}
    </Field>
  );
}

/** Any bed or budget beds, with the glossary dot on its first mention. */
function BedsControl({ parts }) {
  const { t, beds } = parts;
  return (
    <div className="tlib-beds">
      <Segmented
        size="sm"
        label={t('journey.bedsLabel')}
        value={beds.value ? 'cheap' : 'any'}
        onChange={(v) => beds.onChange(v === 'cheap')}
        options={[
          { value: 'any', label: t('journey.bedsAny') },
          { value: 'cheap', label: t('journey.bedsCheap') },
        ]}
      />
      <InfoDot term="budget-beds" />
    </div>
  );
}

function PanelGroup({ g }) {
  const hid = `tf-h-${g.key}`;
  return (
    <section className="xrail-sec" aria-labelledby={hid}>
      <h3 className="xrail-h" id={hid}>{g.label}</h3>
      <div className="xrail-chips" role="group" aria-labelledby={hid}>
        {g.options.map((o) => (
          <Chip key={o.key} kind="filter" selected={!!o.on} disabled={o.disabled} onClick={() => g.onToggle(o.key)}>
            {o.label}
          </Chip>
        ))}
      </div>
    </section>
  );
}

/**
 * The library's filters in the desktop side panel, in its grammar: one
 * section a group, a 12 px label over the control, in the order the
 * traveller decides (length, cost, month, beds, theme, then the sort).
 * Without parts (the styles list, or a style still loading) it holds the
 * length alone.
 */
export function TripFilterPanel({ lengthControl, parts = null, t }) {
  const group = (key) => (parts ? parts.groups.filter((g) => g.key === key).map((g) => <PanelGroup key={g.key} g={g} />) : null);
  return (
    <div className="tf-panel" role="group" aria-label={t('journey.fltAria')}>
      <section className="xrail-sec" aria-labelledby="tf-h-length">
        <h3 className="xrail-h" id="tf-h-length">{t('journey.lenLabel')}</h3>
        {lengthControl}
      </section>
      {group('cost')}
      {parts && (
        <section className="xrail-sec">
          <MonthField parts={parts} />
        </section>
      )}
      {parts?.beds && (
        <section className="xrail-sec" aria-labelledby="tf-h-beds">
          <h3 className="xrail-h" id="tf-h-beds">{t('journey.bedsLabel')}</h3>
          <BedsControl parts={parts} />
        </section>
      )}
      {group('tag')}
      {parts && (
        <section className="xrail-sec">
          <SortField parts={parts} />
        </section>
      )}
    </div>
  );
}

/** What the phone's filter sheet holds under its chip groups: the month,
 *  where you sleep and the sort. */
export function TripSheetExtra({ parts }) {
  const { t } = parts;
  return (
    <section className="fsheet-section tf-sheet-extra">
      <div className="fsheet-fields">
        <div className="fsheet-field is-wide"><MonthField parts={parts} /></div>
        {parts.beds && (
          <div className="fsheet-field is-wide">
            <span className="fsheet-label">{t('journey.bedsLabel')}</span>
            <BedsControl parts={parts} />
          </div>
        )}
        <div className="fsheet-field is-wide"><SortField parts={parts} /></div>
      </div>
    </section>
  );
}
