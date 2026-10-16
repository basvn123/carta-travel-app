import React, { Suspense, lazy, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Card, Chip, ChipGroup, IconButton, Segmented } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlag, COUNTRY_ISO2 } from '../../components/CountryFlag.jsx';
import { LoadingBlock, ErrorBlock } from '../../components/StateBlocks.jsx';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { DayPrice, SaveButton } from '../../browse/ExploreCards.jsx';
import { ExpandIcon, ShrinkIcon, PlusIcon, RouteIcon, PencilIcon } from '../../components/Icons.jsx';
import { FAV_KIND_LABEL } from '../../lib/favorites.js';
import { countryName } from '../../lib/countryName.js';
import { TripHeroCard, TripRow } from './TripCards.jsx';
import { RecordMapDialog } from './parts.jsx';

const FULL_PAD = { top: 84, left: 28, right: 28, bottom: 56 };
const TripMap = lazy(() => import('../../map/TripMap.jsx').then((m) => ({ default: m.TripMap })));

/** A section of one tab: a heading with an optional count and action. */
export function Section({ title, count, action, children, id }) {
  return (
    <section className="mt-section" aria-labelledby={id}>
      <div className="mt-section-head">
        <h3 className="mt-section-title" id={id}>{title}</h3>
        {count > 0 && <Chip kind="count">{count}</Chip>}
        {action && <span className="mt-section-action">{action}</span>}
      </div>
      {children}
    </section>
  );
}

/** An empty tab: the space named, one way forward, no apology. */
export function Empty({ title, action, secondary }) {
  return (
    <div className="mt-empty">
      <p className="mt-empty-title">{title}</p>
      {(action || secondary) && <div className="mt-empty-actions">{action}{secondary}</div>}
    </div>
  );
}

/* ───────────────────────── Trips ───────────────────────── */

/**
 * Trips: the next one as the focal card, every later one and every draft as a
 * row, day plans that belong to no trip under their own heading (only when
 * there are some), and friends' shared trips as one line.
 */
export function TripsTab({
  authed, configured, loading, error, onRetry, next, later, dayPlans,
  friendsShared, onOpenFriends, onPlanTrip, onSignIn, todayIso,
}) {
  const { t } = useI18n();
  const nothing = !next && !later.length && !dayPlans.length;
  return (
    <>
      {loading && authed ? (
        <LoadingBlock label={t('saved.loading')} rows={2} shape="card" />
      ) : error ? (
        <ErrorBlock message={t('state.savedFailed')} onRetry={onRetry} retryLabel={t('layer.retry')} />
      ) : nothing ? (
        <Empty
          title={t('saved.noTripsYet')}
          action={<Button variant="primary" onClick={onPlanTrip}>{t('saved.planTrip')}</Button>}
          secondary={!authed && configured ? <Button onClick={onSignIn}>{t('saved.signIn')}</Button> : null}
        />
      ) : (
        <>
          {next && (
            <div className="mt-next">
              <TripHeroCard {...next} todayIso={todayIso} />
              {next.below}
            </div>
          )}
          {later.length > 0 && (
            <Section id="mt-later" title={t(next ? 'saved.laterTrips' : 'saved.yourTrips')} count={later.length}>
              <div className="mt-rows">
                {later.map((r) => <TripRow key={r.id} {...r}>{r.below}</TripRow>)}
              </div>
            </Section>
          )}
          {dayPlans.length > 0 && (
            <Section id="mt-days" title={t('saved.dayPlans')} count={dayPlans.length}>
              <div className="mt-rows">
                {dayPlans.map((r) => <TripRow key={r.id} {...r} />)}
              </div>
            </Section>
          )}
          {!authed && configured && (
            <p className="mt-signin-line">
              <Button variant="quiet" size="sm" onClick={onSignIn}>{t('saved.signIn')}</Button>
            </p>
          )}
        </>
      )}
      {friendsShared > 0 && onOpenFriends && (
        <div className="mt-friends-line">
          <span>{t(friendsShared === 1 ? 'saved.friendsShared1' : 'saved.friendsSharedN', { n: friendsShared })}</span>
          <Button variant="quiet" size="sm" onClick={onOpenFriends}>{t('saved.friendsOpen')}</Button>
        </div>
      )}
    </>
  );
}

/* ───────────────────────── Shortlist ───────────────────────── */

/**
 * Everything starred anywhere, as one list of compact rows, priced as Explore
 * prices them and saved with Explore's bookmark. The kind and the order are
 * filters, drawn in the side panel on desktop and above the list on a phone.
 */
