import React from 'react';
import { KindGlyph } from '../components/KindGlyph.jsx';
import { KINDS } from '../lib/taxonomy.js';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { ChevronDownIcon, ChevronRightIcon } from '../components/Icons.jsx';
import { Chip, ChipGroup, Field, IconButton, Switch, Tile, TileGroup } from '../components/ui/index.js';
import { TRIP_KINDS } from '../lib/trip_kinds.js';
import { KIND_ICONS } from './CategoryRail.jsx';
import { formatMoney } from '../lib/money.js';
import { countryName } from '../lib/countryName.js';

/**
 * The Explore filter rail, rebuilt on the kit (T440, the owner's review of
 * 2026-10-13: "the buttons feel like AI; make it professional, custom").
 *
 * Every filter Explore had is still here; only the controls changed, each
 * kind of choice drawn with the one kit part made for it:
 *
 *   Trip type     Tiles, an icon over the word, two across (many can be on)
 *   Budget, month Fields with a visible label (moved here from the row above
 *                 the list, so every input that narrows the list lives in
 *                 one place)
 *   Rating        one choice row: Any, Very good, Excellent, Exceptional,
 *                 each meaning "this band and up" (the old per-tier toggles
 *                 and old links map onto it)
 *   On or off     Switches: hidden gems, no car, quiet in high season, near
 *                 the sea, World Heritage, best of its country, my shortlist
 *   Size, what you do with it, country
 *                 longer lists, in quiet folds that start closed
 *
 * State contract: `xf` belongs to ExploreTab (and the URL there); this
 * component only renders it and calls `patch`. App-level filters (gems,
 * UNESCO, country, reach, shortlist) are passed through, so the rail stays
 * the single door to all of them, on desktop in the side panel and on a
 * phone inside the shared Filters sheet.
 */

const ROLE_KEYS = ['base', 'basecamp', 'daytrip', 'stop'];
const RATING_STEPS = ['1', '2', '3'];

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

function Fold({ label, n = 0, children }) {
  return (
    <details className="xrail-fold">
      <summary className="xrail-fold-head">
        <span className="xrail-h">{label}</span>
        {n > 0 && <Chip kind="count">{n}</Chip>}
        <ChevronDownIcon size={16} className="xrail-fold-chev" />
      </summary>
      <div className="xrail-fold-body">{children}</div>
    </details>
  );
}

