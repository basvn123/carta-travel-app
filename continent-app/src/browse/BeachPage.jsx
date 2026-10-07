import React, { useEffect, useMemo, useState } from 'react';
import { ReportProblem } from '../components/ReportProblem.jsx';
import { useI18n } from '../i18n/index.jsx';
import { FigureFooter } from './HonestFooters.jsx';
import { BEACH_KIND } from '../lib/footers.js';
import { NearbyOutdoors } from './NearbyOutdoors.jsx';
import { DetailPage, PlaceMap } from './DetailSkeleton.jsx';
import { usePlaceExits } from '../hooks/usePlaceExits.js';
import {
  stripCells, previewWords, pointCentre, ACCESS_LEVEL,
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
  SunIcon, CompassIcon, BootIcon,
} from '../components/Icons.jsx';
import {
  beachFacing, beachWalkIn, facingSummary, walkInSummary,
} from '../lib/derivedModules.js';
import { BeachFacing, BeachWalkIn } from './DerivedModules.jsx';
import { srcSetFor, fallbackSrc } from '../lib/heroImage.js';
import { LayerPhoto, HERO_SIZES, THUMB_SIZES } from '../components/LayerPhoto.jsx';
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

export function BeachPage({ beach, countryName, onClose, onSelectDest, model, onOpenNeighbour, fav = false, onFav = null, onAddToDay = null }) {
  const { t, lang } = useI18n();
  const [shot, setShot] = useState(0);
  // The score badge opens the breakdown. Closed by default: most readers
  // want the number, and the ones who want to argue with it are exactly the
  // ones who will tap it. The bars stay on the page below either way; what
  // this adds is the weight beside each one, which is what turns "6.7" from
  // a verdict into an argument.
  const [showParts, setShowParts] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => { setShot(0); }, [beach?.id]);

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
  const main = images[shot] || images[0] || null;
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
  // render; where the data cannot answer, the row says so.
  const facing = beachFacing(beach);
  const walkIn = beachWalkIn(beach);

  // Slot 6: the collapsed rows. Each is one block that used to sit open on
  // the page; the summary is what a closed row says without a tap.
  const rows = [
    (why.length > 0 || beach.bestFor?.length > 0 || tags.length > 0) && {
      key: 'why',
      icon: BulbIcon,
      label: t('beach.whyHead'),
      summary: previewWords(why[0] || headline),
      body: (
        <div className="bpage-why">
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
      ),
    },
    {
      key: 'facing',
      icon: CompassIcon,
      label: t('derived.facingHead'),
      summary: previewWords(facingSummary(facing, t)),
      body: <BeachFacing facing={facing} t={t} />,
    },
    {
      key: 'walkin',
      icon: BootIcon,
      label: t('derived.walkinHead'),
      summary: previewWords(walkInSummary(walkIn, t)),
      body: <BeachWalkIn walkIn={walkIn} t={t} />,
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
              <LayerPhoto layer="beaches" image={img} src={img.u} sizes={THUMB_SIZES} alt="" loading="lazy" />
            </button>
          ))}
        </div>
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
          {onAddToDay && (
            <button type="button" className="feat-dayplan" onClick={() => onAddToDay({ id: beach.id, cc: beach.cc, name: beach.name, lat: beach.lat, lon: beach.lon })}>
              <SunIcon size={14} />
              <span>{t('feat.addToDay')}</span>
            </button>
          )}
          <div className="bpage-scorerow">
            {/* The badge is the door to the breakdown. The weights are
                already in the wire's model block and the components are
                already on the row, so surfacing them costs nothing and is
                the strongest trust move available: a 6.7 nobody can take
                apart is just an opinion with a decimal point. */}
            <button
              type="button"
              className="bpage-scorebtn"
              aria-expanded={showParts}
              aria-controls="bpage-parts"
              onClick={() => setShowParts((v) => !v)}
              title={t(showParts ? 'beach.scoreHide' : 'beach.scoreTap')}
            >
              <ScoreChip rating={rating} size="lg" />
            </button>
            <span className="bpage-band">{t(`beach.band${rating.tier}`)}</span>
            <button
              type="button"
              className="bpage-scorehint"
              onClick={() => setShowParts((v) => !v)}
            >
              {t(showParts ? 'beach.scoreHide' : 'beach.scoreTap')}
            </button>
          </div>
          {showParts && (
            <ul className="bpage-parts" id="bpage-parts">
              {parts.map((part) => (
                <li key={part.key}>
                  <span className="bpage-part-label">{part.label}</span>
                  <span className="bpage-part-track" aria-hidden="true">
                    <span
                      className="bpage-part-fill"
                      style={{ width: `${part.pct}%` }}
                    />
                  </span>
                  <span className="bpage-part-n">{part.pct}</span>
                  {part.weight != null && (
                    <small className="bpage-part-w">
                      {t('beach.scoreWeight', { pct: part.weight })}
                    </small>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      hook={headline}
      notFor={(
        <NotFor lines={notForLines('beach', beach, { word: surfaceWord })} />
      )}
      map={(
        <div className="sig-mapwrap">
          <PlaceMap lat={beach.lat} lon={beach.lon} label={t('detail.mapOf', { name: beach.name })} />
          {compassPoint(beach.aspect) && (
            <CompassRosette
              deg={beach.aspect}
              label={t('sig.rosette', { dir: t(`sig.dir${compassPoint(beach.aspect)}`), deg: Math.round(beach.aspect) })}
            />
          )}
        </div>
      )}
      signature={<BeachSignature beach={beach} />}
      rows={rows}
      gettingThere={(
        <>
          <a className="bpage-where" href={mapsUrl} target="_blank" rel="noopener noreferrer">
            <MapPinIcon size={15} />
            <span className="bpage-where-text">{t('detail.directions')}</span>
            <span className="bpage-where-coord">
              {fmtCoord(beach.lat)}, {fmtCoord(beach.lon)}
            </span>
            <ChevronRightIcon size={14} />
          </a>
          {beach.base && (
            <button type="button" className="bpage-base" onClick={() => onSelectDest?.(beach.base.id)}>
              <span>
                {t('beach.basedOn', { city: beach.base.city })}
                <small>{t('beach.basedKm', { km: Math.round(beach.base.km) })}</small>
              </span>
              <ChevronRightIcon size={15} />
            </button>
          )}
        </>
      )}
      takeAway={(
        <>
          <button type="button" className="tpage-act" onClick={onShare}>
            <LinkIcon size={15} />
            <span>{t('detail.sendLink')}</span>
          </button>
          <ReportProblem item={{ layer: 'beach', id: beach.id, cc: beach.cc, name: beach.name }} />
        </>
      )}
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
          <FigureFooter kinds={facts.map((f) => BEACH_KIND[f.key])} />
        </div>
      )}
    />
  );
}
