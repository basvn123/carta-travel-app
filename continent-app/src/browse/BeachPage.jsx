import React, { useEffect, useMemo, useState } from 'react';
import { ReportProblem } from '../components/ReportProblem.jsx';
import { useI18n } from '../i18n/index.jsx';
import { FigureFooter } from './HonestFooters.jsx';
import { BEACH_KIND } from '../lib/footers.js';
import { NearbyOutdoors } from './NearbyOutdoors.jsx';
import { DetailPage, PlaceMap, PhotoTrack } from './DetailSkeleton.jsx';
import { usePlaceExits } from '../hooks/usePlaceExits.js';
import {
  stripCells, previewWords, previewNotHook, keyFactCells, pointCentre, ACCESS_LEVEL,
} from '../lib/detailSkeleton.js';
import { NotFor } from '../components/NotFor.jsx';
import { notForLines } from '../lib/notFor.js';
import {
  beachHeadline, beachWhy, beachTags, bestForLabel, componentLabel,
  COMPONENT_ORDER, beachRating, componentWeights,
} from '../lib/beachStory.js';
import { beachShareUrl, loadBeaches } from '../lib/beaches.js';
import { trailheadDirectionsUrl, shareTrailLink } from '../lib/trailExport.js';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import {
  MapPinIcon, LinkIcon, ChevronRightIcon,
  CameraIcon, BulbIcon, InfoIcon, StarIcon,
  SunIcon,
} from '../components/Icons.jsx';
import {
  beachFacing, beachWalkIn, facingSummary, walkInSummary,
} from '../lib/derivedModules.js';
import { BeachFacing, BeachWalkIn } from './DerivedModules.jsx';
import { srcSetFor, fallbackSrc } from '../lib/heroImage.js';
import { LayerPhoto, HERO_SIZES } from '../components/LayerPhoto.jsx';

// A frame of the photo track: most of the column on a phone (T396).
const TRACK_SIZES = '(min-width: 900px) 440px, 85vw';
import { BeachSignature, CompassRosette } from './Signature.jsx';
import { compassPoint } from '../lib/signature.js';

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
      {/* One flex item, not three: .bpage-credit is a flex row with a gap, so a
          bare ", " between the author and the licence would take the gap on
          both sides (T396-g). The lake and mountain pages do the same. */}
      <span className="lpage-credit-line">
        {by && (
          <a href={image.page} target="_blank" rel="noopener noreferrer">
            {by}
          </a>
        )}
        {by && lic ? ', ' : ''}
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
      </span>
    </p>
  );
}

