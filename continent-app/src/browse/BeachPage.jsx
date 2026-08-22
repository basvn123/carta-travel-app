import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import {
  beachHeadline, beachWhy, beachTags, bestForLabel, componentLabel,
  COMPONENT_ORDER, beachRating,
} from '../lib/beachStory.js';
import { beachShareUrl } from '../lib/beaches.js';
import { trailheadDirectionsUrl, shareTrailLink } from '../lib/trailExport.js';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import {
  ArrowLeftIcon, ShareIcon, MapPinIcon, LinkIcon, ChevronRightIcon,
  CameraIcon,
} from '../components/Icons.jsx';

/**
 * The beach page: one published beach, and the argument for going there.
 *
 * It answers four things and deliberately nothing else:
 *   where is it        a pin, the region, the country, the coordinates, and
 *                      one link that opens the spot in a maps app. No route,
 *                      no GPX, no elevation profile: a beach is a place you
 *                      arrive at, not a line you follow, and the export
 *                      chrome the trail page needs is noise here.
 *   what does it look  three or four photographs, each credited to the person
 *   like               who took it and the licence they released it under.
 *   why this one       the composed explanation, every sentence of it mapped
 *                      to a field in the data (lib/beachStory.js).
 *   is the number      the six components of the beauty index with their
 *   honest             weights, so the score can be checked rather than
 *                      believed.
 *
 * No maplibre here on purpose. The page is opened from a list and read on a
 * phone, and a 200 KB map library to draw one pin would be the heaviest thing
 * on it. The pin row and the maps link say where it is; the photographs say
 * what it is.
 */

const fmtCoord = (n) => (Number.isFinite(n) ? n.toFixed(4) : '');

/** A photograph's credit line, in the TASL order Commons expects: title,
 *  author, source, licence. Everything the file did not carry is dropped
 *  rather than filled with "unknown". */
function ImageCredit({ image, t }) {
  if (!image || (!image.by && !image.lic)) return null;
  // Commons artist fields arrive with stray whitespace and trailing commas
  // often enough that trimming here is cheaper than reharvesting when one
  // slips through: "7alaskan , CC BY-SA 3.0" was the first one shipped.
  const by = String(image.by || '').trim();
  const lic = String(image.lic || '').trim();
  return (
    <p className="bpage-credit">
      <CameraIcon size={12} />
      {by && (
        <a href={image.page} target="_blank" rel="noopener noreferrer">
          {by}
        </a>
      )}
      {by && lic && ', '}
      {lic && (image.licUrl
        ? (
          <a href={image.licUrl} target="_blank" rel="noopener noreferrer">
            {lic}
          </a>
        )
        : <span>{lic}</span>)}
      {!by && (
        <a href={image.page} target="_blank" rel="noopener noreferrer">
          {t('beach.photos')}
        </a>
      )}
    </p>
  );
}

