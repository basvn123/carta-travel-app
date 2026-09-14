import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { NearbyOutdoors } from './NearbyOutdoors.jsx';
import {
  mountainHeadline, mountainWhy, mountainTags, mountainHazards, mountainSeason,
  bestForLabel, componentLabel, liftLabel, isLiftServed, isHiddenGem,
  mountainRating, COMPONENT_ORDER, SUB_ORDER,
  difficultyLabel, viewBandLabel, bestMonthsLine, accessLabels,
} from '../lib/mountainStory.js';
import { mountainShareUrl } from '../lib/mountains.js';
import { trailheadDirectionsUrl, shareTrailLink } from '../lib/trailExport.js';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import {
  ArrowLeftIcon, ShareIcon, MapPinIcon, LinkIcon, ChevronRightIcon,
  CameraIcon, AlertIcon, MountainIcon,
} from '../components/Icons.jsx';

/**
 * The mountain page: one published summit, and the argument for going there.
 *
 * It answers five things, and the first one is not the score.
 *
 *   how do I get up    the way up, in its own banner, at the top, with the
 *                      evidence that produced it named. For most people
 *                      reading this app that is the whole question: a cable
 *                      car to 3,883 m and a glaciated rope route are both
 *                      "a mountain" and only one of them is an afternoon.
 *                      The banner says which, and says where the claim came
 *                      from, because neither a map nor a shortlist knows
 *                      whether the lift is running today.
 *   where is it        a pin, the range, the country, the coordinates, and
 *                      one link that opens the summit in a maps app.
 *   what does it look  up to six photographs, each credited to the person
 *   like               who took it and the licence they released it under.
 *   why this one       the composed explanation, every sentence of it mapped
 *                      to a field in the data (lib/mountainStory.js), then
 *                      the hazards in their own block underneath.
 *   is the number      three sub scores on their own, then the five weighted
 *   honest             components, so the ranking can be checked rather than
 *                      believed.
 *
 * No maplibre here on purpose, the same call the beach and lake pages make:
 * the page is opened from a list and read on a phone, and a 200 KB map
 * library to draw one pin would be the heaviest thing on it.
 *
 * Nothing on this page is a route description. The pipeline never generates
 * one, this page never asks for one, and the hazard block says to check
 * conditions locally, because a wrong sentence about a mountain is the one
 * kind of wrong sentence in this app that can hurt somebody.
 */

const fmtCoord = (n) => (Number.isFinite(n) ? n.toFixed(4) : '');

/** A photograph's credit line, in the TASL order Commons expects. Everything
 *  the file did not carry is dropped rather than filled with "unknown". */
function ImageCredit({ image, t }) {
  if (!image || (!image.by && !image.lic)) return null;
  const by = String(image.by || '').trim();
  const lic = String(image.lic || '').trim();
  return (
    <p className="bpage-credit">
      <CameraIcon size={12} />
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
            {t('mtn.photos')}
          </a>
        )}
      </span>
    </p>
  );
}

/**
 * The way up, above the photograph.
 *
 * Two lines and a source. The first says what the way up is, the second says
 * who says so: OpenStreetMap's map of the mountain, or this app's own
 * shortlist. Neither of them knows the operating season, so the page says
 * that out loud rather than implying a lift runs in February.
 */
// Where the claim came from, spelled out. Three sources, three sentences: the
// map, the hand-kept list, and a mention in the article. The third is the
// weakest and says so, because "the article mentions a cable car" is not
// "there is a cable car to the top".
const SRC_KEY = {
  osm: 'mtn.liftSrcOsm',
  curated: 'mtn.liftSrcCurated',
  wiki: 'mtn.liftSrcWiki',
};

function WayUp({ mountain, t }) {
  const lift = mountain.lift;
  const ride = isLiftServed(mountain);
  const tone = ride ? 'ride' : lift ? 'near' : 'foot';
  const srcKey = lift ? (SRC_KEY[lift.src] || '') : '';
  const srcLine = srcKey ? t(srcKey) : '';
  const season = bestMonthsLine(mountain, t) || mountainSeason(mountain, t);
  // Every way in, not just the lift: parking at the start and a station
  // within two kilometres are the two facts that decide whether a person
  // without a car can go, and v1 had no field for either.
  const ways = accessLabels(mountain, t);
  return (
    <div className={`mpage-way mpage-way-${tone}`} role="note">
      <span className="mpage-way-word">{liftLabel(mountain, t)}</span>
      {lift?.name && <span className="mpage-way-name">{lift.name}</span>}
      {srcLine && srcLine !== srcKey && (
        <span className="mpage-way-src">
          {srcLine}
          {lift?.m != null && (
            <span className="mono">{' '}{t('mtn.liftMetres', { m: lift.m })}</span>
          )}
        </span>
      )}
      {ride && <span className="mpage-way-note">{t('mtn.liftSeasonNote')}</span>}
      {season && <span className="mpage-way-note">{season}</span>}
      {ways.length > 0 && (
        <span className="mpage-way-ways">
          {ways.map((w) => <span key={w.code}>{w.label}</span>)}
        </span>
      )}
    </div>
  );
}