export function ExploreFilterRail({
  t, lang, xf, patch, budgetSteps,
  gemOnly, setGemOnly,
  unescoOnly, setUnescoOnly,
  countryFilter, setCountryFilter, availableCountries,
  reachHours, setReachHours, reachAvailable,
  tripKinds, setTripKinds,
  showFavOnly, setShowFavOnly,
  onOpenCountry,
}) {
  const [countryQuery, setCountryQuery] = React.useState('');
  const monthName = React.useMemo(() => {
    const f = new Intl.DateTimeFormat(lang, { month: 'long' });
    return (m) => f.format(new Date(2026, m - 1, 15));
  }, [lang]);
  const rating = minVerdict(xf.verdicts);
  // Country names in the reader's language, in the reader's order (T444);
  // the search finds a country by either name.
  const localCountries = React.useMemo(
    () => availableCountries
      .map(([iso2, name]) => [iso2, countryName(iso2, name), name])
      .sort((a, b) => a[1].localeCompare(b[1], lang)),
    [availableCountries, lang],
  );
  const q = countryQuery.trim().toLowerCase();
  const countries = q
    ? localCountries.filter(([, local, name]) => local.toLowerCase().includes(q) || name.toLowerCase().includes(q))
    : localCountries;

  return (
    <div className="xrail">
      {setTripKinds && (
        <section className="xrail-sec" aria-labelledby="xrail-h-type">
          <h3 className="xrail-h" id="xrail-h-type">{t('filter.tripType')}</h3>
          <TileGroup label={t('filter.tripType')} columns={2} className="xrail-tiles">
            {TRIP_KINDS.map((k) => {
              const Icon = KIND_ICONS[k.key];
              return (
                <Tile key={k.key} icon={Icon ? <Icon size={22} /> : null}
                  selected={tripKinds.includes(k.key)}
                  onClick={() => setTripKinds(toggleIn(tripKinds, k.key))}>
                  {t(`kind.${k.key}`)}
                </Tile>
              );
            })}
          </TileGroup>
        </section>
      )}

      <section className="xrail-sec xrail-pair">
        <Field as="select" label={t('filter.budget')} value={xf.budget ?? ''}
          onChange={(e) => patch({ budget: e.target.value ? Number(e.target.value) : null })}>
          <option value="">{t('explore.budgetAny')}</option>
          {budgetSteps.map((n) => (
            <option key={n} value={n}>{t('explore.budgetUpTo', { eur: formatMoney(n) })}</option>
          ))}
        </Field>
        <Field as="select" label={t('filter.month')} value={xf.month || ''}
          onChange={(e) => patch({ month: e.target.value ? Number(e.target.value) : null })}>
          <option value="">{t('filter.anyMonth')}</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>{monthName(m)}</option>
          ))}
        </Field>
      </section>

      <section className="xrail-sec" aria-labelledby="xrail-h-rating">
        <h3 className="xrail-h" id="xrail-h-rating">{t('sort.rating')}</h3>
        <ChipGroup label={t('sort.rating')} className="xrail-rating">
          <Chip kind="choice" selected={!rating} onClick={() => patch({ verdicts: [] })}>
            {t('filter.ratingAny')}
          </Chip>
          {RATING_STEPS.map((k) => (
            <Chip key={k} kind="choice" selected={rating === k}
              onClick={() => patch({ verdicts: verdictsFrom(k) })}>
              {t(`score.band${k}`)}
            </Chip>
          ))}
        </ChipGroup>
      </section>

      <section className="xrail-sec xrail-switches" aria-labelledby="xrail-h-know">
        <h3 className="xrail-h" id="xrail-h-know">{t('filter.goodToKnow')}</h3>
        <Switch label={t('rail.gems')} checked={gemOnly} onChange={setGemOnly} />
        <Switch label={t('filter.noCar')} checked={xf.nocar} onChange={(v) => patch({ nocar: v })} />
        <Switch label={t('filter.notCrowded')} checked={xf.quiet} onChange={(v) => patch({ quiet: v })} />
        <Switch label={t('filter.nearSea')} checked={xf.sea} onChange={(v) => patch({ sea: v })} />
        <Switch label={t('dest.unesco')} checked={unescoOnly} onChange={setUnescoOnly} />
        <Switch label={t('filter.bestOf')} checked={xf.badged} onChange={(v) => patch({ badged: v })} />
        {setShowFavOnly && (
          <Switch label={t('filter.shortlistOnly')} checked={showFavOnly} onChange={setShowFavOnly} />
        )}
      </section>

      {reachAvailable && (
        <section className="xrail-sec">
          <Field as="select" label={t('filter.reach')} value={reachHours ?? ''}
            onChange={(e) => setReachHours(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t('filter.reachAny')}</option>
            {[2, 3, 4, 5].map((h) => (
              <option key={h} value={h}>{t('filter.reachHours', { n: h })}</option>
            ))}
          </Field>
        </section>
      )}

      <Fold label={t('filter.size')} n={xf.kinds.length}>
        <div className="xrail-chips">
          {KINDS.map((k) => (
            <Chip key={k} selected={xf.kinds.includes(k)}
              icon={<KindGlyph kind={k} size={11} label="" />}
              onClick={() => patch({ kinds: toggleIn(xf.kinds, k) })}>
              {t(`pkind.${k}`)}
            </Chip>
          ))}
        </div>
      </Fold>

      <Fold label={t('filter.role')} n={xf.roles.length}>
        <div className="xrail-chips">
          {ROLE_KEYS.map((r) => (
            <Chip key={r} selected={xf.roles.includes(r)}
              onClick={() => patch({ roles: toggleIn(xf.roles, r) })}>
              {t(`role.short.${r}`)}
            </Chip>
          ))}
        </div>
      </Fold>

      <Fold label={t('sort.country')} n={countryFilter.length}>
        <Field label={t('filter.countrySearch')} hideLabel type="search" value={countryQuery}
          placeholder={t('filter.countrySearch')} onChange={(e) => setCountryQuery(e.target.value)}
          className="xrail-country-find" />
        <ul className="xrail-countries">
          {countries.map(([iso2, name]) => (
            <li key={iso2} className="xrail-country-row">
              <label className="xrail-country">
                <input
                  type="checkbox"
                  checked={countryFilter.includes(iso2)}
                  onChange={() => setCountryFilter(toggleIn(countryFilter, iso2))}
                />
                <CountryFlag country={iso2} size={12} />
                <span>{name}</span>
              </label>
              {onOpenCountry && (
                <IconButton label={t('cpage.open', { country: name })} onClick={() => onOpenCountry(iso2)}
                  className="xrail-country-page">
                  <ChevronRightIcon size={16} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      </Fold>
    </div>
  );
}