export function BeachPage({ beach, countryName, onClose, onSelectDest }) {
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

  useEffect(() => { setShot(0); scrollEl.current?.scrollTo?.(0, 0); }, [beach?.id]);

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
  }, [beach?.id]);

  const images = beach?.images || [];
  const main = images[shot] || images[0] || null;
  const why = useMemo(() => (beach ? beachWhy(beach, t) : []), [beach, t]);
  const tags = useMemo(() => (beach ? beachTags(beach, t, 4) : []), [beach, t]);
  const rating = useMemo(() => (beach ? beachRating(beach, t) : null), [beach, t]);
  const headline = useMemo(
    () => (beach ? beachHeadline(beach, t, countryName) : ''),
    [beach, t, countryName],
  );

  if (!beach) return null;

  const mapsUrl = trailheadDirectionsUrl(beach.lat, beach.lon);
  const onShare = async () => {
    const how = await shareTrailLink(beach.name, beachShareUrl(beach));
    if (how === 'copied') setToast(t('trip.linkCopied'));
  };

  const facts = [
    beach.water && {
      key: 'water',
      label: t('beach.factWater'),
      value: t(`beach.water${beach.water.class}`),
      note: beach.water.site || '',
    },
    beach.surface && {
      key: 'surface',
      label: t('beach.factSurface'),
      value: t(`beach.surfaceWord${beach.surface.charAt(0).toUpperCase()}${beach.surface.slice(1)}`),
    },
    beach.access && {
      key: 'access',
      label: t('beach.factAccess'),
      value: t(`beach.access${beach.access.charAt(0).toUpperCase()}${beach.access.slice(1)}`),
    },
    beach.lengthM && {
      key: 'length',
      label: t('beach.factLength'),
      value: `${beach.lengthM.toLocaleString(lang)} m`,
      mono: true,
    },
    beach.protected && {
      key: 'protected',
      label: t('beach.factProtected'),
      value: beach.protected.name,
      note: beach.protected.np ? t('beach.nationalPark') : beach.protected.kind,
    },
    beach.services?.length && {
      key: 'services',
      label: t('beach.factServices'),
      value: beach.services.map((s) => t(`beach.svc${s.charAt(0).toUpperCase()}${s.slice(1)}`)).join(', '),
    },
    beach.lifeguard && {
      key: 'lifeguard', label: t('beach.factLifeguard'), value: t('beach.yes'),
    },
    beach.nudism && {
      key: 'nudism', label: t('beach.factNudism'), value: t('beach.yes'),
    },
    beach.wheelchair && {
      key: 'wheelchair', label: t('beach.factWheelchair'), value: t('beach.yes'),
    },
  ].filter(Boolean);

  return (
    <div className="tpage bpage" role="dialog" aria-modal="true" aria-label={beach.name}>
      <div className="tpage-bar">
        <button type="button" className="tpage-back" onClick={onClose}>
          <ArrowLeftIcon size={15} />
          <span>{t('beach.back')}</span>
        </button>
        <span className={`tpage-bar-title ${titleGone ? 'on' : ''}`}>{beach.name}</span>
        <button type="button" className="tpage-bar-act" onClick={onShare} aria-label={t('trails.shareLink')}>
          <ShareIcon size={15} />
        </button>
      </div>

      <div className="tpage-scroll" ref={scrollEl}>
        <div className="bpage-wrap">
          {/* Where it is, first thing on the page, because a beach with no
              place attached is a photograph rather than a destination. */}
          <a className="bpage-where" href={mapsUrl} target="_blank" rel="noopener noreferrer">
            <MapPinIcon size={15} />
            <span className="bpage-where-text">
              {[beach.region, countryName].filter(Boolean).join(', ')}
            </span>
            <span className="bpage-where-coord">
              {fmtCoord(beach.lat)}, {fmtCoord(beach.lon)}
            </span>
            <ChevronRightIcon size={14} />
          </a>

          <div className="bpage-head" ref={titleEl}>
            <h1 className="bpage-name">
              <CountryFlag country={beach.cc} size={15} className="bpage-flag" />
              {beach.name}
            </h1>
            {beach.nameLocal && <p className="bpage-local">{beach.nameLocal}</p>}
            <div className="bpage-scorerow">
              <ScoreChip rating={rating} size="lg" />
              <span className="bpage-band">{t(`beach.band${rating.tier}`)}</span>
            </div>
          </div>

          {main && (
            <figure className="bpage-gallery">
              <img className="bpage-shot" src={main.big || main.u} alt={beach.name} />
              {images.length > 1 && (
                <div className="bpage-strip" role="tablist" aria-label={t('beach.photos')}>
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

          <section className="bpage-why">
            <h2>{t('beach.whyHead')}</h2>
            <p className="bpage-lede">{headline}</p>
            {why.length > 0 && <p className="bpage-prose">{why.join(' ')}</p>}
            {beach.bestFor?.length > 0 && (
              <p className="bpage-for">
                <b>{t('beach.bestFor')}</b>
                {' '}
                {beach.bestFor.map((code) => bestForLabel(code, t)).join(', ')}
              </p>
            )}
          </section>

          {facts.length > 0 && (
            <section className="bpage-facts">
              <h2>{t('beach.factsHead')}</h2>
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

          <section className="bpage-score">
            <h2>{t('beach.scoreHead')}</h2>
            <p className="bpage-note">{t('beach.scoreNote')}</p>
            <ul className="bpage-bars">
              {COMPONENT_ORDER.filter((key) => beach.comp?.[key] != null).map((key) => (
                <li key={key}>
                  <span className="bpage-bar-label">{componentLabel(key, t)}</span>
                  <span className="bpage-bar-track" aria-hidden="true">
                    <span className="bpage-bar-fill" style={{ width: `${Math.round(beach.comp[key] * 100)}%` }} />
                  </span>
                  <span className="bpage-bar-n">{Math.round(beach.comp[key] * 100)}</span>
                </li>
              ))}
            </ul>
          </section>

          {beach.base && (
            <button type="button" className="bpage-base" onClick={() => onSelectDest?.(beach.base.id)}>
              <span>
                {t('beach.basedOn', { city: beach.base.city })}
                <small>{t('beach.basedKm', { km: Math.round(beach.base.km) })}</small>
              </span>
              <ChevronRightIcon size={15} />
            </button>
          )}

          <section className="bpage-sources">
            <h2>{t('beach.sourcesHead')}</h2>
            <ul>
              {beach.wiki && (
                <li>
                  <a href={beach.wiki} target="_blank" rel="noopener noreferrer">
                    <LinkIcon size={12} />
                    {t('beach.onWikipedia')}
                  </a>
                </li>
              )}
              {beach.osm && (
                <li>
                  <a href={`https://www.openstreetmap.org/${beach.osm}`} target="_blank" rel="noopener noreferrer">
                    <LinkIcon size={12} />
                    {t('beach.onOsm')}
                  </a>
                </li>
              )}
              {beach.wd && (
                <li>
                  <a href={`https://www.wikidata.org/wiki/${beach.wd}`} target="_blank" rel="noopener noreferrer">
                    <LinkIcon size={12} />
                    {t('beach.onWikidata')}
                  </a>
                </li>
              )}
            </ul>
            {beach.credit?.length > 0 && (
              <p className="bpage-attrib">{beach.credit.join('. ')}</p>
            )}
          </section>
        </div>
      </div>

      {toast && <p className="tpage-toast" role="status">{toast}</p>}
    </div>
  );
}