export function ShortlistTab({ rows, showKind = true, costs, onOpen, onRemove, onPlanTrip, planCountryName, onBrowse, loading }) {
  const { t } = useI18n();
  if (!rows.length && !loading) {
    return (
      <Empty
        title={t('saved.shortlistEmpty')}
        action={<Button onClick={onBrowse}>{t('saved.browseDestinations')}</Button>}
      />
    );
  }
  return (
    <>
      {onPlanTrip && planCountryName && (
        <div className="mt-plan-these">
          <Button variant="primary" iconStart={<RouteIcon size={18} />} onClick={onPlanTrip}>
            {t('saved.planWithShortlist', { country: planCountryName })}
          </Button>
        </div>
      )}
      <div className="mt-rows">
        {rows.map((row) => (
          <Card
            key={row.key}
            layout="row"
            as="div"
            className={`mt-row${row.missing ? ' is-missing' : ''}`}
            media={<HeroImage url={row.img} city={row.name || row.id} iso2={row.cc} className="mt-row-img" maxWidth={330} ratio={[1, 1]} sizes="72px" />}
            title={row.missing ? t('fav.missing') : (row.name || '…')}
            onOpen={row.missing ? undefined : () => onOpen(row)}
            meta={!row.missing && (
              <span className="mt-row-meta">
                {row.cc && <CountryFlag country={row.cc} size={14} />}
                <span>{[row.sub, showKind && FAV_KIND_LABEL[row.kind] ? t(FAV_KIND_LABEL[row.kind]) : ''].filter(Boolean).join(', ')}</span>
              </span>
            )}
            price={row.kind === 'dest' && costs?.get(row.id) ? <DayPrice cost={costs.get(row.id)} t={t} /> : null}
            actions={<SaveButton fav onToggle={() => onRemove(row)} t={t} name={row.name} />}
          />
        ))}
      </div>
    </>
  );
}

