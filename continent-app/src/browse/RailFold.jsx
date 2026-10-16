import React from 'react';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { ChevronDownIcon, ChevronRightIcon } from '../components/Icons.jsx';
import { Chip, Field, IconButton } from '../components/ui/index.js';

/**
 * The filter rail's quiet fold and its country list, shared by Explore and
 * Destinations (T457, the owner on 2026-10-16: "make sure the filter tabs on
 * the left of both Explore and Destinations are aligned"; Destinations had a
 * bare "All countries" button with no flags).
 *
 *   RailFold     a closed <details> under a 12 px heading, with a count chip
 *                when something inside is on
 *   CountryFold  the country choice: a search, then one row a country with
 *                its flag. Explore picks several (checkboxes, `countryFilter`
 *                is a list); Destinations picks one (radios, its `country` is
 *                one code that the URL, the band and every layer read), with
 *                "All countries" first.
 *
 * Countries come in as [iso2, localName, otherName?]; the search finds a
 * country by either name. A country with no drawn flag keeps the flag's
 * width, so every name starts on the same line.
 *
 * The fold is never closed by the code: the traveller opens and closes it.
 * A single choice that arrives from elsewhere (a link, the By country track,
 * a typed country) opens it once and scrolls the chosen row into view, so
 * the panel shows what the list is filtered by.
 */
export const RailFold = React.forwardRef(function RailFold({ label, n = 0, className = '', children }, ref) {
  return (
    <details className={`xrail-fold ${className}`.trim()} ref={ref}>
      <summary className="xrail-fold-head">
        <span className="xrail-h">{label}</span>
        {n > 0 && <Chip kind="count">{n}</Chip>}
        <ChevronDownIcon size={16} className="xrail-fold-chev" />
      </summary>
      <div className="xrail-fold-body">{children}</div>
    </details>
  );
});

export function CountryFold({
  t, countries, selected, onPick, single = false, name = 'rail-country',
  onOpenCountry = null, className = '',
}) {
  const [query, setQuery] = React.useState('');
  const foldRef = React.useRef(null);
  const listRef = React.useRef(null);
  const picked = single ? (selected[0] || '') : '';
  React.useEffect(() => {
    if (!single || !picked) return;
    const fold = foldRef.current;
    if (fold && !fold.open) fold.open = true;
    const list = listRef.current;
    const row = list?.querySelector('input:checked')?.closest('li');
    if (list && row && list.clientHeight > 0) {
      const top = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
      if (top < list.scrollTop || top + row.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = Math.max(0, top - list.clientHeight / 2);
      }
      // The panel scrolls on its own too: bring the row into its view.
      row.scrollIntoView?.({ block: 'nearest' });
    }
  }, [single, picked]);
  const q = query.trim().toLowerCase();
  const shown = q
    ? countries.filter(([, local, other]) => local.toLowerCase().includes(q)
      || (other || '').toLowerCase().includes(q))
    : countries;
  const row = (iso2, label, on, flag) => (
    <li key={iso2 || 'all'} className="xrail-country-row">
      <label className="xrail-country">
        <input
          type={single ? 'radio' : 'checkbox'}
          name={single ? name : undefined}
          checked={on}
          onChange={() => onPick(iso2)}
        />
        <span className="xrail-flag" aria-hidden="true">{flag}</span>
        <span>{label}</span>
      </label>
      {onOpenCountry && iso2 && (
        <IconButton label={t('cpage.open', { country: label })} onClick={() => onOpenCountry(iso2)}
          className="xrail-country-page">
          <ChevronRightIcon size={16} />
        </IconButton>
      )}
    </li>
  );
  return (
    <RailFold label={t('sort.country')} n={selected.length} className={className} ref={foldRef}>
      <Field label={t('filter.countrySearch')} hideLabel type="search" value={query}
        placeholder={t('filter.countrySearch')} onChange={(e) => setQuery(e.target.value)}
        className="xrail-country-find" />
      <div role={single ? 'radiogroup' : 'group'} aria-label={t('sort.country')}>
        <ul className="xrail-countries" ref={listRef}>
          {single && row('', t('places.allCountries'), selected.length === 0, null)}
          {shown.map(([iso2, local]) => row(iso2, local, selected.includes(iso2),
            <CountryFlag country={iso2} size={12} />))}
        </ul>
      </div>
    </RailFold>
  );
}
