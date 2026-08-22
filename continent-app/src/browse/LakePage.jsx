import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import {
  lakeHeadline, lakeWhy, lakeTags, lakeSwim, lakeSeason, lakeHazards,
  bestForLabel, componentLabel, serviceLabel, accessLabel, monthWord,
  COMPONENT_ORDER, SUB_ORDER, lakeRating, isHiddenGem,
} from '../lib/lakeStory.js';
import { lakeShareUrl } from '../lib/lakes.js';
import { trailheadDirectionsUrl, shareTrailLink } from '../lib/trailExport.js';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import {
  ArrowLeftIcon, ShareIcon, MapPinIcon, LinkIcon, ChevronRightIcon,
  CameraIcon, BootIcon, AlertIcon,
} from '../components/Icons.jsx';

/**
 * The lake page: one published water body, and the argument for going there.
 *
 * It answers five things, and the first one is not the score.
 *
 *   can I swim here    the verdict, in its own banner, at the top, coloured,
 *                      with the evidence that produced it named. Everything
 *                      else on this page is a recommendation; this is the one
 *                      field that can hurt somebody, so it is the one thing
 *                      that cannot be scrolled past. A lake where swimming is
 *                      forbidden says so above its own photograph.
 *   where is it        a pin, the region, the country, the coordinates, and
 *                      one link that opens the spot in a maps app.
 *   what does it look  up to five photographs, each credited to the person
 *   like               who took it and the licence they released it under.
 *   why this one       the composed explanation, every sentence of it mapped
 *                      to a field in the data (lib/lakeStory.js), then the
 *                      hazards in their own block underneath.
 *   is the number      three sub scores on their own, then the six weighted
 *   honest             components, so the ranking can be checked rather than
 *                      believed.
 *
 * No maplibre here on purpose, the same call the beach page makes: the page is
 * opened from a list and read on a phone, and a 200 KB map library to draw one
 * pin would be the heaviest thing on it.
 *
 * The month strip is an ESTIMATE and says so in its own subtitle. There is no
 * free per lake water temperature series for Europe, so the pipeline models it
 * from WorldClim air normals with a documented correction. Presenting that as
 * a measurement would be the dishonest half of a useful feature.
 */

const fmtCoord = (n) => (Number.isFinite(n) ? n.toFixed(4) : '');
const MONTH_CODES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug',
  'sep', 'oct', 'nov', 'dec'];

/** A photograph's credit line, in the TASL order Commons expects. Everything
 *  the file did not carry is dropped rather than filled with "unknown". */
function ImageCredit({ image, t }) {
  if (!image || (!image.by && !image.lic)) return null;
  const by = String(image.by || '').trim();
  const lic = String(image.lic || '').trim();
  return (
    <p className="bpage-credit">
      <CameraIcon size={12} />
      {/* One flex item, not three. .bpage-credit is a flex row with a gap, so
          an author, a bare ", " and a licence as separate children come out as
          "Sharon Hahn Darlin , CC BY 2.0" with the gap on both sides of the
          comma. A licence notice is the last thing that should look careless,
          so the whole line is one item and lays out inline inside it. */}
      <span className="lpage-credit-line">
        {by && (
          <a href={image.page} target="_blank" rel="noopener noreferrer">{by}</a>
        )}
        {by && lic ? ', ' : ''}
        {lic && (image.licUrl
          ? <a href={image.licUrl} target="_blank" rel="noopener noreferrer">{lic}</a>
          : <span>{lic}</span>)}
        {!by && (
          <a href={image.page} target="_blank" rel="noopener noreferrer">
            {t('lake.photos')}
          </a>
        )}
      </span>
    </p>
  );
}

/** The estimated surface temperature month by month, as a bar strip. The
 *  warm months are filled; the rest are outlines, so a lake with a fortnight
 *  of summer looks like one. */