export function BeachPage({ beach, countryName, onClose, onSelectDest, model, onOpenNeighbour, fav = false, onFav = null, onAddToDay = null }) {
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

  const images = beach?.images || [];
  const main = images[0] || null;
  const why = useMemo(() => (beach ? beachWhy(beach, t) : []), [beach, t]);
  const tags = useMemo(() => (beach ? beachTags(beach, t, 4) : []), [beach, t]);
  const rating = useMemo(() => (beach ? beachRating(beach, t) : null), [beach, t]);
  const headline = useMemo(
    () => (beach ? beachHeadline(beach, t, countryName) : ''),
    [beach, t, countryName],
  );

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
    // Proved from a polygon rather than inferred from a centroid, so this row
    // says "inside" and means it.
    beach.prot && {
      key: 'prot',
      label: t('beach.factProtected'),
      value: beach.prot.name,
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
  const cells = stripCells({
    level: beachLevel(beach),
    word: beach.access
      ? t(`beach.access${beach.access.charAt(0).toUpperCase()}${beach.access.slice(1)}`) : '',
    type: surfaceWord || t('detail.typeBeach'),
    number: beach.lengthM ? `${beach.lengthM.toLocaleString(lang)} m` : '',
  }, t);

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
    { key: 'water', label: t('beach.factWater'), value: beach.water ? t(`beach.water${beach.water.class}`) : '', note: beach.water?.site || null },
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
        </>
      ),
    },
    facts.length > 0 && {
      key: 'facts',
      icon: InfoIcon,
      label: t('beach.factsHead'),
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
    images.length > 1 && {
      key: 'photos',
      icon: CameraIcon,
      label: t('beach.photos'),
      summary: t('detail.photoCount', { n: images.length }),
      body: (
        /* One photo track since T396 (carta-design "Photo track"): every
           photograph at a readable size with its credit under it, Previous
           and Next, no tab roles. The header keeps the first photograph. */
        <PhotoTrack
          testId="beach-photos"
          label={t('beach.photos')}
          frames={images.map((img, i) => ({
            key: img.page || img.u || i,
            media: <LayerPhoto layer="beaches" image={img} src={img.u} sizes={TRACK_SIZES} alt="" loading="lazy" />,
            credit: <ImageCredit image={img} t={t} />,
          }))}
        />
      ),
    },
  ].filter(Boolean);

  return (
    <DetailPage
      name={beach.name}
      className="bpage"
      backLabel={t('beach.back')}
      onClose={onClose}
      fav={fav}
      onFav={onFav}
      onShare={onShare}
      resetKey={beach.id}
      toast={toast}
      hero={{
        sharedKey: beach.id,
        cells,
        media: main ? (
          <LayerPhoto
            layer="beaches"
            image={main}
            hero
            className="dsk-hero-img bpage-shot"
            src={fallbackSrc(main.big || main.u, 960)}
            srcSet={srcSetFor(main.big || main.u, 1920)}
            sizes="100vw"
            alt={beach.name}
            width={16}
            height={10}
            loading="eager"
            decoding="async"
          />
        ) : null,
        credit: main ? <ImageCredit image={main} t={t} /> : null,
      }}
      head={(
        <>
          <h1 className="bpage-name">
            <CountryFlag country={beach.cc} size={15} className="bpage-flag" />
            {beach.name}
          </h1>
          {beach.nameLocal && <p className="bpage-local">{beach.nameLocal}</p>}
          <p className="dsk-crumb">{[beach.region, countryName].filter(Boolean).join(', ')}</p>
          <div className="bpage-scorerow">
            <ScoreChip rating={rating} size="lg" />
            <span className="bpage-band">{t(`beach.band${rating.tier}`)}</span>
          </div>
        </>
      )}
      hook={headline}
      keyFacts={keyFacts}
      notFor={(
        <NotFor lines={notForLines('beach', beach, { word: surfaceWord })} />
      )}
      primary={beach.base ? (
        <button type="button" className="bpage-base dsk-primary" onClick={() => onSelectDest?.(beach.base.id)}>
          <span>
            {t('beach.basedOn', { city: beach.base.city })}
            <small>{t('beach.basedKm', { km: Math.round(beach.base.km) })}</small>
          </span>
          <ChevronRightIcon size={15} />
        </button>
      ) : null}
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
      gettingThere={(
        <>
          {beach.base && (
            <p className="dsk-get-town">{t('detail.townKm', { km: Math.round(beach.base.km), place: beach.base.city })}</p>
          )}
          <a className="bpage-where" href={mapsUrl} target="_blank" rel="noopener noreferrer">
            <MapPinIcon size={15} />
            <span className="bpage-where-text">{t('detail.directions')}</span>
            <span className="bpage-where-coord">
              {fmtCoord(beach.lat)}, {fmtCoord(beach.lon)}
            </span>
            <ChevronRightIcon size={14} />
          </a>
          <p className="dsk-note dsk-get-stop">{t('detail.noStopData')}</p>
        </>
      )}
      takeAway={onAddToDay ? (
        <button type="button" className="tpage-act feat-dayplan" onClick={() => onAddToDay({ id: beach.id, cc: beach.cc, name: beach.name, lat: beach.lat, lon: beach.lon })}>
          <SunIcon size={15} />
          <span>{t('feat.addToDay')}</span>
        </button>
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
      sources={(
        <div className="bpage-sources">
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
          {/* What Carta does not measure for a beach, said once (T386): the
              signature no longer draws three empty month tracks. */}
          <p className="bpage-note dsk-unmeasured">{t('detail.beachUnmeasured')}</p>
          <FigureFooter kinds={facts.map((f) => BEACH_KIND[f.key])} />
          <ReportProblem item={{ layer: 'beach', id: beach.id, cc: beach.cc, name: beach.name }} />
        </div>
      )}
    />
  );
}
