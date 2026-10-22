import React, { useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { CountryFlag } from './CountryFlag.jsx';
import { Button, Segmented } from './ui/index.js';
import { CheckIcon, GlobeIcon, SearchIcon } from './Icons.jsx';
import { SheetShell } from '../browse/SheetShell.jsx';

/**
 * Explore's countries (T581, the owner 2026-10-22: "a country button, and
 * then you pick which countries you want to include or exclude", visible on
 * the desktop's settings line and better placed on a phone).
 *
 * One list of ISO2 codes, read one of two ways: only these countries, or
 * every country but these (`not`). The rows are toggles with a tick; the
 * search narrows them. Every change applies at once.
 */

/** "All of Europe", "Italy", "Italy, Spain", "4 countries", "Not France", "All but 3". */
export function countriesValue(t, list, not, names) {
  if (!list?.length) return t('settings.countriesAll');
  const name = (cc) => names.get(cc) || cc;
  if (not) return list.length === 1 ? t('settings.countryNot', { country: name(list[0]) }) : t('settings.countriesNotN', { n: list.length });
  if (list.length <= 2) return list.map(name).join(', ');
  return t('settings.countriesN', { n: list.length });
}

export function CountriesPanel({ countries, list, setList, not, setNot, autoFocus = true }) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const sorted = useMemo(
    () => [...(countries || [])].sort((a, b) => a[1].localeCompare(b[1], lang)),
    [countries, lang],
  );
  const q = query.trim().toLowerCase();
  const shown = q ? sorted.filter(([, name]) => name.toLowerCase().includes(q)) : sorted;
  const on = new Set(list);
  const toggle = (cc) => setList(on.has(cc) ? list.filter((x) => x !== cc) : [...list, cc]);

  return (
    <div className="ctry-panel">
      <Segmented
        block
        size="sm"
        className="ctry-mode"
        label={t('settings.countries')}
        value={not ? 'not' : 'only'}
        onChange={(v) => setNot(v === 'not')}
        options={[
          { value: 'only', label: t('settings.countriesOnly') },
          { value: 'not', label: t('settings.countriesExcept') },
        ]}
      />
      <div className="from-field">
        <SearchIcon size={18} className="from-field-icon" />
        <input
          className="from-input"
          type="search"
          value={query}
          // The panel opens on the traveller's own press, to type in.
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('settings.countriesSearch')}
          autoComplete="off"
        />
      </div>
      <ul className="from-ul ctry-list" aria-label={t('settings.countries')}>
        {shown.map(([cc, name]) => (
          <li key={cc}>
            <button type="button" className={`from-row${on.has(cc) ? ' is-on' : ''}`}
              aria-pressed={on.has(cc)} onClick={() => toggle(cc)}>
              <span className="from-row-flag" aria-hidden="true"><CountryFlag country={cc} size={14} /></span>
              <span className="from-row-main"><span className="from-row-name">{name}</span></span>
              {on.has(cc) && <CheckIcon size={16} className="from-row-tick" />}
            </button>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="from-note" role="status">{t('settings.countriesNone', { query: query.trim() })}</p>}
      <div className="ctry-foot">
        <Button variant="quiet" size="sm" disabled={!list.length} onClick={() => setList([])}>
          {t('settings.countriesClear')}
        </Button>
      </div>
    </div>
  );
}

/** The phone's door (T581): a secondary beside Filters that opens the panel as a sheet. */
export function CountriesButton({ s, className = '' }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const names = useMemo(() => new Map(s?.availableCountries || []), [s?.availableCountries]);
  if (!s?.setCountryFilter) return null;
  const list = s.countryFilter || [];
  const value = countriesValue(t, list, s.countryNot, names);
  return (
    <>
      <Button ref={ref} variant="secondary" className={`ctry-btn${list.length ? ' is-set' : ''} ${className}`.trim()}
        iconStart={<GlobeIcon size={18} />} onClick={() => setOpen(true)}
        aria-haspopup="dialog" aria-expanded={open}
        aria-label={`${t('settings.countries')}: ${value}`}>
        <span className="ctry-btn-text">{list.length ? value : t('settings.countries')}</span>
      </Button>
      {open && (
        <SheetShell title={t('settings.countries')} onClose={() => setOpen(false)} anchorRef={ref}
          width={420} className="ctry-sheet" labelId="ctry-sheet-title" closeLabel={t('a11y.close')}>
          <CountriesPanel countries={s.availableCountries} list={list} setList={s.setCountryFilter}
            not={!!s.countryNot} setNot={s.setCountryNot} autoFocus={false} />
          <Button variant="primary" block className="settings-done" onClick={() => setOpen(false)}>
            {t('settings.countriesDone')}
          </Button>
        </SheetShell>
      )}
    </>
  );
}
