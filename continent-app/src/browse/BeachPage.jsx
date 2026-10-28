import React, { useEffect, useMemo, useState } from 'react';
import '../styles/items.css';
import { displayName } from '../lib/format.js';
import { ReportProblem } from '../components/ReportProblem.jsx';
import { useI18n } from '../i18n/index.jsx';
import { NearbyOutdoors } from './NearbyOutdoors.jsx';
import { DetailPage, PlaceMap } from './DetailSkeleton.jsx';
import { PhotoGallery } from './PhotoGallery.jsx';
import { ItemHead, ItemIcon, NatureHeadLines } from './ItemParts.jsx';
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
  beachHeadline, beachWhy, beachTags, bestForLabel, componentLabel,
  COMPONENT_ORDER, beachRating, componentWeights, beachHighlights,
} from '../lib/beachStory.js';
import { beachShareUrl, loadBeaches } from '../lib/beaches.js';
import { trailheadDirectionsUrl, shareTrailLink } from '../lib/trailExport.js';
import {
  MapPinIcon, ChevronRightIcon,
  BulbIcon, InfoIcon, StarIcon,
  SunIcon,
} from '../components/Icons.jsx';
import {
  beachFacing, beachWalkIn, facingSummary, walkInSummary,
} from '../lib/derivedModules.js';
import { BeachFacing, BeachWalkIn } from './DerivedModules.jsx';
import { BaseClimate, BeachFacilities } from './WaterSheet.jsx';
import { notYet } from '../components/NotYet.jsx';

import { BeachSignature, CompassRosette } from './Signature.jsx';
import { compassPoint } from '../lib/signature.js';
import { useDayView } from '../hooks/useDayView.js';

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
 * Since T180 the page draws through the shared detail skeleton
 * (DetailSkeleton.jsx): hero and strip, hook, who it is not for, the map,
 * collapsed rows, getting there, taking it with you, three ways out and the
 * sources. The map is a lazy chunk (PointMap.jsx), so it costs nothing until
 * a beach is open. The signature slot holds the beach's three month rows
 * (Signature.jsx, T181), and the map carries a compass rosette for the way
 * the shore faces.
 */

/** The way down as a level: only the access field says anything about it. */
const beachLevel = (b) => ACCESS_LEVEL[b?.access] || 0;

