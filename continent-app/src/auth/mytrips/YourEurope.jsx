import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { COUNTRY_ISO2 } from '../../components/CountryFlag.jsx';
import {
  PencilIcon, PlusIcon, CameraIcon, MountainIcon, TrainIcon, GlobeIcon, CalendarIcon, StarIcon, ArrowRightIcon,
} from '../../components/Icons.jsx';
import { countryName } from '../../lib/countryName.js';
import { formatMoney } from '../../lib/money.js';
import { activeLocale } from '../../lib/localeState.js';
import { CardMenu } from './parts.jsx';
import { Section, Empty } from './MyTripsTabs.jsx';

/**
 * Europe as tiles (T926): one rounded square per country, its ISO code,
 * laid out roughly where it lies (column, row). Every country in
 * COUNTRY_ISO2 has a tile.
 */
const EUROPE_TILES = {
  IS: [0, 0], FO: [2, 0], NO: [5, 0], SE: [6, 0], FI: [7, 0],
  IE: [1, 1], GB: [2, 1], DK: [5, 1], EE: [7, 1],
  NL: [4, 2], DE: [5, 2], PL: [6, 2], LV: [7, 2],
  BE: [3, 3], LU: [4, 3], CZ: [5, 3], SK: [6, 3], LT: [7, 3],
  FR: [3, 4], CH: [4, 4], LI: [5, 4], AT: [6, 4], HU: [7, 4], RO: [8, 4], MD: [9, 4],
  PT: [1, 5], ES: [2, 5], AD: [3, 5], MC: [4, 5], IT: [5, 5], SI: [6, 5], HR: [7, 5], RS: [8, 5], BG: [9, 5],
  SM: [5, 6], BA: [7, 6], ME: [8, 6], XK: [9, 6],
  MT: [5, 7], AL: [8, 7], MK: [9, 7],
  GR: [9, 8], CY: [10, 8],
};
const COLS = 11;
const ROWS = 9;
const NAME_OF = Object.fromEntries(Object.entries(COUNTRY_ISO2).map(([name, iso]) => [iso, name]));

