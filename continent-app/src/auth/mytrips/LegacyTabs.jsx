import React, { Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Card, ChipGroup, Chip, IconButton, Segmented } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlag, COUNTRY_ISO2 } from '../../components/CountryFlag.jsx';
import { DayPrice, SaveButton } from '../../browse/ExploreCards.jsx';
import { ExpandIcon, ShrinkIcon, PlusIcon, RouteIcon, PencilIcon } from '../../components/Icons.jsx';
import { FAV_KIND_LABEL } from '../../lib/favorites.js';
import { countryName } from '../../lib/countryName.js';
import { TripRow } from './TripCards.jsx';
import { RecordMapDialog } from './parts.jsx';
import { Section, Empty } from './MyTripsTabs.jsx';

/* The Shortlist and Visited tabs as they were before T923, kept here until
   Saved (T925) and Your Europe (T926) replace them. */

const FULL_PAD = { top: 84, left: 28, right: 28, bottom: 56 };
const TripMap = lazy(() => import('../../map/TripMap.jsx').then((m) => ({ default: m.TripMap })));

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
 * Visited: the map of the record first (a third of the phone screen), the
 * figures it adds up to as one fact band that carries the countries and their
 * edit (T503, T467-b), then the trips by year.
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

      {/* T467: the countries lead, large, with their flags (the hero figure
          the travel-stats apps open on); cities, trips and nights follow as
          the supporting three. No denominator: a share of Carta's catalogue
          would be a catalogue count. T503 (owner T467-b): the countries
          section is folded in here, its Edit or Add sits in the hero cell and
          the names are read out from a list, so there is one list of
          countries, not two. With nothing on the record the band is only
          that cell and its Add: an invitation, not a row of zeros. */}
      <dl className={`mt-band${hasAny ? '' : ' is-empty'}`} aria-label={t('saved.recordFacts')}>
        <div className="mt-band-cell mt-band-hero">
          <dt>{t('saved.factCountries')}</dt>
          <dd>
            {record.countries.length > 0 && (
              <>
                <span className="mt-band-fig">{record.countries.length}</span>
                <span
                  className="mt-band-flags"
                  aria-hidden="true"
                  data-more={record.countries.length > 8 ? `+${record.countries.length - 8}` : undefined}
                >
                  {record.countries.slice(0, 8).map((c) => <CountryFlag key={c} country={c} size={18} />)}
                </span>
                <ul className="sr-only mt-flags">
                  {record.countries.map((c) => <li key={c} className="mt-flag">{countryName(COUNTRY_ISO2[c], c)}</li>)}
                </ul>
              </>
            )}
            <Button
              ref={countriesRef}
              size="sm"
              variant="quiet"
              className="mt-band-edit"
              iconStart={record.countries.length ? <PencilIcon size={16} /> : <PlusIcon size={16} />}
              onClick={onEditCountries}
              aria-label={record.countries.length ? t('saved.editCountriesLabel') : undefined}
            >
              {t(record.countries.length ? 'saved.editCountries' : 'saved.addCountries')}
            </Button>
          </dd>
        </div>
        {hasAny && (
          <>
            <div className="mt-band-cell"><dt>{t('saved.factCities')}</dt><dd>{record.cities.length}</dd></div>
            <div className="mt-band-cell"><dt>{t('saved.factTrips')}</dt><dd>{record.trips}</dd></div>
            <div className="mt-band-cell"><dt>{t('saved.factNights')}</dt><dd>{record.nights}</dd></div>
          </>
        )}
      </dl>

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
