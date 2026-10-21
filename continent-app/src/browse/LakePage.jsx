import React, { useEffect, useMemo, useState } from 'react';
import '../styles/items.css';
import { displayName } from '../lib/format.js';
import { ReportProblem } from '../components/ReportProblem.jsx';
import { useI18n } from '../i18n/index.jsx';
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
  previewWords, previewNotHook, keyFactCells, pointCentre, ACCESS_LEVEL,
} from '../lib/detailSkeleton.js';
import { notForLines } from '../lib/notFor.js';
import {
  lakeHeadline, lakeWhy, lakeTags, lakeSwim, lakeSeason, lakeHazards,
  bestForLabel, componentLabel, serviceLabel, accessLabel,
  COMPONENT_ORDER, SUB_ORDER, lakeRating, isHiddenGem, lakeHighlights,
} from '../lib/lakeStory.js';
import { lakeShareUrl, loadLakes } from '../lib/lakes.js';
import { trailheadDirectionsUrl, shareTrailLink } from '../lib/trailExport.js';
import {
  MapPinIcon, ChevronRightIcon,
  BootIcon, BulbIcon, InfoIcon, StarIcon,
  SunIcon,
} from '../components/Icons.jsx';
import { lakeShore, shoreSummary } from '../lib/derivedModules.js';
import { LakeShore } from './DerivedModules.jsx';

import { LakeSignature } from './Signature.jsx';

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
 * Since T180 the page draws through the shared detail skeleton
 * (DetailSkeleton.jsx). The swim verdict and the hazards sit in its alert
 * slot, the one place that never folds, for the reason above. The map is a
 * lazy chunk (PointMap.jsx). The signature slot holds the lake's own figure
 * (Signature.jsx, T181): the water temperature by month as twelve bars, and
 * the depth-versus-area wedge.
 *
 * The month strip is an ESTIMATE and says so in its own subtitle. There is no
 * free per lake water temperature series for Europe, so the pipeline models it
 * from CHELSA air normals with a documented correction. Presenting that as
 * a measurement would be the dishonest half of a useful feature.
 */

const MONTH_CODES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug',
  'sep', 'oct', 'nov', 'dec'];

/** The way in as a level: only the access field says anything about it. */
const lakeLevel = (l) => ACCESS_LEVEL[l?.access] || 0;