function SeasonStrip({ temps, warmC, t }) {
  const max = Math.max(...temps, warmC + 4);
  return (
    <ul className="lpage-months" aria-label={t('lake.seasonHead')}>
      {temps.map((c, i) => (
        <li key={MONTH_CODES[i]} className={c >= warmC ? 'warm' : ''}>
          <span className="lpage-month-bar" aria-hidden="true">
            <span style={{ height: `${Math.max(4, Math.round((c / max) * 100))}%` }} />
          </span>
          <span className="lpage-month-c">{Math.round(c)}</span>
          <span className="lpage-month-m">{monthWord(MONTH_CODES[i], t).slice(0, 1)}</span>
        </li>
      ))}
    </ul>
  );
}

export function LakePage({ lake, countryName, onClose, onSelectDest, warmC = 18 }) {
  const { t, lang } = useI18n();
  const [shot, setShot] = useState(0);
  const [toast, setToast] = useState(null);
  const scrollEl = useRef(null);
  const titleEl = useRef(null);
  const [titleGone, setTitleGone] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => { setShot(0); scrollEl.current?.scrollTo?.(0, 0); }, [lake?.id]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  // The bar takes over the name only once the heading has scrolled away, so
  // the two never sit on screen saying the same thing.
  useEffect(() => {
    const el = titleEl.current;
    const root = scrollEl.current;
    if (!el || !root) return undefined;
    const io = new IntersectionObserver(([entry]) => setTitleGone(!entry.isIntersecting),
      { root, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [lake?.id]);

  const images = lake?.images || [];
  const main = images[shot] || images[0] || null;
  const why = useMemo(() => (lake ? lakeWhy(lake, t) : []), [lake, t]);
  const tags = useMemo(() => (lake ? lakeTags(lake, t, 4) : []), [lake, t]);
  const rating = useMemo(() => (lake ? lakeRating(lake, t) : null), [lake, t]);
  const swim = useMemo(() => (lake ? lakeSwim(lake, t) : null), [lake, t]);
  const hazards = useMemo(() => (lake ? lakeHazards(lake, t) : []), [lake, t]);
  const headline = useMemo(
    () => (lake ? lakeHeadline(lake, t, countryName) : ''),
    [lake, t, countryName],
  );

  if (!lake) return null;

  const mapsUrl = trailheadDirectionsUrl(lake.lat, lake.lon);
  const onShare = async () => {
    const how = await shareTrailLink(lake.name, lakeShareUrl(lake));
    if (how === 'copied') setToast(t('trip.linkCopied'));
  };

  const size = lake.size || {};
  const seasonLine = lakeSeason(lake, t);
  const facts = [
    size.areaKm2 && {
      key: 'area',
      label: t('lake.factArea'),
      value: `${size.areaKm2.toLocaleString(lang)} km2`,
      mono: true,
    },
    size.depthM && {
      key: 'depth',
      label: t('lake.factDepth'),
      value: `${size.depthM.toLocaleString(lang)} m`,
      mono: true,
    },
    size.elevM != null && {
      key: 'elev',
      label: t('lake.factElevation'),
      value: `${size.elevM.toLocaleString(lang)} m`,
      mono: true,
    },
    lake.water && {
      key: 'water',
      label: t('lake.factWater'),
      value: t(`lake.water${lake.water.class}`),
      note: lake.water.sites > 0
        ? t('lake.factSites', { n: lake.water.sites })
        : (lake.water.site || ''),
    },
    lake.access && {
      key: 'access',
      label: t('lake.factAccess'),
      value: accessLabel(lake.access, t),
    },
    lake.protected && {
      key: 'protected',
      label: t('lake.factProtected'),
      value: lake.protected.name,
      note: lake.protected.np ? t('lake.nationalPark') : lake.protected.kind,
    },
    lake.services?.length && {
      key: 'services',
      label: t('lake.factServices'),
      value: lake.services.map((s) => serviceLabel(s, t)).filter(Boolean).join(', '),
    },
    lake.shared?.length > 1 && {
      key: 'shared',
      label: t('lake.factShared'),
      value: lake.shared.join(', '),
    },
  ].filter(Boolean);

  return (
    <div className="tpage bpage lpage" role="dialog" aria-modal="true" aria-label={lake.name}>
      <div className="tpage-bar">
        <button type="button" className="tpage-back" onClick={onClose}>
          <ArrowLeftIcon size={15} />
          <span>{t('lake.back')}</span>
        </button>
        <span className={`tpage-bar-title ${titleGone ? 'on' : ''}`}>{lake.name}</span>
        <button type="button" className="tpage-bar-act" onClick={onShare} aria-label={t('trails.shareLink')}>
          <ShareIcon size={15} />
        </button>
      </div>

      <div className="tpage-scroll" ref={scrollEl}>
        <div className="bpage-wrap">
          <a className="bpage-where" href={mapsUrl} target="_blank" rel="noopener noreferrer">
            <MapPinIcon size={15} />
            <span className="bpage-where-text">
              {[lake.region, countryName].filter(Boolean).join(', ')}
            </span>
            <span className="bpage-where-coord">
              {fmtCoord(lake.lat)}, {fmtCoord(lake.lon)}
            </span>
            <ChevronRightIcon size={14} />
          </a>

          <div className="bpage-head" ref={titleEl}>
            <h1 className="bpage-name">
              <CountryFlag country={lake.cc} size={15} className="bpage-flag" />
              {lake.name}
            </h1>
            {lake.nameLocal && <p className="bpage-local">{lake.nameLocal}</p>}
            <div className="bpage-scorerow">
              <ScoreChip rating={rating} size="lg" />
              <span className="bpage-band">{t(`lake.band${rating.tier}`)}</span>
              {isHiddenGem(lake) && (
                <span className="lpage-gem">{t('lake.hiddenGem')}</span>
              )}
            </div>
          </div>

          {/* The verdict, above the photograph. See the file header. */}
          <div className={`lpage-swim lpage-swim-${swim.tone}`} role="note">
            <span className="lpage-swim-word">{swim.label}</span>
            {swim.source && <span className="lpage-swim-src">{swim.source}</span>}
            {seasonLine && <span className="lpage-swim-season">{seasonLine}</span>}
          </div>

          {main && (
            <figure className="bpage-gallery">
              <img className="bpage-shot" src={main.big || main.u} alt={lake.name} />
              {images.length > 1 && (
                <div className="bpage-strip" role="tablist" aria-label={t('lake.photos')}>
                  {images.map((img, i) => (
                    <button
                      key={img.page || i}
                      type="button"
                      role="tab"
                      aria-selected={i === shot}
                      className={`bpage-thumb ${i === shot ? 'on' : ''}`}
                      onClick={() => setShot(i)}
                    >
                      <img src={img.u} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
              <ImageCredit image={main} t={t} />
            </figure>
          )}

          {tags.length > 0 && (
            <ul className="bpage-tags">
              {tags.map((tag) => <li key={tag.code}>{tag.label}</li>)}
            </ul>
          )}

          {/* The three sub scores, side by side, because choosing between a
              cold beautiful lake and a warm ordinary one is the actual
              decision and one blended number hides it. */}
          <ul className="lpage-subs">
            {SUB_ORDER.filter((key) => lake.sub?.[key] != null).map((key) => (
              <li key={key}>
                <span className="lpage-sub-n">{Math.round(lake.sub[key] * 10)}</span>
                <span className="lpage-sub-label">{componentLabel(key, t)}</span>
              </li>
            ))}
          </ul>

          <section className="bpage-why">
            <h2>{t('lake.whyHead')}</h2>
            <p className="bpage-lede">{headline}</p>
            {why.length > 0 && <p className="bpage-prose">{why.join(' ')}</p>}
            {lake.bestFor?.length > 0 && (
              <p className="bpage-for">
                <b>{t('lake.bestFor')}</b>
                {' '}
                {lake.bestFor.map((code) => bestForLabel(code, t)).join(', ')}
              </p>
            )}
          </section>

          {hazards.length > 0 && (
            <section className="lpage-hazards">
              <h2>
                <AlertIcon size={15} />
                {t('lake.hazardsHead')}
              </h2>
              <ul>
                {hazards.map((h) => <li key={h.code}>{h.line}</li>)}
              </ul>
            </section>
          )}

          {lake.swim?.temps?.length === 12 && (
            <section className="lpage-season">
              <h2>{t('lake.seasonHead')}</h2>
              <p className="bpage-note">{t('lake.seasonNote')}</p>
              <SeasonStrip temps={lake.swim.temps} warmC={warmC} t={t} />
            </section>
          )}

          {facts.length > 0 && (
            <section className="bpage-facts">
              <h2>{t('lake.factsHead')}</h2>
              <dl>
                {facts.map((fact) => (
                  <div key={fact.key} className="bpage-fact">
                    <dt>{fact.label}</dt>
                    <dd className={fact.mono ? 'mono' : ''}>
                      {fact.value}
                      {fact.note && <small>{fact.note}</small>}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {lake.walks?.length > 0 && (
            <section className="lpage-walks">
              <h2>{t('lake.walksHead')}</h2>
              <ul>
                {lake.walks.map((walk) => (
                  <li key={walk.id}>
                    <BootIcon size={13} />
                    <span>{walk.name}</span>
                    {walk.km > 0 && <small className="mono">{walk.km} km</small>}
                  </li>
                ))}
              </ul>
              {lake.nWalks > lake.walks.length && (
                <p className="bpage-note">
                  {t('lake.walksMore', { n: lake.nWalks - lake.walks.length })}
                </p>
              )}
            </section>
          )}

          <section className="bpage-score">
            <h2>{t('lake.scoreHead')}</h2>
            <p className="bpage-note">{t('lake.scoreNote')}</p>
            <ul className="bpage-bars">
              {COMPONENT_ORDER.filter((key) => lake.comp?.[key] != null).map((key) => (
                <li key={key}>
                  <span className="bpage-bar-label">{componentLabel(key, t)}</span>
                  <span className="bpage-bar-track" aria-hidden="true">
                    <span className="bpage-bar-fill" style={{ width: `${Math.round(lake.comp[key] * 100)}%` }} />
                  </span>
                  <span className="bpage-bar-n">{Math.round(lake.comp[key] * 100)}</span>
                </li>
              ))}
            </ul>
          </section>

          {lake.base && (
            <button type="button" className="bpage-base" onClick={() => onSelectDest?.(lake.base.id)}>
              <span>
                {t('lake.basedOn', { city: lake.base.city })}
                <small>{t('lake.basedKm', { km: Math.round(lake.base.km) })}</small>
              </span>
              <ChevronRightIcon size={15} />
            </button>
          )}

          <section className="bpage-sources">
            <h2>{t('lake.sourcesHead')}</h2>
            <ul>
              {lake.wiki && (
                <li>
                  <a href={lake.wiki} target="_blank" rel="noopener noreferrer">
                    <LinkIcon size={12} />
                    {t('lake.onWikipedia')}
                  </a>
                </li>
              )}
              {lake.osm && (
                <li>
                  <a href={`https://www.openstreetmap.org/${lake.osm}`} target="_blank" rel="noopener noreferrer">
                    <LinkIcon size={12} />
                    {t('lake.onOsm')}
                  </a>
                </li>
              )}
              {lake.wd && (
                <li>
                  <a href={`https://www.wikidata.org/wiki/${lake.wd}`} target="_blank" rel="noopener noreferrer">
                    <LinkIcon size={12} />
                    {t('lake.onWikidata')}
                  </a>
                </li>
              )}
            </ul>
            {lake.credit?.length > 0 && (
              <p className="bpage-attrib">{lake.credit.join('. ')}</p>
            )}
          </section>
        </div>
      </div>

      {toast && <p className="tpage-toast" role="status">{toast}</p>}
    </div>
  );
}