export function BeachPage({ beach, countryName, onClose, onSelectDest, model, onOpenNeighbour, fav = false, onFav = null, onAddToDay = null, backLabel = '' }) {
  const { t, lang } = useI18n();
  // The score breakdown has one door since T386: the "How the score is
  // built" row, which carries each part's weight beside its bar. The chip in
  // the head is a measure, not a button.
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  // Three ways out, from the same country's beaches (T180).
  const exits = usePlaceExits({
    me: beach,
    cc: beach?.cc,
    load: loadBeaches,
    centre: pointCentre,
    level: beachLevel,
    baseOf: (r) => r?.base?.id || null,
    open: (row) => onOpenNeighbour?.('beach', row),
  });

  const images = useMemo(() => beach?.images || [], [beach]);
  const why = useMemo(() => (beach ? beachWhy(beach, t) : []), [beach, t]);
  const tags = useMemo(() => (beach ? beachTags(beach, t, 4) : []), [beach, t]);
  const rating = useMemo(() => (beach ? beachRating(beach, t) : null), [beach, t]);
  const headline = useMemo(
    () => (beach ? beachHeadline(beach, t, countryName) : ''),
    [beach, t, countryName],
  );

  const highlights = useMemo(() => (beach ? beachHighlights(beach, t) : []), [beach, t]);
  const photos = useMemo(() => toPhotos(images, { fallbackCaption: beach?.name || '' }), [images, beach?.name]);
  const baseDay = useBaseDay(beach?.base?.id || null);
  const view = useDayView();   // T694: per person or the group's total
  const { onPdf, pdfBusy } = useItemPdf('beach', beach, { countryName });

  if (!beach) return null;

  // A component the pipeline could not measure is absent from `comp` rather
  // than zero, so the breakdown renders what was actually read and a beach in
  // a country with no bathing water register simply has no water bar.
  const weights = componentWeights(model);
  const parts = COMPONENT_ORDER
    .filter((key) => beach.comp?.[key] != null)
    .map((key) => ({
      key,
      label: componentLabel(key, t),
      pct: Math.round(beach.comp[key] * 100),
      weight: weights?.[key] != null ? Math.round(weights[key] * 100) : null,
    }));

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
      note: displayName(beach.water.site) || '',
    },
    // T631: the surface keeps its slot; the 42% of beaches with none mapped
    // show the shared placeholder.
    {
      key: 'surface',
      label: t('beach.factSurface'),
      value: beach.surface
        ? t(`beach.surfaceWord${beach.surface.charAt(0).toUpperCase()}${beach.surface.slice(1)}`)
        : notYet(t),
      empty: !beach.surface,
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
    // Proved from a polygon rather than inferred from a centroid, so this row
    // says "inside" and means it.
    beach.prot && {
      key: 'prot',
      label: t('beach.factProtected'),
      value: displayName(beach.prot.name),
      note: t(beach.prot.net === 'natura2000'
        ? 'beach.fProtectedNatura2000' : 'beach.fProtectedEmerald'),
    },
    beach.size && {
      key: 'size',
      label: t('beach.facetSize'),
      value: t(`beach.fSize${beach.size.charAt(0).toUpperCase()}${beach.size.slice(1)}`),
    },
    beach.sunset && {
      key: 'sunset', label: t('beach.facetBestfor'),
      value: t('beach.fBestforSunset'),
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

  const surfaceWord = beach.surface
    ? t(`beach.surfaceWord${beach.surface.charAt(0).toUpperCase()}${beach.surface.slice(1)}`) : '';
  // The derived modules (T182): which way the sand faces and how you get
  // down to it, computed from fields the wire already carries. Both always
  // render inside About this beach; where the data cannot answer, the block
  // says so.
  const facing = beachFacing(beach);
  const walkIn = beachWalkIn(beach);
  const point = compassPoint(beach.aspect);

  // The key facts band (T386): what a family decides on. The EU bathing
  // water class with its sampling site, the way in where it is mapped, a
  // lifeguard where one is mapped (never a "no": an unmapped lifeguard is not
  // an absent one), the ground underfoot, the length and which way it faces.
  const capWord = (s) => (s ? s.charAt(0).toLocaleUpperCase(lang) + s.slice(1) : '');
  const keyFacts = keyFactCells([
    { key: 'water', label: t('beach.factWater'), value: beach.water ? t(`beach.water${beach.water.class}`) : '', note: displayName(beach.water?.site) || null },
    beach.access && { key: 'access', label: t('beach.factAccess'), value: t(`beach.access${beach.access.charAt(0).toUpperCase()}${beach.access.slice(1)}`) },
    beach.lifeguard && { key: 'lifeguard', label: t('beach.factLifeguard'), value: t('beach.yes') },
    { key: 'surface', label: t('beach.factSurface'), value: surfaceWord },
    { key: 'length', label: t('beach.factLength'), value: beach.lengthM ? `${beach.lengthM.toLocaleString(lang)} m` : '', mono: true },
    point && { key: 'faces', label: t('derived.facingHead'), value: capWord(t(`sig.dir${point}`)), note: `${Math.round(beach.aspect)}°` },
  ], t);

  // The rows (T386): at most five. About this beach holds the argument and
  // the two derived blocks; then every measurement, the score with its
  // weights (the one door to the breakdown), and the photographs.
  const aboutTexts = [...why, facingSummary(facing, t), walkInSummary(walkIn, t)];
  const rows = [
    {
      key: 'about',
      icon: BulbIcon,
      label: t('detail.aboutBeach'),
      summary: previewNotHook(aboutTexts, headline),
      body: (
        <>
          {(why.length > 0 || beach.bestFor?.length > 0 || tags.length > 0) && (
            <div className="bpage-why">
              <h3 className="dsk-sub">{t('beach.whyHead')}</h3>
              {why.length > 0 && <p className="bpage-prose">{why.join(' ')}</p>}
              {beach.bestFor?.length > 0 && (
                <p className="bpage-for">
                  <b>{t('beach.bestFor')}</b>
                  {' '}
                  {beach.bestFor.map((code) => bestForLabel(code, t)).join(', ')}
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
            <h3 className="dsk-sub">{t('derived.facingHead')}</h3>
            <BeachFacing facing={facing} t={t} />
          </div>
          <div className="dsk-part">
            <h3 className="dsk-sub">{t('derived.walkinHead')}</h3>
            <BeachWalkIn walkIn={walkIn} t={t} />
          </div>
          <BaseClimate
            base={beach.base}
            kind="beach"
            water={beach.sst ? { temps: beach.sst, est: true } : null}
          />
        </>
      ),
    },
    {
      key: 'facts',
      icon: InfoIcon,
      label: t('beach.factsHead'),
      summary: previewWords(facts.filter((f) => !f.empty).slice(0, 3).map((f) => f.value).join(', ')),
      body: (
        <div className="bpage-facts">
          <dl>
            {facts.map((fact) => (
              <div key={fact.key} className={`bpage-fact${fact.empty ? ' bpage-fact-empty' : ''}`}>
                <dt>{fact.label}</dt>
                <dd className={fact.mono ? 'mono' : ''}>
                  {fact.value}
                  {fact.note && <small>{fact.note}</small>}
                </dd>
              </div>
            ))}
          </dl>
          <BeachFacilities beach={beach} />
        </div>
      ),
    },
    parts.length > 0 && {
      key: 'score',
      icon: StarIcon,
      label: t('beach.scoreHead'),
      summary: previewWords(t('beach.scoreNote')),
      body: (
        <div className="bpage-score">
          <p className="bpage-note">{t('beach.scoreNote')}</p>
          <ul className="bpage-bars">
            {parts.map((part) => (
              <li key={part.key}>
                <span className="bpage-bar-label">{part.label}</span>
                <span className="bpage-bar-track" aria-hidden="true">
                  <span className="bpage-bar-fill" style={{ width: `${part.pct}%` }} />
                </span>
                <span className="bpage-bar-n">{part.pct}</span>
                {part.weight != null && (
                  <small className="bpage-part-w">
                    {t('beach.scoreWeight', { pct: part.weight })}
                  </small>
                )}
              </li>
            ))}
          </ul>
        </div>
      ),
    },
  ].filter(Boolean);

  const before = beforeGoItems({ lines: notForLines('beach', beach, { word: surfaceWord }) });
  const sources = [
    beach.osm && { label: 'OpenStreetMap', href: `https://www.openstreetmap.org/${beach.osm}` },
    beach.wiki && { label: 'Wikipedia', href: beach.wiki },
    beach.wd && { label: 'Wikidata', href: `https://www.wikidata.org/wiki/${beach.wd}` },
    ...(beach.credit || []).map((c) => ({ label: c })),
  ].filter(Boolean);

  return (
    <DetailPage
      name={beach.name}
      className="bpage"
      backLabel={backLabel || t('beach.back')}
      onClose={onClose}
      fav={fav}
      onFav={onFav}
      onShare={onShare}
      resetKey={beach.id}
      toast={toast}
      gallery={(
        <PhotoGallery photos={photos} label={beach.name} claimKey={beach.id}
          fallback={{ city: beach.name, iso2: beach.cc }} />
      )}
      head={(
        <ItemHead
          title={beach.name}
          iso2={beach.cc}
          sub={beach.nameLocal || ''}
          where={[beach.region, countryName].filter(Boolean).join(', ')}
          rating={rating}
          after={<NatureHeadLines rating={rating} place={countryName} />}
        />
      )}
      hook={highlights[0]?.line || headline}
      keyFacts={keyFacts}
      whyGo={highlights.slice(1).filter((h) => h.title)}
      before={before}
      primary={beach.base ? (
        <Button variant="primary" iconEnd={<ChevronRightIcon size={20} />} onClick={() => onSelectDest?.(beach.base.id)}>
          {(baseDay && view.stayIn(beach.base.city, baseDay.dayEur)) || t('beach.basedOn', { city: beach.base.city })}
        </Button>
      ) : null}
      actions={[
        <a key="dir" className="btn btn-secondary" href={mapsUrl} target="_blank" rel="noopener noreferrer">
          <span className="btn-icon" aria-hidden="true"><MapPinIcon size={20} /></span>
          <span className="btn-label">{t('detail.directions')}</span>
        </a>,
        onAddToDay && (
          <Button key="day" variant="secondary" iconStart={<SunIcon size={20} />}
            onClick={() => onAddToDay({ id: beach.id, cc: beach.cc, name: beach.name, lat: beach.lat, lon: beach.lon })}>
            {t('feat.addToDay')}
          </Button>
        ),
      ]}
      onPdf={onPdf}
      pdf={{ photos, where: [beach.region, countryName].filter(Boolean).join(', '), url: beachShareUrl(beach) }}
      pdfBusy={pdfBusy}
      map={Number.isFinite(beach.lat) && Number.isFinite(beach.lon) ? (
        <div className="sig-mapwrap">
          <PlaceMap lat={beach.lat} lon={beach.lon} label={t('detail.mapOf', { name: beach.name })} name={beach.name} />
          {point && (
            <CompassRosette
              deg={beach.aspect}
              label={t('sig.rosette', { dir: t(`sig.dir${point}`), deg: Math.round(beach.aspect) })}
            />
          )}
        </div>
      ) : null}
      signature={<BeachSignature beach={beach} />}
      rows={rows}
      gettingThere={beach.base ? (
        <ul className="igo-list">
          <li className="igo-row">
            <ItemIcon name="bed" />
            <span className="igo-main">
              <span>{beach.base.city}</span>
              <span className="igo-sub">{t('beach.basedKm', { km: Math.round(beach.base.km) })}</span>
            </span>
          </li>
        </ul>
      ) : null}
      exits={exits}
      nearby={(
        <NearbyOutdoors
          row={beach}
          cc={beach.cc}
          headings={{ trail: 'nb.beach.trail', beach: 'nb.beach.beach', cycle: 'nb.beach.cycle' }}
          onOpen={onOpenNeighbour}
        />
      )}
      sources={sources}
      sourcesExtra={<ReportProblem item={{ layer: 'beach', id: beach.id, cc: beach.cc, name: beach.name }} />}
    />
  );
}