/** The shortlist's two filters, as the side panel or the phone's refine row. */
export function ShortlistFilters({ kinds, kind, onKind, sort, onSort, compact = false }) {
  const { t } = useI18n();
  if (kinds.length < 2 && !compact) {
    return (
      <div className="mt-filter">
        <span className="mt-filter-label">{t('saved.sortLabel')}</span>
        <Segmented label={t('saved.sortLabel')} size="sm" value={sort} onChange={onSort}
          options={[{ value: 'recent', label: t('saved.sortRecent') }, { value: 'cheap', label: t('saved.sortCheap') }]} />
      </div>
    );
  }
  return (
    <div className={`mt-filters${compact ? ' is-compact' : ''}`}>
      {kinds.length > 1 && (
        <div className="mt-filter">
          {!compact && <span className="mt-filter-label">{t('saved.kindLabel')}</span>}
          <ChipGroup label={t('saved.kindLabel')} className="mt-chips">
            {['all', ...kinds].map((k) => (
              <Chip key={k} kind="choice" selected={kind === k} onClick={() => onKind(k)}>
                {k === 'all' ? t('saved.kindAll') : t(FAV_KIND_LABEL[k])}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      )}
      <div className="mt-filter">
        {!compact && <span className="mt-filter-label">{t('saved.sortLabel')}</span>}
        <Segmented label={t('saved.sortLabel')} size="sm" value={sort} onChange={onSort}
          options={[{ value: 'recent', label: t('saved.sortRecent') }, { value: 'cheap', label: t('saved.sortCheap') }]} />
      </div>
    </div>
  );
}

/* ───────────────────────── Visited ───────────────────────── */

/** The year filter, as the side panel or the phone's refine row. */
export function YearFilter({ years, year, onYear, compact = false }) {
  const { t } = useI18n();
  if (years.length < 2) return null;
  return (
    <div className="mt-filter">
      {!compact && <span className="mt-filter-label">{t('saved.yearLabel')}</span>}
      <ChipGroup label={t('saved.yearLabel')} className="mt-chips">
        {['all', ...years].map((y) => (
          <Chip key={y} kind="choice" selected={year === y} onClick={() => onYear(y)}>
            {y === 'all' ? t('saved.yearAll') : String(y)}
          </Chip>
        ))}
      </ChipGroup>
    </div>
  );
}

/**
 * Every country in the catalogue as a chip; the ones a finished trip already
 * put on the record are ticked and fixed, the rest toggle the hand-marked list
 * (Polarsteps' scratch map). Changes save as they are made.
 */
export function VisitedCountriesSheet({ fromTrips, manual, onToggle, onClose }) {
  const { t } = useI18n();
  const all = useMemo(() => Object.keys(COUNTRY_ISO2)
    .map((c) => ({ c, label: countryName(COUNTRY_ISO2[c], c) }))
    .sort((a, b) => a.label.localeCompare(b.label)), []);
  return (
    <SheetShell title={t('saved.countriesSheetTitle')} onClose={onClose} labelId="mt-countries-title" width={560}>
      <div className="mt-country-grid" role="group" aria-labelledby="mt-countries-title">
        {all.map(({ c, label }) => {
          const viaTrip = fromTrips.has(c);
          const on = viaTrip || manual.includes(c);
          return (
            <Chip
              key={c}
              kind="filter"
              selected={on}
              disabled={viaTrip}
              icon={<CountryFlag country={c} size={14} />}
              onClick={() => onToggle(c)}
              aria-describedby={viaTrip ? 'mt-via-trip' : undefined}
            >
              {label}
            </Chip>
          );
        })}
      </div>
      <p className="mt-sheet-note" id="mt-via-trip">{t('saved.countryViaTrip')}</p>
      <div className="mt-sheet-foot">
        <Button variant="primary" onClick={onClose}>{t('saved.done')}</Button>
      </div>
    </SheetShell>
  );
}

/**
 * Visited: the map of the record first (a third of the phone screen), the
 * figures it adds up to as one fact band, the countries as flags with their
 * own edit, then the trips by year.
 */
export function VisitedTab({
  record, mapProps, hasMap, mapFull, onMapFull, groups, onAddPast, pastForm, error,
  onEditCountries, countriesRef,
}) {
  const { t } = useI18n();
  const hasAny = record.countries.length > 0 || groups.length > 0;
  return (
    <>
      {hasMap && (
        <div className="mt-map">
          {!mapFull && (
            <Suspense fallback={<div className="mt-map-wait" aria-hidden="true" />}>
              <TripMap {...mapProps} />
            </Suspense>
          )}
          {/* On a touch screen the map in the page stays still until it is
              opened full size (carta-design "3D terrain map", maps never ask
              for Ctrl): a tap anywhere on it opens it. */}
          <div className="mt-map-shield" aria-hidden="true" onClick={() => onMapFull(true)} />
          <IconButton tone="surface" className="mt-map-expand" label={t('saved.mapExpand')} onClick={() => onMapFull(true)}>
            <ExpandIcon size={18} />
          </IconButton>
        </div>
      )}
      {hasMap && mapFull && createPortal(
        <RecordMapDialog title={t('saved.mapFullTitle')} onClose={() => onMapFull(false)}>
          <div className="savedmap-full-map">
            <Suspense fallback={<div className="mt-map-wait" aria-hidden="true" />}>
              <TripMap {...mapProps} fitMaxZoom={9} fitPadding={FULL_PAD} />
            </Suspense>
          </div>
          <div className="savedmap-full-bar">
            <span className="savedmap-full-title">{t('saved.mapFullTitle')}</span>
            <Button size="sm" iconStart={<ShrinkIcon size={16} />} onClick={() => onMapFull(false)}>{t('saved.mapShrink')}</Button>
          </div>
        </RecordMapDialog>,
        document.body,
      )}

      {hasAny && (
        <dl className="mt-band" aria-label={t('saved.recordFacts')}>
          <div className="mt-band-cell"><dt>{t('saved.factCountries')}</dt><dd>{record.countries.length}</dd></div>
          <div className="mt-band-cell"><dt>{t('saved.factCities')}</dt><dd>{record.cities.length}</dd></div>
          <div className="mt-band-cell"><dt>{t('saved.factTrips')}</dt><dd>{record.trips}</dd></div>
          <div className="mt-band-cell"><dt>{t('saved.factNights')}</dt><dd>{record.nights}</dd></div>
        </dl>
      )}

      <Section
        id="mt-countries"
        title={t('saved.countriesTitle')}
        action={(
          <Button ref={countriesRef} size="sm" variant="quiet" iconStart={record.countries.length ? <PencilIcon size={16} /> : <PlusIcon size={16} />} onClick={onEditCountries}>
            {t(record.countries.length ? 'saved.editCountries' : 'saved.addCountries')}
          </Button>
        )}
      >
        {record.countries.length > 0 && (
          <ul className="mt-flags">
            {record.countries.map((c) => (
              <li key={c} className="mt-flag"><CountryFlag country={c} size={16} /><span>{countryName(COUNTRY_ISO2[c], c)}</span></li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="mt-record"
        title={t('saved.travelRecord')}
        action={!pastForm && (
          <Button size="sm" variant="quiet" iconStart={<PlusIcon size={16} />} onClick={onAddPast}>{t('saved.addPastTrip')}</Button>
        )}
      >
        {pastForm}
        {error ? (
          <p className="mt-error" role="alert">{error}</p>
        ) : groups.length === 0 && !pastForm ? (
          <Empty title={t('saved.pastEmptyShort')} />
        ) : (
          groups.map((g) => (
            <div className="mt-year" key={g.year}>
              <h4 className="mt-year-title">{g.year}</h4>
              <div className="mt-rows">
                {g.rows.map((r) => <TripRow key={r.id} {...r}>{r.below}</TripRow>)}
              </div>
            </div>
          ))
        )}
      </Section>
    </>
  );
}
