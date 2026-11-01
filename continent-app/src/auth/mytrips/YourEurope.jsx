import React, { useEffect, useId, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, IconButton } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlag, COUNTRY_ISO2 } from '../../components/CountryFlag.jsx';
import {
  PencilIcon, PlusIcon, CameraIcon, MountainIcon, TrainIcon, GlobeIcon, CalendarIcon, StarIcon, ArrowRightIcon,
} from '../../components/Icons.jsx';
import { countryName } from '../../lib/countryName.js';
import { formatMoney } from '../../lib/money.js';
import { activeLocale } from '../../lib/localeState.js';
import { CardMenu } from './parts.jsx';
import { Section, Empty } from './MyTripsTabs.jsx';

/**
 * Europe drawn as a map (T970, owner 2026-11-01: "the cleanest, nicest
 * looking map", replacing T926's tiles). public/europe_map.json is Natural
 * Earth projected equal-area at 52N 10E and already written as SVG paths
 * (pipeline/oneoff/build_europe_map.py): the 43 catalogue countries one path
 * each with a label point and true area, the land around them as one quiet
 * context path, the smallest countries flagged to draw as a dot too.
 */
let europeMapPromise = null;
const loadEuropeMap = () => {
  if (!europeMapPromise) {
    europeMapPromise = fetch('/europe_map.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .catch(() => { europeMapPromise = null; return null; });
  }
  return europeMapPromise;
};
function useEuropeMap() {
  const [geo, setGeo] = useState(null);
  useEffect(() => {
    let live = true;
    loadEuropeMap().then((g) => { if (live) setGeo(g); });
    return () => { live = false; };
  }, []);
  return geo;
}

const NAME_OF = Object.fromEntries(Object.entries(COUNTRY_ISO2).map(([name, iso]) => [iso, name]));
const stateOf = (cc, been, next, saved) => (been.has(cc) ? 'been' : next.has(cc) ? 'next' : saved.has(cc) ? 'saved' : 'none');

/**
 * The map: land you have not been to one flat grey, been in umber, the next
 * trip hatched in umber, a saved country a small umber dot; borders are
 * hairline gaps, no labels. A tap names the country under the map.
 */
export function EuropeMap({ geo, been, next, saved, label, picked, onPick }) {
  const pid = useId().replace(/:/g, '');
  if (!geo) return <div className="mt-eumap is-loading" aria-hidden="true" />;
  const pick = (cc) => (e) => { e.stopPropagation(); onPick?.(cc === picked ? '' : cc); };
  return (
    <svg className="mt-eumap" viewBox={`0 0 ${geo.w} ${geo.h}`} role="img" aria-label={label} onClick={() => onPick?.('')}>
      <defs>
        <pattern id={`${pid}-hatch`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="9" height="9" className="mt-eumap-hatch-bg" />
          <rect width="4" height="9" className="mt-eumap-hatch" />
        </pattern>
      </defs>
      <path className="mt-eumap-context" d={geo.context} />
      {geo.countries.map((c) => {
        const st = stateOf(c.cc, been, next, saved);
        return (
          <path
            key={c.cc}
            className={`mt-eumap-land is-${st}${picked === c.cc ? ' is-picked' : ''}`}
            d={c.d}
            style={st === 'next' ? { fill: `url(#${pid}-hatch)` } : undefined}
            onClick={pick(c.cc)}
          />
        );
      })}
      {geo.countries.filter((c) => c.dot).map((c) => (
        <circle key={`dot-${c.cc}`} className={`mt-eumap-dot is-${stateOf(c.cc, been, next, saved)}${picked === c.cc ? ' is-picked' : ''}`}
          cx={c.x} cy={c.y} r="7" onClick={pick(c.cc)} />
      ))}
      {geo.countries.filter((c) => !c.dot && stateOf(c.cc, been, next, saved) === 'saved').map((c) => (
        <circle key={`saved-${c.cc}`} className="mt-eumap-pin" cx={c.x} cy={c.y} r="11" onClick={pick(c.cc)} />
      ))}
    </svg>
  );
}

/** A share as the reader's locale writes it: one decimal under 10, whole above. */
const shareText = (n) => Number(n).toLocaleString(activeLocale(), { maximumFractionDigits: n < 10 ? 1 : 0 });

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
 * Your Europe (T926), replacing Visited: the count and the share of
 * Europe's land over the map (T970), Mark a country, the year's recap card, the figures the record can back, up to five
 * factual milestones, then the past trips as a journal by year and Add a
 * past trip.
 *
 *   map       { been: Set, next: Set, saved: Set, viaTrip: Set, nextName }
 *   onToggleCountry(iso)   marks or unmarks a country by hand (T972)
 *   figures   { countries, total, nights, trips, avgDay, vsEstimate, cheapestGreat }
 *   journal   [{ year, items: [{ id, title, img, photos, nights, cost, vs, rating, when, needs, onOpen,
 *               onPhotos, onHow, menuActions, onRemove, removeLabel, below }] }]
 */
export function YourEurope({
  map, figures, milestones = [], journal = [], recap = null, onRecap, onMark, markRef, onToggleCountry, onAddPast, pastForm, error,
  fmtMonth,
}) {
  const { t } = useI18n();
  const hasAny = figures.countries > 0 || journal.length > 0;
  const geo = useEuropeMap();
  const [picked, setPicked] = useState('');
  // The share of the catalogue's land: honest because the map's areas are
  // equal-area (km2 per country from the build script).
  const share = useMemo(() => {
    if (!geo) return 0;
    let all = 0;
    let mine = 0;
    for (const c of geo.countries) {
      all += c.km2;
      if (map.been.has(c.cc)) mine += c.km2;
    }
    return all > 0 ? (mine / all) * 100 : 0;
  }, [geo, map.been]);
  const pickedState = picked ? stateOf(picked, map.been, map.next, map.saved) : '';
  return (
    <div className="mt-europe">
      <div className="mt-europe-map">
        <div className="mt-atlas">
          <p className="mt-atlas-head">
            <b className="mt-atlas-n">{map.been.size}</b>
            <span className="mt-atlas-of">
              {t('mt.ofEurope', { n: figures.total })}
              {share > 0 && <span className="mt-atlas-share">{t('mt.landShare', { n: shareText(share) })}</span>}
            </span>
            <IconButton ref={markRef} className="mt-atlas-mark" label={t('mt.markCountry')} onClick={onMark}>
              <PencilIcon size={18} />
            </IconButton>
          </p>
          <div className="mt-atlas-frame">
            <EuropeMap
              geo={geo}
              been={map.been}
              next={map.next}
              saved={map.saved}
              label={t('mt.mapLabel', { n: map.been.size })}
              picked={picked}
              onPick={setPicked}
            />
            <p className="mt-atlas-pick" aria-live="polite">
              {picked && (
                <span className="mt-atlas-pill">
                  <CountryFlag country={NAME_OF[picked] || picked} size={14} />
                  <b>{countryName(picked, NAME_OF[picked] || picked)}</b>
                  {/* T972: a tap marks a country by hand, as the sheet does;
                      one a finished trip put on the record stays fixed. */}
                  {onToggleCountry && !map.viaTrip?.has(picked) ? (
                    <button type="button" className={`mt-atlas-toggle${pickedState === 'been' ? ' is-on' : ''}`} onClick={() => onToggleCountry(picked)}>
                      {pickedState === 'been' ? t('mt.unmarkCountry') : t('mt.markBeen')}
                    </button>
                  ) : (
                    <span className={`is-${pickedState}`}>{t(`mt.state.${pickedState}`)}</span>
                  )}
                </span>
              )}
            </p>
          </div>
          <div className="mt-atlas-legend">
            <span><i className="is-been" aria-hidden="true" />{t('mt.legendBeen', { n: map.been.size })}</span>
            {map.next.size > 0 && <span><i className="is-next" aria-hidden="true" />{t('mt.legendNext', { name: map.nextName })}</span>}
            {map.saved.size > 0 && <span><i className="is-saved" aria-hidden="true" />{t('mt.legendSaved', { n: map.saved.size })}</span>}
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