/** The tile map: been filled, the next trip outlined, saved countries dashed. */
export function EuropeTiles({ been, next, saved, label }) {
  const s = 44;
  const g = 6;
  return (
    <svg className="mt-tiles-map" viewBox={`0 0 ${COLS * (s + g)} ${ROWS * (s + g)}`} role="img" aria-label={label}>
      {Object.entries(EUROPE_TILES).map(([cc, [x, y]]) => {
        const state = been.has(cc) ? 'been' : next.has(cc) ? 'next' : saved.has(cc) ? 'saved' : 'none';
        return (
          <g key={cc} className={`mt-tile is-${state}`}>
            <title>{countryName(cc, NAME_OF[cc] || cc)}</title>
            <rect x={x * (s + g) + 1} y={y * (s + g) + 1} width={s - 2} height={s - 2} rx="10" />
            <text x={x * (s + g) + s / 2} y={y * (s + g) + s / 2 + 7} textAnchor="middle">{cc}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** A Score as the reader's locale writes it, one decimal. */
const scoreText = (n) => Number(n).toLocaleString(activeLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const MILESTONE_ICON = { region: GlobeIcon, next: ArrowRightIcon, nightTrain: TrainIcon, longest: CalendarIcon, north: MountainIcon };

/** One milestone as a sentence, from lib/myTrips.europeMilestones(). */
function milestoneText(t, m, fmtMonth) {
  if (m.key === 'region') return { title: t('mt.msRegion', { region: t(`mt.region.${m.region}`) }), sub: t('mt.msOfAll', { n: m.n }) };
  if (m.key === 'next') {
    return {
      title: t('mt.msNext', { region: t(`mt.region.${m.region}`) }),
      sub: t('mt.msNextSub', { countries: m.cc.map((c) => countryName(c, NAME_OF[c] || c)).join(', ') }),
    };
  }
  if (m.key === 'nightTrain') return { title: t('mt.msNightTrain'), sub: '' };
  if (m.key === 'longest') return { title: t('mt.msLongest', { n: m.n }), sub: [m.title, m.when ? fmtMonth(m.when) : ''].filter(Boolean).join(', ') };
  return { title: t('mt.msNorth', { city: m.city }), sub: t('mt.msNorthSub', { lat: Math.round(m.lat * 10) / 10 }) };
}

/**
 * Your Europe (T926), replacing Visited: the tile map with Mark a country,
 * the year's recap card, the figures the record can back, up to five
 * factual milestones, then the past trips as a journal by year and Add a
 * past trip.
 *
 *   map       { been: Set, next: Set, saved: Set, nextName }
 *   figures   { countries, total, nights, trips, avgDay, vsEstimate, cheapestGreat }
 *   journal   [{ year, items: [{ id, title, img, photos, nights, cost, vs, rating, when, needs, onOpen,
 *               onPhotos, onHow, menuActions, onRemove, removeLabel, below }] }]
 */
export function YourEurope({
  map, figures, milestones = [], journal = [], recap = null, onRecap, onMark, markRef, onAddPast, pastForm, error,
  fmtMonth,
}) {
  const { t } = useI18n();
  const hasAny = figures.countries > 0 || journal.length > 0;
  return (
    <div className="mt-europe">
      <div className="mt-europe-map">
        <div className="mt-tilemap">
          <EuropeTiles
            been={map.been}
            next={map.next}
            saved={map.saved}
            label={t('mt.tileMapLabel', { n: map.been.size })}
          />
          <div className="mt-tile-legend">
            <span><i className="is-been" aria-hidden="true" />{t('mt.legendBeen', { n: map.been.size })}</span>
            {map.next.size > 0 && <span><i className="is-next" aria-hidden="true" />{t('mt.legendNext', { name: map.nextName })}</span>}
            {map.saved.size > 0 && <span><i className="is-saved" aria-hidden="true" />{t('mt.legendSaved', { n: map.saved.size })}</span>}
            <Button ref={markRef} variant="quiet" size="sm" iconStart={<PencilIcon size={14} />} onClick={onMark}>{t('mt.markCountry')}</Button>
          </div>
        </div>
        {recap && (
          <Button className="mt-recap-card" onClick={onRecap}>
            {recap.img && <HeroImage url={recap.img} city={String(recap.year)} className="mt-recap-img" maxWidth={640} ratio={[16, 9]} sizes="(min-width: 1024px) 480px, 100vw" />}
            <span className="mt-recap-text">
              <span className="mt-recap-k">{t('mt.yearIn', { year: recap.year })}</span>
              <span className="mt-recap-t">{recap.line}</span>
              <span className="mt-recap-s">{t('mt.recapOpen')}</span>
            </span>
          </Button>
        )}
      </div>

      <div className="mt-europe-side">
        {hasAny && (
          <dl className="mt-figs" aria-label={t('saved.recordFacts')}>
            <div className="mt-fig">
              <dt>{t('saved.factCountries')}</dt>
              <dd><b>{figures.countries}</b>{figures.total > 0 && <span className="mt-fig-of">{t('mt.ofTotal', { n: figures.total })}</span>}</dd>
              {map.nextName && map.next.size > 0 && <dd className="mt-fig-sub">{t('mt.nextIn', { name: map.nextName })}</dd>}
            </div>
            <div className="mt-fig">
              <dt>{t('saved.factNights')}</dt>
              <dd><b>{figures.nights}</b></dd>
              <dd className="mt-fig-sub">{t(figures.trips === 1 ? 'mt.trips1' : 'mt.tripsN', { n: figures.trips })}</dd>
            </div>
            {Number.isFinite(figures.avgDay) && (
              <div className="mt-fig">
                <dt>{t('mt.figDay')}</dt>
                <dd><b>{formatMoney(figures.avgDay)}</b></dd>
                {Number.isFinite(figures.vsEstimate) && Math.round(figures.vsEstimate) !== 0 && (
                  <dd className="mt-fig-sub">{t(figures.vsEstimate < 0 ? 'mt.underEstimate' : 'mt.overEstimate', { price: formatMoney(Math.abs(figures.vsEstimate)) })}</dd>
                )}
                {Number.isFinite(figures.vsEstimate) && Math.round(figures.vsEstimate) === 0 && (
                  <dd className="mt-fig-sub">{t('mt.onEstimate')}</dd>
                )}
              </div>
            )}
            {figures.cheapestGreat && (
              <div className="mt-fig">
                <dt>{t('mt.figGreat')}</dt>
                <dd><b>{formatMoney(figures.cheapestGreat.eur)}</b></dd>
                <dd className="mt-fig-sub">
                  {[figures.cheapestGreat.title, t('mt.scorePlace', { n: scoreText(figures.cheapestGreat.score) }), figures.cheapestGreat.when ? fmtMonth(figures.cheapestGreat.when) : '']
                    .filter(Boolean).join(', ')}
                </dd>
              </div>
            )}
          </dl>
        )}

        {milestones.length > 0 && (
          <Section id="mt-miles" title={t('mt.milestones')}>
            <ul className="mt-miles">
              {milestones.map((m) => {
                const Icon = MILESTONE_ICON[m.key] || GlobeIcon;
                const txt = milestoneText(t, m, fmtMonth);
                return (
                  <li key={`${m.key}-${m.region || m.n || m.city || ''}`} className={`mt-mile${m.key === 'next' ? ' is-next' : ''}`}>
                    <span className="mt-mile-icon" aria-hidden="true"><Icon size={20} /></span>
                    <span className="mt-mile-text"><b>{txt.title}</b>{txt.sub && <small>{txt.sub}</small>}</span>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        <Section
          id="mt-journal"
          title={t('saved.travelRecord')}
          action={!pastForm && (
            <Button size="sm" variant="quiet" iconStart={<PlusIcon size={16} />} onClick={onAddPast}>{t('saved.addPastTrip')}</Button>
          )}
        >
          {pastForm}
          {error ? (
            <p className="mt-error" role="alert">{error}</p>
          ) : journal.length === 0 && !pastForm ? (
            <Empty
              title={t('saved.pastEmptyShort')}
              line={t('mt.journalEmptyLine')}
              action={<Button variant="primary" iconStart={<PlusIcon size={18} />} onClick={onAddPast}>{t('saved.addPastTrip')}</Button>}
            />
          ) : (
            journal.map((g) => (
              <div className="mt-year" key={g.year}>
                <h4 className="mt-year-title">{g.year}</h4>
                <div className="mt-journal">
                  {g.items.map((x) => (
                    <div className="mt-jwrap" key={x.id}>
                      <article className="mt-jcard">
                        <div className="mt-jcard-media" onClick={x.onOpen} aria-hidden="true">
                          <HeroImage url={x.img} city={x.title} iso2={x.iso2} className="mt-jcard-img" maxWidth={640} ratio={[4, 3]} sizes="(min-width: 1024px) 280px, 50vw" />
                          {x.photos > 0 && (
                            <span className="mt-photo-pill is-small"><CameraIcon size={14} />{x.photos}</span>
                          )}
                        </div>
                        <div className="mt-jcard-body">
                          <div className="mt-jcard-top">
                            <Button variant="quiet" className="mt-jcard-title" onClick={x.onOpen}>{x.title}</Button>
                            <CardMenu actions={x.menuActions} onRemove={x.onRemove} removeLabel={x.removeLabel} />
                          </div>
                          <span className="mt-jcard-meta">{x.meta}</span>
                          {x.cost && <span className="mt-jcard-meta is-cost">{x.cost}</span>}
                          {x.rating != null && (
                            <span className="mt-jcard-rate"><StarIcon size={14} />{t('saved.pastRatedN', { n: x.rating })}</span>
                          )}
                          {(x.onPhotos || x.onHow) && (
                            <span className="mt-jcard-acts">
                              {x.onPhotos && <Button size="sm" iconStart={<CameraIcon size={14} />} onClick={x.onPhotos}>{t('mt.addPhotos')}</Button>}
                              {x.onHow && <Button size="sm" onClick={x.onHow}>{t('mt.howWasIt')}</Button>}
                            </span>
                          )}
                        </div>
                      </article>
                      {x.below}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </Section>
      </div>
    </div>
  );
}
