import React, { useEffect, useMemo, useState } from 'react';
import { ReportProblem } from '../components/ReportProblem.jsx';
import { useI18n } from '../i18n/index.jsx';
import { MonthStrip } from '../components/MonthStrip.jsx';
import { NearbyOutdoors } from './NearbyOutdoors.jsx';
import { DetailPage, PlaceMap } from './DetailSkeleton.jsx';
import { PhotoGallery } from './PhotoGallery.jsx';
import { ItemHead, ItemIcon } from './ItemParts.jsx';
import { Button, Money } from '../components/ui/index.js';
import { toPhotos } from '../lib/itemPhotos.js';
import { beforeGoItems } from '../lib/beforeGo.js';
import { useBaseDay } from '../hooks/useBaseDay.js';
import { useItemPdf } from '../hooks/useItemPdf.js';
import { usePlaceExits } from '../hooks/usePlaceExits.js';
import {
  previewWords, previewNotHook, keyFactCells, pointCentre, MOUNTAIN_LEVEL,
} from '../lib/detailSkeleton.js';
import { notForLines } from '../lib/notFor.js';
import {
  mountainHeadline, mountainWhy, mountainTags, mountainHazards, mountainSeason,
  bestForLabel, componentLabel, liftLabel, isLiftServed, isHiddenGem,
  mountainRating, COMPONENT_ORDER, SUB_ORDER,
  difficultyLabel, viewBandLabel, bestMonthsLine, accessLabels, mountainHighlights,
} from '../lib/mountainStory.js';
import { mountainShareUrl, loadMountains } from '../lib/mountains.js';
import { trailheadDirectionsUrl, shareTrailLink } from '../lib/trailExport.js';
import {
  MapPinIcon, ChevronRightIcon,
  BulbIcon, InfoIcon, StarIcon,
  SunIcon,
} from '../components/Icons.jsx';

import { MountainSignature } from './Signature.jsx';
import { InfoDot } from '../components/InfoDot.jsx';
import { numberSentence } from '../lib/numberSentences.js';

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
 * Since T180 the page draws through the shared detail skeleton
 * (DetailSkeleton.jsx). The way up is the page's "Getting there", never
 * folded; the hazards sit in the alert slot, which never folds either. The
 * map is a lazy chunk (PointMap.jsx). The signature slot (Signature.jsx,
 * T181) holds the height and prominence bar, the horizon row (empty until a
 * skyline is computed from the DEM) and the season strip.
 *
 * Nothing on this page is a route description. The pipeline never generates
 * one, this page never asks for one, and the hazard block says to check
 * conditions locally, because a wrong sentence about a mountain is the one
 * kind of wrong sentence in this app that can hurt somebody.
 */

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

/** The way up as a level on the strip's five squares. */
const mountainLevel = (m) => MOUNTAIN_LEVEL[m?.diff?.k] || 0;

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