export function MountainPage({ mountain, countryName, onClose, onSelectDest, onOpenNeighbour }) {
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

  useEffect(() => { setShot(0); scrollEl.current?.scrollTo?.(0, 0); }, [mountain?.id]);

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
  }, [mountain?.id]);

  const images = mountain?.images || [];
  const main = images[shot] || images[0] || null;
  const why = useMemo(() => (mountain ? mountainWhy(mountain, t) : []), [mountain, t]);
  const tags = useMemo(() => (mountain ? mountainTags(mountain, t, 4) : []), [mountain, t]);
  const rating = useMemo(() => (mountain ? mountainRating(mountain, t) : null), [mountain, t]);
  const hazards = useMemo(() => (mountain ? mountainHazards(mountain, t) : []), [mountain, t]);
  const headline = useMemo(
    () => (mountain ? mountainHeadline(mountain, t, countryName) : ''),
    [mountain, t, countryName],
  );

  if (!mountain) return null;

  const mapsUrl = trailheadDirectionsUrl(mountain.lat, mountain.lon);
  const onShare = async () => {
    const how = await shareTrailLink(mountain.name, mountainShareUrl(mountain));
    if (how === 'copied') setToast(t('trip.linkCopied'));
  };

  const facts = [
    mountain.ele != null && {
      key: 'ele',
      label: t('mtn.factHeight'),
      value: `${Math.round(mountain.ele).toLocaleString(lang)} m`,
      mono: true,
    },
    mountain.prom != null && {
      key: 'prom',
      label: t('mtn.factProminence'),
      // A computed prominence says so, and a computed one the search window
      // could only bound from below says THAT: "at least 2,312 m" is a
      // different claim from "2,312 m" and the reader is owed the difference.
      value: `${mountain.promSrc === 'dem_min' ? '≥ ' : ''}`
        + `${Math.round(mountain.prom).toLocaleString(lang)} m`,
      note: mountain.promSrc === 'dem_min' ? t('mtn.factProminenceDemMin')
        : mountain.promSrc === 'dem' ? t('mtn.factProminenceDem')
          : t('mtn.factProminenceNote'),
      mono: true,
    },
    mountain.diff && {
      key: 'diff',
      label: t('mtn.factDifficulty'),
      value: difficultyLabel(mountain, t),
    },
    mountain.view && {
      key: 'view',
      label: t('mtn.factView'),
      value: [viewBandLabel(mountain, t),
        `${Math.round(mountain.view.km2).toLocaleString(lang)} km2`]
        .filter(Boolean).join(', '),
      note: t('mtn.factViewNote'),
    },
    mountain.isoKm != null && {
      key: 'iso',
      label: t('mtn.factIsolation'),
      value: `${mountain.isoKm.toLocaleString(lang)} km`,
      note: t('mtn.factIsolationNote'),
      mono: true,
    },
    mountain.range && {
      key: 'range',
      label: t('mtn.factRange'),
      value: mountain.range,
    },
    mountain.highpointOf && {
      key: 'highpoint',
      label: t('mtn.factHighpoint'),
      value: mountain.highpointOf,
    },
    mountain.season && {
      key: 'season',
      label: t('mtn.factSeason'),
      // The climatology's own sentence where there is one, which names the
      // months and says outright when the answer is "the warmest, not the
      // walkable". The v1 line stays as the fallback for a row the season
      // sweep has not reached.
      value: bestMonthsLine(mountain, t) || mountainSeason(mountain, t)
        || t('mtn.seasonAllYear'),
      note: mountain.season.months ? t('mtn.seasonEstNote')
        : t('mtn.factSeasonNote'),
    },
  ].filter(Boolean);

  return (
    <div className="tpage bpage lpage mpage" role="dialog" aria-modal="true" aria-label={mountain.name}>
      <div className="tpage-bar">
        <button type="button" className="tpage-back" onClick={onClose}>
          <ArrowLeftIcon size={15} />
          <span>{t('mtn.back')}</span>
        </button>
        <span className={`tpage-bar-title ${titleGone ? 'on' : ''}`}>{mountain.name}</span>
        <button type="button" className="tpage-bar-act" onClick={onShare} aria-label={t('trails.shareLink')}>
          <ShareIcon size={15} />
        </button>
      </div>

      <div className="tpage-scroll" ref={scrollEl}>
        <div className="bpage-wrap">
          <a className="bpage-where" href={mapsUrl} target="_blank" rel="noopener noreferrer">
            <MapPinIcon size={15} />
            <span className="bpage-where-text">
              {[mountain.range, countryName].filter(Boolean).join(', ')}
            </span>
            <span className="bpage-where-coord">
              {fmtCoord(mountain.lat)}, {fmtCoord(mountain.lon)}
            </span>
            <ChevronRightIcon size={14} />
          </a>

          <div className="bpage-head" ref={titleEl}>
            <h1 className="bpage-name">
              <CountryFlag country={mountain.cc} size={15} className="bpage-flag" />
              {mountain.name}
            </h1>
            {mountain.nameLocal && <p className="bpage-local">{mountain.nameLocal}</p>}
            <div className="bpage-scorerow">
              <ScoreChip rating={rating} size="lg" />
              <span className="bpage-band">{t(`mtn.band${rating.tier}`)}</span>
              {mountain.ele != null && (
                <span className="mpage-height mono">
                  {Math.round(mountain.ele).toLocaleString(lang)} m
                </span>
              )}
              {isHiddenGem(mountain) && (
                <span className="lpage-gem">{t('mtn.hiddenGem')}</span>
              )}
            </div>
          </div>

          <WayUp mountain={mountain} t={t} />

          {main && (
            <figure className="bpage-gallery">
              <img className="bpage-shot" src={main.big || main.u} alt={mountain.name} />
              {images.length > 1 && (
                <div className="bpage-strip" role="tablist" aria-label={t('mtn.photos')}>
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
              beautiful summit you cannot reach and an ordinary one with a
              cable car is the actual decision and one blended number hides it. */}
          <ul className="lpage-subs">
            {SUB_ORDER.filter((key) => mountain.sub?.[key] != null).map((key) => (
              <li key={key}>
                <span className="lpage-sub-n">{Math.round(mountain.sub[key] * 10)}</span>
                <span className="lpage-sub-label">{componentLabel(key, t)}</span>
              </li>
            ))}
          </ul>

          <section className="bpage-why">
            <h2>{t('mtn.whyHead')}</h2>
            <p className="bpage-lede">{headline}</p>
            {why.length > 0 && <p className="bpage-prose">{why.join(' ')}</p>}
            {mountain.bestFor?.length > 0 && (
              <p className="bpage-for">
                <b>{t('mtn.bestFor')}</b>
                {' '}
                {mountain.bestFor.map((code) => bestForLabel(code, t)).join(', ')}
              </p>
            )}
          </section>

          {hazards.length > 0 && (
            <section className="lpage-hazards">
              <h2>
                <AlertIcon size={15} />
                {t('mtn.hazardsHead')}
              </h2>
              <ul>
                {hazards.map((h) => <li key={h.code}>{h.line}</li>)}
              </ul>
              <p className="mpage-check">{t('mtn.hazardsCheck')}</p>
            </section>
          )}

          {facts.length > 0 && (
            <section className="bpage-facts">
              <h2>{t('mtn.factsHead')}</h2>
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

          <NearbyOutdoors
            row={mountain}
            cc={mountain.cc}
            headings={{ trail: 'nb.mtn.trail', peak: 'nb.mtn.peak', lake: 'nb.mtn.lake' }}
            onOpen={onOpenNeighbour}
          />

          <section className="bpage-score">
            <h2>{t('mtn.scoreHead')}</h2>
            <p className="bpage-note">{t('mtn.scoreNote')}</p>
            <ul className="bpage-bars">
              {COMPONENT_ORDER.filter((key) => mountain.comp?.[key] != null).map((key) => (
                <li key={key}>
                  <span className="bpage-bar-label">{componentLabel(key, t)}</span>
                  <span className="bpage-bar-track" aria-hidden="true">
                    <span className="bpage-bar-fill" style={{ width: `${Math.round(mountain.comp[key] * 100)}%` }} />
                  </span>
                  <span className="bpage-bar-n">{Math.round(mountain.comp[key] * 100)}</span>
                </li>
              ))}
            </ul>
          </section>

          {mountain.near?.dest_id && (
            <button
              type="button"
              className="bpage-base"
              onClick={() => onSelectDest?.(mountain.near.dest_id)}
            >
              <span>
                {t('mtn.basedOn', { city: mountain.near.city })}
                <small>{t('mtn.basedKm', { km: Math.round(mountain.near.km) })}</small>
              </span>
              <ChevronRightIcon size={15} />
            </button>
          )}

          <section className="bpage-sources">
            <h2>{t('mtn.sourcesHead')}</h2>
            <ul>
              {mountain.wiki && (
                <li>
                  <a href={mountain.wiki} target="_blank" rel="noopener noreferrer">
                    <LinkIcon size={12} />
                    {t('mtn.onWikipedia')}
                  </a>
                </li>
              )}
              {mountain.wd && (
                <li>
                  <a href={`https://www.wikidata.org/wiki/${mountain.wd}`} target="_blank" rel="noopener noreferrer">
                    <LinkIcon size={12} />
                    {t('mtn.onWikidata')}
                  </a>
                </li>
              )}
              <li>
                <a
                  href={`https://www.openstreetmap.org/#map=14/${mountain.lat}/${mountain.lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MountainIcon size={12} />
                  {t('mtn.onOsm')}
                </a>
              </li>
            </ul>
            {mountain.credit?.length > 0 && (
              <p className="bpage-attrib">{mountain.credit.join('. ')}</p>
            )}
          </section>
        </div>
      </div>

      {toast && <p className="tpage-toast" role="status">{toast}</p>}
    </div>
  );
}