export function LakePage({ lake, countryName, onClose, onSelectDest, warmC = 18, onOpenNeighbour, fav = false, onFav = null, onAddToDay = null, backLabel = '' }) {
  const { t, lang } = useI18n();
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  // Three ways out, from the same country's lakes (T180).
  const exits = usePlaceExits({
    me: lake,
    cc: lake?.cc,
    load: loadLakes,
    centre: pointCentre,
    level: lakeLevel,
    baseOf: (r) => r?.base?.id || null,
    open: (row) => onOpenNeighbour?.('lake', row),
  });

  const images = useMemo(() => lake?.images || [], [lake]);
  const why = useMemo(() => (lake ? lakeWhy(lake, t) : []), [lake, t]);
  const tags = useMemo(() => (lake ? lakeTags(lake, t, 4) : []), [lake, t]);
  const rating = useMemo(() => (lake ? lakeRating(lake, t) : null), [lake, t]);
  const swim = useMemo(() => (lake ? lakeSwim(lake, t) : null), [lake, t]);
  const hazards = useMemo(() => (lake ? lakeHazards(lake, t) : []), [lake, t]);
  const headline = useMemo(
    () => (lake ? lakeHeadline(lake, t, countryName) : ''),
    [lake, t, countryName],
  );

  const highlights = useMemo(() => (lake ? lakeHighlights(lake, t) : []), [lake, t]);
  const photos = useMemo(() => toPhotos(images, { fallbackCaption: lake?.name || '' }), [images, lake?.name]);
  const baseDay = useBaseDay(lake?.base?.id || null);
  const { onPdf, pdfBusy } = useItemPdf('lake', lake, { countryName });

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
      value: `${size.areaKm2.toLocaleString(lang)} km²`,
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
        : (displayName(lake.water.site) || ''),
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

  const subs = SUB_ORDER.filter((key) => lake.sub?.[key] != null);

  // The derived module (T182): how much path runs along the water, from the
  // shore sweep's figure on the wire. Always rendered inside About this lake;
  // an unswept shore says so.
  const shore = lakeShore(lake);

  // The key facts band (T386). The swim verdict leads it in its own words,
  // never folded and never a cell among others (see the file header); the
  // cells carry the size, the warmest month's modelled water and the EU
  // bathing class. The peak temperature is a model, so it says "est.".
  const peakC = lake.swim?.season?.peak;
  const keyFacts = keyFactCells([
    { key: 'area', label: t('lake.factArea'), value: size.areaKm2 ? `${size.areaKm2.toLocaleString(lang)} km²` : '', mono: true },
    { key: 'depth', label: t('lake.factDepth'), value: size.depthM ? `${size.depthM.toLocaleString(lang)} m` : '', mono: true },
    Number.isFinite(peakC) && { key: 'peak', label: t('detail.factWaterPeak'), value: `~${Math.round(peakC)} °C`, mono: true, note: t('prov.est') },
    lake.water && { key: 'water', label: t('lake.factWater'), value: t(`lake.water${lake.water.class}`) },
    size.elevM != null && { key: 'elev', label: t('lake.factElevation'), value: `${size.elevM.toLocaleString(lang)} m`, mono: true, fallback: true },
  ], t);

  // The rows (T386): at most five. About this lake holds the argument, the
  // shore and the walks; then every measurement, the score and the photographs.
  const aboutTexts = [...why, shoreSummary(shore, t, lang)];
  const rows = [
    {
      key: 'about',
      icon: BulbIcon,
      label: t('detail.aboutLake'),
      summary: previewNotHook(aboutTexts, headline),
      body: (
        <>
          {(why.length > 0 || subs.length > 0 || lake.bestFor?.length > 0 || tags.length > 0) && (
            <div className="bpage-why">
              <h3 className="dsk-sub">{t('lake.whyHead')}</h3>
              {/* The three sub scores, side by side, because choosing between a
                  cold beautiful lake and a warm ordinary one is the actual
                  decision and one blended number hides it. */}
              {subs.length > 0 && (
                <ul className="lpage-subs">
                  {subs.map((key) => (
                    <li key={key}>
                      <span className="lpage-sub-n">{Math.round(lake.sub[key] * 10)}</span>
                      <span className="lpage-sub-label">{componentLabel(key, t)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {why.length > 0 && <p className="bpage-prose">{why.join(' ')}</p>}
              {lake.bestFor?.length > 0 && (
                <p className="bpage-for">
                  <b>{t('lake.bestFor')}</b>
                  {' '}
                  {lake.bestFor.map((code) => bestForLabel(code, t)).join(', ')}
                </p>
              )}
              {tags.length > 0 && (
                <ul className="bpage-tags">
                  {tags.map((tag) => <li key={tag.code}>{tag.label}</li>)}
                </ul>
              )}
            </div>
          )}
          <div className="dsk-part">
            <h3 className="dsk-sub">{t('derived.shoreHead')}</h3>
            <LakeShore shore={shore} t={t} lang={lang} />
          </div>
          {lake.walks?.length > 0 && (
            <div className="lpage-walks">
              <h3 className="dsk-sub">{t('lake.walksHead')}</h3>
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
            </div>
          )}
        </>
      ),
    },
    facts.length > 0 && {
      key: 'facts',
      icon: InfoIcon,
      label: t('lake.factsHead'),
      summary: previewWords(facts.slice(0, 3).map((f) => f.value).join(', ')),
      body: (
        <div className="bpage-facts">
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
        </div>
      ),
    },
    COMPONENT_ORDER.some((key) => lake.comp?.[key] != null) && {
      key: 'score',
      icon: StarIcon,
      label: t('lake.scoreHead'),
      summary: previewWords(t('lake.scoreNote')),
      body: (
        <div className="bpage-score">
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
        </div>
      ),
    },
  ].filter(Boolean);

  const before = beforeGoItems({
    hazards: (lake.hazards || []),
    lines: notForLines('lake', lake, { shownHazards: hazards.map((h) => h.code) }),
  });
  const sources = [
    lake.osm && { label: 'OpenStreetMap', href: `https://www.openstreetmap.org/${lake.osm}` },
    lake.wiki && { label: 'Wikipedia', href: lake.wiki },
    lake.wd && { label: 'Wikidata', href: `https://www.wikidata.org/wiki/${lake.wd}` },
    ...(lake.credit || []).map((c) => ({ label: c })),
  ].filter(Boolean);

  return (
    <DetailPage
      name={lake.name}
      className="bpage lpage"
      backLabel={backLabel || t('lake.back')}
      onClose={onClose}
      fav={fav}
      onFav={onFav}
      onShare={onShare}
      resetKey={lake.id}
      toast={toast}
      gallery={(
        <PhotoGallery photos={photos} label={lake.name} claimKey={lake.id}
          fallback={{ city: lake.name, iso2: lake.cc }} />
      )}
      head={(
        <ItemHead
          title={lake.name}
          iso2={lake.cc}
          sub={lake.nameLocal || ''}
          where={[lake.region, countryName].filter(Boolean).join(', ')}
          rating={rating}
          gem={isHiddenGem(lake)}
        />
      )}
      hook={highlights[0]?.line || headline}
      keyFactsLead={(
        /* The verdict never folds. See the file header. */
        <p className={`lpage-swim lpage-swim-${swim.tone}`} role="note">
          <span className="lpage-swim-word">{swim.label}</span>
          {seasonLine && <span className="lpage-swim-season">{seasonLine}</span>}
        </p>
      )}
      keyFacts={keyFacts}
      whyGo={highlights.slice(1).filter((h) => h.title)}
      before={before}
      primary={lake.base ? (
        <Button variant="primary" iconEnd={<ChevronRightIcon size={20} />} onClick={() => onSelectDest?.(lake.base.id)}>
          {t('lake.basedOn', { city: lake.base.city })}
        </Button>
      ) : null}
      costLine={baseDay && lake.base ? (
        <>
          {t('item.dayIn', { city: lake.base.city })}{' '}
          <strong><Money value={baseDay.dayEur} est={baseDay.est} /></strong>{' '}
          {t('dest.priceDayUnit')}
        </>
      ) : null}
      actions={[
        <a key="dir" className="btn btn-secondary" href={mapsUrl} target="_blank" rel="noopener noreferrer">
          <span className="btn-icon" aria-hidden="true"><MapPinIcon size={20} /></span>
          <span className="btn-label">{t('detail.directions')}</span>
        </a>,
        onAddToDay && (
          <Button key="day" variant="secondary" iconStart={<SunIcon size={20} />}
            onClick={() => onAddToDay({ id: lake.id, cc: lake.cc, name: lake.name, lat: lake.lat, lon: lake.lon })}>
            {t('feat.addToDay')}
          </Button>
        ),
      ]}
      onPdf={onPdf}
      pdf={{ photos, where: [lake.region, countryName].filter(Boolean).join(', '), url: lakeShareUrl(lake) }}
      pdfBusy={pdfBusy}
      map={Number.isFinite(lake.lat) && Number.isFinite(lake.lon)
        ? <PlaceMap lat={lake.lat} lon={lake.lon} label={t('detail.mapOf', { name: lake.name })} name={lake.name} />
        : null}
      signature={<LakeSignature lake={lake} warmC={warmC} />}
      rows={rows}
      gettingThere={lake.base ? (
        <ul className="igo-list">
          <li className="igo-row">
            <ItemIcon name="bed" />
            <span className="igo-main">
              <span>{lake.base.city}</span>
              <span className="igo-sub">{t('lake.basedKm', { km: Math.round(lake.base.km) })}</span>
            </span>
          </li>
        </ul>
      ) : null}
      exits={exits}
      nearby={(
        <NearbyOutdoors
          row={lake}
          cc={lake.cc}
          headings={{ trail: 'nb.lake.trail', peak: 'nb.lake.peak' }}
          onOpen={onOpenNeighbour}
        />
      )}
      sources={sources}
      sourcesExtra={<ReportProblem item={{ layer: 'lake', id: lake.id, cc: lake.cc, name: lake.name }} />}
    />
  );
}