export function MountainPage({ mountain, countryName, onClose, onSelectDest, onOpenNeighbour, fav = false, onFav = null, onAddToDay = null }) {
  const { t, lang } = useI18n();
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  // Three ways out, from the same country's mountains (T180).
  const exits = usePlaceExits({
    me: mountain,
    cc: mountain?.cc,
    load: loadMountains,
    centre: pointCentre,
    level: mountainLevel,
    baseOf: (r) => r?.near?.dest_id || null,
    open: (row) => onOpenNeighbour?.('peak', row),
  });

  const images = useMemo(() => mountain?.images || [], [mountain]);
  const why = useMemo(() => (mountain ? mountainWhy(mountain, t) : []), [mountain, t]);
  const tags = useMemo(() => (mountain ? mountainTags(mountain, t, 4) : []), [mountain, t]);
  const rating = useMemo(() => (mountain ? mountainRating(mountain, t) : null), [mountain, t]);
  const hazards = useMemo(() => (mountain ? mountainHazards(mountain, t) : []), [mountain, t]);
  const headline = useMemo(
    () => (mountain ? mountainHeadline(mountain, t, countryName) : ''),
    [mountain, t, countryName],
  );

  const highlights = useMemo(() => (mountain ? mountainHighlights(mountain, t) : []), [mountain, t]);
  const photos = useMemo(() => toPhotos(images, { fallbackCaption: mountain?.name || '' }), [images, mountain?.name]);
  const baseDay = useBaseDay(mountain?.near?.dest_id || null);
  const { onPdf, pdfBusy } = useItemPdf('mountain', mountain, { countryName });

  if (!mountain) return null;

  const mapsUrl = trailheadDirectionsUrl(mountain.lat, mountain.lon);
  const onShare = async () => {
    const how = await shareTrailLink(mountain.name, mountainShareUrl(mountain));
    if (how === 'copied') setToast(t('trip.linkCopied'));
  };

  // The climatology's months, as the shared strip. Good months are the ones the
  // season sweep named; avoid months are the ones with snow cover of 75 percent
  // or more that are not good. A row without months keeps the v1 facts line.
  const monthsGood = mountain.season?.months || [];
  const hasMonths = monthsGood.length > 0;
  const monthsAvoid = hasMonths && Array.isArray(mountain.season.snow)
    ? mountain.season.snow.map((p, i) => (p >= 75 ? i + 1 : 0))
      .filter((m) => m && !monthsGood.includes(m))
    : [];

  const say = (metric, value) => numberSentence(metric, value, { t, lang });
  const facts = [
    mountain.ele != null && {
      key: 'ele',
      sentence: say('height', mountain.ele),
      label: t('mtn.factHeight'),
      value: `${Math.round(mountain.ele).toLocaleString(lang)} m`,
      mono: true,
    },
    mountain.prom != null && {
      key: 'prom',
      term: 'prominence',
      sentence: say('prominence', mountain.prom),
      label: t('mtn.factProminence'),
      // A computed prominence says so, and a computed one the search window
      // could only bound from below says THAT: "at least 2,312 m" is a
      // different claim from "2,312 m" and the reader is owed the difference.
      value: `${mountain.promSrc === 'dem_min' ? '≥ ' : ''}`
        + `${Math.round(mountain.prom).toLocaleString(lang)} m`,
      note: mountain.promSrc === 'dem_min' ? t('mtn.factProminenceDemMin')
        : mountain.promSrc === 'dem' ? t('mtn.factProminenceDem')
          : mountain.promSrc === 'insular' ? t('mtn.factProminenceInsular')
            : t('mtn.factProminenceNote'),
      mono: true,
    },
    mountain.diff && {
      key: 'diff',
      sentence: say('difficulty', mountain.diff.k),
      label: t('mtn.factDifficulty'),
      value: difficultyLabel(mountain, t),
    },
    mountain.view && {
      key: 'view',
      sentence: say('viewArea', mountain.view.km2),
      label: t('mtn.factView'),
      value: [viewBandLabel(mountain, t),
        `${Math.round(mountain.view.km2).toLocaleString(lang)} km²`]
        .filter(Boolean).join(', '),
      note: t('mtn.factViewNote'),
    },
    mountain.isoKm != null && {
      key: 'iso',
      term: 'isolation',
      sentence: say('isolation', mountain.isoKm),
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
    mountain.season && !hasMonths && {
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

  const subs = SUB_ORDER.filter((key) => mountain.sub?.[key] != null);

  // The key facts band (T386): height, prominence, the way up in a word and
  // the season. The way up's long form stays in Getting there (WayUp), the
  // one place it is told; the "How you get up" row went with T386.
  const MONTH_CODES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let monthShort = (code) => code;
  try {
    const fmt = new Intl.DateTimeFormat(lang, { month: 'short' });
    monthShort = (code) => {
      const i = MONTH_CODES.indexOf(String(code || '').toLowerCase());
      return i < 0 ? '' : fmt.format(new Date(Date.UTC(2026, i, 15)));
    };
  } catch { /* older engines keep the code */ }
  const season = mountain.season;
  const seasonValue = !season ? ''
    : season.n >= 12 ? t('detail.seasonAllYear')
      : (monthShort(season.from) && monthShort(season.to)
        ? t('detail.monthRange', { from: monthShort(season.from), to: monthShort(season.to) }) : '');
  const keyFacts = keyFactCells([
    { key: 'ele', label: t('mtn.factHeight'), value: mountain.ele != null ? `${Math.round(mountain.ele).toLocaleString(lang)} m` : '', mono: true },
    mountain.prom != null && {
      key: 'prom',
      label: t('mtn.factProminence'),
      value: `${mountain.promSrc === 'dem_min' ? '≥ ' : ''}${Math.round(mountain.prom).toLocaleString(lang)} m`,
      mono: true,
    },
    { key: 'way', label: t('detail.factWayUp'), value: isLiftServed(mountain) ? liftLabel(mountain, t) : difficultyLabel(mountain, t) },
    seasonValue && {
      key: 'season',
      label: t('detail.factSeason'),
      value: seasonValue,
      mono: season.n < 12,
      note: season.months ? t('prov.est') : null,
    },
    mountain.isoKm != null && { key: 'iso', label: t('mtn.factIsolation'), value: `${mountain.isoKm.toLocaleString(lang)} km`, mono: true, fallback: true },
  ], t);

  // The rows (T386): at most five. Why, every measurement, the score and
  // the photographs.
  const rows = [
    (why.length > 0 || subs.length > 0 || mountain.bestFor?.length > 0 || tags.length > 0) && {
      key: 'why',
      icon: BulbIcon,
      label: t('mtn.whyHead'),
      summary: previewNotHook(why, headline),
      body: (
        <div className="bpage-why">
          {/* The three sub scores, side by side, because choosing between a
              beautiful summit you cannot reach and an ordinary one with a
              cable car is the actual decision and one blended number hides it. */}
          {subs.length > 0 && (
            <ul className="lpage-subs">
              {subs.map((key) => (
                <li key={key}>
                  <span className="lpage-sub-n">{Math.round(mountain.sub[key] * 10)}</span>
                  <span className="lpage-sub-label">{componentLabel(key, t)}</span>
                </li>
              ))}
            </ul>
          )}
          {why.length > 0 && <p className="bpage-prose">{why.join(' ')}</p>}
          {mountain.bestFor?.length > 0 && (
            <p className="bpage-for">
              <b>{t('mtn.bestFor')}</b>
              {' '}
              {mountain.bestFor.map((code) => bestForLabel(code, t)).join(', ')}
            </p>
          )}
          {tags.length > 0 && (
            <ul className="bpage-tags">
              {tags.map((tag) => <li key={tag.code}>{tag.label}</li>)}
            </ul>
          )}
        </div>
      ),
    },
    facts.length > 0 && {
      key: 'facts',
      icon: InfoIcon,
      label: t('mtn.factsHead'),
      summary: previewWords(facts.slice(0, 3).map((f) => f.value).join(', ')),
      body: (
        <div className="bpage-facts">
          <dl>
            {facts.map((fact) => (
              <div key={fact.key} className="bpage-fact">
                <dt>{fact.label}{fact.term && <InfoDot term={fact.term} />}</dt>
                <dd className={fact.mono ? 'mono' : ''}>
                  {fact.value}
                  {fact.note && <small>{fact.note}</small>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ),
    },
    COMPONENT_ORDER.some((key) => mountain.comp?.[key] != null) && {
      key: 'score',
      icon: StarIcon,
      label: t('mtn.scoreHead'),
      summary: previewWords(t('mtn.scoreNote')),
      body: (
        <div className="bpage-score">
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
        </div>
      ),
    },
  ].filter(Boolean);

  const hasTransit = (mountain.acc || []).includes('transit');

  const before = beforeGoItems({
    hazards: mountain.hazards || [],
    lines: notForLines('mountain', mountain, { word: difficultyLabel(mountain, t), shownHazards: hazards.map((h) => h.code) }),
  });
  const sources = [
    { label: 'OpenStreetMap', href: `https://www.openstreetmap.org/#map=14/${mountain.lat}/${mountain.lon}` },
    mountain.wiki && { label: 'Wikipedia', href: mountain.wiki },
    mountain.wd && { label: 'Wikidata', href: `https://www.wikidata.org/wiki/${mountain.wd}` },
    ...(mountain.credit || []).map((c) => ({ label: c })),
  ].filter(Boolean);

  return (
    <DetailPage
      name={mountain.name}
      className="bpage lpage mpage"
      backLabel={t('mtn.back')}
      onClose={onClose}
      fav={fav}
      onFav={onFav}
      onShare={onShare}
      resetKey={mountain.id}
      toast={toast}
      gallery={(
        <PhotoGallery photos={photos} label={mountain.name} claimKey={mountain.id}
          fallback={{ city: mountain.name, iso2: mountain.cc }} />
      )}
      head={(
        <ItemHead
          title={mountain.name}
          iso2={mountain.cc}
          sub={mountain.nameLocal || ''}
          where={[mountain.range, countryName].filter(Boolean).join(', ')}
          rating={rating}
          gem={isHiddenGem(mountain)}
        />
      )}
      hook={highlights[0]?.line || headline}
      keyFacts={keyFacts}
      whyGo={highlights.slice(1).filter((h) => h.title)}
      before={before}
      primary={mountain.near?.dest_id ? (
        <Button variant="primary" iconEnd={<ChevronRightIcon size={20} />} onClick={() => onSelectDest?.(mountain.near.dest_id)}>
          {t('mtn.basedOn', { city: mountain.near.city })}
        </Button>
      ) : null}
      costLine={baseDay && mountain.near?.city ? (
        <>
          {t('item.dayIn', { city: mountain.near.city })}{' '}
          <strong><Money value={baseDay.dayEur} est={baseDay.est} /></strong>{' '}
          {t('cost.perDay')}
        </>
      ) : null}
      actions={[
        <a key="dir" className="btn btn-secondary" href={mapsUrl} target="_blank" rel="noopener noreferrer">
          <span className="btn-icon" aria-hidden="true"><MapPinIcon size={20} /></span>
          <span className="btn-label">{t('detail.directions')}</span>
        </a>,
        onAddToDay && (
          <Button key="day" variant="secondary" iconStart={<SunIcon size={20} />}
            onClick={() => onAddToDay({ id: mountain.id, cc: mountain.cc, name: mountain.name, lat: mountain.lat, lon: mountain.lon })}>
            {t('feat.addToDay')}
          </Button>
        ),
      ]}
      onPdf={onPdf}
      pdfBusy={pdfBusy}
      map={Number.isFinite(mountain.lat) && Number.isFinite(mountain.lon)
        ? <PlaceMap lat={mountain.lat} lon={mountain.lon} label={t('detail.mapOf', { name: mountain.name })} name={mountain.name} relief zoom={12} />
        : null}
      signature={(
        <MountainSignature
          mountain={mountain}
          season={hasMonths ? (
            <MonthStrip
              good={monthsGood}
              avoid={monthsAvoid}
              info={<p>{bestMonthsLine(mountain, t)}</p>}
            />
          ) : null}
        />
      )}
      rows={rows}
      gettingThere={(mountain.near?.city || mountain.lift || mountain.acc?.length) ? (
        <>
          {mountain.near?.city && (
            <ul className="igo-list">
              <li className="igo-row">
                <ItemIcon name="bed" />
                <span className="igo-main">
                  <span>{mountain.near.city}</span>
                  <span className="igo-sub">{t('mtn.basedKm', { km: Math.round(mountain.near.km) })}</span>
                </span>
              </li>
              {hasTransit && (
                <li className="igo-row">
                  <ItemIcon name="bus" />
                  <span className="igo-main"><span>{t('mtn.accTransit')}</span></span>
                </li>
              )}
            </ul>
          )}
          <WayUp mountain={mountain} t={t} />
        </>
      ) : null}
      exits={exits}
      nearby={(
        <NearbyOutdoors
          row={mountain}
          cc={mountain.cc}
          headings={{ trail: 'nb.mtn.trail', peak: 'nb.mtn.peak', lake: 'nb.mtn.lake' }}
          onOpen={onOpenNeighbour}
        />
      )}
      sources={sources}
      sourcesExtra={<ReportProblem item={{ layer: 'mountain', id: mountain.id, cc: mountain.cc, name: mountain.name }} />}
    />
  );
}
