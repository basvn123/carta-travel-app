import React from 'react';
import { KindGlyph } from '../components/KindGlyph.jsx';
import { KINDS } from '../lib/taxonomy.js';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { ChevronDownIcon, ChevronRightIcon } from '../components/Icons.jsx';
import { CategoryRail } from './CategoryRail.jsx';

/**
 * The Explore filter rail (PLAN.md C6): every filter reachable without a
 * modal. Five groups - kind (the same glyphs the cards wear), verdict, role,
 * practical, country - on desktop in the left panel and inside a plain fold
 * inside the shared Filters sheet on a phone, whose primary button carries
 * the live count.
 *
 * v5: each group is a fold. Five groups open at once ran the panel past
 * the bottom of every laptop screen, and the country list, thirty-nine
 * rows long, sat under everything a reader had to scroll past to reach.
 * The first two groups open by default; the others open on demand, and a
 * group with something active says how many on its summary row, so a
 * closed fold never hides a filter that is narrowing the list.
 *
 * V3 (T383): the trip styles join as the first group, so they live where
 * every other filter lives; "Kind of place" is renamed "Size of place" (it
 * offered "City" beside the trip style "City") and starts closed. The
 * month, "No car needed" and the budget ceiling left the Practical group for
 * the input row above the grid (house rule "Settings line", explore N1), and
 * the fixed "Under 70 a day" toggle is gone: the ceiling replaces it.
 *
 * State contract: `xf` is one flat object owned by ExploreTab (and mirrored
 * into the URL there); this component only renders it and calls `patch`.
 * The pre-existing App-level filters that stay (gems, UNESCO, country) are
 * passed through so the rail is the single door to all of them.
 */

const VERDICTS = [
  { key: '3', labelKey: 'rating.tier3' },
  { key: '2', labelKey: 'rating.tier2' },
  { key: '1', labelKey: 'rating.tier1' },
];
const ROLE_KEYS = ['base', 'basecamp', 'daytrip', 'stop'];

// `open` is the fold's initial state only: React writes the attribute on
// mount and leaves the reader's toggling alone afterwards, which is what a
// disclosure should do.
function Group({ label, n = 0, open = false, children }) {
  return (
    <details className="xrail-group" open={open || undefined}>
      <summary className="xrail-legend">
        <span className="xrail-legend-text">{label}</span>
        {n > 0 && <span className="xrail-legend-n">{n}</span>}
        <ChevronDownIcon size={15} className="xrail-legend-chev" />
      </summary>
      <div className="xrail-group-body">{children}</div>
    </details>
  );
}

function toggleIn(list, v) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function ExploreFilterRail({
  t, xf, patch,
  gemOnly, setGemOnly,
  unescoOnly, setUnescoOnly,
  countryFilter, setCountryFilter, availableCountries,
  reachHours, setReachHours, reachAvailable,
  tripKinds, setTripKinds,
  onOpenCountry,
}) {
  const practicalN = [xf.quiet, xf.sea, unescoOnly,
    reachAvailable && reachHours != null].filter(Boolean).length;
  return (
    <div className="xrail">
      {setTripKinds && (
        <Group label={t('filter.tripType')} n={tripKinds.length} open>
          <CategoryRail tripKinds={tripKinds} setTripKinds={setTripKinds} />
        </Group>
      )}

      <Group label={t('filter.size')} n={xf.kinds.length}>
        <div className="xrail-toggles">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={`xrail-toggle ${xf.kinds.includes(k) ? 'on' : ''}`}
              aria-pressed={xf.kinds.includes(k)}
              onClick={() => patch({ kinds: toggleIn(xf.kinds, k) })}
            >
              <KindGlyph kind={k} size={11} label="" />
              <span>{t(`pkind.${k}`)}</span>
            </button>
          ))}
        </div>
      </Group>

      <Group label={t('filter.verdict')} n={xf.verdicts.length + (gemOnly ? 1 : 0)} open>
        <div className="xrail-toggles">
          {VERDICTS.map((v) => (
            <button
              key={v.key}
              type="button"
              className={`xrail-toggle ${xf.verdicts.includes(v.key) ? 'on' : ''}`}
              aria-pressed={xf.verdicts.includes(v.key)}
              onClick={() => patch({ verdicts: toggleIn(xf.verdicts, v.key) })}
            >
              {t(v.labelKey)}
            </button>
          ))}
          <button
            type="button"
            className={`xrail-toggle xrail-gem ${gemOnly ? 'on' : ''}`}
            aria-pressed={gemOnly}
            onClick={() => setGemOnly(!gemOnly)}
          >
            {t('legend.gem')}
          </button>
        </div>
      </Group>

      <Group label={t('filter.role')} n={xf.roles.length}>
        <div className="xrail-toggles">
          {ROLE_KEYS.map((r) => (
            <button
              key={r}
              type="button"
              className={`xrail-toggle ${xf.roles.includes(r) ? 'on' : ''}`}
              aria-pressed={xf.roles.includes(r)}
              onClick={() => patch({ roles: toggleIn(xf.roles, r) })}
            >
              {t(`role.short.${r}`)}
            </button>
          ))}
        </div>
      </Group>

      <Group label={t('filter.practical')} n={practicalN}>
        <div className="xrail-toggles">
          <button type="button" className={`xrail-toggle ${xf.quiet ? 'on' : ''}`}
            aria-pressed={xf.quiet} onClick={() => patch({ quiet: !xf.quiet })}>
            {t('filter.notCrowded')}
          </button>
          <button type="button" className={`xrail-toggle ${xf.sea ? 'on' : ''}`}
            aria-pressed={xf.sea} onClick={() => patch({ sea: !xf.sea })}>
            {t('filter.nearSea')}
          </button>
          <button type="button" className={`xrail-toggle ${unescoOnly ? 'on' : ''}`}
            aria-pressed={unescoOnly} onClick={() => setUnescoOnly(!unescoOnly)}>
            UNESCO
          </button>
        </div>
        {reachAvailable && (
          <label className="xrail-month">
            <span>{t('filter.reach')}</span>
            <select
              value={reachHours ?? ''}
              onChange={(e) => setReachHours(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t('filter.reachAny')}</option>
              {[2, 3, 4, 5].map((h) => (
                <option key={h} value={h}>{t('filter.reachHours', { n: h })}</option>
              ))}
            </select>
          </label>
        )}
      </Group>

      <Group label={t('sort.country')} n={countryFilter.length}>
        <div className="xrail-countries">
          {availableCountries.map(([iso2, name]) => (
            <span key={iso2} className="xrail-country-row">
              <label className="xrail-country">
                <input
                  type="checkbox"
                  checked={countryFilter.includes(iso2)}
                  onChange={() => setCountryFilter(toggleIn(countryFilter, iso2))}
                />
                <CountryFlag country={iso2} size={11} />
                <span>{name}</span>
              </label>
              {onOpenCountry && (
                <button className="xrail-country-page" onClick={() => onOpenCountry(iso2)}
                  aria-label={t('cpage.open', { country: name })}
                  title={t('cpage.open', { country: name })}>
                  <ChevronRightIcon size={15} />
                </button>
              )}
            </span>
          ))}
        </div>
      </Group>
    </div>
  );
}
